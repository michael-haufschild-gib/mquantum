import { useMemo } from 'react'
import { useExportStore } from '@/stores/exportStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { Icon } from '@/components/ui/Icon'
import { soundManager } from '@/lib/audio/SoundManager'

import iconLandscape from '@/assets/exporter/default.svg'
import iconInsta from '@/assets/exporter/instagram.svg'
import iconTiktok from '@/assets/exporter/tiktok.svg'
import iconYoutube from '@/assets/exporter/youtube.svg'
import iconTwitter from '@/assets/exporter/twitter.svg'
import iconFilm from '@/assets/icons/film.svg'
import iconSquare from '@/assets/exporter/square.svg'
import iconSparkles from '@/assets/icons/sparkles.svg'

interface PresetDefinition {
    id: string
    label: string
    description: string
    iconSrc: string
    aspectRatio: string
}

interface PresetCardProps {
    label: string
    description: string
    iconSrc: string
    isActive: boolean
    onClick: () => void
}

/** Desktop-first preset order (landscape formats prioritized) */
const DESKTOP_PRESETS: PresetDefinition[] = [
    { id: 'landscape-1080p', label: 'Landscape 1080p', description: '1920x1080 • 60 FPS', iconSrc: iconLandscape, aspectRatio: '16:9' },
    { id: 'landscape-720p', label: 'Landscape 720p', description: '1280x720 • 30 FPS', iconSrc: iconLandscape, aspectRatio: '16:9' },
    { id: 'instagram', label: 'Instagram', description: '1080x1080 • 1:1 Square', iconSrc: iconInsta, aspectRatio: '1:1' },
    { id: 'tiktok', label: 'TikTok', description: '1080x1920 • 9:16 Vertical', iconSrc: iconTiktok, aspectRatio: '9:16' },
    { id: 'youtube-shorts', label: 'YouTube Short', description: '1080x1920 • 60 FPS', iconSrc: iconYoutube, aspectRatio: '9:16' },
    { id: 'twitter-video', label: 'Twitter / X', description: '1280x720 • 30 FPS', iconSrc: iconTwitter, aspectRatio: '16:9' },
    { id: 'cinematic', label: 'Cinematic 4K', description: '4K • 24 FPS • 21:9', iconSrc: iconFilm, aspectRatio: '21:9' },
    { id: 'square-60fps', label: 'Square 60FPS', description: '1080x1080 • 60 FPS', iconSrc: iconSquare, aspectRatio: '1:1' },
    { id: 'high-q', label: 'High Q', description: '4K • 60 FPS • WebM', iconSrc: iconSparkles, aspectRatio: '16:9' },
]

/** Mobile-first preset order (portrait/square formats prioritized) */
const MOBILE_PRESETS: PresetDefinition[] = [
    { id: 'instagram', label: 'Instagram', description: '1080x1080 • 1:1 Square', iconSrc: iconInsta, aspectRatio: '1:1' },
    { id: 'tiktok', label: 'TikTok', description: '1080x1920 • 9:16 Vertical', iconSrc: iconTiktok, aspectRatio: '9:16' },
    { id: 'youtube-shorts', label: 'YouTube Short', description: '1080x1920 • 60 FPS', iconSrc: iconYoutube, aspectRatio: '9:16' },
    { id: 'landscape-1080p', label: 'Landscape 1080p', description: '1920x1080 • 60 FPS', iconSrc: iconLandscape, aspectRatio: '16:9' },
    { id: 'landscape-720p', label: 'Landscape 720p', description: '1280x720 • 30 FPS', iconSrc: iconLandscape, aspectRatio: '16:9' },
    { id: 'twitter-video', label: 'Twitter / X', description: '1280x720 • 30 FPS', iconSrc: iconTwitter, aspectRatio: '16:9' },
    { id: 'cinematic', label: 'Cinematic 4K', description: '4K • 24 FPS • 21:9', iconSrc: iconFilm, aspectRatio: '21:9' },
    { id: 'square-60fps', label: 'Square 60FPS', description: '1080x1080 • 60 FPS', iconSrc: iconSquare, aspectRatio: '1:1' },
    { id: 'high-q', label: 'High Q', description: '4K • 60 FPS • WebM', iconSrc: iconSparkles, aspectRatio: '16:9' },
]

const PresetCard = ({ label, description, iconSrc, isActive, onClick }: PresetCardProps) => (
    <button
        onClick={onClick}
        onMouseEnter={() => soundManager.playHover()}
        className={`
            relative flex items-center gap-2 text-left p-2 sm:p-3 lg:p-4 rounded-lg lg:rounded-xl border transition-all duration-200 group
            ${isActive
                ? 'bg-accent/10 border-accent glow-accent-sm'
                : 'bg-[var(--bg-hover)] border-border-subtle hover:border-border-default hover:bg-[var(--bg-active)]'
            }
        `}
    >
        <div className={`p-1.5 sm:p-2 rounded-md lg:rounded-lg shrink-0 ${isActive ? 'bg-accent text-text-inverse' : 'bg-[var(--bg-active)] text-text-secondary group-hover:text-text-primary'}`}>
            <img src={iconSrc} className="w-4 h-4 sm:w-5 sm:h-5" alt={label} />
        </div>

        <div className="min-w-0 flex-1">
            <div className="font-semibold text-xs sm:text-sm text-text-primary truncate">{label}</div>
            <div className="hidden sm:block text-[10px] text-text-tertiary truncate">{description}</div>
        </div>

        {isActive && (
            <Icon name="check" className="w-4 h-4 text-accent shrink-0" />
        )}
    </button>
)

export const ExportPresets = () => {
    const { applyPreset } = useExportStore()
    const isMobileGPU = usePerformanceStore((s) => s.isMobileGPU)

    const presets = useMemo(
        () => (isMobileGPU ? MOBILE_PRESETS : DESKTOP_PRESETS),
        [isMobileGPU]
    )

    const handleSelect = (id: string) => {
        applyPreset(id)
        soundManager.playClick()
    }

    return (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 lg:gap-3">
            {presets.map(p => (
                <PresetCard
                    key={p.id}
                    {...p}
                    isActive={false}
                    onClick={() => handleSelect(p.id)}
                />
            ))}
        </div>
    )
}
