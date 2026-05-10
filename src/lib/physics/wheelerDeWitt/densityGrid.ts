/**
 * Pack the Wheeler–DeWitt solver output into the project's 96³ rgba16float
 * density-grid texture layout used by the raymarcher.
 *
 * Channel packing (matching the raymarcher sampler expectations):
 *
 *   R = |χ|² / max(|χ|²)                   — normalized probability density.
 *                                            Overlays are NOT mixed here — the shader
 *                                            composites them additively from A so
 *                                            densityGain / densityContrast / empty-skip
 *                                            / adaptive-step all operate on clean
 *                                            physical density.
 *   G = log(R + ε)                         — log of R, range (-∞, 0]. Every color
 *                                            algorithm downstream uses
 *                                            `normalized = clamp((s + 8)/8, 0, 1)`
 *                                            which assumes s ∈ [-8, 0]; storing
 *                                            `log(|χ|²)` directly (which for WdW is
 *                                            often > 0) saturated `normalized = 1`
 *                                            everywhere. Aligning with the convention
 *                                            used by every other compute mode restores
 *                                            density contrast.
 *   B = arg(χ)                             — phase (phase-density / domain colouring).
 *   A = max(streamline overlay, SRMT       — combined overlay alpha ∈ [0, 1]. The shader
 *           sliceK overlay)                  reads this as an additive overlay layer for
 *                                            WdW (mode 9) and composites it AFTER the
 *                                            density-driven alpha. Streamline and SRMT
 *                                            rarely overlap in voxel space so a single
 *                                            `max()` merge is acceptable.
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
import { clamp01 } from '@/lib/math/clamp'
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
 * `sliceK` is the legacy-named slice-density output of
 * `computeSrmtDiagnostic`; it has exactly `Nphi²` entries regardless of
 * clock choice. The true modular-Hamiltonian spectrum is carried separately
 * as `kSpectrum`; this render overlay is the normalized conditional density
 * on the selected clock slice.
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

/** Log-density epsilon — keeps `log(R)` finite at `R = 0` (empty cells). */
const LOG_DENSITY_EPSILON = 1e-10

/** Streamline overlay normalisation floor (same purpose as `DENSITY_MAX_FLOOR`). */
const STREAMLINE_MAX_FLOOR = 1e-20

/**
 * Headroom multiplier applied to the Lorentzian-max when deriving the
 * R-channel render normalisation. Euclidean cells within this headroom
 * of the Lorentzian peak (i.e., `|χ|² < WDW_EUCLIDEAN_RENDER_HEADROOM
 * · max_Lorentzian`) keep a proportional R value; deeper Euclidean
 * cells saturate the R channel at `1.0`. The G channel now carries
 * `log(R)` (the same normalised value, log-transformed), so density-
 * keyed color algorithms (Blackbody, Viridis, Inferno, Density Contours,
 * HDR emission glow, phase materiality, adaptive stepping, …) see the
 * headroom-capped dynamic range rather than the raw physical range.
 * This aligns WdW with the convention used by every other compute mode.
 *
 * Motivation: Vilenkin-BC columns in the deep Euclidean region
 * (specifically `deSitterLargeLambda` with `Λ = 0.8` and
 * `vilenkinTunneling` with `Λ = 0.3`) hit `|χ|² ~ 10²⁰–10³⁰` at cube
 * corners because the Airy `Bi(ζ)` term in Stage-3 has an intrinsic
 * `exp((2/3)|ζ|^{3/2})` growth that the Vilenkin branch policy
 * (`c₂ = +i · c₁`) cannot turn off — this is the unnormalisable
 * "outgoing-only" signature of the tunneling proposal. Using the raw
 * global max `|χ|²` to normalise the R channel would crush every
 * Lorentzian cell to `rho / maxRho ≈ 10⁻²⁰` — i.e., invisible. Capping
 * the R-channel denominator at `headroom · Lorentzian_max` restores
 * Lorentzian-interior visibility while still letting the Euclidean
 * corner saturate brightly.
 *
 * Value `100×` was picked to keep Vilenkin near-turning-surface
 * amplitudes (which can legitimately exceed Lorentzian peak by an
 * order of magnitude before the Bi blowup kicks in — see
 * `analyticFixtures.ts`) inside the un-clamped region, while clipping
 * the asymptotic `Bi` runaway. Tuning higher makes Vilenkin fringes
 * dimmer in Lorentzian; lower creates a visible plateau at the Stage-3
 * overwrite edge.
 */
