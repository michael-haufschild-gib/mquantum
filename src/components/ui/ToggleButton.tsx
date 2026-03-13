import React, { useCallback } from 'react'
import { soundManager } from '@/lib/audio/SoundManager'

/**
 *
 */
export interface ToggleButtonProps extends Omit<
  React.ComponentPropsWithoutRef<'button'>,
  'onToggle'
> {
  pressed: boolean
  onToggle: (pressed: boolean) => void
  ariaLabel: string
  className?: string
  children: React.ReactNode
  /** Sound to play on click: 'click' (default) or 'swish' (for opening drawers/panels) */
  sound?: 'click' | 'swish'
}

export const ToggleButton = React.memo(
  ({
    pressed,
    onToggle,
    ariaLabel,
    className = '',
    children,
    sound = 'click',
    ref,
    ...props
  }: ToggleButtonProps & { ref?: React.Ref<HTMLButtonElement> }) => {
    const handleClick = useCallback(() => {
      if (sound === 'swish') {
        // Swish only on open, click on close
        if (!pressed) soundManager.playSwish()
        else soundManager.playClick()
      } else {
        soundManager.playClick()
      }
      onToggle(!pressed)
    }, [sound, pressed, onToggle])

    const handleMouseEnter = useCallback(() => {
      soundManager.playHover()
    }, [])

    return (
      <button
        ref={ref}
        type="button"
        aria-pressed={pressed}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        className={`
        px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-300 border outline-none
        focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent/50
        ${
          pressed
            ? 'bg-accent/20 text-accent border-accent/50 shadow-[0_0_10px_color-mix(in_oklch,var(--color-accent)_20%,transparent)]'
            : 'bg-[var(--bg-hover)] text-text-secondary border-border-default hover:text-text-primary hover:bg-[var(--bg-active)]'
        }
        ${className}
      `}
        aria-label={ariaLabel}
        {...props}
      >
        {children}
      </button>
    )
  }
)

ToggleButton.displayName = 'ToggleButton'
