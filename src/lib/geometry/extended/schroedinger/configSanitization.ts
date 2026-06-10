import { SCHROEDINGER_MAX_TERMS } from '@/constants/quantum'

import type { SchroedingerConfig } from '../schroedinger'

type HarmonicOscillatorScalars = Pick<
  SchroedingerConfig,
  'seed' | 'termCount' | 'maxQuantumNumber' | 'frequencySpread'
>
type NumericSchroedingerScalarKey = {
  [K in keyof SchroedingerConfig]: SchroedingerConfig[K] extends number ? K : never
}[keyof SchroedingerConfig]
type BooleanSchroedingerScalarKey = {
  [K in keyof SchroedingerConfig]: SchroedingerConfig[K] extends boolean ? K : never
}[keyof SchroedingerConfig]

interface NumericScalarSpec {
  key: NumericSchroedingerScalarKey
  min: number
  max: number
  integer?: 'floor' | 'round'
}

const MIN_TERM_COUNT = 1
const MIN_MAX_QUANTUM_NUMBER = 1
export const MAX_HARMONIC_OSCILLATOR_QUANTUM_NUMBER = 6
const MIN_FREQUENCY_SPREAD = 0
const MAX_FREQUENCY_SPREAD = 0.5

const SCHROEDINGER_NUMERIC_SCALAR_SPECS: readonly NumericScalarSpec[] = [
  { key: 'scale', min: 0.1, max: 2.0 },
  { key: 'extent', min: 0.001, max: 10.0 },
  { key: 'termCount', min: MIN_TERM_COUNT, max: SCHROEDINGER_MAX_TERMS, integer: 'floor' },
  {
    key: 'maxQuantumNumber',
    min: MIN_MAX_QUANTUM_NUMBER,
    max: MAX_HARMONIC_OSCILLATOR_QUANTUM_NUMBER,
    integer: 'floor',
  },
  { key: 'frequencySpread', min: MIN_FREQUENCY_SPREAD, max: MAX_FREQUENCY_SPREAD },
  { key: 'momentumScale', min: 0.1, max: 4.0 },
  { key: 'momentumHbar', min: 0.01, max: 10.0 },
  { key: 'timeScale', min: 0.1, max: 2.0 },
  { key: 'fieldScale', min: 0.5, max: 2.0 },
  { key: 'densityGain', min: 0.1, max: 5.0 },
  { key: 'densityContrast', min: 1.0, max: 4.0 },
  { key: 'autoScaleMaxGain', min: 1.0, max: 100.0 },
  { key: 'powderScale', min: 0.0, max: 2.0 },
  { key: 'sampleCount', min: 16, max: 128, integer: 'round' },
  { key: 'emissionIntensity', min: 0.0, max: 5.0 },
  { key: 'emissionThreshold', min: 0.0, max: 1.0 },
  { key: 'emissionColorShift', min: -1.0, max: 1.0 },
  { key: 'scatteringAnisotropy', min: -0.9, max: 0.9 },
  { key: 'roughness', min: 0.0, max: 1.0 },
  { key: 'absorberWidth', min: 0.05, max: 0.5 },
  { key: 'pmlTargetReflection', min: 1e-12, max: 0.999 },
  { key: 'nodalStrength', min: 0.0, max: 2.0 },
  { key: 'nodalTolerance', min: 0.00001, max: 0.5 },
  { key: 'uncertaintyBoundaryStrength', min: 0.0, max: 1.0 },
  { key: 'uncertaintyConfidenceMass', min: 0.5, max: 0.99 },
  { key: 'uncertaintyBoundaryWidth', min: 0.1, max: 2.0 },
  { key: 'phaseMaterialityStrength', min: 0.0, max: 1.0 },
  { key: 'interferenceAmp', min: 0.0, max: 1.0 },
  { key: 'interferenceFreq', min: 1.0, max: 50.0 },
  { key: 'interferenceSpeed', min: 0.0, max: 10.0 },
  { key: 'quantumBackreactionLensingStrength', min: 0.0, max: 3.0 },
  { key: 'quantumBackreactionCausticGain', min: 0.0, max: 2.0 },
  { key: 'quantumBackreactionSoftening', min: 0.05, max: 2.0 },
  { key: 'bilocalERBridgeStrength', min: 0.0, max: 2.0 },
  { key: 'bilocalERBridgeThroatRadius', min: 0.05, max: 2.0 },
  { key: 'bilocalERBridgePhaseLock', min: 0.0, max: 1.0 },
  { key: 'entropicTimeShearStrength', min: 0.0, max: 2.0 },
  { key: 'entropicTimeShearFilamentScale', min: 0.1, max: 4.0 },
  { key: 'entropicTimeShearIrreversibility', min: 0.0, max: 1.0 },
  { key: 'spectralDimensionFlowStrength', min: 0.0, max: 2.0 },
  { key: 'spectralDimensionFlowUvDimension', min: 1.2, max: 3.5 },
  { key: 'spectralDimensionFlowDiffusionScale', min: 0.05, max: 3.0 },
  { key: 'vacuumBubbleLensStrength', min: 0.0, max: 2.0 },
  { key: 'vacuumBubbleWallRadius', min: 0.05, max: 1.5 },
  { key: 'vacuumBubbleWallThickness', min: 0.02, max: 0.5 },
  { key: 'vacuumBubbleTension', min: 0.0, max: 3.0 },
  { key: 'vacuumBubbleBias', min: 0.0, max: 3.0 },
  { key: 'bornNullWeaveStrength', min: 0.0, max: 2.0 },
  { key: 'bornNullWeaveNodeWidth', min: 0.0001, max: 0.2 },
  { key: 'bornNullWeaveCirculation', min: 0.0, max: 8.0 },
  { key: 'probabilityCurrentScale', min: 0.0, max: 5.0 },
  { key: 'probabilityCurrentSpeed', min: 0.0, max: 10.0 },
  { key: 'probabilityCurrentDensityThreshold', min: 0.0, max: 1.0 },
  { key: 'probabilityCurrentMagnitudeThreshold', min: 0.0, max: 10.0 },
  { key: 'probabilityCurrentLineDensity', min: 1.0, max: 64.0 },
  { key: 'probabilityCurrentStepSize', min: 0.005, max: 0.2 },
  { key: 'probabilityCurrentSteps', min: 4, max: 64, integer: 'floor' },
  { key: 'probabilityCurrentOpacity', min: 0.0, max: 1.0 },
  { key: 'phaseShimmerSpeed', min: 0.1, max: 5.0 },
  { key: 'phaseShimmerStrength', min: 0.0, max: 1.0 },
  { key: 'radialProbabilityOpacity', min: 0.0, max: 1.0 },
  { key: 'isoThreshold', min: -6.0, max: 0.0 },
  { key: 'crossSectionPlaneOffset', min: -1.0, max: 1.0 },
  { key: 'crossSectionOpacity', min: 0.0, max: 1.0 },
  { key: 'crossSectionThickness', min: 0.0, max: 0.2 },
  { key: 'sliceSpeed', min: 0.01, max: 0.1 },
  { key: 'sliceAmplitude', min: 0.1, max: 1.0 },
  { key: 'wignerDimensionIndex', min: 0, max: 10, integer: 'floor' },
  { key: 'wignerXRange', min: 1.0, max: 30.0 },
  { key: 'wignerPRange', min: 1.0, max: 30.0 },
  { key: 'wignerQuadPoints', min: 8, max: 96, integer: 'round' },
  { key: 'wignerCacheResolution', min: 128, max: 1024, integer: 'round' },
  { key: 'sqLayerSelectedModeIndex', min: 0, max: 10 },
  { key: 'sqLayerFockQuantumNumber', min: 0, max: 10 },
  { key: 'sqLayerCoherentAlphaRe', min: -5, max: 5 },
  { key: 'sqLayerCoherentAlphaIm', min: -5, max: 5 },
  { key: 'sqLayerSqueezeR', min: 0, max: 3 },
  { key: 'sqLayerSqueezeTheta', min: 0, max: 2 * Math.PI },
]

