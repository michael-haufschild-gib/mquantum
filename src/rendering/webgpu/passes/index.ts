/**
 * WebGPU Render Passes
 *
 * Exports all render pass implementations for the WebGPU render graph.
 *
 * @module rendering/webgpu/passes
 */

// Post-processing passes
export { TonemappingPass, TonemapMode } from './TonemappingPass'
export type { TonemappingPassOptions } from './TonemappingPass'

export { BloomPass } from './BloomPass'
export type { BloomPassOptions } from './BloomPass'

export { FXAAPass } from './FXAAPass'
export type { FXAAPassOptions } from './FXAAPass'

export { SMAAPass } from './SMAAPass'
export type { SMAAPassOptions } from './SMAAPass'

export { EnvironmentCompositePass } from './EnvironmentCompositePass'
export type { EnvironmentCompositePassConfig, ShellGlowConfig } from './EnvironmentCompositePass'

export { GTAOPass } from './GTAOPass'
export type { GTAOPassConfig } from './GTAOPass'

export { NormalPass } from './NormalPass'
export type { NormalPassConfig } from './NormalPass'

export { DepthPass } from './DepthPass'
export type { DepthPassConfig, DepthFormat } from './DepthPass'

export { SSRPass } from './SSRPass'
export type { SSRPassConfig } from './SSRPass'

export { RefractionPass } from './RefractionPass'
export type { RefractionPassConfig } from './RefractionPass'

export { BokehPass } from './BokehPass'
export type { BokehPassConfig } from './BokehPass'

export { CinematicPass } from './CinematicPass'
export type { CinematicPassConfig } from './CinematicPass'

export { CopyPass } from './CopyPass'
export type { CopyPassConfig } from './CopyPass'

export { GodRaysPass } from './GodRaysPass'
export type { GodRaysPassConfig } from './GodRaysPass'

export { FrameBlendingPass } from './FrameBlendingPass'
export type { FrameBlendingPassConfig } from './FrameBlendingPass'

export { GravitationalLensingPass } from './GravitationalLensingPass'
export type { GravitationalLensingPassConfig } from './GravitationalLensingPass'

export { PaperTexturePass } from './PaperTexturePass'
export type { PaperTexturePassConfig } from './PaperTexturePass'

export { JetsRenderPass } from './JetsRenderPass'
export type { JetsRenderPassConfig } from './JetsRenderPass'

export { JetsCompositePass } from './JetsCompositePass'
export type { JetsCompositePassConfig } from './JetsCompositePass'

export { CompositePass } from './CompositePass'
export type { CompositePassConfig, CompositeInput, BlendMode } from './CompositePass'

export { ScreenSpaceLensingPass } from './ScreenSpaceLensingPass'
export type { ScreenSpaceLensingPassConfig } from './ScreenSpaceLensingPass'

export { ToScreenPass } from './ToScreenPass'
export type { ToScreenPassConfig } from './ToScreenPass'

export { BufferPreviewPass } from './BufferPreviewPass'
export type { BufferPreviewPassConfig, BufferType, DepthMode } from './BufferPreviewPass'

export { ToneMappingCinematicPass, ToneMappingMode } from './ToneMappingCinematicPass'
export type { ToneMappingCinematicPassConfig } from './ToneMappingCinematicPass'

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

// Scene passes
export { ScenePass } from './ScenePass'
export type { ScenePassConfig, SceneRenderStats } from './ScenePass'
