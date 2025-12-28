import React from 'react';
import { soundManager } from '@/lib/audio/SoundManager';

export interface ToggleButtonProps extends Omit<React.ComponentPropsWithoutRef<'button'>, 'onToggle'> {
  pressed: boolean;
  onToggle: (pressed: boolean) => void;
  ariaLabel: string;
  className?: string;
  children: React.ReactNode;
}

export const ToggleButton = ({ 
  pressed, 
  onToggle, 
  ariaLabel, 
  className = '', 
  children, 
  ref,
  ...props 
}: ToggleButtonProps & { ref?: React.Ref<HTMLButtonElement> }) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-pressed={pressed}
        onClick={() => { soundManager.playClick(); onToggle(!pressed); }}
        onMouseEnter={() => soundManager.playHover()}
        className={`
          px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-300 border
          ${pressed
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
    );
};
