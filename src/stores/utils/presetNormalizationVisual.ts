/**
 * Normalization functions for appearance and post-processing preset data.
 *
 * Extracted from presetNormalization.ts to meet line-count and complexity limits.
 * Both functions validate, clamp, and sanitize raw JSON data loaded from presets.
 *
 * @module stores/utils/presetNormalizationVisual
 */

import { normalizeOpaqueHexColor } from '@/lib/colors/colorUtils'

import { useAppearanceStore } from '../scene/appearanceStore'
import {
  APPEARANCE_LOAD_KEYS,
  clampFiniteOrFallback,
  clampToRange,
  COLOR_ALGORITHM_SET,
  DIVERGING_COMPONENT_SET,
  DOMAIN_COLORING_MODULUS_MODE_SET,
  normalizeCosineVector,
  POST_PROCESSING_LOAD_KEYS,
  SHADER_TYPE_SET,
  validateBooleanField,
} from './presetNormalizationShared'

/** Validate a numeric field: clamp if finite, delete if not. */
function validateNumericField(
  obj: Record<string, unknown>,
  key: string,
  min: number,
  max: number
): void {
  if (!(key in obj)) return
  const value = obj[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    obj[key] = clampToRange(value, min, max)
  } else {
    delete obj[key]
  }
}

/** Validate a string field: delete if not string. */
function validateStringField(obj: Record<string, unknown>, key: string): void {
  if (key in obj && typeof obj[key] !== 'string') {
    delete obj[key]
  }
}

/** Normalize an opaque hex color field; delete if invalid. */
function validateOpaqueHexField(obj: Record<string, unknown>, key: string): void {
  if (!(key in obj)) return
  const normalized = normalizeOpaqueHexColor(obj[key])
  if (normalized) {
    obj[key] = normalized
  } else {
    delete obj[key]
  }
}

/** Validate an enum field: delete if not in allowed set. */
function validateEnumField(obj: Record<string, unknown>, key: string, allowed: Set<string>): void {
  if (key in obj && (typeof obj[key] !== 'string' || !allowed.has(obj[key] as string))) {
    delete obj[key]
  }
}

