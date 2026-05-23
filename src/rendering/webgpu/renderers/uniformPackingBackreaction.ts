import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/schroedinger'
import type { SchroedingerConfig } from '@/lib/geometry/extended/types'

import { SCHROEDINGER_LAYOUT } from './schroedingerLayout'

const I = SCHROEDINGER_LAYOUT.index
const D = DEFAULT_SCHROEDINGER_CONFIG

const finiteClamped = (value: number, fallback: number, min: number, max: number): number => {
  const finite = Number.isFinite(value) ? value : fallback
  return Math.max(min, Math.min(finite, max))
}

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
    ? finiteClamped(
        schroedinger?.quantumBackreactionLensingStrength ?? D.quantumBackreactionLensingStrength,
        D.quantumBackreactionLensingStrength,
        0.0,
        3.0
      )
    : 0.0
  floatView[I.quantumBackreactionCausticGain] = enabled
    ? finiteClamped(
        schroedinger?.quantumBackreactionCausticGain ?? D.quantumBackreactionCausticGain,
        D.quantumBackreactionCausticGain,
        0.0,
        2.0
      )
    : 0.0
  floatView[I.quantumBackreactionSoftening] = enabled
    ? finiteClamped(
        schroedinger?.quantumBackreactionSoftening ?? D.quantumBackreactionSoftening,
        D.quantumBackreactionSoftening,
        0.05,
        2.0
      )
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
    ? finiteClamped(
        schroedinger?.bilocalERBridgeStrength ?? D.bilocalERBridgeStrength,
        D.bilocalERBridgeStrength,
        0.0,
        2.0
      )
    : 0.0
  floatView[I.bilocalERBridgeThroatRadius] = enabled
    ? finiteClamped(
        schroedinger?.bilocalERBridgeThroatRadius ?? D.bilocalERBridgeThroatRadius,
        D.bilocalERBridgeThroatRadius,
        0.05,
        2.0
      )
    : 0.0
  floatView[I.bilocalERBridgePhaseLock] = enabled
    ? finiteClamped(
        schroedinger?.bilocalERBridgePhaseLock ?? D.bilocalERBridgePhaseLock,
        D.bilocalERBridgePhaseLock,
        0.0,
        1.0
      )
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
    ? finiteClamped(
        schroedinger?.entropicTimeShearStrength ?? D.entropicTimeShearStrength,
        D.entropicTimeShearStrength,
        0.0,
        2.0
      )
    : 0.0
  floatView[I.entropicTimeShearFilamentScale] = enabled
    ? finiteClamped(
        schroedinger?.entropicTimeShearFilamentScale ?? D.entropicTimeShearFilamentScale,
        D.entropicTimeShearFilamentScale,
        0.1,
        4.0
      )
    : 0.0
  floatView[I.entropicTimeShearIrreversibility] = enabled
    ? finiteClamped(
        schroedinger?.entropicTimeShearIrreversibility ?? D.entropicTimeShearIrreversibility,
        D.entropicTimeShearIrreversibility,
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
    ? finiteClamped(
        schroedinger?.spectralDimensionFlowStrength ?? D.spectralDimensionFlowStrength,
        D.spectralDimensionFlowStrength,
        0.0,
        2.0
      )
    : 0.0
  floatView[I.spectralDimensionFlowUvDimension] = enabled
    ? finiteClamped(
        schroedinger?.spectralDimensionFlowUvDimension ?? D.spectralDimensionFlowUvDimension,
        D.spectralDimensionFlowUvDimension,
        1.2,
        3.5
      )
    : 0.0
  floatView[I.spectralDimensionFlowDiffusionScale] = enabled
    ? finiteClamped(
        schroedinger?.spectralDimensionFlowDiffusionScale ?? D.spectralDimensionFlowDiffusionScale,
        D.spectralDimensionFlowDiffusionScale,
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
    ? finiteClamped(
        schroedinger?.vacuumBubbleLensStrength ?? D.vacuumBubbleLensStrength,
        D.vacuumBubbleLensStrength,
        0.0,
        2.0
      )
    : 0.0
  floatView[I.vacuumBubbleWallRadius] = enabled
    ? finiteClamped(
        schroedinger?.vacuumBubbleWallRadius ?? D.vacuumBubbleWallRadius,
        D.vacuumBubbleWallRadius,
        0.05,
        1.5
      )
    : 0.0
  floatView[I.vacuumBubbleWallThickness] = enabled
    ? finiteClamped(
        schroedinger?.vacuumBubbleWallThickness ?? D.vacuumBubbleWallThickness,
        D.vacuumBubbleWallThickness,
        0.02,
        0.5
      )
    : 0.0
  floatView[I.vacuumBubbleTension] = enabled
    ? finiteClamped(
        schroedinger?.vacuumBubbleTension ?? D.vacuumBubbleTension,
        D.vacuumBubbleTension,
        0.0,
        3.0
      )
    : 0.0
  floatView[I.vacuumBubbleBias] = enabled
    ? finiteClamped(
        schroedinger?.vacuumBubbleBias ?? D.vacuumBubbleBias,
        D.vacuumBubbleBias,
        0.0,
        3.0
      )
    : 0.0
}

/**
 * Pack Born-null weave controls. The feature is analytic-volume only because it
 * needs local ψ and j = Im(conj(ψ)∇ψ), so compute-grid modes force all fields
 * to zero even if UI state is enabled. Disabled/strength-zero state is exact
 * identity in WGSL. Strength ∈ [0, 2], node width ∈ [0.0001, 0.2],
 * circulation ∈ [0, 8].
 */
export function packBornNullWeave(
  floatView: Float32Array,
  intView: Int32Array,
  schroedinger: Partial<SchroedingerConfig> | undefined,
  isUniformComputeMode = false
): void {
  const enabled = !isUniformComputeMode && (schroedinger?.bornNullWeaveEnabled ?? false)
  intView[I.bornNullWeaveEnabled] = enabled ? 1 : 0
  floatView[I.bornNullWeaveStrength] = enabled
    ? finiteClamped(
        schroedinger?.bornNullWeaveStrength ?? D.bornNullWeaveStrength,
        D.bornNullWeaveStrength,
        0.0,
        2.0
      )
    : 0.0
  floatView[I.bornNullWeaveNodeWidth] = enabled
    ? finiteClamped(
        schroedinger?.bornNullWeaveNodeWidth ?? D.bornNullWeaveNodeWidth,
        D.bornNullWeaveNodeWidth,
        0.0001,
        0.2
      )
    : 0.0
  floatView[I.bornNullWeaveCirculation] = enabled
    ? finiteClamped(
        schroedinger?.bornNullWeaveCirculation ?? D.bornNullWeaveCirculation,
        D.bornNullWeaveCirculation,
        0.0,
        8.0
      )
    : 0.0
}
