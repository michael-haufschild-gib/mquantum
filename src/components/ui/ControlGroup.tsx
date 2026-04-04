import { AnimatePresence, m } from 'motion/react'
import React, { useCallback, useState } from 'react'

import { Tooltip } from '@/components/ui/Tooltip'
import { soundManager } from '@/lib/audio/SoundManager'

/** Props for the collapsible control group container. */
export interface ControlGroupProps {
  title: string
  children?: React.ReactNode
  defaultOpen?: boolean
  collapsible?: boolean
  className?: string
  rightElement?: React.ReactNode
  variant?: 'default' | 'card'
  /** Tooltip text shown on hover over the title */
  tooltip?: string
  /** Stable test ID for the collapsible header button. Required when collapsible. */
  'data-testid'?: string
}

const CARD_CONTAINER_CLASS =
  'border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-hover)] overflow-hidden'
const DEFAULT_CONTAINER_CLASS = 'border-b border-[var(--border-subtle)] pb-2 last:border-0'

const COLLAPSIBLE_HEADER_CLASS =
  'cursor-pointer hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-1 focus:ring-accent/50 focus:ring-inset'
const CARD_HEADER_CLASS = 'px-3 bg-[var(--bg-active)] border-b border-[var(--border-subtle)]'

function getTitleTextClass(collapsible: boolean): string {
  const base = 'text-xs font-semibold uppercase tracking-wider'
  return collapsible
    ? `${base} text-text-secondary group-hover:text-text-primary`
    : `${base} text-text-secondary`
}

function TitleLabel({
  title,
  tooltip,
  collapsible,
}: {
  title: string
  tooltip?: string
  collapsible: boolean
}) {
  const textClass = getTitleTextClass(collapsible)
  const label = <span className={textClass}>{title}</span>
  if (!tooltip) return label
  return (
    <Tooltip content={tooltip} position="top">
      {label}
    </Tooltip>
  )
}

function ChevronIcon() {
  return (
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
  )
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
    'data-testid': testId,
  }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen)

    const toggle = useCallback(() => {
      if (!collapsible) return
      setIsOpen((prev) => !prev)
      soundManager.playClick()
    }, [collapsible])

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (!collapsible) return
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        setIsOpen((prev) => !prev)
        soundManager.playClick()
      },
      [collapsible]
    )

    const handleMouseEnter = useCallback(() => {
      if (collapsible) soundManager.playHover()
    }, [collapsible])

    const handleRightElementClick = (e: React.MouseEvent) => {
      e.stopPropagation()
    }

    const isCard = variant === 'card'
    const showTitleSection = collapsible || title.trim() !== ''
    const containerClass = isCard ? CARD_CONTAINER_CLASS : DEFAULT_CONTAINER_CLASS
    const headerClass = `flex items-center justify-between py-1.5 ${isCard ? CARD_HEADER_CLASS : ''} ${collapsible ? COLLAPSIBLE_HEADER_CLASS : ''}`
    const headerA11y = collapsible
      ? {
          role: 'button' as const,
          tabIndex: 0,
          'aria-expanded': isOpen,
          'aria-label': `${title} section, ${isOpen ? 'expanded' : 'collapsed'}`,
          'data-testid': `${testId}-header`,
        }
      : {}

    return (
      <div className={`${containerClass} ${className}`} data-testid={testId}>
        {showTitleSection && (
          <div
            {...headerA11y}
            className={headerClass}
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
                  <ChevronIcon />
                </m.div>
              )}
              <TitleLabel title={title} tooltip={tooltip} collapsible={collapsible} />
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
