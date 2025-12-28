import { useExportStore } from '@/stores/exportStore'
import { Icon } from '@/components/ui/Icon'
import { soundManager } from '@/lib/audio/SoundManager'

import iconDefault from '@/assets/exporter/default.svg'
import iconStory from '@/assets/exporter/social_story.svg'
import iconInsta from '@/assets/exporter/instagram.svg'
import iconYoutube from '@/assets/exporter/youtube.svg'
import iconTwitter from '@/assets/exporter/twitter.svg'
import iconCinematic from '@/assets/exporter/cinematic.svg'

interface PresetCardProps {
    label: string
    description: string
    iconSrc: string
    aspectRatio: string
    isActive: boolean
    onClick: () => void
}

const PresetCard = ({ label, description, iconSrc, aspectRatio, isActive, onClick }: PresetCardProps) => (
    <button
        onClick={onClick}
        className={`
            relative flex flex-col items-start text-left p-4 rounded-xl border transition-all duration-200 group
            ${isActive
                ? 'bg-accent/10 border-accent glow-accent-sm'
                : 'bg-[var(--bg-hover)] border-border-subtle hover:border-border-default hover:bg-[var(--bg-active)]'
            }
        `}
    >
        <div className="flex justify-between w-full mb-3">
            <div className={`p-2 rounded-lg ${isActive ? 'bg-accent text-text-inverse' : 'bg-[var(--bg-active)] text-text-secondary group-hover:text-text-primary'}`}>
                <img src={iconSrc} className="w-5 h-5" alt={label} />
            </div>
            {isActive && (
                <div className="absolute top-4 right-4 text-accent animate-in fade-in zoom-in">
                    <Icon name="check" className="w-5 h-5" />
                </div>
            )}
        </div>
        
        <div className="space-y-1">
            <div className="font-bold text-sm text-text-primary">{label}</div>
            <div className="text-[10px] text-text-tertiary leading-relaxed">{description}</div>
        </div>

        {/* Aspect Ratio Visual */}
        <div className="absolute top-4 right-4 w-8 h-12 opacity-10 border border-white rounded-sm pointer-events-none" 
             style={{ 
                 aspectRatio: aspectRatio.replace(':', '/'),
                 height: 'auto',
                 width: '24px'
             }} 
        />
    </button>
)

export const ExportPresets = () => {
    const { applyPreset } = useExportStore()

    const presets = [
        { id: 'default', label: 'Default', description: '1080p • 60 FPS • 16:9', iconSrc: iconDefault, aspectRatio: '16:9' },
        { id: 'instagram-story', label: 'Story / TikTok', description: '1080x1920 • 9:16 Vertical', iconSrc: iconStory, aspectRatio: '9:16' },
        { id: 'instagram-post', label: 'Social Post', description: '1080x1080 • 1:1 Square', iconSrc: iconInsta, aspectRatio: '1:1' },
        { id: 'youtube-shorts', label: 'YouTube Shorts', description: 'High Quality • 9:16 Vertical', iconSrc: iconYoutube, aspectRatio: '9:16' },
        { id: 'twitter-video', label: 'Twitter / X', description: 'Optimized 1080p • 16:9', iconSrc: iconTwitter, aspectRatio: '16:9' },
        { id: 'cinematic', label: 'Cinematic 4K', description: '4K • 24 FPS', iconSrc: iconCinematic, aspectRatio: '21:9' },
    ]

    const handleSelect = (id: string) => {
        applyPreset(id)
        soundManager.playSnap()
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {presets.map(p => (
                <PresetCard
                    key={p.id}
                    {...p}
                    isActive={false} // We don't track active preset persistently yet
                    onClick={() => handleSelect(p.id)}
                />
            ))}
        </div>
    )
}
