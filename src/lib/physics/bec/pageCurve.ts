/**
 * Page curve + quantum-extremal-island helpers for the analog BEC sonic horizon.
 *
 * References
 * ----------
 * - Penington, "Entanglement Wedge Reconstruction and the Information Paradox"
 *   (JHEP 2020, arXiv:1905.08255).
 * - Almheiri, Engelhardt, Marolf, Maxfield, "The entropy of bulk quantum fields
 *   and the entanglement wedge of an evaporating black hole" (JHEP 2019,
 *   arXiv:1905.08762).
 * - Almheiri et al., "Replica Wormholes and the Entropy of Hawking Radiation"
 *   (JHEP 2020, arXiv:1911.12333) — "island formula".
 *
 * Context for this module
 * -----------------------
 * For the waterfall BEC analog black hole we reuse the existing `sonicHorizon`
 * infrastructure to obtain κ, T_H, c_s0. The goal here is a *purely classical*
 * bookkeeping layer that computes the Page curve
 *
 *     S_page(t) = min(S_therm(t), S_BH)
 *
 * where S_therm is the thermal radiation entropy integrated over time and
 * S_BH = A_h / (4 G_eff) is the Bekenstein–Hawking entropy of the analog
 * horizon. The island formula resolves the apparent unitarity puzzle by
 * taking the minimum across saddle points; here we adopt the two-saddle
 * simplification (Penington/Almheiri 2020).
 *
 * All functions are pure, deterministic, and allocation-free where a caller
 * provides a pre-sized buffer.
 *
 * @module lib/physics/bec/pageCurve
 */

/** Default Stefan–Boltzmann-like coefficient for a 2-D horizon radiating into a 1-D outgoing channel. */
export const DEFAULT_SB_COEFFICIENT = (4 * Math.PI * Math.PI) / 45

/** Maximum supported ring-buffer capacity. Picked to keep worst-case memory bounded. */
export const MAX_PAGE_CURVE_BUFFER = 4096

/**
 * Inputs to {@link bekensteinHawkingEntropy}.
 */
export interface BekensteinHawkingInputs {
  /** Analog horizon area A_h (same units the caller uses for cross-section). */
  areaH: number
  /** Effective Newton constant G_eff > 0. */
  gEff: number
}

/**
 * Analog Bekenstein–Hawking entropy S_BH = A_h / (4·G_eff).
 *
 * Returns 0 when either input is non-finite or non-positive. Keeping the
 * function total (never NaN/Infinity) lets downstream Page-curve code pass
 * through `Math.min` without extra guards.
 *
 * @param inputs - horizon area and effective Newton constant.
 * @returns non-negative entropy, finite.
 */
export function bekensteinHawkingEntropy({ areaH, gEff }: BekensteinHawkingInputs): number {
  if (!Number.isFinite(areaH) || !Number.isFinite(gEff)) return 0
  if (areaH <= 0 || gEff <= 0) return 0
  return areaH / (4 * gEff)
}

/**
 * Inputs to {@link thermalEntropyDensityRate}.
 */
export interface ThermalEntropyRateInputs {
  /** Analog Hawking temperature T_H (natural units, ℏ = k_B = 1). */
  tH: number
  /** Analog horizon area A_h. */
  areaH: number
  /** Asymptotic sound speed c_s0 (> 0). */
  cs0: number
  /** Stefan–Boltzmann-like coefficient. Defaults to {@link DEFAULT_SB_COEFFICIENT}. */
  sbCoefficient?: number
}

/**
 * Rate of thermal entropy production dS_therm/dt for a 2-surface analog horizon
 * radiating into an outgoing channel:
 *
 *     dS/dt = sbCoefficient · T_H³ · A_h / c_s0²
 *
 * Units-wise this is the Stefan–Boltzmann analog adapted to the acoustic
 * metric; the c_s0² in the denominator is the analog of c² in the GR version.
 *
 * Returns 0 when any input is pathological. That keeps the time-integration
 * monotonic and avoids NaN propagation into the ring buffer.
 *
 * @param inputs - thermodynamic inputs.
 * @returns non-negative rate, finite.
 */
