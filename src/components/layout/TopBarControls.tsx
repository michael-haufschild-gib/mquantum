import { useToast } from '@/hooks/useToast'
import { soundManager } from '@/lib/audio/SoundManager'
import { useAnimationStore } from '@/stores/animationStore'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import { useLayoutStore, type LayoutStore } from '@/stores/layoutStore'
import { useUIStore, type UISlice } from '@/stores/uiStore'
import React, { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

// SVGR icon imports
import CinematicIcon from '@/assets/icons/film.svg?react'
import FullscreenIcon from '@/assets/icons/enlarge.svg?react'
import PerfIcon from '@/assets/icons/perf.svg?react'
import SoundOffIcon from '@/assets/icons/volume-mute2.svg?react'
import SoundOnIcon from '@/assets/icons/volume-high.svg?react'
import TargetIcon from '@/assets/icons/target.svg?react'
import WaveIcon from '@/assets/icons/wave.svg?react'

interface TopBarControlsProps {
  compact?: boolean
}

interface IconButtonProps {
  icon: React.FC<{ className?: string }>
  active: boolean
  onClick: () => void
  label: string
  small?: boolean
  className?: string
}

/** Reusable icon button - extracted for memoization stability */
const IconButton: React.FC<IconButtonProps> = React.memo(
  ({ icon: IconComponent, active, onClick, label, small = false, className = '' }) => (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => soundManager.playHover()}
      aria-label={label}
      aria-pressed={active}
      title={label}
      data-testid={`control-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className={`
      rounded-md text-sm font-medium transition-colors duration-300 border cursor-pointer
      ${small ? 'py-1 px-2' : 'px-3 py-1.5'}
      ${
        active
          ? 'bg-accent/20 text-accent border-accent/50 shadow-[0_0_10px_color-mix(in_oklch,var(--color-accent)_20%,transparent)]'
          : 'bg-[var(--bg-hover)] text-text-secondary border-border-default hover:text-text-primary hover:bg-[var(--bg-active)]'
      }
      ${className}
    `}
    >
      <IconComponent className="w-4 h-4" />
    </button>
  )
)

IconButton.displayName = 'IconButton'

export const TopBarControls: React.FC<TopBarControlsProps> = React.memo(({ compact = false }) => {
  const { addToast } = useToast()

  const uiSelector = useShallow((state: UISlice) => ({
    showPerfMonitor: state.showPerfMonitor,
    setShowPerfMonitor: state.setShowPerfMonitor,
  }))
  const { showPerfMonitor, setShowPerfMonitor } = useUIStore(uiSelector)

  // Logic for Cinematic Mode
  const layoutSelector = useShallow((state: LayoutStore) => ({
    isCinematicMode: state.isCinematicMode,
    toggleCinematicMode: state.toggleCinematicMode,
  }))
  const { isCinematicMode, toggleCinematicMode } = useLayoutStore(layoutSelector)

  const representationSelector = useShallow((state: ExtendedObjectState) => ({
    representation: state.schroedinger.representation,
    setRepresentation: state.setSchroedingerRepresentation,
  }))
  const { representation, setRepresentation } = useExtendedObjectStore(representationSelector)

  // Local State
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isSoundEnabled, setIsSoundEnabled] = useState(soundManager.isEnabled)

  // Effects
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleSound = () => {
    const newState = !isSoundEnabled
    soundManager.toggle(newState)
    setIsSoundEnabled(newState)
    if (newState) {
      soundManager.playClick()
      addToast('Sound Enabled', 'info')
    } else {
      addToast('Sound Muted', 'info')
    }
  }

  const toggleCinematic = () => {
    soundManager.playClick()
    if (isCinematicMode) {
      toggleCinematicMode()
    } else {
      toggleCinematicMode()
      useAnimationStore.getState().play()
      addToast('Cinematic Mode Enabled', 'info')
    }
  }

  const toggleFullscreen = () => {
    soundManager.playClick()
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  const toggleRepresentation = () => {
    const nextRepresentation = representation === 'position' ? 'momentum' : 'position'
    setRepresentation(nextRepresentation)
    soundManager.playClick()
  }

  return (
    <div className="flex items-center gap-1">
      {/* Mobile: utility icon buttons */}
      {compact ? (
        <div className="flex gap-1">
          <IconButton
            icon={representation === 'position' ? TargetIcon : WaveIcon}
            active={false}
            onClick={toggleRepresentation}
            label={
              representation === 'position'
                ? 'Switch to Momentum Space'
                : 'Switch to Position Space'
            }
            small
          />
          <IconButton
            icon={PerfIcon}
            active={showPerfMonitor}
            onClick={() => {
              setShowPerfMonitor(!showPerfMonitor)
              soundManager.playClick()
            }}
            label="Performance Monitor"
            small
          />
          <IconButton
            icon={FullscreenIcon}
            active={isFullscreen}
            onClick={toggleFullscreen}
            label="Fullscreen"
            small
          />
        </div>
      ) : (
        /* Desktop: utility icon buttons */
        <>
          <button
            type="button"
            onClick={toggleRepresentation}
            onMouseEnter={() => soundManager.playHover()}
            aria-label="Switch Representation Space"
            title="Switch representation (Position ↔ Momentum)"
            data-testid="control-representation-toggle"
            className={`
              rounded-md text-sm font-medium transition-colors duration-300 border cursor-pointer
              px-3 py-1.5
              bg-[var(--bg-hover)] text-text-secondary border-border-default hover:text-text-primary hover:bg-[var(--bg-active)]
            `}
          >
            {representation === 'position' ? 'Position' : 'Momentum'}
          </button>

          <div className="w-px h-4 bg-[var(--border-subtle)] mx-1" />

          <IconButton
            icon={PerfIcon}
            active={showPerfMonitor}
            onClick={() => {
              setShowPerfMonitor(!showPerfMonitor)
              soundManager.playClick()
            }}
            label="Performance Monitor"
          />
          <IconButton
            icon={FullscreenIcon}
            active={isFullscreen}
            onClick={toggleFullscreen}
            label="Fullscreen"
          />

          <div className="w-px h-4 bg-[var(--border-subtle)] mx-1" />

          <IconButton
            icon={isSoundEnabled ? SoundOnIcon : SoundOffIcon}
            active={isSoundEnabled}
            onClick={toggleSound}
            label={isSoundEnabled ? 'Mute Sound' : 'Enable Sound'}
          />
          <IconButton
            icon={CinematicIcon}
            active={isCinematicMode}
            onClick={toggleCinematic}
            label="Cinematic Mode"
          />
        </>
      )}
    </div>
  )
})

TopBarControls.displayName = 'TopBarControls'
