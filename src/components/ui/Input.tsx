import React, { useState, useRef, useEffect, useCallback } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { LoadingSpinner } from './LoadingSpinner';
import { soundManager } from '@/lib/audio/SoundManager';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  error?: string | boolean;
  loading?: boolean;
  clearable?: boolean;
  onClear?: () => void;
  containerClassName?: string;
  label?: string;
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
  disabled,
  value,
  onChange,
  type = 'text',
  ref,
  ...props
}: InputProps & { ref?: React.Ref<HTMLInputElement> }) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Proper ref merging using callback ref pattern
  const setRefs = useCallback(
    (element: HTMLInputElement | null) => {
      // Update internal ref
      inputRef.current = element;

      // Forward to external ref
      if (typeof ref === 'function') {
        ref(element);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLInputElement | null>).current = element;
      }
    },
    [ref]
  );

  // Sound on error
  useEffect(() => {
    if (error) {
        soundManager.playSnap(); // Use snap sound as a "reject" sound
    }
  }, [error]);

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundManager.playClick();
    if (inputRef.current) {
      inputRef.current.value = '';
      const event = new Event('input', { bubbles: true });
      inputRef.current.dispatchEvent(event);
      inputRef.current.focus();
    }
    if (onChange) {
      // Create a synthetic event
      // This is a bit hacky, but React events are complex to mock perfectly
      // Better to rely on the parent checking the value or passing an explicit onClear
    }
    if (onClear) onClear();
  };

  const hasValue = value !== undefined ? String(value).length > 0 : (inputRef.current?.value.length ?? 0) > 0;

  return (
    <div className={`flex flex-col gap-1.5 ${containerClassName}`}>
      {label && (
        <label className="text-xs font-medium text-text-secondary ms-1">
          {label}
        </label>
      )}
      
      <m.div 
        className={`relative flex items-center group transition-all duration-200
          ${error ? 'animate-shake' : ''}
        `}
        animate={error ? { x: [-2, 2, -2, 2, 0] } : {}}
        transition={{ duration: 0.4 }}
      >
        {/* Left Icon */}
        {leftIcon && (
          <div className={`absolute start-3 transition-colors ${isFocused ? 'text-accent' : 'text-text-tertiary'}`}>
            {leftIcon}
          </div>
        )}

        <input
          ref={setRefs}
          type={type}
          value={value}
          onChange={onChange}
          disabled={disabled || loading}
          onFocus={(e) => {
            setIsFocused(true);
            soundManager.playHover();
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          className={`
            w-full bg-glass border rounded-lg px-3 py-2 text-sm transition-all duration-200
            ${leftIcon ? 'ps-9' : ''}
            ${rightIcon || clearable || loading ? 'pe-9' : ''}
            ${error
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
        <div className="absolute right-3 flex items-center gap-2">
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
                  className="text-text-tertiary hover:text-text-primary rounded-full p-0.5 hover:bg-[var(--bg-active)] transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </m.button>
              )}
            </AnimatePresence>
          )}
          
          {rightIcon && !loading && (
            <div className="text-text-tertiary">
              {rightIcon}
            </div>
          )}
        </div>
      </m.div>
      
      {/* Error Message */}
      <AnimatePresence>
        {error && typeof error === 'string' && (
          <m.span
            initial={{ opacity: 0, y: -5, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -5, height: 0 }}
            className="text-xs text-danger ml-1"
          >
            {error}
          </m.span>
        )}
      </AnimatePresence>
    </div>
  );
};
