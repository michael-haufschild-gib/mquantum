import type {
  ColorAlgorithm,
  CosineCoefficients,
  DivergingPsiSettings,
  DomainColoringSettings,
  PhaseDivergingSettings,
  DistributionSettings,
  MultiSourceWeights,
} from '@/rendering/shaders/palette'
import type {
  AllShaderSettings,
  ShaderType,
  SurfaceSettings,
  WireframeSettings,
} from '@/rendering/shaders/types'

// ============================================================================
// Color Slice
// ============================================================================

/**
 *
 */
export interface ColorSliceState {
  // Basic
  edgeColor: string
  faceColor: string
  backgroundColor: string
  perDimensionColorEnabled: boolean

  // Advanced
  colorAlgorithm: ColorAlgorithm
  cosineCoefficients: CosineCoefficients
  distribution: DistributionSettings
  multiSourceWeights: MultiSourceWeights
  lchLightness: number
  lchChroma: number
  domainColoring: DomainColoringSettings
  phaseDiverging: PhaseDivergingSettings
  divergingPsi: DivergingPsiSettings
}

/**
 *
 */
export interface ColorSliceActions {
  setEdgeColor: (color: string) => void
  setFaceColor: (color: string) => void
  setBackgroundColor: (color: string) => void
  setPerDimensionColorEnabled: (enabled: boolean) => void

  setColorAlgorithm: (algorithm: ColorAlgorithm) => void
  setCosineCoefficients: (coefficients: CosineCoefficients) => void
  setCosineCoefficient: (key: 'a' | 'b' | 'c' | 'd', index: number, value: number) => void
  setDistribution: (settings: Partial<DistributionSettings>) => void
  setMultiSourceWeights: (weights: Partial<MultiSourceWeights>) => void
  setLchLightness: (lightness: number) => void
  setLchChroma: (chroma: number) => void
  setDomainColoringSettings: (settings: Partial<DomainColoringSettings>) => void
  setPhaseDivergingSettings: (settings: Partial<PhaseDivergingSettings>) => void
  setDivergingPsiSettings: (settings: Partial<DivergingPsiSettings>) => void
}

/**
 *
 */
export type ColorSlice = ColorSliceState & ColorSliceActions

// ============================================================================
// Material Slice
// ============================================================================

/**
 * Material slice state - emission properties.
 * NOTE: PBR properties (roughness, metallic, specularIntensity, specularColor)
 * have been moved to the dedicated pbrStore (usePBRStore).
 */
export interface MaterialSliceState {
  // Emission
  faceEmission: number
  faceEmissionThreshold: number
  faceEmissionColorShift: number
}

/**
 *
 */
export interface MaterialSliceActions {
  setFaceEmission: (emission: number) => void
  setFaceEmissionThreshold: (threshold: number) => void
  setFaceEmissionColorShift: (shift: number) => void
}

/**
 *
 */
export type MaterialSlice = MaterialSliceState & MaterialSliceActions

// ============================================================================
// Render Slice
// ============================================================================

/**
 *
 */
export interface RenderSliceState {
  // Shader System
  shaderType: ShaderType
  shaderSettings: AllShaderSettings
}

/**
 *
 */
export interface RenderSliceActions {
  setShaderType: (shaderType: ShaderType) => void
  setWireframeSettings: (settings: Partial<WireframeSettings>) => void
  setSurfaceSettings: (settings: Partial<SurfaceSettings>) => void
}

/**
 *
 */
export type RenderSlice = RenderSliceState & RenderSliceActions

// ============================================================================
// Advanced Rendering Slice
// ============================================================================

/**
 *
 */
export interface AdvancedRenderingState {
  // Subsurface Scattering
  sssEnabled: boolean
  sssIntensity: number
  sssColor: string
  sssThickness: number
  sssJitter: number
}

/**
 *
 */
export interface AdvancedRenderingActions {
  setSssEnabled: (enabled: boolean) => void
  setSssIntensity: (intensity: number) => void
  setSssColor: (color: string) => void
  setSssThickness: (thickness: number) => void
  setSssJitter: (jitter: number) => void
}

/**
 *
 */
export type AdvancedRenderingSlice = AdvancedRenderingState & AdvancedRenderingActions

// ============================================================================
// Combined Appearance Slice
// ============================================================================

/**
 *
 */
export interface AppearanceResetAction {
  reset: () => void
}

/**
 *
 */
export type AppearanceSlice = ColorSlice &
  MaterialSlice &
  RenderSlice &
  AdvancedRenderingSlice &
  AppearanceResetAction
