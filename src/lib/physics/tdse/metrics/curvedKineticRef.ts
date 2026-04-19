/**
 * CPU reference implementation of the curved-space kinetic operator
 * (Laplace–Beltrami discretization) and proper-volume norm.
 *
 * Uses the staggered (flux-form) 2nd-order central difference scheme.
 * Boundary conditions are chosen per metric kind:
 *   - `torus` → periodic wrap (index mod N) for both ψ fetches and half-point
 *     metric sampling; spec: the half-point *world coordinate* still uses the
 *     un-wrapped integer (so the cell adjacent to the seam sees world-coord
 *     + dx/2 on its `+` side, even though the neighbor's ψ comes from the
 *     wrapped index).
 *   - every other kind → Dirichlet (ψ = 0 outside the grid).
 *
 * Hermiticity of T under the proper-volume inner product
 * ⟨φ|ψ⟩ = Σ φ*·ψ·√|g|·Πdx is preserved to machine precision on uniform
 * grids. Time-dependent metrics (currently `deSitter`) thread an explicit
 * `time` parameter down to every `sampleMetric` call.
 *
 * @module lib/physics/tdse/metrics/curvedKineticRef
 */

import { sampleMetric } from './evaluator'
import type { MetricConfig } from './types'
import { hasPeriodicBoundary } from './types'

/**
 * Parameters for the curved-space kinetic operator.
 */
export interface CurvedKineticParams {
  /** Real part of ψ, flattened in row-major order with axis 0 varying slowest. */
  psiRe: Float32Array
  /** Imaginary part of ψ, same layout as psiRe. */
  psiIm: Float32Array
  /** Grid size per axis (length latticeDim). */
  gridSize: readonly number[]
  /** Lattice spacing per axis in world units (length latticeDim). */
  spacing: readonly number[]
  /** Particle mass. */
  mass: number
  /** Reduced Planck constant. */
  hbar: number
  /** Spatial dimensionality of the lattice (1–3 supported). */
  latticeDim: number
  /** Background metric. */
  metric: MetricConfig
  /** Simulation time; forwarded to `sampleMetric` (default 0). */
  time?: number
}

/**
 * Flattened index for a multi-index (i, j, k) into a row-major grid.
 * Precondition: gridSize has length ≥ dim and all i/j/k are within bounds.
 */
function flatIndex(i: number, j: number, k: number, N: readonly number[], dim: number): number {
  if (dim === 1) return i
  const N1 = N[1] as number
  if (dim === 2) return i * N1 + j
  const N2 = N[2] as number
  return (i * N1 + j) * N2 + k
}

/** Total number of lattice sites for a given gridSize up to latticeDim. */
function totalSites(gridSize: readonly number[], latticeDim: number): number {
  let n = 1
  for (let d = 0; d < latticeDim; d++) n *= gridSize[d] as number
  return n
}

/**
 * Shared validation for every entry point: `latticeDim ∈ [1, 3]` and
 * `gridSize.length >= latticeDim`, `spacing.length >= latticeDim`.
 *
 * The per-axis accesses later cast `N[d]` via `as number`, which hides
 * `undefined` when the caller passes a too-short array. Catching it here
 * turns the downstream NaN cascade into a clear error.
 */
function validateLatticeInput(
  fnName: string,
  latticeDim: number,
  gridSize: readonly number[],
  spacing: readonly number[]
): void {
  if (!Number.isInteger(latticeDim) || latticeDim < 1 || latticeDim > 3) {
    throw new Error(`${fnName}: latticeDim ${latticeDim} unsupported (expected 1–3)`)
  }
  if (gridSize.length < latticeDim) {
    throw new Error(`${fnName}: gridSize length ${gridSize.length} < latticeDim ${latticeDim}`)
  }
  if (spacing.length < latticeDim) {
    throw new Error(`${fnName}: spacing length ${spacing.length} < latticeDim ${latticeDim}`)
  }
  for (let d = 0; d < latticeDim; d++) {
    const n = gridSize[d]!
    const dx = spacing[d]!
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`${fnName}: gridSize[${d}]=${n} must be a positive integer`)
    }
    if (!Number.isFinite(dx) || dx <= 0) {
      throw new Error(`${fnName}: spacing[${d}]=${dx} must be finite and > 0`)
    }
  }
}