export const WDW_EUCLIDEAN_RENDER_HEADROOM = 100

/** Inclusive lower bound for the user-adjustable headroom slider. */
export const WDW_HEADROOM_MIN = 1
/** Inclusive upper bound for the user-adjustable headroom slider. */
export const WDW_HEADROOM_MAX = 10_000

/**
 * Clamp an arbitrary headroom value into the valid slider range. The
 * renderer, URL serializer, and store setter all share this helper so
 * an out-of-range URL param or stale preset never leaks into the
 * packer.
 *
 * @param raw - Headroom candidate.
 * @param fallback - Value used when `raw` is not a finite number.
 * @returns Finite value in `[WDW_HEADROOM_MIN, WDW_HEADROOM_MAX]`.
 */
export function clampWdwHeadroom(
  raw: number,
  fallback: number = WDW_EUCLIDEAN_RENDER_HEADROOM
): number {
  const v = Number.isFinite(raw) ? raw : fallback
  if (v < WDW_HEADROOM_MIN) return WDW_HEADROOM_MIN
  if (v > WDW_HEADROOM_MAX) return WDW_HEADROOM_MAX
  return v
}

/**
 * Compute the R-channel render-normalisation max for a Wheeler-DeWitt
 * solver output. Preferred: max `|χ|²` over the Lorentzian mask, scaled
 * by `headroom`. Falls back to the global max when the mask is empty
 * (pathological: every cell Euclidean — can only happen for `Λ > 0`
 * with a grid entirely past the turning surface, which the curated
 * presets avoid). The fallback keeps behaviour byte-identical to the
 * pre-cap renderer for that edge case.
 *
 * Exported so tests can assert the rendering-normalisation invariant
 * directly on the packer's input rather than having to re-derive it
 * from the float16 round-trip of the R channel.
 *
 * @param output - Dense solver output.
 * @param headroom - Lorentzian-max multiplier. Defaults to
 *   {@link WDW_EUCLIDEAN_RENDER_HEADROOM} so call sites that have not
 *   yet been plumbed through keep the legacy behaviour. The final
 *   value is clamped via {@link clampWdwHeadroom}.
 * @returns `maxRho_render` in the same units as `output.maxDensity`.
 */
export function computeWdwRenderMaxRho(
  output: WheelerDeWittSolverOutput,
  headroom: number = WDW_EUCLIDEAN_RENDER_HEADROOM
): number {
  const h = clampWdwHeadroom(headroom)
  const chi = output.chi
  const mask = output.lorentzianMask
  let lorentzianMax = 0
  let globalMax = 0
  for (let i = 0; i < chi.length; i += 2) {
    const re = chi[i] ?? 0
    const im = chi[i + 1] ?? 0
    const d = re * re + im * im
    if (d > globalMax) globalMax = d
    const cellIdx = i >> 1
    if ((mask[cellIdx] ?? 0) !== 0 && d > lorentzianMax) lorentzianMax = d
  }
  const capped = lorentzianMax > 0 ? lorentzianMax * h : globalMax
  // Never exceed the actual solver max: if the Airy-grown Euclidean
  // corner does not reach `headroom · lorentzian_max`, there is nothing
  // to clamp and the packer should use the genuine max (which is what
  // the legacy packer did for every HH / DeWitt / low-Λ preset).
  return Math.max(Math.min(capped, globalMax), DENSITY_MAX_FLOOR)
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
  /** Log-normalised conditional slice density for O(1) per-voxel lookup. */
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
 * check). Log-normalising the conditional slice density once turns the
 * inner-loop lookup into a single array read.
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

