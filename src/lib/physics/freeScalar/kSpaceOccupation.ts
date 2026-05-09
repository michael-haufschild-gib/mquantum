/**
 * k-Space Occupation Map computation for free scalar field.
 *
 * Performs forward FFT of phi/pi fields, computes occupation numbers n_k
 * per lattice momentum mode. Exports raw physics data + helpers used by
 * the display transform pipeline.
 *
 * The pipeline is split into two stages:
 * 1. Raw physics: FFT + n_k computation (this file)
 * 2. Display: coordinate mapping, exposure, broadening, packing (kSpaceDisplayTransforms.ts)
 */

import { DENSITY_GRID_SIZE } from '@/constants/densityGrid'
import { fftNd } from '@/lib/math/fft'
import { computeStrides, linearToNDCoordsInto } from '@/lib/math/ndArray'
import {
  type AnisotropicVacuumDispersion,
  M_FLOOR,
  type VacuumDispersion,
} from '@/lib/physics/freeScalar/vacuumSpectrum'

/**
 * Size of the 3D output density grid — re-exported from the shared constant
 * so existing consumers that import `OUTPUT_GRID_SIZE` continue to work.
 */
export const OUTPUT_GRID_SIZE = DENSITY_GRID_SIZE

// Reusable buffer for float32-to-float16 conversion (avoids per-call allocation)
const _f16Buf = new ArrayBuffer(4)
const _f16F32 = new Float32Array(_f16Buf)
const _f16U32 = new Uint32Array(_f16Buf)

/**
 * Convert a 32-bit float to IEEE 754 half-precision (16-bit) float.
 *
 * @param val - Float32-compatible numeric value to encode
 * @returns IEEE754 half-float bit pattern stored in a 16-bit unsigned integer
 */
export function float32ToFloat16(val: number): number {
  _f16F32[0] = val
  const bits = _f16U32[0]!

  const sign = (bits >>> 31) & 0x1
  const exp = (bits >>> 23) & 0xff
  const frac = bits & 0x7fffff

  if (exp === 0xff) {
    // Inf or NaN
    return (sign << 15) | 0x7c00 | (frac ? 0x200 : 0)
  }

  // Rebias exponent from 127 to 15
  let newExp = exp - 127 + 15

  if (newExp >= 0x1f) {
    // Overflow → ±Inf
    return (sign << 15) | 0x7c00
  }

  if (newExp <= 0) {
    // Denormalized or underflow
    if (newExp < -10) return sign << 15 // Too small → ±0
    // Shift the 24-bit significand (implicit 1 + 23-bit frac) right to produce
    // a 10-bit subnormal mantissa. Round discarded bits to nearest-even so CPU
    // packing matches GPU half-float conversion semantics instead of truncating.
    const shift = 14 - newExp
    const significand = frac | 0x800000
    let mantissa = significand >> shift
    const remainder = significand & ((1 << shift) - 1)
    const halfway = 1 << (shift - 1)
    if (remainder > halfway || (remainder === halfway && (mantissa & 1) === 1)) {
      mantissa++
    }
    return (sign << 15) | mantissa
  }

  let mantissa = frac >> 13
  const remainder = frac & 0x1fff
  if (remainder > 0x1000 || (remainder === 0x1000 && (mantissa & 1) === 1)) {
    mantissa++
    if (mantissa === 0x400) {
      mantissa = 0
      newExp++
      if (newExp >= 0x1f) {
        return (sign << 15) | 0x7c00
      }
    }
  }

  return (sign << 15) | (newExp << 10) | mantissa
}

/** Pack 4 floats as rgba16float into a Uint16Array at the given pixel offset. */
export function packRGBA16F(
  out: Uint16Array,
  pixelIdx: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  const base = pixelIdx * 4
  out[base] = float32ToFloat16(r)
  out[base + 1] = float32ToFloat16(g)
  out[base + 2] = float32ToFloat16(b)
  out[base + 3] = float32ToFloat16(a)
}

