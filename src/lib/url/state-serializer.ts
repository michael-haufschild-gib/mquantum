/**
 * URL State Serializer
 * Serializes and deserializes app state to/from URL parameters
 *
 * Bloom uses progressive downsample/upsample (gain, threshold, knee, radius).
 * Old bloom band/convolution URL params are parsed for backward compatibility.
 */

import { isValidObjectType } from '@/lib/geometry/registry'
import type { ObjectType } from '@/lib/geometry/types'
import type { AllShaderSettings, ShaderType, ToneMappingAlgorithm } from '@/rendering/shaders/types'
import {
  DEFAULT_BLOOM_GAIN,
  DEFAULT_BLOOM_KNEE,
  DEFAULT_BLOOM_RADIUS,
  DEFAULT_BLOOM_THRESHOLD,
  DEFAULT_EXPOSURE,
  DEFAULT_SHADER_SETTINGS,
  DEFAULT_SHADER_TYPE,
  DEFAULT_SPECULAR_COLOR,
  DEFAULT_TONE_MAPPING_ALGORITHM,
} from '@/stores/defaults/visualDefaults'
import { MAX_DIMENSION, MIN_DIMENSION } from '@/stores/geometryStore'

/** Valid shader types for URL validation */
const VALID_SHADER_TYPES: ShaderType[] = ['wireframe', 'surface']

/** Legacy shader type for backward compatibility */
const LEGACY_SHADER_TYPE_DUAL_OUTLINE = 'dualOutline'

export interface ShareableState {
  dimension: number
  objectType: ObjectType
  uniformScale?: number
  // Scene preset name (case-insensitive lookup, mutually exclusive with other params)
  scene?: string
  // Visual settings (PRD Story 1 AC6, Story 7 AC7)
  shaderType?: ShaderType
  shaderSettings?: AllShaderSettings
  edgeColor?: string
  backgroundColor?: string
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
    if (!isNaN(parsed) && parsed >= -1 && parsed <= 20) {
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
  if (shaderSettingsStr && state.shaderType) {
    const shaderSettings: AllShaderSettings = {
      wireframe: { ...DEFAULT_SHADER_SETTINGS.wireframe },
      surface: { ...DEFAULT_SHADER_SETTINGS.surface },
    }
    const currentSettings = shaderSettings[state.shaderType] as unknown as Record<string, unknown>
    const defaultObj = DEFAULT_SHADER_SETTINGS[state.shaderType] as unknown as Record<
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