/** Options controlling per-frame buffer reuse for the density packer. */
export interface WdwPackScratch {
  /** Pre-allocated RGBA16F byte buffer of length `4·N³`. Overwritten in-place. */
  density?: Uint16Array
  /**
   * Optional companion float32 buffer of length `N³` — when provided, the
   * packer writes the same `overlayAlpha ∈ [0, 1]` value per voxel that
   * lands in the A channel of the RGBA16F density texture. It is the
   * clamped `max(overlayVal, srmtAlpha)` — bit-identical to what the
   * shader samples, just stored as float32 so the animation-tick fast
   * path can compute `A_new = max(baselineA, pulseAlpha)` without having
   * to decode the float16 half back out of the RGBA byte buffer.
   */
  baselineAlpha?: Float32Array
}

export {
  applyWdwPulseAlpha,
  applyWdwPulseAlphaRows,
  resetWdwPulseAlphaRows,
  type WdwPulseAlphaScratch,
} from './worldlinePulseAlpha'

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
 * @param srmtOverlay - Optional SRMT slice-density overlay (may be
 *   `undefined`). When supplied, normalized conditional density is painted
 *   onto the cut plane only — voxels outside the cut disk are unaffected.
 *   Blends via `max(streamline, srmt)` against the streamline overlay so
 *   the two can coexist without destroying either.
 * @param targetGridSize - Size of the output density grid.
 * @param headroom - Lorentzian-max multiplier for R-channel normalization.
 * @param scratch - Optional pre-allocated buffers for reuse. When
 *   `scratch.density` is supplied it is overwritten in place (no fresh
 *   allocation); when `scratch.baselineAlpha` is supplied the packer
 *   also fills it with the per-voxel clamped overlay-A value (same
 *   number packed into the RGBA16F A channel) for the animation-tick
 *   fast path.
 * @returns Upload-ready `Uint16Array` + texture layout.
 */
export function packWdwDensityGrid(
  output: WheelerDeWittSolverOutput,
  overlay: StreamlineOverlay | null,
  srmtOverlay?: WdwSrmtOverlay,
  targetGridSize: number = DENSITY_GRID_SIZE,
  headroom: number = WDW_EUCLIDEAN_RENDER_HEADROOM,
  scratch?: WdwPackScratch
): WdwDensityUpload {
  const N = Math.max(1, Math.round(targetGridSize))
  const total = N * N * N
  const density =
    scratch?.density && scratch.density.length === total * 4
      ? scratch.density
      : new Uint16Array(total * 4)
  const baselineAlpha =
    scratch?.baselineAlpha && scratch.baselineAlpha.length === total ? scratch.baselineAlpha : null

  const [Na, Nphi] = output.gridSize
  const slab = Nphi * Nphi
  // `maxRho` is the R-channel normalisation base — capped to
  // `headroom · max_Lorentzian` so Vilenkin's Airy Bi blowup at cube
  // corners cannot crush the Lorentzian interior into invisibility.
  // See {@link computeWdwRenderMaxRho} for the cap rationale and
  // {@link WDW_EUCLIDEAN_RENDER_HEADROOM} for the default headroom
  // factor; the user-facing "Dynamic Range" slider surfaces `headroom`
  // directly. The G (log-density) channel separately carries the
  // `log(rhoNorm)` (the same capped-normalised value in log space)
  // so density-keyed color algorithms see the same dynamic range the
  // R channel exposes.
  const maxRho = computeWdwRenderMaxRho(output, headroom)
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

        // Overlay (streamline + SRMT) is stored ONLY in the alpha channel.
        // R and G carry the clean physical density so densityGain,
        // densityContrast, empty-space skipping, and adaptive stepping
        // all operate on real |χ|² — overlays are composited separately
        // by the WdW branch in `volumeRaymarchGrid` (positive A). Mixing
        // overlay into R/G previously plateaued highlights on streamlines,
        // shrank Euclidean structure near the SRMT cut, and made
        // densityContrast shape an overlay-contaminated surrogate.
        const overlayVal = overlay ? overlayRaw / maxStreamline : 0
        const overlayAlpha = clamp01(Math.max(overlayVal, srmtAlpha))
        if (baselineAlpha) baselineAlpha[pixelIdx] = overlayAlpha
        const logRho = Math.log(rhoNorm + LOG_DENSITY_EPSILON)
        packRGBA16F(density, pixelIdx, rhoNorm, logRho, phase, overlayAlpha)
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
