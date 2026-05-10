/**
 * Eigenstate–Orbit Correlation Metric
 *
 * Computes the overlap between eigenstate probability density and classical
 * trajectories at the same energy. This is a heuristic for detecting quantum
 * scarring (concentration along unstable periodic orbits), but does NOT perform
 * a true periodic-orbit search. The classical trajectories are random
 * energy-shell samples — not guaranteed periodic or unstable.
 *
 * The weight function W_orbit(x) is a Gaussian tube around the trajectory:
 *   W(x) = Σ_t exp(-|x - x_orbit(t)|² / (2ε²))
 *
 * The normalized correlation is:
 *   C = ∫|ψ|² · W dx / (∫|ψ|² dx · ⟨W⟩)
 *
 * where ⟨W⟩ = ∫W dx / Volume is the mean weight over the domain.
 * C > 1 indicates excess density along the trajectory (possible scarring).
 * C ≈ 1 indicates a uniformly spread eigenstate (Berry conjecture).
 *
 * When disorder is active, orbits are computed on the clean (disorder-free)
 * Hamiltonian. Comparing clean-system orbits against disordered eigenstates
 * detects which scars survive the Anderson perturbation — this is the correct
 * approach for studying scar-localization competition.
 *
 * Reference: Heller (1984), Phys. Rev. Lett. 53, 1515 — original scar paper
 *
 * @module lib/physics/tdse/scarMetric
 */

import { computeScarCorrelationWasm, isAnimationWasmReady } from '@/lib/wasm'

import type { ClassicalTrajectory } from './classicalOrbit'

/**
 * Minimum total grid sites to attempt WASM acceleration for scar correlation.
 * Below this, JS execution is fast enough that WASM boundary overhead dominates.
 */
const WASM_SCAR_MIN_SITES = 1000

/** Result of scar correlation analysis for one eigenstate. */
export interface ScarResult {
  /** Per-orbit scar correlations (C values) */
  orbitCorrelations: number[]
  /** Maximum scar correlation across all orbits */
  maxCorrelation: number
  /** Mean correlation (baseline — should be ~1 for non-scarred states) */
  meanCorrelation: number
  /** Orbit correlation strength: max / mean — values >> 1 suggest scarring */
  orbitCorrelation: number
  /** Index of the orbit with strongest scarring */
  strongestOrbitIndex: number
}

function emptyScarResult(orbits: ClassicalTrajectory[]): ScarResult {
  return {
    orbitCorrelations: orbits.map(() => 0),
    maxCorrelation: 0,
    meanCorrelation: 0,
    orbitCorrelation: 0,
    strongestOrbitIndex: 0,
  }
}

/**
 * Compute scar correlation between an eigenstate density and classical orbits.
 *
 * Algorithm:
 * 1. For each orbit, build a sparse weight function W on the lattice grid
 *    by discretizing orbit points with a Gaussian kernel
 * 2. Compute C = (Σ_i ρ_i · W_i) / (Σ_i ρ_i · ⟨W⟩) where ⟨W⟩ = Σ_i W_i / N
 * 3. Return per-orbit correlations and summary statistics
 *
 * @param densityRe - Eigenstate ψ_re values on the lattice (Float32Array)
 * @param densityIm - Eigenstate ψ_im values on the lattice (Float32Array)
 * @param orbits - Classical trajectories at the eigenstate energy
 * @param gridSize - Per-dimension grid sizes
 * @param spacing - Per-dimension lattice spacings
 * @param tubeWidth - Gaussian tube width ε (spatial units)
 * @returns Scar correlation results
 */
