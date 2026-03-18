/**
 * Normalization functions for appearance and post-processing preset data.
 *
 * Extracted from presetNormalization.ts to meet line-count and complexity limits.
 * Both functions validate, clamp, and sanitize raw JSON data loaded from presets.
 *
 * @module stores/utils/presetNormalizationVisual
 */

import { useAppearanceStore } from '../appearanceStore'
import {
  APPEARANCE_LOAD_KEYS,
  clampToRange,
  COLOR_ALGORITHM_SET,
  DIVERGING_COMPONENT_SET,
  DOMAIN_COLORING_MODULUS_MODE_SET,
  normalizeCosineVector,
  POST_PROCESSING_LOAD_KEYS,
  SHADER_TYPE_SET,
} from './presetNormalization'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function clampFiniteOrFallback(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampToRange(value, min, max)
  }
  return fallback
}

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

/** Validate a boolean field: delete if not boolean. */
function validateBooleanField(obj: Record<string, unknown>, key: string): void {
  if (key in obj && typeof obj[key] !== 'boolean') {
    delete obj[key]
  }
}

/** Validate a string field: delete if not string. */
function validateStringField(obj: Record<string, unknown>, key: string): void {
  if (key in obj && typeof obj[key] !== 'string') {
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

/** Normalize phaseDiverging and divergingPsi fields. */
function normalizeAppearanceDivergingFields(
  appearance: Record<string, unknown>,
  fallback: ReturnType<typeof useAppearanceStore.getState>
): void {
  if ('phaseDiverging' in appearance) {
    if (
      appearance.phaseDiverging &&
      typeof appearance.phaseDiverging === 'object' &&
      !Array.isArray(appearance.phaseDiverging)
    ) {
      const pd = appearance.phaseDiverging as Record<string, unknown>
      appearance.phaseDiverging = {
        neutralColor:
          typeof pd.neutralColor === 'string'
            ? pd.neutralColor
            : fallback.phaseDiverging.neutralColor,
        positiveColor:
          typeof pd.positiveColor === 'string'
            ? pd.positiveColor
            : fallback.phaseDiverging.positiveColor,
        negativeColor:
          typeof pd.negativeColor === 'string'
            ? pd.negativeColor
            : fallback.phaseDiverging.negativeColor,
      }
    } else {
      delete appearance.phaseDiverging
    }
  }

  if ('divergingPsi' in appearance) {
    if (
      appearance.divergingPsi &&
      typeof appearance.divergingPsi === 'object' &&
      !Array.isArray(appearance.divergingPsi)
    ) {
      const dp = appearance.divergingPsi as Record<string, unknown>
      appearance.divergingPsi = {
        neutralColor:
          typeof dp.neutralColor === 'string'
            ? dp.neutralColor
            : fallback.divergingPsi.neutralColor,
        positiveColor:
          typeof dp.positiveColor === 'string'
            ? dp.positiveColor
            : fallback.divergingPsi.positiveColor,
        negativeColor:
          typeof dp.negativeColor === 'string'
            ? dp.negativeColor
            : fallback.divergingPsi.negativeColor,
        intensityFloor: clampFiniteOrFallback(
          dp.intensityFloor,
          0,
          1,
          fallback.divergingPsi.intensityFloor
        ),
        component: DIVERGING_COMPONENT_SET.has(dp.component as never)
          ? dp.component
          : fallback.divergingPsi.component,
      }
    } else {
      delete appearance.divergingPsi
    }
  }
}

/** Normalize the nested object fields of appearance data (cosine, distribution, etc.). */
function normalizeAppearanceObjects(
  appearance: Record<string, unknown>,
  fallback: ReturnType<typeof useAppearanceStore.getState>
): void {
  if ('cosineCoefficients' in appearance) {
    if (
      appearance.cosineCoefficients &&
      typeof appearance.cosineCoefficients === 'object' &&
      !Array.isArray(appearance.cosineCoefficients)
    ) {
      const coefficients = appearance.cosineCoefficients as Record<string, unknown>
      appearance.cosineCoefficients = {
        a: normalizeCosineVector(coefficients.a, fallback.cosineCoefficients.a),
        b: normalizeCosineVector(coefficients.b, fallback.cosineCoefficients.b),
        c: normalizeCosineVector(coefficients.c, fallback.cosineCoefficients.c),
        d: normalizeCosineVector(coefficients.d, fallback.cosineCoefficients.d),
      }
    } else {
      delete appearance.cosineCoefficients
    }
  }

  if ('distribution' in appearance) {
    if (
      appearance.distribution &&
      typeof appearance.distribution === 'object' &&
      !Array.isArray(appearance.distribution)
    ) {
      const d = appearance.distribution as Record<string, unknown>
      appearance.distribution = {
        power: clampFiniteOrFallback(d.power, 0.25, 4, fallback.distribution.power),
        cycles: clampFiniteOrFallback(d.cycles, 0.5, 5, fallback.distribution.cycles),
        offset: clampFiniteOrFallback(d.offset, 0, 1, fallback.distribution.offset),
      }
    } else {
      delete appearance.distribution
    }
  }

  if ('multiSourceWeights' in appearance) {
    if (
      appearance.multiSourceWeights &&
      typeof appearance.multiSourceWeights === 'object' &&
      !Array.isArray(appearance.multiSourceWeights)
    ) {
      const w = appearance.multiSourceWeights as Record<string, unknown>
      appearance.multiSourceWeights = {
        depth: clampFiniteOrFallback(w.depth, 0, 1, fallback.multiSourceWeights.depth),
        orbitTrap: clampFiniteOrFallback(w.orbitTrap, 0, 1, fallback.multiSourceWeights.orbitTrap),
        normal: clampFiniteOrFallback(w.normal, 0, 1, fallback.multiSourceWeights.normal),
      }
    } else {
      delete appearance.multiSourceWeights
    }
  }

  if ('domainColoring' in appearance) {
    if (
      appearance.domainColoring &&
      typeof appearance.domainColoring === 'object' &&
      !Array.isArray(appearance.domainColoring)
    ) {
      const dc = appearance.domainColoring as Record<string, unknown>
      appearance.domainColoring = {
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
      }
    } else {
      delete appearance.domainColoring
    }
  }

  normalizeAppearanceDivergingFields(appearance, fallback)

  if ('shaderSettings' in appearance) {
    if (
      appearance.shaderSettings &&
      typeof appearance.shaderSettings === 'object' &&
      !Array.isArray(appearance.shaderSettings)
    ) {
      const ss = appearance.shaderSettings as Record<string, unknown>
      const wireframe =
        ss.wireframe && typeof ss.wireframe === 'object' && !Array.isArray(ss.wireframe)
          ? (ss.wireframe as Record<string, unknown>)
          : null
      const surface =
        ss.surface && typeof ss.surface === 'object' && !Array.isArray(ss.surface)
          ? (ss.surface as Record<string, unknown>)
          : null
      appearance.shaderSettings = {
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
    } else {
      delete appearance.shaderSettings
    }
  }
}

/** Normalize imported appearance data: validate types, clamp ranges, apply defaults. */
export function normalizeAppearanceLoadData(
  rawAppearance: Record<string, unknown>
): Record<string, unknown> {
  const appearance = { ...rawAppearance }
  const fallback = useAppearanceStore.getState()

  // Simple scalar/string/boolean fields
  validateStringField(appearance, 'edgeColor')
  validateStringField(appearance, 'faceColor')
  validateStringField(appearance, 'backgroundColor')
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

  return pickKeys(pp, POST_PROCESSING_LOAD_KEYS)
}
