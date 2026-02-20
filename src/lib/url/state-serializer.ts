/**
 * URL State Serializer
 * Serializes and deserializes app state to/from URL parameters
 *
 * Bloom uses progressive downsample/upsample (gain, threshold, knee, radius).
 * Old bloom band/convolution URL params are parsed for backward compatibility.
 */

import { isValidObjectType } from '@/lib/geometry/registry'
import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/types'
import type { ObjectType } from '@/lib/geometry/types'
import type { AllShaderSettings, ShaderType, ToneMappingAlgorithm } from '@/rendering/shaders/types'
import {
  DEFAULT_BLOOM_GAIN,
  DEFAULT_BLOOM_KNEE,
  DEFAULT_BLOOM_RADIUS,
  DEFAULT_BLOOM_THRESHOLD,
  DEFAULT_EXPOSURE,
  DEFAULT_SKYBOX_ANIMATION_MODE,
  DEFAULT_SKYBOX_ANIMATION_SPEED,
  DEFAULT_SKYBOX_HIGH_QUALITY,
  DEFAULT_SKYBOX_INTENSITY,
  DEFAULT_SKYBOX_ROTATION,
  DEFAULT_SHADER_SETTINGS,
  DEFAULT_SHADER_TYPE,
  DEFAULT_SPECULAR_COLOR,
  DEFAULT_TONE_MAPPING_ALGORITHM,
} from '@/stores/defaults/visualDefaults'
import type { SkyboxAnimationMode, SkyboxSelection } from '@/stores/defaults/visualDefaults'
import { MAX_DIMENSION, MIN_DIMENSION } from '@/stores/geometryStore'

/** Valid shader types for URL validation */
const VALID_SHADER_TYPES: ShaderType[] = ['wireframe', 'surface']

/** Legacy shader type for backward compatibility */
const LEGACY_SHADER_TYPE_DUAL_OUTLINE = 'dualOutline'

/** Valid unified skybox selections for URL validation */
const VALID_SKYBOX_SELECTIONS: SkyboxSelection[] = [
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
]

/** Valid skybox animation modes for URL validation */
const VALID_SKYBOX_ANIMATION_MODES: SkyboxAnimationMode[] = [
  'none',
  'cinematic',
  'heatwave',
  'tumble',
  'ethereal',
  'nebula',
]

/**
 * URL-shareable subset of application state.
 * Values are validated and transformed by `serializeState`/`deserializeState`.
 */
export interface ShareableState {
  dimension: number
  objectType: ObjectType
  quantumMode?: SchroedingerQuantumMode
  uniformScale?: number
  // Scene preset name (case-insensitive lookup, mutually exclusive with other params)
  scene?: string
  // Visual settings (PRD Story 1 AC6, Story 7 AC7)
  shaderType?: ShaderType
  shaderSettings?: AllShaderSettings
  edgeColor?: string
  backgroundColor?: string
  skyboxSelection?: SkyboxSelection
  skyboxIntensity?: number
  skyboxRotation?: number
  skyboxAnimationMode?: SkyboxAnimationMode
  skyboxAnimationSpeed?: number
  skyboxHighQuality?: boolean
  // Bloom settings (progressive downsample/upsample)
  bloomEnabled?: boolean
  bloomGain?: number
  bloomThreshold?: number
  bloomKnee?: number
  bloomRadius?: number
  // Enhanced lighting settings
  specularColor?: string
  toneMappingEnabled?: boolean
  toneMappingAlgorithm?: ToneMappingAlgorithm
  exposure?: number
}

/**
 * Serializes state to URL search params
 * @param state - The state to serialize
 * @returns URL search params string
 */
