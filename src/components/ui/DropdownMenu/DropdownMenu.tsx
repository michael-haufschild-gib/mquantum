import { AnimatePresence, m } from 'motion/react'
import React, {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Z_INDEX } from '@/constants/zIndex'
import { soundManager } from '@/lib/audio/SoundManager'
import { hidePopoverSafely, showPopoverSafely, supportsPopover } from '@/lib/popoverSupport'
import { useDropdownStore } from '@/stores/ui/dropdownStore'

import { MenuItems } from './MenuItems'
import { MENU_ITEM_SELECTOR } from './menuItemSelector'
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
    const nativePopoverOpenRef = useRef(false)
    const [coords, setCoords] = useState({ top: 0, left: 0 })
    const offset = 4
    const originalTriggerOnClick =
      typeof trigger.props.onClick === 'function'
        ? (trigger.props.onClick as (event: React.MouseEvent) => void)
        : undefined
    const latestOnCloseRef = useRef(onClose)
    latestOnCloseRef.current = onClose

    // Track previous isOpen state to call onClose callback
    const prevIsOpenRef = useRef(isOpen)
    useEffect(() => {
      if (prevIsOpenRef.current && !isOpen && onClose) {
        onClose()
      }
      prevIsOpenRef.current = isOpen
    }, [isOpen, onClose])

    useEffect(() => {
      return () => {
        if (useDropdownStore.getState().openDropdownId !== dropdownId) return
        closeDropdown(dropdownId)
        latestOnCloseRef.current?.()
      }
    }, [closeDropdown, dropdownId])

    // Sync popover visibility with store state
    // Guarded: Popover API requires Safari 17+, Chrome 114+, Firefox 125+.
    // On older browsers, matches(':popover-open') throws SyntaxError.
    useEffect(() => {
      if (!supportsPopover) return
      const popover = popoverRef.current
      if (!popover) return

      if (isOpen) {
        showPopoverSafely(popover)
        nativePopoverOpenRef.current = true
      } else if (nativePopoverOpenRef.current) {
        hidePopoverSafely(popover)
        nativePopoverOpenRef.current = false
      }
    }, [isOpen])

    // Handle toggle event to sync store when popover closes via light-dismiss
    useEffect(() => {
      if (!supportsPopover) return
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

    // Fallback light-dismiss: click-outside and Escape when Popover API unavailable
    useEffect(() => {
      if (supportsPopover || !isOpen) return

      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Node
        if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return
        closeDropdown(dropdownId)
      }

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeDropdown(dropdownId)
      }

      window.addEventListener('pointerdown', handleClickOutside, true)
      window.addEventListener('keydown', handleEscape)
      return () => {
        window.removeEventListener('pointerdown', handleClickOutside, true)
        window.removeEventListener('keydown', handleEscape)
      }
    }, [isOpen, dropdownId, closeDropdown])

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
        originalTriggerOnClick?.(e)
        if (e.defaultPrevented) return

        if (!isOpen) {
          soundManager.playSwish()
        } else {
          soundManager.playClick()
        }
        toggleDropdown(dropdownId)
        e.stopPropagation()
      },
      [originalTriggerOnClick, isOpen, toggleDropdown, dropdownId]
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
        const firstItem = menuRef.current?.querySelector<HTMLElement>(MENU_ITEM_SELECTOR)
        firstItem?.focus()
      })
      return () => cancelAnimationFrame(timer)
    }, [isOpen])

    // Keyboard navigation for menu items
    const handleMenuKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        const menu = menuRef.current
        if (!menu) return

        const menuItems = Array.from(menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR))
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
          data-testid={`dropdown-trigger-${dropdownId}`}
          data-dropdown-trigger={dropdownId}
          className={`cursor-pointer ${className}`}
        >
          {cloneElement(trigger, {
            onClick: handleToggle,
            'aria-haspopup': 'menu' as const,
            'aria-expanded': isOpen,
          })}
        </div>

        <div
          ref={popoverRef}
          {...(supportsPopover ? { popover: 'auto' } : {})}
          id={dropdownId}
          data-dropdown-content="true"
          data-dropdown-id={dropdownId}
          data-testid={`dropdown-content-${dropdownId}`}
          className="m-0 p-0 border-none bg-transparent"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            zIndex: Z_INDEX.TOOLTIP,
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
