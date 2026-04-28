/**
 * Visual effect setters for the Schroedinger slice.
 *
 * Covers: volume rendering, PML absorber, SSS, nodal surfaces,
 * uncertainty boundary, phase materiality, interference, probability current/flow,
 * radial probability, isosurface, cross-section, slice/phase animation,
 * Wigner, and second-quantization layer.
 *
 * @module stores/slices/geometry/setters/visualEffectSetters
 */

import {
  DEFAULT_SCHROEDINGER_CONFIG,
  RAYMARCH_QUALITY_TO_SAMPLES,
  type RaymarchQuality,
} from '@/lib/geometry/extended/types'

import type { SetterContext } from './sliceSetterUtils'

type SchrodingerKey = keyof typeof DEFAULT_SCHROEDINGER_CONFIG

/**
 * Normalize a 3D plane normal vector. Falls back to [0,0,1] for degenerate input.
 */
const normalizePlaneNormal = (normal: [number, number, number]): [number, number, number] => {
  const [x, y, z] = normal
  const length = Math.hypot(x, y, z)
  if (!Number.isFinite(length) || length < 1e-6) return [0, 0, 1]
  return [x / length, y / length, z / length]
}

/**
 * Convert axis name to unit normal vector.
 */
const axisToNormal = (axis: 'x' | 'y' | 'z'): [number, number, number] => {
  if (axis === 'x') return [1, 0, 0]
  if (axis === 'y') return [0, 1, 0]
  return [0, 0, 1]
}

/**
 * Create visual effect setters for the Schroedinger configuration.
 *
 * @param ctx - Setter context with Zustand set/get and validation helpers
 * @param valueSetter - Factory for simple value setters
 * @param clampedSetter - Factory for clamped numeric setters
 * @returns Object with all visual effect setters
 */
