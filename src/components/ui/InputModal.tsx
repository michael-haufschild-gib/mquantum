import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface InputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
  title: string;
  message?: React.ReactNode;
  initialValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  allowEmpty?: boolean;
  readOnly?: boolean;
}

export const InputModal: React.FC<InputModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  initialValue = '',
  placeholder = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  allowEmpty = false,
  readOnly = false,
}) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      // Focus after animation
      setTimeout(() => {
        inputRef.current?.focus();
        if (readOnly) {
          inputRef.current?.select();
        }
      }, 100);
    }
  }, [isOpen, initialValue, readOnly]);

  const handleConfirm = () => {
    if (!allowEmpty && !value.trim()) return;
    onConfirm(value);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Stop propagation for all keys to prevent global shortcuts from firing
    e.stopPropagation();

    if (e.key === 'Enter') {
      handleConfirm();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} width="max-w-md">
      <div className="space-y-4">
        {message && (
          <div className="text-text-secondary text-sm">
            {message}
          </div>
        )}
        <div>
           <input
            ref={inputRef}
            type="text"
            className={`w-full bg-[var(--bg-hover)] border border-panel-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all placeholder:text-text-muted ${readOnly ? 'cursor-text' : ''}`}
            placeholder={placeholder}
            value={value}
            onChange={(e) => !readOnly && setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            readOnly={readOnly}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} size="sm">
            {cancelText}
          </Button>
          <Button 
            variant="primary" 
            onClick={handleConfirm}
            size="sm"
            disabled={!allowEmpty && !value.trim()}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
