/**
 * Shared constants and utilities for preset normalization.
 *
 * Extracted from presetNormalization.ts so that presetNormalizationVisual.ts
 * can import these without creating a circular dependency.
 *
 * @module stores/utils/presetNormalizationShared
 */

import { COLOR_ALGORITHM_OPTIONS, type ColorAlgorithm } from '@/rendering/shaders/palette'

import type { SkyboxMode, SkyboxSelection, SkyboxTexture } from '../defaults/visualDefaults'

// ============================================================================
// Validation Sets
// ============================================================================

export const SKYBOX_SELECTION_SET = new Set<SkyboxSelection>([
  'none',
  'space_blue',
  'space_lightblue',
  'space_red',
  'procedural_aurora',
  'procedural_nebula',
  'procedural_crystalline',
  'procedural_horizon',
  'procedural_ocean',
  'procedural_twilight',
])

export const PROCEDURAL_SKYBOX_MODE_SET = new Set<SkyboxMode>([
  'procedural_aurora',
  'procedural_nebula',
  'procedural_crystalline',
  'procedural_horizon',
  'procedural_ocean',
  'procedural_twilight',
])

export const SKYBOX_TEXTURE_SET = new Set<SkyboxTexture>([
  'none',
  'space_blue',
  'space_lightblue',
  'space_red',
])

export const COLOR_ALGORITHM_SET = new Set<ColorAlgorithm>(
  COLOR_ALGORITHM_OPTIONS.map((option) => option.value)
)
export const DOMAIN_COLORING_MODULUS_MODE_SET = new Set(['logPsiAbsSquared', 'logPsiAbs'] as const)
export const DIVERGING_COMPONENT_SET = new Set(['real', 'imag'] as const)
export const SHADER_TYPE_SET = new Set(['wireframe', 'surface'] as const)

// ============================================================================
// Load Key Lists
// ============================================================================

export const POST_PROCESSING_LOAD_KEYS = [
  'bloomEnabled',
  'bloomGain',
  'bloomThreshold',
  'bloomKnee',
  'bloomRadius',
  'antiAliasingMethod',
  'cinematicEnabled',
  'cinematicAberration',
  'cinematicVignette',
  'cinematicGrain',
  'paperEnabled',
  'paperContrast',
  'paperRoughness',
  'paperFiber',
  'paperFiberSize',
  'paperCrumples',
  'paperCrumpleSize',
  'paperFolds',
  'paperFoldCount',
  'paperDrops',
  'paperFade',
  'paperSeed',
  'paperColorFront',
  'paperColorBack',
  'paperQuality',
  'paperIntensity',
  'frameBlendingEnabled',
  'frameBlendingFactor',
] as const

export const APPEARANCE_LOAD_KEYS = [
  'edgeColor',
  'faceColor',
  'perDimensionColorEnabled',
  'colorAlgorithm',
  'cosineCoefficients',
  'distribution',
  'multiSourceWeights',
  'lchLightness',
  'lchChroma',
  'domainColoring',
  'phaseDiverging',
  'divergingPsi',
  'faceEmission',
  'faceEmissionThreshold',
  'faceEmissionColorShift',
  'shaderType',
  'shaderSettings',
  'sssEnabled',
  'sssIntensity',
  'sssColor',
  'sssThickness',
  'sssJitter',
] as const

// ============================================================================
// Utility Functions
// ============================================================================

/** Clamp a numeric value to [min, max]. */
export function clampToRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Clamp to range or return fallback if value is not a finite number. */
export function clampFiniteOrFallback(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return clampToRange(value, min, max)
}

/** Validate a cosine palette vector, returning fallback if invalid. */
export function normalizeCosineVector(
  value: unknown,
  fallback: [number, number, number]
): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    return fallback
  }
  return [
    clampFiniteOrFallback(value[0], 0, 2, fallback[0]),
    clampFiniteOrFallback(value[1], 0, 2, fallback[1]),
    clampFiniteOrFallback(value[2], 0, 2, fallback[2]),
  ]
}