/**
 * Verify a state-vector buffer matches the lattice's expected site count.
 * Mirrors `validateLatticeInput`'s fast-fail policy so short/long buffers
 * surface as a clear error instead of silently producing NaN from
 * out-of-range reads.
 */
function validateFieldLength(
  fnName: string,
  fieldName: string,
  actual: number,
  expected: number
): void {
  if (actual !== expected) {
    throw new Error(`${fnName}: ${fieldName}.length ${actual} !== expected ${expected}`)
  }
}

/** World coordinate of lattice index i along an axis with N cells and spacing dx. */
function worldCoord(i: number, N: number, dx: number): number {
  return (i - (N - 1) / 2) * dx
}

/**
 * Wrap an integer lattice index when periodic, else pass through unchanged.
 *
 * Handles negative and over-range indices via the positive-modulo idiom
 * `((i % N) + N) % N`, valid for all finite integer inputs.
 */
function wrappedIndex(i: number, N: number, periodic: boolean): number {
  if (!periodic) return i
  return ((i % N) + N) % N
}

/**
 * Fetch ψ[i, j, k] honoring the current boundary mode.
 *
 * - Periodic (`isPeriodic = true`): all three axes wrap modulo their grid size.
 * - Dirichlet (`isPeriodic = false`): out-of-range returns 0.
 */
function fetchPsi(
  arr: Float32Array,
  i: number,
  j: number,
  k: number,
  N: readonly number[],
  dim: number,
  isPeriodic: boolean
): number {
  const N0 = N[0] as number
  let ii = i
  let jj = j
  let kk = k
  if (isPeriodic) {
    ii = wrappedIndex(i, N0, true)
    if (dim >= 2) jj = wrappedIndex(j, N[1] as number, true)
    if (dim >= 3) kk = wrappedIndex(k, N[2] as number, true)
  } else {
    if (ii < 0 || ii >= N0) return 0
    if (dim >= 2) {
      const N1 = N[1] as number
      if (jj < 0 || jj >= N1) return 0
    }
    if (dim >= 3) {
      const N2 = N[2] as number
      if (kk < 0 || kk >= N2) return 0
    }
  }
  return arr[flatIndex(ii, jj, kk, N, dim)] as number
}

/**
 * World coordinates for the half-point between cell (i,j,k) and its +1 neighbor
 * along axis `axis`. Only `axis` gets a half-step; other coords use the cell center.
 *
 * Integer arguments are un-wrapped on purpose: per spec, a periodic wraparound
 * edge samples the metric at world-coord + dx/2 from the originating cell's
 * perspective (not at the wrapped neighbor's position).
 */
function halfPointCoords(
  i: number,
  j: number,
  k: number,
  axis: number,
  gridSize: readonly number[],
  spacing: readonly number[],
  latticeDim: number
): number[] {
  const coords = new Array<number>(latticeDim)
  coords[0] = worldCoord(i, gridSize[0] as number, spacing[0] as number)
  if (latticeDim >= 2) coords[1] = worldCoord(j, gridSize[1] as number, spacing[1] as number)
  if (latticeDim >= 3) coords[2] = worldCoord(k, gridSize[2] as number, spacing[2] as number)
  coords[axis] = (coords[axis] as number) + 0.5 * (spacing[axis] as number)
  return coords
}

