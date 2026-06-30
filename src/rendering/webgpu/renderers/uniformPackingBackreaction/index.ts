import {
  BIFURCATION_HORIZON_RANGES,
  DEFAULT_BIFURCATION_HORIZON_CONFIG,
} from '@/lib/geometry/extended/bifurcationHorizon'
import { COHERENCE_HORIZON_RANGES } from '@/lib/geometry/extended/coherenceHorizon'
import {
  DEFAULT_HILBERT_POLYA_CONFIG,
  HILBERT_POLYA_RANGES,
} from '@/lib/geometry/extended/hilbertPolya'
import {
  DEFAULT_MODULAR_KNOT_CONFIG,
  MODULAR_KNOT_RANGES,
} from '@/lib/geometry/extended/modularKnot'
import {
  DEFAULT_RIEMANN_ZETA_CONFIG,
  RIEMANN_ZETA_RANGES,
} from '@/lib/geometry/extended/riemannZeta'
import type { SchroedingerConfig } from '@/lib/geometry/extended/types'
import { BIFURCATION_T_MAX, BIFURCATION_U_HALF } from '@/lib/physics/bifurcationHorizon'
import { tangherliniHorizonRadius } from '@/lib/physics/coherenceHorizon'
import {
  hagedornPartitionGain,
  RIEMANN_DEFAULT_RADIAL,
  RIEMANN_WORLD_SCALE,
} from '@/lib/physics/riemannZeta'
import { getWdwZetaSpec } from '@/lib/physics/wdwZeta/registry'

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
 * Pack harmonic-oscillator Hermite triple-cocycle inflation controls. Disabled
 * state zeroes all fields so WGSL term rotation is exact identity.
 */
export function packHermiteCocycle(
  floatView: Float32Array,
  intView: Int32Array,
  schroedinger: Partial<SchroedingerConfig> | undefined,
  isHarmonicOscillatorMode: boolean
): void {
  const enabled =
    isHarmonicOscillatorMode && (schroedinger?.hermiteCocycleInflationEnabled ?? false)
  intView[I.hermiteCocycleInflationEnabled] = enabled ? 1 : 0
  if (!enabled) {
    floatView[I.hermiteCocycleInflationStrength] =
      floatView[I.hermiteCocycleShellRadius] =
      floatView[I.hermiteCocycleInflationTwist] =
        0.0
    return
  }
  floatView[I.hermiteCocycleInflationStrength] = finiteClamped(
    schroedinger?.hermiteCocycleInflationStrength,
    0.9,
    0.0,
    2.0
  )
  floatView[I.hermiteCocycleShellRadius] = finiteClamped(
    schroedinger?.hermiteCocycleShellRadius,
    0.72,
    0.1,
    2.0
  )
  floatView[I.hermiteCocycleInflationTwist] = finiteClamped(
    schroedinger?.hermiteCocycleInflationTwist,
    3.5,
    0.0,
    8.0
  )
}

/**
 * Pack Coherence Horizon (coherence-sourced gravity) uniforms. Only the
 * coherenceHorizon mode reads these fields (its dedicated geodesic main
 * block); every other mode gets all-zero fields so the buffer region is
 * deterministic. The Tangherlini horizon radius r_h and the metric exponent
 * (d−2) are CPU-precomputed here so the shader never derives them per frame.
 */