export function thermalEntropyDensityRate({
  tH,
  areaH,
  cs0,
  sbCoefficient = DEFAULT_SB_COEFFICIENT,
}: ThermalEntropyRateInputs): number {
  if (!Number.isFinite(tH) || !Number.isFinite(areaH) || !Number.isFinite(cs0)) return 0
  if (tH <= 0 || areaH <= 0 || cs0 <= 0) return 0
  const rate = sbCoefficient * tH * tH * tH * (areaH / (cs0 * cs0))
  return Number.isFinite(rate) && rate > 0 ? rate : 0
}

/**
 * Inputs to {@link accumulateThermalEntropy}.
 */
export interface AccumulateInputs {
  /** Previously accumulated S_therm (non-negative). */
  previous: number
  /** Rate at the previous sample (non-negative). */
  rateOld: number
  /** Rate at the new sample (non-negative). */
  rateNew: number
  /** Elapsed time between samples (> 0 to integrate). */
  dt: number
}

/**
 * Trapezoid-rule accumulation: S_new = S_prev + ½·(rateOld + rateNew)·dt.
 *
 * Clamps non-finite or negative inputs to 0 and enforces monotone
 * non-decreasing output. The ring buffer stores the running total so the HUD
 * can render `S_therm(t)` without reintegrating each frame.
 *
 * @param inputs - previous accumulator, rates, and dt.
 * @returns new accumulated entropy, ≥ `previous`.
 */
export function accumulateThermalEntropy({
  previous,
  rateOld,
  rateNew,
  dt,
}: AccumulateInputs): number {
  if (!Number.isFinite(previous) || previous < 0) return 0
  if (!Number.isFinite(dt) || dt <= 0) return previous
  const rA = Number.isFinite(rateOld) && rateOld > 0 ? rateOld : 0
  const rB = Number.isFinite(rateNew) && rateNew > 0 ? rateNew : 0
  const delta = 0.5 * (rA + rB) * dt
  const next = previous + (delta > 0 ? delta : 0)
  return Number.isFinite(next) ? next : previous
}

/**
 * Island formula (spherical-symmetry simplification):
 *
 *     S_page(t) = min(S_therm(t), S_BH)
 *
 * When S_BH = 0 (no horizon) returns S_therm — there is no competing saddle
 * so the "minimum" is degenerate. This also matches acceptance bar #8.
 *
 * @param sTherm - thermal entropy at time t (non-negative).
 * @param sBH - Bekenstein–Hawking entropy (non-negative; 0 means "no saddle").
 * @returns Page entropy at time t.
 */
export function pageEntropy(sTherm: number, sBH: number): number {
  const a = Number.isFinite(sTherm) && sTherm >= 0 ? sTherm : 0
  const b = Number.isFinite(sBH) && sBH > 0 ? sBH : Infinity
  return a < b ? a : b
}

/**
 * Inputs to {@link islandRadius}.
 */
export interface IslandRadiusInputs {
  /** Current thermal entropy (≥ 0). */
  sTherm: number
  /** Bekenstein–Hawking entropy (≥ 0). When 0 the island never grows. */
  sBH: number
  /** User-selectable maximum island fraction of the supersonic region (0..1). */
  dMaxFrac: number
  /** Supersonic region spatial extent along the flow axis (≥ 0). */
  supersonicExtent: number
}

/**
 * Island radius d*(t) model:
 *
 *     d*(t) = d*_max · max(0, 1 − S_BH / S_therm(t))
 *
 * So d*(t_Page) = 0 at the Page time (when S_therm = S_BH), and d* → d*_max
 * as S_therm → ∞. Before t_Page (S_therm < S_BH) the formula saturates to 0.
 *
 * @param inputs - entropies + island-size caps.
 * @returns non-negative island radius in the same units as `supersonicExtent`.
 */
