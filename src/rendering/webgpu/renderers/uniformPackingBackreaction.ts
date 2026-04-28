import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/schroedinger'
import type { SchroedingerConfig } from '@/lib/geometry/extended/types'

import { SCHROEDINGER_LAYOUT } from './schroedingerLayout'

const I = SCHROEDINGER_LAYOUT.index
const D = DEFAULT_SCHROEDINGER_CONFIG

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max))

/**
 * Pack quantum backreaction lensing uniforms (lensing strength, caustic gain,
 * softening) into the SchroedingerUniforms buffer. When the feature is
 * disabled all associated floats are zeroed so the WGSL early-out test
 * (`enabled && strength > 0`) takes the cheap path without reading stale
 * fields. Strength ∈ [0, 3], caustic gain ∈ [0, 2], softening ∈ [0.05, 2].
 */
export function packQuantumBackreaction(
  floatView: Float32Array,
  intView: Int32Array,
  schroedinger: Partial<SchroedingerConfig> | undefined
): void {
  const enabled = schroedinger?.quantumBackreactionLensingEnabled ?? false
  intView[I.quantumBackreactionLensingEnabled] = enabled ? 1 : 0
  floatView[I.quantumBackreactionLensingStrength] = enabled
    ? clamp(
        schroedinger?.quantumBackreactionLensingStrength ?? D.quantumBackreactionLensingStrength,
        0.0,
        3.0
      )
    : 0.0
  floatView[I.quantumBackreactionCausticGain] = enabled
    ? clamp(
        schroedinger?.quantumBackreactionCausticGain ?? D.quantumBackreactionCausticGain,
        0.0,
        2.0
      )
    : 0.0
  floatView[I.quantumBackreactionSoftening] = enabled
    ? clamp(schroedinger?.quantumBackreactionSoftening ?? D.quantumBackreactionSoftening, 0.05, 2.0)
    : 0.0
}

/**
 * Pack bilocal ER-bridge topology uniforms (bridge strength, throat radius,
 * phase-lock weight) into the SchroedingerUniforms buffer. When disabled all
 * associated floats are zeroed so the WGSL `isBilocalERBridgeActive` guard
 * short-circuits without reading stale fields. Strength ∈ [0, 2], throat
 * radius ∈ [0.05, 2], phase-lock ∈ [0, 1].
 */
export function packBilocalERBridge(
  floatView: Float32Array,
  intView: Int32Array,
  schroedinger: Partial<SchroedingerConfig> | undefined
): void {
  const enabled = schroedinger?.bilocalERBridgeEnabled ?? false
  intView[I.bilocalERBridgeEnabled] = enabled ? 1 : 0
  floatView[I.bilocalERBridgeStrength] = enabled
    ? clamp(schroedinger?.bilocalERBridgeStrength ?? D.bilocalERBridgeStrength, 0.0, 2.0)
    : 0.0
  floatView[I.bilocalERBridgeThroatRadius] = enabled
    ? clamp(schroedinger?.bilocalERBridgeThroatRadius ?? D.bilocalERBridgeThroatRadius, 0.05, 2.0)
    : 0.0
  floatView[I.bilocalERBridgePhaseLock] = enabled
    ? clamp(schroedinger?.bilocalERBridgePhaseLock ?? D.bilocalERBridgePhaseLock, 0.0, 1.0)
    : 0.0
}

/**
 * Pack entropic time-shear uniforms (shear strength, filament spatial scale,
 * irreversibility blend) into the SchroedingerUniforms buffer. When disabled
 * all associated floats are zeroed so the WGSL `isEntropicTimeShearActive`
 * guard short-circuits without reading stale fields. Strength ∈ [0, 2],
 * filament scale ∈ [0.1, 4], irreversibility ∈ [0, 1].
 */
