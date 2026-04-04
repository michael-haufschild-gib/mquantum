export {
  normalizeAppearanceLoadData,
  normalizePostProcessingLoadData,
} from './presetNormalizationVisual'
// Re-export shared constants so existing consumers don't need to change imports.
export {
  APPEARANCE_LOAD_KEYS,
  clampToRange,
  COLOR_ALGORITHM_SET,
  DIVERGING_COMPONENT_SET,
  DOMAIN_COLORING_MODULUS_MODE_SET,
  normalizeCosineVector,
  POST_PROCESSING_LOAD_KEYS,
  PROCEDURAL_SKYBOX_MODE_SET,
  SHADER_TYPE_SET,
  SKYBOX_SELECTION_SET,
  SKYBOX_TEXTURE_SET,
} from './presetNormalizationShared'
import type { LightSource, LightType } from '@/rendering/lights/types'
import {
  clampConeAngle,
  clampDecay,
  clampIntensity,
  clampPenumbra,
  clampRange,
  createNewLight,
  MAX_LIGHTS,
  normalizeRotationTupleSigned,
} from '@/rendering/lights/types'

import { MAX_SPEED, MIN_SPEED } from '../animationStore'
import type { SkyboxMode, SkyboxSelection, SkyboxTexture } from '../defaults/visualDefaults'
import { usePBRStore } from '../pbrStore'
import {
  clampToRange,
  PROCEDURAL_SKYBOX_MODE_SET,
  SKYBOX_SELECTION_SET,
  SKYBOX_TEXTURE_SET,
} from './presetNormalizationShared'

export const LIGHTING_LOAD_KEYS = [
  'lightEnabled',
  'lightColor',
  'lightHorizontalAngle',
  'lightVerticalAngle',
  'ambientEnabled',
  'ambientIntensity',
  'ambientColor',
  'showLightIndicator',
  'lightStrength',
  'toneMappingEnabled',
  'toneMappingAlgorithm',
  'exposure',
  'lights',
  'selectedLightId',
  'transformMode',
  'showLightGizmos',
  'isDraggingLight',
] as const
export const ENVIRONMENT_LOAD_KEYS = [
  'backgroundColor',
  'skyboxSelection',
  'skyboxEnabled',
  'skyboxMode',
  'skyboxTexture',
  'skyboxIntensity',
  'skyboxRotation',
  'skyboxHighQuality',
  'skyboxAnimationMode',
  'skyboxAnimationSpeed',
  'proceduralSettings',
] as const
export const ANIMATION_LOAD_KEYS = [
  'speed',
  'direction',
  'isPlaying',
  'accumulatedTime',
  'animatingPlanes',
] as const

/** Generate a unique name for an imported preset by appending "(imported N)" if needed. */
export function makeUniqueImportedName(baseName: string, usedNames: Set<string>): string {
  if (!usedNames.has(baseName)) {
    return baseName
  }

  const importedBase = `${baseName} (imported)`
  if (!usedNames.has(importedBase)) {
    return importedBase
  }

  let suffix = 2
  let candidate = `${baseName} (imported ${suffix})`
  while (usedNames.has(candidate)) {
    suffix += 1
    candidate = `${baseName} (imported ${suffix})`
  }
  return candidate
}

/** Type guard: value is a non-empty trimmed string. */
export function isNonEmptyTrimmedString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Type guard: value is a valid SkyboxSelection. */
export function isSkyboxSelection(value: unknown): value is SkyboxSelection {
  return typeof value === 'string' && SKYBOX_SELECTION_SET.has(value as SkyboxSelection)
}

/** Type guard: value is a procedural skybox mode. */
export function isProceduralSkyboxMode(value: unknown): value is Exclude<SkyboxMode, 'classic'> {
  return typeof value === 'string' && PROCEDURAL_SKYBOX_MODE_SET.has(value as SkyboxMode)
}

/** Type guard: value is a valid SkyboxTexture. */
export function isSkyboxTexture(value: unknown): value is SkyboxTexture {
  return typeof value === 'string' && SKYBOX_TEXTURE_SET.has(value as SkyboxTexture)
}

