import { AnimatePresence, m } from 'motion/react'
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { soundManager } from '@/lib/audio/SoundManager'
import { useDropdownStore } from '@/stores/dropdownStore'

import { MenuItems } from './MenuItems'
import { SubmenuPortalContext } from './SubmenuPortalContext'
import type { DropdownMenuProps } from './types'

const menuVariants = {
  closed: { opacity: 0, y: -8, scale: 0.95, transition: { duration: 0.1 } },
  open: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, damping: 25, stiffness: 400, mass: 0.5 },
  },
}

/**
 * A dropdown menu component with global state coordination.
 * Uses the native HTML popover API for light-dismiss behavior.
 * Only one dropdown can be open at a time across the entire app.
 * Supports submenus, keyboard navigation, and click-outside closing.
 */
export const DropdownMenu: React.FC<DropdownMenuProps> = React.memo(
  ({ trigger, items, className = '', align = 'left', maxHeight, onClose, id: providedId }) => {
    // Auto-generate ID if not provided
    const autoId = useId()
    const dropdownId = providedId || `dropdown-${autoId}`
    const popoverRef = useRef<HTMLDivElement>(null)

    // Subscribe to store - only re-render when THIS dropdown's open state changes
    const { isOpen, toggleDropdown, closeDropdown, openDropdown } = useDropdownStore(
      useShallow((state) => ({
        isOpen: state.openDropdownId === dropdownId,
        toggleDropdown: state.toggleDropdown,
        closeDropdown: state.closeDropdown,
        openDropdown: state.openDropdown,
      }))
    )

    const triggerRef = useRef<HTMLDivElement>(null)
    const [coords, setCoords] = useState({ top: 0, left: 0 })
    const offset = 4

    // Track previous isOpen state to call onClose callback
    const prevIsOpenRef = useRef(isOpen)
    useEffect(() => {
      if (prevIsOpenRef.current && !isOpen && onClose) {
        onClose()
      }
      prevIsOpenRef.current = isOpen
    }, [isOpen, onClose])

    // Sync popover visibility with store state
    useEffect(() => {
      const popover = popoverRef.current
      if (!popover) return

      if (isOpen && !popover.matches(':popover-open')) {
        popover.showPopover()
      } else if (!isOpen && popover.matches(':popover-open')) {
        popover.hidePopover()
      }
    }, [isOpen])

    // Handle toggle event to sync store when popover closes via light-dismiss
    useEffect(() => {
      const popover = popoverRef.current
      if (!popover) return

      const handleToggle = (e: Event) => {
        const toggleEvent = e as ToggleEvent
        if (toggleEvent.newState === 'closed') {
          closeDropdown(dropdownId)
        } else if (toggleEvent.newState === 'open') {
          openDropdown(dropdownId)
        }
      }

      popover.addEventListener('toggle', handleToggle)
      return () => popover.removeEventListener('toggle', handleToggle)
    }, [dropdownId, closeDropdown, openDropdown])

    useLayoutEffect(() => {
      if (!isOpen) return

      const updatePosition = () => {
        if (triggerRef.current && popoverRef.current) {
          const triggerRect = triggerRef.current.getBoundingClientRect()
          const contentRect = popoverRef.current.getBoundingClientRect()
          const viewportHeight = window.innerHeight
          const viewportWidth = window.innerWidth

          let top = triggerRect.bottom + offset
          const overflowsBottom = triggerRect.bottom + offset + contentRect.height > viewportHeight

          if (overflowsBottom) {
            const topSpace = triggerRect.top
            const bottomSpace = viewportHeight - triggerRect.bottom
            if (topSpace > bottomSpace) {
              top = triggerRect.top - contentRect.height - offset
              if (top < 8) top = 8
            }
          }

          let left = align === 'right' ? triggerRect.right - contentRect.width : triggerRect.left

          left = Math.max(8, Math.min(left, viewportWidth - contentRect.width - 8))
          setCoords({ top, left })
        }
      }

      // Throttle scroll/resize handlers with RAF to avoid layout thrashing
      let rafId: number | null = null

      const throttledUpdate = () => {
        if (rafId !== null) return
        rafId = requestAnimationFrame(() => {
          updatePosition()
          rafId = null
        })
      }

      requestAnimationFrame(() => updatePosition())
      window.addEventListener('resize', throttledUpdate)
      window.addEventListener('scroll', throttledUpdate, true)

      return () => {
        if (rafId !== null) cancelAnimationFrame(rafId)
        window.removeEventListener('resize', throttledUpdate)
        window.removeEventListener('scroll', throttledUpdate, true)
      }
    }, [isOpen, align, offset])

    const handleToggle = useCallback(
      (e: React.MouseEvent) => {
        if (!isOpen) {
          soundManager.playSwish()
        } else {
          soundManager.playClick()
        }
        toggleDropdown(dropdownId)
        e.stopPropagation()
      },
      [isOpen, toggleDropdown, dropdownId]
    )

    const closeMenu = useCallback(() => {
      closeDropdown(dropdownId)
    }, [closeDropdown, dropdownId])

    const handleContentClick = (e: React.MouseEvent) => {
      e.stopPropagation()
    }

    const menuRef = useRef<HTMLDivElement>(null)

    // Focus first menu item when dropdown opens
    useEffect(() => {
      if (!isOpen || !menuRef.current) return
      const timer = requestAnimationFrame(() => {
        const firstItem = menuRef.current?.querySelector<HTMLElement>(
          '[role="menuitem"]:not(:disabled)'
        )
        firstItem?.focus()
      })
      return () => cancelAnimationFrame(timer)
    }, [isOpen])

    // Keyboard navigation for menu items
    const handleMenuKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        const menu = menuRef.current
        if (!menu) return

        const menuItems = Array.from(
          menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')
        )
        const currentIndex = menuItems.indexOf(document.activeElement as HTMLElement)

        switch (e.key) {
          case 'ArrowDown': {
            e.preventDefault()
            const next = currentIndex < menuItems.length - 1 ? currentIndex + 1 : 0
            menuItems[next]?.focus()
            break
          }
          case 'ArrowUp': {
            e.preventDefault()
            const prev = currentIndex > 0 ? currentIndex - 1 : menuItems.length - 1
            menuItems[prev]?.focus()
            break
          }
          case 'Home': {
            e.preventDefault()
            menuItems[0]?.focus()
            break
          }
          case 'End': {
            e.preventDefault()
            menuItems[menuItems.length - 1]?.focus()
            break
          }
          case 'Escape': {
            e.preventDefault()
            closeMenu()
            triggerRef.current?.querySelector<HTMLElement>('button')?.focus()
            break
          }
        }
      },
      [closeMenu]
    )

    return (
      <>
        <div
          ref={triggerRef}
          data-dropdown-trigger={dropdownId}
          onClick={handleToggle}
          role="button"
          className={`cursor-pointer ${className}`}
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          {trigger}
        </div>

        <div
          ref={popoverRef}
          popover="auto"
          id={dropdownId}
          data-dropdown-content="true"
          data-dropdown-id={dropdownId}
          className="m-0 p-0 border-none bg-transparent"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
          }}
        >
          <SubmenuPortalContext.Provider value={popoverRef}>
            <AnimatePresence>
              {isOpen && (
                <m.div
                  ref={menuRef}
                  role="menu"
                  initial="closed"
                  animate="open"
                  exit="closed"
                  variants={menuVariants}
                  className="glass-panel min-w-[180px] rounded-lg py-1 shadow-xl border border-border-default"
                  style={{
                    maxHeight: maxHeight || '80vh',
                    overflowY: 'auto',
                    backdropFilter: 'blur(16px)',
                  }}
                  onClick={handleContentClick}
                  onKeyDown={handleMenuKeyDown}
                >
                  <MenuItems items={items} onClose={closeMenu} />
                </m.div>
              )}
            </AnimatePresence>
          </SubmenuPortalContext.Provider>
        </div>
      </>
    )
  }
)

DropdownMenu.displayName = 'DropdownMenu'