export function serializeState(state: ShareableState): string {
  const params = new URLSearchParams()

  params.set('d', state.dimension.toString())
  params.set('t', state.objectType)
  if (state.quantumMode && state.quantumMode !== 'harmonicOscillator') {
    params.set('qm', state.quantumMode)
  }

  if (state.uniformScale !== undefined && state.uniformScale !== 1) {
    params.set('s', state.uniformScale.toFixed(2))
  }

  // Visual settings (PRD Story 1 AC6)
  if (state.shaderType && state.shaderType !== DEFAULT_SHADER_TYPE) {
    params.set('sh', state.shaderType)
  }

  if (state.edgeColor) {
    params.set('ec', state.edgeColor.replace('#', ''))
  }

  if (state.backgroundColor) {
    params.set('bg', state.backgroundColor.replace('#', ''))
  }

  if (state.skyboxSelection && state.skyboxSelection !== 'none') {
    params.set('sb', state.skyboxSelection)
  }
  if (state.skyboxIntensity !== undefined && state.skyboxIntensity !== DEFAULT_SKYBOX_INTENSITY) {
    params.set('sbi', state.skyboxIntensity.toFixed(2))
  }
  if (state.skyboxRotation !== undefined && state.skyboxRotation !== DEFAULT_SKYBOX_ROTATION) {
    params.set('sbr', state.skyboxRotation.toFixed(4))
  }
  if (
    state.skyboxAnimationMode &&
    state.skyboxAnimationMode !== DEFAULT_SKYBOX_ANIMATION_MODE
  ) {
    params.set('sbm', state.skyboxAnimationMode)
  }
  if (
    state.skyboxAnimationSpeed !== undefined &&
    state.skyboxAnimationSpeed !== DEFAULT_SKYBOX_ANIMATION_SPEED
  ) {
    params.set('sbs', state.skyboxAnimationSpeed.toFixed(3))
  }
  if (state.skyboxHighQuality === true && state.skyboxHighQuality !== DEFAULT_SKYBOX_HIGH_QUALITY) {
    params.set('sbh', '1')
  }

  // Bloom settings (progressive downsample/upsample)
  if (state.bloomEnabled === true) {
    params.set('be', '1')
  }

  if (state.bloomGain !== undefined && state.bloomGain !== DEFAULT_BLOOM_GAIN) {
    params.set('bga', state.bloomGain.toFixed(2))
  }

  if (state.bloomThreshold !== undefined && state.bloomThreshold !== DEFAULT_BLOOM_THRESHOLD) {
    params.set('bt', state.bloomThreshold.toFixed(2))
  }

  if (state.bloomKnee !== undefined && state.bloomKnee !== DEFAULT_BLOOM_KNEE) {
    params.set('bk', state.bloomKnee.toFixed(2))
  }

  if (state.bloomRadius !== undefined && state.bloomRadius !== DEFAULT_BLOOM_RADIUS) {
    params.set('br', state.bloomRadius.toFixed(2))
  }

  // Enhanced lighting settings (omit defaults for shorter URLs)
  if (state.specularColor && state.specularColor !== DEFAULT_SPECULAR_COLOR) {
    params.set('sc', state.specularColor.replace('#', ''))
  }

  // tm=0 when tone mapping is disabled (omit when true, the default)
  if (state.toneMappingEnabled === false) {
    params.set('tm', '0')
  }

  if (state.toneMappingAlgorithm && state.toneMappingAlgorithm !== DEFAULT_TONE_MAPPING_ALGORITHM) {
    params.set('ta', state.toneMappingAlgorithm)
  }

  if (state.exposure !== undefined && state.exposure !== DEFAULT_EXPOSURE) {
    params.set('ex', state.exposure.toFixed(1))
  }

  // Per-shader settings (PRD Story 7 AC7)
  if (state.shaderSettings && state.shaderType) {
    const settings = state.shaderSettings[state.shaderType]
    if (settings) {
      const defaultSettings = DEFAULT_SHADER_SETTINGS[state.shaderType]
      const settingsParts: string[] = []

      // Serialize only non-default values
      const settingsObj = settings as unknown as Record<string, unknown>
      const defaultObj = defaultSettings as unknown as Record<string, unknown>

      Object.entries(settingsObj).forEach(([key, value]) => {
        const defaultValue = defaultObj[key]
        if (value !== defaultValue) {
          if (typeof value === 'string') {
            // Remove # from colors
            settingsParts.push(`${key}:${value.replace('#', '')}`)
          } else if (typeof value === 'boolean') {
            settingsParts.push(`${key}:${value ? '1' : '0'}`)
          } else {
            settingsParts.push(`${key}:${value}`)
          }
        }
      })

      if (settingsParts.length > 0) {
        params.set('ss', settingsParts.join(','))
      }
    }
  }

  return params.toString()
}

/**
 * Deserializes state from URL search params
 * @param searchParams - URL search params string
 * @returns Partial state object
 */
