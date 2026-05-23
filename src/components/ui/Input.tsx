import { AnimatePresence, m } from 'motion/react'
import React, { useCallback, useEffect, useId, useRef, useState } from 'react'

import { Tooltip } from '@/components/ui/Tooltip'
import { soundManager } from '@/lib/audio/SoundManager'

import { LoadingSpinner } from './LoadingSpinner'

/** Props for the {@link Input} component. */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  error?: string | boolean
  loading?: boolean
  clearable?: boolean
  onClear?: () => void
  containerClassName?: string
  label?: string
  /** Tooltip text shown on hover over the label. */
  tooltip?: string
  /** Ref forwarded to the native input element. */
  ref?: React.Ref<HTMLInputElement>
}

export const Input = ({
  leftIcon,
  rightIcon,
  error,
  loading,
  clearable,
  onClear,
  className = '',
  containerClassName = '',
  label,
  tooltip,
  disabled,
  value,
  defaultValue,
  onChange,
  type = 'text',
  ref,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  ...props
}: InputProps) => {
  const inputId = useId()
  const errorId = `${inputId}-error`
  const [isFocused, setIsFocused] = useState(false)
  const [internalValue, setInternalValue] = useState(() =>
    defaultValue === undefined || defaultValue === null ? '' : String(defaultValue)
  )
  const inputRef = useRef<HTMLInputElement | null>(null)
  const errorMessageId = error && typeof error === 'string' ? errorId : undefined
  const describedBy = [ariaDescribedBy, errorMessageId].filter(Boolean).join(' ') || undefined
  const clearLabel = label ? `Clear ${label}` : 'Clear input'

  // Proper ref merging using callback ref pattern
  const setRefs = useCallback(
    (element: HTMLInputElement | null) => {
      // Update internal ref
      inputRef.current = element

      // Forward to external ref
      if (typeof ref === 'function') {
        ref(element)
      } else if (ref) {
        ;(ref as React.MutableRefObject<HTMLInputElement | null>).current = element
      }
    },
    [ref]
  )

  // Sound on error
  useEffect(() => {
    if (error) {
      soundManager.playSnap() // Use snap sound as a "reject" sound
    }
  }, [error])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (value === undefined) {
        setInternalValue(e.target.value)
      }
      onChange?.(e)
    },
    [onChange, value]
  )

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    soundManager.playClick()
    if (inputRef.current) {
      inputRef.current.value = ''
      setInternalValue('')
      const event = new Event('input', { bubbles: true })
      inputRef.current.dispatchEvent(event)
      inputRef.current.focus()
    }
    if (onClear) onClear()
  }

  const hasValue = value !== undefined ? String(value).length > 0 : internalValue.length > 0

  return (
    <div className={`flex flex-col gap-1.5 ${containerClassName}`}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-text-secondary ms-1">
          {tooltip ? (
            <Tooltip content={tooltip} position="top">
              <span>{label}</span>
            </Tooltip>
          ) : (
            label
          )}
        </label>
      )}

      <m.div
        className={`relative flex items-center group
          ${error ? 'animate-shake' : ''}
        `}
        animate={error ? { x: [-2, 2, -2, 2, 0] } : {}}
        transition={{ duration: 0.4 }}
      >
        {/* Left Icon */}
        {leftIcon && (
          <div
            className={`absolute start-3 transition-colors ${isFocused ? 'text-accent' : 'text-text-tertiary'}`}
          >
            {leftIcon}
          </div>
        )}

        <input
          id={inputId}
          ref={setRefs}
          type={type}
          value={value}
          defaultValue={defaultValue}
          onChange={handleChange}
          disabled={disabled || loading}
          aria-invalid={error ? true : ariaInvalid}
          aria-describedby={describedBy}
          onFocus={(e) => {
            setIsFocused(true)
            soundManager.playHover()
            props.onFocus?.(e)
          }}
          onBlur={(e) => {
            setIsFocused(false)
            props.onBlur?.(e)
          }}
          className={`
            w-full bg-control border rounded-lg px-3 py-2 text-xs transition-colors duration-200
            ${leftIcon ? 'ps-9' : ''}
            ${rightIcon || clearable || loading ? 'pe-9' : ''}
            ${
              error
                ? 'border-danger-border focus:border-danger focus:ring-1 focus:ring-danger-border placeholder:text-danger/30'
                : 'border-[var(--border-subtle)] focus:border-accent focus:ring-1 focus:ring-accent/50 placeholder:text-[var(--text-muted)]'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-[var(--border-highlight)] hover:bg-[var(--bg-hover)]'}
            focus:outline-none focus:bg-[var(--bg-active)]
            ${className}
          `}
          {...props}
        />

        {/* Right Actions */}
        <div className="absolute end-3 flex items-center gap-2">
          {loading ? (
            <LoadingSpinner size={14} className="text-text-tertiary" />
          ) : (
            <AnimatePresence>
              {clearable && hasValue && !disabled && (
                <m.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  type="button"
                  onClick={handleClear}
                  aria-label={clearLabel}
                  className="text-text-tertiary hover:text-text-primary rounded-full p-0.5 hover:bg-[var(--bg-active)] transition-colors"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </m.button>
              )}
            </AnimatePresence>
          )}

          {rightIcon && !loading && <div className="text-text-tertiary">{rightIcon}</div>}
        </div>
      </m.div>

      {/* Error Message */}
      <AnimatePresence>
        {error && typeof error === 'string' && (
          <m.span
            id={errorId}
            role="alert"
            initial={{ opacity: 0, y: -5, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -5, height: 0 }}
            className="text-xs text-danger ms-1"
          >
            {error}
          </m.span>
        )}
      </AnimatePresence>
    </div>
  )
}
