/**
 * WebGPU Render Passes
 *
 * Exports all render pass implementations for the WebGPU render graph.
 *
 * @module rendering/webgpu/passes
 */

// Post-processing passes
export type { BloomPassOptions } from './BloomPass'
export { BloomPass } from './BloomPass'
export type {
  BufferPreviewPassConfig,
  BufferPreviewStoreConfig,
  BufferType,
  DepthMode,
} from './BufferPreviewPass'
export { BufferPreviewPass } from './BufferPreviewPass'
export type { BlendMode, CompositeInput, CompositePassConfig } from './CompositePass'
export { CompositePass } from './CompositePass'
export type { CopyPassConfig } from './CopyPass'
export { CopyPass } from './CopyPass'
export type { CubemapCapturePassConfig } from './CubemapCapturePass'
export { CubemapCapturePass } from './CubemapCapturePass'
export type { DebugOverlayPassConfig } from './DebugOverlayPass'
export { DebugOverlayPass } from './DebugOverlayPass'
export type { DepthFormat, DepthPassConfig } from './DepthPass'
export { DepthPass } from './DepthPass'
export type { EnvironmentCompositePassConfig } from './EnvironmentCompositePass'
export { EnvironmentCompositePass } from './EnvironmentCompositePass'
export type { FrameBlendingPassConfig } from './FrameBlendingPass'
export { FrameBlendingPass } from './FrameBlendingPass'
export type { FXAAPassOptions } from './FXAAPass'
export { FXAAPass } from './FXAAPass'
export type { LightGizmoPassConfig } from './LightGizmoPass'
export { LightGizmoPass } from './LightGizmoPass'
export type { PaperTexturePassConfig } from './PaperTexturePass'
export { PaperTexturePass } from './PaperTexturePass'
export type { SMAAPassOptions } from './SMAAPass'
export { SMAAPass } from './SMAAPass'
export type { TemporalCloudDepthPassConfig } from './TemporalCloudDepthPass'
export { TemporalCloudDepthPass } from './TemporalCloudDepthPass'
export type { TemporalCloudPassConfig } from './TemporalCloudPass'
export { TemporalCloudPass } from './TemporalCloudPass'
export type {
  TemporalDepthCapturePassConfig,
  TemporalDepthUniforms,
} from './TemporalDepthCapturePass'
export {
  invalidateAllTemporalDepthWebGPU,
  TemporalDepthCapturePass,
} from './TemporalDepthCapturePass'
export type { ToneMappingCinematicPassConfig } from './ToneMappingCinematicPass'
export { ToneMappingCinematicPass, ToneMappingMode } from './ToneMappingCinematicPass'
export type { ToScreenPassConfig } from './ToScreenPass'
export { ToScreenPass } from './ToScreenPass'

// Compute passes
export type { DensityGridComputeConfig } from './DensityGridComputePass'
export { DensityGridComputePass } from './DensityGridComputePass'

// Scene passes
export type { ScenePassConfig, SceneRenderStats } from './ScenePass'
export { ScenePass } from './ScenePass'
