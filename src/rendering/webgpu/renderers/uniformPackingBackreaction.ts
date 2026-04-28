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