export function packCoherenceHorizon(
  floatView: Float32Array,
  schroedinger: Partial<SchroedingerConfig> | undefined,
  isCoherenceHorizonMode: boolean,
  dimension: number
): void {
  if (!isCoherenceHorizonMode) {
    floatView[I.coherenceHorizonDecoherence] =
      floatView[I.coherenceHorizonSeparation] =
      floatView[I.coherenceHorizonWidth] =
      floatView[I.coherenceHorizonWaveNumber] =
      floatView[I.coherenceHorizonRadius] =
      floatView[I.coherenceHorizonMetricExponent] =
      floatView[I.coherenceHorizonRingGain] =
      floatView[I.coherenceHorizonGlow] =
        0.0
    return
  }

  const config = schroedinger?.coherenceHorizon
  const R = COHERENCE_HORIZON_RANGES
  const decoherence = finiteClamped(config?.decoherence, 0, R.decoherence.min, R.decoherence.max)
  const horizonScale = finiteClamped(
    config?.horizonScale,
    0.5,
    R.horizonScale.min,
    R.horizonScale.max
  )
  const d = Math.max(3, Math.min(11, Math.floor(Number.isFinite(dimension) ? dimension : 3)))

  floatView[I.coherenceHorizonDecoherence] = decoherence
  floatView[I.coherenceHorizonSeparation] = finiteClamped(
    config?.separation,
    1.6,
    R.separation.min,
    R.separation.max
  )
  floatView[I.coherenceHorizonWidth] = finiteClamped(config?.width, 0.45, R.width.min, R.width.max)
  floatView[I.coherenceHorizonWaveNumber] = finiteClamped(
    config?.waveNumber,
    5,
    R.waveNumber.min,
    R.waveNumber.max
  )
  floatView[I.coherenceHorizonRadius] = tangherliniHorizonRadius(decoherence, horizonScale, d)
  floatView[I.coherenceHorizonMetricExponent] = d - 2
  floatView[I.coherenceHorizonRingGain] = finiteClamped(
    config?.ringGain,
    2.2,
    R.ringGain.min,
    R.ringGain.max
  )
  floatView[I.coherenceHorizonGlow] = finiteClamped(config?.glow, 1.2, R.glow.min, R.glow.max)
}

/**
 * Pack Arithmetic Horizon (Riemann ζ) uniforms. Only the riemannZeta mode reads
 * these fields (its dedicated volumetric main block); every other mode gets
 * all-zero fields so the buffer region is deterministic. The radial LUT itself
 * is a separate group-2 storage buffer owned by RiemannZetaStrategy — not part
 * of this struct. The Hagedorn partition gain, the world-space horizon radius,
 * and the metric exponent (d−2) are CPU-precomputed here so the shader never
 * derives them per frame.
 */
export function packRiemannZeta(
  floatView: Float32Array,
  schroedinger: Partial<SchroedingerConfig> | undefined,
  dimension: number,
  boundingRadius: number,
  isRiemannZetaMode: boolean
): void {
  if (!isRiemannZetaMode) {
    floatView[I.riemannUMin] =
      floatView[I.riemannUMax] =
      floatView[I.riemannPartitionGain] =
      floatView[I.riemannGlow] =
      floatView[I.riemannHorizonRadius] =
      floatView[I.riemannMetricExponent] =
      floatView[I.riemannFlowRate] =
      floatView[I.riemannAngularL] =
      floatView[I.riemannAngularM] =
      floatView[I.riemannCutaway] =
        0.0
    return
  }

  const cfg = schroedinger?.riemannZeta
  const defaults = DEFAULT_RIEMANN_ZETA_CONFIG
  const R = RIEMANN_ZETA_RANGES
  const d = Math.max(3, Math.min(11, Math.floor(Number.isFinite(dimension) ? dimension : 3)))
  const safeBound = Number.isFinite(boundingRadius) && boundingRadius > 0 ? boundingRadius : 2.0

  const beta = finiteClamped(cfg?.beta, defaults.beta, R.beta.min, R.beta.max)
  const angularL = finiteClamped(cfg?.angularL, defaults.angularL, R.angularL.min, R.angularL.max)
  const angularM = finiteClamped(cfg?.angularM, defaults.angularM, -angularL, angularL)
  const horizonRadius = finiteClamped(
    cfg?.horizonRadius,
    defaults.horizonRadius,
    R.horizonRadius.min,
    R.horizonRadius.max
  )

  // The LUT lives in pure u = ln(p^k) coordinates; world space is scaled by
  // RIEMANN_WORLD_SCALE (shells at r = s·p^k). Shifting the uniform u-range by
  // ln(s) makes the shader's u = ln(r_world) land on the right LUT samples
  // without touching the LUT or adding a division per march step.
  const logScale = Math.log(RIEMANN_WORLD_SCALE)
  floatView[I.riemannUMin] = RIEMANN_DEFAULT_RADIAL.uMin + logScale
  floatView[I.riemannUMax] = RIEMANN_DEFAULT_RADIAL.uMax + logScale
  floatView[I.riemannPartitionGain] = hagedornPartitionGain(beta)
  floatView[I.riemannGlow] = finiteClamped(cfg?.glow, defaults.glow, R.glow.min, R.glow.max)
  floatView[I.riemannHorizonRadius] = horizonRadius * 0.6 * safeBound
  floatView[I.riemannMetricExponent] = d - 2
  floatView[I.riemannFlowRate] = finiteClamped(
    cfg?.flowRate,
    defaults.flowRate,
    R.flowRate.min,
    R.flowRate.max
  )
  floatView[I.riemannAngularL] = angularL
  floatView[I.riemannAngularM] = angularM
  floatView[I.riemannCutaway] = (cfg?.cutaway ?? defaults.cutaway) ? 1.0 : 0.0
}

