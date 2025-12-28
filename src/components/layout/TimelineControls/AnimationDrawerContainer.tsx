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
 *
 * @example
 * ```tsx
 * <AnimationDrawerContainer data-testid="julia-animation-drawer">
 *   <AnimationSystemPanel ... />
 *   <AnimationSystemPanel ... />
 * </AnimationDrawerContainer>
 * ```
 */

import { m } from 'motion/react';
import React from 'react';

/**
 * Props for the AnimationDrawerContainer component.
 */
export interface AnimationDrawerContainerProps {
  /** Child content to render inside the drawer */
  children: React.ReactNode;
  /** Optional test ID for testing */
  'data-testid'?: string;
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
export const AnimationDrawerContainer: React.FC<AnimationDrawerContainerProps> = React.memo(({
  children,
  'data-testid': dataTestId,
}) => (
  <m.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 20 }}
    transition={{ duration: 0.2 }}
    className="absolute bottom-full left-0 right-0 mb-2 glass-panel rounded-xl z-20 max-h-[400px] overflow-y-auto"
    data-testid={dataTestId}
  >
    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
      {children}
    </div>
  </m.div>
));

AnimationDrawerContainer.displayName = 'AnimationDrawerContainer';

export default AnimationDrawerContainer;
