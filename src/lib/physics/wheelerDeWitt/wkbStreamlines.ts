/**
 * WKB classical-cosmology streamlines on the Wheeler–DeWitt solution.
 *
 * ## Physics role
 *
 * In the Lorentzian region (`U < 0`) the Wheeler–DeWitt wavefunction `χ`
 * factorises in the WKB ansatz as
 *
 *   `χ(a, φ) ≈ R(a, φ) · exp(i S(a, φ) / ℏ)`
 *
 * with slowly-varying amplitude `R` and rapidly-oscillating phase `S`.
 * Because `χ = a^{3/2} Ψ` with real positive `a^{3/2}`, the physical
 * Hamilton-Jacobi phase is simply `S_phys = ℏ · arg(χ)` — the `a^{3/2}`
 * Jacobi factor affects `R` but not `arg(χ)`.
 *
 * This module integrates classical trajectories along the flow
 * `q̇ = ∇_q S_vis` of a *visualisation* phase field
 *
 *   `S_vis(a, φ) = a^{3/2} · arg(χ)`.
 *
 * The `a^{3/2}` rescaling is a rendering choice, not a physical
 * correction: multiplying by `a^{3/2}` steepens the gradient along the
 * scale-factor axis relative to the inflaton axes, which pushes
 * streamlines out of the near-`a_min` bunching region and across the
 * Lorentzian interior. Physical WKB streamlines (`S_phys`) are available
 * via `extractWkbPhase` in `srmt/wkbPhase.ts`; this module renders the
 * rescaled version because it reads better on screen.
 *
 * ## Integrator
 *
 * Explicit RK4 with a per-step CFL cap ({@link MAX_STEP_CELLS}) so
 * resolution refinements do not change trajectory shape beyond
 * finite-difference discretisation error. Each step fetches the phase via
 * a precomputed `arg(χ)` table keyed by grid cell — so the only `atan2`
 * call in the hot path is the one-time precompute in
 * {@link integrateWkbTrajectories}.
 *
 * ## Output
 *
 * Streamlines are rendered as Gaussian splats on a per-voxel additive
 * intensity buffer — the "streamline overlay" texture channel. Every
 * trajectory accumulates unit-weight splats along its point sequence.
 * The pulse variant multiplies by a time-varying Gaussian so a travelling
 * pulse appears in the rendered volume.
 *
 * @module lib/physics/wheelerDeWitt/wkbStreamlines
 */

import type { WheelerDeWittSolverOutput } from './solver'

/** Streamline overlay: additive density (`|ψ|²`-like) on the solver grid. */
export interface StreamlineOverlay {
  /** Additive per-voxel intensity, indexed `[ia, iPhi1, iPhi2]` row-major. */
  intensity: Float32Array
  /** Maximum intensity in the overlay — useful for normalization on the consumer side. */
  maxIntensity: number
}

/** Configuration for the streamline integrator. */
export interface WkbStreamlineInput {
  /** Number of seeds per axis (total seeds = `density²`). */
  density: number
  /** Maximum integration steps per streamline. */
  maxSteps: number
  /** Gaussian splat radius, in grid cells. */
  splatRadius: number
}

/** Default integrator configuration. */
export const DEFAULT_STREAMLINE_INPUT: WkbStreamlineInput = {
  density: 6,
  maxSteps: 96,
  splatRadius: 0.9,
}

/**
 * Maximum per-rk4-step displacement in cells. Keeps the integrator stable
 * regardless of gradient magnitude or grid resolution. Without this cap,
 * typical WdW solutions (`∂S/∂a ≈ 40` at default grid) would advance tens
 * of cells per step and exit the grid in one stride.
 */
const MAX_STEP_CELLS = 0.5

/** RK4 step scale constant. Dimensionless τ-units; tuned empirically. */
const RK4_STEP_SCALE = 0.5

/** Streamline termination threshold: below this per-axis Δ in cells, stop. */
const STALL_DELTA_THRESHOLD = 1e-4

/** Splat weight threshold below which we skip writing (saves Math.exp calls). */
const SPLAT_WEIGHT_EPSILON = 1e-6

