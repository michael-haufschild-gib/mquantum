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

/** Normalize the lights array and selected light id within a lighting record. */
function normalizeLightsArray(lighting: Record<string, unknown>): LightSource[] | null {
  let normalizedLights: LightSource[] | null = null

  if ('lights' in lighting) {
    if (Array.isArray(lighting.lights)) {
      normalizedLights = lighting.lights
        .map((rawLight, index) => normalizeLoadedLight(rawLight, index))
        .filter((light): light is LightSource => light !== null)
        .slice(0, MAX_LIGHTS)

      if (normalizedLights.length > 0) {
        lighting.lights = normalizedLights
      } else {
        delete lighting.lights
      }
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
    const currentSelected =
      typeof lighting.selectedLightId === 'string' ? lighting.selectedLightId : null
    const hasValidSelected =
      currentSelected !== null && normalizedLights.some((light) => light.id === currentSelected)
    lighting.selectedLightId = hasValidSelected ? currentSelected : normalizedLights[0]!.id
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

/** Normalize imported PBR material data: clamp roughness, metallic, reflectance, etc. */
export function normalizePbrLoadData(rawPbr: Record<string, unknown>): Record<string, unknown> {
  const pbr = { ...rawPbr }
  const fallbackFace = usePBRStore.getState().face

  const faceSource =
    pbr.face && typeof pbr.face === 'object' && !Array.isArray(pbr.face)
      ? (pbr.face as Record<string, unknown>)
      : pbr

  const hasAnyFaceField =
    'roughness' in faceSource ||
    'metallic' in faceSource ||
    'reflectance' in faceSource ||
    'specularIntensity' in faceSource ||
    'specularColor' in faceSource ||
    'ior' in faceSource ||
    'transmission' in faceSource ||
    'thickness' in faceSource

  if (hasAnyFaceField) {
    pbr.face = {
      roughness:
        typeof faceSource.roughness === 'number' && Number.isFinite(faceSource.roughness)
          ? clampToRange(faceSource.roughness, 0.04, 1.0)
          : fallbackFace.roughness,
      metallic:
        typeof faceSource.metallic === 'number' && Number.isFinite(faceSource.metallic)
          ? clampToRange(faceSource.metallic, 0.0, 1.0)
          : fallbackFace.metallic,
      reflectance:
        typeof faceSource.reflectance === 'number' && Number.isFinite(faceSource.reflectance)
          ? clampToRange(faceSource.reflectance, 0.0, 1.0)
          : fallbackFace.reflectance,
      specularIntensity:
        typeof faceSource.specularIntensity === 'number' &&
        Number.isFinite(faceSource.specularIntensity)
          ? clampToRange(faceSource.specularIntensity, 0.0, 2.0)
          : fallbackFace.specularIntensity,
      specularColor:
        typeof faceSource.specularColor === 'string'
          ? faceSource.specularColor
          : fallbackFace.specularColor,
      ior:
        typeof faceSource.ior === 'number' && Number.isFinite(faceSource.ior)
          ? clampToRange(faceSource.ior, 1.0, 3.0)
          : fallbackFace.ior,
      transmission:
        typeof faceSource.transmission === 'number' && Number.isFinite(faceSource.transmission)
          ? clampToRange(faceSource.transmission, 0.0, 1.0)
          : fallbackFace.transmission,
      thickness:
        typeof faceSource.thickness === 'number' && Number.isFinite(faceSource.thickness)
          ? clampToRange(faceSource.thickness, 0.0, 10.0)
          : fallbackFace.thickness,
    }
  } else {
    delete pbr.face
  }

  // Drop legacy flat face PBR fields once normalized into `face`.
  delete pbr.roughness
  delete pbr.metallic
  delete pbr.reflectance
  delete pbr.specularIntensity
  delete pbr.specularColor
  delete pbr.ior
  delete pbr.transmission
  delete pbr.thickness

  const normalized: Record<string, unknown> = {}
  if ('face' in pbr) {
    normalized.face = pbr.face
  }

  return normalized
}

/** Normalize imported animation data: clamp speed, validate direction. */
export function normalizeAnimationLoadData(
  rawAnimation: Record<string, unknown>
): Record<string, unknown> {
  const animation = { ...rawAnimation }

  if ('speed' in animation) {
    if (typeof animation.speed === 'number' && Number.isFinite(animation.speed)) {
      animation.speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, animation.speed))
    } else {
      delete animation.speed
    }
  }

  if ('direction' in animation && animation.direction !== 1 && animation.direction !== -1) {
    delete animation.direction
  }

  if ('isPlaying' in animation && typeof animation.isPlaying !== 'boolean') {
    delete animation.isPlaying
  }

  if ('accumulatedTime' in animation) {
    if (
      typeof animation.accumulatedTime !== 'number' ||
      !Number.isFinite(animation.accumulatedTime)
    ) {
      delete animation.accumulatedTime
    }
  }

  if ('animatingPlanes' in animation) {
    if (Array.isArray(animation.animatingPlanes)) {
      animation.animatingPlanes = animation.animatingPlanes.filter(
        (plane): plane is string => typeof plane === 'string'
      )
    } else if (!(animation.animatingPlanes instanceof Set)) {
      delete animation.animatingPlanes
    }
  }

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
