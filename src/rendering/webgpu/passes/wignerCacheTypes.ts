/**
 * Types and constants for WignerCacheComputePass.
 *
 * @module rendering/webgpu/passes/wignerCacheTypes
 */

/** Workgroup size for 2D compute dispatches. Must match @workgroup_size(16, 16) in shaders. */
export const WIGNER_WORKGROUP_SIZE = 16

/** Minimum Wigner cache resolution accepted at runtime. */
export const WIGNER_CACHE_MIN_RESOLUTION = 128
/** Maximum Wigner cache resolution accepted at runtime. */
export const WIGNER_CACHE_MAX_RESOLUTION = 1024
/** Default Wigner cache resolution for invalid or omitted input. */
export const WIGNER_CACHE_DEFAULT_RESOLUTION = 256

/** Clamp and integerize runtime Wigner cache resolution input. */
export function normalizeWignerCacheResolution(
  resolution: number | undefined,
  fallback = WIGNER_CACHE_DEFAULT_RESOLUTION
): number {
  const finiteFallback = Number.isFinite(fallback) ? fallback : WIGNER_CACHE_DEFAULT_RESOLUTION
  const value = Number.isFinite(resolution) ? resolution : finiteFallback
  return Math.max(
    WIGNER_CACHE_MIN_RESOLUTION,
    Math.min(WIGNER_CACHE_MAX_RESOLUTION, Math.round(value!))
  )
}

/** Byte size of the Schrödinger uniform buffer (derived from layout). */
export { SCHROEDINGER_UNIFORM_SIZE } from '../renderers/schroedingerLayout'

/** BasisVectors uniform size: 4 vec3f padded to vec4f = 4 × 48 = 192 bytes. */
export const BASIS_UNIFORM_SIZE = 192

/** Byte offset of the `time` field in SchroedingerUniforms (derived from layout). */
import { SCHROEDINGER_LAYOUT as _LAYOUT } from '../renderers/schroedingerLayout'
export const TIME_FIELD_OFFSET = _LAYOUT.byteOffset.time

/** Configuration for the Wigner cache compute pass. */
export interface WignerCacheComputeConfig {
  /** Grid resolution (128-1024, default: 256) */
  gridSize?: number
  /** Number of dimensions (3-11) */
  dimension: number
  /** Quantum mode */
  quantumMode?: 'harmonicOscillator' | 'hydrogenND' | 'hydrogenNDCoupled'
  /** Number of HO superposition terms (1-8) */
  termCount?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
}

/** Update flags returned by needsUpdate() for granular dispatch control. */
export interface WignerUpdateFlags {
  /** Whether spatial precompute needs to run */
  spatial: boolean
  /** Whether reconstruction needs to run */
  reconstruct: boolean
}

// ───────────────────────────────────────────────────────────────────────────
// Capacity invariants — must stay in sync with the WGSL struct declarations
// in wignerSpatial.wgsl.ts (`array<vec4i, 14>`) and wignerReconstruct.wgsl.ts
// (`array<vec4f, 29>`). Any change here without updating the WGSL — or vice
// versa — silently corrupts the cross-term Wigner reconstruction.
// ───────────────────────────────────────────────────────────────────────────

/** Maximum HO superposition term count. Matches the `termCount` setter clamp
 *  in `schroedingerSlice.setSchroedingerTermCount` and the `TdseConfig.termCount`
 *  `1 | 2 | 3 | 4 | 5 | 6 | 7 | 8` literal union. */
export const MAX_WIGNER_TERM_COUNT = 8

/** Maximum cross-pair count: C(MAX_WIGNER_TERM_COUNT, 2) = 28. */
export const MAX_WIGNER_CROSS_PAIRS = (MAX_WIGNER_TERM_COUNT * (MAX_WIGNER_TERM_COUNT - 1)) / 2

/** Maximum texture-array layer count: 2 pairs per layer → ceil(28/2) = 14.
 *  Mirrors the `array<vec4i, 14>` in `WignerSpatialParams`. */
export const MAX_WIGNER_CROSS_LAYERS = Math.ceil(MAX_WIGNER_CROSS_PAIRS / 2)

/** Cross-pair info for CPU-side coefficient computation. */
export interface CrossPairInfo {
  termJ: number
  termK: number
  layerIndex: number
  /** 0 = .rg channel, 1 = .ba channel */
  channelOffset: number
}

/**
 * Build cross-pair mapping for two-phase Wigner cache pipeline.
 * Assigns each cross pair (j,k) to a layer and channel (2 pairs per layer: .rg and .ba).
 */
