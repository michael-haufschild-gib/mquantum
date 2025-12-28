import React, { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';

/** Props for Modal component */
interface ModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Callback when the modal should be closed */
  onClose: () => void;
  /** Title displayed in the modal header */
  title: string;
  /** Modal content */
  children: React.ReactNode;
  /** Optional Tailwind width class (default: 'max-w-md') */
  width?: string;
  /** Optional test ID for testing */
  'data-testid'?: string;
}

/**
 * Accessible modal dialog component with focus trapping.
 * Renders as a portal, handles escape key, prevents body scroll,
 * and manages focus for keyboard navigation.
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  width = 'max-w-md',
  'data-testid': dataTestId,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Get all focusable elements within the modal
  const getFocusableElements = useCallback(() => {
    if (!dialogRef.current) return [];
    const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelectors)).filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
    );
  }, []);

  // Focus trap handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }

    if (e.key !== 'Tab') return;

    const focusableElements = getFocusableElements();
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Safety check - should never happen given length check above, but TypeScript needs it
    if (!firstElement || !lastElement) return;

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }, [getFocusableElements, onClose]);

  // Handle focus management and escape key
  useEffect(() => {
    if (!isOpen) return;

    // Store previously focused element
    previousActiveElement.current = document.activeElement as HTMLElement;

    // Focus first focusable element in modal
    requestAnimationFrame(() => {
      const focusableElements = getFocusableElements();
      const firstElement = focusableElements[0];
      if (firstElement) {
        firstElement.focus();
      } else {
        dialogRef.current?.focus();
      }
    });

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to previous element
      previousActiveElement.current?.focus();
    };
  }, [isOpen, handleKeyDown, getFocusableElements]);

  // Handle body overflow - track previous value to restore correctly
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        ref={overlayRef}
        className="absolute inset-0"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative w-full ${width} bg-panel-bg border border-panel-border rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200`}
        data-testid={dataTestId}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-panel-border bg-panel-header/50">
          <h2 id={titleId} className="text-sm font-bold text-text-primary tracking-wide uppercase">{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            ariaLabel="Close modal"
            className="p-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </Button>
        </div>
        
        {/* Body */}
        <div className="p-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};