export function islandRadius({
  sTherm,
  sBH,
  dMaxFrac,
  supersonicExtent,
}: IslandRadiusInputs): number {
  if (!Number.isFinite(sTherm) || sTherm <= 0) return 0
  if (!Number.isFinite(sBH) || sBH <= 0) return 0
  if (!Number.isFinite(dMaxFrac) || dMaxFrac <= 0) return 0
  if (!Number.isFinite(supersonicExtent) || supersonicExtent <= 0) return 0
  const frac = Math.max(0, Math.min(1, dMaxFrac))
  const core = 1 - sBH / sTherm
  if (!Number.isFinite(core) || core <= 0) return 0
  return frac * supersonicExtent * core
}

/**
 * Inputs to {@link isInsideIsland}.
 */
export interface IslandMembershipInputs {
  /** Voxel coordinate (D-vector, length ≥ `centroid.length`). */
  voxelPos: readonly number[]
  /** Horizon centroid in the same frame. */
  centroid: readonly number[]
  /** Current island radius (≥ 0). */
  radius: number
}

/**
 * Point-in-island test. Returns `false` when radius = 0 (pre-Page-time) or
 * when dimensions mismatch. Uses squared distance to avoid a sqrt.
 *
 * @param inputs - coordinates + radius.
 * @returns true iff the voxel lies within the island ball.
 */
export function isInsideIsland({ voxelPos, centroid, radius }: IslandMembershipInputs): boolean {
  if (!Number.isFinite(radius) || radius <= 0) return false
  if (voxelPos.length === 0 || voxelPos.length !== centroid.length) return false
  const n = voxelPos.length
  let sq = 0
  for (let i = 0; i < n; i++) {
    const dx = (voxelPos[i] ?? 0) - (centroid[i] ?? 0)
    sq += dx * dx
  }
  return sq <= radius * radius
}

/**
 * Inputs to {@link horizonPlaneArea}.
 */
export interface HorizonPlaneAreaInputs {
  /** Per-dimension grid size (N_d). */
  gridSize: readonly number[]
  /** Per-dimension spacing (a_d). */
  spacing: readonly number[]
  /** Flow axis perpendicular to the horizon plane (default 0). */
  flowAxis?: number
  /** If the horizon doesn't exist (e.g. M<1 everywhere), caller passes `false`. */
  horizonExists: boolean
}

/**
 * Cross-sectional area of the analog horizon plane for the waterfall profile.
 *
 * The waterfall flow is one-dimensional along `flowAxis` so the M=1 level set
 * is a plane and its area is `∏_{d ≠ flowAxis} N_d · a_d`. When
 * `horizonExists` is false we return 0 — the Page-curve store then yields
 * S_BH = 0 and S_page = S_therm, satisfying acceptance bar #8.
 *
 * For turbulent BEC flows (vortex dynamics, post-collapse) this approximation
 * breaks down and a voxel-count/isosurface extraction would be needed. We
 * document the limitation here rather than implement unused complexity.
 *
 * @param inputs - grid sizing + horizon existence.
 * @returns non-negative cross-section area.
 */
export function horizonPlaneArea({
  gridSize,
  spacing,
  flowAxis = 0,
  horizonExists,
}: HorizonPlaneAreaInputs): number {
  if (!horizonExists) return 0
  const dim = Math.min(gridSize.length, spacing.length)
  if (dim < 2) return 0
  if (!Number.isInteger(flowAxis) || flowAxis < 0 || flowAxis >= dim) return 0
  let area = 1
  for (let d = 0; d < dim; d++) {
    if (d === flowAxis) continue
    const n = gridSize[d] ?? 0
    const a = spacing[d] ?? 0
    if (!Number.isFinite(n) || !Number.isFinite(a) || n <= 0 || a <= 0) return 0
    area *= n * a
  }
  return area
}

