import type { ExportSettings, PresetConfig } from './exportTypes'

/** Stable identifiers for every export preset shown in the UI and handled by the store. */
export type ExportPresetId =
  | 'landscape-1080p'
  | 'landscape-720p'
  | 'instagram'
  | 'tiktok'
  | 'youtube-shorts'
  | 'twitter-video'
  | 'cinematic'
  | 'square-60fps'
  | 'high-q'

/** User-facing export preset metadata plus the store config it applies. */
export interface ExportPresetDefinition {
  id: ExportPresetId
  label: string
  description: string
  aspectRatio: string
  config: PresetConfig
}

const MP4_AVC_ENCODING = {
  format: 'mp4',
  codec: 'avc',
} as const

const withDefaultEncoding = (config: PresetConfig): PresetConfig => ({
  ...MP4_AVC_ENCODING,
  ...config,
})

export const EXPORT_PRESET_CONFIGS: Record<ExportPresetId, PresetConfig> = {
  'landscape-1080p': withDefaultEncoding({
    resolution: '1080p',
    fps: 60,
    duration: 30,
    bitrate: 12,
  }),
  'landscape-720p': withDefaultEncoding({
    resolution: '720p',
    fps: 30,
    duration: 30,
    bitrate: 8,
  }),
  instagram: withDefaultEncoding({
    resolution: 'custom',
    customWidth: 1080,
    customHeight: 1080,
    fps: 30,
    duration: 60,
    bitrate: 10,
    cropRatio: 1,
  }),
  tiktok: withDefaultEncoding({
    resolution: 'custom',
    customWidth: 1080,
    customHeight: 1920,
    fps: 30,
    duration: 30,
    bitrate: 8,
    cropRatio: 9 / 16,
  }),
  'youtube-shorts': withDefaultEncoding({
    resolution: 'custom',
    customWidth: 1080,
    customHeight: 1920,
    fps: 60,
    duration: 30,
    bitrate: 15,
    cropRatio: 9 / 16,
  }),
  'twitter-video': withDefaultEncoding({
    resolution: '720p',
    fps: 30,
    duration: 30,
    bitrate: 8,
  }),
  cinematic: withDefaultEncoding({
    resolution: 'custom',
    customWidth: 3840,
    customHeight: 1634,
    fps: 24,
    bitrate: 40,
    cropRatio: 21 / 9,
  }),
  'square-60fps': withDefaultEncoding({
    resolution: 'custom',
    customWidth: 1080,
    customHeight: 1080,
    fps: 60,
    duration: 60,
    bitrate: 15,
    cropRatio: 1,
  }),
  'high-q': {
    resolution: '4k',
    format: 'webm',
    codec: 'vp9',
    fps: 60,
    duration: 120,
    bitrate: 50,
  },
}

const PRESET_COPY: Record<ExportPresetId, Omit<ExportPresetDefinition, 'id' | 'config'>> = {
  'landscape-1080p': {
    label: 'Landscape 1080p',
    description: '1920x1080 • 60 FPS',
    aspectRatio: '16:9',
  },
  'landscape-720p': {
    label: 'Landscape 720p',
    description: '1280x720 • 30 FPS',
    aspectRatio: '16:9',
  },
  instagram: {
    label: 'Instagram',
    description: '1080x1080 • 1:1 Square',
    aspectRatio: '1:1',
  },
  tiktok: {
    label: 'TikTok',
    description: '1080x1920 • 9:16 Vertical',
    aspectRatio: '9:16',
  },
  'youtube-shorts': {
    label: 'YouTube Short',
    description: '1080x1920 • 60 FPS',
    aspectRatio: '9:16',
  },
  'twitter-video': {
    label: 'Twitter / X',
    description: '1280x720 • 30 FPS',
    aspectRatio: '16:9',
  },
  cinematic: {
    label: 'Cinematic 4K',
    description: '4K • 24 FPS • 21:9',
    aspectRatio: '21:9',
  },
  'square-60fps': {
    label: 'Square 60FPS',
    description: '1080x1080 • 60 FPS',
    aspectRatio: '1:1',
  },
  'high-q': {
    label: 'High Q',
    description: '4K • 60 FPS • WebM',
    aspectRatio: '16:9',
  },
}

