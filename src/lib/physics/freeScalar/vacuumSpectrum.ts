/**
 * Exact free-field vacuum spectrum sampler on a finite periodic lattice.
 *
 * Generates correlated Gaussian random fields whose two-point functions match
 * the free Klein-Gordon vacuum state: `<|phi_k|^2> = 1/(2*omega_k)` and
 * `<|pi_k|^2> = omega_k/2`, with phi and pi uncorrelated.
 *
 * The sampling enforces Hermitian symmetry in k-space so that the real-space
 * fields are strictly real after inverse FFT.
 *
 * Supports N-dimensional lattices (1-11D) via stride-based iteration.
 *
 * Scope: free (non-interacting) Gaussian theory only.
 * References: Tong QFT lectures, lattice field theory texts.
 *
 * @module
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { ifftNd } from '@/lib/math/fft'
import { computeStrides, linearToNDCoordsInto, ndToLinearIdx } from '@/lib/math/ndArray'
import { gaussianPair, mulberry32 } from '@/lib/math/rng'

/** Minimum mass used for zero-mode regularization when physical mass is zero. */
export const M_FLOOR = 0.01

/**
 * Computes the lattice dispersion relation omega_k for a given mode.
 *
 * Uses the exact lattice dispersion that matches the finite-difference Laplacian
 * in `freeScalarUpdatePi.wgsl.ts`:
 * `omega^2 = m_eff^2 + sum_i [2 * sin(pi * n_i / N_i) / a_i]^2`
 *
 * @param nIndices - Mode index in each dimension
 * @param gridSize - Number of grid points per dimension
 * @param spacing - Lattice spacing per dimension
 * @param mass - Physical mass parameter
 * @param latticeDim - Number of active spatial dimensions (1-11)
 * @returns omega_k (always positive)
 *
 * @example
 * ```ts
 * const omega = computeOmegaK([1, 0, 0], [16, 16, 16], [0.1, 0.1, 0.1], 1.0, 3)
 * ```
 */
export function computeOmegaK(
  nIndices: readonly number[],
  gridSize: readonly number[],
  spacing: readonly number[],
  mass: number,
  latticeDim: number
): number {
  const mEff = Math.max(mass, M_FLOOR)
  let omegaSq = mEff * mEff

  for (let d = 0; d < latticeDim; d++) {
    const N = gridSize[d]!
    const a = spacing[d]!
    if (N <= 1) continue
    // sin(pi * n / N) — the lattice momentum kernel
    const sinVal = Math.sin((Math.PI * nIndices[d]!) / N)
    const kLat = (2 * sinVal) / a
    omegaSq += kLat * kLat
  }

  return Math.sqrt(omegaSq)
}

/**
 * Variant of `computeOmegaK` that accepts an explicit (possibly negative)
 * squared mass term and applies a zero-mode floor `M_FLOOR²` on the final
 * `ω_k²`. Used by the Mukhanov-Sasaki adiabatic vacuum sampler to implement
 * `ω_k² = k_lat² + M²_eff(η)` without the unconditional `max(mass, M_FLOOR)`
 * regularisation that the Klein-Gordon `computeOmegaK` applies.
 *
 * The final clamp `max(ω², M_FLOOR²)` regularises the zero mode (`k_lat = 0`)
 * when `M²_eff ≤ 0`, which is undefined in the strict Bunch-Davies sense.
 * The safety check `kMin² + M²_eff > 0` must already be enforced by the
 * caller; otherwise non-zero modes would also be tachyonic.
 *
 * @param nIndices - Mode index in each dimension
 * @param gridSize - Number of grid points per dimension
 * @param spacing - Lattice spacing per dimension
 * @param massSq - Effective squared mass term to add to `k_lat²` (can be < 0)
 * @param latticeDim - Number of active spatial dimensions (1-11)
 * @returns ω_k (always positive)
 */
export function computeOmegaKFromMassSq(
  nIndices: readonly number[],
  gridSize: readonly number[],
  spacing: readonly number[],
  massSq: number,
  latticeDim: number
): number {
  let omegaSq = massSq

  for (let d = 0; d < latticeDim; d++) {
    const N = gridSize[d]!
    const a = spacing[d]!
    if (N <= 1) continue
    const sinVal = Math.sin((Math.PI * nIndices[d]!) / N)
    const kLat = (2 * sinVal) / a
    omegaSq += kLat * kLat
  }

  // Zero-mode floor — keeps ω_k > 0 for the k = 0 mode even when massSq ≤ 0.
  const floorSq = M_FLOOR * M_FLOOR
  if (omegaSq < floorSq) omegaSq = floorSq
  return Math.sqrt(omegaSq)
}