/**
 * Voxel-counting horizon area from a precomputed Mach-number field. Used by
 * integration tests and by callers who want to cross-check
 * {@link horizonPlaneArea} against a populated field with actual curvature.
 *
 * Implements the coarea identity
 *
 *     ∫ δ(M(x) − 1) |∇M(x)| dV = Area({M = 1}),
 *
 * approximated by summing over shell voxels (|M−1| < ε), weighting each by
 * `|∇M|` from a central finite difference, and dividing by the shell width
 * `2ε`. For the waterfall profile this matches the analytic cross-section
 * within 20 % when ε ≈ 0.05 and the grid resolves the horizon.
 *
 * @param machField - flat array of Mach numbers (C-order, last axis fastest).
 * @param gridSize - per-dim extents; product must equal machField.length.
 * @param spacing - per-dim spacings.
 * @param epsilon - half-width of the shell (default 0.05).
 * @returns non-negative area estimate; 0 on input-shape mismatch.
 */
export function voxelCountHorizonArea(
  machField: Float32Array | Float64Array | readonly number[],
  gridSize: readonly number[],
  spacing: readonly number[],
  epsilon = 0.05
): number {
  const dim = Math.min(gridSize.length, spacing.length)
  if (dim < 1) return 0
  let total = 1
  for (let d = 0; d < dim; d++) {
    const n = gridSize[d] ?? 0
    if (!Number.isFinite(n) || n <= 0) return 0
    total *= n
  }
  if (total !== machField.length) return 0
  let voxelVol = 1
  for (let d = 0; d < dim; d++) voxelVol *= spacing[d] ?? 0
  if (!Number.isFinite(voxelVol) || voxelVol <= 0) return 0

  // C-order strides: last axis fastest.
  const strides = new Array<number>(dim)
  strides[dim - 1] = 1
  for (let d = dim - 2; d >= 0; d--) strides[d] = strides[d + 1]! * (gridSize[d + 1] ?? 1)

  const lo = 1 - Math.abs(epsilon)
  const hi = 1 + Math.abs(epsilon)
  let weightedVolume = 0
  const N = machField.length
  for (let idx = 0; idx < N; idx++) {
    const m = machField[idx] ?? 0
    if (!Number.isFinite(m) || m < lo || m > hi) continue
    // Central-difference gradient magnitude; periodic wrap along each axis.
    let gradSq = 0
    for (let d = 0; d < dim; d++) {
      const sD = strides[d]!
      const Nd = gridSize[d]!
      const coord = Math.floor(idx / sD) % Nd
      const plus = coord === Nd - 1 ? idx - sD * (Nd - 1) : idx + sD
      const minus = coord === 0 ? idx + sD * (Nd - 1) : idx - sD
      const mP = machField[plus] ?? 0
      const mM = machField[minus] ?? 0
      const dM = (mP - mM) / (2 * (spacing[d] ?? 1))
      gradSq += dM * dM
    }
    const gradMag = Math.sqrt(gradSq)
    weightedVolume += gradMag * voxelVol
  }
  const thickness = 2 * Math.abs(epsilon)
  return thickness > 0 ? weightedVolume / thickness : 0
}

/**
 * One stored Page-curve sample. Ring-buffer entries are plain records so the
 * buffer can be a struct-of-arrays for GC-free updates.
 */
export interface PageCurveSample {
  /** Simulation time t. */
  t: number
  /** Accumulated thermal entropy S_therm(t). */
  sTherm: number
  /** Page entropy S_page(t). */
  sPage: number
  /** Island radius d*(t) in spatial units. */
  islandRadius: number
}

/**
 * Fixed-capacity ring buffer for page curve samples. All storage is allocated
 * once at construction to avoid per-frame GC churn (PRD constraint).
 */
