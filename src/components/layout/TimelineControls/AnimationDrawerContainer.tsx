/**
 * AnimationDrawerContainer Component
 *
 * Shared wrapper providing consistent drawer styling and animation for
 * all animation drawer panels in the TimelineControls.
 *
 * Features:
 * - Consistent motion animations (fade + slide)
 * - Backdrop blur and panel styling
 * - Responsive grid layout for content
 * - Max height with overflow scrolling
 * - Optional close button in top-right corner
 *
 * @example
 * ```tsx
 * <AnimationDrawerContainer
 *   onClose={() => setShowDrawer(false)}
 *   data-testid="julia-animation-drawer"
 * >
 *   <AnimationSystemPanel ... />
 *   <AnimationSystemPanel ... />
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
  /** Optional test ID for testing */
  'data-testid'?: string
}

/**
 * Shared container for animation drawer panels.
 *
 * Provides consistent styling, motion animations, and layout for
 * all object-type-specific animation drawers.
 *
 * @param props - Component props
 * @returns Animated drawer container element
 */
export const AnimationDrawerContainer: React.FC<AnimationDrawerContainerProps> = React.memo(
  ({ children, onClose, 'data-testid': dataTestId }) => (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
      className="absolute bottom-full left-0 right-0 mb-2 z-20"
      data-testid={dataTestId}
    >
      {onClose && (
        <div className="absolute top-0 right-3 -translate-y-1/2 z-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            ariaLabel="Close drawer"
            className="w-6 h-6 p-0 rounded-full glass-panel flex items-center justify-center text-text-tertiary hover:text-text-primary"
          >
            <Icon name="chevron-down" size={12} />
          </Button>
        </div>
      )}
      <div className="glass-panel rounded-xl max-h-[400px] overflow-y-auto">
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">{children}</div>
      </div>
    </m.div>
  )
)

AnimationDrawerContainer.displayName = 'AnimationDrawerContainer'

export default AnimationDrawerContainer
