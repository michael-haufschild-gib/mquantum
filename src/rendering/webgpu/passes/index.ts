/**
 * WebGPU Render Passes
 *
 * Exports all render pass implementations for the WebGPU render graph.
 *
 * @module rendering/webgpu/passes
 */

// Post-processing passes
export { ToneMappingCinematicPass, ToneMappingMode } from './ToneMappingCinematicPass'
export type { ToneMappingCinematicPassConfig } from './ToneMappingCinematicPass'

export { BloomPass } from './BloomPass'
export type { BloomPassOptions } from './BloomPass'

export { FXAAPass } from './FXAAPass'
export type { FXAAPassOptions } from './FXAAPass'

export { SMAAPass } from './SMAAPass'
export type { SMAAPassOptions } from './SMAAPass'

export { EnvironmentCompositePass } from './EnvironmentCompositePass'
export type { EnvironmentCompositePassConfig } from './EnvironmentCompositePass'

export { NormalPass } from './NormalPass'
export type { NormalPassConfig } from './NormalPass'

export { DepthPass } from './DepthPass'
export type { DepthPassConfig, DepthFormat } from './DepthPass'

export { CopyPass } from './CopyPass'
export type { CopyPassConfig } from './CopyPass'

export { FrameBlendingPass } from './FrameBlendingPass'
export type { FrameBlendingPassConfig } from './FrameBlendingPass'

export { PaperTexturePass } from './PaperTexturePass'
export type { PaperTexturePassConfig } from './PaperTexturePass'

export { CompositePass } from './CompositePass'
export type { CompositePassConfig, CompositeInput, BlendMode } from './CompositePass'

export { ToScreenPass } from './ToScreenPass'
export type { ToScreenPassConfig } from './ToScreenPass'

export { BufferPreviewPass } from './BufferPreviewPass'
export type { BufferPreviewPassConfig, BufferPreviewStoreConfig, BufferType, DepthMode } from './BufferPreviewPass'

export { DebugOverlayPass } from './DebugOverlayPass'
export type { DebugOverlayPassConfig } from './DebugOverlayPass'

export { CubemapCapturePass } from './CubemapCapturePass'
export type { CubemapCapturePassConfig } from './CubemapCapturePass'

export { TemporalCloudDepthPass } from './TemporalCloudDepthPass'
export type { TemporalCloudDepthPassConfig } from './TemporalCloudDepthPass'

export { FullscreenPass } from './FullscreenPass'
export type {
  FullscreenPassConfig,
  FullscreenUniform,
  FullscreenUniformType,
} from './FullscreenPass'

export {
  TemporalDepthCapturePass,
  invalidateAllTemporalDepthWebGPU,
} from './TemporalDepthCapturePass'
export type {
  TemporalDepthCapturePassConfig,
  TemporalDepthUniforms,
} from './TemporalDepthCapturePass'

export { TemporalCloudPass } from './TemporalCloudPass'
export type { TemporalCloudPassConfig } from './TemporalCloudPass'

export { MainObjectMRTPass, createMRTPipelineConfig } from './MainObjectMRTPass'
export type {
  MainObjectMRTPassConfig,
  MRTAttachmentConfig,
  MRTPipelineConfig,
} from './MainObjectMRTPass'

// Compute passes
export { DensityGridComputePass } from './DensityGridComputePass'
export type { DensityGridComputeConfig } from './DensityGridComputePass'

// Scene passes
export { ScenePass } from './ScenePass'
export type { ScenePassConfig, SceneRenderStats } from './ScenePass'