export function computeScarCorrelation(
  densityRe: Float32Array,
  densityIm: Float32Array,
  orbits: ClassicalTrajectory[],
  gridSize: number[],
  spacing: number[],
  tubeWidth: number
): ScarResult {
  const dim = gridSize.length
  let totalSites = 1
  if (dim === 0 || spacing.length < dim || !Number.isFinite(tubeWidth) || tubeWidth <= 0) {
    return emptyScarResult(orbits)
  }
  for (let d = 0; d < dim; d++) {
    const size = gridSize[d]!
    const dx = spacing[d]!
    if (!Number.isInteger(size) || size <= 0 || !Number.isFinite(dx) || dx <= 0) {
      return emptyScarResult(orbits)
    }
    totalSites *= size
    if (!Number.isSafeInteger(totalSites)) return emptyScarResult(orbits)
  }
  if (densityRe.length < totalSites || densityIm.length < totalSites) {
    return emptyScarResult(orbits)
  }

  // ── WASM fast path ──────────────────────────────────────────────────
  if (orbits.length > 0 && totalSites >= WASM_SCAR_MIN_SITES && isAnimationWasmReady()) {
    const wasmResult = tryScarCorrelationWasm(
      densityRe,
      densityIm,
      orbits,
      gridSize,
      spacing,
      tubeWidth,
      dim,
      totalSites
    )
    if (wasmResult) return wasmResult
  }

  // ── JS fallback ─────────────────────────────────────────────────────

  // Precompute probability density |ψ|²
  const density = new Float64Array(totalSites)
  let totalDensity = 0
  for (let i = 0; i < totalSites; i++) {
    const reRaw = densityRe[i]!
    const imRaw = densityIm[i]!
    const re = Number.isFinite(reRaw) ? reRaw : 0
    const im = Number.isFinite(imRaw) ? imRaw : 0
    const rho = re * re + im * im
    density[i] = rho
    totalDensity += rho
  }

  if (totalDensity <= 0) {
    return {
      orbitCorrelations: orbits.map(() => 0),
      maxCorrelation: 0,
      meanCorrelation: 0,
      orbitCorrelation: 0,
      strongestOrbitIndex: 0,
    }
  }

  // Precompute grid coordinate helpers
  const halfGrid = new Float64Array(dim)
  for (let d = 0; d < dim; d++) halfGrid[d] = gridSize[d]! * 0.5 - 0.5

  // Compute strides for N-D → linear index (C-order, last-axis-fastest)
  const strides = new Int32Array(dim)
  strides[dim - 1] = 1
  for (let d = dim - 2; d >= 0; d--) strides[d] = strides[d + 1]! * gridSize[d + 1]!

  const invTwoEpsSq = 1.0 / (2.0 * tubeWidth * tubeWidth)
  const activeSpacing = spacing.slice(0, dim)
  // Kernel radius in grid cells per dimension
  // 3σ captures ~99.7% of the Gaussian kernel weight
  const kernelRadius = Math.max(1, Math.ceil((3 * tubeWidth) / Math.min(...activeSpacing)))

  const orbitCorrelations: number[] = []

  for (const orbit of orbits) {
    // Build sparse weight function W on the grid
    const weight = new Float64Array(totalSites)

    for (const pt of orbit.points) {
      // Convert orbit position to grid coordinates
      const centerGrid = new Float64Array(dim)
      for (let d = 0; d < dim; d++) {
        centerGrid[d] = pt.x[d]! / spacing[d]! + halfGrid[d]!
      }

      // Enumerate nearby grid cells within the kernel
      addGaussianKernel(
        weight,
        centerGrid,
        gridSize,
        strides,
        spacing,
        halfGrid,
        pt.x,
        kernelRadius,
        invTwoEpsSq,
        dim
      )
    }

    // Compute scar correlation
    // C = (Σ ρ·W) / (totalDensity · meanW)  where meanW = ΣW / N
    let dotProduct = 0
    let totalWeight = 0
    for (let i = 0; i < totalSites; i++) {
      dotProduct += density[i]! * weight[i]!
      totalWeight += weight[i]!
    }

    const meanWeight = totalWeight / totalSites
    const denominator = totalDensity * meanWeight

    const C = denominator > 0 ? dotProduct / denominator : 0
    orbitCorrelations.push(C)
  }

  // Summary statistics
  let maxCorrelation = 0
  let strongestOrbitIndex = 0
  let sumCorrelation = 0

  for (let i = 0; i < orbitCorrelations.length; i++) {
    const c = orbitCorrelations[i]!
    sumCorrelation += c
    if (c > maxCorrelation) {
      maxCorrelation = c
      strongestOrbitIndex = i
    }
  }

  const meanCorrelation =
    orbitCorrelations.length > 0 ? sumCorrelation / orbitCorrelations.length : 0
  const orbitCorrelation = meanCorrelation > 0 ? maxCorrelation / meanCorrelation : 0

  return {
    orbitCorrelations,
    maxCorrelation,
    meanCorrelation,
    orbitCorrelation,
    strongestOrbitIndex,
  }
}

