import { useMemo } from 'react'
import { useExportStore } from '@/stores/exportStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import {
  ExportPresetCard,
  type ExportPresetCardId,
} from '@/components/ui/ExportPresetCard'
import { soundManager } from '@/lib/audio/SoundManager'
import type { ExportSettings } from '@/stores/exportStore'

interface PresetDefinition {
  id: ExportPresetCardId
  label: string
  description: string
  aspectRatio: string
}

interface PresetMatch {
  expected: Partial<
    Pick<
      ExportSettings,
      'format' | 'codec' | 'resolution' | 'customWidth' | 'customHeight' | 'fps' | 'duration' | 'bitrate'
    >
  >
  cropEnabled: boolean
}

/** Desktop-first preset order (landscape formats prioritized) */
const DESKTOP_PRESETS: PresetDefinition[] = [
  {
    id: 'landscape-1080p',
    label: 'Landscape 1080p',
    description: '1920x1080 • 60 FPS',
    aspectRatio: '16:9',
  },
  {
    id: 'landscape-720p',
    label: 'Landscape 720p',
    description: '1280x720 • 30 FPS',
    aspectRatio: '16:9',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    description: '1080x1080 • 1:1 Square',
    aspectRatio: '1:1',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    description: '1080x1920 • 9:16 Vertical',
    aspectRatio: '9:16',
  },
  {
    id: 'youtube-shorts',
    label: 'YouTube Short',
    description: '1080x1920 • 60 FPS',
    aspectRatio: '9:16',
  },
  {
    id: 'twitter-video',
    label: 'Twitter / X',
    description: '1280x720 • 30 FPS',
    aspectRatio: '16:9',
  },
  {
    id: 'cinematic',
    label: 'Cinematic 4K',
    description: '4K • 24 FPS • 21:9',
    aspectRatio: '21:9',
  },
  {
    id: 'square-60fps',
    label: 'Square 60FPS',
    description: '1080x1080 • 60 FPS',
    aspectRatio: '1:1',
  },
  {
    id: 'high-q',
    label: 'High Q',
    description: '4K • 60 FPS • WebM',
    aspectRatio: '16:9',
  },
]

/** Mobile-first preset order (portrait/square formats prioritized) */
const MOBILE_PRESETS: PresetDefinition[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    description: '1080x1080 • 1:1 Square',
    aspectRatio: '1:1',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    description: '1080x1920 • 9:16 Vertical',
    aspectRatio: '9:16',
  },
  {
    id: 'youtube-shorts',
    label: 'YouTube Short',
    description: '1080x1920 • 60 FPS',
    aspectRatio: '9:16',
  },
  {
    id: 'landscape-1080p',
    label: 'Landscape 1080p',
    description: '1920x1080 • 60 FPS',
    aspectRatio: '16:9',
  },
  {
    id: 'landscape-720p',
    label: 'Landscape 720p',
    description: '1280x720 • 30 FPS',
    aspectRatio: '16:9',
  },
  {
    id: 'twitter-video',
    label: 'Twitter / X',
    description: '1280x720 • 30 FPS',
    aspectRatio: '16:9',
  },
  {
    id: 'cinematic',
    label: 'Cinematic 4K',
    description: '4K • 24 FPS • 21:9',
    aspectRatio: '21:9',
  },
  {
    id: 'square-60fps',
    label: 'Square 60FPS',
    description: '1080x1080 • 60 FPS',
    aspectRatio: '1:1',
  },
  {
    id: 'high-q',
    label: 'High Q',
    description: '4K • 60 FPS • WebM',
    aspectRatio: '16:9',
  },
]

const PRESET_MATCHERS: Record<ExportPresetCardId, PresetMatch> = {
  'landscape-1080p': {
    expected: { resolution: '1080p', fps: 60, duration: 30, bitrate: 12 },
    cropEnabled: false,
  },
  'landscape-720p': {
    expected: { resolution: '720p', fps: 30, duration: 30, bitrate: 8 },
    cropEnabled: false,
  },
  instagram: {
    expected: {
      resolution: 'custom',
      customWidth: 1080,
      customHeight: 1080,
      fps: 30,
      duration: 60,
      bitrate: 10,
    },
    cropEnabled: true,
  },
  tiktok: {
    expected: {
      resolution: 'custom',
      customWidth: 1080,
      customHeight: 1920,
      fps: 30,
      duration: 30,
      bitrate: 8,
    },
    cropEnabled: true,
  },
  'youtube-shorts': {
    expected: {
      resolution: 'custom',
      customWidth: 1080,
      customHeight: 1920,
      fps: 60,
      duration: 30,
      bitrate: 15,
    },
    cropEnabled: true,
  },
  'twitter-video': {
    expected: { resolution: '720p', fps: 30, duration: 30, bitrate: 8 },
    cropEnabled: false,
  },
  cinematic: {
    expected: {
      resolution: 'custom',
      customWidth: 3840,
      customHeight: 1634,
      fps: 24,
      bitrate: 40,
    },
    cropEnabled: true,
  },
  'square-60fps': {
    expected: {
      resolution: 'custom',
      customWidth: 1080,
      customHeight: 1080,
      fps: 60,
      duration: 60,
      bitrate: 15,
    },
    cropEnabled: true,
  },
  'high-q': {
    expected: {
      resolution: '4k',
      format: 'webm',
      codec: 'vp9',
      fps: 60,
      duration: 120,
      bitrate: 50,
    },
    cropEnabled: false,
  },
}

const isPresetActive = (presetId: ExportPresetCardId, settings: ExportSettings): boolean => {
  const matcher = PRESET_MATCHERS[presetId]
  if (!matcher) return false

  for (const [key, value] of Object.entries(matcher.expected)) {
    const typedKey = key as keyof PresetMatch['expected']
    if (settings[typedKey] !== value) {
      return false
    }
  }

  return settings.crop.enabled === matcher.cropEnabled
}

export const ExportPresets = () => {
  const { applyPreset, settings } = useExportStore()
  const isMobileGPU = usePerformanceStore((s) => s.isMobileGPU)

  const presets = useMemo(() => (isMobileGPU ? MOBILE_PRESETS : DESKTOP_PRESETS), [isMobileGPU])
  const activePresetId = useMemo(
    () => presets.find((preset) => isPresetActive(preset.id, settings))?.id ?? null,
    [presets, settings]
  )

  const handleSelect = (id: ExportPresetCardId) => {
    applyPreset(id)
    soundManager.playClick()
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 lg:gap-3">
      {presets.map((p) => (
        <ExportPresetCard
          key={p.id}
          id={p.id}
          label={p.label}
          description={p.description}
          isActive={p.id === activePresetId}
          onClick={() => handleSelect(p.id)}
        />
      ))}
    </div>
  )
}
