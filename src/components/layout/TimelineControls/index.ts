/**
 * TimelineControls Components
 *
 * Exports for timeline-related animation control components.
 */

export { AnimationSystemPanel } from './AnimationSystemPanel'
export type { AnimationSystemPanelProps } from './AnimationSystemPanel'

export { AnimationDrawerContainer } from './AnimationDrawerContainer'
export type { AnimationDrawerContainerProps } from './AnimationDrawerContainer'

// NOTE: JuliaAnimationDrawer removed - Julia has no animations
// Smooth shape morphing is achieved via 4D+ rotation
export { MandelbulbAnimationDrawer } from './MandelbulbAnimationDrawer'
export { SchroedingerAnimationDrawer } from './SchroedingerAnimationDrawer'
export { BlackHoleAnimationDrawer } from './BlackHoleAnimationDrawer'
export { FractalAnimationDrawer } from './FractalAnimationDrawer'
