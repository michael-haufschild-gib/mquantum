import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { Icon } from './Icon';
import { Button } from './Button';
import { soundManager } from '@/lib/audio/SoundManager';

export interface InlineEditProps {
  /** Current value to display */
  value: string;
  /** Callback when value is saved */
  onSave: (newValue: string) => void;
  /** Optional callback when edit is cancelled */
  onCancel?: () => void;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Whether the edit button is disabled */
  disabled?: boolean;
  /** Additional class name for the container */
  className?: string;
  /** Additional class name for the display text */
  textClassName?: string;
  /** Aria label for the edit button */
  editButtonAriaLabel?: string;
  /** Validate the input value - return error message or undefined if valid */
  validate?: (value: string) => string | undefined;
  /** Whether to select all text when entering edit mode */
  selectAllOnEdit?: boolean;
}

/**
 * InlineEdit component for editing text values inline.
 * Shows a pencil icon button that switches to an input field when clicked.
 * Supports keyboard navigation (Enter to save, Escape to cancel).
 */
export const InlineEdit: React.FC<InlineEditProps> = memo(({
  value,
  onSave,
  onCancel,
  placeholder = 'Enter value...',
  disabled = false,
  className = '',
  textClassName = '',
  editButtonAriaLabel = 'Edit',
  validate,
  selectAllOnEdit = true,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [error, setError] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

  // Update editValue when value prop changes (external update)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
    }
  }, [value, isEditing]);

  // Focus and select input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (selectAllOnEdit) {
        inputRef.current.select();
      }
    }
  }, [isEditing, selectAllOnEdit]);

  const handleStartEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (disabled) return;
    soundManager.playClick();
    setEditValue(value);
    setError(undefined);
    setIsEditing(true);
  }, [disabled, value]);

  const handleSave = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    const trimmedValue = editValue.trim();

    // Validate if validator provided
    if (validate) {
      const validationError = validate(trimmedValue);
      if (validationError) {
        setError(validationError);
        soundManager.playSnap();
        return;
      }
    }

    // Check for empty value
    if (!trimmedValue) {
      setError('Value cannot be empty');
      soundManager.playSnap();
      return;
    }

    soundManager.playClick();
    setIsEditing(false);
    setError(undefined);

    // Only call onSave if value actually changed
    if (trimmedValue !== value) {
      onSave(trimmedValue);
    }
  }, [editValue, validate, value, onSave]);

  const handleCancel = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    soundManager.playClick();
    setIsEditing(false);
    setEditValue(value);
    setError(undefined);
    onCancel?.();
  }, [value, onCancel]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  }, [handleSave, handleCancel]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
    // Clear error when user types
    if (error) {
      setError(undefined);
    }
  }, [error]);

  /** Stop propagation when clicking on the editing container */
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (isEditing) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, [isEditing]);

  return (
    <div
      className={`inline-flex items-center gap-1 min-w-0 ${className}`}
      onClick={handleContainerClick}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isEditing ? (
          <m.div
            key="editing"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1 min-w-0 flex-1"
          >
            <div className="flex flex-col min-w-0 flex-1">
              <m.input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={`
                  w-full min-w-0 bg-glass border rounded px-2 py-1 text-sm transition-all duration-200
                  ${error
                    ? 'border-danger-border focus:border-danger focus:ring-1 focus:ring-danger-border'
                    : 'border-[var(--border-subtle)] focus:border-accent focus:ring-1 focus:ring-accent/50'
                  }
                  focus:outline-none focus:bg-[var(--bg-active)]
                  text-text-primary
                `}
                animate={error ? { x: [-2, 2, -2, 2, 0] } : {}}
                transition={{ duration: 0.3 }}
              />
              <AnimatePresence>
                {error && (
                  <m.span
                    role="alert"
                    aria-live="polite"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-[10px] text-danger mt-0.5"
                  >
                    {error}
                  </m.span>
                )}
              </AnimatePresence>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => handleSave(e)}
              className="p-1 text-success hover:text-success hover:bg-success/10 shrink-0"
              ariaLabel="Save"
            >
              <Icon name="check" size={14} />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => handleCancel(e)}
              className="p-1 text-text-secondary hover:text-danger hover:bg-danger-bg shrink-0"
              ariaLabel="Cancel"
            >
              <Icon name="cross" size={14} />
            </Button>
          </m.div>
        ) : (
          <m.div
            key="display"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1 min-w-0 group/inline-edit"
          >
            <span className={`truncate ${textClassName}`}>
              {value}
            </span>

            {!disabled && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleStartEdit}
                className="p-1 opacity-0 group-hover/inline-edit:opacity-100 focus:opacity-100 text-text-secondary hover:text-accent transition-opacity shrink-0"
                ariaLabel={editButtonAriaLabel}
              >
                <Icon name="pencil" size={12} />
              </Button>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// Display name for debugging
InlineEdit.displayName = 'InlineEdit';