/** Pack only R and G channels, leaving B and A as zero (Uint16Array is zero-initialized). */
export function packRG16F(out: Uint16Array, pixelIdx: number, r: number, g: number): void {
  const base = pixelIdx * 4
  out[base] = float32ToFloat16(r)
  out[base + 1] = float32ToFloat16(g)
}

/** Pack only R channel, leaving G, B, A as zero. */
export function packR16F(out: Uint16Array, pixelIdx: number, r: number): void {
  out[pixelIdx * 4] = float32ToFloat16(r)
}

// ============================================================================
// Raw Physics Stage
// ============================================================================

/**
 * Raw k-space data produced by FFT + occupation number computation.
 * Contains per-mode physics quantities before any display transforms.
 */
export interface KSpaceRawData {
  /** Per-mode occupation number (raw values, may be negative) */
  nk: Float64Array
  /** Per-mode |k| magnitude */
  kMag: Float64Array
  /** Per-mode omega (angular frequency) */
  omega: Float64Array
  /** Maximum positive n_k value */
  nkMax: number
  /** Maximum |k| value */
  kMagMax: number
  /** Maximum omega value */
  omegaMax: number
  /** Total number of lattice sites */
  totalSites: number
  /** Per-dimension grid sizes (active dims only) */
  gridSize: readonly number[]
  /** Row-major strides for the grid */
  strides: number[]
  /** Number of active lattice dimensions */
  latticeDim: number
  /** Lattice spacings per dimension */
  spacing: readonly number[]
}

/**
 * Canonical-basis coefficients for the `n_k` kernel. Under the canonical
 * δφ integrator, the vacuum variances of the underlying SHO are
 *
 *     ⟨|δφ_k|²⟩ = 1/(2·aPotential·ω_k)
 *     ⟨|π_δφ,k|²⟩ = aPotential·ω_k/2
 *
 * with `aPotential = a^(n−2)`, so the correct number-operator definition
 * per mode is
 *
 *     n_k = (aKinetic·|π_k|² + aPotential·ω_k²·|δφ_k|²) / (2·ω_k·N) − 1/2
 *
 * which reduces to the Minkowski formula at `(aKinetic, aPotential) =
 * (1, 1)`. Passing the identity pair recovers the pre-cosmology kernel
 * bit-for-bit.
 */
export interface KSpaceBasisCoefs {
  /** `aKinetic = a^(−(n−2))`. Defaults to `1` (Minkowski). */
  aKinetic: number
  /** `aPotential = a^(n−2)`. Defaults to `1` (Minkowski). */
  aPotential: number
}

/** Identity basis coefficients — the Minkowski short-circuit. */
const MINKOWSKI_BASIS_COEFS: KSpaceBasisCoefs = { aKinetic: 1, aPotential: 1 }

/**
 * Validate the `dispersion` and `basisCoefs` inputs common to every
 * public entry point in this module. `dispersion` must be either the
 * sentinel `'kgFloor'` or a finite number; each basis coefficient must
 * be finite and strictly positive. A `NaN`/`Infinity` dispersion or a
 * non-positive coefficient would silently propagate corrupted `ω_k`
 * and `n_k` values into the thermometer pipeline — throw at the API
 * boundary instead of lying in the output.
 *
 * @param dispersion - Mass-term dispatch (validated)
 * @param basisCoefs - Canonical-basis rescale coefficients (validated)
 */
function isAnisotropicDispersion(d: VacuumDispersion): d is AnisotropicVacuumDispersion {
  return typeof d === 'object' && d !== null && 'axisPotentials' in d
}

