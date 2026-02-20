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
 * Scope: free (non-interacting) Gaussian theory only.
 * References: Tong QFT lectures, lattice field theory texts.
 *
 * @module
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { ifft3d } from '@/lib/math/fft'
import { gaussianPair, mulberry32 } from '@/lib/math/rng'

/** Minimum mass used for zero-mode regularization when physical mass is zero. */
const M_FLOOR = 0.01

/**
 * Computes the lattice dispersion relation omega_k for a given mode.
 *
 * Uses the exact lattice dispersion that matches the finite-difference Laplacian
 * in `freeScalarUpdatePi.wgsl.ts`:
 * `omega^2 = m_eff^2 + sum_i [2 * sin(pi * n_i / N_i) / a_i]^2`
 *
 * @param nIndices - Mode index in each dimension `[nx, ny, nz]`
 * @param gridSize - Number of grid points per dimension `[Nx, Ny, Nz]`
 * @param spacing - Lattice spacing per dimension `[ax, ay, az]`
 * @param mass - Physical mass parameter
 * @param latticeDim - Number of active spatial dimensions (1, 2, or 3)
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
 * Checks whether a given power-of-2 is valid.
 *
 * @param n - Value to check
 * @returns True if n is a power of 2 and >= 1
 */
function isPowerOf2(n: number): boolean {
  return n >= 1 && (n & (n - 1)) === 0
}

/**
 * Samples the exact free-field vacuum state on a periodic lattice.
 *
 * For each independent k-mode, draws phi_k and pi_k from Gaussians with
 * variances `sigma_phi^2 = N_total / (2 * omega_k)` and
 * `sigma_pi^2 = N_total * omega_k / 2` (the factor of N_total compensates
 * for the IFFT's 1/N normalization).
 *
 * The result is deterministic for a given seed.
 *
 * @param config - Free scalar field configuration
 * @param seed - Integer seed for the PRNG
 * @returns Object with `phi` and `pi` as `Float32Array` in row-major order matching GPU buffer layout
 *
 * @example
 * ```ts
 * const { phi, pi } = sampleVacuumSpectrum(config, 42)
 * device.queue.writeBuffer(phiBuffer, 0, phi)
 * device.queue.writeBuffer(piBuffer, 0, pi)
 * ```
 */
export function sampleVacuumSpectrum(
  config: FreeScalarConfig,
  seed: number
): { phi: Float32Array; pi: Float32Array } {
  const { gridSize, spacing, mass, latticeDim } = config
  const dims = [gridSize[0], gridSize[1], gridSize[2]] as const

  // Validate power-of-2 for active dimensions
  for (let d = 0; d < latticeDim; d++) {
    if (!isPowerOf2(dims[d]!)) {
      throw new Error(
        `Exact vacuum requires power-of-2 grid sizes, but dimension ${d} has size ${dims[d]}`
      )
    }
  }

  const nx = dims[0]
  const ny = dims[1]
  const nz = dims[2]
  const totalSites = nx * ny * nz

  const rng = mulberry32(seed)

  // Interleaved complex arrays (re, im, re, im, ...)
  const phiK = new Float64Array(2 * totalSites)
  const piK = new Float64Array(2 * totalSites)

  // Track visited modes to enforce Hermitian symmetry
  const visited = new Uint8Array(totalSites)

  for (let iz = 0; iz < nz; iz++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const idx = (iz * ny + iy) * nx + ix
        if (visited[idx]) continue

        // Conjugate mode: (-nx mod Nx, -ny mod Ny, -nz mod Nz)
        const cix = (nx - ix) % nx
        const ciy = (ny - iy) % ny
        const ciz = (nz - iz) % nz
        const cidx = (ciz * ny + ciy) * nx + cix

        const omega = computeOmegaK([ix, iy, iz], dims, spacing, mass, latticeDim)

        // Variances in k-space (compensating for IFFT 1/N normalization):
        // After IFFT, phi_x = (1/N) * sum_k phi_k * exp(+ikx)
        // We want <phi_x^2> = (1/N) * sum_k 1/(2*omega_k)
        // This means <|phi_k|^2> = N / (2*omega_k) for the k-space amplitudes
        const sigmaPhiSq = totalSites / (2 * omega)
        const sigmaPiSq = (totalSites * omega) / 2

        if (idx === cidx) {
          // Self-conjugate mode (k = -k mod N): must be real
          // For real-valued mode: sample real part only, variance = sigmaPhiSq
          const [gPhi] = gaussianPair(rng)
          const [gPi] = gaussianPair(rng)

          phiK[idx * 2] = gPhi * Math.sqrt(sigmaPhiSq)
          phiK[idx * 2 + 1] = 0

          piK[idx * 2] = gPi * Math.sqrt(sigmaPiSq)
          piK[idx * 2 + 1] = 0
        } else {
          // Independent complex mode: sample both real and imaginary parts
          // Each has variance sigmaPhiSq/2 so that |phi_k|^2 has expectation sigmaPhiSq
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
    }
  }

  // 3D inverse FFT to real space
  ifft3d(phiK, nx, ny, nz)
  ifft3d(piK, nx, ny, nz)

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
 * @param config - Free scalar field configuration
 * @returns Estimated maximum phi value (positive)
 *
 * @example
 * ```ts
 * const maxPhi = estimateVacuumMaxPhi(config)
 * ```
 */
export function estimateVacuumMaxPhi(config: FreeScalarConfig): number {
  const { gridSize, spacing, mass, latticeDim } = config
  const nx = gridSize[0]
  const ny = gridSize[1]
  const nz = gridSize[2]
  const totalSites = nx * ny * nz

  let varianceSum = 0
  for (let iz = 0; iz < nz; iz++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const omega = computeOmegaK([ix, iy, iz], gridSize, spacing, mass, latticeDim)
        varianceSum += 1 / (2 * omega)
      }
    }
  }

  const variancePerSite = varianceSum / totalSites
  return 3 * Math.sqrt(variancePerSite)
}
