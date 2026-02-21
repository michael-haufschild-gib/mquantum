import { Icon } from './Icon'
import { soundManager } from '@/lib/audio/SoundManager'

import iconLandscape from '@/assets/exporter/default.svg'
import iconInsta from '@/assets/exporter/instagram.svg'
import iconTiktok from '@/assets/exporter/tiktok.svg'
import iconYoutube from '@/assets/exporter/youtube.svg'
import iconTwitter from '@/assets/exporter/twitter.svg'
import iconFilm from '@/assets/icons/film.svg'
import iconSquare from '@/assets/exporter/square.svg'
import iconSparkles from '@/assets/icons/sparkles.svg'

/**
 * Supported export preset identifiers.
 */
export type ExportPresetCardId =
  | 'landscape-1080p'
  | 'landscape-720p'
  | 'instagram'
  | 'tiktok'
  | 'youtube-shorts'
  | 'twitter-video'
  | 'cinematic'
  | 'square-60fps'
  | 'high-q'

const PRESET_ICON_BY_ID: Record<ExportPresetCardId, string> = {
  'landscape-1080p': iconLandscape,
  'landscape-720p': iconLandscape,
  instagram: iconInsta,
  tiktok: iconTiktok,
  'youtube-shorts': iconYoutube,
  'twitter-video': iconTwitter,
  cinematic: iconFilm,
  'square-60fps': iconSquare,
  'high-q': iconSparkles,
}

/**
 * Props for the export preset card primitive.
 */
export interface ExportPresetCardProps {
  id: ExportPresetCardId
  label: string
  description: string
  isActive: boolean
  onClick: () => void
}

/**
 * Preset selection card used in export preset grids.
 */
export const ExportPresetCard = ({
  id,
  label,
  description,
  isActive,
  onClick,
}: ExportPresetCardProps) => {
  const iconSrc = PRESET_ICON_BY_ID[id]

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => soundManager.playHover()}
      className={`
            relative flex items-center gap-2 text-left p-2 sm:p-3 lg:p-4 rounded-lg lg:rounded-xl border transition-colors duration-200 group
            ${
              isActive
                ? 'bg-accent/10 border-accent glow-accent-sm'
                : 'bg-[var(--bg-hover)] border-border-subtle hover:border-border-default hover:bg-[var(--bg-active)]'
            }
        `}
    >
      <div
        className={`p-1.5 sm:p-2 rounded-md lg:rounded-lg shrink-0 ${isActive ? 'bg-accent text-text-inverse' : 'bg-[var(--bg-active)] text-text-secondary group-hover:text-text-primary'}`}
      >
        <img src={iconSrc} className="w-4 h-4 sm:w-5 sm:h-5" alt="" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="font-semibold text-xs sm:text-sm text-text-primary truncate">{label}</div>
        <div className="hidden sm:block text-[10px] text-text-tertiary truncate">{description}</div>
      </div>

      {isActive && <Icon name="check" className="w-4 h-4 text-accent shrink-0" />}
    </button>
  )
}