function validateVacuumInputs(
  dispersion: VacuumDispersion,
  basisCoefs: KSpaceBasisCoefs,
  latticeDim: number
): void {
  if (dispersion !== 'kgFloor' && typeof dispersion !== 'number') {
    if (!isAnisotropicDispersion(dispersion)) {
      throw new Error(`dispersion must be 'kgFloor', a finite number, or an anisotropic record`)
    }
    if (!Number.isFinite(dispersion.massSq)) {
      throw new Error(`dispersion.massSq must be finite, got ${dispersion.massSq}`)
    }
    if (!Number.isFinite(dispersion.kineticScale) || dispersion.kineticScale <= 0) {
      throw new Error(
        `dispersion.kineticScale must be a finite positive number, got ${dispersion.kineticScale}`
      )
    }
    if (dispersion.axisPotentials.length < latticeDim) {
      throw new Error(
        `dispersion.axisPotentials must provide at least ${latticeDim} entries, got ${dispersion.axisPotentials.length}`
      )
    }
    for (let d = 0; d < latticeDim; d++) {
      const v = dispersion.axisPotentials[d]!
      if (!Number.isFinite(v) || v <= 0) {
        throw new Error(`dispersion.axisPotentials[${d}] must be finite and positive, got ${v}`)
      }
    }
  } else if (typeof dispersion === 'number' && !Number.isFinite(dispersion)) {
    throw new Error(`dispersion must be 'kgFloor' or a finite number, got ${String(dispersion)}`)
  }
  const { aKinetic, aPotential } = basisCoefs
  if (!Number.isFinite(aKinetic) || aKinetic <= 0) {
    throw new Error(`basisCoefs.aKinetic must be a finite positive number, got ${aKinetic}`)
  }
  if (!Number.isFinite(aPotential) || aPotential <= 0) {
    throw new Error(`basisCoefs.aPotential must be a finite positive number, got ${aPotential}`)
  }
}

/**
 * Compute raw k-space occupation data from real-space phi and pi fields.
 * This is the physics stage — FFT + n_k computation with no display transforms.
 *
 * When `dispersion === 'kgFloor'` (the default), `ω_k` is computed against the
 * static Klein-Gordon vacuum with the `max(mass, M_FLOOR)` regularization. When
 * `dispersion` is a finite number, `ω_k² = k_lat² + dispersion` — used to
 * measure `n_k` against the instantaneous adiabatic vacuum at the current
 * conformal time on a curved background (`dispersion = m²·a²(η)`).
 *
 * Under cosmology the field buffers hold canonical `(δφ, π_δφ)` variables
 * whose vacuum variances differ from the Minkowski case by a factor of
 * `aPotential = a^(n−2)` (see {@link KSpaceBasisCoefs}). Passing the
 * per-frame `{aKinetic, aPotential}` pair rescales the `n_k` formula so
 * the initial adiabatic vacuum reads back as zero particles instead of
 * the systematic bias `(B + 1/B)/4 − 1/2`. The Minkowski / cosmology-
 * disabled path passes the identity pair and the kernel is bit-identical
 * to the pre-cosmology implementation.
 *
 * @param phi - Real-space field values (Float32Array, totalSites elements)
 * @param pi - Conjugate momenta (Float32Array, totalSites elements)
 * @param gridSize - Per-dimension grid sizes (must all be power-of-2)
 * @param spacing - Lattice spacings per dimension
 * @param mass - Field mass parameter
 * @param latticeDim - Number of active lattice dimensions
 * @param dispersion - Mass-term dispatch for the vacuum reference state.
 *                     Defaults to `'kgFloor'`, preserving Minkowski behavior.
 * @param basisCoefs - Canonical basis coefficients. Defaults to identity —
 *                     pass `{aKinetic: 1/B, aPotential: B}` under cosmology
 *                     with `B = a^(n−2)`.
 * @returns Raw k-space data arrays and normalization maxima
 */
