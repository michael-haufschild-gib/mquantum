import { AnimatePresence, m } from 'motion/react'
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

import { soundManager } from '@/lib/audio/SoundManager'
import { supportsPopover } from '@/lib/dom/popoverSupport'

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

const VIEWPORT_MARGIN = 8

/** Computes the horizontal position based on alignment. */
function computeHorizontalPosition(
  align: 'start' | 'end' | 'center',
  triggerRect: DOMRect,
  popoverWidth: number
): number {
  if (align === 'end') return triggerRect.right - popoverWidth
  if (align === 'center') return triggerRect.left + triggerRect.width / 2 - popoverWidth / 2
  return triggerRect.left
}

/** Computes the vertical position, flipping to the opposite side when needed. */
function computeVerticalPosition(
  side: 'top' | 'bottom',
  triggerRect: DOMRect,
  popoverHeight: number,
  offset: number
): number {
  const spaceBelow = window.innerHeight - triggerRect.bottom - offset
  const spaceAbove = triggerRect.top - offset

  const belowTop = triggerRect.bottom + offset
  const aboveTop = triggerRect.top - popoverHeight - offset

  if (side === 'bottom') {
    return popoverHeight > spaceBelow && spaceAbove > spaceBelow ? aboveTop : belowTop
  }
  return popoverHeight > spaceAbove && spaceBelow > spaceAbove ? belowTop : aboveTop
}

/** Computes clamped popover coordinates relative to the trigger element. */
function computePopoverCoords(
  triggerRect: DOMRect,
  popoverRect: { width: number; height: number },
  side: 'top' | 'bottom',
  align: 'start' | 'end' | 'center',
  offset: number
): { top: number; left: number } {
  const top = computeVerticalPosition(side, triggerRect, popoverRect.height, offset)
  const left = computeHorizontalPosition(align, triggerRect, popoverRect.width)

  return {
    top: Math.max(
      VIEWPORT_MARGIN,
      Math.min(top, window.innerHeight - popoverRect.height - VIEWPORT_MARGIN)
    ),
    left: Math.max(
      VIEWPORT_MARGIN,
      Math.min(left, window.innerWidth - popoverRect.width - VIEWPORT_MARGIN)
    ),
  }
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
    // Guarded: Popover API requires Safari 17+, Chrome 114+, Firefox 125+.
    useEffect(() => {
      if (!supportsPopover) return
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
      if (!supportsPopover) return
      const popover = popoverRef.current
      if (!popover) return

      const handleToggle = (e: Event) => {
        const toggleEvent = e as ToggleEvent
        handleOpenChange(toggleEvent.newState === 'open')
      }

      popover.addEventListener('toggle', handleToggle)
      return () => popover.removeEventListener('toggle', handleToggle)
    }, [handleOpenChange])

    // Fallback light-dismiss: click-outside and Escape when Popover API unavailable
    useEffect(() => {
      if (supportsPopover || !isOpen) return

      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Node
        if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return
        handleOpenChange(false)
      }

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') handleOpenChange(false)
      }

      window.addEventListener('pointerdown', handleClickOutside, true)
      window.addEventListener('keydown', handleEscape)
      return () => {
        window.removeEventListener('pointerdown', handleClickOutside, true)
        window.removeEventListener('keydown', handleEscape)
      }
    }, [isOpen, handleOpenChange])

    useLayoutEffect(() => {
      if (!isOpen) return undefined

      const updatePosition = () => {
        if (!triggerRef.current) return
        const triggerRect = triggerRef.current.getBoundingClientRect()
        const popoverRect = popoverRef.current?.getBoundingClientRect() || { width: 0, height: 0 }
        setCoords(computePopoverCoords(triggerRect, popoverRect, side, align, offset))
      }

      // Initial position (may have zero dimensions)
      const initialPositionTimer = window.setTimeout(updatePosition, 0)

      // Re-position after content renders and has actual dimensions
      // Use double rAF to ensure content is painted before measuring
      let rafId: number
      const reposition = () => {
        rafId = requestAnimationFrame(() => {
          rafId = requestAnimationFrame(updatePosition)
        })
      }
      reposition()

      // Use ResizeObserver to reposition when content dimensions change
      let resizeObserver: ResizeObserver | null = null
      if (popoverRef.current) {
        resizeObserver = new ResizeObserver(updatePosition)
        resizeObserver.observe(popoverRef.current)
      }

      window.addEventListener('resize', updatePosition)
      window.addEventListener('scroll', updatePosition, true) // Capture phase for nested scrolls

      return () => {
        clearTimeout(initialPositionTimer)
        cancelAnimationFrame(rafId)
        resizeObserver?.disconnect()
        window.removeEventListener('resize', updatePosition)
        window.removeEventListener('scroll', updatePosition, true)
      }
    }, [isOpen, side, align, offset])

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
          {...(supportsPopover ? { popover: 'auto' } : {})}
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