export interface PageCurveRingBuffer {
  /** Capacity (≤ {@link MAX_PAGE_CURVE_BUFFER}). */
  readonly capacity: number
  /** Number of live samples in [0, capacity]. */
  count: number
  /** Next write index mod capacity. */
  head: number
  /** Column: time values. */
  readonly t: Float64Array
  /** Column: thermal entropies. */
  readonly sTherm: Float64Array
  /** Column: Page entropies. */
  readonly sPage: Float64Array
  /** Column: island radii. */
  readonly islandRadius: Float64Array
}

/**
 * Allocate a zeroed ring buffer.
 *
 * @param capacity - positive integer, clamped to {@link MAX_PAGE_CURVE_BUFFER}.
 * @returns buffer with all columns pre-allocated.
 */
export function createPageCurveBuffer(capacity: number): PageCurveRingBuffer {
  const cap = Math.max(
    1,
    Math.min(MAX_PAGE_CURVE_BUFFER, Math.floor(Number.isFinite(capacity) ? capacity : 512))
  )
  return {
    capacity: cap,
    count: 0,
    head: 0,
    t: new Float64Array(cap),
    sTherm: new Float64Array(cap),
    sPage: new Float64Array(cap),
    islandRadius: new Float64Array(cap),
  }
}

/**
 * Push a sample into the ring buffer (in place). Overwrites the oldest entry
 * once the buffer is full.
 *
 * @param buf - target ring buffer.
 * @param sample - new sample.
 */
export function pushPageCurveSample(buf: PageCurveRingBuffer, sample: PageCurveSample): void {
  const i = buf.head
  buf.t[i] = sample.t
  buf.sTherm[i] = sample.sTherm
  buf.sPage[i] = sample.sPage
  buf.islandRadius[i] = sample.islandRadius
  buf.head = (i + 1) % buf.capacity
  if (buf.count < buf.capacity) buf.count += 1
}

/** Reset the buffer's logical length without reallocating. */
export function resetPageCurveBuffer(buf: PageCurveRingBuffer): void {
  buf.count = 0
  buf.head = 0
  buf.t.fill(0)
  buf.sTherm.fill(0)
  buf.sPage.fill(0)
  buf.islandRadius.fill(0)
}

/**
 * Read a sample by logical index (0 = oldest, count-1 = newest).
 *
 * @param buf - ring buffer.
 * @param logicalIndex - position in chronological order.
 * @returns sample or null when out of range.
 */
export function getPageCurveSample(
  buf: PageCurveRingBuffer,
  logicalIndex: number
): PageCurveSample | null {
  if (logicalIndex < 0 || logicalIndex >= buf.count) return null
  const start = buf.count < buf.capacity ? 0 : buf.head
  const i = (start + logicalIndex) % buf.capacity
  return {
    t: buf.t[i] ?? 0,
    sTherm: buf.sTherm[i] ?? 0,
    sPage: buf.sPage[i] ?? 0,
    islandRadius: buf.islandRadius[i] ?? 0,
  }
}

/**
 * Locate the Page time t_Page — the first time at which S_therm crosses S_BH.
 *
 * Uses linear interpolation between adjacent samples. Returns null when the
 * buffer is empty, S_BH is 0/NaN, or the crossing never occurs.
 *
 * @param buf - ring buffer of Page curve samples.
 * @param sBH - the (constant) horizon entropy threshold.
 * @returns interpolated t_Page or null.
 */
export function pageTime(buf: PageCurveRingBuffer, sBH: number): number | null {
  if (!Number.isFinite(sBH) || sBH <= 0) return null
  if (buf.count < 2) return null
  let prevSample = getPageCurveSample(buf, 0)
  if (!prevSample) return null
  for (let i = 1; i < buf.count; i++) {
    const curr = getPageCurveSample(buf, i)
    if (!curr) continue
    const prev = prevSample
    if (prev.sTherm < sBH && curr.sTherm >= sBH) {
      const denom = curr.sTherm - prev.sTherm
      if (!Number.isFinite(denom) || denom <= 0) return curr.t
      const frac = (sBH - prev.sTherm) / denom
      return prev.t + frac * (curr.t - prev.t)
    }
    prevSample = curr
  }
  return null
}
