import { AnimatePresence } from 'motion/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { soundManager } from '@/lib/audio/SoundManager'

import { MenuItemButton } from './MenuItemButton'
import { PortaledSubmenu } from './PortaledSubmenu'
import type { DropdownMenuItem } from './types'

/**
 * Renders a list of menu items with submenu support, hover timing,
 * and click/keyboard interaction.
 */
export const MenuItems: React.FC<{
  items: DropdownMenuItem[]
  onClose: () => void
  depth?: number
}> = React.memo(({ items, onClose, depth = 0 }) => {
  const [activeSubmenuIndex, setActiveSubmenuIndex] = useState<number | null>(null)
  const [submenuTriggerRect, setSubmenuTriggerRect] = useState<DOMRect | null>(null)
  const [submenuAutoFocusFirst, setSubmenuAutoFocusFirst] = useState(false)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    clearCloseTimeout()
    closeTimeoutRef.current = setTimeout(() => {
      setActiveSubmenuIndex(null)
      setSubmenuTriggerRect(null)
      setSubmenuAutoFocusFirst(false)
    }, 100)
  }, [clearCloseTimeout])

  const openSubmenu = useCallback(
    (index: number, autoFocusFirst = false) => {
      clearCloseTimeout()
      const button = itemRefs.current[index]
      if (button) {
        setSubmenuTriggerRect(button.getBoundingClientRect())
        setActiveSubmenuIndex(index)
        setSubmenuAutoFocusFirst(autoFocusFirst)
      }
    },
    [clearCloseTimeout]
  )

  const closeSubmenuAndRefocus = useCallback(
    (index: number) => {
      clearCloseTimeout()
      setActiveSubmenuIndex(null)
      setSubmenuTriggerRect(null)
      setSubmenuAutoFocusFirst(false)
      requestAnimationFrame(() => itemRefs.current[index]?.focus())
    },
    [clearCloseTimeout]
  )

  useEffect(() => {
    return () => clearCloseTimeout()
  }, [clearCloseTimeout])

  useEffect(() => {
    clearCloseTimeout()
    setActiveSubmenuIndex(null)
    setSubmenuTriggerRect(null)
    setSubmenuAutoFocusFirst(false)
  }, [items, clearCloseTimeout])

  const getItemRef = useCallback(
    (index: number) => (el: HTMLButtonElement | null) => {
      itemRefs.current[index] = el
    },
    []
  )

  return (
    <>
      {items.map((item, index) => {
        // Separator
        if (item.label === '---') {
          return (
            <div
              key={index}
              role="separator"
              className="h-px bg-[var(--border-subtle)] my-1.5 mx-2"
            />
          )
        }

        // Header (non-clickable, no children)
        if (!item.onClick && !item.items && !item.disabled) {
          return (
            <div
              key={index}
              className="px-3 py-1.5 text-xs font-bold text-accent uppercase tracking-wider opacity-70"
            >
              {item.label}
            </div>
          )
        }

        const hasSubmenu = Array.isArray(item.items) && item.items.length > 0
        const isSubmenuOpen = activeSubmenuIndex === index

        const handleClick = () => {
          if (item.disabled) return
          if (hasSubmenu) {
            if (isSubmenuOpen) {
              setActiveSubmenuIndex(null)
              setSubmenuTriggerRect(null)
              setSubmenuAutoFocusFirst(false)
            } else {
              openSubmenu(index)
            }
          } else if (!item.disabled && item.onClick) {
            soundManager.playClick()
            item.onClick()
            onClose()
          }
        }

        const handleMouseEnter = () => {
          if (item.disabled) {
            scheduleClose()
            return
          }
          soundManager.playHover()
          if (hasSubmenu) {
            openSubmenu(index)
          } else {
            // Close any open submenu when hovering a non-submenu item
            scheduleClose()
          }
        }

        const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
          if (item.disabled || !hasSubmenu) return
          if (event.key !== 'ArrowRight' && event.key !== 'Enter' && event.key !== ' ') return

          event.preventDefault()
          event.stopPropagation()
          openSubmenu(index, true)
        }

        return (
          <React.Fragment key={index}>
            <MenuItemButton
              item={item}
              hasSubmenu={hasSubmenu}
              isSubmenuOpen={isSubmenuOpen}
              onItemClick={handleClick}
              onMouseEnter={handleMouseEnter}
              onKeyDown={handleKeyDown}
              itemRef={getItemRef(index)}
            />

            {/* Portaled Submenu */}
            <AnimatePresence>
              {hasSubmenu && isSubmenuOpen && submenuTriggerRect && (
                <PortaledSubmenu
                  triggerRect={submenuTriggerRect}
                  onClose={onClose}
                  depth={depth}
                  autoFocusFirst={submenuAutoFocusFirst}
                  onRequestClose={() => closeSubmenuAndRefocus(index)}
                  onMouseEnter={clearCloseTimeout}
                  onMouseLeave={scheduleClose}
                >
                  <MenuItems items={item.items!} onClose={onClose} depth={depth + 1} />
                </PortaledSubmenu>
              )}
            </AnimatePresence>
          </React.Fragment>
        )
      })}
    </>
  )
})

MenuItems.displayName = 'MenuItems'
