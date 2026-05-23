/**
 * AnimationDrawerContainer Component
 *
 * Shared wrapper providing consistent drawer styling and animation for
 * all animation drawer panels in the TimelineControls.
 *
 * Features:
 * - Consistent motion animations (fade + slide)
 * - Backdrop blur and panel styling
 * - Auto-sizing: single column when few sections, two columns when 3+
 * - Right-aligned to sit above the drawer toggle buttons
 * - Max height with overflow scrolling
 * - Optional close button in top-right corner
 *
 * @example
 * ```tsx
 * <AnimationDrawerContainer
 *   onClose={() => setShowDrawer(false)}
 *   data-testid="julia-animation-drawer"
 * >
 *   <DrawerSection ... />
 *   <DrawerSection ... />
 * </AnimationDrawerContainer>
 * ```
 */

import { m } from 'motion/react'
import React from 'react'

import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'

/**
 * Props for the AnimationDrawerContainer component.
 */
export interface AnimationDrawerContainerProps {
  /** Child content to render inside the drawer */
  children: React.ReactNode
  /** Optional callback to close the drawer */
  onClose?: () => void
  /** When true, drawer spans the full parent width instead of auto-sizing to content */
  fullWidth?: boolean
  /** Optional test ID for testing */
  'data-testid'?: string
}

/**
 * Shared container for animation drawer panels.
 *
 * Provides consistent styling, motion animations, and layout for
 * all object-type-specific animation drawers. Uses CSS grid with
 * `:has()` to automatically switch between one and two columns
 * based on the number of child sections.
 *
 * @param props - Component props
 * @returns Animated drawer container element
 */
export const AnimationDrawerContainer: React.FC<AnimationDrawerContainerProps> = React.memo(
  ({ children, onClose, fullWidth, 'data-testid': dataTestId }) => (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
      className={`absolute bottom-full mb-2 z-20 ${fullWidth ? 'inset-x-0' : 'end-0'}`}
      data-testid={dataTestId}
    >
      {onClose && (
        <div className="absolute top-0 end-3 -translate-y-1/2 z-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            ariaLabel="Close drawer"
            tooltip="Close this timeline drawer"
            className="w-6 h-6 p-0 rounded-full surface-panel flex items-center justify-center text-text-tertiary hover:text-text-primary"
          >
            <Icon name="chevron-down" size={12} />
          </Button>
        </div>
      )}
      <div
        className={`surface-panel rounded-xl max-h-[400px] overflow-y-auto ${fullWidth ? '' : 'min-w-80 max-w-[calc(100vw-2rem)]'}`}
      >
        <div className="p-4 grid grid-cols-1 gap-6 md:[&:has(>:nth-child(3))]:grid-cols-2">
          {children}
        </div>
      </div>
    </m.div>
  )
)

AnimationDrawerContainer.displayName = 'AnimationDrawerContainer'