export function computeRawKSpaceData(
  phi: Float32Array,
  pi: Float32Array,
  gridSize: readonly number[],
  spacing: readonly number[],
  mass: number,
  latticeDim: number,
  dispersion: VacuumDispersion = 'kgFloor',
  basisCoefs: KSpaceBasisCoefs = MINKOWSKI_BASIS_COEFS
): KSpaceRawData {
  if (!Number.isInteger(latticeDim) || latticeDim < 1 || latticeDim > gridSize.length) {
    throw new Error(`latticeDim must be an integer in [1, ${gridSize.length}], got ${latticeDim}`)
  }
  validateVacuumInputs(dispersion, basisCoefs, latticeDim)

  const activeDims = gridSize.slice(0, latticeDim)
  const totalSites = activeDims.reduce((a, b) => a * b, 1)

  if (spacing.length < latticeDim) {
    throw new Error(`spacing must provide at least ${latticeDim} entries, got ${spacing.length}`)
  }

  for (let d = 0; d < latticeDim; d++) {
    const n = activeDims[d]!
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(`gridSize[${d}] must be a positive integer, got ${n}`)
    }
    const a = spacing[d]!
    if (!Number.isFinite(a) || a <= 0) {
      throw new Error(`spacing[${d}] must be a finite positive number, got ${a}`)
    }
  }

  if (!Number.isFinite(mass)) {
    throw new Error(`mass must be finite, got ${mass}`)
  }

  if (phi.length < totalSites || pi.length < totalSites) {
    throw new Error(
      `phi/pi length too small for active grid: need ${totalSites}, got phi=${phi.length}, pi=${pi.length}`
    )
  }

  // Convert phi/pi from Float32 real to Float64 interleaved complex
  const phiComplex = new Float64Array(totalSites * 2)
  const piComplex = new Float64Array(totalSites * 2)
  for (let i = 0; i < totalSites; i++) {
    phiComplex[i * 2] = phi[i]!
    piComplex[i * 2] = pi[i]!
  }

  // Forward FFT
  fftNd(phiComplex, activeDims)
  fftNd(piComplex, activeDims)

  const strides = computeStrides(activeDims)
  return computeKSpaceOccupationInnerLoop(
    phiComplex,
    piComplex,
    activeDims,
    strides,
    spacing,
    mass,
    latticeDim,
    dispersion,
    basisCoefs,
    totalSites
  )
}

/**
 * Compute raw k-space occupation data from pre-interleaved complex arrays.
 * Avoids the real→complex interleaving copy inside computeRawKSpaceData.
 * Accepts either Float32Array (faster, less memory) or Float64Array (full precision).
 *
 * The `dispersion` parameter matches `computeRawKSpaceData` — pass `'kgFloor'`
 * (default) for the static Klein-Gordon vacuum reference or a finite squared
 * mass `m²·a²(η)` for the instantaneous adiabatic vacuum on a curved
 * background.
 *
 * @param phiComplex - Pre-interleaved complex phi data (modified in-place by FFT)
 * @param piComplex - Pre-interleaved complex pi data (modified in-place by FFT)
 * @param gridSize - Per-dimension grid sizes (must all be power-of-2)
 * @param spacing - Lattice spacings per dimension
 * @param mass - Field mass parameter
 * @param latticeDim - Number of active lattice dimensions
 * @param dispersion - Mass-term dispatch for the vacuum reference state.
 *                     Defaults to `'kgFloor'`, preserving Minkowski behavior.
 * @returns Raw k-space data arrays and normalization maxima
 */
