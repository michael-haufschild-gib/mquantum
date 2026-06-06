import type { SchroedingerConfig } from '@/lib/geometry/extended/types'

import { SCHROEDINGER_LAYOUT } from '../schroedingerLayout'

const I = SCHROEDINGER_LAYOUT.index
const CD_HORIZON_RADIUS = I.cdR
const CD_COMPRESSION_K = I.cdK
const CD_SHELL_GAIN = I.cdGain
const CD_SHELL_CENTER = I.cdCenter
const CD_SHELL_WIDTH = I.cdWidth
const CD_HOLONOMY_STRENGTH = I.cdHolonomy
const CD_HOLONOMY_MIX = I.cdMix

const finiteClamped = (
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number => {
  const finite = typeof value === 'number' && Number.isFinite(value) ? value : fallback
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
    ? finiteClamped(schroedinger?.quantumBackreactionLensingStrength, 1.0, 0.0, 3.0)
    : 0.0
  floatView[I.quantumBackreactionCausticGain] = enabled
    ? finiteClamped(schroedinger?.quantumBackreactionCausticGain, 0.6, 0.0, 2.0)
    : 0.0
  floatView[I.quantumBackreactionSoftening] = enabled
    ? finiteClamped(schroedinger?.quantumBackreactionSoftening, 0.45, 0.05, 2.0)
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
    ? finiteClamped(schroedinger?.bilocalERBridgeStrength, 0.8, 0.0, 2.0)
    : 0.0
  floatView[I.bilocalERBridgeThroatRadius] = enabled
    ? finiteClamped(schroedinger?.bilocalERBridgeThroatRadius, 0.45, 0.05, 2.0)
    : 0.0
  floatView[I.bilocalERBridgePhaseLock] = enabled
    ? finiteClamped(schroedinger?.bilocalERBridgePhaseLock, 0.7, 0.0, 1.0)
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
    ? finiteClamped(schroedinger?.entropicTimeShearStrength, 0.8, 0.0, 2.0)
    : 0.0
  floatView[I.entropicTimeShearFilamentScale] = enabled
    ? finiteClamped(schroedinger?.entropicTimeShearFilamentScale, 1.25, 0.1, 4.0)
    : 0.0
  floatView[I.entropicTimeShearIrreversibility] = enabled
    ? finiteClamped(schroedinger?.entropicTimeShearIrreversibility, 0.6, 0.0, 1.0)
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
    ? finiteClamped(schroedinger?.spectralDimensionFlowStrength, 0.75, 0.0, 2.0)
    : 0.0
  floatView[I.spectralDimensionFlowUvDimension] = enabled
    ? finiteClamped(schroedinger?.spectralDimensionFlowUvDimension, 2.0, 1.2, 3.5)
    : 0.0
  floatView[I.spectralDimensionFlowDiffusionScale] = enabled
    ? finiteClamped(schroedinger?.spectralDimensionFlowDiffusionScale, 0.7, 0.05, 3.0)
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
    ? finiteClamped(schroedinger?.vacuumBubbleLensStrength, 0.75, 0.0, 2.0)
    : 0.0
  floatView[I.vacuumBubbleWallRadius] = enabled
    ? finiteClamped(schroedinger?.vacuumBubbleWallRadius, 0.55, 0.05, 1.5)
    : 0.0
  floatView[I.vacuumBubbleWallThickness] = enabled
    ? finiteClamped(schroedinger?.vacuumBubbleWallThickness, 0.12, 0.02, 0.5)
    : 0.0
  floatView[I.vacuumBubbleTension] = enabled
    ? finiteClamped(schroedinger?.vacuumBubbleTension, 0.9, 0.0, 3.0)
    : 0.0
  floatView[I.vacuumBubbleBias] = enabled
    ? finiteClamped(schroedinger?.vacuumBubbleBias, 0.8, 0.0, 3.0)
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
    ? finiteClamped(schroedinger?.bornNullWeaveStrength, 0.9, 0.0, 2.0)
    : 0.0
  floatView[I.bornNullWeaveNodeWidth] = enabled
    ? finiteClamped(schroedinger?.bornNullWeaveNodeWidth, 0.025, 0.0001, 0.2)
    : 0.0
  floatView[I.bornNullWeaveCirculation] = enabled
    ? finiteClamped(schroedinger?.bornNullWeaveCirculation, 2.0, 0.0, 8.0)
    : 0.0
}

/**
 * Pack HydrogenND causal-diamond modular orbital controls. The effect is
 * analytic hydrogenND-only in WGSL; disabled state zeroes every field so the
 * psi helper returns identity coordinates and unit horizon gain. Horizon
 * radius ∈ [0.5, 20], compression k ∈ [0, 4], shell gain ∈ [0, 8], shell
 * center ∈ [0.05, 0.98], shell width ∈ [0.01, 0.35], holonomy strength ∈ [0, 8],
 * holonomy mix ∈ [0, 1].
 */
export function packCausalDiamondModularOrbital(
  floatView: Float32Array,
  schroedinger: Partial<SchroedingerConfig> | undefined,
  isHydrogenNDMode: boolean
): void {
  if (!isHydrogenNDMode) return

  if (!(schroedinger?.causalDiamondEnabled ?? false)) {
    floatView[CD_HORIZON_RADIUS] =
      floatView[CD_COMPRESSION_K] =
      floatView[CD_SHELL_GAIN] =
      floatView[CD_SHELL_CENTER] =
      floatView[CD_SHELL_WIDTH] =
      floatView[CD_HOLONOMY_STRENGTH] =
      floatView[CD_HOLONOMY_MIX] =
        0.0
    return
  }

  floatView[CD_HORIZON_RADIUS] = finiteClamped(
    schroedinger?.causalDiamondHorizonRadius,
    3.6,
    0.5,
    20.0
  )
  floatView[CD_COMPRESSION_K] = finiteClamped(
    schroedinger?.causalDiamondCompressionK,
    0.85,
    0.0,
    4.0
  )
  floatView[CD_SHELL_GAIN] = finiteClamped(schroedinger?.causalDiamondShellGain, 2.4, 0.0, 8.0)
  floatView[CD_SHELL_CENTER] = finiteClamped(
    schroedinger?.causalDiamondShellCenter,
    0.82,
    0.05,
    0.98
  )
  floatView[CD_SHELL_WIDTH] = finiteClamped(
    schroedinger?.causalDiamondShellWidth,
    0.075,
    0.01,
    0.35
  )
  floatView[CD_HOLONOMY_STRENGTH] = finiteClamped(
    schroedinger?.causalDiamondHolonomyStrength,
    0.0,
    0.0,
    8.0
  )
  floatView[CD_HOLONOMY_MIX] = finiteClamped(schroedinger?.causalDiamondHolonomyMix, 0.0, 0.0, 1.0)
}
