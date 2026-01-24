import React, { useCallback } from 'react'
import { soundManager } from '@/lib/audio/SoundManager'

/** Single option in a Select dropdown */
export interface SelectOption<T extends string = string> {
  /** The value used internally */
  value: T
  /** The label displayed to the user */
  label: string
}

/** Props for the Select component */
export interface SelectProps<T extends string = string> {
  /** Optional label displayed above the select */
  label?: string
  /** Array of available options */
  options: SelectOption<T>[]
  /** Currently selected value */
  value: T
  /** Callback when selection changes */
  onChange: (value: T) => void
  /** Additional CSS classes */
  className?: string
  /** Whether the select is disabled */
  disabled?: boolean
  /** Test ID for testing */
  'data-testid'?: string
}

/**
 * Styled dropdown select component with glass morphism design.
 *
 * Provides a native select element with custom styling, hover effects,
 * and optional label. Supports generic string types for type-safe values.
 *
 * @param props - Component props
 * @returns The styled select dropdown
 *
 * @example
 * ```tsx
 * <Select
 *   label="Choose option"
 *   options={[{ value: 'a', label: 'Option A' }]}
 *   value={selected}
 *   onChange={setSelected}
 * />
 * ```
 */
export const Select = React.memo(
  <T extends string = string>({
    label,
    options,
    value,
    onChange,
    className = '',
    disabled = false,
    'data-testid': testId,
  }: SelectProps<T>) => {
    // Generate a unique ID for the select element to associate with the label
    const selectId = React.useId()

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLSelectElement>) => {
        onChange(e.target.value as T)
      },
      [onChange]
    )

    const handleMouseEnter = useCallback(() => {
      if (!disabled) {
        soundManager.playHover()
      }
    }, [disabled])

    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-text-secondary">
            {label}
          </label>
        )}
        <div className="relative group">
          <select
            id={selectId}
            value={value}
            onChange={handleChange}
            onMouseEnter={handleMouseEnter}
            disabled={disabled}
            data-testid={testId}
            className="glass-input w-full ps-3 pe-8 py-1.5 text-xs text-[var(--text-primary)] rounded-lg appearance-none cursor-pointer focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-hover)] transition-colors"
          >
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                className="bg-background text-text-primary"
              >
                {option.label}
              </option>
            ))}
          </select>
          <div className="absolute end-2.5 top-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-200 group-hover:translate-y-[-40%]">
            <svg
              className="w-3.5 h-3.5 text-text-tertiary group-hover:text-text-primary transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
      </div>
    )
  }
) as <T extends string = string>(props: SelectProps<T>) => React.ReactElement

;(Select as React.FC).displayName = 'Select'