/** Derive skybox enabled/mode/texture state from a unified skybox selection value. */
export function deriveSkyboxStateFromSelection(selection: SkyboxSelection): {
  skyboxEnabled: boolean
  skyboxMode: SkyboxMode
  skyboxTexture: SkyboxTexture
} {
  if (selection === 'none') {
    return {
      skyboxEnabled: false,
      skyboxMode: 'classic',
      skyboxTexture: 'none',
    }
  }

  if (isProceduralSkyboxMode(selection)) {
    return {
      skyboxEnabled: true,
      skyboxMode: selection,
      skyboxTexture: 'space_blue',
    }
  }

  return {
    skyboxEnabled: true,
    skyboxMode: 'classic',
    skyboxTexture: selection as SkyboxTexture,
  }
}

/**
 * Normalize imported environment payloads so unified skybox fields stay in sync.
 * Legacy presets may omit `skyboxSelection` or include removed fields like `classicSkyboxType`.
 */
export function normalizeEnvironmentLoadData(
  rawEnvironment: Record<string, unknown>
): Record<string, unknown> {
  const environment = { ...rawEnvironment }
  delete environment.classicSkyboxType

  let selection: SkyboxSelection
  if (isSkyboxSelection(environment.skyboxSelection)) {
    selection = environment.skyboxSelection
  } else if (environment.skyboxEnabled === false) {
    selection = 'none'
  } else if (isProceduralSkyboxMode(environment.skyboxMode)) {
    selection = environment.skyboxMode
  } else if (isSkyboxTexture(environment.skyboxTexture) && environment.skyboxTexture !== 'none') {
    selection = environment.skyboxTexture
  } else {
    selection = 'none'
  }

  const normalized: Record<string, unknown> = {}
  for (const key of ENVIRONMENT_LOAD_KEYS) {
    if (key in environment) {
      normalized[key] = environment[key]
    }
  }

  return {
    ...normalized,
    skyboxSelection: selection,
    ...deriveSkyboxStateFromSelection(selection),
  }
}

function isLightType(value: unknown): value is LightType {
  return value === 'point' || value === 'directional' || value === 'spot'
}

function isFiniteVec3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => typeof component === 'number' && Number.isFinite(component))
  )
}

/** Validate and normalize a single light source from imported preset data. */
export function normalizeLoadedLight(rawLight: unknown, index: number): LightSource | null {
  if (!rawLight || typeof rawLight !== 'object') {
    return null
  }

  const light = rawLight as Record<string, unknown>
  const type: LightType = isLightType(light.type) ? light.type : 'point'
  const baseLight = createNewLight(type, index)

  const position: [number, number, number] = isFiniteVec3(light.position)
    ? [light.position[0], light.position[1], light.position[2]]
    : baseLight.position
  const rotation: [number, number, number] = isFiniteVec3(light.rotation)
    ? normalizeRotationTupleSigned([light.rotation[0], light.rotation[1], light.rotation[2]])
    : baseLight.rotation

  return {
    ...baseLight,
    id: typeof light.id === 'string' && light.id.trim().length > 0 ? light.id : baseLight.id,
    name:
      typeof light.name === 'string' && light.name.trim().length > 0 ? light.name : baseLight.name,
    type,
    enabled: typeof light.enabled === 'boolean' ? light.enabled : baseLight.enabled,
    position,
    rotation,
    color: typeof light.color === 'string' ? light.color : baseLight.color,
    intensity:
      typeof light.intensity === 'number' ? clampIntensity(light.intensity) : baseLight.intensity,
    coneAngle:
      typeof light.coneAngle === 'number' ? clampConeAngle(light.coneAngle) : baseLight.coneAngle,
    penumbra:
      typeof light.penumbra === 'number' ? clampPenumbra(light.penumbra) : baseLight.penumbra,
    range: typeof light.range === 'number' ? clampRange(light.range) : baseLight.range,
    decay: typeof light.decay === 'number' ? clampDecay(light.decay) : baseLight.decay,
  }
}

