import React, { useEffect, useId, useRef } from 'react';
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
 * Accessible modal dialog component using native HTML dialog element.
 * Provides built-in focus trapping, Escape key handling, and backdrop.
 * Manages body scroll prevention and focus restoration.
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  width = 'max-w-md',
  'data-testid': dataTestId,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Sync dialog open state with isOpen prop
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Handle native dialog close event (Escape key, form submission)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      onClose();
      // Restore focus to previous element
      previousActiveElement.current?.focus();
    };

    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if clicking directly on the dialog backdrop (not content)
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
      className={`${width} p-0 bg-transparent border-none rounded-lg backdrop:bg-[var(--bg-app)]/50 backdrop:backdrop-blur-sm open:animate-in open:zoom-in-95 open:fade-in duration-200`}
      data-testid={dataTestId}
    >
      <div className="bg-panel border border-panel-border rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-panel-border bg-panel-header/50">
          <h2 id={titleId} className="text-sm font-bold text-text-primary tracking-wide uppercase">
            {title}
          </h2>
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
    </dialog>
  );
};