/**
 * Precomputed `arg(χ)` lookup table indexed `[ia, i1, i2]` row-major. A
 * single pass over the solver grid populates this once; every RK4 step
 * then does 6 O(1) array reads instead of 6 `Math.atan2` calls.
 *
 * Cells with `|χ| = 0` are assigned phase `0`, matching the fallback in
 * the legacy sampler (the gradient through a hole in `χ` was ill-defined
 * there too — the code's long-standing choice is "zero phase at zero
 * amplitude").
 */
interface ArgTable {
  /** `arg(χ)` in radians, length `Na · Nphi²`. */
  arg: Float32Array
  /** Grid dimensions `[Na, Nphi, Nphi]`. */
  gridSize: [number, number, number]
}

/**
 * Build the `arg(χ)` lookup from the solver output. Cost: one pass over
 * the grid with one `Math.atan2` per complex cell — amortised across all
 * trajectories.
 */
function buildArgTable(output: WheelerDeWittSolverOutput): ArgTable {
  const [Na, Nphi] = output.gridSize
  const slab = Nphi * Nphi
  const arg = new Float32Array(Na * slab)
  const chi = output.chi
  for (let ia = 0; ia < Na; ia++) {
    const aBase = ia * slab
    for (let i1 = 0; i1 < Nphi; i1++) {
      const rowBase = aBase + i1 * Nphi
      for (let i2 = 0; i2 < Nphi; i2++) {
        const cellIdx = rowBase + i2
        const re = chi[2 * cellIdx] ?? 0
        const im = chi[2 * cellIdx + 1] ?? 0
        arg[cellIdx] = re === 0 && im === 0 ? 0 : Math.atan2(im, re)
      }
    }
  }
  return { arg, gridSize: output.gridSize }
}

/**
 * Nearest-neighbour `arg(χ)` lookup. Callers (`gradS` → `rk4Step`) pass
 * fractional indices; typed-array lookup with non-integer keys returns
 * `undefined` and collapses the phase to `0`, stalling the integrator.
 * Round to the nearest grid cell to preserve the historical behaviour of
 * the pre-precompute sampler (guarantees bit-for-bit trajectory parity).
 */
function sampleArg(table: ArgTable, ia: number, i1: number, i2: number): number {
  const [Na, Nphi] = table.gridSize
  const iaR = Math.round(ia)
  const i1R = Math.round(i1)
  const i2R = Math.round(i2)
  if (iaR < 0 || iaR >= Na || i1R < 0 || i1R >= Nphi || i2R < 0 || i2R >= Nphi) return 0
  const slab = Nphi * Nphi
  return table.arg[iaR * slab + i1R * Nphi + i2R] ?? 0
}

/** Unwrap-aware central difference: shortest arc between two phases. */
function wrappedDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

/**
 * Evaluate the Hamilton–Jacobi flow velocity of
 * `S_vis = a^{3/2} · arg(χ)` in GRID-INDEX SPACE. Returns
 * `(d(ia)/dτ, d(i1)/dτ, d(i2)/dτ)`.
 *
 * Conversion: the classical-flow equation is `dq/dτ = ∂S/∂q` in physical
 * coordinates, so `d(index)/dτ = (∂S/∂q) / dx`. The finite-difference
 * `∂S/∂x ≈ wrappedDiff / (2·dx)` then gives
 * `d(index)/dτ = wrappedDiff / (2·dx²)`.
 *
 * Legacy bug (fixed): the original implementation returned `∂S/∂q` in
 * physical units and added it directly to index coordinates inside
 * `rk4Step`, mixing units. Per-step advance scaled linearly with
 * `dphi/da`, breaking resolution invariance and distorting trajectory
 * shape along the φ axes. The current form is properly unit-consistent.
 *
 * See module docstring for the meaning of the `a^{3/2}` factor.
 */
