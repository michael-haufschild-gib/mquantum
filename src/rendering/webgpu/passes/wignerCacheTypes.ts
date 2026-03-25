/**
 * Types and constants for WignerCacheComputePass.
 *
 * @module rendering/webgpu/passes/wignerCacheTypes
 */

/** Workgroup size for 2D compute dispatches. Must match @workgroup_size(16, 16) in shaders. */
export const WIGNER_WORKGROUP_SIZE = 16

/** Byte size of the Schrödinger uniform buffer (derived from layout). */
export { SCHROEDINGER_UNIFORM_SIZE } from '../renderers/schroedingerLayout'

/** BasisVectors uniform size: 4 vec3f padded to vec4f = 4 × 48 = 192 bytes. */
export const BASIS_UNIFORM_SIZE = 192

/** Offset of the `time` field in SchroedingerUniforms (f32 at offset 908). */
export const TIME_FIELD_OFFSET = 908

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

/** Float index of the coeff array in SchroedingerUniforms (offset 416 bytes). */
export const SCHROEDINGER_COEFF_FLOAT_INDEX = 104

/** Float index of the energy array in SchroedingerUniforms (offset 544 bytes). */
export const SCHROEDINGER_ENERGY_FLOAT_INDEX = 136

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
  outU32: Uint32Array
): void {
  const floatView = new Float32Array(schroedingerData)
  outF32.fill(0)
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
