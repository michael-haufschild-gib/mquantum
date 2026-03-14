import { soundManager } from '@/lib/audio/SoundManager'
import { Tooltip } from '@/components/ui/Tooltip'
import { AnimatePresence, m } from 'motion/react'
import React, { useState, useCallback } from 'react'

/**
 *
 */
export interface ControlGroupProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  collapsible?: boolean
  className?: string
  rightElement?: React.ReactNode
  variant?: 'default' | 'card'
  /** Tooltip text shown on hover over the title */
  tooltip?: string
}

export const ControlGroup: React.FC<ControlGroupProps> = React.memo(
  ({
    title,
    children,
    defaultOpen = true,
    collapsible = false,
    className = '',
    rightElement,
    variant = 'default',
    tooltip,
  }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen)

    const toggle = useCallback(() => {
      if (collapsible) {
        setIsOpen((prev) => !prev)
        soundManager.playClick()
      }
    }, [collapsible])

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (collapsible && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          setIsOpen((prev) => !prev)
          soundManager.playClick()
        }
      },
      [collapsible]
    )

    const handleMouseEnter = useCallback(() => {
      if (collapsible) {
        soundManager.playHover()
      }
    }, [collapsible])

    const handleRightElementClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation()
    }, [])

    const isCard = variant === 'card'
    const showTitleSection = collapsible || title.trim() !== ''

    return (
      <div
        className={`
      ${isCard ? 'border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-hover)] overflow-hidden' : 'border-b border-[var(--border-subtle)] pb-2 last:border-0'}
      ${className}
    `}
      >
        {showTitleSection && (
          <div
            role={collapsible ? 'button' : undefined}
            tabIndex={collapsible ? 0 : undefined}
            aria-expanded={collapsible ? isOpen : undefined}
            aria-label={
              collapsible ? `${title} section, ${isOpen ? 'expanded' : 'collapsed'}` : undefined
            }
            className={`
            flex items-center justify-between py-1.5
            ${isCard ? 'px-3 bg-[var(--bg-active)] border-b border-[var(--border-subtle)]' : ''}
            ${collapsible ? 'cursor-pointer hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-1 focus:ring-accent/50 focus:ring-inset' : ''}
          `}
            onClick={toggle}
            onMouseEnter={handleMouseEnter}
            onKeyDown={handleKeyDown}
          >
            <div className="flex items-center gap-2">
              {collapsible && (
                <m.div
                  animate={{ rotate: isOpen ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-text-tertiary"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </m.div>
              )}
              {tooltip ? (
                <Tooltip content={tooltip} position="top">
                  <span
                    className={`text-xs font-semibold uppercase tracking-wider ${collapsible ? 'text-text-secondary group-hover:text-text-primary' : 'text-text-secondary'}`}
                  >
                    {title}
                  </span>
                </Tooltip>
              ) : (
                <span
                  className={`text-xs font-semibold uppercase tracking-wider ${collapsible ? 'text-text-secondary group-hover:text-text-primary' : 'text-text-secondary'}`}
                >
                  {title}
                </span>
              )}
            </div>

            {rightElement && <div onClick={handleRightElementClick}>{rightElement}</div>}
          </div>
        )}

        <AnimatePresence initial={false}>
          {(isOpen || !collapsible) && (
            <m.div
              initial={collapsible ? { height: 0, opacity: 0 } : undefined}
              animate={collapsible ? { height: 'auto', opacity: 1 } : undefined}
              exit={collapsible ? { height: 0, opacity: 0 } : undefined}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div
                className={`${isCard ? 'p-3' : 'pt-2'} space-y-3 ms-1 ps-2 border-s border-[var(--border-subtle)]`}
              >
                {children}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    )
  }
)

ControlGroup.displayName = 'ControlGroup'