/**
 * Pack Hilbert–Pólya Spectrum uniforms. Only the hilbertPolya mode reads these
 * fields (its dedicated volumetric main block); every other mode gets all-zero
 * fields so the buffer region is deterministic. The (Re z, Im z, θ) volume LUT
 * itself is a separate group-2 storage buffer owned by HilbertPolyaStrategy —
 * not part of this struct. The LUT-shaping fields (zMax / yExtent) are
 * consumed by the strategy's worker job, not packed here.
 */
export function packHilbertPolya(
  floatView: Float32Array,
  schroedinger: Partial<SchroedingerConfig> | undefined,
  isHilbertPolyaMode: boolean
): void {
  if (!isHilbertPolyaMode) {
    floatView[I.hpGlow] = floatView[I.hpFogGain] = floatView[I.hpPlaneMarker] = 0.0
    floatView[I.hpFilamentWidth] = 0.0
    return
  }

  const cfg = schroedinger?.hilbertPolya
  const defaults = DEFAULT_HILBERT_POLYA_CONFIG
  const R = HILBERT_POLYA_RANGES

  floatView[I.hpGlow] = finiteClamped(cfg?.glow, defaults.glow, R.glow.min, R.glow.max)
  floatView[I.hpFogGain] = finiteClamped(
    cfg?.fogGain,
    defaults.fogGain,
    R.fogGain.min,
    R.fogGain.max
  )
  floatView[I.hpPlaneMarker] = (cfg?.planeMarker ?? defaults.planeMarker) ? 1.0 : 0.0
  // The filament Gaussian profile is applied in the shader against the LUT's
  // distance channel — width changes are uniform-only (no worker recompute).
  floatView[I.hpFilamentWidth] = finiteClamped(
    cfg?.filamentWidth,
    defaults.filamentWidth,
    R.filamentWidth.min,
    R.filamentWidth.max
  )
}

/**
 * Pack Bifurcation Horizon uniforms (Kruskal eternal black hole on the Riemann
 * critical strip). Only the bifurcationHorizon mode reads these fields (its
 * dedicated volumetric main block); every other mode gets all-zero fields so
 * the buffer region is deterministic. The 2D (t, u) LUT itself is a separate
 * group-2 storage buffer owned by BifurcationHorizonStrategy — not part of this
 * struct. The world-space neck radius r₀ = neckRadius·R_bound, the extremal
 * redshift radius r_h = redshiftRadius·R_bound, the metric exponent (d−2), and
 * the LUT window constants (uHalf / tMax) are CPU-precomputed here so the shader
 * never derives them per frame.
 */
