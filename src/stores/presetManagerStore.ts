import { showConditionalMsgBox } from '@/hooks/useConditionalMsgBox'
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
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { MAX_SPEED, MIN_SPEED, useAnimationStore } from './animationStore'
import { useAppearanceStore } from './appearanceStore'
import { useCameraStore } from './cameraStore'
import { DIALOG_IDS } from './dismissedDialogsStore'
import { useEnvironmentStore } from './environmentStore'
import { useExtendedObjectStore } from './extendedObjectStore'
import { useGeometryStore } from './geometryStore'
import { useLightingStore } from './lightingStore'
import { useMsgBoxStore } from './msgBoxStore'
import { usePBRStore } from './pbrStore'
import { usePerformanceStore } from './performanceStore'
import { usePostProcessingStore } from './postProcessingStore'
import { useRotationStore } from './rotationStore'
import { useTransformStore } from './transformStore'
import { useUIStore } from './uiStore'
import type { SkyboxMode, SkyboxSelection, SkyboxTexture } from './defaults/visualDefaults'
import { mergeExtendedObjectStateForType } from './utils/mergeWithDefaults'
import {
  serializeState,
  serializeAnimationState,
  serializeRotationState,
  serializeExtendedState,
  sanitizeLoadedState,
  sanitizeExtendedLoadedState,
  sanitizeStyleData,
  sanitizeSceneData,
} from './utils/presetSerialization'

/**
 * Pending rAF ID for scene load completion.
 * Used to cancel stale callbacks when rapid scene loads occur.
 */
let pendingSceneLoadRafId: number | null = null

/**
 * Schedules scene load completion after React settles.
 * Cancels any pending callback to prevent race conditions.
 */
function scheduleSceneLoadComplete(): void {
  // Cancel any pending callback to prevent premature completion
  if (pendingSceneLoadRafId !== null) {
    cancelAnimationFrame(pendingSceneLoadRafId)
  }

  pendingSceneLoadRafId = requestAnimationFrame(() => {
    pendingSceneLoadRafId = null
    usePerformanceStore.getState().setIsLoadingScene(false)
    usePerformanceStore.getState().setSceneTransitioning(false)
  })
}