/**
 * Validate and clamp a numeric field in a record. If the field exists and is a
 * finite number, apply the transform (default: clamp to [min, max]). Otherwise
 * delete the field.
 */
function clampNumericField(
  obj: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  transform?: (v: number) => number
): void {
  if (!(key in obj)) return
  const v = obj[key]
  if (typeof v === 'number' && Number.isFinite(v)) {
    obj[key] = transform ? transform(v) : Math.max(min, Math.min(max, v))
  } else {
    delete obj[key]
  }
}

/**
 * Validate a boolean field in a record. If the field exists but is not boolean,
 * delete it.
 */
function validateBooleanField(obj: Record<string, unknown>, key: string): void {
  if (key in obj && typeof obj[key] !== 'boolean') {
    delete obj[key]
  }
}

/** Parse and validate the raw lights array, returning valid lights or null. */
function parseLightsArray(rawLights: unknown): LightSource[] | null {
  if (!Array.isArray(rawLights)) return null
  const parsed = rawLights
    .map((rawLight, index) => normalizeLoadedLight(rawLight, index))
    .filter((light): light is LightSource => light !== null)
    .slice(0, MAX_LIGHTS)
  return parsed.length > 0 ? parsed : null
}

/** Ensure selectedLightId references an existing light from the normalized array. */
function reconcileSelectedLightId(lighting: Record<string, unknown>, lights: LightSource[]): void {
  const currentSelected =
    typeof lighting.selectedLightId === 'string' ? lighting.selectedLightId : null
  const hasValidSelected =
    currentSelected !== null && lights.some((light) => light.id === currentSelected)
  lighting.selectedLightId = hasValidSelected ? currentSelected : lights[0]!.id
}

/** Normalize the lights array and selected light id within a lighting record. */
function normalizeLightsArray(lighting: Record<string, unknown>): LightSource[] | null {
  let normalizedLights: LightSource[] | null = null

  if ('lights' in lighting) {
    normalizedLights = parseLightsArray(lighting.lights)
    if (normalizedLights) {
      lighting.lights = normalizedLights
    } else {
      delete lighting.lights
    }
  }

  if ('selectedLightId' in lighting) {
    if (lighting.selectedLightId !== null && typeof lighting.selectedLightId !== 'string') {
      delete lighting.selectedLightId
    }
  }

  if (normalizedLights && normalizedLights.length > 0) {
    reconcileSelectedLightId(lighting, normalizedLights)
  }

  return normalizedLights
}

/** Normalize imported lighting data: clamp scalars, validate lights array. */
export function normalizeLightingLoadData(
  rawLighting: Record<string, unknown>
): Record<string, unknown> {
  const lighting = { ...rawLighting }

  clampNumericField(lighting, 'lightHorizontalAngle', 0, 360, (v) => ((v % 360) + 360) % 360)
  clampNumericField(lighting, 'lightVerticalAngle', -90, 90)
  clampNumericField(lighting, 'ambientIntensity', 0, 1)
  clampNumericField(lighting, 'lightStrength', 0, 3)
  clampNumericField(lighting, 'exposure', 0.1, 3)

  normalizeLightsArray(lighting)

  if ('transformMode' in lighting) {
    if (lighting.transformMode !== 'translate' && lighting.transformMode !== 'rotate') {
      delete lighting.transformMode
    }
  }

  validateBooleanField(lighting, 'showLightGizmos')
  validateBooleanField(lighting, 'isDraggingLight')

  const normalized: Record<string, unknown> = {}
  for (const key of LIGHTING_LOAD_KEYS) {
    if (key in lighting) {
      normalized[key] = lighting[key]
    }
  }

  return normalized
}

/** Numeric PBR face field descriptors: [min, max]. */
const PBR_FACE_NUMERIC_FIELDS: readonly (readonly [string, number, number])[] = [
  ['roughness', 0.04, 1.0],
  ['metallic', 0.0, 1.0],
  ['reflectance', 0.0, 1.0],
  ['specularIntensity', 0.0, 2.0],
  ['ior', 1.0, 3.0],
  ['transmission', 0.0, 1.0],
  ['thickness', 0.0, 10.0],
] as const

