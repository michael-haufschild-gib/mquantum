/**
 * URL State Serializer
 * Serializes and deserializes app state to/from URL parameters
 *
 * Supports both polytope and extended object types.
 */

import { isValidObjectType } from '@/lib/geometry/registry'
import type { ObjectType } from '@/lib/geometry/types'
import type { AllShaderSettings, ShaderType, ToneMappingAlgorithm } from '@/rendering/shaders/types'
import {
  type BloomBandSettings,
  type BloomMode,
  DEFAULT_BLOOM_CONVOLUTION_BOOST,
  DEFAULT_BLOOM_CONVOLUTION_RADIUS,
  DEFAULT_BLOOM_CONVOLUTION_RESOLUTION_SCALE,
  DEFAULT_BLOOM_CONVOLUTION_TINT,
  DEFAULT_BLOOM_GAIN,
  DEFAULT_BLOOM_KNEE,
  DEFAULT_BLOOM_MODE,
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
  // Bloom settings (Bloom V2)
  bloomEnabled?: boolean
  bloomMode?: BloomMode
  bloomGain?: number
  bloomThreshold?: number
  bloomKnee?: number
  bloomBands?: BloomBandSettings[]
  bloomConvolutionRadius?: number
  bloomConvolutionResolutionScale?: number
  bloomConvolutionBoost?: number
  bloomConvolutionTint?: string
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

  // Bloom settings (Bloom V2)
  if (state.bloomEnabled === true) {
    params.set('be', '1')
  }

  if (state.bloomMode !== undefined && state.bloomMode !== DEFAULT_BLOOM_MODE) {
    params.set('bm', state.bloomMode === 'convolution' ? 'c' : 'g')
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

  if (state.bloomBands !== undefined) {
    state.bloomBands.slice(0, 5).forEach((band, index) => {
      const token = `${band.enabled ? 1 : 0}|${band.weight.toFixed(2)}|${band.size.toFixed(2)}|${band.tint.replace('#', '')}`
      params.set(`bb${index}`, token)
    })
  }

  if (
    state.bloomConvolutionRadius !== undefined &&
    state.bloomConvolutionRadius !== DEFAULT_BLOOM_CONVOLUTION_RADIUS
  ) {
    params.set('bcr', state.bloomConvolutionRadius.toFixed(2))
  }

  if (
    state.bloomConvolutionResolutionScale !== undefined &&
    state.bloomConvolutionResolutionScale !== DEFAULT_BLOOM_CONVOLUTION_RESOLUTION_SCALE
  ) {
    params.set('bcs', state.bloomConvolutionResolutionScale.toFixed(2))
  }

  if (
    state.bloomConvolutionBoost !== undefined &&
    state.bloomConvolutionBoost !== DEFAULT_BLOOM_CONVOLUTION_BOOST
  ) {
    params.set('bcb', state.bloomConvolutionBoost.toFixed(2))
  }

  if (
    state.bloomConvolutionTint !== undefined &&
    state.bloomConvolutionTint !== DEFAULT_BLOOM_CONVOLUTION_TINT
  ) {
    params.set('bct', state.bloomConvolutionTint.replace('#', ''))
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

  // Bloom settings (Bloom V2)
  const bloomEnabled = params.get('be')
  if (bloomEnabled === '1') {
    state.bloomEnabled = true
  }

  const bloomMode = params.get('bm')
  if (bloomMode === 'g') {
    state.bloomMode = 'gaussian'
  } else if (bloomMode === 'c') {
    state.bloomMode = 'convolution'
  }

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

  const bands: BloomBandSettings[] = []
  for (let i = 0; i < 5; i++) {
    const token = params.get(`bb${i}`)
    if (!token) break
    const [enabledRaw, weightRaw, sizeRaw, tintRaw] = token.split('|')
    const weight = parseFloat(weightRaw ?? '')
    const size = parseFloat(sizeRaw ?? '')
    const tint = tintRaw ? `#${tintRaw}` : ''
    if (
      (enabledRaw === '0' || enabledRaw === '1') &&
      Number.isFinite(weight) &&
      weight >= 0 &&
      weight <= 4 &&
      Number.isFinite(size) &&
      size >= 0.25 &&
      size <= 4 &&
      /^#[0-9A-Fa-f]{6}$/.test(tint)
    ) {
      bands.push({ enabled: enabledRaw === '1', weight, size, tint })
    } else {
      break
    }
  }
  if (bands.length > 0) {
    let hasDisabledBand = false
    state.bloomBands = bands.map((band) => {
      const enabled = !hasDisabledBand && band.enabled
      if (!enabled) hasDisabledBand = true
      return { ...band, enabled }
    })
  }

  const bloomConvolutionRadius = params.get('bcr')
  if (bloomConvolutionRadius) {
    const parsed = parseFloat(bloomConvolutionRadius)
    if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 6) {
      state.bloomConvolutionRadius = parsed
    }
  }

  const bloomConvolutionResolutionScale = params.get('bcs')
  if (bloomConvolutionResolutionScale) {
    const parsed = parseFloat(bloomConvolutionResolutionScale)
    if (!isNaN(parsed) && parsed >= 0.25 && parsed <= 1) {
      state.bloomConvolutionResolutionScale = parsed
    }
  }

  const bloomConvolutionBoost = params.get('bcb')
  if (bloomConvolutionBoost) {
    const parsed = parseFloat(bloomConvolutionBoost)
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 4) {
      state.bloomConvolutionBoost = parsed
    }
  }

  const bloomConvolutionTint = params.get('bct')
  if (bloomConvolutionTint && /^[0-9A-Fa-f]{6}$/.test(bloomConvolutionTint)) {
    state.bloomConvolutionTint = `#${bloomConvolutionTint}`
  }

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