export function deserializeState(searchParams: string): Partial<ShareableState> {
  const params = new URLSearchParams(searchParams)
  const state: Partial<ShareableState> = {}

  // Scene parameter (mutually exclusive with other params - scene contains full state)
  const sceneParam = params.get('scene')
  if (sceneParam) {
    const trimmed = sceneParam.trim()
    if (trimmed) {
      state.scene = trimmed
      // Return early - scene overrides all other params
      return state
    }
  }

  const dimension = params.get('d')
  if (dimension) {
    const dim = parseInt(dimension, 10)
    if (dim >= MIN_DIMENSION && dim <= MAX_DIMENSION) {
      state.dimension = dim
    }
  }

  const objectType = params.get('t')
  if (objectType) {
    if (isValidObjectType(objectType)) {
      state.objectType = objectType
    }
  }

  const quantumMode = params.get('qm')
  if (quantumMode) {
    const validModes: SchroedingerQuantumMode[] = [
      'harmonicOscillator',
      'hydrogenND',
      'freeScalarField',
      'tdseDynamics',
    ]
    if (validModes.includes(quantumMode as SchroedingerQuantumMode)) {
      state.quantumMode = quantumMode as SchroedingerQuantumMode
    }
  }

  // Note: 'pd' (projectionDistance) is no longer used but we ignore it for backward compatibility

  const uniformScale = params.get('s')
  if (uniformScale) {
    const s = parseFloat(uniformScale)
    if (!isNaN(s) && s > 0) {
      state.uniformScale = s
    }
  }

  // Visual settings (PRD Story 1 AC6)
  const shaderType = params.get('sh')
  if (shaderType) {
    if (VALID_SHADER_TYPES.includes(shaderType as ShaderType)) {
      state.shaderType = shaderType as ShaderType
    } else if (shaderType === LEGACY_SHADER_TYPE_DUAL_OUTLINE) {
      // Backward compatibility: map dualOutline to wireframe
      state.shaderType = 'wireframe'
    }
  }

  const edgeColor = params.get('ec')
  if (edgeColor && /^[0-9A-Fa-f]{6}$/.test(edgeColor)) {
    state.edgeColor = `#${edgeColor}`
  }

  const backgroundColor = params.get('bg')
  if (backgroundColor && /^[0-9A-Fa-f]{6}$/.test(backgroundColor)) {
    state.backgroundColor = `#${backgroundColor}`
  }

  const skyboxSelection = params.get('sb')
  if (
    skyboxSelection &&
    VALID_SKYBOX_SELECTIONS.includes(skyboxSelection as SkyboxSelection)
  ) {
    state.skyboxSelection = skyboxSelection as SkyboxSelection
  }
  const skyboxIntensity = params.get('sbi')
  if (skyboxIntensity) {
    const parsed = parseFloat(skyboxIntensity)
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 10) {
      state.skyboxIntensity = parsed
    }
  }
  const skyboxRotation = params.get('sbr')
  if (skyboxRotation) {
    const parsed = parseFloat(skyboxRotation)
    if (!isNaN(parsed)) {
      state.skyboxRotation = parsed
    }
  }
  const skyboxAnimationMode = params.get('sbm')
  if (
    skyboxAnimationMode &&
    VALID_SKYBOX_ANIMATION_MODES.includes(skyboxAnimationMode as SkyboxAnimationMode)
  ) {
    state.skyboxAnimationMode = skyboxAnimationMode as SkyboxAnimationMode
  }
  const skyboxAnimationSpeed = params.get('sbs')
  if (skyboxAnimationSpeed) {
    const parsed = parseFloat(skyboxAnimationSpeed)
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 5) {
      state.skyboxAnimationSpeed = parsed
    }
  }
  const skyboxHighQuality = params.get('sbh')
  if (skyboxHighQuality === '1') {
    state.skyboxHighQuality = true
  } else if (skyboxHighQuality === '0') {
    state.skyboxHighQuality = false
  }

  // Bloom settings (progressive downsample/upsample)
  const bloomEnabled = params.get('be')
  if (bloomEnabled === '1') {
    state.bloomEnabled = true
  }

  // 'bm' (bloom mode) is ignored for backward compat — no longer used

  const bloomGain = params.get('bga')
  if (bloomGain) {
    const parsed = parseFloat(bloomGain)
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 3) {
      state.bloomGain = parsed
    }
  }

  const bloomThreshold = params.get('bt')
  if (bloomThreshold) {
    const parsed = parseFloat(bloomThreshold)
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 5) {
      state.bloomThreshold = parsed
    }
  }

  const bloomKnee = params.get('bk')
  if (bloomKnee) {
    const parsed = parseFloat(bloomKnee)
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 5) {
      state.bloomKnee = parsed
    }
  }

  const bloomRadius = params.get('br')
  if (bloomRadius) {
    const parsed = parseFloat(bloomRadius)
    if (!isNaN(parsed) && parsed >= 0.25 && parsed <= 4) {
      state.bloomRadius = parsed
    }
  }

  // Backward compat: extract radius from old band size params (bb0..bb4)
  if (!bloomRadius) {
    const bandSizes: number[] = []
    for (let i = 0; i < 5; i++) {
      const token = params.get(`bb${i}`)
      if (!token) break
      const parts = token.split('|')
      const size = parseFloat(parts[2] ?? '')
      if (Number.isFinite(size) && size >= 0.25 && size <= 4) {
        bandSizes.push(size)
      }
    }
    if (bandSizes.length > 0) {
      const avg = bandSizes.reduce((sum, s) => sum + s, 0) / bandSizes.length
      state.bloomRadius = Math.round(avg * 100) / 100
    }
  }

  // 'bcr', 'bcs', 'bcb', 'bct' (convolution params) are ignored for backward compat

  // Enhanced lighting settings
  const specularColor = params.get('sc')
  if (specularColor && /^[0-9A-Fa-f]{6}$/.test(specularColor)) {
    state.specularColor = `#${specularColor}`
  }

  const toneMappingEnabled = params.get('tm')
  if (toneMappingEnabled === '0') {
    state.toneMappingEnabled = false
  } else if (toneMappingEnabled === '1') {
    state.toneMappingEnabled = true
  }

  const toneMappingAlgorithm = params.get('ta')
  if (toneMappingAlgorithm) {
    const validAlgorithms: ToneMappingAlgorithm[] = [
      'none',
      'linear',
      'reinhard',
      'cineon',
      'aces',
      'agx',
      'neutral',
    ]
    if (validAlgorithms.includes(toneMappingAlgorithm as ToneMappingAlgorithm)) {
      state.toneMappingAlgorithm = toneMappingAlgorithm as ToneMappingAlgorithm
    }
  }

  const exposure = params.get('ex')
  if (exposure) {
    const ex = parseFloat(exposure)
    if (!isNaN(ex) && ex >= 0.1 && ex <= 3) {
      state.exposure = ex
    }
  }

  // Per-shader settings (PRD Story 7 AC7)
  const shaderSettingsStr = params.get('ss')
  if (shaderSettingsStr) {
    // When sh is omitted, settings belong to the default shader type.
    const effectiveShaderType: ShaderType = state.shaderType ?? DEFAULT_SHADER_TYPE
    const shaderSettings: AllShaderSettings = {
      wireframe: { ...DEFAULT_SHADER_SETTINGS.wireframe },
      surface: { ...DEFAULT_SHADER_SETTINGS.surface },
    }
    const currentSettings = shaderSettings[effectiveShaderType] as unknown as Record<string, unknown>
    const defaultObj = DEFAULT_SHADER_SETTINGS[effectiveShaderType] as unknown as Record<
      string,
      unknown
    >

    shaderSettingsStr.split(',').forEach((pair) => {
      const [key, value] = pair.split(':')
      if (key && value) {
        // Determine the type based on the default settings
        const defaultValue = defaultObj[key]
        if (defaultValue !== undefined) {
          if (typeof defaultValue === 'string') {
            // Re-add # prefix to colors and validate
            const colorVal = value.startsWith('#') ? value : `#${value}`
            if (/^#[0-9A-Fa-f]{6}$/.test(colorVal)) {
              currentSettings[key] = colorVal
            }
          } else if (typeof defaultValue === 'boolean') {
            currentSettings[key] = value === '1'
          } else if (typeof defaultValue === 'number') {
            const numValue = parseFloat(value)
            if (!isNaN(numValue)) {
              currentSettings[key] = numValue
            }
          }
        }
      }
    })

    state.shaderSettings = shaderSettings
    if (!state.shaderType) {
      state.shaderType = effectiveShaderType
    }
  }

  return state
}

/**
 * Generates a shareable URL with current state
 * @param state - The state to serialize
 * @returns Full shareable URL
 */
export function generateShareUrl(state: ShareableState): string {
  const serialized = serializeState(state)
  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''
  return serialized ? `${baseUrl}?${serialized}` : baseUrl
}

/**
 * Parses the current URL to extract state
 * @returns Partial state object from current URL
 */
export function parseCurrentUrl(): Partial<ShareableState> {
  if (typeof window === 'undefined') {
    return {}
  }
  return deserializeState(window.location.search)
}