function gradS(
  table: ArgTable,
  aMin: number,
  ia: number,
  i1: number,
  i2: number,
  da: number,
  dphi: number
): [number, number, number] {
  const [Na, Nphi] = table.gridSize
  if (ia < 1 || ia >= Na - 1 || i1 < 1 || i1 >= Nphi - 1 || i2 < 1 || i2 >= Nphi - 1) {
    return [0, 0, 0]
  }
  const aCur = aMin + ia * da
  const aNext = aMin + (ia + 1) * da
  const aPrev = aMin + (ia - 1) * da
  const aNext3half = Math.pow(aNext, 1.5)
  const aPrev3half = Math.pow(aPrev, 1.5)
  const aCur3half = Math.pow(aCur, 1.5)

  const sNextA = aNext3half * sampleArg(table, ia + 1, i1, i2)
  const sPrevA = aPrev3half * sampleArg(table, ia - 1, i1, i2)
  const sNext1 = aCur3half * sampleArg(table, ia, i1 + 1, i2)
  const sPrev1 = aCur3half * sampleArg(table, ia, i1 - 1, i2)
  const sNext2 = aCur3half * sampleArg(table, ia, i1, i2 + 1)
  const sPrev2 = aCur3half * sampleArg(table, ia, i1, i2 - 1)

  const dSda = wrappedDiff(sNextA, sPrevA) / (2 * da * da)
  const dSdp1 = wrappedDiff(sNext1, sPrev1) / (2 * dphi * dphi)
  const dSdp2 = wrappedDiff(sNext2, sPrev2) / (2 * dphi * dphi)
  return [dSda, dSdp1, dSdp2]
}

/** Check whether a (floating-point) grid position is in the Lorentzian region. */
function isLorentzian(
  output: WheelerDeWittSolverOutput,
  ia: number,
  i1: number,
  i2: number
): boolean {
  const [Na, Nphi] = output.gridSize
  const iai = Math.round(ia)
  const i1i = Math.round(i1)
  const i2i = Math.round(i2)
  if (iai < 0 || iai >= Na || i1i < 0 || i1i >= Nphi || i2i < 0 || i2i >= Nphi) return false
  const idx = iai * Nphi * Nphi + i1i * Nphi + i2i
  return (output.lorentzianMask[idx] ?? 0) !== 0
}

/**
 * RK4 step along `∇S_vis` on the grid. Returns new `(ia, i1, i2)` in
 * grid-index units.
 *
 * `gradS` returns index-space velocity; `stepScale` is dimensionless
 * (τ-units). If the gradient is large compared with the grid spacing, the
 * per-step displacement is rescaled to cap at `MAX_STEP_CELLS`, making
 * the integrator CFL-bounded.
 */
function rk4Step(
  table: ArgTable,
  aMin: number,
  ia: number,
  i1: number,
  i2: number,
  da: number,
  dphi: number,
  stepScale: number
): [number, number, number] {
  const k1 = gradS(table, aMin, ia, i1, i2, da, dphi)
  const k2 = gradS(
    table,
    aMin,
    ia + 0.5 * stepScale * k1[0],
    i1 + 0.5 * stepScale * k1[1],
    i2 + 0.5 * stepScale * k1[2],
    da,
    dphi
  )
  const k3 = gradS(
    table,
    aMin,
    ia + 0.5 * stepScale * k2[0],
    i1 + 0.5 * stepScale * k2[1],
    i2 + 0.5 * stepScale * k2[2],
    da,
    dphi
  )
  const k4 = gradS(
    table,
    aMin,
    ia + stepScale * k3[0],
    i1 + stepScale * k3[1],
    i2 + stepScale * k3[2],
    da,
    dphi
  )
  let dx0 = (stepScale * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])) / 6
  let dx1 = (stepScale * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])) / 6
  let dx2 = (stepScale * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])) / 6

  // CFL cap: rescale to keep the Euclidean-norm displacement ≤ MAX_STEP_CELLS.
  const mag = Math.sqrt(dx0 * dx0 + dx1 * dx1 + dx2 * dx2)
  if (mag > MAX_STEP_CELLS) {
    const s = MAX_STEP_CELLS / mag
    dx0 *= s
    dx1 *= s
    dx2 *= s
  }
  return [ia + dx0, i1 + dx1, i2 + dx2]
}

/** Splat a Gaussian intensity bump centered at `(ia, i1, i2)`. */
function splat(
  intensity: Float32Array,
  gridSize: [number, number, number],
  ia: number,
  i1: number,
  i2: number,
  radius: number,
  weight: number
): void {
  const [Na, Nphi] = gridSize
  const r = Math.ceil(radius * 2.5)
  const iaC = Math.round(ia)
  const i1C = Math.round(i1)
  const i2C = Math.round(i2)
  const sigma2 = Math.max(1e-6, radius * radius)
  for (let ka = -r; ka <= r; ka++) {
    const iap = iaC + ka
    if (iap < 0 || iap >= Na) continue
    for (let k1 = -r; k1 <= r; k1++) {
      const i1p = i1C + k1
      if (i1p < 0 || i1p >= Nphi) continue
      for (let k2 = -r; k2 <= r; k2++) {
        const i2p = i2C + k2
        if (i2p < 0 || i2p >= Nphi) continue
        const dist2 = ka * ka + k1 * k1 + k2 * k2
        const w = weight * Math.exp(-0.5 * (dist2 / sigma2))
        if (w < SPLAT_WEIGHT_EPSILON) continue
        const idx = iap * Nphi * Nphi + i1p * Nphi + i2p
        intensity[idx] = (intensity[idx] ?? 0) + w
      }
    }
  }
}