export function packEntropicTimeShear(
  floatView: Float32Array,
  intView: Int32Array,
  schroedinger: Partial<SchroedingerConfig> | undefined
): void {
  const enabled = schroedinger?.entropicTimeShearEnabled ?? false
  intView[I.entropicTimeShearEnabled] = enabled ? 1 : 0
  floatView[I.entropicTimeShearStrength] = enabled
    ? clamp(schroedinger?.entropicTimeShearStrength ?? D.entropicTimeShearStrength, 0.0, 2.0)
    : 0.0
  floatView[I.entropicTimeShearFilamentScale] = enabled
    ? clamp(
        schroedinger?.entropicTimeShearFilamentScale ?? D.entropicTimeShearFilamentScale,
        0.1,
        4.0
      )
    : 0.0
  floatView[I.entropicTimeShearIrreversibility] = enabled
    ? clamp(
        schroedinger?.entropicTimeShearIrreversibility ?? D.entropicTimeShearIrreversibility,
        0.0,
        1.0
      )
    : 0.0
}

/**
 * Pack spectral-dimension flow controls into the SchroedingerUniforms buffer.
 * Disabled state deliberately zeroes every field so WGSL `isSpectralDimensionFlowActive`
 * returns false and the helper is an exact identity. Strength ∈ [0, 2],
 * UV dimension ∈ [1.2, 3.5], diffusion scale ∈ [0.05, 3].
 */
export function packSpectralDimensionFlow(
  floatView: Float32Array,
  intView: Int32Array,
  schroedinger: Partial<SchroedingerConfig> | undefined
): void {
  const enabled = schroedinger?.spectralDimensionFlowEnabled ?? false
  intView[I.spectralDimensionFlowEnabled] = enabled ? 1 : 0
  floatView[I.spectralDimensionFlowStrength] = enabled
    ? clamp(
        schroedinger?.spectralDimensionFlowStrength ?? D.spectralDimensionFlowStrength,
        0.0,
        2.0
      )
    : 0.0
  floatView[I.spectralDimensionFlowUvDimension] = enabled
    ? clamp(
        schroedinger?.spectralDimensionFlowUvDimension ?? D.spectralDimensionFlowUvDimension,
        1.2,
        3.5
      )
    : 0.0
  floatView[I.spectralDimensionFlowDiffusionScale] = enabled
    ? clamp(
        schroedinger?.spectralDimensionFlowDiffusionScale ?? D.spectralDimensionFlowDiffusionScale,
        0.05,
        3.0
      )
    : 0.0
}

/**
 * Pack Coleman-De Luccia false-vacuum bubble lens controls. Disabled state
 * zeroes all fields so WGSL `isVacuumBubbleLensActive` returns false and the
 * helper is an exact identity. Strength ∈ [0, 2], wall radius ∈ [0.05, 1.5],
 * wall thickness ∈ [0.02, 0.5], tension/bias ∈ [0, 3].
 */
export function packVacuumBubbleLens(
  floatView: Float32Array,
  intView: Int32Array,
  schroedinger: Partial<SchroedingerConfig> | undefined
): void {
  const enabled = schroedinger?.vacuumBubbleLensEnabled ?? false
  intView[I.vacuumBubbleLensEnabled] = enabled ? 1 : 0
  floatView[I.vacuumBubbleLensStrength] = enabled
    ? clamp(schroedinger?.vacuumBubbleLensStrength ?? D.vacuumBubbleLensStrength, 0.0, 2.0)
    : 0.0
  floatView[I.vacuumBubbleWallRadius] = enabled
    ? clamp(schroedinger?.vacuumBubbleWallRadius ?? D.vacuumBubbleWallRadius, 0.05, 1.5)
    : 0.0
  floatView[I.vacuumBubbleWallThickness] = enabled
    ? clamp(schroedinger?.vacuumBubbleWallThickness ?? D.vacuumBubbleWallThickness, 0.02, 0.5)
    : 0.0
  floatView[I.vacuumBubbleTension] = enabled
    ? clamp(schroedinger?.vacuumBubbleTension ?? D.vacuumBubbleTension, 0.0, 3.0)
    : 0.0
  floatView[I.vacuumBubbleBias] = enabled
    ? clamp(schroedinger?.vacuumBubbleBias ?? D.vacuumBubbleBias, 0.0, 3.0)
    : 0.0
}
