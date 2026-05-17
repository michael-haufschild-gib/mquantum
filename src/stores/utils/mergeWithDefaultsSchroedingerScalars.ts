import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/types'

function clampFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

function clampFiniteInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

/**
 * Clamp numeric Schroedinger controls that scene loading can otherwise inject
 * as non-finite values while still matching the expected primitive type.
 *
 * @param normalized - Merged Schroedinger config record
 * @returns Config with top-level numeric controls normalized to setter ranges
 */
export function normalizeSchroedingerNumericScalars(
  normalized: Record<string, unknown>
): Record<string, unknown> {
  const defaults = DEFAULT_SCHROEDINGER_CONFIG
  return {
    ...normalized,
    timeScale: clampFiniteNumber(normalized.timeScale, defaults.timeScale, 0.1, 2.0),
    fieldScale: clampFiniteNumber(normalized.fieldScale, defaults.fieldScale, 0.5, 2.0),
    densityGain: clampFiniteNumber(normalized.densityGain, defaults.densityGain, 0.1, 5.0),
    densityContrast: clampFiniteNumber(
      normalized.densityContrast,
      defaults.densityContrast,
      1.0,
      4.0
    ),
    autoScaleMaxGain: clampFiniteNumber(
      normalized.autoScaleMaxGain,
      defaults.autoScaleMaxGain,
      1,
      100
    ),
    powderScale: clampFiniteNumber(normalized.powderScale, defaults.powderScale, 0.0, 2.0),
    sampleCount: clampFiniteInteger(normalized.sampleCount, defaults.sampleCount, 16, 128),
    absorberWidth: clampFiniteNumber(normalized.absorberWidth, defaults.absorberWidth, 0.05, 0.5),
    pmlTargetReflection: clampFiniteNumber(
      normalized.pmlTargetReflection,
      defaults.pmlTargetReflection,
      1e-12,
      0.999
    ),
    wignerDimensionIndex: clampFiniteInteger(
      normalized.wignerDimensionIndex,
      defaults.wignerDimensionIndex,
      0,
      10
    ),
    wignerXRange: clampFiniteNumber(normalized.wignerXRange, defaults.wignerXRange, 1.0, 30.0),
    wignerPRange: clampFiniteNumber(normalized.wignerPRange, defaults.wignerPRange, 1.0, 30.0),
    wignerQuadPoints: clampFiniteInteger(
      normalized.wignerQuadPoints,
      defaults.wignerQuadPoints,
      8,
      96
    ),
    wignerCacheResolution: clampFiniteInteger(
      normalized.wignerCacheResolution,
      defaults.wignerCacheResolution,
      128,
      1024
    ),
    spectralDimensionFlowStrength: clampFiniteNumber(
      normalized.spectralDimensionFlowStrength,
      defaults.spectralDimensionFlowStrength,
      0.0,
      2.0
    ),
    spectralDimensionFlowUvDimension: clampFiniteNumber(
      normalized.spectralDimensionFlowUvDimension,
      defaults.spectralDimensionFlowUvDimension,
      1.2,
      3.5
    ),
    spectralDimensionFlowDiffusionScale: clampFiniteNumber(
      normalized.spectralDimensionFlowDiffusionScale,
      defaults.spectralDimensionFlowDiffusionScale,
      0.05,
      3.0
    ),
  }
}
