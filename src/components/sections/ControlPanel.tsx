/**
 * ControlPanel Component
 *
 * Collapsible sidebar panel for controls.
 * Supports two layout modes:
 * - overlay: Fixed position floating over canvas (mobile/tablet)
 * - side-by-side: Inline flex item next to canvas (desktop)
 */

import { Button } from '@/components/ui/Button'
import type { LayoutMode } from '@/stores/layoutStore'
import { useLayoutStore } from '@/stores/layoutStore'
import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ResizeHandle } from '@/components/layout/ResizeHandle'

/**
 *
 */
export interface ControlPanelProps {
  children: React.ReactNode
  title?: string
  className?: string
  /** Layout mode determines positioning behavior */
  layoutMode?: LayoutMode
}

/**
 * ControlPanel - Collapsible sidebar container.
 *
 * In overlay mode: Fixed position on right side, floats over content.
 * In side-by-side mode: Flex item with resizable width.
 *
 * @param props - Component props
 * @param props.children - Panel content
 * @param props.title - Panel title text
 * @param props.className - Additional CSS classes
 * @param props.layoutMode - Layout mode ('overlay' | 'side-by-side')
 * @returns React component
 */
export const ControlPanel: React.FC<ControlPanelProps> = React.memo(
  ({ children, title = 'CONTROLS', className = '', layoutMode = 'overlay' }) => {
    const { isCollapsed, toggleCollapsed, sidebarWidth } = useLayoutStore(
      useShallow((state) => ({
        isCollapsed: state.isCollapsed,
        toggleCollapsed: state.toggleCollapsed,
        sidebarWidth: state.sidebarWidth,
      }))
    )

    const isSideBySide = layoutMode === 'side-by-side'
    const isSideBySideCollapsed = isSideBySide && isCollapsed

    // Styles vary based on layout mode and collapsed state
    // When side-by-side AND collapsed, the parent handles positioning, so use simpler styles
    const asideStyles = useMemo(() => {
      if (isSideBySideCollapsed) {
        return 'relative pointer-events-auto' // Collapsed in side-by-side: parent handles positioning
      }
      if (isSideBySide) {
        return 'relative flex flex-col h-full pointer-events-auto' // Expanded in side-by-side: flex item
      }
      return 'fixed right-4 top-4 bottom-4 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] z-50 flex flex-col items-end pointer-events-none' // Overlay mode
    }, [isSideBySide, isSideBySideCollapsed])

    const containerStyles = useMemo(() => {
      if (isSideBySideCollapsed) {
        return 'pointer-events-auto glass-panel rounded-full flex flex-col overflow-hidden transition-all duration-300' // Collapsed: circular button
      }
      if (isSideBySide) {
        return 'glass-panel rounded-2xl flex flex-col overflow-hidden h-full transition-all duration-300' // Expanded side-by-side
      }
      return 'pointer-events-auto glass-panel rounded-2xl flex flex-col overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]' // Overlay mode
    }, [isSideBySide, isSideBySideCollapsed])

    // Width handling
    const containerWidth = useMemo(() => {
      if (isCollapsed) {
        return 'w-14 h-14' // Collapsed: small circular button
      }
      if (isSideBySide) {
        return '' // Width set via inline style
      }
      return 'w-80 h-full'
    }, [isCollapsed, isSideBySide])

    const inlineWidth = useMemo(
      () => (isSideBySide && !isCollapsed ? { width: `${sidebarWidth}px` } : undefined),
      [isSideBySide, isCollapsed, sidebarWidth]
    )

    const asideStyle = useMemo(
      () => (isSideBySide && !isCollapsed ? { width: `${sidebarWidth}px` } : undefined),
      [isSideBySide, isCollapsed, sidebarWidth]
    )

    return (
      <aside
        className={`${asideStyles} ${className}`}
        aria-label="Control Panel"
        style={asideStyle}
      >
        {/* Resize handle - only in side-by-side mode when expanded */}
        {isSideBySide && !isCollapsed && <ResizeHandle />}

        {/* Floating Glass Card Container */}
        <div
          className={`${containerStyles} ${containerWidth}`}
          style={inlineWidth}
          data-testid="control-panel-container"
        >
          {/* Header */}
          <div className="flex-none h-14 flex items-center justify-between px-4 border-b border-border/10 bg-glass/20">
            {!isCollapsed && (
              <h2 className="text-xs font-bold tracking-[0.2em] text-accent text-glow select-none">
                {title}
              </h2>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapsed}
              className={isCollapsed ? 'w-full h-full rounded-full' : ''}
              ariaLabel={isCollapsed ? 'Expand control panel' : 'Collapse control panel'}
              aria-expanded={!isCollapsed}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform duration-500 ${isCollapsed ? 'rotate-180' : 'rotate-0'}`}
              >
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </Button>
          </div>

          {/* Content Area */}
          <div
            className={`flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 transition-opacity duration-300 ${isCollapsed ? 'opacity-0 pointer-events-none invisible' : 'opacity-100 visible'}`}
            data-testid="control-panel-content"
          >
            {children}
          </div>
        </div>
      </aside>
    )
  }
)

ControlPanel.displayName = 'ControlPanel'
