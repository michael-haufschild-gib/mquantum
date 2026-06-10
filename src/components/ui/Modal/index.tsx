import React, { useCallback, useEffect, useId, useRef } from 'react'

import { Button } from '@/components/ui/Button'
import { Z_INDEX } from '@/constants/zIndex'

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
 * Accessible modal dialog component.
 * Provides focus trapping, Escape key handling, and backdrop.
 * Manages body scroll prevention and focus restoration.
 */
export const Modal: React.FC<ModalProps> = React.memo(
  ({ isOpen, onClose, title, children, width = 'max-w-md', 'data-testid': dataTestId }) => {
    const panelRef = useRef<HTMLDivElement>(null)
    const previousActiveElement = useRef<HTMLElement | null>(null)
    const titleId = useId()

    const getFocusableElements = useCallback((): HTMLElement[] => {
      const panel = panelRef.current
      if (!panel) return []
      const selector = [
        'a[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(',')

      return Array.from(panel.querySelectorAll<HTMLElement>(selector)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement
      )
    }, [])

    // Capture and restore focus around modal visibility.
    useEffect(() => {
      if (!isOpen) return

      previousActiveElement.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null

      const focusFrame = window.requestAnimationFrame(() => {
        const firstFocusable = getFocusableElements()[0]
        ;(firstFocusable ?? panelRef.current)?.focus()
      })

      return () => {
        window.cancelAnimationFrame(focusFrame)
        previousActiveElement.current?.focus()
      }
    }, [getFocusableElements, isOpen])

    // Handle Escape and keep Tab navigation inside the modal panel.
    useEffect(() => {
      if (!isOpen) return

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
          return
        }

        if (event.key !== 'Tab') return

        const panel = panelRef.current
        if (!panel) return

        const focusable = getFocusableElements()
        if (focusable.length === 0) {
          event.preventDefault()
          panel.focus()
          return
        }

        const first = focusable[0]!
        const last = focusable[focusable.length - 1]!
        const active = document.activeElement

        if (event.shiftKey) {
          if (active === first || !(active instanceof Node && panel.contains(active))) {
            event.preventDefault()
            last.focus()
          }
          return
        }

        if (active === last) {
          event.preventDefault()
          first.focus()
        }
      }

      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [getFocusableElements, isOpen, onClose])

    // Handle backdrop click
    const handleBackdropClick = useCallback(
      (e: React.MouseEvent) => {
        // Only close if clicking directly on the backdrop (not content)
        if (e.target === e.currentTarget) {
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

    if (!isOpen) return null

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={handleBackdropClick}
        className="fixed inset-0 flex items-center justify-center bg-[var(--bg-app)]/80 p-4 animate-in zoom-in-95 fade-in duration-200"
        style={{ zIndex: Z_INDEX.MODAL }}
        data-testid={dataTestId}
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          className={`${width} w-full bg-panel border border-panel-border rounded-lg shadow-2xl overflow-hidden pointer-events-auto focus:outline-none`}
        >
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
              data-testid={dataTestId ? `${dataTestId}-close` : undefined}
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
      </div>
    )
  }
)

Modal.displayName = 'Modal'