/**
 * Checks whether a given power-of-2 is valid.
 *
 * @param n - Value to check
 * @returns True if n is a power of 2 and >= 1
 */
function isPowerOf2(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0
}

/**
 * Validates exact-vacuum sampling configuration for active dimensions.
 *
 * @param gridSize - Lattice size per dimension
 * @param spacing - Lattice spacing per dimension
 * @param latticeDim - Number of active dimensions
 * @param mass - Physical mass parameter
 * @throws {Error} If any active-dimension parameter is invalid
 */
function validateVacuumConfig(
  gridSize: readonly number[],
  spacing: readonly number[],
  latticeDim: number,
  mass: number
): void {
  if (!Number.isInteger(latticeDim) || latticeDim < 1) {
    throw new Error(`latticeDim must be a positive integer, got ${latticeDim}`)
  }
  if (latticeDim > gridSize.length) {
    throw new Error(`gridSize must have at least ${latticeDim} entries, got ${gridSize.length}`)
  }
  if (latticeDim > spacing.length) {
    throw new Error(`spacing must have at least ${latticeDim} entries, got ${spacing.length}`)
  }
  if (!Number.isFinite(mass)) {
    throw new Error(`mass must be finite, got ${mass}`)
  }

  for (let d = 0; d < latticeDim; d++) {
    const n = gridSize[d]!
    if (!isPowerOf2(n)) {
      throw new Error(
        `Exact vacuum requires power-of-2 grid sizes, but dimension ${d} has size ${n}`
      )
    }
    const a = spacing[d]!
    if (!Number.isFinite(a) || a <= 0) {
      throw new Error(`spacing[${d}] must be a finite positive value, got ${a}`)
    }
  }
}

/**
 * Mass-term dispatch for the vacuum sampler and the auto-scale estimators.
 *
 * - `'kgFloor'` selects the ordinary Klein-Gordon path with the
 *   `max(mass, M_FLOOR)` regularization (used when cosmology is disabled).
 * - A finite `number` selects the Mukhanov-Sasaki path with `ω_k² = k_lat² + value`,
 *   using the supplied (possibly negative) effective mass squared directly.
 *
 * Callers must pick one — there is no implicit fallback. The previous
 * implementation accepted `omegaSqMassTerm?: number` and silently fell
 * through to the KG floor when omitted, which masked bugs at every call
 * site that forgot to thread the cosmology-aware mass through.
 */
export type VacuumDispersion = 'kgFloor' | number

/**
 * Resolve a dispersion choice into a concrete `omega_k` evaluator. Closes
 * over the lattice geometry once so the per-site loop can call into a
 * monomorphic function pointer.
 */
function resolveOmegaEvaluator(
  config: FreeScalarConfig,
  dispersion: VacuumDispersion
): (coords: readonly number[], dims: readonly number[]) => number {
  const { spacing, mass, latticeDim } = config
  if (dispersion === 'kgFloor') {
    return (coords, dims) => computeOmegaK(coords, dims, spacing, mass, latticeDim)
  }
  if (!Number.isFinite(dispersion)) {
    throw new RangeError(
      `vacuum sampler dispersion must be 'kgFloor' or a finite number, got ${dispersion}`
    )
  }
  return (coords, dims) => computeOmegaKFromMassSq(coords, dims, spacing, dispersion, latticeDim)
}

/**
 * Samples the exact free-field vacuum state on a periodic lattice.
 *
 * For each independent k-mode, draws phi_k and pi_k from Gaussians with
 * variances `sigma_phi^2 = N_total / (2 * omega_k)` and
 * `sigma_pi^2 = N_total * omega_k / 2` (the factor of N_total compensates
 * for the IFFT's 1/N normalization).
 *
 * Supports N-dimensional lattices (1-11D) via stride-based iteration.
 * The result is deterministic for a given seed.
 *
 * @param config - Free scalar field configuration
 * @param seed - Integer seed for the PRNG
 * @param dispersion - Mass-term dispatch. `'kgFloor'` for the Klein-Gordon
 *                     path; a finite number for the Mukhanov-Sasaki path
 *                     with the supplied signed effective squared mass.
 * @returns Object with `phi` and `pi` as `Float32Array` in row-major order matching GPU buffer layout
 *
 * @example
 * ```ts
 * const { phi, pi } = sampleVacuumSpectrum(config, 42, 'kgFloor')
 * device.queue.writeBuffer(phiBuffer, 0, phi)
 * device.queue.writeBuffer(piBuffer, 0, pi)
 * ```
 */
