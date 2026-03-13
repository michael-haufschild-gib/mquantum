import React, { useState, useEffect, useRef, useCallback } from 'react'
import { m, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/Button'

/**
 *
 */
export interface SectionProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
  onReset?: () => void
  'data-testid'?: string
}

export const Section: React.FC<SectionProps> = React.memo(
  ({
    title,
    defaultOpen = false,
    children,
    className = '',
    onReset,
    'data-testid': dataTestId,
  }) => {
    // Persistence logic
    const storageKey = `section-state-${title.replace(/\s+/g, '-').toLowerCase()}`
    const sectionRef = useRef<HTMLDivElement>(null)
    const scrollTimerRef = useRef<number | null>(null)

    // Cleanup scroll timer on unmount
    useEffect(() => {
      return () => {
        if (scrollTimerRef.current !== null) {
          window.clearTimeout(scrollTimerRef.current)
        }
      }
    }, [])

    const [isOpen, setIsOpen] = useState(() => {
      try {
        const stored = localStorage.getItem(storageKey)
        if (stored === null) {
          return defaultOpen
        }
        const parsed: unknown = JSON.parse(stored)
        return typeof parsed === 'boolean' ? parsed : defaultOpen
      } catch {
        return defaultOpen
      }
    })

    useEffect(() => {
      localStorage.setItem(storageKey, JSON.stringify(isOpen))
    }, [isOpen, storageKey])

    const handleToggle = useCallback(() => {
      const willOpen = !isOpen
      setIsOpen(willOpen)
      if (willOpen && sectionRef.current) {
        // Clear any pending scroll timer
        if (scrollTimerRef.current !== null) {
          window.clearTimeout(scrollTimerRef.current)
        }
        // Instant scroll start, but smooth behavior
        scrollTimerRef.current = window.setTimeout(() => {
          sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          scrollTimerRef.current = null
        }, 100)
      }
    }, [isOpen])

    const handleResetClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation()
        onReset?.()
      },
      [onReset]
    )

    return (
      <div
        ref={sectionRef}
        className={`
        group relative overflow-hidden border-b border-[var(--border-subtle)] last:border-b-0
        ${className}
      `}
        data-testid={dataTestId}
      >
        <div className="flex items-center justify-between bg-[var(--bg-hover)] border-b border-[var(--border-subtle)] hover:bg-[var(--bg-active)] transition-colors duration-200">
          <Button
            onClick={handleToggle}
            className="flex-1 flex items-center justify-between py-3 px-4 text-left outline-none border-none focus-visible:ring-1 focus-visible:ring-accent/50 focus-visible:ring-inset z-10"
            aria-expanded={isOpen}
            data-testid={dataTestId ? `${dataTestId}-header` : undefined}
            variant="ghost"
            size="md"
          >
            <div className="flex items-center gap-3">
              {/* LED Indicator - static glow, no animation = 0 style recalcs */}
              <div className="relative flex items-center justify-center w-2 h-2">
                {isOpen && <div className="absolute inset-0 rounded-full bg-accent led-glow" />}
                <div
                  className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${isOpen ? 'bg-accent' : 'bg-[var(--text-tertiary)] group-hover:bg-[var(--text-secondary)]'}`}
                />
              </div>

              <h3
                className={`text-[11px] font-bold tracking-widest uppercase transition-colors duration-200 ${isOpen ? 'text-[var(--text-primary)] text-glow-subtle' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'}`}
              >
                {title}
              </h3>
            </div>

            {/* Chevron */}
            <m.div
              animate={{
                rotate: isOpen ? 180 : 0,
              }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className={`transition-colors duration-200 ${isOpen ? 'text-accent' : 'text-text-tertiary opacity-50 group-hover:opacity-100'}`}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </m.div>
          </Button>

          {isOpen && onReset && (
            <m.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={handleResetClick}
              className="mr-3 p-1 text-[var(--text-tertiary)] hover:text-accent transition-colors rounded hover:bg-[var(--bg-hover)] relative z-20"
              title={`Reset ${title} settings`}
              data-testid={dataTestId ? `${dataTestId}-reset` : undefined}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </m.button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {isOpen && (
            <m.div
              id={`section-content-${title}`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
              className="overflow-hidden bg-[var(--bg-panel)]/30"
            >
              <div className="px-4 pb-4 pt-2 space-y-5">{children}</div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    )
  }
)

Section.displayName = 'Section'