const SKYBOX_SELECTION_SET = new Set<SkyboxSelection>([
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

const PROCEDURAL_SKYBOX_MODE_SET = new Set<SkyboxMode>([
  'procedural_aurora',
  'procedural_nebula',
  'procedural_crystalline',
  'procedural_horizon',
  'procedural_ocean',
  'procedural_twilight',
])

const SKYBOX_TEXTURE_SET = new Set<SkyboxTexture>([
  'none',
  'space_blue',
  'space_lightblue',
  'space_red',
])

const COLOR_ALGORITHM_SET = new Set<ColorAlgorithm>(
  COLOR_ALGORITHM_OPTIONS.map((option) => option.value)
)
const DOMAIN_COLORING_MODULUS_MODE_SET = new Set(['logPsiAbsSquared', 'logPsiAbs'] as const)
const DIVERGING_COMPONENT_SET = new Set(['real', 'imag'] as const)
const SHADER_TYPE_SET = new Set(['wireframe', 'surface'] as const)
const POST_PROCESSING_LOAD_KEYS = [
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
const LIGHTING_LOAD_KEYS = [
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
const ENVIRONMENT_LOAD_KEYS = [
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
const APPEARANCE_LOAD_KEYS = [
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
const ANIMATION_LOAD_KEYS = [
  'speed',
  'direction',
  'isPlaying',
  'accumulatedTime',
  'animatingPlanes',
] as const

function makeUniqueImportedName(baseName: string, usedNames: Set<string>): string {
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

function isNonEmptyTrimmedString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isSkyboxSelection(value: unknown): value is SkyboxSelection {
  return typeof value === 'string' && SKYBOX_SELECTION_SET.has(value as SkyboxSelection)
}

function isProceduralSkyboxMode(value: unknown): value is Exclude<SkyboxMode, 'classic'> {
  return typeof value === 'string' && PROCEDURAL_SKYBOX_MODE_SET.has(value as SkyboxMode)
}

function isSkyboxTexture(value: unknown): value is SkyboxTexture {
  return typeof value === 'string' && SKYBOX_TEXTURE_SET.has(value as SkyboxTexture)
}

function deriveSkyboxStateFromSelection(selection: SkyboxSelection): {
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
function normalizeEnvironmentLoadData(rawEnvironment: Record<string, unknown>): Record<string, unknown> {
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

function normalizeLoadedLight(rawLight: unknown, index: number): LightSource | null {
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
      typeof light.name === 'string' && light.name.trim().length > 0
        ? light.name
        : baseLight.name,
    type,
    enabled: typeof light.enabled === 'boolean' ? light.enabled : baseLight.enabled,
    position,
    rotation,
    color: typeof light.color === 'string' ? light.color : baseLight.color,
    intensity: typeof light.intensity === 'number' ? clampIntensity(light.intensity) : baseLight.intensity,
    coneAngle:
      typeof light.coneAngle === 'number' ? clampConeAngle(light.coneAngle) : baseLight.coneAngle,
    penumbra:
      typeof light.penumbra === 'number' ? clampPenumbra(light.penumbra) : baseLight.penumbra,
    range: typeof light.range === 'number' ? clampRange(light.range) : baseLight.range,
    decay: typeof light.decay === 'number' ? clampDecay(light.decay) : baseLight.decay,
  }
}

function normalizeLightingLoadData(rawLighting: Record<string, unknown>): Record<string, unknown> {
  const lighting = { ...rawLighting }

  if ('lightHorizontalAngle' in lighting) {
    if (typeof lighting.lightHorizontalAngle === 'number' && Number.isFinite(lighting.lightHorizontalAngle)) {
      lighting.lightHorizontalAngle =
        ((lighting.lightHorizontalAngle % 360) + 360) % 360
    } else {
      delete lighting.lightHorizontalAngle
    }
  }

  if ('lightVerticalAngle' in lighting) {
    if (typeof lighting.lightVerticalAngle === 'number' && Number.isFinite(lighting.lightVerticalAngle)) {
      lighting.lightVerticalAngle = Math.max(-90, Math.min(90, lighting.lightVerticalAngle))
    } else {
      delete lighting.lightVerticalAngle
    }
  }

  if ('ambientIntensity' in lighting) {
    if (typeof lighting.ambientIntensity === 'number' && Number.isFinite(lighting.ambientIntensity)) {
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
      currentSelected !== null &&
      normalizedLights.some((light) => light.id === currentSelected)
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

function clampToRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function clampFiniteOrFallback(
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

function normalizeCosineVector(
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

function normalizeAppearanceLoadData(rawAppearance: Record<string, unknown>): Record<string, unknown> {
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
          domainColoring.modulusMode as (typeof DOMAIN_COLORING_MODULUS_MODE_SET extends Set<infer T>
            ? T
            : never)
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
          divergingPsi.component as (typeof DIVERGING_COMPONENT_SET extends Set<infer T> ? T : never)
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
        appearance.shaderType as (typeof SHADER_TYPE_SET extends Set<infer T> ? T : never)
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

function normalizePostProcessingLoadData(
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
    if (typeof postProcessing.bloomRadius === 'number' && Number.isFinite(postProcessing.bloomRadius)) {
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

  if ('cinematicEnabled' in postProcessing && typeof postProcessing.cinematicEnabled !== 'boolean') {
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
    if (typeof postProcessing.paperContrast === 'number' && Number.isFinite(postProcessing.paperContrast)) {
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
    if (typeof postProcessing.paperFiber === 'number' && Number.isFinite(postProcessing.paperFiber)) {
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
    if (typeof postProcessing.paperFolds === 'number' && Number.isFinite(postProcessing.paperFolds)) {
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
    if (typeof postProcessing.paperDrops === 'number' && Number.isFinite(postProcessing.paperDrops)) {
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

function normalizePbrLoadData(rawPbr: Record<string, unknown>): Record<string, unknown> {
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

function normalizeAnimationLoadData(rawAnimation: Record<string, unknown>): Record<string, unknown> {
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

function normalizeUiLoadData(rawUi: Record<string, unknown>): Record<string, unknown> {
  const ui: Record<string, unknown> = {}

  if ('animationBias' in rawUi) {
    const rawAnimationBias = rawUi.animationBias
    if (typeof rawAnimationBias === 'number' && Number.isFinite(rawAnimationBias)) {
      ui.animationBias = clampToRange(rawAnimationBias, 0, 1)
    }
  }

  return ui
}

// -- Types --

/**
 * Persisted style preset payload.
 */
export interface SavedStyle {
  id: string
  name: string
  timestamp: number
  data: {
    appearance: Record<string, unknown>
    lighting: Record<string, unknown>
    postProcessing: Record<string, unknown>
    environment: Record<string, unknown>
    pbr: Record<string, unknown>
  }
}

/**
 * Persisted scene preset payload.
 */
export interface SavedScene {
  id: string
  name: string
  timestamp: number
  data: {
    // Style components
    appearance: Record<string, unknown>
    lighting: Record<string, unknown>
    postProcessing: Record<string, unknown>
    environment: Record<string, unknown>
    pbr: Record<string, unknown>

    // Scene specific components
    geometry: Record<string, unknown>
    extended: Record<string, unknown>
    transform: Record<string, unknown>
    rotation: Record<string, unknown> // Stores Map as Object/Array
    animation: Record<string, unknown> // Stores Set as Array
    camera: Record<string, unknown>
    ui: Record<string, unknown>
  }
}

/**
 * Preset manager store state and actions.
 */
export interface PresetManagerState {
  savedStyles: SavedStyle[]
  savedScenes: SavedScene[]

  // Style Actions
  saveStyle: (name: string) => void
  loadStyle: (id: string) => void
  deleteStyle: (id: string) => void
  renameStyle: (id: string, newName: string) => void
  importStyles: (jsonData: string) => boolean
  exportStyles: () => string

  // Scene Actions
  saveScene: (name: string) => void
  loadScene: (id: string) => void
  deleteScene: (id: string) => void
  renameScene: (id: string, newName: string) => void
  importScenes: (jsonData: string) => boolean
  exportScenes: () => string
}

export const usePresetManagerStore = create<PresetManagerState>()(
  persist(
    (set, get) => ({
      savedStyles: [],
      savedScenes: [],

      // --- Style Actions ---

      saveStyle: (name) => {
        // Validate and sanitize name
        const trimmedName = name.trim()
        if (!trimmedName) {
          console.warn('Cannot save style with empty name')
          return
        }

        // Deep clone all states to prevent reference sharing
        const appearance = serializeState(useAppearanceStore.getState())
        const lighting = serializeState(useLightingStore.getState())
        const postProcessing = serializeState(usePostProcessingStore.getState())
        const environment = serializeState(useEnvironmentStore.getState())
        const pbr = serializeState(usePBRStore.getState())

        const newStyle: SavedStyle = {
          id: crypto.randomUUID(),
          name: trimmedName,
          timestamp: Date.now(),
          data: {
            appearance,
            lighting,
            postProcessing,
            environment,
            pbr,
          },
        }

        set((state) => ({ savedStyles: [...state.savedStyles, newStyle] }))

        // Show localStorage warning (can be dismissed permanently)
        showConditionalMsgBox(
          DIALOG_IDS.PRESET_SAVE_STYLE_WARNING,
          'Style Saved Locally',
          "Your style preset is stored in your browser's localStorage. This data may be lost if you clear browser data or use private browsing.\n\nFor permanent backup, use the Export function to save your styles as a JSON file.",
          'info',
          [
            {
              label: 'Got it',
              variant: 'primary',
              onClick: () => useMsgBoxStore.getState().closeMsgBox(),
            },
          ]
        )
      },

      loadStyle: (id) => {
        const style = get().savedStyles.find((s) => s.id === id)
        if (!style) return

        // Signal scene transition start
        usePerformanceStore.getState().setSceneTransitioning(true)

        // Restore states with transient fields stripped
        // This ensures legacy presets with version fields don't corrupt current counters
        useAppearanceStore.setState(
          normalizeAppearanceLoadData(sanitizeLoadedState(style.data.appearance))
        )
        useLightingStore.setState(normalizeLightingLoadData(sanitizeLoadedState(style.data.lighting)))
        usePostProcessingStore.setState(
          normalizePostProcessingLoadData(sanitizeLoadedState(style.data.postProcessing))
        )

        // Handle legacy environment data and keep unified skybox fields canonical.
        const envData = normalizeEnvironmentLoadData(
          sanitizeLoadedState({ ...style.data.environment })
        )
        useEnvironmentStore.setState(envData)

        // Restore PBR settings (legacy imports without pbr should reset to defaults)
        const stylePbrData = style.data.pbr
          ? sanitizeLoadedState(style.data.pbr)
          : ({} as Record<string, unknown>)
        if (Object.keys(stylePbrData).length > 0) {
          usePBRStore.setState(normalizePbrLoadData(stylePbrData))
        } else {
          usePBRStore.getState().resetPBR()
        }

        // Bump version counters to trigger re-renders after direct setState calls
        // This is necessary because setState bypasses the wrapped setters that auto-increment versions
        useAppearanceStore.getState().bumpVersion()
        useLightingStore.getState().bumpVersion()

        useEnvironmentStore.getState().bumpAllVersions()
        usePBRStore.getState().bumpVersion()

        // Increment preset load version to trigger material recreation in renderers
        // This ensures material properties (transparent, depthWrite) match loaded state
        usePerformanceStore.getState().incrementPresetLoadVersion()

        requestAnimationFrame(() => {
          usePerformanceStore.getState().setSceneTransitioning(false)
        })
      },

      deleteStyle: (id) => {
        set((state) => ({ savedStyles: state.savedStyles.filter((s) => s.id !== id) }))
      },

      renameStyle: (id, newName) => {
        const trimmedName = newName.trim()
        if (!trimmedName) {
          console.warn('Cannot rename style to empty name')
          return
        }
        set((state) => ({
          savedStyles: state.savedStyles.map((s) =>
            s.id === id ? { ...s, name: trimmedName } : s
          ),
        }))
      },

      importStyles: (jsonData) => {
        try {
          const imported = JSON.parse(jsonData)
          if (!Array.isArray(imported)) {
            useMsgBoxStore
              .getState()
              .showMsgBox('Import Failed', 'Invalid format: expected an array of styles.', 'error')
            return false
          }
          // Comprehensive validation: Check all required SavedStyle fields
          const valid = imported.every(
            (i) =>
              i.id &&
              isNonEmptyTrimmedString(i.name) &&
              i.timestamp &&
              i.data &&
              i.data.appearance &&
              i.data.lighting &&
              i.data.postProcessing &&
              i.data.environment
          )
          if (!valid) {
            useMsgBoxStore
              .getState()
              .showMsgBox(
                'Import Failed',
                'The style data is corrupted or incompatible. Styles must contain appearance, lighting, postProcessing, and environment data.',
                'error'
              )
            return false
          }

          // Regenerate IDs to prevent duplicates and sanitize data
          const usedNames = new Set(get().savedStyles.map((s) => s.name))
          const processedStyles = imported.map((style) => {
            // Always generate a new ID to ensure uniqueness
            const newId = crypto.randomUUID()
            const rawName = style.name.trim()
            const newName = makeUniqueImportedName(rawName, usedNames)
            usedNames.add(newName)
            return {
              ...style,
              id: newId,
              name: newName,
              timestamp: Date.now(), // Update timestamp to import time
              // Sanitize data to remove any transient fields (version counters, etc.)
              data: sanitizeStyleData(style.data),
            }
          })

          set((state) => ({ savedStyles: [...state.savedStyles, ...processedStyles] }))
          return true
        } catch (e) {
          console.error('Failed to import styles', e)
          useMsgBoxStore
            .getState()
            .showMsgBox(
              'Import Error',
              `Failed to parse JSON data: ${e instanceof Error ? e.message : 'Unknown error'}`,
              'error'
            )
          return false
        }
      },

      exportStyles: () => {
        return JSON.stringify(get().savedStyles, null, 2)
      },

      // --- Scene Actions ---

      saveScene: (name) => {
        // Validate and sanitize name
        const trimmedName = name.trim()
        if (!trimmedName) {
          console.warn('Cannot save scene with empty name')
          return
        }

        // Style components
        const appearance = serializeState(useAppearanceStore.getState())
        const lighting = serializeState(useLightingStore.getState())
        const postProcessing = serializeState(usePostProcessingStore.getState())
        const environment = serializeState(useEnvironmentStore.getState())
        const pbr = serializeState(usePBRStore.getState())

        // Scene components
        const geometry = serializeState(useGeometryStore.getState())
        // Only serialize the extended config for the current object type
        // This prevents irrelevant configs from being saved/overwritten
        const currentObjectType = useGeometryStore.getState().objectType
        const extended = serializeExtendedState(
          useExtendedObjectStore.getState(),
          currentObjectType
        )
        const transform = serializeState(useTransformStore.getState())
        const ui = serializeState(useUIStore.getState())

        // Special handling
        const animation = serializeAnimationState(useAnimationStore.getState())
        const rotation = serializeRotationState(useRotationStore.getState())

        const cameraState = useCameraStore.getState().captureState()
        const camera = cameraState ? serializeState(cameraState) : {}

        const newScene: SavedScene = {
          id: crypto.randomUUID(),
          name: trimmedName,
          timestamp: Date.now(),
          data: {
            appearance,
            lighting,
            postProcessing,
            environment,
            pbr,
            geometry,
            extended,
            transform,
            ui,
            rotation,
            animation,
            camera,
          },
        }

        set((state) => ({ savedScenes: [...state.savedScenes, newScene] }))

        // Show localStorage warning (can be dismissed permanently)
        showConditionalMsgBox(
          DIALOG_IDS.PRESET_SAVE_SCENE_WARNING,
          'Scene Saved Locally',
          "Your scene preset is stored in your browser's localStorage. This data may be lost if you clear browser data or use private browsing.\n\nFor permanent backup, use the Export function to save your scenes as a JSON file.",
          'info',
          [
            {
              label: 'Got it',
              variant: 'primary',
              onClick: () => useMsgBoxStore.getState().closeMsgBox(),
            },
          ]
        )
      },

      loadScene: (id) => {
        const scene = get().savedScenes.find((s) => s.id === id)
        if (!scene) return

        // All store updates execute synchronously and are batched by React 18's automatic batching
        // Set both flags: isLoadingScene prevents hook-based rotation reset,
        // sceneTransitioning enables progressive refinement for visual quality
        usePerformanceStore.getState().setIsLoadingScene(true)
        usePerformanceStore.getState().setSceneTransitioning(true)

        // Restore Style components with transient fields stripped
        // This ensures legacy presets with version fields don't corrupt current counters
        useAppearanceStore.setState(
          normalizeAppearanceLoadData(sanitizeLoadedState(scene.data.appearance))
        )
        useLightingStore.setState(normalizeLightingLoadData(sanitizeLoadedState(scene.data.lighting)))
        usePostProcessingStore.setState(
          normalizePostProcessingLoadData(sanitizeLoadedState(scene.data.postProcessing))
        )

        // Handle legacy environment data and keep unified skybox fields canonical.
        const envData = normalizeEnvironmentLoadData(
          sanitizeLoadedState({ ...scene.data.environment })
        )
        useEnvironmentStore.setState(envData)

        // Restore PBR settings (legacy imports without pbr should reset to defaults)
        const scenePbrData = scene.data.pbr
          ? sanitizeLoadedState(scene.data.pbr)
          : ({} as Record<string, unknown>)
        if (Object.keys(scenePbrData).length > 0) {
          usePBRStore.setState(normalizePbrLoadData(scenePbrData))
        } else {
          usePBRStore.getState().resetPBR()
        }

        // Restore Geometry atomically using loadGeometry
        // This sets both dimension and objectType without auto-adjustments
        // (e.g., won't auto-switch to "recommended" dimension for fractals)
        const geometryData = sanitizeLoadedState(scene.data.geometry) as {
          dimension?: number
          objectType?: string
        }
        // Determine the object type for loading (either from saved data or keep current)
        const loadedObjectType = (geometryData.objectType ??
          useGeometryStore.getState().objectType) as import('@/lib/geometry/types').ObjectType

        if (geometryData.dimension !== undefined && geometryData.objectType !== undefined) {
          useGeometryStore
            .getState()
            .loadGeometry(
              geometryData.dimension,
              geometryData.objectType as import('@/lib/geometry/types').ObjectType
            )
        } else if (geometryData.dimension !== undefined) {
          useGeometryStore.getState().setDimension(geometryData.dimension)
        } else if (geometryData.objectType !== undefined) {
          useGeometryStore
            .getState()
            .setObjectType(geometryData.objectType as import('@/lib/geometry/types').ObjectType)
        }

        // Restore only the extended config for the loaded object type
        // This prevents overwriting configs for other object types
        // mergeExtendedObjectStateForType merges with defaults and only touches the relevant config
        useExtendedObjectStore.setState(
          mergeExtendedObjectStateForType(
            sanitizeExtendedLoadedState(scene.data.extended),
            loadedObjectType
          )
        )
        // Restore transform via store actions to preserve invariants tied to geometry dimension.
        const transformData = sanitizeLoadedState(scene.data.transform) as {
          uniformScale?: unknown
          perAxisScale?: unknown
          scaleLocked?: unknown
        }
        const transformStore = useTransformStore.getState()
        transformStore.resetAll()
        if (typeof transformData.scaleLocked === 'boolean') {
          transformStore.setScaleLocked(transformData.scaleLocked)
        }
        if (typeof transformData.uniformScale === 'number') {
          transformStore.setUniformScale(transformData.uniformScale)
        }
        if (!useTransformStore.getState().scaleLocked && Array.isArray(transformData.perAxisScale)) {
          for (let axis = 0; axis < transformData.perAxisScale.length; axis++) {
            const axisScale = transformData.perAxisScale[axis]
            if (typeof axisScale === 'number') {
              useTransformStore.getState().setAxisScale(axis, axisScale)
            }
          }
        }

        // UI payloads are intentionally narrow: keep only canonical, non-transient fields.
        const uiData = normalizeUiLoadData(
          sanitizeLoadedState(scene.data.ui) as Record<string, unknown>
        )
        useUIStore.setState(uiData)

        // Special handling for Rotation
        if (scene.data.rotation) {
          const rotState = sanitizeLoadedState({ ...scene.data.rotation })
          const rotationUpdates = new Map<string, number>()
          if (rotState.rotations instanceof Map) {
            for (const [plane, angle] of rotState.rotations.entries()) {
              if (typeof angle === 'number') {
                rotationUpdates.set(plane, angle)
              }
            }
          } else if (
            rotState.rotations &&
            typeof rotState.rotations === 'object' &&
            !Array.isArray(rotState.rotations)
          ) {
            for (const [plane, angle] of Object.entries(rotState.rotations as Record<string, unknown>)) {
              if (typeof angle === 'number') {
                rotationUpdates.set(plane, angle)
              }
            }
          }
          const rotationStore = useRotationStore.getState()
          rotationStore.resetAllRotations()
          if (rotationUpdates.size > 0) {
            rotationStore.updateRotations(rotationUpdates)
          }
        }

        // Special handling for Animation (Array -> Set)
        if (scene.data.animation) {
          const animState = normalizeAnimationLoadData(
            sanitizeLoadedState({ ...scene.data.animation })
          )
          if (Array.isArray(animState.animatingPlanes)) {
            animState.animatingPlanes = new Set(animState.animatingPlanes)
          }
          useAnimationStore.setState(animState)
          // Enforce dimension-dependent plane validity after direct hydration.
          useAnimationStore.getState().setDimension(useGeometryStore.getState().dimension)
        }

        // Special handling for Camera
        if (scene.data.camera && Object.keys(scene.data.camera).length > 0) {
          const cameraData = sanitizeLoadedState(scene.data.camera) as {
            position?: [number, number, number]
            target?: [number, number, number]
          }
          if (cameraData.position && cameraData.target) {
            useCameraStore.getState().applyState({
              position: cameraData.position,
              target: cameraData.target,
            })
          }
        }

        // Post-load invariant: free scalar field and TDSE require dimension >= 3
        // (loadGeometry + setState bypass setSchroedingerQuantumMode's enforcement)
        const qm = useExtendedObjectStore.getState().schroedinger?.quantumMode
        if (
          (qm === 'freeScalarField' || qm === 'tdseDynamics') &&
          useGeometryStore.getState().dimension < 3
        ) {
          useGeometryStore.getState().setDimension(3)
        }

        // Bump version counters to trigger re-renders after direct setState calls
        // This is necessary because setState bypasses the wrapped setters that auto-increment versions
        useAppearanceStore.getState().bumpVersion()
        useLightingStore.getState().bumpVersion()

        useEnvironmentStore.getState().bumpAllVersions()
        usePBRStore.getState().bumpVersion()
        useRotationStore.getState().bumpVersion()
        useExtendedObjectStore.getState().bumpAllVersions()

        // Increment preset load version to trigger material recreation in renderers
        // This ensures material properties (transparent, depthWrite) match loaded state
        if (import.meta.env.DEV) {
          console.log('[loadScene] incrementPresetLoadVersion')
        }
        usePerformanceStore.getState().incrementPresetLoadVersion()

        // Signal load complete after React settles - uses helper to prevent race conditions
        scheduleSceneLoadComplete()
      },

      deleteScene: (id) => {
        set((state) => ({ savedScenes: state.savedScenes.filter((s) => s.id !== id) }))
      },

      renameScene: (id, newName) => {
        const trimmedName = newName.trim()
        if (!trimmedName) {
          console.warn('Cannot rename scene to empty name')
          return
        }
        set((state) => ({
          savedScenes: state.savedScenes.map((s) =>
            s.id === id ? { ...s, name: trimmedName } : s
          ),
        }))
      },

      importScenes: (jsonData) => {
        try {
          const imported = JSON.parse(jsonData)
          if (!Array.isArray(imported)) {
            useMsgBoxStore
              .getState()
              .showMsgBox('Import Failed', 'Invalid format: expected an array of scenes.', 'error')
            return false
          }
          // Comprehensive validation: Check all required SavedScene fields
          const valid = imported.every(
            (i) =>
              i.id &&
              isNonEmptyTrimmedString(i.name) &&
              i.timestamp &&
              i.data &&
              // Style components
              i.data.appearance &&
              i.data.lighting &&
              i.data.postProcessing &&
              i.data.environment &&
              // Scene components
              i.data.geometry &&
              i.data.extended &&
              i.data.transform &&
              i.data.rotation &&
              i.data.animation &&
              i.data.camera &&
              i.data.ui
          )
          if (!valid) {
            useMsgBoxStore
              .getState()
              .showMsgBox(
                'Import Failed',
                'The scene data is corrupted or incompatible. Scenes must contain all required data fields (geometry, appearance, lighting, etc.).',
                'error'
              )
            return false
          }

          // Regenerate IDs to prevent duplicates and sanitize data
          const usedNames = new Set(get().savedScenes.map((s) => s.name))
          const processedScenes = imported.map((scene) => {
            // Always generate a new ID to ensure uniqueness
            const newId = crypto.randomUUID()
            const rawName = scene.name.trim()
            const newName = makeUniqueImportedName(rawName, usedNames)
            usedNames.add(newName)
            return {
              ...scene,
              id: newId,
              name: newName,
              timestamp: Date.now(), // Update timestamp to import time
              // Sanitize data to remove any transient fields (version counters, etc.)
              data: sanitizeSceneData(scene.data),
            }
          })

          set((state) => ({ savedScenes: [...state.savedScenes, ...processedScenes] }))
          return true
        } catch (e) {
          console.error('Failed to import scenes', e)
          useMsgBoxStore
            .getState()
            .showMsgBox(
              'Import Error',
              `Failed to parse JSON data: ${e instanceof Error ? e.message : 'Unknown error'}`,
              'error'
            )
          return false
        }
      },

      exportScenes: () => {
        return JSON.stringify(get().savedScenes, null, 2)
      },
    }),
    {
      name: 'mdimension-preset-manager',
    }
  )
)