export function sampleVacuumSpectrum(
  config: FreeScalarConfig,
  seed: number,
  dispersion: VacuumDispersion
): { phi: Float32Array; pi: Float32Array } {
  const { gridSize, spacing, mass, latticeDim } = config
  validateVacuumConfig(gridSize, spacing, latticeDim, mass)
  const dims = gridSize.slice(0, latticeDim)

  const totalSites = dims.reduce((a, b) => a * b, 1)
  const strides = computeStrides(dims)

  const rng = mulberry32(seed)

  // Interleaved complex arrays (re, im, re, im, ...)
  const phiK = new Float64Array(2 * totalSites)
  const piK = new Float64Array(2 * totalSites)

  // Track visited modes to enforce Hermitian symmetry
  const visited = new Uint8Array(totalSites)

  const omegaOf = resolveOmegaEvaluator(config, dispersion)

  // Pre-allocated scratch coords — reused per mode. Under the default
  // 64³ config this loop runs ~260k times; per-iteration `Array`
  // allocation dominates the pack budget with GC churn.
  const coords = new Array<number>(latticeDim).fill(0)
  const conjCoords = new Array<number>(latticeDim).fill(0)

  for (let idx = 0; idx < totalSites; idx++) {
    if (visited[idx]) continue

    linearToNDCoordsInto(idx, dims, coords)

    // Conjugate mode: (-n_d mod N_d) for each dimension
    for (let d = 0; d < latticeDim; d++) {
      conjCoords[d] = (dims[d]! - coords[d]!) % dims[d]!
    }
    const cidx = ndToLinearIdx(conjCoords, strides)

    const omega = omegaOf(coords, dims)

    // Variances in k-space (compensating for IFFT 1/N normalization):
    // After IFFT, phi_x = (1/N) * sum_k phi_k * exp(+ikx)
    // We want <phi_x^2> = (1/N) * sum_k 1/(2*omega_k)
    // This means <|phi_k|^2> = N / (2*omega_k) for the k-space amplitudes
    const sigmaPhiSq = totalSites / (2 * omega)
    const sigmaPiSq = (totalSites * omega) / 2

    if (idx === cidx) {
      // Self-conjugate mode (k = -k mod N): must be real
      const [gPhi] = gaussianPair(rng)
      const [gPi] = gaussianPair(rng)

      phiK[idx * 2] = gPhi * Math.sqrt(sigmaPhiSq)
      phiK[idx * 2 + 1] = 0

      piK[idx * 2] = gPi * Math.sqrt(sigmaPiSq)
      piK[idx * 2 + 1] = 0
    } else {
      // Independent complex mode: sample both real and imaginary parts
      const [gPhiRe, gPhiIm] = gaussianPair(rng)
      const [gPiRe, gPiIm] = gaussianPair(rng)

      const phiAmp = Math.sqrt(sigmaPhiSq / 2)
      const piAmp = Math.sqrt(sigmaPiSq / 2)

      phiK[idx * 2] = gPhiRe * phiAmp
      phiK[idx * 2 + 1] = gPhiIm * phiAmp

      piK[idx * 2] = gPiRe * piAmp
      piK[idx * 2 + 1] = gPiIm * piAmp

      // Conjugate partner: phi_{-k} = conj(phi_k)
      phiK[cidx * 2] = phiK[idx * 2]!
      phiK[cidx * 2 + 1] = -phiK[idx * 2 + 1]!

      piK[cidx * 2] = piK[idx * 2]!
      piK[cidx * 2 + 1] = -piK[idx * 2 + 1]!

      visited[cidx] = 1
    }

    visited[idx] = 1
  }

  // N-D inverse FFT to real space
  ifftNd(phiK, dims)
  ifftNd(piK, dims)

  // Extract real parts into Float32Array (GPU buffer format)
  const phi = new Float32Array(totalSites)
  const pi = new Float32Array(totalSites)

  for (let i = 0; i < totalSites; i++) {
    phi[i] = phiK[i * 2]!
    pi[i] = piK[i * 2]!
  }

  return { phi, pi }
}

/**
 * Estimates the maximum field value for auto-scale normalization of exact vacuum states.
 *
 * Computes a 3-sigma estimate: `3 * sqrt(variance_per_site)` where
 * `variance_per_site = (1/N) * sum_k 1/(2*omega_k)`.
 *
 * Supports N-dimensional lattices.
 *
 * @param config - Free scalar field configuration
 * @param dispersion - Mass-term dispatch (see `VacuumDispersion`). Pass
 *                     `'kgFloor'` for the Klein-Gordon path with the
 *                     `max(mass, M_FLOOR)` regularization, or a finite
 *                     number for the Mukhanov-Sasaki path with the supplied
 *                     signed effective squared mass.
 * @returns Estimated maximum phi value (positive)
 *
 * @example
 * ```ts
 * const maxPhi = estimateVacuumMaxPhi(config, 'kgFloor')
 * ```
 */
