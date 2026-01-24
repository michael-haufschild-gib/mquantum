import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useId } from 'react'
import { m, AnimatePresence } from 'motion/react'
import { soundManager } from '@/lib/audio/SoundManager'

/** Props for the Popover component */
export interface PopoverProps {
  /** The trigger element that opens the popover on click */
  trigger: React.ReactNode
  /** The content to display inside the popover */
  content: React.ReactNode
  /** Additional CSS classes for the popover content container */
  className?: string
  /** Horizontal alignment relative to the trigger */
  align?: 'start' | 'end' | 'center'
  /** Vertical side to display the popover */
  side?: 'top' | 'bottom'
  /** Controlled open state */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Pixel offset from the trigger element */
  offset?: number
}

/**
 * Floating popover component with automatic positioning and animations.
 *
 * Supports both controlled and uncontrolled modes. Automatically repositions
 * to stay within viewport bounds. Closes on outside click or Escape key.
 *
 * @param props - Component props
 * @returns The popover component with trigger and floating content
 *
 * @example
 * ```tsx
 * <Popover
 *   trigger={<Button>Open Menu</Button>}
 *   content={<div>Popover content</div>}
 *   align="start"
 *   side="bottom"
 * />
 * ```
 */
export const Popover: React.FC<PopoverProps> = React.memo(
  ({
    trigger,
    content,
    className = '',
    align = 'start',
    side = 'bottom',
    open: controlledOpen,
    onOpenChange,
    offset = 4,
  }) => {
    const popoverRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLDivElement>(null)
    const popoverId = useId()

    const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
    const isControlled = controlledOpen !== undefined
    const isOpen = isControlled ? controlledOpen : uncontrolledOpen

    const [coords, setCoords] = useState({ top: 0, left: 0 })

    // Track previous open state to play swish on open
    const prevIsOpenRef = useRef(isOpen)
    useEffect(() => {
      if (isOpen && !prevIsOpenRef.current) {
        soundManager.playSwish()
      }
      prevIsOpenRef.current = isOpen
    }, [isOpen])

    const handleOpenChange = useCallback(
      (newOpen: boolean) => {
        if (!isControlled) {
          setUncontrolledOpen(newOpen)
        }
        onOpenChange?.(newOpen)
      },
      [isControlled, onOpenChange]
    )

    const handleTriggerClick = useCallback(() => {
      handleOpenChange(!isOpen)
    }, [handleOpenChange, isOpen])

    // Sync popover visibility with React state
    useEffect(() => {
      const popover = popoverRef.current
      if (!popover) return

      if (isOpen && !popover.matches(':popover-open')) {
        popover.showPopover()
      } else if (!isOpen && popover.matches(':popover-open')) {
        popover.hidePopover()
      }
    }, [isOpen])

    // Handle toggle event to sync state when popover closes via light-dismiss
    useEffect(() => {
      const popover = popoverRef.current
      if (!popover) return

      const handleToggle = (e: Event) => {
        const toggleEvent = e as ToggleEvent
        handleOpenChange(toggleEvent.newState === 'open')
      }

      popover.addEventListener('toggle', handleToggle)
      return () => popover.removeEventListener('toggle', handleToggle)
    }, [handleOpenChange])

    // Update position - memoized to avoid stale closure in event listeners
    const updatePosition = useCallback(() => {
      if (triggerRef.current && isOpen) {
        const triggerRect = triggerRef.current.getBoundingClientRect()
        const popoverRect = popoverRef.current?.getBoundingClientRect() || { width: 0, height: 0 }

        let top = 0
        let left = 0

        // Vertical Positioning
        if (side === 'bottom') {
          top = triggerRect.bottom + offset
        } else {
          top = triggerRect.top - popoverRect.height - offset
        }

        // Horizontal Positioning
        if (align === 'start') {
          left = triggerRect.left
        } else if (align === 'end') {
          left = triggerRect.right - popoverRect.width
        } else {
          left = triggerRect.left + triggerRect.width / 2 - popoverRect.width / 2
        }

        // Viewport Collision Detection
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const margin = 8

        // Calculate available space in each direction
        const spaceBelow = viewportHeight - triggerRect.bottom - offset
        const spaceAbove = triggerRect.top - offset

        // Smart vertical positioning: flip if needed and beneficial
        if (side === 'bottom') {
          if (popoverRect.height > spaceBelow && spaceAbove > spaceBelow) {
            // Flip to top if more space available above
            top = triggerRect.top - popoverRect.height - offset
          }
        } else {
          if (popoverRect.height > spaceAbove && spaceBelow > spaceAbove) {
            // Flip to bottom if more space available below
            top = triggerRect.bottom + offset
          }
        }

        // Clamp vertical position to keep within viewport bounds
        top = Math.max(margin, Math.min(top, viewportHeight - popoverRect.height - margin))

        // Clamp horizontal position to keep within viewport bounds
        left = Math.max(margin, Math.min(left, viewportWidth - popoverRect.width - margin))

        setCoords({ top, left })
      }
    }, [isOpen, side, align, offset])

    useLayoutEffect(() => {
      if (isOpen) {
        // Initial position (may have zero dimensions)
        updatePosition()

        // Re-position after content renders and has actual dimensions
        // Use double rAF to ensure content is painted before measuring
        let rafId: number
        const reposition = () => {
          rafId = requestAnimationFrame(() => {
            rafId = requestAnimationFrame(() => {
              updatePosition()
            })
          })
        }
        reposition()

        // Use ResizeObserver to reposition when content dimensions change
        let resizeObserver: ResizeObserver | null = null
        if (popoverRef.current) {
          resizeObserver = new ResizeObserver(() => {
            updatePosition()
          })
          resizeObserver.observe(popoverRef.current)
        }

        window.addEventListener('resize', updatePosition)
        window.addEventListener('scroll', updatePosition, true) // Capture phase for nested scrolls

        return () => {
          cancelAnimationFrame(rafId)
          resizeObserver?.disconnect()
          window.removeEventListener('resize', updatePosition)
          window.removeEventListener('scroll', updatePosition, true)
        }
      }
      return () => {
        window.removeEventListener('resize', updatePosition)
        window.removeEventListener('scroll', updatePosition, true)
      }
    }, [isOpen, updatePosition])

    return (
      <>
        <div
          ref={triggerRef}
          onClick={handleTriggerClick}
          className={`inline-block cursor-pointer ${className}`}
          role="button"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
        >
          {trigger}
        </div>

        <div
          ref={popoverRef}
          popover="auto"
          id={popoverId}
          className="m-0 p-0 border-none bg-transparent"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
          }}
        >
          <AnimatePresence>
            {isOpen && (
              <m.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.1, ease: 'easeOut' }}
                className="glass-panel rounded-lg shadow-2xl border border-border-default"
                style={{ backdropFilter: 'blur(24px)' }}
              >
                {content}
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </>
    )
  }
)

Popover.displayName = 'Popover'
