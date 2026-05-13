import { AnimatePresence, m } from 'motion/react'
import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/ui/Button'
import { soundManager } from '@/lib/audio/SoundManager'
import { getModifierSymbols } from '@/lib/platform'
import { supportsPopover } from '@/lib/popoverSupport'
import { useCameraStore } from '@/stores/scene/cameraStore'
import { useDropdownStore } from '@/stores/ui/dropdownStore'
import { type LayoutStore, useLayoutStore } from '@/stores/ui/layoutStore'

interface MenuItem {
  label: string
  shortcut?: string
  action?: () => void
  type?: 'separator'
}

interface CanvasContextMenuContentProps {
  dropdownId: string
  position: {
    x: number
    y: number
  }
}

const handleItemHover = () => {
  soundManager.playHover()
}

export const CanvasContextMenuContent: React.FC<CanvasContextMenuContentProps> = React.memo(
  ({ dropdownId, position }) => {
    const popoverRef = useRef<HTMLDivElement>(null)
    const closeDropdown = useDropdownStore((state) => state.closeDropdown)

    const layoutSelector = useShallow((state: LayoutStore) => ({
      toggleCinematicMode: state.toggleCinematicMode,
      toggleCollapsed: state.toggleCollapsed,
      toggleLeftPanel: state.toggleLeftPanel,
    }))
    const { toggleCinematicMode, toggleCollapsed, toggleLeftPanel } = useLayoutStore(layoutSelector)
    const resetCamera = useCameraStore((state) => state.reset)

    // Sync popover visibility with store state.
    // Guarded: Popover API requires Safari 17+, Chrome 114+, Firefox 125+.
    useEffect(() => {
      if (!supportsPopover) return
      const popover = popoverRef.current
      if (!popover || popover.matches(':popover-open')) return

      popover.showPopover()
      return () => {
        if (popover.matches(':popover-open')) popover.hidePopover()
      }
    }, [])

    // Manual light-dismiss: close on click outside or Escape key.
    // We use popover="manual" because contextmenu events (right-click) don't
    // interact well with popover="auto" light-dismiss timing.
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        const popover = popoverRef.current
        if (popover && !popover.contains(e.target as Node)) {
          closeDropdown(dropdownId)
        }
      }

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          closeDropdown(dropdownId)
        }
      }

      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside)
      }, 0)
      document.addEventListener('keydown', handleEscape)

      return () => {
        clearTimeout(timeoutId)
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('keydown', handleEscape)
      }
    }, [dropdownId, closeDropdown])

    const items: MenuItem[] = useMemo(() => {
      const mod = getModifierSymbols()
      return [
        { label: 'Reset Camera', shortcut: 'R', action: resetCamera },
        { label: 'Toggle Cinematic Mode', shortcut: 'C', action: toggleCinematicMode },
        { type: 'separator', label: '' },
        { label: 'Toggle Left Panel', shortcut: `${mod.shift}+\\`, action: toggleLeftPanel },
        { label: 'Toggle Right Panel', shortcut: '\\', action: toggleCollapsed },
      ]
    }, [resetCamera, toggleCinematicMode, toggleLeftPanel, toggleCollapsed])

    const handleItemClick = useCallback(
      (action?: () => void) => {
        soundManager.playClick()
        if (action) action()
        closeDropdown(dropdownId)
      },
      [dropdownId, closeDropdown]
    )

    return (
      <div
        ref={popoverRef}
        {...(supportsPopover ? { popover: 'manual' } : {})}
        id={dropdownId}
        data-testid="canvas-context-menu"
        className="fixed z-50 m-0 p-0 border-none bg-transparent"
        style={{ top: position.y, left: position.x }}
      >
        <AnimatePresence>
          <m.div
            initial={{ opacity: 0, scale: 0.9, x: -10, y: -10 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="min-w-[180px] glass-panel rounded-lg shadow-xl overflow-hidden py-1"
          >
            {items.map((item, index) => {
              if (item.type === 'separator') {
                return (
                  <div
                    key={index}
                    role="separator"
                    className="h-[1px] bg-[var(--border-subtle)] my-1 mx-2"
                  />
                )
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
                    <span className="text-xs font-mono text-text-tertiary group-hover:text-text-secondary">
                      {item.shortcut}
                    </span>
                  )}
                </Button>
              )
            })}
          </m.div>
        </AnimatePresence>
      </div>
    )
  }
)

CanvasContextMenuContent.displayName = 'CanvasContextMenuContent'