export function computeRawKSpaceDataFromComplex(
  phiComplex: Float64Array | Float32Array,
  piComplex: Float64Array | Float32Array,
  gridSize: readonly number[],
  spacing: readonly number[],
  mass: number,
  latticeDim: number,
  dispersion: VacuumDispersion = 'kgFloor',
  basisCoefs: KSpaceBasisCoefs = MINKOWSKI_BASIS_COEFS
): KSpaceRawData {
  if (!Number.isInteger(latticeDim) || latticeDim < 1 || latticeDim > gridSize.length) {
    throw new Error(`latticeDim must be an integer in [1, ${gridSize.length}], got ${latticeDim}`)
  }
  validateVacuumInputs(dispersion, basisCoefs, latticeDim)

  const activeDims = gridSize.slice(0, latticeDim)
  const totalSites = activeDims.reduce((a, b) => a * b, 1)

  if (spacing.length < latticeDim) {
    throw new Error(`spacing must provide at least ${latticeDim} entries, got ${spacing.length}`)
  }

  for (let d = 0; d < latticeDim; d++) {
    const n = activeDims[d]!
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(`gridSize[${d}] must be a positive integer, got ${n}`)
    }
    const a = spacing[d]!
    if (!Number.isFinite(a) || a <= 0) {
      throw new Error(`spacing[${d}] must be a finite positive number, got ${a}`)
    }
  }

  if (!Number.isFinite(mass)) {
    throw new Error(`mass must be finite, got ${mass}`)
  }

  const expectedLen = totalSites * 2
  if (phiComplex.length < expectedLen || piComplex.length < expectedLen) {
    throw new Error(
      `Complex arrays too small: need ${expectedLen}, got phi=${phiComplex.length}, pi=${piComplex.length}`
    )
  }

  // Forward FFT (in-place)
  fftNd(phiComplex, activeDims)
  fftNd(piComplex, activeDims)

  const strides = computeStrides(activeDims)
  return computeKSpaceOccupationInnerLoop(
    phiComplex,
    piComplex,
    activeDims,
    strides,
    spacing,
    mass,
    latticeDim,
    dispersion,
    basisCoefs,
    totalSites
  )
}

/**
 * Shared per-site kernel for {@link computeRawKSpaceData} and
 * {@link computeRawKSpaceDataFromComplex}. Fuses the lattice-momentum
 * computation with the dispersion lookup so the inner loop has a
 * single monomorphic call site instead of dispatching through a
 * captured closure (the old implementation paid a polymorphic indirect
 * call per mode, which JIT-compiled into an inline cache check that
 * the tight loop did not need).
 *
 * The dispersion dispatch is hoisted into a single `mTerm` value so
 * the mass-term branch is evaluated once before the loop — the per-
 * site hot path only touches two `Float64Array` stores plus one
 * `sqrt` and one divide.
 *
 * This path is also more numerically consistent than the previous
 * implementation: symmetric k-points now produce byte-identical `n_k`
 * values because they go through exactly the same sequence of
 * arithmetic ops (the old path had a hidden `sqrt(omegaSq)²` round
 * trip that leaked ~2 ULP between symmetric modes).
 *
 * @internal
 */
