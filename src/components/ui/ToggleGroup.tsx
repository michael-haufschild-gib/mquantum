import { LayoutGroup, m } from 'motion/react'
import React, { useCallback } from 'react'

import { Tooltip } from '@/components/ui/Tooltip'
import { soundManager } from '@/lib/audio/SoundManager'

/** Single option within a {@link ToggleGroup}. */
export interface ToggleOption<T extends string = string> {
  value: T
  label: string
  disabled?: boolean
}

/** Props for the {@link ToggleGroup} mutually-exclusive option selector. */
export interface ToggleGroupProps<T extends string = string> {
  options: ToggleOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  disabled?: boolean
  ariaLabel?: string
  /** Tooltip text shown on hover over the group label area. */
  tooltip?: string
  /** When true, the group stretches to fill its container width. */
  fullWidth?: boolean
  'data-testid'?: string
}

// Internal button component to properly memoize handlers
const ToggleGroupButton = React.memo(
  <T extends string>({
    option,
    isSelected,
    isDisabled,
    onChange,
    layoutId,
    testId,
  }: {
    option: ToggleOption<T>
    isSelected: boolean
    isDisabled: boolean
    onChange: (value: T) => void
    layoutId: string
    testId?: string
  }) => {
    const handleClick = useCallback(() => {
      if (!isDisabled && !isSelected) {
        onChange(option.value)
        soundManager.playClick()
      }
    }, [isDisabled, isSelected, onChange, option.value])

    const handleMouseEnter = useCallback(() => {
      if (!isSelected && !isDisabled) {
        soundManager.playHover()
      }
    }, [isSelected, isDisabled])

    return (
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        disabled={isDisabled}
        className={`
        flex-1 relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-200 z-10 outline-none
        focus-visible:ring-1 focus-visible:ring-accent/50
        disabled:opacity-50 disabled:cursor-not-allowed
        ${isSelected ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}
      `}
        role="radio"
        aria-checked={isSelected}
        data-testid={testId ? `${testId}-${option.value}` : undefined}
      >
        {isSelected && (
          <m.div
            layoutId={`active-bg-${layoutId}`}
            className="absolute inset-0 bg-accent/15 border border-accent/40 rounded-md shadow-[0_0_15px_color-mix(in_oklch,var(--color-accent)_15%,transparent)] z-[-1]"
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        )}
        <span className="relative z-10">{option.label}</span>
      </button>
    )
  }
)

ToggleGroupButton.displayName = 'ToggleGroupButton'

export const ToggleGroup = React.memo(
  <T extends string = string>({
    options,
    value,
    onChange,
    className = '',
    disabled = false,
    ariaLabel,
    tooltip,
    fullWidth = false,
    'data-testid': testId,
  }: ToggleGroupProps<T>) => {
    const layoutId = React.useId()

    const group = (
      <LayoutGroup id={layoutId}>
        <div
          className={`flex p-1 gap-1 glass-input rounded-lg border border-[var(--border-subtle)] ${fullWidth ? 'w-full' : ''} ${className}`}
          role="radiogroup"
          aria-label={ariaLabel}
          data-testid={testId}
        >
          {options.map((option) => {
            const isSelected = option.value === value
            const isDisabled = disabled || option.disabled
            return (
              <ToggleGroupButton
                key={option.value}
                option={option as ToggleOption<string>}
                isSelected={isSelected}
                isDisabled={isDisabled ?? false}
                onChange={onChange as (value: string) => void}
                layoutId={layoutId}
                testId={testId}
              />
            )
          })}
        </div>
      </LayoutGroup>
    )

    if (tooltip) {
      return (
        <Tooltip content={tooltip} position="top" className={fullWidth ? 'w-full block' : ''}>
          {group}
        </Tooltip>
      )
    }

    return group
  }
) as <T extends string = string>(props: ToggleGroupProps<T>) => React.ReactElement
;(ToggleGroup as React.FC).displayName = 'ToggleGroup'
