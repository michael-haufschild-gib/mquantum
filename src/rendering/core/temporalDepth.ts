/**
 * Temporal Depth Module
 *
 * Barrel file exporting all temporal depth related functionality.
 * The pass is self-contained and manages its own state.
 *
 * @module rendering/core/temporalDepth
 */

// Re-export from the pass for backwards compatibility
export {
  invalidateAllTemporalDepth,
  type TemporalDepthUniforms,
} from '@/rendering/graph/passes/TemporalDepthCapturePass'

// New hook for accessing temporal uniforms from render graph
export { useTemporalDepthUniforms, getTemporalDepthUniforms } from './useTemporalDepthUniforms'