/** World coordinates at the center of cell (i,j,k). */
function cellCoords(
  i: number,
  j: number,
  k: number,
  gridSize: readonly number[],
  spacing: readonly number[],
  latticeDim: number
): number[] {
  const coords = new Array<number>(latticeDim)
  coords[0] = worldCoord(i, gridSize[0] as number, spacing[0] as number)
  if (latticeDim >= 2) coords[1] = worldCoord(j, gridSize[1] as number, spacing[1] as number)
  if (latticeDim >= 3) coords[2] = worldCoord(k, gridSize[2] as number, spacing[2] as number)
  return coords
}

/**
 * Apply the curved-space kinetic operator to ψ:
 *
 *   T ψ = −(ℏ²/2m) · (1/√|g|) · Σ_μ ∂_μ [ √|g| · g^μμ · ∂_μ ψ ]
 *
 * Uses the staggered flux form with 2nd-order central differences. Boundary
 * conditions are periodic when `hasPeriodicBoundary(metric.kind)` is true
 * (currently only `torus`) and Dirichlet otherwise.
 *
 * Hermitian under the proper-volume inner product for both boundary modes.
 *
 * @param params - Field, grid, metric, and (optional) simulation time.
 * @returns New real/imaginary arrays holding Tψ (input arrays not mutated).
 * @throws If `latticeDim` is outside `[1, 3]`, `gridSize`/`spacing` length
 *         disagrees with `latticeDim`, any `gridSize[i]` is not a positive
 *         integer, any `spacing[i]` is not a positive finite number, or
 *         `psiRe`/`psiIm` length does not equal the total site count.
 */
export function applyCurvedKineticRef(params: CurvedKineticParams): {
  re: Float32Array
  im: Float32Array
} {
  const { psiRe, psiIm, gridSize, spacing, mass, hbar, latticeDim, metric } = params
  const time = params.time ?? 0
  validateLatticeInput('applyCurvedKineticRef', latticeDim, gridSize, spacing)

  const N = gridSize
  const total = totalSites(gridSize, latticeDim)
  validateFieldLength('applyCurvedKineticRef', 'psiRe', psiRe.length, total)
  validateFieldLength('applyCurvedKineticRef', 'psiIm', psiIm.length, total)
  const outRe = new Float32Array(total)
  const outIm = new Float32Array(total)
  const prefactor = -(hbar * hbar) / (2 * mass)
  const isPeriodic = hasPeriodicBoundary(metric.kind)

  const iMax = N[0] as number
  const jMax = latticeDim >= 2 ? (N[1] as number) : 1
  const kMax = latticeDim >= 3 ? (N[2] as number) : 1

  for (let i = 0; i < iMax; i++) {
    for (let j = 0; j < jMax; j++) {
      for (let k = 0; k < kMax; k++) {
        const idx = flatIndex(i, j, k, N, latticeDim)
        const centerCoords = cellCoords(i, j, k, gridSize, spacing, latticeDim)
        const centerSample = sampleMetric(metric, centerCoords, latticeDim, time)
        const invSqrtDet = 1 / centerSample.sqrtDet

        let divFluxRe = 0
        let divFluxIm = 0

        for (let axis = 0; axis < latticeDim; axis++) {
          const dx = spacing[axis] as number
          const invDx = 1 / dx

          // Neighbors along this axis (un-wrapped; fetchPsi handles wrap/Dirichlet).
          const iPlus = axis === 0 ? i + 1 : i
          const jPlus = axis === 1 ? j + 1 : j
          const kPlus = axis === 2 ? k + 1 : k
          const iMinus = axis === 0 ? i - 1 : i
          const jMinus = axis === 1 ? j - 1 : j
          const kMinus = axis === 2 ? k - 1 : k

          const psiPlusRe = fetchPsi(psiRe, iPlus, jPlus, kPlus, N, latticeDim, isPeriodic)
          const psiPlusIm = fetchPsi(psiIm, iPlus, jPlus, kPlus, N, latticeDim, isPeriodic)
          const psiMinusRe = fetchPsi(psiRe, iMinus, jMinus, kMinus, N, latticeDim, isPeriodic)
          const psiMinusIm = fetchPsi(psiIm, iMinus, jMinus, kMinus, N, latticeDim, isPeriodic)
          const psiCenterRe = psiRe[idx] as number
          const psiCenterIm = psiIm[idx] as number

          // Half-point metric samples along this axis. Integer args are un-wrapped
          // on purpose — the world coord of the half-point is derived from the
          // originating cell index even at a periodic seam.
          const coordsPlus = halfPointCoords(i, j, k, axis, gridSize, spacing, latticeDim)
          const coordsMinus = halfPointCoords(
            axis === 0 ? i - 1 : i,
            axis === 1 ? j - 1 : j,
            axis === 2 ? k - 1 : k,
            axis,
            gridSize,
            spacing,
            latticeDim
          )
          const samplePlus = sampleMetric(metric, coordsPlus, latticeDim, time)
          const sampleMinus = sampleMetric(metric, coordsMinus, latticeDim, time)

          const aPlus = samplePlus.sqrtDet * (samplePlus.gInverseDiag[axis] as number)
          const aMinus = sampleMinus.sqrtDet * (sampleMinus.gInverseDiag[axis] as number)

          // Staggered flux: F_+ = a_+ · (ψ_{+1} − ψ_0)/dx, F_− = a_− · (ψ_0 − ψ_{−1})/dx.
          // Divergence: (F_+ − F_−)/dx.
          const fluxPlusRe = aPlus * (psiPlusRe - psiCenterRe) * invDx
          const fluxPlusIm = aPlus * (psiPlusIm - psiCenterIm) * invDx
          const fluxMinusRe = aMinus * (psiCenterRe - psiMinusRe) * invDx
          const fluxMinusIm = aMinus * (psiCenterIm - psiMinusIm) * invDx

          divFluxRe += (fluxPlusRe - fluxMinusRe) * invDx
          divFluxIm += (fluxPlusIm - fluxMinusIm) * invDx
        }

        outRe[idx] = prefactor * invSqrtDet * divFluxRe
        outIm[idx] = prefactor * invSqrtDet * divFluxIm
      }
    }
  }

  return { re: outRe, im: outIm }
}