/** Pick only allowed keys from source into a new object. */
function pickKeys(
  source: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    if (key in source) {
      result[key] = source[key]
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Appearance normalization
// ---------------------------------------------------------------------------

/** Normalize a 3-color diverging palette object, falling back per field. */
function normalizeDivergingColors(
  raw: Record<string, unknown>,
  defaults: { neutralColor: string; positiveColor: string; negativeColor: string }
): { neutralColor: string; positiveColor: string; negativeColor: string } {
  return {
    neutralColor: normalizeOpaqueHexColor(raw.neutralColor) ?? defaults.neutralColor,
    positiveColor: normalizeOpaqueHexColor(raw.positiveColor) ?? defaults.positiveColor,
    negativeColor: normalizeOpaqueHexColor(raw.negativeColor) ?? defaults.negativeColor,
  }
}

/** Normalize phaseDiverging and divergingPsi fields. */
function normalizeAppearanceDivergingFields(
  appearance: Record<string, unknown>,
  fallback: ReturnType<typeof useAppearanceStore.getState>
): void {
  normalizeObjectField(appearance, 'phaseDiverging', (pd) =>
    normalizeDivergingColors(pd, fallback.phaseDiverging)
  )

  normalizeObjectField(appearance, 'divergingPsi', (dp) => ({
    ...normalizeDivergingColors(dp, fallback.divergingPsi),
    intensityFloor: clampFiniteOrFallback(
      dp.intensityFloor,
      0,
      1,
      fallback.divergingPsi.intensityFloor
    ),
    component: DIVERGING_COMPONENT_SET.has(dp.component as never)
      ? dp.component
      : fallback.divergingPsi.component,
  }))
}

/**
 * If a field exists and is a non-array object, pass it to the builder; otherwise delete it.
 * Returns the parsed sub-object or null.
 */
function normalizeObjectField<T>(
  obj: Record<string, unknown>,
  key: string,
  builder: (raw: Record<string, unknown>) => T
): void {
  if (!(key in obj)) return
  const v = obj[key]
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    obj[key] = builder(v as Record<string, unknown>)
  } else {
    delete obj[key]
  }
}

/** Normalize the nested object fields of appearance data (cosine, distribution, etc.). */
function normalizeAppearanceObjects(
  appearance: Record<string, unknown>,
  fallback: ReturnType<typeof useAppearanceStore.getState>
): void {
  normalizeObjectField(appearance, 'cosineCoefficients', (coefficients) => ({
    a: normalizeCosineVector(coefficients.a, fallback.cosineCoefficients.a),
    b: normalizeCosineVector(coefficients.b, fallback.cosineCoefficients.b),
    c: normalizeCosineVector(coefficients.c, fallback.cosineCoefficients.c),
    d: normalizeCosineVector(coefficients.d, fallback.cosineCoefficients.d),
  }))

  normalizeObjectField(appearance, 'distribution', (d) => ({
    power: clampFiniteOrFallback(d.power, 0.25, 4, fallback.distribution.power),
    cycles: clampFiniteOrFallback(d.cycles, 0.5, 5, fallback.distribution.cycles),
    offset: clampFiniteOrFallback(d.offset, 0, 1, fallback.distribution.offset),
  }))

  normalizeObjectField(appearance, 'multiSourceWeights', (w) => ({
    depth: clampFiniteOrFallback(w.depth, 0, 1, fallback.multiSourceWeights.depth),
    orbitTrap: clampFiniteOrFallback(w.orbitTrap, 0, 1, fallback.multiSourceWeights.orbitTrap),
    normal: clampFiniteOrFallback(w.normal, 0, 1, fallback.multiSourceWeights.normal),
  }))

  normalizeObjectField(appearance, 'domainColoring', (dc) => ({
    modulusMode: DOMAIN_COLORING_MODULUS_MODE_SET.has(dc.modulusMode as never)
      ? dc.modulusMode
      : fallback.domainColoring.modulusMode,
    contoursEnabled:
      typeof dc.contoursEnabled === 'boolean'
        ? dc.contoursEnabled
        : fallback.domainColoring.contoursEnabled,
    contourDensity: clampFiniteOrFallback(
      dc.contourDensity,
      1,
      32,
      fallback.domainColoring.contourDensity
    ),
    contourWidth: clampFiniteOrFallback(
      dc.contourWidth,
      0.005,
      0.25,
      fallback.domainColoring.contourWidth
    ),
    contourStrength: clampFiniteOrFallback(
      dc.contourStrength,
      0,
      1,
      fallback.domainColoring.contourStrength
    ),
  }))

  normalizeAppearanceDivergingFields(appearance, fallback)

  normalizeObjectField(appearance, 'shaderSettings', (ss) => {
    const wireframe =
      ss.wireframe && typeof ss.wireframe === 'object' && !Array.isArray(ss.wireframe)
        ? (ss.wireframe as Record<string, unknown>)
        : null
    const surface =
      ss.surface && typeof ss.surface === 'object' && !Array.isArray(ss.surface)
        ? (ss.surface as Record<string, unknown>)
        : null
    return {
      wireframe: {
        lineThickness: clampFiniteOrFallback(
          wireframe?.lineThickness,
          1,
          5,
          fallback.shaderSettings.wireframe.lineThickness
        ),
      },
      surface: {
        specularIntensity: clampFiniteOrFallback(
          surface?.specularIntensity,
          0,
          2,
          fallback.shaderSettings.surface.specularIntensity
        ),
      },
    }
  })
}

/** Normalize imported appearance data: validate types, clamp ranges, apply defaults. */
export function normalizeAppearanceLoadData(
  rawAppearance: Record<string, unknown>
): Record<string, unknown> {
  const appearance = { ...rawAppearance }
  const fallback = useAppearanceStore.getState()

  // Simple scalar/string/boolean fields
  validateOpaqueHexField(appearance, 'edgeColor')
  validateOpaqueHexField(appearance, 'faceColor')
  validateBooleanField(appearance, 'perDimensionColorEnabled')
  validateEnumField(appearance, 'colorAlgorithm', COLOR_ALGORITHM_SET as Set<string>)

  // Numeric fields with clamp ranges
  validateNumericField(appearance, 'lchLightness', 0.1, 1)
  validateNumericField(appearance, 'lchChroma', 0, 0.4)
  validateNumericField(appearance, 'faceEmission', 0, 5)
  validateNumericField(appearance, 'faceEmissionThreshold', 0, 1)
  validateNumericField(appearance, 'faceEmissionColorShift', -1, 1)
  validateNumericField(appearance, 'sssIntensity', 0, 2)
  validateNumericField(appearance, 'sssThickness', 0.1, 5)
  validateNumericField(appearance, 'sssJitter', 0, 1)

  // Boolean/string fields
  validateBooleanField(appearance, 'sssEnabled')
  validateStringField(appearance, 'sssColor')
  validateEnumField(appearance, 'shaderType', SHADER_TYPE_SET as Set<string>)

  // Nested object fields
  normalizeAppearanceObjects(appearance, fallback)

  return pickKeys(appearance, APPEARANCE_LOAD_KEYS)
}

// ---------------------------------------------------------------------------
// Post-processing normalization
// ---------------------------------------------------------------------------

/** Normalize imported post-processing data: validate types, clamp ranges, apply defaults. */
export function normalizePostProcessingLoadData(
  rawPostProcessing: Record<string, unknown>
): Record<string, unknown> {
  const pp = { ...rawPostProcessing }

  // Bloom
  validateBooleanField(pp, 'bloomEnabled')
  validateNumericField(pp, 'bloomGain', 0, 3)
  validateNumericField(pp, 'bloomThreshold', 0, 5)
  validateNumericField(pp, 'bloomKnee', 0, 5)
  validateNumericField(pp, 'bloomRadius', 0.25, 4)

  // Anti-aliasing
  validateEnumField(pp, 'antiAliasingMethod', new Set(['none', 'fxaa', 'smaa']))

  // Cinematic
  validateBooleanField(pp, 'cinematicEnabled')
  validateNumericField(pp, 'cinematicAberration', 0, 0.1)
  validateNumericField(pp, 'cinematicVignette', 0, 3)
  validateNumericField(pp, 'cinematicGrain', 0, 0.2)

  // Paper
  validateBooleanField(pp, 'paperEnabled')
  validateNumericField(pp, 'paperContrast', 0, 1)
  validateNumericField(pp, 'paperRoughness', 0, 1)
  validateNumericField(pp, 'paperFiber', 0, 1)
  validateNumericField(pp, 'paperFiberSize', 0.1, 2)
  validateNumericField(pp, 'paperCrumples', 0, 1)
  validateNumericField(pp, 'paperCrumpleSize', 0.1, 2)
  validateNumericField(pp, 'paperFolds', 0, 1)
  if ('paperFoldCount' in pp) {
    if (typeof pp.paperFoldCount === 'number' && Number.isFinite(pp.paperFoldCount)) {
      pp.paperFoldCount = clampToRange(Math.round(pp.paperFoldCount), 1, 15)
    } else {
      delete pp.paperFoldCount
    }
  }
  validateNumericField(pp, 'paperDrops', 0, 1)
  validateNumericField(pp, 'paperFade', 0, 1)
  validateNumericField(pp, 'paperSeed', 0, 1000)
  validateStringField(pp, 'paperColorFront')
  validateStringField(pp, 'paperColorBack')
  validateEnumField(pp, 'paperQuality', new Set(['low', 'medium', 'high']))
  validateNumericField(pp, 'paperIntensity', 0, 1)

  // Frame blending
  validateBooleanField(pp, 'frameBlendingEnabled')
  validateNumericField(pp, 'frameBlendingFactor', 0, 1)
  validateBooleanField(pp, 'horizonMemoryEnabled')
  validateNumericField(pp, 'horizonMemoryStrength', 0, 1.5)
  validateNumericField(pp, 'horizonMemoryRadius', 0.05, 1.5)
  validateNumericField(pp, 'horizonMemorySpin', 0, 1)
  if ('horizonMemoryEchoes' in pp) {
    if (typeof pp.horizonMemoryEchoes === 'number' && Number.isFinite(pp.horizonMemoryEchoes)) {
      pp.horizonMemoryEchoes = clampToRange(Math.round(pp.horizonMemoryEchoes), 1, 6)
    } else {
      delete pp.horizonMemoryEchoes
    }
  }

  return pickKeys(pp, POST_PROCESSING_LOAD_KEYS)
}