/** A per-seed integrated trajectory in grid-index space. */
export interface WkbTrajectory {
  /** Sequence of grid-index points `(ia, i1, i2)`. Length ≤ `maxSteps`. */
  points: Array<[number, number, number]>
}

/**
 * Integrate all WKB streamlines on a Wheeler–DeWitt solution and return
 * the raw trajectories (no splat). Streamlines stop upon leaving the
 * Lorentzian region, stalling (per-axis `|Δ| < STALL_DELTA_THRESHOLD`),
 * or leaving the grid. Seed iteration order is deterministic and matches
 * {@link buildStaticOverlay}, so consumers can rebuild the exact legacy
 * overlay bit-for-bit by chaining the two calls.
 *
 * @param output - Solver output.
 * @param input - Streamline config.
 * @returns List of trajectories; skipped-seed entries are omitted (not
 *          pushed as empty trajectories).
 */
export function integrateWkbTrajectories(
  output: WheelerDeWittSolverOutput,
  input: WkbStreamlineInput = DEFAULT_STREAMLINE_INPUT
): WkbTrajectory[] {
  const [Na, Nphi] = output.gridSize
  const da = (output.aMax - output.aMin) / (Na - 1)
  const dphi = (2 * output.phiExtent) / (Nphi - 1)
  const density = Math.max(2, Math.min(16, input.density | 0))

  const argTable = buildArgTable(output)

  const trajectories: WkbTrajectory[] = []

  for (let sa = 1; sa < Na - 1; sa += Math.max(1, Math.floor((Na - 2) / density))) {
    for (let s1 = 0; s1 < density; s1++) {
      const i1Seed = 1 + Math.floor(((Nphi - 3) * (s1 + 0.5)) / density)
      for (let s2 = 0; s2 < density; s2++) {
        const i2Seed = 1 + Math.floor(((Nphi - 3) * (s2 + 0.5)) / density)

        if (!isLorentzian(output, sa, i1Seed, i2Seed)) continue

        let ia = sa
        let i1 = i1Seed
        let i2 = i2Seed

        const points: Array<[number, number, number]> = []

        for (let step = 0; step < input.maxSteps; step++) {
          if (!isLorentzian(output, ia, i1, i2)) break
          points.push([ia, i1, i2])

          const [ian, i1n, i2n] = rk4Step(
            argTable,
            output.aMin,
            ia,
            i1,
            i2,
            da,
            dphi,
            RK4_STEP_SCALE
          )
          const delta = Math.abs(ian - ia) + Math.abs(i1n - i1) + Math.abs(i2n - i2)
          if (delta < STALL_DELTA_THRESHOLD) break
          ia = ian
          i1 = i1n
          i2 = i2n
          if (ia < 0 || ia >= Na || i1 < 0 || i1 >= Nphi || i2 < 0 || i2 >= Nphi) break
        }

        if (points.length > 0) trajectories.push({ points })
      }
    }
  }

  return trajectories
}

/**
 * Build the static streamline-ridge overlay (legacy visual) from a list
 * of trajectories. Every point is splatted with unit weight — the result
 * is bit-for-bit identical to {@link integrateWkbStreamlines} when the
 * trajectory list comes from {@link integrateWkbTrajectories} called with
 * the same solver output and input.
 *
 * @param trajectories - Raw trajectories from `integrateWkbTrajectories`.
 * @param splatRadius - Gaussian splat radius in grid cells.
 * @param gridSize - Solver grid size `[Na, Nphi, Nphi]`.
 * @returns Per-voxel additive overlay.
 */