/**
 * Compute the proper-volume norm ∫ |ψ|² √|g| dⁿx via midpoint integration.
 *
 * @param psiRe - Real part of ψ.
 * @param psiIm - Imaginary part of ψ.
 * @param gridSize - Grid size per axis.
 * @param spacing - Lattice spacing per axis.
 * @param latticeDim - Spatial dimensionality (1–3).
 * @param metric - Background metric.
 * @param time - Simulation time (default 0). For time-dependent metrics
 *   (e.g. `deSitter`) the returned norm is time-dependent because √|g|
 *   depends on time.
 * @returns ∫ |ψ|² √|g| dⁿx as a non-negative real number.
 * @throws If `latticeDim` is outside `[1, 3]`, `gridSize`/`spacing` length
 *         disagrees with `latticeDim`, any `gridSize[i]` is not a positive
 *         integer, any `spacing[i]` is not a positive finite number, or
 *         `psiRe`/`psiIm` length does not equal the total site count.
 */
export function computeProperNorm(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: readonly number[],
  spacing: readonly number[],
  latticeDim: number,
  metric: MetricConfig,
  time: number = 0
): number {
  validateLatticeInput('computeProperNorm', latticeDim, gridSize, spacing)
  const total = totalSites(gridSize, latticeDim)
  validateFieldLength('computeProperNorm', 'psiRe', psiRe.length, total)
  validateFieldLength('computeProperNorm', 'psiIm', psiIm.length, total)

  let cellVol = 1
  for (let d = 0; d < latticeDim; d++) cellVol *= spacing[d] as number

  const N = gridSize
  const iMax = N[0] as number
  const jMax = latticeDim >= 2 ? (N[1] as number) : 1
  const kMax = latticeDim >= 3 ? (N[2] as number) : 1

  let sum = 0
  for (let i = 0; i < iMax; i++) {
    for (let j = 0; j < jMax; j++) {
      for (let k = 0; k < kMax; k++) {
        const idx = flatIndex(i, j, k, N, latticeDim)
        const coords = cellCoords(i, j, k, gridSize, spacing, latticeDim)
        const sample = sampleMetric(metric, coords, latticeDim, time)
        const re = psiRe[idx] as number
        const im = psiIm[idx] as number
        sum += (re * re + im * im) * sample.sqrtDet
      }
    }
  }
  return sum * cellVol
}

