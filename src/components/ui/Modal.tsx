import React, { useCallback, useEffect, useId, useRef } from 'react'

import { Button } from '@/components/ui/Button'

/** Props for Modal component */
interface ModalProps {
  /** Whether the modal is visible */
  isOpen: boolean
  /** Callback when the modal should be closed */
  onClose: () => void
  /** Title displayed in the modal header */
  title: string
  /** Modal content */
  children: React.ReactNode
  /** Optional Tailwind width class (default: 'max-w-md') */
  width?: string
  /** Optional test ID for testing */
  'data-testid'?: string
}

/**
 * Accessible modal dialog component using native HTML dialog element.
 * Provides built-in focus trapping, Escape key handling, and backdrop.
 * Manages body scroll prevention and focus restoration.
 */
export const Modal: React.FC<ModalProps> = React.memo(
  ({ isOpen, onClose, title, children, width = 'max-w-md', 'data-testid': dataTestId }) => {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const previousActiveElement = useRef<HTMLElement | null>(null)
    /** Tracks programmatic closes so the native 'close' event doesn't re-fire onClose. */
    const closingProgrammatically = useRef(false)
    const titleId = useId()

    // Sync dialog open state with isOpen prop
    useEffect(() => {
      const dialog = dialogRef.current
      if (!dialog) return

      if (isOpen && !dialog.open) {
        previousActiveElement.current = document.activeElement as HTMLElement
        dialog.showModal()
      } else if (!isOpen && dialog.open) {
        // Mark this close as programmatic so the 'close' event handler skips onClose
        closingProgrammatically.current = true
        dialog.close()
      }
    }, [isOpen])

    // Handle native dialog close event (Escape key, form submission)
    useEffect(() => {
      const dialog = dialogRef.current
      if (!dialog) return

      const handleClose = () => {
        // Restore focus to previous element
        previousActiveElement.current?.focus()

        // Only fire onClose for user-initiated closes (Escape key, form submission).
        // Programmatic closes (parent set isOpen=false) already handled state upstream.
        if (closingProgrammatically.current) {
          closingProgrammatically.current = false
          return
        }
        onClose()
      }

      dialog.addEventListener('close', handleClose)
      return () => dialog.removeEventListener('close', handleClose)
    }, [onClose])

    // Handle backdrop click
    const handleBackdropClick = useCallback(
      (e: React.MouseEvent) => {
        // Only close if clicking directly on the dialog backdrop (not content)
        if (e.target === dialogRef.current) {
          onClose()
        }
      },
      [onClose]
    )

    // Prevent body scroll when modal is open
    useEffect(() => {
      if (!isOpen) return

      const previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'

      return () => {
        document.body.style.overflow = previousOverflow
      }
    }, [isOpen])

    return (
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={handleBackdropClick}
        className={`${width} w-full p-0 bg-transparent border-none rounded-lg backdrop:bg-[var(--bg-app)]/50 backdrop:backdrop-blur-sm open:animate-in open:zoom-in-95 open:fade-in duration-200`}
        style={{ margin: 'auto' }}
        data-testid={dataTestId}
      >
        <div className="bg-panel border border-panel-border rounded-lg shadow-2xl overflow-hidden pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-panel-border bg-panel-header/50">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="inline-block w-1 h-3.5 rounded-sm bg-accent/80 shadow-[0_0_6px_var(--color-accent-glow)] shrink-0"
                aria-hidden
              />
              <h2
                id={titleId}
                className="text-sm font-semibold tracking-tight text-text-primary truncate"
              >
                {title}
              </h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              ariaLabel="Close modal"
              className="p-1"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </Button>
          </div>

          {/* Body */}
          <div className="p-4 max-h-[80vh] overflow-y-auto custom-scrollbar">{children}</div>
        </div>
      </dialog>
    )
  }
)

Modal.displayName = 'Modal'