export function createVisualEffectSetters(
  ctx: SetterContext,
  valueSetter: <K extends SchrodingerKey>(
    key: K
  ) => (value: (typeof DEFAULT_SCHROEDINGER_CONFIG)[K]) => void,
  clampedSetter: <K extends SchrodingerKey>(
    key: K,
    min: number,
    max: number
  ) => (value: number) => void
) {
  const { setWithVersion, isFinite, warnNonFinite } = ctx

  return {
    // Volume rendering
    setSchroedingerTimeScale: clampedSetter('timeScale', 0.1, 2.0),
    setSchroedingerFieldScale: clampedSetter('fieldScale', 0.5, 2.0),
    setSchroedingerDensityGain: clampedSetter('densityGain', 0.1, 5.0),
    setSchroedingerDensityContrast: clampedSetter('densityContrast', 1.0, 4.0),
    setSchroedingerAutoScaleMaxGain: clampedSetter('autoScaleMaxGain', 1, 100),
    setSchroedingerPowderScale: clampedSetter('powderScale', 0.0, 2.0),
    setSchroedingerSampleCount: clampedSetter('sampleCount', 16, 128),
    setSchroedingerEmissionIntensity: clampedSetter('emissionIntensity', 0.0, 5.0),
    setSchroedingerEmissionThreshold: clampedSetter('emissionThreshold', 0.0, 1.0),
    setSchroedingerEmissionColorShift: clampedSetter('emissionColorShift', -1.0, 1.0),
    setSchroedingerScatteringAnisotropy: clampedSetter('scatteringAnisotropy', -0.9, 0.9),
    setSchroedingerRoughness: clampedSetter('roughness', 0.0, 1.0),
    setSchroedingerRaymarchQuality: (quality: RaymarchQuality) => {
      const sampleCount = RAYMARCH_QUALITY_TO_SAMPLES[quality]
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, raymarchQuality: quality, sampleCount },
      }))
    },

    // PML absorber
    setSchroedingerAbsorberEnabled: valueSetter('absorberEnabled'),
    setSchroedingerAbsorberWidth: clampedSetter('absorberWidth', 0.05, 0.5),
    setSchroedingerPmlTargetReflection: (r: number) => {
      if (!isFinite(r) || r <= 0 || r >= 1) return
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, pmlTargetReflection: r },
      }))
    },

    // SSS state lives on the appearance store; no schroedinger-scoped duplicates.

    // Nodal surfaces
    setSchroedingerNodalEnabled: valueSetter('nodalEnabled'),
    setSchroedingerNodalColor: valueSetter('nodalColor'),
    setSchroedingerNodalStrength: clampedSetter('nodalStrength', 0.0, 2.0),
    setSchroedingerNodalDefinition: valueSetter('nodalDefinition'),
    setSchroedingerNodalTolerance: clampedSetter('nodalTolerance', 0.00001, 0.5),
    setSchroedingerNodalFamilyFilter: valueSetter('nodalFamilyFilter'),
    setSchroedingerNodalRenderMode: valueSetter('nodalRenderMode'),
    setSchroedingerNodalLobeColoringEnabled: valueSetter('nodalLobeColoringEnabled'),
    setSchroedingerNodalColorReal: valueSetter('nodalColorReal'),
    setSchroedingerNodalColorImag: valueSetter('nodalColorImag'),
    setSchroedingerNodalColorPositive: valueSetter('nodalColorPositive'),
    setSchroedingerNodalColorNegative: valueSetter('nodalColorNegative'),

    // Uncertainty boundary
    setSchroedingerUncertaintyBoundaryEnabled: valueSetter('uncertaintyBoundaryEnabled'),
    setSchroedingerUncertaintyBoundaryStrength: clampedSetter(
      'uncertaintyBoundaryStrength',
      0.0,
      1.0
    ),
    setSchroedingerUncertaintyConfidenceMass: clampedSetter('uncertaintyConfidenceMass', 0.5, 0.99),
    setSchroedingerUncertaintyBoundaryWidth: clampedSetter('uncertaintyBoundaryWidth', 0.1, 2.0),

    // Phase materiality
    setSchroedingerPhaseMaterialityEnabled: valueSetter('phaseMaterialityEnabled'),
    setSchroedingerPhaseMaterialityStrength: clampedSetter('phaseMaterialityStrength', 0.0, 1.0),

    // Interference
    setSchroedingerInterferenceEnabled: valueSetter('interferenceEnabled'),
    setSchroedingerInterferenceAmp: clampedSetter('interferenceAmp', 0.0, 1.0),
    setSchroedingerInterferenceFreq: clampedSetter('interferenceFreq', 1.0, 50.0),
    setSchroedingerInterferenceSpeed: clampedSetter('interferenceSpeed', 0.0, 10.0),
    setSchroedingerQuantumBackreactionLensingEnabled: valueSetter(
      'quantumBackreactionLensingEnabled'
    ),
    setSchroedingerQuantumBackreactionLensingStrength: clampedSetter(
      'quantumBackreactionLensingStrength',
      0.0,
      3.0
    ),
    setSchroedingerQuantumBackreactionCausticGain: clampedSetter(
      'quantumBackreactionCausticGain',
      0.0,
      2.0
    ),
    setSchroedingerQuantumBackreactionSoftening: clampedSetter(
      'quantumBackreactionSoftening',
      0.05,
      2.0
    ),
    setSchroedingerBilocalERBridgeEnabled: valueSetter('bilocalERBridgeEnabled'),
    setSchroedingerBilocalERBridgeStrength: clampedSetter('bilocalERBridgeStrength', 0.0, 2.0),
    setSchroedingerBilocalERBridgeThroatRadius: clampedSetter(
      'bilocalERBridgeThroatRadius',
      0.05,
      2.0
    ),
    setSchroedingerBilocalERBridgePhaseLock: clampedSetter('bilocalERBridgePhaseLock', 0.0, 1.0),
    setSchroedingerEntropicTimeShearEnabled: valueSetter('entropicTimeShearEnabled'),
    setSchroedingerEntropicTimeShearStrength: clampedSetter('entropicTimeShearStrength', 0.0, 2.0),
    setSchroedingerEntropicTimeShearFilamentScale: clampedSetter(
      'entropicTimeShearFilamentScale',
      0.1,
      4.0
    ),
    setSchroedingerEntropicTimeShearIrreversibility: clampedSetter(
      'entropicTimeShearIrreversibility',
      0.0,
      1.0
    ),
    setSchroedingerSpectralDimensionFlowEnabled: valueSetter('spectralDimensionFlowEnabled'),
    setSchroedingerSpectralDimensionFlowStrength: clampedSetter(
      'spectralDimensionFlowStrength',
      0.0,
      2.0
    ),
    setSchroedingerSpectralDimensionFlowUvDimension: clampedSetter(
      'spectralDimensionFlowUvDimension',
      1.2,
      3.5
    ),
    setSchroedingerSpectralDimensionFlowDiffusionScale: clampedSetter(
      'spectralDimensionFlowDiffusionScale',
      0.05,
      3.0
    ),

    // Probability current
    setSchroedingerProbabilityCurrentEnabled: valueSetter('probabilityCurrentEnabled'),
    setSchroedingerProbabilityCurrentStyle: valueSetter('probabilityCurrentStyle'),
    setSchroedingerProbabilityCurrentPlacement: valueSetter('probabilityCurrentPlacement'),
    setSchroedingerProbabilityCurrentColorMode: valueSetter('probabilityCurrentColorMode'),
    setSchroedingerProbabilityCurrentScale: clampedSetter('probabilityCurrentScale', 0.0, 5.0),
    setSchroedingerProbabilityCurrentSpeed: clampedSetter('probabilityCurrentSpeed', 0.0, 10.0),
    setSchroedingerProbabilityCurrentDensityThreshold: clampedSetter(
      'probabilityCurrentDensityThreshold',
      0.0,
      1.0
    ),
    setSchroedingerProbabilityCurrentMagnitudeThreshold: clampedSetter(
      'probabilityCurrentMagnitudeThreshold',
      0.0,
      10.0
    ),
    setSchroedingerProbabilityCurrentLineDensity: clampedSetter(
      'probabilityCurrentLineDensity',
      1.0,
      64.0
    ),
    setSchroedingerProbabilityCurrentStepSize: clampedSetter(
      'probabilityCurrentStepSize',
      0.005,
      0.2
    ),
    setSchroedingerProbabilityCurrentSteps: (steps: number) => {
      if (!isFinite(steps)) {
        warnNonFinite('probabilityCurrentSteps', steps)
        return
      }
      const clamped = Math.max(4, Math.min(64, Math.floor(steps)))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, probabilityCurrentSteps: clamped },
      }))
    },
    setSchroedingerProbabilityCurrentOpacity: clampedSetter('probabilityCurrentOpacity', 0.0, 1.0),

    // Phase shimmer
    setSchroedingerPhaseShimmerEnabled: valueSetter('phaseShimmerEnabled'),
    setSchroedingerPhaseShimmerSpeed: clampedSetter('phaseShimmerSpeed', 0.1, 5.0),
    setSchroedingerPhaseShimmerStrength: clampedSetter('phaseShimmerStrength', 0.0, 1.0),

    // Radial probability
    setSchroedingerRadialProbabilityEnabled: valueSetter('radialProbabilityEnabled'),
    setSchroedingerRadialProbabilityOpacity: clampedSetter('radialProbabilityOpacity', 0.0, 1.0),
    setSchroedingerRadialProbabilityColor: valueSetter('radialProbabilityColor'),

    // Isosurface
    setSchroedingerIsoEnabled: valueSetter('isoEnabled'),
    setSchroedingerIsoThreshold: clampedSetter('isoThreshold', -6, 0),

    // Cross-section
    setSchroedingerCrossSectionEnabled: valueSetter('crossSectionEnabled'),
    setSchroedingerCrossSectionCompositeMode: valueSetter('crossSectionCompositeMode'),
    setSchroedingerCrossSectionScalar: valueSetter('crossSectionScalar'),
    setSchroedingerCrossSectionPlaneMode: (mode: 'axisAligned' | 'free') => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          crossSectionPlaneMode: mode,
          ...(mode === 'axisAligned'
            ? { crossSectionPlaneNormal: axisToNormal(state.schroedinger.crossSectionAxis ?? 'z') }
            : {}),
        },
      }))
    },
    setSchroedingerCrossSectionAxis: (axis: 'x' | 'y' | 'z') => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          crossSectionAxis: axis,
          crossSectionPlaneMode: 'axisAligned',
          crossSectionPlaneNormal: axisToNormal(axis),
        },
      }))
    },
    setSchroedingerCrossSectionPlaneNormal: (normal: [number, number, number]) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          crossSectionPlaneNormal: normalizePlaneNormal(normal),
          crossSectionPlaneMode: 'free',
        },
      }))
    },
    setSchroedingerCrossSectionPlaneOffset: clampedSetter('crossSectionPlaneOffset', -1.0, 1.0),
    setSchroedingerCrossSectionOpacity: clampedSetter('crossSectionOpacity', 0.0, 1.0),
    setSchroedingerCrossSectionThickness: clampedSetter('crossSectionThickness', 0.0, 0.2),
    setSchroedingerCrossSectionPlaneColor: valueSetter('crossSectionPlaneColor'),
    setSchroedingerCrossSectionAutoWindow: valueSetter('crossSectionAutoWindow'),
    setSchroedingerCrossSectionWindowMin: (minValue: number) => {
      if (!isFinite(minValue)) {
        warnNonFinite('crossSectionWindowMin', minValue)
        return
      }
      setWithVersion((state) => {
        const clampedMin = Math.max(-10.0, Math.min(10.0, minValue))
        const clampedMax = Math.max(state.schroedinger.crossSectionWindowMax, clampedMin + 1e-4)
        return {
          schroedinger: {
            ...state.schroedinger,
            crossSectionWindowMin: clampedMin,
            crossSectionWindowMax: clampedMax,
          },
        }
      })
    },
    setSchroedingerCrossSectionWindowMax: (maxValue: number) => {
      if (!isFinite(maxValue)) {
        warnNonFinite('crossSectionWindowMax', maxValue)
        return
      }
      setWithVersion((state) => {
        const clampedMax = Math.max(-10.0, Math.min(10.0, maxValue))
        const clampedMin = Math.min(state.schroedinger.crossSectionWindowMin, clampedMax - 1e-4)
        return {
          schroedinger: {
            ...state.schroedinger,
            crossSectionWindowMin: clampedMin,
            crossSectionWindowMax: Math.max(clampedMax, clampedMin + 1e-4),
          },
        }
      })
    },

    // Slice animation
    setSchroedingerSliceAnimationEnabled: valueSetter('sliceAnimationEnabled'),
    setSchroedingerSliceSpeed: clampedSetter('sliceSpeed', 0.01, 0.1),
    setSchroedingerSliceAmplitude: clampedSetter('sliceAmplitude', 0.1, 1.0),

    // Phase animation
    setSchroedingerPhaseAnimationEnabled: valueSetter('phaseAnimationEnabled'),

    // Wigner
    setSchroedingerWignerDimensionIndex: (index: number) => {
      if (!isFinite(index)) {
        warnNonFinite('wignerDimensionIndex', index)
        return
      }
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          wignerDimensionIndex: Math.max(0, Math.min(Math.floor(index), 10)),
        },
      }))
    },
    setSchroedingerWignerAutoRange: valueSetter('wignerAutoRange'),
    setSchroedingerWignerXRange: clampedSetter('wignerXRange', 1.0, 30.0),
    setSchroedingerWignerPRange: clampedSetter('wignerPRange', 1.0, 30.0),
    setSchroedingerWignerCrossTermsEnabled: valueSetter('wignerCrossTermsEnabled'),
    setSchroedingerWignerQuadPoints: (points: number) => {
      if (!isFinite(points)) {
        warnNonFinite('wignerQuadPoints', points)
        return
      }
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          wignerQuadPoints: Math.max(8, Math.min(Math.round(points), 64)),
        },
      }))
    },
    setSchroedingerWignerCacheResolution: (resolution: number) => {
      if (!isFinite(resolution)) {
        warnNonFinite('wignerCacheResolution', resolution)
        return
      }
      const clamped = Math.max(128, Math.min(1024, Math.round(resolution)))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, wignerCacheResolution: clamped },
      }))
    },

    // Second-quantization layer
    setSchroedingerSqLayerEnabled: valueSetter('sqLayerEnabled'),
    setSchroedingerSqLayerMode: valueSetter('sqLayerMode'),
    setSchroedingerSqLayerSelectedModeIndex: clampedSetter('sqLayerSelectedModeIndex', 0, 10),
    setSchroedingerSqLayerFockQuantumNumber: clampedSetter('sqLayerFockQuantumNumber', 0, 10),
    setSchroedingerSqLayerShowOccupation: valueSetter('sqLayerShowOccupation'),
    setSchroedingerSqLayerShowUncertainty: valueSetter('sqLayerShowUncertainty'),
    setSchroedingerSqLayerCoherentAlphaRe: clampedSetter('sqLayerCoherentAlphaRe', -5, 5),
    setSchroedingerSqLayerCoherentAlphaIm: clampedSetter('sqLayerCoherentAlphaIm', -5, 5),
    setSchroedingerSqLayerSqueezeR: clampedSetter('sqLayerSqueezeR', 0, 3),
    setSchroedingerSqLayerSqueezeTheta: clampedSetter('sqLayerSqueezeTheta', 0, 2 * Math.PI),
  }
}
