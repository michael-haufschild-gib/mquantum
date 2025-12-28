import React from 'react';
import { m, LayoutGroup } from 'motion/react';
import { soundManager } from '@/lib/audio/SoundManager';

export interface ToggleOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface ToggleGroupProps<T extends string = string> {
  options: ToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  'data-testid'?: string;
}

export const ToggleGroup = <T extends string = string>({
  options,
  value,
  onChange,
  className = '',
  disabled = false,
  ariaLabel,
  'data-testid': testId,
}: ToggleGroupProps<T>) => {
  const layoutId = React.useId();

  return (
    <LayoutGroup id={layoutId}>
    <div
      className={`flex p-1 gap-1 glass-input rounded-lg border border-[var(--border-subtle)] ${className}`}
      role="group"
    >
        {options.map((option) => {
          const isSelected = option.value === value;
          const isDisabled = disabled || option.disabled;
          return (
            <button
              key={option.value}
              onClick={() => {
                if (!isDisabled && !isSelected) {
                    onChange(option.value);
                    soundManager.playClick();
                }
              }}
              onMouseEnter={() => !isSelected && !isDisabled && soundManager.playHover()}
              disabled={isDisabled}
              className={`
                flex-1 relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-200 z-10
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isSelected
                  ? 'text-accent'
                  : 'text-text-secondary hover:text-text-primary'
                }
              `}
              role="radio"
              aria-checked={isSelected}
              data-testid={testId ? `${testId}-${option.value}` : undefined}
            >
              {isSelected && (
                <m.div 
                    layoutId={`active-bg-${layoutId}`}
                    className="absolute inset-0 bg-accent/15 border border-accent/40 rounded-md shadow-[0_0_15px_color-mix(in_oklch,var(--color-accent)_15%,transparent)] z-[-1]"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              <span className="relative z-10">{option.label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
};