export function buildStaticOverlay(
  trajectories: WkbTrajectory[],
  splatRadius: number,
  gridSize: [number, number, number]
): StreamlineOverlay {
  const [Na, Nphi] = gridSize
  const total = Na * Nphi * Nphi
  const intensity = new Float32Array(total)

  for (const traj of trajectories) {
    for (const [ia, i1, i2] of traj.points) {
      splat(intensity, gridSize, ia, i1, i2, splatRadius, 1.0)
    }
  }

  let maxIntensity = 0
  for (let i = 0; i < total; i++) {
    const v = intensity[i] ?? 0
    if (v > maxIntensity) maxIntensity = v
  }
  return { intensity, maxIntensity }
}

/**
 * Build a traveling-pulse overlay: at each trajectory point with
 * normalized progress `t_p = p / max(1, M − 1)`, splat with Gaussian
 * weight `exp(−((t_p − animTime)/pulseWidth)²)`.
 *
 * `animTime` is expected to be in `[0, 1]`; callers animating with a
 * speed multiplier should pass `frac(speed · t)` externally.
 * `maxIntensity` is fixed to `1.0` so downstream normalization does not
 * flash as the pulse moves — the raw Gaussian peak is 1 by construction,
 * and a constant normalization denominator keeps the shader output
 * stable across frames.
 *
 * @param trajectories - Raw trajectories from `integrateWkbTrajectories`.
 * @param animTime - Normalized pulse position in `[0, 1]`.
 * @param pulseWidth - Gaussian width in normalized progress units.
 * @param splatRadius - Gaussian splat radius in grid cells.
 * @param gridSize - Solver grid size `[Na, Nphi, Nphi]`.
 * @returns Per-voxel additive pulse overlay with `maxIntensity = 1.0`.
 */
export function buildPulseOverlay(
  trajectories: WkbTrajectory[],
  animTime: number,
  pulseWidth: number,
  splatRadius: number,
  gridSize: [number, number, number]
): StreamlineOverlay {
  const [Na, Nphi] = gridSize
  const total = Na * Nphi * Nphi
  const intensity = new Float32Array(total)
  const invW = 1 / Math.max(1e-6, pulseWidth)

  for (const traj of trajectories) {
    const M = traj.points.length
    const denom = Math.max(1, M - 1)
    for (let p = 0; p < M; p++) {
      const [ia, i1, i2] = traj.points[p]!
      const tp = p / denom
      const x = (tp - animTime) * invW
      const weight = Math.exp(-x * x)
      if (weight < SPLAT_WEIGHT_EPSILON) continue
      splat(intensity, gridSize, ia, i1, i2, splatRadius, weight)
    }
  }

  return { intensity, maxIntensity: 1.0 }
}

/**
 * Integrate WKB streamlines on a Wheeler–DeWitt solution and return an
 * additive per-voxel overlay. Streamlines stop upon leaving the
 * Lorentzian region or the grid. The overlay is intended to be added to
 * the density channel during texture packing.
 *
 * Preserved for backward compatibility — implemented on top of
 * {@link integrateWkbTrajectories} + {@link buildStaticOverlay}. Output
 * bytes are bit-identical to the pre-split implementation.
 *
 * @param output - Solver output.
 * @param input - Streamline config.
 * @returns Per-voxel additive overlay.
 */
export function integrateWkbStreamlines(
  output: WheelerDeWittSolverOutput,
  input: WkbStreamlineInput = DEFAULT_STREAMLINE_INPUT
): StreamlineOverlay {
  const trajectories = integrateWkbTrajectories(output, input)
  return buildStaticOverlay(trajectories, input.splatRadius, output.gridSize)
}

/**
 * Post-hoc test helper: for every cell touched by the overlay
 * (`intensity > 0`), confirm the cell's Lorentzian mask bit is set.
 * Returns the fraction of touched cells that violate Lorentzian gating.
 */
export function countEuclideanOverlayLeakage(
  overlay: StreamlineOverlay,
  output: WheelerDeWittSolverOutput
): { total: number; leaked: number; fraction: number } {
  let total = 0
  let leaked = 0
  for (let i = 0; i < overlay.intensity.length; i++) {
    const v = overlay.intensity[i] ?? 0
    if (v <= SPLAT_WEIGHT_EPSILON) continue
    total++
    if ((output.lorentzianMask[i] ?? 0) === 0) leaked++
  }
  return { total, leaked, fraction: total > 0 ? leaked / total : 0 }
}