export function packBifurcationHorizon(
  floatView: Float32Array,
  schroedinger: Partial<SchroedingerConfig> | undefined,
  dimension: number,
  boundingRadius: number,
  isBifurcationHorizonMode: boolean
): void {
  if (!isBifurcationHorizonMode) {
    floatView[I.bhNeckRadius] =
      floatView[I.bhUHalf] =
      floatView[I.bhTMax] =
      floatView[I.bhGlow] =
      floatView[I.bhFlowRate] =
      floatView[I.bhSwirl] =
      floatView[I.bhRedshiftRadius] =
      floatView[I.bhMetricExponent] =
      floatView[I.bhWinding] =
      floatView[I.bhThermalGain] =
      floatView[I.bhOffLine] =
        0.0
    return
  }

  const cfg = schroedinger?.bifurcationHorizon
  const defaults = DEFAULT_BIFURCATION_HORIZON_CONFIG
  const R = BIFURCATION_HORIZON_RANGES
  const d = Math.max(3, Math.min(11, Math.floor(Number.isFinite(dimension) ? dimension : 3)))
  const safeBound = Number.isFinite(boundingRadius) && boundingRadius > 0 ? boundingRadius : 2.0

  const neckRadius = finiteClamped(
    cfg?.neckRadius,
    defaults.neckRadius,
    R.neckRadius.min,
    R.neckRadius.max
  )
  const redshiftRadius = finiteClamped(
    cfg?.redshiftRadius,
    defaults.redshiftRadius,
    R.redshiftRadius.min,
    R.redshiftRadius.max
  )

  floatView[I.bhNeckRadius] = neckRadius * safeBound
  floatView[I.bhUHalf] = BIFURCATION_U_HALF
  floatView[I.bhTMax] = BIFURCATION_T_MAX
  floatView[I.bhGlow] = finiteClamped(cfg?.glow, defaults.glow, R.glow.min, R.glow.max)
  floatView[I.bhFlowRate] = finiteClamped(
    cfg?.flowRate,
    defaults.flowRate,
    R.flowRate.min,
    R.flowRate.max
  )
  floatView[I.bhSwirl] = finiteClamped(cfg?.swirl, defaults.swirl, R.swirl.min, R.swirl.max)
  // Extremal dark-core radius in world space, as a fraction of the neck radius
  // r₀ = neckRadius·R_bound so the captured core stays INSIDE the throat
  // (rPerp < r_h ≤ r₀) instead of swallowing it; 0 disables the core.
  floatView[I.bhRedshiftRadius] = redshiftRadius > 0 ? redshiftRadius * neckRadius * safeBound : 0
  floatView[I.bhMetricExponent] = d - 2
  floatView[I.bhWinding] = finiteClamped(
    cfg?.winding,
    defaults.winding,
    R.winding.min,
    R.winding.max
  )
  floatView[I.bhThermalGain] = finiteClamped(
    cfg?.thermalGain,
    defaults.thermalGain,
    R.thermalGain.min,
    R.thermalGain.max
  )
  floatView[I.bhOffLine] = finiteClamped(
    cfg?.offLine,
    defaults.offLine,
    R.offLine.min,
    R.offLine.max
  )
}

/**
 * Pack Modular Knot ("Rademacher Horizon") uniforms. Only the modularKnot mode
 * reads these fields (its dedicated 3D-texture volumetric main block); every
 * other mode gets all-zero fields so the buffer region is deterministic. The
 * baked RGBA volume itself is a separate group-2 3D texture + sampler owned by
 * ModularKnotStrategy — not part of this struct. Only the render-only glow and
 * auto-rotation flow rate live here (mkMetric is reserved and stays zero).
 */
export function packModularKnot(
  floatView: Float32Array,
  schroedinger: Partial<SchroedingerConfig> | undefined,
  isModularKnotMode: boolean
): void {
  if (!isModularKnotMode) {
    floatView[I.mkGlow] = floatView[I.mkFlow] = floatView[I.mkMetric] = 0.0
    return
  }

  const cfg = schroedinger?.modularKnot
  const defaults = DEFAULT_MODULAR_KNOT_CONFIG
  const R = MODULAR_KNOT_RANGES

  floatView[I.mkGlow] = finiteClamped(cfg?.glow, defaults.glow, R.glow.min, R.glow.max)
  floatView[I.mkFlow] = finiteClamped(cfg?.flow, defaults.flow, R.flow.min, R.flow.max)
  // Reserved for a future horizon term; held at zero for now.
  floatView[I.mkMetric] = 0.0
}

/**
 * Pack WDW ⊗ ζ suite uniforms. The ten suite modes share one shader; the only
 * per-mode uniform is `wzModeId` (from the bake registry), which the shared main
 * block can use for a per-mode emission flourish. `wzParamA`/`wzParamB` are
 * reserved generic render knobs. Non-suite modes get all-zero fields so the
 * buffer region is deterministic. Emission/glow is the shared `emissionIntensity`
 * field (appearanceStore.faceEmission) — NOT packed here.
 *
 * @param floatView - Float view over the SchroedingerUniforms buffer.
 * @param quantumMode - The active quantum mode string.
 */
export function packWdwZetaVolume(floatView: Float32Array, quantumMode: string | undefined): void {
  const spec = getWdwZetaSpec(quantumMode)
  if (!spec) {
    floatView[I.wzModeId] = floatView[I.wzParamA] = floatView[I.wzParamB] = 0.0
    return
  }
  floatView[I.wzModeId] = spec.modeId
  floatView[I.wzParamA] = 0.0
  floatView[I.wzParamB] = 0.0
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
