/**
 * Pack the Wheeler–DeWitt solver output into the project's 96³ rgba16float
 * density-grid texture layout used by the raymarcher.
 *
 * Channel packing (matching the raymarcher sampler expectations):
 *
 *   R = |χ|² / max(|χ|²)                  — normalized probability density
 *   G = log(|χ|² + ε)                     — log-density for volumetric exposure
 *   B = arg(χ)                            — phase (used by phase-density color algorithm)
 *   A = max(streamline overlay,            — combined "overlay" channel: the streamline
 *           SRMT sliceK overlay)            WKB intensity is preserved, and when SRMT is
 *                                          enabled the modular spectrum heatmap broadcasts
 *                                          along the clock axis at the cut plane, blending
 *                                          via a per-voxel `max()` so both overlays remain
 *                                          visible at the boundaries they individually
 *                                          populate (they rarely overlap in voxel space).
 *
 * Coordinate mapping (texel-to-physics, independent of world-space cube size):
 *
 *   UVW.x ∈ [0, 1]  →  a ∈ [aMin, aMax]                 (scale-factor axis)
 *   UVW.y ∈ [0, 1]  →  φ₁ ∈ [−phiExtent, +phiExtent]     (inflaton 1)
 *   UVW.z ∈ [0, 1]  →  φ₂ ∈ [−phiExtent, +phiExtent]     (inflaton 2)
 *
 * Every density-grid texel receives a solver sample — a change from the
 * prior packer which mapped `a → (2tx − 1)·R`. Placing a positive-only
 * scale factor inside a symmetric cube left the left half empty and
 * clipped `φ` values beyond `R`. The render cube is purely a framing box;
 * physics coordinates can fill it freely.
 *
 * Sampling uses trilinear interpolation of the complex χ field — re/im
 * interpolated separately, then `|χ|²` and `arg(χ)` computed from the
 * interpolated amplitude. Nearest-neighbour lookup on a 32³ solver grid
 * produced visible quantisation bands in rendered frames; trilinear
 * filtering smooths the wave-packet ridges seen in minisuperspace figures.
 *
 * @module lib/physics/wheelerDeWitt/densityGrid
 */

import { DENSITY_GRID_SIZE } from '@/constants/densityGrid'
import { packRGBA16F } from '@/lib/physics/freeScalar/kSpaceOccupation'

import type { WheelerDeWittSolverOutput } from './solver'
import type { StreamlineOverlay } from './wkbStreamlines'

/** Packed density buffer + metadata consumed by the GPU upload path. */
export interface WdwDensityUpload {
  /** Packed Uint16Array of length `4·N³` (rgba16float bytes). */
  density: Uint16Array
  /** Texture size (always DENSITY_GRID_SIZE). */
  gridSize: number
  /** Bytes per row — `N·8` for rgba16float. */
  bytesPerRow: number
  /** Rows per image — `N`. */
  rowsPerImage: number
}

/**
 * Optional SRMT (Superspace-Relational Modular Time) overlay input.
 *
 * `sliceK` is the diagnostic output of `computeSrmtDiagnostic`; it has
 * exactly `Nphi²` entries regardless of clock choice (the HJ spectrum for
 * `φ`-clocks is naturally `Na·Nphi` long but `buildSliceK` projects it
 * into `Nphi²` for a consistent render-time payload shape).
 *
 * The overlay is broadcast only along the CLOCK axis at the cut plane —
 * voxels farther than ~1 density-texel from
 * `cutIndex / (clockAxisLen − 1)` see zero SRMT contribution. The
 * remaining 2D slice axes index `sliceK` via `[i1·Nphi + i2]` where
 * `(i1, i2)` are derived from the density-texel coordinates perpendicular
 * to the clock.
 */
export interface WdwSrmtOverlay {
  /** `sliceK` from `SrmtResult`. Length must equal `Nphi · Nphi`. */
  sliceK: Float32Array
  /** Slice plane orientation matching the clock selection. */
  slicePlane: 'phi-phi' | 'a-phi2' | 'a-phi1'
  /** Heatmap brightness multiplier ∈ `[0, 1]`. */
  intensity: number
  /** Integer cut index along the clock axis used when generating `sliceK`. */
  cutIndex: number
  /** Size of the clock axis in the solver grid (`Na` for clock `'a'`, `Nphi` otherwise). */
  clockAxisLen: number
  /** `Nphi` — second-dimension size of `sliceK` (so `sliceK[i1·Nphi + i2]`). */
  Nphi: number
}

