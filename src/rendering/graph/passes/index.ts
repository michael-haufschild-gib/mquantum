/**
 * Render Graph Passes
 *
 * Built-in pass implementations for common rendering operations.
 *
 * @module rendering/graph/passes
 */

// Core passes
export { CopyPass, type CopyPassConfig } from './CopyPass'
export { FullscreenPass, type FullscreenPassConfig } from './FullscreenPass'
export { ScenePass, type ScenePassConfig } from './ScenePass'
export { ToScreenPass, type ToScreenPassConfig } from './ToScreenPass'

// G-buffer passes
export { DepthPass, type DepthPassConfig } from './DepthPass'
export { MainObjectMRTPass, type MainObjectMRTPassConfig } from './MainObjectMRTPass'
export { NormalPass, type NormalPassConfig } from './NormalPass'
export { TemporalCloudPass, type TemporalCloudPassConfig } from './TemporalCloudPass'
export {
  TemporalDepthCapturePass,
  type TemporalDepthCapturePassConfig,
  type TemporalDepthUniforms,
  invalidateAllTemporalDepth,
} from './TemporalDepthCapturePass'
export {
  TemporalCloudDepthPass,
  type TemporalCloudDepthPassConfig,
} from './TemporalCloudDepthPass'

// Effect passes
export { BloomPass, type BloomPassConfig } from './BloomPass'
export { BokehPass, type BokehPassConfig } from './BokehPass'
export { CinematicPass, type CinematicPassConfig } from './CinematicPass'
export { FrameBlendingPass, type FrameBlendingPassConfig } from './FrameBlendingPass'
export { PaperTexturePass, type PaperTexturePassConfig } from './PaperTexturePass'
export {
  CompositePass,
  type BlendMode,
  type CompositeInput,
  type CompositePassConfig,
} from './CompositePass'
export { FXAAPass, type FXAAPassConfig } from './FXAAPass'
export {
  GravitationalLensingPass,
  type GravitationalLensingPassConfig,
} from './GravitationalLensingPass'
export { RefractionPass, type RefractionPassConfig } from './RefractionPass'
export { ScreenSpaceLensingPass, type ScreenSpaceLensingPassConfig } from './ScreenSpaceLensingPass'
export { SMAAPass, type SMAAPassConfig } from './SMAAPass'
export { SSRPass, type SSRPassConfig } from './SSRPass'

// Ambient occlusion
export { GTAOPass, type GTAOPassConfig } from './GTAOPass'

// Cinematic passes
export { ToneMappingPass, type ToneMappingPassConfig } from './ToneMappingPass'
export {
  ToneMappingCinematicPass,
  type ToneMappingCinematicPassConfig,
} from './ToneMappingCinematicPass'

// Debug passes
export {
  BufferPreviewPass,
  type BufferPreviewPassConfig,
  type BufferType,
  type DepthMode,
} from './BufferPreviewPass'
export { DebugOverlayPass, type DebugOverlayPassConfig } from './DebugOverlayPass'

// Environment passes
export { CubemapCapturePass, type CubemapCapturePassConfig } from './CubemapCapturePass'
export {
  EnvironmentCompositePass,
  type EnvironmentCompositePassConfig,
  type ShellGlowConfig,
} from './EnvironmentCompositePass'

// Jet passes (Black Hole polar jets)
export { JetsRenderPass, type JetsRenderPassConfig } from './JetsRenderPass'
export { JetsCompositePass, type JetsCompositePassConfig } from './JetsCompositePass'
export { GodRaysPass, type GodRaysPassConfig } from './GodRaysPass'