function computeKSpaceOccupationInnerLoop(
  phiComplex: Float64Array | Float32Array,
  piComplex: Float64Array | Float32Array,
  activeDims: readonly number[],
  strides: number[],
  spacing: readonly number[],
  mass: number,
  latticeDim: number,
  dispersion: VacuumDispersion,
  basisCoefs: KSpaceBasisCoefs,
  totalSites: number
): KSpaceRawData {
  const nk = new Float64Array(totalSites)
  const kMag = new Float64Array(totalSites)
  const omegaArr = new Float64Array(totalSites)

  let nkMax = 0
  let kMagMax = 0
  let omegaMax = 0

  // Pre-allocate coords array to avoid per-site allocation
  const coords = new Array<number>(latticeDim).fill(0)

  // Hoist the mass-term out of the per-site loop. The two dispersion
  // paths differ only in how they build `mTerm`:
  //  - 'kgFloor': mEff = max(mass, M_FLOOR); mTerm = mEff²
  //  - numeric:   mTerm = dispersion (signed squared-mass)
  // A single `ω² < M_FLOOR² ⇒ ω² := M_FLOOR²` clamp then gives
  // `ω² ≥ floor²` in both modes, matching the original
  // `computeOmegaK(FromMassSq)` behaviour.
  const isKgFloor = dispersion === 'kgFloor'
  const anisotropic = isAnisotropicDispersion(dispersion)
  const mTerm = isKgFloor
    ? Math.max(mass, M_FLOOR) ** 2
    : anisotropic
      ? dispersion.massSq
      : (dispersion as number)
  const floorSq = M_FLOOR * M_FLOOR

  // Canonical-basis variance rescale — identity in Minkowski, non-trivial
  // under FLRW. Hoisted out so the per-site loop has two multiplies and
  // no branches.
  const aKinetic = anisotropic ? dispersion.kineticScale : basisCoefs.aKinetic
  const aPotential = basisCoefs.aPotential

  for (let i = 0; i < totalSites; i++) {
    linearToNDCoordsInto(i, activeDims, coords)

    // Lattice momentum ² — reused for both ω² and |k|.
    let kSq = 0
    let weightedKStiffness = 0
    for (let d = 0; d < latticeDim; d++) {
      const N = activeDims[d]!
      if (N <= 1) continue
      const a = spacing[d]!
      const sinVal = Math.sin((Math.PI * coords[d]!) / N)
      const kLat = (2 * sinVal) / a
      const kLatSq = kLat * kLat
      kSq += kLatSq
      if (anisotropic) {
        weightedKStiffness += dispersion.axisPotentials[d]! * kLatSq
      }
    }
    const kMagVal = Math.sqrt(kSq)
    kMag[i] = kMagVal

    // Canonical oscillator:
    //   H_k = 1/2 A |pi_k|^2 + 1/2 K |phi_k|^2
    //   omega_k^2 = A*K
    // Isotropic FLRW has K = B*(k^2 + m^2 a^2). Bianchi-I replaces the
    // gradient term with per-axis B_d k_d^2 plus m^2 aFull.
    const stiffnessRaw = anisotropic ? weightedKStiffness + mTerm : aPotential * (kSq + mTerm)
    let omegaSq = aKinetic * stiffnessRaw
    const stiffness = omegaSq < floorSq ? floorSq / aKinetic : stiffnessRaw
    if (omegaSq < floorSq) omegaSq = floorSq
    const omega = Math.sqrt(omegaSq)
    omegaArr[i] = omega

    // |phi_k|^2 and |pi_k|^2
    const phiRe = phiComplex[i * 2]!
    const phiIm = phiComplex[i * 2 + 1]!
    const piRe = piComplex[i * 2]!
    const piIm = piComplex[i * 2 + 1]!
    const phiKSq = phiRe * phiRe + phiIm * phiIm
    const piKSq = piRe * piRe + piIm * piIm

    // Canonical number operator:
    //   n_k = (aKinetic·|π_k|² + K·|δφ_k|²) / (2·ω·N) − 1/2
    // In Minkowski/`kgFloor` we receive `(aKinetic, aPotential) = (1, 1)`
    // so this is bit-identical to the old `(|π|² + ω²|φ|²)/(2ωN) − ½`
    // formula. Under FLRW the coefficients are `(1/B, B)` and the formula
    // removes the `(B + 1/B)/4 − ½` bias that a naive Minkowski readout
    // would produce on the canonical δφ samples. Bianchi-I uses the
    // axis-weighted stiffness K from the same anisotropic vacuum sampler.
    // The factor `N` in the denominator is the FFT Parseval normalization.
    // ω is already floored at `M_FLOOR`, so `2·ω` never divides by zero.
    const nkVal = (aKinetic * piKSq + stiffness * phiKSq) / (2 * omega * totalSites) - 0.5
    nk[i] = nkVal

    if (nkVal > nkMax) nkMax = nkVal
    if (kMagVal > kMagMax) kMagMax = kMagVal
    if (omega > omegaMax) omegaMax = omega
  }

  return {
    nk,
    kMag,
    omega: omegaArr,
    nkMax,
    kMagMax,
    omegaMax,
    totalSites,
    gridSize: activeDims,
    strides,
    latticeDim,
    spacing,
  }
}

/**
 * Sum of `n_k` clamped at zero. Cosmological particle creation is strictly
 * non-negative when measured against the instantaneous adiabatic vacuum;
 * the clamp floors negative noise from the `ν − 1/2` subtraction in
 * almost-vacuum states.
 *
 * @param raw - Raw k-space occupation data
 * @returns Total particle number `N(η) = Σ_k max(n_k, 0)`
 */
export function computeTotalParticleNumber(raw: KSpaceRawData): number {
  const { nk } = raw
  let total = 0
  for (let i = 0; i < nk.length; i++) {
    const v = nk[i]!
    if (v > 0) total += v
  }
  return total
}
