import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { m, AnimatePresence } from 'motion/react'
import { useLayoutStore, type LayoutStore } from '@/stores/layoutStore'
import { useCameraStore } from '@/stores/cameraStore'
import { useDropdownStore } from '@/stores/dropdownStore'
import { useShallow } from 'zustand/react/shallow'
import { soundManager } from '@/lib/audio/SoundManager'
import { getModifierSymbols } from '@/lib/platform'
import { Button } from '@/components/ui/Button'

const DROPDOWN_ID = 'canvas-context-menu'

interface MenuItem {
  label: string
  shortcut?: string
  action?: () => void
  type?: 'separator'
}

export const CanvasContextMenu: React.FC = React.memo(() => {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  const { isOpen, openDropdown, closeDropdown } = useDropdownStore(
    useShallow((state) => ({
      isOpen: state.openDropdownId === DROPDOWN_ID,
      openDropdown: state.openDropdown,
      closeDropdown: state.closeDropdown,
    }))
  )

  const layoutSelector = useShallow((state: LayoutStore) => ({
    toggleCinematicMode: state.toggleCinematicMode,
    toggleCollapsed: state.toggleCollapsed,
    toggleLeftPanel: state.toggleLeftPanel,
  }))
  const { toggleCinematicMode, toggleCollapsed, toggleLeftPanel } = useLayoutStore(layoutSelector)
  const resetCamera = useCameraStore((state) => state.reset)

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

  // Handle right-click to open context menu
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const isCanvas =
        target.tagName === 'CANVAS' ||
        target.id === 'canvas-container' ||
        target.closest('#canvas-container')

      if (isCanvas) {
        e.preventDefault()
        setPosition({ x: e.clientX, y: e.clientY })
        soundManager.playSwish()
        openDropdown(DROPDOWN_ID)
      }
    }

    window.addEventListener('contextmenu', handleContextMenu)
    return () => window.removeEventListener('contextmenu', handleContextMenu)
  }, [openDropdown])

  // Manual light-dismiss: close on click outside or Escape key
  // We use popover="manual" because contextmenu events (right-click) don't
  // interact well with popover="auto" light-dismiss timing
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const popover = popoverRef.current
      if (popover && !popover.contains(e.target as Node)) {
        closeDropdown(DROPDOWN_ID)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDropdown(DROPDOWN_ID)
      }
    }

    // Delay adding click listener to avoid the opening click triggering close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    document.addEventListener('keydown', handleEscape)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, closeDropdown])

  const items: MenuItem[] = useMemo(() => {
    const m = getModifierSymbols()
    return [
      { label: 'Reset Camera', shortcut: 'R', action: resetCamera },
      { label: 'Toggle Cinematic Mode', shortcut: 'C', action: toggleCinematicMode },
      { type: 'separator', label: '' },
      { label: 'Toggle Left Panel', shortcut: `${m.shift}+\\`, action: toggleLeftPanel },
      { label: 'Toggle Right Panel', shortcut: '\\', action: toggleCollapsed },
    ]
  }, [resetCamera, toggleCinematicMode, toggleLeftPanel, toggleCollapsed])

  const handleItemClick = useCallback(
    (action?: () => void) => {
      soundManager.playClick()
      if (action) action()
      closeDropdown(DROPDOWN_ID)
    },
    [closeDropdown]
  )

  const handleItemHover = useCallback(() => {
    soundManager.playHover()
  }, [])

  return (
    <div
      ref={popoverRef}
      popover="manual"
      id={DROPDOWN_ID}
      className="fixed z-50 min-w-[180px] glass-panel rounded-lg shadow-xl overflow-hidden py-1 m-0 p-0 border-none bg-transparent"
      style={{ top: position.y, left: position.x }}
    >
      <AnimatePresence>
        {isOpen && (
          <m.div
            initial={{ opacity: 0, scale: 0.9, x: -10, y: -10 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="min-w-[180px] glass-panel rounded-lg shadow-xl overflow-hidden py-1"
          >
            {items.map((item, index) => {
              if (item.type === 'separator') {
                return <div key={index} className="h-[1px] bg-[var(--border-subtle)] my-1 mx-2" />
              }
              return (
                <Button
                  key={index}
                  onClick={() => handleItemClick(item.action)}
                  onMouseEnter={handleItemHover}
                  className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex justify-between items-center transition-colors group rounded-none border-none bg-transparent"
                  size="sm"
                  variant="ghost"
                >
                  <span>{item.label}</span>
                  {item.shortcut && (
                    <span className="text-[9px] font-mono text-text-tertiary group-hover:text-text-secondary">
                      {item.shortcut}
                    </span>
                  )}
                </Button>
              )
            })}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
})

CanvasContextMenu.displayName = 'CanvasContextMenu'