/** All PBR face field names (numeric + string). */
const PBR_FACE_ALL_KEYS = [...PBR_FACE_NUMERIC_FIELDS.map(([k]) => k), 'specularColor'] as const

/** Build a normalized face object from source fields and fallback defaults. */
function buildNormalizedFace(
  source: Record<string, unknown>,
  fallback: Record<string, unknown>
): Record<string, unknown> {
  const face: Record<string, unknown> = {}
  for (const [key, min, max] of PBR_FACE_NUMERIC_FIELDS) {
    const v = source[key]
    face[key] =
      typeof v === 'number' && Number.isFinite(v) ? clampToRange(v, min, max) : fallback[key]
  }
  face.specularColor =
    typeof source.specularColor === 'string' ? source.specularColor : fallback.specularColor
  return face
}

/** Normalize imported PBR material data: clamp roughness, metallic, reflectance, etc. */
export function normalizePbrLoadData(rawPbr: Record<string, unknown>): Record<string, unknown> {
  const pbr = { ...rawPbr }
  const fallbackFace = usePBRStore.getState().face as unknown as Record<string, unknown>

  const faceSource =
    pbr.face && typeof pbr.face === 'object' && !Array.isArray(pbr.face)
      ? (pbr.face as Record<string, unknown>)
      : pbr

  const hasAnyFaceField = PBR_FACE_ALL_KEYS.some((key) => key in faceSource)

  if (hasAnyFaceField) {
    pbr.face = buildNormalizedFace(faceSource, fallbackFace)
  } else {
    delete pbr.face
  }

  // Drop legacy flat face PBR fields once normalized into `face`.
  for (const key of PBR_FACE_ALL_KEYS) {
    delete pbr[key]
  }

  const normalized: Record<string, unknown> = {}
  if ('face' in pbr) {
    normalized.face = pbr.face
  }

  return normalized
}

/** Validate the animatingPlanes field: keep arrays of strings and Sets, delete anything else. */
function validateAnimatingPlanes(animation: Record<string, unknown>): void {
  if (!('animatingPlanes' in animation)) return
  if (Array.isArray(animation.animatingPlanes)) {
    animation.animatingPlanes = animation.animatingPlanes.filter(
      (plane): plane is string => typeof plane === 'string'
    )
  } else if (!(animation.animatingPlanes instanceof Set)) {
    delete animation.animatingPlanes
  }
}

/** Validate a finite-number field: delete if not a finite number. */
function validateFiniteField(obj: Record<string, unknown>, key: string): void {
  if (!(key in obj)) return
  if (typeof obj[key] !== 'number' || !Number.isFinite(obj[key])) {
    delete obj[key]
  }
}

/** Normalize imported animation data: clamp speed, validate direction. */
export function normalizeAnimationLoadData(
  rawAnimation: Record<string, unknown>
): Record<string, unknown> {
  const animation = { ...rawAnimation }

  clampNumericField(animation, 'speed', MIN_SPEED, MAX_SPEED)

  if ('direction' in animation && animation.direction !== 1 && animation.direction !== -1) {
    delete animation.direction
  }

  validateBooleanField(animation, 'isPlaying')
  validateFiniteField(animation, 'accumulatedTime')
  validateAnimatingPlanes(animation)

  const normalized: Record<string, unknown> = {}
  for (const key of ANIMATION_LOAD_KEYS) {
    if (key in animation) {
      normalized[key] = animation[key]
    }
  }

  return normalized
}

/** Normalize imported UI data: clamp animation bias to [0, 1]. */
export function normalizeUiLoadData(rawUi: Record<string, unknown>): Record<string, unknown> {
  const ui: Record<string, unknown> = {}

  if ('animationBias' in rawUi) {
    const rawAnimationBias = rawUi.animationBias
    if (typeof rawAnimationBias === 'number' && Number.isFinite(rawAnimationBias)) {
      ui.animationBias = clampToRange(rawAnimationBias, 0, 1)
    }
  }

  return ui
}
