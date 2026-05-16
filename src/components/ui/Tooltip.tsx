import { AnimatePresence, m } from 'motion/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Z_INDEX } from '@/constants/zIndex'

/** Props for the portal-rendered {@link Tooltip} component. */
export interface TooltipProps {
  content: string | React.ReactNode
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
  className?: string
}

export const Tooltip: React.FC<TooltipProps> = React.memo(
  ({ content, children, position = 'top', delay = 300, className = '' }) => {
    const [isVisible, setIsVisible] = useState(false)
    const [coords, setCoords] = useState({ x: 0, y: 0 })
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const triggerRef = useRef<HTMLDivElement>(null)
    const tooltipRef = useRef<HTMLDivElement>(null)

    const clearShowTimer = useCallback(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }, [])

    const showTooltip = useCallback(() => {
      clearShowTimer()
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null
        setIsVisible(true)
      }, delay)
    }, [clearShowTimer, delay])

    const hideTooltip = useCallback(() => {
      clearShowTimer()
      setIsVisible(false)
    }, [clearShowTimer])

    useEffect(() => {
      if (isVisible && triggerRef.current && tooltipRef.current) {
        const triggerRect = triggerRef.current.getBoundingClientRect()
        const tooltipRect = tooltipRef.current.getBoundingClientRect()

        let x = 0
        let y = 0

        switch (position) {
          case 'top':
            x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
            y = triggerRect.top - tooltipRect.height - 8
            break
          case 'bottom':
            x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
            y = triggerRect.bottom + 8
            break
          case 'left':
            x = triggerRect.left - tooltipRect.width - 8
            y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
            break
          case 'right':
            x = triggerRect.right + 8
            y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
            break
        }

        // Boundary Check (Simple)
        x = Math.max(8, Math.min(window.innerWidth - tooltipRect.width - 8, x))
        y = Math.max(8, Math.min(window.innerHeight - tooltipRect.height - 8, y))

        setCoords({ x, y })
      }
    }, [isVisible, position])

    useEffect(() => {
      return () => {
        clearShowTimer()
      }
    }, [clearShowTimer])

    return (
      <div className={`relative inline-block ${className}`}>
        <div
          ref={triggerRef}
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
          onFocus={showTooltip}
          onBlur={hideTooltip}
        >
          {children}
        </div>
        {typeof document !== 'undefined' &&
          createPortal(
            <AnimatePresence>
              {isVisible && (
                <m.div
                  ref={tooltipRef}
                  initial={{ opacity: 0, scale: 0.9, y: position === 'top' ? 4 : -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className="fixed px-3 py-1.5 text-xs font-medium text-text-primary glass-panel-dark border border-border-default rounded-lg shadow-lg pointer-events-none max-w-xs break-words tracking-wide"
                  style={{
                    left: `${coords.x}px`,
                    top: `${coords.y}px`,
                    zIndex: Z_INDEX.TOOLTIP,
                    textShadow: '0 1px 2px var(--bg-overlay)',
                  }}
                  role="tooltip"
                >
                  {content}
                </m.div>
              )}
            </AnimatePresence>,
            document.body
          )}
      </div>
    )
  }
)

Tooltip.displayName = 'Tooltip'