/**
 * Add a Gaussian kernel centered at a point to the weight grid.
 *
 * Iterates over nearby grid cells within `radius` and adds
 * exp(-|x_grid - x_orbit|² / (2ε²)) to each cell.
 *
 * Uses recursive iteration over dimensions to handle arbitrary N-D.
 */
function addGaussianKernel(
  weight: Float64Array,
  centerGrid: Float64Array,
  gridSize: number[],
  strides: Int32Array,
  spacing: number[],
  halfGrid: Float64Array,
  orbitPos: Float64Array,
  radius: number,
  invTwoEpsSq: number,
  dim: number
): void {
  // Iterative N-D kernel enumeration using a coordinate stack
  const coords = new Int32Array(dim)
  const lo = new Int32Array(dim)
  const hi = new Int32Array(dim)

  for (let d = 0; d < dim; d++) {
    const center = Math.round(centerGrid[d]!)
    lo[d] = Math.max(0, center - radius)
    hi[d] = Math.min(gridSize[d]! - 1, center + radius)
    coords[d] = lo[d]!
  }

  // Iterate through all cells in the N-D box [lo, hi]
  outer: while (true) {
    // Compute distance² from this grid cell to the orbit point
    let dist2 = 0
    let linearIdx = 0
    for (let d = 0; d < dim; d++) {
      const posGrid = (coords[d]! - halfGrid[d]!) * spacing[d]!
      const dx = posGrid - orbitPos[d]!
      dist2 += dx * dx
      linearIdx += coords[d]! * strides[d]!
    }

    // Add Gaussian contribution
    const w = Math.exp(-dist2 * invTwoEpsSq)
    if (w > 1e-10) {
      weight[linearIdx] = weight[linearIdx]! + w
    }

    // Increment N-D counter (last dimension fastest)
    for (let d = dim - 1; d >= 0; d--) {
      coords[d]!++
      if (coords[d]! <= hi[d]!) break
      if (d === 0) break outer
      coords[d] = lo[d]!
    }
  }
}

// ============================================================================
// WASM Acceleration
// ============================================================================

/**
 * Attempt WASM-accelerated scar correlation. Flattens orbit data into typed
 * arrays for the WASM boundary, then unpacks the result into a ScarResult.
 *
 * @returns ScarResult if WASM succeeded, null otherwise
 */
function tryScarCorrelationWasm(
  densityRe: Float32Array,
  densityIm: Float32Array,
  orbits: ClassicalTrajectory[],
  gridSize: number[],
  spacing: number[],
  tubeWidth: number,
  dim: number,
  _totalSites: number
): ScarResult | null {
  // Count total orbit points for flat buffer sizing
  let totalPoints = 0
  for (const orbit of orbits) totalPoints += orbit.points.length

  // Flatten orbit positions into a single Float64Array: [x0_d0, x0_d1, ..., x1_d0, ...]
  const orbitPointsFlat = new Float64Array(totalPoints * dim)
  const orbitLengths = new Uint32Array(orbits.length)
  let offset = 0
  for (let oi = 0; oi < orbits.length; oi++) {
    const pts = orbits[oi]!.points
    orbitLengths[oi] = pts.length
    for (const pt of pts) {
      for (let d = 0; d < dim; d++) {
        orbitPointsFlat[offset++] = pt.x[d]!
      }
    }
  }

  const gridSizesU32 = new Uint32Array(gridSize)
  const spacingsF64 = new Float64Array(spacing.slice(0, dim))

  const packed = computeScarCorrelationWasm(
    densityRe,
    densityIm,
    gridSizesU32,
    spacingsF64,
    orbitPointsFlat,
    orbitLengths,
    tubeWidth,
    dim
  )

  if (!packed || packed.length < orbits.length + 4) {
    return null
  }
  for (let i = 0; i < orbits.length + 4; i++) {
    if (!Number.isFinite(packed[i]!)) return null
  }

  // Unpack: [corr_0, ..., corr_N, max, mean, orbit_correlation, strongest_idx]
  const numOrbits = orbits.length
  const orbitCorrelations: number[] = []
  for (let i = 0; i < numOrbits; i++) {
    orbitCorrelations.push(packed[i]!)
  }

  return {
    orbitCorrelations,
    maxCorrelation: packed[numOrbits]!,
    meanCorrelation: packed[numOrbits + 1]!,
    orbitCorrelation: packed[numOrbits + 2]!,
    strongestOrbitIndex: Math.round(packed[numOrbits + 3]!),
  }
}
