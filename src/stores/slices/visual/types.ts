import type {
  ColorAlgorithm,
  CosineCoefficients,
  DistributionSettings,
  DivergingPsiSettings,
  DomainColoringSettings,
  MultiSourceWeights,
  PhaseDivergingSettings,
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

/** Read-only state for color algorithm and palette settings. */
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

/** Mutation actions for color algorithm settings. */
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

/** Combined color state and actions. */
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

/** Mutation actions for material/shader settings. */
export interface MaterialSliceActions {
  setFaceEmission: (emission: number) => void
  setFaceEmissionThreshold: (threshold: number) => void
  setFaceEmissionColorShift: (shift: number) => void
}

/** Combined material state and actions. */
export type MaterialSlice = MaterialSliceState & MaterialSliceActions

// ============================================================================
// Render Slice
// ============================================================================

/** Read-only state for render quality settings. */
export interface RenderSliceState {
  // Shader System
  shaderType: ShaderType
  shaderSettings: AllShaderSettings
}

/** Mutation actions for render quality settings. */
export interface RenderSliceActions {
  setShaderType: (shaderType: ShaderType) => void
  setWireframeSettings: (settings: Partial<WireframeSettings>) => void
  setSurfaceSettings: (settings: Partial<SurfaceSettings>) => void
}

/** Combined render state and actions. */
export type RenderSlice = RenderSliceState & RenderSliceActions

// ============================================================================
// Advanced Rendering Slice
// ============================================================================

/** Read-only state for advanced rendering features (SSS, emission). */
export interface AdvancedRenderingState {
  // Subsurface Scattering
  sssEnabled: boolean
  sssIntensity: number
  sssColor: string
  sssThickness: number
  sssJitter: number
}

/** Mutation actions for advanced rendering features. */
export interface AdvancedRenderingActions {
  setSssEnabled: (enabled: boolean) => void
  setSssIntensity: (intensity: number) => void
  setSssColor: (color: string) => void
  setSssThickness: (thickness: number) => void
  setSssJitter: (jitter: number) => void
}

/** Combined advanced rendering state and actions. */
export type AdvancedRenderingSlice = AdvancedRenderingState & AdvancedRenderingActions

// ============================================================================
// Combined Appearance Slice
// ============================================================================

/** Action to reset all appearance state to defaults. */
export interface AppearanceResetAction {
  reset: () => void
}

/** Complete appearance slice combining all visual sub-slices. */
export type AppearanceSlice = ColorSlice &
  MaterialSlice &
  RenderSlice &
  AdvancedRenderingSlice &
  AppearanceResetAction