const DESKTOP_PRESET_IDS: readonly ExportPresetId[] = [
  'landscape-1080p',
  'landscape-720p',
  'instagram',
  'tiktok',
  'youtube-shorts',
  'twitter-video',
  'cinematic',
  'square-60fps',
  'high-q',
]

const MOBILE_PRESET_IDS: readonly ExportPresetId[] = [
  'instagram',
  'tiktok',
  'youtube-shorts',
  'landscape-1080p',
  'landscape-720p',
  'twitter-video',
  'cinematic',
  'square-60fps',
  'high-q',
]

const definePreset = (id: ExportPresetId): ExportPresetDefinition => ({
  id,
  ...PRESET_COPY[id],
  config: EXPORT_PRESET_CONFIGS[id],
})

export const DESKTOP_EXPORT_PRESETS = DESKTOP_PRESET_IDS.map(definePreset)
export const MOBILE_EXPORT_PRESETS = MOBILE_PRESET_IDS.map(definePreset)

/** Returns true when the raw value is a known export preset id. */
export function isExportPresetId(value: string | null): value is ExportPresetId {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(EXPORT_PRESET_CONFIGS, value)
  )
}

/** Look up the settings patch for a preset id, or undefined for unknown runtime input. */
export function getExportPresetConfig(value: string): PresetConfig | undefined {
  return isExportPresetId(value) ? EXPORT_PRESET_CONFIGS[value] : undefined
}

/**
 * Calculate a centered normalized crop for a target output aspect ratio.
 * Ratios are width / height; invalid runtime values fall back to full frame.
 */
export function calculatePresetCropForRatio(
  canvasRatio: number,
  targetRatio: number
): { x: number; y: number; width: number; height: number } {
  if (!Number.isFinite(canvasRatio) || canvasRatio <= 0) {
    return { x: 0, y: 0, width: 1, height: 1 }
  }
  if (!Number.isFinite(targetRatio) || targetRatio <= 0) {
    return { x: 0, y: 0, width: 1, height: 1 }
  }

  if (canvasRatio > targetRatio) {
    const cropWidth = targetRatio / canvasRatio
    return { x: (1 - cropWidth) / 2, y: 0, width: cropWidth, height: 1 }
  }

  const cropHeight = canvasRatio / targetRatio
  return { x: 0, y: (1 - cropHeight) / 2, width: 1, height: cropHeight }
}

function cropMatches(
  crop: ExportSettings['crop'],
  expected: { x: number; y: number; width: number; height: number }
): boolean {
  const epsilon = 1e-6
  return (
    Math.abs(crop.x - expected.x) <= epsilon &&
    Math.abs(crop.y - expected.y) <= epsilon &&
    Math.abs(crop.width - expected.width) <= epsilon &&
    Math.abs(crop.height - expected.height) <= epsilon
  )
}

/** Check whether current export settings exactly match a preset contract. */
export function exportPresetMatchesSettings(
  presetId: ExportPresetId,
  settings: ExportSettings,
  canvasAspectRatio: number = 16 / 9
): boolean {
  const { cropRatio, ...expectedSettings } = EXPORT_PRESET_CONFIGS[presetId]
  for (const [key, value] of Object.entries(expectedSettings) as Array<
    [keyof ExportSettings, ExportSettings[keyof ExportSettings]]
  >) {
    if (settings[key] !== value) return false
  }

  if (typeof cropRatio !== 'number') return !settings.crop.enabled
  if (!settings.crop.enabled) return false

  return cropMatches(settings.crop, calculatePresetCropForRatio(canvasAspectRatio, cropRatio))
}