export function buildCrossPairMap(termCount: number): {
  crossPairs: CrossPairInfo[]
  numCrossLayers: number
} {
  if (!Number.isSafeInteger(termCount) || termCount < 1 || termCount > MAX_WIGNER_TERM_COUNT) {
    throw new Error(
      `buildCrossPairMap: termCount=${termCount} exceeds MAX_WIGNER_TERM_COUNT=` +
        `${MAX_WIGNER_TERM_COUNT}. Update the Wigner WGSL cross-term uniform layouts before ` +
        `supporting larger superpositions.`
    )
  }

  const crossPairs: CrossPairInfo[] = []
  let pairIdx = 0

  for (let j = 0; j < termCount; j++) {
    for (let k = j + 1; k < termCount; k++) {
      const layerIndex = Math.floor(pairIdx / 2)
      const channelOffset = pairIdx % 2
      crossPairs.push({ termJ: j, termK: k, layerIndex, channelOffset })
      pairIdx++
    }
  }

  return { crossPairs, numCrossLayers: Math.ceil(crossPairs.length / 2) }
}

/** Float index of the coeff array in SchroedingerUniforms (derived from layout). */
export const SCHROEDINGER_COEFF_FLOAT_INDEX = _LAYOUT.index.coeff

/** Float index of the energy array in SchroedingerUniforms (derived from layout). */
export const SCHROEDINGER_ENERGY_FLOAT_INDEX = _LAYOUT.index.energy

/**
 * Read a packed f32 from a vec4f array at a given base offset.
 * Element k is at vec4f[k/4] component [k%4].
 */
export function getPackedF32(view: Float32Array, baseFloatIdx: number, k: number): number {
  const vecIdx = Math.floor(k / 4)
  const compIdx = k % 4
  return view[baseFloatIdx + vecIdx * 4 + compIdx]!
}

/**
 * Compute phased cross-pair coefficients for Wigner reconstruction.
 *
 * For each cross pair (j, k):
 *   phasedRe = 2 * Re(c_j* c_k * e^{-i*(E_j - E_k)*t})
 *   phasedIm = 2 * Im(c_j* c_k * e^{-i*(E_j - E_k)*t})
 *
 * The factor of 2 is baked in so the GPU shader just does multiply-accumulate.
 */
export function computeReconstructCoefficients(
  crossPairs: CrossPairInfo[],
  schroedingerData: ArrayBuffer,
  time: number,
  timeScale: number,
  outF32: Float32Array,
  outU32: Uint32Array,
  crossTermsEnabled = true
): void {
  if (crossPairs.length > MAX_WIGNER_CROSS_PAIRS) {
    // The WGSL `WignerReconstructParams.pairData` is `array<vec4f, 29>` and
    // the CPU-side `outF32` buffer (`WIGNER_RECONSTRUCT_PARAMS_SIZE = 480`
    // bytes = 120 floats = 4-float header + 29 vec4f slots) is sized for
    // exactly 29 pairs. Writing beyond MAX_WIGNER_CROSS_PAIRS silently
    // truncates (Float32Array writes past byteLength are no-ops) and the
    // GPU reads stale / zero bytes for the overflow pairs, corrupting the
    // reconstructed Wigner function without any runtime signal. Fail loudly.
    throw new Error(
      `computeReconstructCoefficients: crossPairs.length=${crossPairs.length} exceeds ` +
        `MAX_WIGNER_CROSS_PAIRS=${MAX_WIGNER_CROSS_PAIRS}. This means termCount > ` +
        `MAX_WIGNER_TERM_COUNT=${MAX_WIGNER_TERM_COUNT}, which is unsupported by the ` +
        `current WGSL struct layout (wignerReconstruct.wgsl.ts: array<vec4f, 29>).`
    )
  }
  const floatView = new Float32Array(schroedingerData)
  outF32.fill(0)
  if (!crossTermsEnabled) {
    outU32[0] = 0
    return
  }
  outU32[0] = crossPairs.length

  const t = time * timeScale

  for (let i = 0; i < crossPairs.length; i++) {
    const pair = crossPairs[i]!
    const { termJ, termK, layerIndex, channelOffset } = pair

    const cjRe = floatView[SCHROEDINGER_COEFF_FLOAT_INDEX + termJ * 4]!
    const cjIm = floatView[SCHROEDINGER_COEFF_FLOAT_INDEX + termJ * 4 + 1]!
    const ckRe = floatView[SCHROEDINGER_COEFF_FLOAT_INDEX + termK * 4]!
    const ckIm = floatView[SCHROEDINGER_COEFF_FLOAT_INDEX + termK * 4 + 1]!

    const Ej = getPackedF32(floatView, SCHROEDINGER_ENERGY_FLOAT_INDEX, termJ)
    const Ek = getPackedF32(floatView, SCHROEDINGER_ENERGY_FLOAT_INDEX, termK)

    const prodRe = cjRe * ckRe + cjIm * ckIm
    const prodIm = cjRe * ckIm - cjIm * ckRe

    const phaseAngle = -(Ej - Ek) * t
    const timeCos = Math.cos(phaseAngle)
    const timeSin = Math.sin(phaseAngle)

    const phasedRe = prodRe * timeCos - prodIm * timeSin
    const phasedIm = prodRe * timeSin + prodIm * timeCos

    const offset = 4 + i * 4 // Skip header (16 bytes = 4 floats)
    outF32[offset + 0] = 2.0 * phasedRe
    outF32[offset + 1] = 2.0 * phasedIm
    outF32[offset + 2] = layerIndex
    outF32[offset + 3] = channelOffset
  }
}
