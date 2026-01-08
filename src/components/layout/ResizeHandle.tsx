/**
 * ResizeHandle Component
 *
 * Vertical drag handle for resizing the sidebar width.
 * Uses pointer events for cross-device compatibility (mouse + touch).
 *
 * Visual design:
 * - Thin vertical line that highlights on hover/drag
 * - Cursor changes to col-resize during interaction
 * - Subtle visual feedback during active drag
 */

import {
  clampSidebarWidth,
  useLayoutStore,
} from '@/stores/layoutStore'
import React, { useCallback, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

export interface ResizeHandleProps {
  /** Additional CSS classes */
  className?: string
}

/**
 * ResizeHandle - Draggable handle for sidebar width adjustment.
 *
 * Uses pointer capture to ensure smooth dragging even when cursor
 * moves outside the handle area. Updates are throttled via RAF.
 *
 * @param props - Component props
 * @param props.className - Additional CSS classes
 * @returns React component
 */
export const ResizeHandle: React.FC<ResizeHandleProps> = React.memo(({ className = '' }) => {
  const handleRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const rafIdRef = useRef<number | null>(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const { setSidebarWidth, sidebarWidth } = useLayoutStore(
    useShallow((state) => ({
      setSidebarWidth: state.setSidebarWidth,
      sidebarWidth: state.sidebarWidth,
    }))
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Capture pointer to receive events even outside element
      handleRef.current?.setPointerCapture(e.pointerId)

      setIsDragging(true)
      startXRef.current = e.clientX
      startWidthRef.current = sidebarWidth

      // Add body class to prevent text selection during drag
      document.body.classList.add('resize-dragging')
    },
    [sidebarWidth]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return

      // Cancel any pending RAF to avoid buildup
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }

      // Throttle updates via requestAnimationFrame
      rafIdRef.current = requestAnimationFrame(() => {
        // Calculate delta (negative because handle is on LEFT of sidebar)
        const deltaX = startXRef.current - e.clientX
        const newWidth = startWidthRef.current + deltaX
        const viewportWidth = window.innerWidth

        // Clamp and update
        const clampedWidth = clampSidebarWidth(newWidth, viewportWidth)
        setSidebarWidth(clampedWidth, viewportWidth)
      })
    },
    [isDragging, setSidebarWidth]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return

      // Release pointer capture
      handleRef.current?.releasePointerCapture(e.pointerId)

      setIsDragging(false)
      document.body.classList.remove('resize-dragging')

      // Clean up any pending RAF
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    },
    [isDragging]
  )

  return (
    <div
      ref={handleRef}
      className={`
        absolute left-0 top-0 bottom-0 w-2 -translate-x-1/2
        cursor-col-resize z-10 group
        ${className}
      `}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
    >
      {/* Visual handle line */}
      <div
        className={`
          absolute left-1/2 top-4 bottom-4 w-1 -translate-x-1/2
          rounded-full transition-colors duration-150
          ${
            isDragging
              ? 'bg-accent shadow-[0_0_8px_var(--color-accent)]'
              : 'bg-border/30 group-hover:bg-accent/60'
          }
        `}
      />

      {/* Larger invisible hit area */}
      <div className="absolute inset-0 -left-1 -right-1" />
    </div>
  )
});

ResizeHandle.displayName = 'ResizeHandle';
