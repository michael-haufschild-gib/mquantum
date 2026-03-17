import type { LightSource, LightType } from '@/rendering/lights/types'
import { COLOR_ALGORITHM_OPTIONS, type ColorAlgorithm } from '@/rendering/shaders/palette'
import {
  MAX_LIGHTS,
  clampConeAngle,
  clampDecay,
  clampIntensity,
  clampPenumbra,
  clampRange,
  createNewLight,
  normalizeRotationTupleSigned,
} from '@/rendering/lights/types'
import { MAX_SPEED, MIN_SPEED } from '../animationStore'
import { useAppearanceStore } from '../appearanceStore'
import { usePBRStore } from '../pbrStore'
import type { SkyboxMode, SkyboxSelection, SkyboxTexture } from '../defaults/visualDefaults'

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
export const APPEARANCE_LOAD_KEYS = [
  'edgeColor',
  'faceColor',
  'backgroundColor',
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

  let selection: SkyboxSelection | null = null
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

/** Normalize imported lighting data: clamp scalars, validate lights array. */
export function normalizeLightingLoadData(
  rawLighting: Record<string, unknown>
): Record<string, unknown> {
  const lighting = { ...rawLighting }

  if ('lightHorizontalAngle' in lighting) {
    if (
      typeof lighting.lightHorizontalAngle === 'number' &&
      Number.isFinite(lighting.lightHorizontalAngle)
    ) {
      lighting.lightHorizontalAngle = ((lighting.lightHorizontalAngle % 360) + 360) % 360
    } else {
      delete lighting.lightHorizontalAngle
    }
  }

  if ('lightVerticalAngle' in lighting) {
    if (
      typeof lighting.lightVerticalAngle === 'number' &&
      Number.isFinite(lighting.lightVerticalAngle)
    ) {
      lighting.lightVerticalAngle = Math.max(-90, Math.min(90, lighting.lightVerticalAngle))
    } else {
      delete lighting.lightVerticalAngle
    }
  }

  if ('ambientIntensity' in lighting) {
    if (
      typeof lighting.ambientIntensity === 'number' &&
      Number.isFinite(lighting.ambientIntensity)
    ) {
      lighting.ambientIntensity = Math.max(0, Math.min(1, lighting.ambientIntensity))
    } else {
      delete lighting.ambientIntensity
    }
  }

  if ('lightStrength' in lighting) {
    if (typeof lighting.lightStrength === 'number' && Number.isFinite(lighting.lightStrength)) {
      lighting.lightStrength = Math.max(0, Math.min(3, lighting.lightStrength))
    } else {
      delete lighting.lightStrength
    }
  }

  if ('exposure' in lighting) {
    if (typeof lighting.exposure === 'number' && Number.isFinite(lighting.exposure)) {
      lighting.exposure = Math.max(0.1, Math.min(3, lighting.exposure))
    } else {
      delete lighting.exposure
    }
  }

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

  if ('transformMode' in lighting) {
    if (lighting.transformMode !== 'translate' && lighting.transformMode !== 'rotate') {
      delete lighting.transformMode
    }
  }

  if ('showLightGizmos' in lighting && typeof lighting.showLightGizmos !== 'boolean') {
    delete lighting.showLightGizmos
  }

  if ('isDraggingLight' in lighting && typeof lighting.isDraggingLight !== 'boolean') {
    delete lighting.isDraggingLight
  }

  const normalized: Record<string, unknown> = {}
  for (const key of LIGHTING_LOAD_KEYS) {
    if (key in lighting) {
      normalized[key] = lighting[key]
    }
  }

  return normalized
}

/** Clamp a numeric value to [min, max]. */
export function clampToRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function clampFiniteOrFallback(value: unknown, min: number, max: number, fallback: number): number {
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

/** Normalize imported appearance data: validate types, clamp ranges, apply defaults. */
export function normalizeAppearanceLoadData(
  rawAppearance: Record<string, unknown>
): Record<string, unknown> {
  const appearance = { ...rawAppearance }
  const fallback = useAppearanceStore.getState()

  if ('edgeColor' in appearance && typeof appearance.edgeColor !== 'string') {
    delete appearance.edgeColor
  }

  if ('faceColor' in appearance && typeof appearance.faceColor !== 'string') {
    delete appearance.faceColor
  }

  if ('backgroundColor' in appearance && typeof appearance.backgroundColor !== 'string') {
    delete appearance.backgroundColor
  }

  if (
    'perDimensionColorEnabled' in appearance &&
    typeof appearance.perDimensionColorEnabled !== 'boolean'
  ) {
    delete appearance.perDimensionColorEnabled
  }

  if ('colorAlgorithm' in appearance) {
    if (
      typeof appearance.colorAlgorithm !== 'string' ||
      !COLOR_ALGORITHM_SET.has(appearance.colorAlgorithm as ColorAlgorithm)
    ) {
      delete appearance.colorAlgorithm
    }
  }

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
      const distribution = appearance.distribution as Record<string, unknown>
      appearance.distribution = {
        power: clampFiniteOrFallback(distribution.power, 0.25, 4, fallback.distribution.power),
        cycles: clampFiniteOrFallback(distribution.cycles, 0.5, 5, fallback.distribution.cycles),
        offset: clampFiniteOrFallback(distribution.offset, 0, 1, fallback.distribution.offset),
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
      const weights = appearance.multiSourceWeights as Record<string, unknown>
      appearance.multiSourceWeights = {
        depth: clampFiniteOrFallback(weights.depth, 0, 1, fallback.multiSourceWeights.depth),
        orbitTrap: clampFiniteOrFallback(
          weights.orbitTrap,
          0,
          1,
          fallback.multiSourceWeights.orbitTrap
        ),
        normal: clampFiniteOrFallback(weights.normal, 0, 1, fallback.multiSourceWeights.normal),
      }
    } else {
      delete appearance.multiSourceWeights
    }
  }

  if ('lchLightness' in appearance) {
    if (typeof appearance.lchLightness === 'number' && Number.isFinite(appearance.lchLightness)) {
      appearance.lchLightness = clampToRange(appearance.lchLightness, 0.1, 1)
    } else {
      delete appearance.lchLightness
    }
  }

  if ('lchChroma' in appearance) {
    if (typeof appearance.lchChroma === 'number' && Number.isFinite(appearance.lchChroma)) {
      appearance.lchChroma = clampToRange(appearance.lchChroma, 0, 0.4)
    } else {
      delete appearance.lchChroma
    }
  }

  if ('domainColoring' in appearance) {
    if (
      appearance.domainColoring &&
      typeof appearance.domainColoring === 'object' &&
      !Array.isArray(appearance.domainColoring)
    ) {
      const domainColoring = appearance.domainColoring as Record<string, unknown>
      appearance.domainColoring = {
        modulusMode: DOMAIN_COLORING_MODULUS_MODE_SET.has(
          domainColoring.modulusMode as typeof DOMAIN_COLORING_MODULUS_MODE_SET extends Set<infer T>
            ? T
            : never
        )
          ? domainColoring.modulusMode
          : fallback.domainColoring.modulusMode,
        contoursEnabled:
          typeof domainColoring.contoursEnabled === 'boolean'
            ? domainColoring.contoursEnabled
            : fallback.domainColoring.contoursEnabled,
        contourDensity: clampFiniteOrFallback(
          domainColoring.contourDensity,
          1,
          32,
          fallback.domainColoring.contourDensity
        ),
        contourWidth: clampFiniteOrFallback(
          domainColoring.contourWidth,
          0.005,
          0.25,
          fallback.domainColoring.contourWidth
        ),
        contourStrength: clampFiniteOrFallback(
          domainColoring.contourStrength,
          0,
          1,
          fallback.domainColoring.contourStrength
        ),
      }
    } else {
      delete appearance.domainColoring
    }
  }

  if ('phaseDiverging' in appearance) {
    if (
      appearance.phaseDiverging &&
      typeof appearance.phaseDiverging === 'object' &&
      !Array.isArray(appearance.phaseDiverging)
    ) {
      const phaseDiverging = appearance.phaseDiverging as Record<string, unknown>
      appearance.phaseDiverging = {
        neutralColor:
          typeof phaseDiverging.neutralColor === 'string'
            ? phaseDiverging.neutralColor
            : fallback.phaseDiverging.neutralColor,
        positiveColor:
          typeof phaseDiverging.positiveColor === 'string'
            ? phaseDiverging.positiveColor
            : fallback.phaseDiverging.positiveColor,
        negativeColor:
          typeof phaseDiverging.negativeColor === 'string'
            ? phaseDiverging.negativeColor
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
      const divergingPsi = appearance.divergingPsi as Record<string, unknown>
      appearance.divergingPsi = {
        neutralColor:
          typeof divergingPsi.neutralColor === 'string'
            ? divergingPsi.neutralColor
            : fallback.divergingPsi.neutralColor,
        positiveColor:
          typeof divergingPsi.positiveColor === 'string'
            ? divergingPsi.positiveColor
            : fallback.divergingPsi.positiveColor,
        negativeColor:
          typeof divergingPsi.negativeColor === 'string'
            ? divergingPsi.negativeColor
            : fallback.divergingPsi.negativeColor,
        intensityFloor: clampFiniteOrFallback(
          divergingPsi.intensityFloor,
          0,
          1,
          fallback.divergingPsi.intensityFloor
        ),
        component: DIVERGING_COMPONENT_SET.has(
          divergingPsi.component as typeof DIVERGING_COMPONENT_SET extends Set<infer T> ? T : never
        )
          ? divergingPsi.component
          : fallback.divergingPsi.component,
      }
    } else {
      delete appearance.divergingPsi
    }
  }

  if ('faceEmission' in appearance) {
    if (typeof appearance.faceEmission === 'number' && Number.isFinite(appearance.faceEmission)) {
      appearance.faceEmission = clampToRange(appearance.faceEmission, 0, 5)
    } else {
      delete appearance.faceEmission
    }
  }

  if ('faceEmissionThreshold' in appearance) {
    if (
      typeof appearance.faceEmissionThreshold === 'number' &&
      Number.isFinite(appearance.faceEmissionThreshold)
    ) {
      appearance.faceEmissionThreshold = clampToRange(appearance.faceEmissionThreshold, 0, 1)
    } else {
      delete appearance.faceEmissionThreshold
    }
  }

  if ('faceEmissionColorShift' in appearance) {
    if (
      typeof appearance.faceEmissionColorShift === 'number' &&
      Number.isFinite(appearance.faceEmissionColorShift)
    ) {
      appearance.faceEmissionColorShift = clampToRange(appearance.faceEmissionColorShift, -1, 1)
    } else {
      delete appearance.faceEmissionColorShift
    }
  }

  if ('shaderType' in appearance) {
    if (
      typeof appearance.shaderType !== 'string' ||
      !SHADER_TYPE_SET.has(
        appearance.shaderType as typeof SHADER_TYPE_SET extends Set<infer T> ? T : never
      )
    ) {
      delete appearance.shaderType
    }
  }

  if ('shaderSettings' in appearance) {
    if (
      appearance.shaderSettings &&
      typeof appearance.shaderSettings === 'object' &&
      !Array.isArray(appearance.shaderSettings)
    ) {
      const shaderSettings = appearance.shaderSettings as Record<string, unknown>
      const wireframe =
        shaderSettings.wireframe &&
        typeof shaderSettings.wireframe === 'object' &&
        !Array.isArray(shaderSettings.wireframe)
          ? (shaderSettings.wireframe as Record<string, unknown>)
          : null
      const surface =
        shaderSettings.surface &&
        typeof shaderSettings.surface === 'object' &&
        !Array.isArray(shaderSettings.surface)
          ? (shaderSettings.surface as Record<string, unknown>)
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

  if ('sssEnabled' in appearance && typeof appearance.sssEnabled !== 'boolean') {
    delete appearance.sssEnabled
  }

  if ('sssIntensity' in appearance) {
    if (typeof appearance.sssIntensity === 'number' && Number.isFinite(appearance.sssIntensity)) {
      appearance.sssIntensity = clampToRange(appearance.sssIntensity, 0, 2)
    } else {
      delete appearance.sssIntensity
    }
  }

  if ('sssColor' in appearance && typeof appearance.sssColor !== 'string') {
    delete appearance.sssColor
  }

  if ('sssThickness' in appearance) {
    if (typeof appearance.sssThickness === 'number' && Number.isFinite(appearance.sssThickness)) {
      appearance.sssThickness = clampToRange(appearance.sssThickness, 0.1, 5)
    } else {
      delete appearance.sssThickness
    }
  }

  if ('sssJitter' in appearance) {
    if (typeof appearance.sssJitter === 'number' && Number.isFinite(appearance.sssJitter)) {
      appearance.sssJitter = clampToRange(appearance.sssJitter, 0, 1)
    } else {
      delete appearance.sssJitter
    }
  }

  const normalized: Record<string, unknown> = {}
  for (const key of APPEARANCE_LOAD_KEYS) {
    if (key in appearance) {
      normalized[key] = appearance[key]
    }
  }

  return normalized
}

/** Normalize imported post-processing data: validate types, clamp ranges, apply defaults. */
export function normalizePostProcessingLoadData(
  rawPostProcessing: Record<string, unknown>
): Record<string, unknown> {
  const postProcessing = { ...rawPostProcessing }

  if ('bloomEnabled' in postProcessing && typeof postProcessing.bloomEnabled !== 'boolean') {
    delete postProcessing.bloomEnabled
  }

  if ('bloomGain' in postProcessing) {
    if (typeof postProcessing.bloomGain === 'number' && Number.isFinite(postProcessing.bloomGain)) {
      postProcessing.bloomGain = clampToRange(postProcessing.bloomGain, 0, 3)
    } else {
      delete postProcessing.bloomGain
    }
  }

  if ('bloomThreshold' in postProcessing) {
    if (
      typeof postProcessing.bloomThreshold === 'number' &&
      Number.isFinite(postProcessing.bloomThreshold)
    ) {
      postProcessing.bloomThreshold = clampToRange(postProcessing.bloomThreshold, 0, 5)
    } else {
      delete postProcessing.bloomThreshold
    }
  }

  if ('bloomKnee' in postProcessing) {
    if (typeof postProcessing.bloomKnee === 'number' && Number.isFinite(postProcessing.bloomKnee)) {
      postProcessing.bloomKnee = clampToRange(postProcessing.bloomKnee, 0, 5)
    } else {
      delete postProcessing.bloomKnee
    }
  }

  if ('bloomRadius' in postProcessing) {
    if (
      typeof postProcessing.bloomRadius === 'number' &&
      Number.isFinite(postProcessing.bloomRadius)
    ) {
      postProcessing.bloomRadius = clampToRange(postProcessing.bloomRadius, 0.25, 4)
    } else {
      delete postProcessing.bloomRadius
    }
  }

  if ('antiAliasingMethod' in postProcessing) {
    if (
      postProcessing.antiAliasingMethod !== 'none' &&
      postProcessing.antiAliasingMethod !== 'fxaa' &&
      postProcessing.antiAliasingMethod !== 'smaa'
    ) {
      delete postProcessing.antiAliasingMethod
    }
  }

  if (
    'cinematicEnabled' in postProcessing &&
    typeof postProcessing.cinematicEnabled !== 'boolean'
  ) {
    delete postProcessing.cinematicEnabled
  }

  if ('cinematicAberration' in postProcessing) {
    if (
      typeof postProcessing.cinematicAberration === 'number' &&
      Number.isFinite(postProcessing.cinematicAberration)
    ) {
      postProcessing.cinematicAberration = clampToRange(postProcessing.cinematicAberration, 0, 0.1)
    } else {
      delete postProcessing.cinematicAberration
    }
  }

  if ('cinematicVignette' in postProcessing) {
    if (
      typeof postProcessing.cinematicVignette === 'number' &&
      Number.isFinite(postProcessing.cinematicVignette)
    ) {
      postProcessing.cinematicVignette = clampToRange(postProcessing.cinematicVignette, 0, 3)
    } else {
      delete postProcessing.cinematicVignette
    }
  }

  if ('cinematicGrain' in postProcessing) {
    if (
      typeof postProcessing.cinematicGrain === 'number' &&
      Number.isFinite(postProcessing.cinematicGrain)
    ) {
      postProcessing.cinematicGrain = clampToRange(postProcessing.cinematicGrain, 0, 0.2)
    } else {
      delete postProcessing.cinematicGrain
    }
  }

  if ('paperEnabled' in postProcessing && typeof postProcessing.paperEnabled !== 'boolean') {
    delete postProcessing.paperEnabled
  }

  if ('paperContrast' in postProcessing) {
    if (
      typeof postProcessing.paperContrast === 'number' &&
      Number.isFinite(postProcessing.paperContrast)
    ) {
      postProcessing.paperContrast = clampToRange(postProcessing.paperContrast, 0, 1)
    } else {
      delete postProcessing.paperContrast
    }
  }

  if ('paperRoughness' in postProcessing) {
    if (
      typeof postProcessing.paperRoughness === 'number' &&
      Number.isFinite(postProcessing.paperRoughness)
    ) {
      postProcessing.paperRoughness = clampToRange(postProcessing.paperRoughness, 0, 1)
    } else {
      delete postProcessing.paperRoughness
    }
  }

  if ('paperFiber' in postProcessing) {
    if (
      typeof postProcessing.paperFiber === 'number' &&
      Number.isFinite(postProcessing.paperFiber)
    ) {
      postProcessing.paperFiber = clampToRange(postProcessing.paperFiber, 0, 1)
    } else {
      delete postProcessing.paperFiber
    }
  }

  if ('paperFiberSize' in postProcessing) {
    if (
      typeof postProcessing.paperFiberSize === 'number' &&
      Number.isFinite(postProcessing.paperFiberSize)
    ) {
      postProcessing.paperFiberSize = clampToRange(postProcessing.paperFiberSize, 0.1, 2)
    } else {
      delete postProcessing.paperFiberSize
    }
  }

  if ('paperCrumples' in postProcessing) {
    if (
      typeof postProcessing.paperCrumples === 'number' &&
      Number.isFinite(postProcessing.paperCrumples)
    ) {
      postProcessing.paperCrumples = clampToRange(postProcessing.paperCrumples, 0, 1)
    } else {
      delete postProcessing.paperCrumples
    }
  }

  if ('paperCrumpleSize' in postProcessing) {
    if (
      typeof postProcessing.paperCrumpleSize === 'number' &&
      Number.isFinite(postProcessing.paperCrumpleSize)
    ) {
      postProcessing.paperCrumpleSize = clampToRange(postProcessing.paperCrumpleSize, 0.1, 2)
    } else {
      delete postProcessing.paperCrumpleSize
    }
  }

  if ('paperFolds' in postProcessing) {
    if (
      typeof postProcessing.paperFolds === 'number' &&
      Number.isFinite(postProcessing.paperFolds)
    ) {
      postProcessing.paperFolds = clampToRange(postProcessing.paperFolds, 0, 1)
    } else {
      delete postProcessing.paperFolds
    }
  }

  if ('paperFoldCount' in postProcessing) {
    if (
      typeof postProcessing.paperFoldCount === 'number' &&
      Number.isFinite(postProcessing.paperFoldCount)
    ) {
      postProcessing.paperFoldCount = clampToRange(Math.round(postProcessing.paperFoldCount), 1, 15)
    } else {
      delete postProcessing.paperFoldCount
    }
  }

  if ('paperDrops' in postProcessing) {
    if (
      typeof postProcessing.paperDrops === 'number' &&
      Number.isFinite(postProcessing.paperDrops)
    ) {
      postProcessing.paperDrops = clampToRange(postProcessing.paperDrops, 0, 1)
    } else {
      delete postProcessing.paperDrops
    }
  }

  if ('paperFade' in postProcessing) {
    if (typeof postProcessing.paperFade === 'number' && Number.isFinite(postProcessing.paperFade)) {
      postProcessing.paperFade = clampToRange(postProcessing.paperFade, 0, 1)
    } else {
      delete postProcessing.paperFade
    }
  }

  if ('paperSeed' in postProcessing) {
    if (typeof postProcessing.paperSeed === 'number' && Number.isFinite(postProcessing.paperSeed)) {
      postProcessing.paperSeed = clampToRange(postProcessing.paperSeed, 0, 1000)
    } else {
      delete postProcessing.paperSeed
    }
  }

  if ('paperColorFront' in postProcessing && typeof postProcessing.paperColorFront !== 'string') {
    delete postProcessing.paperColorFront
  }

  if ('paperColorBack' in postProcessing && typeof postProcessing.paperColorBack !== 'string') {
    delete postProcessing.paperColorBack
  }

  if ('paperQuality' in postProcessing) {
    if (
      postProcessing.paperQuality !== 'low' &&
      postProcessing.paperQuality !== 'medium' &&
      postProcessing.paperQuality !== 'high'
    ) {
      delete postProcessing.paperQuality
    }
  }

  if ('paperIntensity' in postProcessing) {
    if (
      typeof postProcessing.paperIntensity === 'number' &&
      Number.isFinite(postProcessing.paperIntensity)
    ) {
      postProcessing.paperIntensity = clampToRange(postProcessing.paperIntensity, 0, 1)
    } else {
      delete postProcessing.paperIntensity
    }
  }

  if (
    'frameBlendingEnabled' in postProcessing &&
    typeof postProcessing.frameBlendingEnabled !== 'boolean'
  ) {
    delete postProcessing.frameBlendingEnabled
  }

  if ('frameBlendingFactor' in postProcessing) {
    if (
      typeof postProcessing.frameBlendingFactor === 'number' &&
      Number.isFinite(postProcessing.frameBlendingFactor)
    ) {
      postProcessing.frameBlendingFactor = clampToRange(postProcessing.frameBlendingFactor, 0, 1)
    } else {
      delete postProcessing.frameBlendingFactor
    }
  }

  const normalized: Record<string, unknown> = {}
  for (const key of POST_PROCESSING_LOAD_KEYS) {
    if (key in postProcessing) {
      normalized[key] = postProcessing[key]
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
    'specularColor' in faceSource

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