export function estimateVacuumMaxPhi(
  config: FreeScalarConfig,
  dispersion: VacuumDispersion
): number {
  const { gridSize, spacing, mass, latticeDim } = config
  validateVacuumConfig(gridSize, spacing, latticeDim, mass)
  const dims = gridSize.slice(0, latticeDim)
  const totalSites = dims.reduce((a, b) => a * b, 1)
  const omegaOf = resolveOmegaEvaluator(config, dispersion)
  const coords = new Array<number>(latticeDim).fill(0)

  let varianceSum = 0
  for (let idx = 0; idx < totalSites; idx++) {
    linearToNDCoordsInto(idx, dims, coords)
    const omega = omegaOf(coords, dims)
    varianceSum += 1 / (2 * omega)
  }

  const variancePerSite = varianceSum / totalSites
  return 3 * Math.sqrt(variancePerSite)
}

/**
 * Estimates the maximum conjugate momentum (pi) for auto-scale normalization.
 *
 * Computes a 3-sigma estimate: `3 * sqrt(variance_per_site)` where
 * `variance_per_site = (1/N) * sum_k omega_k / 2`.
 *
 * Uses the actual k-space mode spectrum instead of the conservative omega_max
 * bound, which over-estimates by ~50% in high dimensions.
 *
 * @param config - Free scalar field configuration
 * @param dispersion - Mass-term dispatch; see `estimateVacuumMaxPhi`.
 * @returns Estimated maximum pi value (positive)
 */
export function estimateVacuumMaxPi(
  config: FreeScalarConfig,
  dispersion: VacuumDispersion
): number {
  const { gridSize, spacing, mass, latticeDim } = config
  validateVacuumConfig(gridSize, spacing, latticeDim, mass)
  const dims = gridSize.slice(0, latticeDim)
  const totalSites = dims.reduce((a, b) => a * b, 1)
  const omegaOf = resolveOmegaEvaluator(config, dispersion)
  const coords = new Array<number>(latticeDim).fill(0)

  let varianceSum = 0
  for (let idx = 0; idx < totalSites; idx++) {
    linearToNDCoordsInto(idx, dims, coords)
    const omega = omegaOf(coords, dims)
    varianceSum += omega / 2
  }

  const variancePerSite = varianceSum / totalSites
  return 3 * Math.sqrt(variancePerSite)
}

/**
 * Estimates the visual-scale energy density for auto-scale normalization of
 * vacuum states.
 *
 * For a free Gaussian field, the local energy density is:
 * `E(x) = 0.5 * pi^2 + 0.5 * m^2 * phi^2 + 0.5 * sum_d (grad_d phi)^2`
 *
 * By Wick's theorem its spatial mean is `⟨E⟩ = (1/2N) sum_k omega_k =
 * meanOmega/2`. Unlike the symmetric `phi` view (zero mean, 3-sigma = a few
 * times sigma), the vacuum ε distribution is one-sided chi-squared-like:
 * extreme peaks across `N = latticeDim³` sites sit ~13x above the spatial
 * mean, while ~99% of voxels are near the mean. Dividing by that extreme
 * peak would leave almost the entire cube at `normRho ≈ 0.05`, which
 * Beer-Lambert then composites to a near-empty scene.
 *
 * Instead we return `meanOmega = 2·⟨E⟩` — twice the spatial average, which
 * puts the typical voxel at `normRho ≈ 0.5` so the raymarcher sees the full
 * vacuum texture, and extreme peaks saturate to a few × the divisor
 * (downstream clamp `min(rho, 10)` keeps the Beer-Lambert exponent bounded).
 *
 * @param config - Free scalar field configuration
 * @param dispersion - Mass-term dispatch; see `estimateVacuumMaxPhi`.
 * @returns Visual-scale energy density (positive): `2·⟨E(x)⟩ = meanOmega`
 */
export function estimateVacuumEnergyVisualScale(
  config: FreeScalarConfig,
  dispersion: VacuumDispersion
): number {
  const { gridSize, spacing, mass, latticeDim } = config
  validateVacuumConfig(gridSize, spacing, latticeDim, mass)
  const dims = gridSize.slice(0, latticeDim)
  const totalSites = dims.reduce((a, b) => a * b, 1)
  const omegaOf = resolveOmegaEvaluator(config, dispersion)
  const coords = new Array<number>(latticeDim).fill(0)

  let omegaSum = 0
  for (let idx = 0; idx < totalSites; idx++) {
    linearToNDCoordsInto(idx, dims, coords)
    const omega = omegaOf(coords, dims)
    omegaSum += omega
  }

  const meanOmega = omegaSum / totalSites
  return meanOmega
}