/**
 * Proper-volume inner product ⟨φ|ψ⟩_g = Σ φ*·ψ·√|g|·Πdx.
 *
 * Returns a complex number as `{re, im}`. Used by hermiticity tests and
 * diagnostics that require the curved-space inner product consistent with
 * the metric's √|g| weighting.
 *
 * @param phiRe - Real part of φ.
 * @param phiIm - Imaginary part of φ.
 * @param psiRe - Real part of ψ.
 * @param psiIm - Imaginary part of ψ.
 * @param gridSize - Grid size per axis.
 * @param spacing - Lattice spacing per axis.
 * @param latticeDim - Spatial dimensionality (1–3).
 * @param metric - Background metric.
 * @param time - Simulation time (default 0); forwarded to `sampleMetric`.
 * @returns `{re, im}` of ⟨φ|ψ⟩_g.
 * @throws If `latticeDim` is outside `[1, 3]`, `gridSize`/`spacing` length
 *         disagrees with `latticeDim`, any `gridSize[i]` is not a positive
 *         integer, any `spacing[i]` is not a positive finite number, or
 *         any of `phiRe`/`phiIm`/`psiRe`/`psiIm` length does not equal the
 *         total site count.
 */
export function computeInnerProduct(
  phiRe: Float32Array,
  phiIm: Float32Array,
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: readonly number[],
  spacing: readonly number[],
  latticeDim: number,
  metric: MetricConfig,
  time: number = 0
): { re: number; im: number } {
  validateLatticeInput('computeInnerProduct', latticeDim, gridSize, spacing)
  const total = totalSites(gridSize, latticeDim)
  validateFieldLength('computeInnerProduct', 'phiRe', phiRe.length, total)
  validateFieldLength('computeInnerProduct', 'phiIm', phiIm.length, total)
  validateFieldLength('computeInnerProduct', 'psiRe', psiRe.length, total)
  validateFieldLength('computeInnerProduct', 'psiIm', psiIm.length, total)

  let cellVol = 1
  for (let d = 0; d < latticeDim; d++) cellVol *= spacing[d] as number

  const N = gridSize
  const iMax = N[0] as number
  const jMax = latticeDim >= 2 ? (N[1] as number) : 1
  const kMax = latticeDim >= 3 ? (N[2] as number) : 1

  let sumRe = 0
  let sumIm = 0
  for (let i = 0; i < iMax; i++) {
    for (let j = 0; j < jMax; j++) {
      for (let k = 0; k < kMax; k++) {
        const idx = flatIndex(i, j, k, N, latticeDim)
        const coords = cellCoords(i, j, k, gridSize, spacing, latticeDim)
        const sample = sampleMetric(metric, coords, latticeDim, time)
        const phiR = phiRe[idx] as number
        const phiI = phiIm[idx] as number
        const psiR = psiRe[idx] as number
        const psiI = psiIm[idx] as number
        // φ* · ψ = (φ_re − i φ_im)(ψ_re + i ψ_im)
        const reMul = phiR * psiR + phiI * psiI
        const imMul = phiR * psiI - phiI * psiR
        sumRe += reMul * sample.sqrtDet
        sumIm += imMul * sample.sqrtDet
      }
    }
  }
  return { re: sumRe * cellVol, im: sumIm * cellVol }
}