const SCHROEDINGER_BOOLEAN_SCALAR_KEYS: readonly BooleanSchroedingerScalarKey[] = [
  'absorberEnabled',
  'nodalEnabled',
  'nodalLobeColoringEnabled',
  'probabilityCurrentEnabled',
  'crossSectionEnabled',
  'crossSectionAutoWindow',
  'wignerAutoRange',
  'wignerCrossTermsEnabled',
  'uncertaintyBoundaryEnabled',
  'phaseMaterialityEnabled',
  'interferenceEnabled',
  'quantumBackreactionLensingEnabled',
  'bilocalERBridgeEnabled',
  'entropicTimeShearEnabled',
  'spectralDimensionFlowEnabled',
  'vacuumBubbleLensEnabled',
  'bornNullWeaveEnabled',
  'fockLanternEnabled',
  'hermiteCocycleInflationEnabled',
  'causalDiamondEnabled',
  'sqLayerEnabled',
  'sqLayerShowOccupation',
  'sqLayerShowUncertainty',
  'useRealOrbitals',
  'invertColors',
  'phaseShimmerEnabled',
  'isoEnabled',
  'sliceAnimationEnabled',
  'phaseAnimationEnabled',
  'radialProbabilityEnabled',
]

function hasOwn(record: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function finiteOrFallback(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function applyIntegerMode(value: number, mode: NumericScalarSpec['integer']): number {
  if (mode === 'floor') return Math.floor(value)
  if (mode === 'round') return Math.round(value)
  return value
}

/**
 * Normalize top-level numeric Schroedinger controls for paths that bypass
 * dedicated UI setters, such as setSchroedingerConfig and scene loading.
 */
export function sanitizeSchroedingerNumericScalars<T extends Record<string, unknown>>(
  config: T,
  fallback: Partial<SchroedingerConfig>
): T {
  let next: T | undefined
  const mutable = (): Record<string, unknown> => {
    next ??= { ...config }
    return next
  }

  if (hasOwn(config, 'seed')) {
    const raw = config['seed']
    const sanitized = Math.floor(finiteOrFallback(raw, finiteOrFallback(fallback.seed, 0)))
    if (raw !== sanitized) mutable()['seed'] = sanitized
  }

  for (const spec of SCHROEDINGER_NUMERIC_SCALAR_SPECS) {
    if (!hasOwn(config, spec.key)) continue
    const fallbackValue = fallback[spec.key]
    const safeFallback =
      typeof fallbackValue === 'number' && Number.isFinite(fallbackValue) ? fallbackValue : spec.min
    const raw = config[spec.key]
    const numeric = typeof raw === 'number' && Number.isFinite(raw) ? raw : safeFallback
    const sanitized = clamp(applyIntegerMode(numeric, spec.integer), spec.min, spec.max)
    if (raw !== sanitized) mutable()[spec.key] = sanitized
  }

  return next ?? config
}

/**
 * Normalize top-level boolean Schroedinger controls for paths that bypass
 * dedicated UI setters, such as setSchroedingerConfig and .mqstate loading.
 */
export function sanitizeSchroedingerBooleanScalars<T extends Record<string, unknown>>(
  config: T,
  fallback: Partial<SchroedingerConfig>
): T {
  let next: T | undefined
  const mutable = (): Record<string, unknown> => {
    next ??= { ...config }
    return next
  }

  for (const key of SCHROEDINGER_BOOLEAN_SCALAR_KEYS) {
    if (!hasOwn(config, key)) continue
    const raw = config[key]
    const fallbackValue = fallback[key]
    const sanitized = typeof raw === 'boolean' ? raw : fallbackValue === true
    if (raw !== sanitized) mutable()[key] = sanitized
  }

  return next ?? config
}

/**
 * Normalize harmonic-oscillator scalar controls for paths that bypass
 * dedicated UI setters, such as setSchroedingerConfig and scene loading.
 */
export function sanitizeHarmonicOscillatorScalars<T extends Partial<HarmonicOscillatorScalars>>(
  config: T,
  fallback: HarmonicOscillatorScalars
): T {
  return sanitizeSchroedingerNumericScalars(config as Record<string, unknown>, fallback) as T
}