/**
 * Density-texel half-width (in density-texel units) used to render the
 * SRMT slice as a finite-thickness disk rather than a zero-width plane.
 *
 * Derivation: the raymarcher's volume sampler uses GPU-side trilinear
 * interpolation (WGSL `textureSample` on a 96³ `rgba16float` volume).
 * A zero-width plane at exactly one texel x = cut would alias to zero
 * at most sample positions since the shader's texture-sample coords
 * rarely land exactly on a texel centre. Half-width = `1.5` density
 * texels means the disk spans `[cut − 1.5, cut + 1.5]` in normalised
 * texel units, so every voxel within ±1 texel of the cut plane gets a
 * full-intensity contribution (saturating the trilinear filter) and
 * the ±0.5 spillover absorbs the texel-boundary quantisation without
 * thickening the visible disk beyond ~3 texels = ~3/96 ≈ 3 % of the
 * cube.
 *
 * Lowering below 1.0 would let texel-sampling gaps punch through; at
 * 0.5 the disk vanishes for some render viewpoints. Raising to 2.0+
 * starts visibly blurring the disk into a slab — the "SRMT cut plane"
 * reads more like "SRMT region" than "SRMT slice". Empirically 1.5 is
 * the smallest value that survives the trilinear filter under any
 * camera angle while still reading as a 2D disk. Kept module-local
 * because the GPU sampler's filtering behaviour is not user-tunable.
 */
const SRMT_CUT_HALF_WIDTH_TEXELS = 1.5

/**
 * Density-grid normalisation floor. Prevents divide-by-zero in the
 * `rho / maxRho` normalisation when the solver output is uniformly zero
 * (unusual but possible on degenerate configs).
 */
const DENSITY_MAX_FLOOR = 1e-20

/** Log-density epsilon — keeps `log(ρ_physical)` finite at `ρ = 0`. */
const LOG_DENSITY_EPSILON = 1e-10

/** Streamline overlay normalisation floor (same purpose as `DENSITY_MAX_FLOOR`). */
const STREAMLINE_MAX_FLOOR = 1e-20

