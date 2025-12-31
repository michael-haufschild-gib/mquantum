/**
 * JuliaAnimationDrawer Component
 *
 * Animation controls for Quaternion Julia fractal, displayed in the
 * TimelineControls bottom drawer.
 *
 * Currently empty - animations will be added in future updates.
 *
 * @see docs/prd/quaternion-julia-fractal.md
 */

import React from 'react';
import { AnimationDrawerContainer } from './AnimationDrawerContainer';

export interface JuliaAnimationDrawerProps {
  /** Callback to close the drawer */
  onClose?: () => void;
}

/**
 * JuliaAnimationDrawer component
 *
 * Renders animation controls for Quaternion Julia fractals within
 * the timeline drawer. Currently empty placeholder for future animations.
 *
 * @returns React component
 */
export const JuliaAnimationDrawer: React.FC<JuliaAnimationDrawerProps> = React.memo(({ onClose }) => {
  return (
    <AnimationDrawerContainer onClose={onClose} data-testid="julia-animation-drawer">
      <div className="text-xs text-text-secondary text-center py-4">
        No animations configured
      </div>
    </AnimationDrawerContainer>
  );
});

JuliaAnimationDrawer.displayName = 'JuliaAnimationDrawer';

export default JuliaAnimationDrawer;
