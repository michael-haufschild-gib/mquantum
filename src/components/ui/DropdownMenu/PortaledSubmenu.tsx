import { m } from 'motion/react'
import React, { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { MenuItems } from './MenuItems'
import { SubmenuPortalContext } from './SubmenuPortalContext'
import type { DropdownMenuItem } from './types'

/**
 * Portaled submenu that positions itself relative to a trigger rect.
 * Submenus are kept as portals to avoid the popover="auto" mutual exclusivity
 * that would close the parent menu when opening a submenu.
 */
export const PortaledSubmenu: React.FC<{
  items: DropdownMenuItem[]
  triggerRect: DOMRect
  onClose: () => void
  depth: number
  autoFocusFirst?: boolean
  onRequestClose?: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}> = React.memo(
  ({
    items,
    triggerRect,
    onClose,
    depth,
    autoFocusFirst = false,
    onRequestClose = onClose,
    onMouseEnter,
    onMouseLeave,
  }) => {
    const menuRef = useRef<HTMLDivElement>(null)
    const [coords, setCoords] = useState({ top: 0, left: 0 })
    const [ready, setReady] = useState(false)

    // Use the portal container from context (popover element) if available,
    // otherwise fall back to document.body. This ensures submenus stay in the
    // same stacking context as the parent menu when using native popover API.
    const portalContainerRef = useContext(SubmenuPortalContext)
    const [portalTarget, setPortalTarget] = useState<HTMLElement>(() => document.body)

    useLayoutEffect(() => {
      const syncPortalTargetTimer = window.setTimeout(() => {
        setPortalTarget(portalContainerRef?.current ?? document.body)
      }, 0)
      return () => clearTimeout(syncPortalTargetTimer)
    }, [portalContainerRef])

    useLayoutEffect(() => {
      if (menuRef.current) {
        const menuRect = menuRef.current.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight

        // Try to position to the right of the trigger
        let left = triggerRect.right + 2
        let top = triggerRect.top

        // If overflows right, try left side
        if (left + menuRect.width > viewportWidth - 8) {
          left = triggerRect.left - menuRect.width - 2
        }

        // If still overflows (very narrow screen), position below
        if (left < 8) {
          left = Math.max(8, triggerRect.left)
          top = triggerRect.bottom + 2
        }

        // Clamp vertical position
        if (top + menuRect.height > viewportHeight - 8) {
          top = Math.max(8, viewportHeight - menuRect.height - 8)
        }

        const positionSyncTimer = window.setTimeout(() => {
          setCoords({ top, left })
          setReady(true)
        }, 0)
        return () => clearTimeout(positionSyncTimer)
      }
      return undefined
    }, [triggerRect])

    useEffect(() => {
      if (!autoFocusFirst || !ready) return
      const focusTimer = requestAnimationFrame(() => {
        menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus()
      })
      return () => cancelAnimationFrame(focusTimer)
    }, [autoFocusFirst, ready])

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        const menu = menuRef.current
        if (!menu) return

        const menuItems = Array.from(
          menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')
        )
        if (menuItems.length === 0) return

        const currentIndex = menuItems.indexOf(document.activeElement as HTMLElement)

        switch (event.key) {
          case 'ArrowDown': {
            event.preventDefault()
            const next = currentIndex < menuItems.length - 1 ? currentIndex + 1 : 0
            menuItems[next]?.focus()
            break
          }
          case 'ArrowUp': {
            event.preventDefault()
            const prev = currentIndex > 0 ? currentIndex - 1 : menuItems.length - 1
            menuItems[prev]?.focus()
            break
          }
          case 'Home': {
            event.preventDefault()
            menuItems[0]?.focus()
            break
          }
          case 'End': {
            event.preventDefault()
            menuItems[menuItems.length - 1]?.focus()
            break
          }
          case 'ArrowLeft': {
            event.preventDefault()
            onRequestClose()
            break
          }
          case 'Escape': {
            event.preventDefault()
            onClose()
            break
          }
        }
      },
      [onClose, onRequestClose]
    )

    const submenuContent = (
      <m.div
        ref={menuRef}
        role="menu"
        data-dropdown-content="true"
        data-testid="portaled-submenu"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: ready ? 1 : 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.12 }}
        className="glass-panel min-w-[180px] max-w-[280px] rounded-lg py-1 shadow-xl border border-border-default"
        style={{
          position: 'fixed',
          top: coords.top,
          left: coords.left,
          zIndex: 200 + depth * 10,
          maxHeight: '60vh',
          overflowY: 'auto',
          backdropFilter: 'blur(16px)',
          visibility: ready ? 'visible' : 'hidden',
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onKeyDown={handleKeyDown}
      >
        <MenuItems items={items} onClose={onClose} depth={depth + 1} />
      </m.div>
    )

    return createPortal(submenuContent, portalTarget)
  }
)

PortaledSubmenu.displayName = 'PortaledSubmenu'