function clamp01(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

/**
 * 8-corner trilinear sampler for a complex scalar stored as interleaved
 * `(re, im)` pairs indexed by `[ia, i1, i2]`. Returns `(re, im)` of the
 * interpolated value.
 *
 * The solver's Stage-2 analytic WKB tail guarantees finite, physically
 * scaled amplitudes everywhere; no saturation filtering is needed.
 *
 * @param chi - Interleaved `(re, im)` buffer of length `2·Na·Nphi²`.
 * @param slab - Solver's φ-plane slab size (`Nphi·Nphi`).
 * @param Nphi - φ-grid dimension.
 * @param ia0, ia1 - Bracketing scale-factor indices.
 * @param i10, i11 - Bracketing `φ₁` indices.
 * @param i20, i21 - Bracketing `φ₂` indices.
 * @param wa, w1, w2 - Fractional blend weights in `[0, 1]`.
 * @returns Interpolated complex pair.
 */
/**
 * Module-scoped scratch for {@link sampleChiTrilinear} output. Reusing a
 * single 2-element buffer keeps the packer allocation-free in the hot
 * loop — at 96³ that's ~900k samples per repack, so the per-voxel
 * object literal the previous implementation returned turned SRMT /
 * overlay updates into GC-heavy stalls.
 */
const CHI_SAMPLE_OUT = new Float64Array(2)

function sampleChiTrilinear(
  chi: Float32Array,
  slab: number,
  Nphi: number,
  ia0: number,
  ia1: number,
  i10: number,
  i11: number,
  i20: number,
  i21: number,
  wa: number,
  w1: number,
  w2: number
): Float64Array {
  const iBase000 = 2 * (ia0 * slab + i10 * Nphi + i20)
  const iBase100 = 2 * (ia1 * slab + i10 * Nphi + i20)
  const iBase010 = 2 * (ia0 * slab + i11 * Nphi + i20)
  const iBase110 = 2 * (ia1 * slab + i11 * Nphi + i20)
  const iBase001 = 2 * (ia0 * slab + i10 * Nphi + i21)
  const iBase101 = 2 * (ia1 * slab + i10 * Nphi + i21)
  const iBase011 = 2 * (ia0 * slab + i11 * Nphi + i21)
  const iBase111 = 2 * (ia1 * slab + i11 * Nphi + i21)

  const re000 = chi[iBase000] ?? 0
  const re100 = chi[iBase100] ?? 0
  const re010 = chi[iBase010] ?? 0
  const re110 = chi[iBase110] ?? 0
  const re001 = chi[iBase001] ?? 0
  const re101 = chi[iBase101] ?? 0
  const re011 = chi[iBase011] ?? 0
  const re111 = chi[iBase111] ?? 0

  const im000 = chi[iBase000 + 1] ?? 0
  const im100 = chi[iBase100 + 1] ?? 0
  const im010 = chi[iBase010 + 1] ?? 0
  const im110 = chi[iBase110 + 1] ?? 0
  const im001 = chi[iBase001 + 1] ?? 0
  const im101 = chi[iBase101 + 1] ?? 0
  const im011 = chi[iBase011 + 1] ?? 0
  const im111 = chi[iBase111 + 1] ?? 0

  const re00 = re000 + (re100 - re000) * wa
  const re10 = re010 + (re110 - re010) * wa
  const re01 = re001 + (re101 - re001) * wa
  const re11 = re011 + (re111 - re011) * wa
  const re0 = re00 + (re10 - re00) * w1
  const re1 = re01 + (re11 - re01) * w1

  const im00 = im000 + (im100 - im000) * wa
  const im10 = im010 + (im110 - im010) * wa
  const im01 = im001 + (im101 - im001) * wa
  const im11 = im011 + (im111 - im011) * wa
  const im0 = im00 + (im10 - im00) * w1
  const im1 = im01 + (im11 - im01) * w1

  CHI_SAMPLE_OUT[0] = re0 + (re1 - re0) * w2
  CHI_SAMPLE_OUT[1] = im0 + (im1 - im0) * w2
  return CHI_SAMPLE_OUT
}

/**
 * 8-corner trilinear sampler for a scalar overlay (e.g. WKB streamline
 * intensity). Shares indexing conventions with
 * {@link sampleChiTrilinear}.
 *
 * @param intensity - Scalar buffer indexed by `[ia, i1, i2]`, length
 *   `Na · Nphi²`. Missing cells default to `0`.
 */
function sampleOverlayTrilinear(
  intensity: Float32Array,
  slab: number,
  Nphi: number,
  ia0: number,
  ia1: number,
  i10: number,
  i11: number,
  i20: number,
  i21: number,
  wa: number,
  w1: number,
  w2: number
): number {
  const fetch = (ia: number, i1: number, i2: number): number =>
    intensity[ia * slab + i1 * Nphi + i2] ?? 0
  const s000 = fetch(ia0, i10, i20)
  const s100 = fetch(ia1, i10, i20)
  const s010 = fetch(ia0, i11, i20)
  const s110 = fetch(ia1, i11, i20)
  const s001 = fetch(ia0, i10, i21)
  const s101 = fetch(ia1, i10, i21)
  const s011 = fetch(ia0, i11, i21)
  const s111 = fetch(ia1, i11, i21)
  const s00 = s000 + (s100 - s000) * wa
  const s10 = s010 + (s110 - s010) * wa
  const s01 = s001 + (s101 - s001) * wa
  const s11 = s011 + (s111 - s011) * wa
  const s0 = s00 + (s10 - s00) * w1
  const s1 = s01 + (s11 - s01) * w1
  return s0 + (s1 - s0) * w2
}

/** Precomputed state for the SRMT overlay. `null` when SRMT is disabled. */
interface SrmtOverlayState {
  /** Log-normalised `sliceK` for O(1) per-voxel lookup. */
  norm: Float32Array
  /** Density-texture slice-plane type. */
  plane: WdwSrmtOverlay['slicePlane']
  /** User-controlled intensity multiplier. */
  intensity: number
  /** Side length of the `norm` square (same as `overlay.Nphi`). */
  Nphi: number
  /** Normalised cut coordinate in `[0, 1]` along the clock axis. */
  cutDensity: number
  /** Half-width of the cut disk in the same coord system. */
  cutHalfWidth: number
}

/**
 * Build the precomputed SRMT overlay state. Returns `null` when the
 * overlay is absent or empty (so the hot-loop skip is a single null
 * check). Log-normalising `sliceK` once turns the inner-loop lookup into
 * a single array read.
 *
 * Clock → density-axis mapping (matching the packer's cut-plane detection):
 *
 *   plane `'phi-phi'` (clock `'a'`):    cut along density-x; sliceK indexed by
 *                                       `(φ₁-from-y, φ₂-from-z)`.
 *   plane `'a-phi2'`  (clock `'φ₁'`):   cut along density-y; sliceK indexed by
 *                                       `(a-from-x compressed to Nphi, φ₂-from-z)`.
 *   plane `'a-phi1'`  (clock `'φ₂'`):   cut along density-z; sliceK indexed by
 *                                       `(a-from-x compressed to Nphi, φ₁-from-y)`.
 *
 * The a-compression for `φ`-clocks is produced by `buildSliceK`
 * bin-averaging to `Nphi²`; see `diagnostic.buildSliceK` for the
 * compression kernel rationale.
 */
function buildSrmtState(
  overlay: WdwSrmtOverlay | undefined,
  densityGridSize: number
): SrmtOverlayState | null {
  if (!overlay) return null
  if (overlay.sliceK.length < overlay.Nphi * overlay.Nphi) return null

  const K = overlay.sliceK
  let maxLog = 0
  for (let i = 0; i < K.length; i++) {
    const v = K[i]!
    if (Number.isFinite(v) && v > 0) {
      const lv = Math.log1p(v)
      if (lv > maxLog) maxLog = lv
    }
  }
  const norm = new Float32Array(K.length)
  if (maxLog > 0) {
    const inv = 1 / maxLog
    for (let i = 0; i < K.length; i++) {
      const v = K[i]!
      if (Number.isFinite(v) && v > 0) {
        norm[i] = Math.log1p(v) * inv
      }
    }
  }

  // Map the solver-grid cut index to a normalised [0, 1] density coord.
  const clockLen = Math.max(2, overlay.clockAxisLen)
  const cutN = Math.max(0, Math.min(clockLen - 1, overlay.cutIndex))

  return {
    norm,
    plane: overlay.slicePlane,
    intensity: Math.max(0, Math.min(1, overlay.intensity)),
    Nphi: Math.max(1, overlay.Nphi),
    cutDensity: cutN / (clockLen - 1),
    cutHalfWidth: SRMT_CUT_HALF_WIDTH_TEXELS / densityGridSize,
  }
}

/**
 * Evaluate the SRMT overlay contribution at one density-texel. Returns
 * the alpha value ∈ `[0, 1]` — or `0` if the voxel is outside the cut
 * disk or SRMT is disabled.
 */
function sampleSrmtVoxelAlpha(
  state: SrmtOverlayState,
  txN: number,
  tyN: number,
  tzN: number
): number {
  let clockCoord = txN
  let u1 = tyN
  let u2 = tzN
  if (state.plane === 'a-phi2') {
    clockCoord = tyN
    u1 = txN
    u2 = tzN
  } else if (state.plane === 'a-phi1') {
    clockCoord = tzN
    u1 = txN
    u2 = tyN
  }
  if (Math.abs(clockCoord - state.cutDensity) > state.cutHalfWidth) return 0
  const i1 = Math.min(state.Nphi - 1, Math.max(0, Math.round(u1 * (state.Nphi - 1))))
  const i2 = Math.min(state.Nphi - 1, Math.max(0, Math.round(u2 * (state.Nphi - 1))))
  const v = state.norm[i1 * state.Nphi + i2] ?? 0
  return clamp01(v * state.intensity)
}

/**
 * Pack the solver output + streamline overlay + optional SRMT overlay
 * into the density-texture bytes consumed by the raymarcher.
 *
 * Both overlays fold into the visible R/G (rho / logRho) channels so the
 * shader actually renders them — the A channel is kept as a diagnostic
 * copy that downstream code can sample for non-visual purposes. The R/G
 * sum is clamped to `1` so the overlays cannot blow out the scene.
 *
 * @param output - Dense solver output.
 * @param overlay - Optional WKB streamline intensity (may be `null`).
 * @param srmtOverlay - Optional SRMT `sliceK` overlay (may be
 *   `undefined`). When supplied, the modular spectrum is projected onto
 *   the cut plane only — voxels outside the cut disk are unaffected.
 *   Blends via `max(streamline, srmt)` against the streamline overlay so
 *   the two can coexist without destroying either.
 * @returns Upload-ready `Uint16Array` + texture layout.
 */
export function packWdwDensityGrid(
  output: WheelerDeWittSolverOutput,
  overlay: StreamlineOverlay | null,
  srmtOverlay?: WdwSrmtOverlay,
  targetGridSize: number = DENSITY_GRID_SIZE
): WdwDensityUpload {
  const N = Math.max(1, Math.round(targetGridSize))
  const total = N * N * N
  const density = new Uint16Array(total * 4)

  const [Na, Nphi] = output.gridSize
  const slab = Nphi * Nphi
  const maxRho = Math.max(output.maxDensity, DENSITY_MAX_FLOOR)
  const maxStreamline = overlay ? Math.max(overlay.maxIntensity, STREAMLINE_MAX_FLOOR) : 1

  // Fractional solver-grid index per normalised texture coordinate.
  //   UVW.x ∈ [0, 1] → fractional ia ∈ [0, Na − 1]
  //   UVW.{y, z} ∈ [0, 1] → fractional iPhi ∈ [0, Nphi − 1]
  // Degenerate Na/Nphi == 1 would collapse the index to 0; the solver
  // requires Na, Nphi ≥ 3 so in practice these are safely positive.
  const iaScale = Na > 1 ? Na - 1 : 0
  const iPhiScale = Nphi > 1 ? Nphi - 1 : 0

  const chi = output.chi
  const overlayIntensity = overlay?.intensity ?? null
  const srmtState = buildSrmtState(srmtOverlay, N)

  for (let z = 0; z < N; z++) {
    const tz = (z + 0.5) / N
    const fz = tz * iPhiScale
    const i20 = Math.min(Nphi - 1, Math.max(0, Math.floor(fz)))
    const i21 = Math.min(Nphi - 1, i20 + 1)
    const w2 = fz - i20
    for (let y = 0; y < N; y++) {
      const ty = (y + 0.5) / N
      const fy = ty * iPhiScale
      const i10 = Math.min(Nphi - 1, Math.max(0, Math.floor(fy)))
      const i11 = Math.min(Nphi - 1, i10 + 1)
      const w1 = fy - i10
      for (let x = 0; x < N; x++) {
        const tx = (x + 0.5) / N
        const fx = tx * iaScale
        const ia0 = Math.min(Na - 1, Math.max(0, Math.floor(fx)))
        const ia1 = Math.min(Na - 1, ia0 + 1)
        const wa = fx - ia0
        const pixelIdx = (z * N + y) * N + x

        const chiSample = sampleChiTrilinear(
          chi,
          slab,
          Nphi,
          ia0,
          ia1,
          i10,
          i11,
          i20,
          i21,
          wa,
          w1,
          w2
        )
        const re = chiSample[0]!
        const im = chiSample[1]!

        const rho = re * re + im * im
        const rhoNorm = clamp01(rho / maxRho)
        const phase = re === 0 && im === 0 ? 0 : Math.atan2(im, re)

        const overlayRaw = overlayIntensity
          ? sampleOverlayTrilinear(
              overlayIntensity,
              slab,
              Nphi,
              ia0,
              ia1,
              i10,
              i11,
              i20,
              i21,
              wa,
              w1,
              w2
            )
          : 0

        const srmtAlpha = srmtState ? sampleSrmtVoxelAlpha(srmtState, tx, ty, tz) : 0

        // Mix BOTH the streamline/worldline overlay AND the SRMT disk
        // into the rendered R/G channels so they are actually visible.
        // The raymarcher only reads R (rho) and G (logRho); A is
        // reserved for negative-encoded potential overlays in TDSE.
        const overlayVal = overlay ? overlayRaw / maxStreamline : 0
        const rhoWithOverlay = clamp01(rhoNorm + overlayVal + srmtAlpha)
        const rhoPhysicalBoosted = rhoWithOverlay * maxRho
        const logRho = Math.log(rhoPhysicalBoosted + LOG_DENSITY_EPSILON)

        const streamlineAlpha = clamp01(overlayVal)
        const alpha = streamlineAlpha > srmtAlpha ? streamlineAlpha : srmtAlpha
        packRGBA16F(density, pixelIdx, rhoWithOverlay, logRho, phase, alpha)
      }
    }
  }

  return {
    density,
    gridSize: N,
    bytesPerRow: N * 8,
    rowsPerImage: N,
  }
}
