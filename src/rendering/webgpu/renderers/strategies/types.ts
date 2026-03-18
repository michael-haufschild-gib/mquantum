/**
 * Strategy interface for quantum mode-specific rendering logic.
 *
 * Each quantum mode (HO, hydrogen, FSF, TDSE, BEC, Dirac, Pauli) implements
 * this interface to encapsulate its compute passes, bounding radius computation,
 * and per-frame dispatch logic. The renderer delegates to the active strategy
 * while handling shared concerns (uniforms, bind groups, render pass).
 *
 * @module rendering/webgpu/renderers/strategies/types
 */

import type { WebGPURenderContext, WebGPUSetupContext } from '../../core/types'
import type { SchroedingerWGSLShaderConfig } from '../../shaders/schroedinger/compose'
import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'

// ── Store snapshot shapes used by strategies ──

/** Minimal schroedinger store shape needed by strategies for bounding radius + compute dispatch */
export interface SchroedingerSnapshot {
  quantumMode?: string
  freeScalar?: {
    latticeDim?: number
    gridSize?: number[]
    spacing?: number[]
    needsReset?: boolean
    [key: string]: unknown
  }
  tdse?: {
    latticeDim?: number
    gridSize?: number[]
    spacing?: number[]
    needsReset?: boolean
    [key: string]: unknown
  }
  bec?: {
    latticeDim?: number
    gridSize?: number[]
    spacing?: number[]
    needsReset?: boolean
    interactionStrength?: number
    trapOmega?: number
    initTrapOmega?: number
    trapAnisotropy?: number[]
    vortexCharge?: number
    vortexLatticeCount?: number
    vortexAlternateCharge?: boolean
    solitonDepth?: number
    solitonVelocity?: number
    initialCondition?: string
    mass?: number
    hbar?: number
    dt?: number
    stepsPerFrame?: number
    fieldView?: string
    autoScale?: boolean
    diagnosticsEnabled?: boolean
    diagnosticsInterval?: number
    slicePositions?: number[]
    [key: string]: unknown
  }
  dirac?: {
    latticeDim?: number
    gridSize?: number[]
    spacing?: number[]
    needsReset?: boolean
    absorberEnabled?: boolean
    absorberWidth?: number
    pmlTargetReflection?: number
    [key: string]: unknown
  }
  absorberEnabled?: boolean
  absorberWidth?: number
  pmlTargetReflection?: number
  openQuantum?: {
    enabled?: boolean
    resetToken?: number
    hydrogenBasisMaxN?: number
    bathTemperature?: number
    couplingScale?: number
    dephasingRate?: number
    dephasingModel?: string
    dt?: number
    substeps?: number
    relaxationRate?: number
    thermalUpRate?: number
    dephasingEnabled?: boolean
    relaxationEnabled?: boolean
    thermalEnabled?: boolean
    [key: string]: unknown
  }
  principalQuantumNumber?: number
  azimuthalQuantumNumber?: number
  magneticQuantumNumber?: number
  bohrRadiusScale?: number
  extraDimQuantumNumbers?: number[]
  extraDimOmega?: number[]
  extraDimFrequencySpread?: number
  fieldScale?: number
  representation?: string
  momentumScale?: number
  momentumHbar?: number
  momentumDisplayUnits?: string
  sliceAnimationEnabled?: boolean
  wignerCacheResolution?: number
  wignerCrossTermsEnabled?: boolean
  wignerDimensionIndex?: number
  basisX?: Float32Array
  basisY?: Float32Array
  basisZ?: Float32Array
  [key: string]: unknown
}

// ── Strategy interface ──

/**
 * Resources returned by a strategy's setup() method for bind group construction.
 *
 * @param initPromises - Async initialization promises (compute pass compilation etc.)
 * @param densityTextureView - 3D density texture for fragment shader sampling (binding 4)
 * @param analysisTextureView - Analysis texture for educational color modes (binding 6)
 * @param additionalLayoutEntries - Extra bind group layout entries for group 2
 * @param additionalBindGroupEntries - Extra bind group entries for group 2
 */
export interface ModeSetupResult {
  initPromises: Promise<void>[]
  /** Bind group layout entries — available immediately (metadata only, no GPU resources) */
  additionalLayoutEntries: GPUBindGroupLayoutEntry[]
  /**
   * Bind group entries — must be called AFTER init promises resolve,
   * since GPU resources (textures, buffers) may not exist until then.
   */
  getBindGroupEntries: () => GPUBindGroupEntry[]
}

/**
 * Shared renderer state passed to strategy per-frame methods.
 * Provides read access to uniform data the renderer has already prepared.
 */
/** Cached quantum preset data shared with strategies for open quantum initialization */
export interface CachedPresetData {
  preset: {
    termCount: number
    coefficients: [number, number][]
    energies: number[]
    quantumNumbers: number[][]
    omega: number[]
  }
  config: {
    presetName: string
    seed: number
    termCount: number
    dimension: number
  } | null
}

/** Per-frame data passed from the renderer to the active mode strategy for compute dispatch. */
export interface ModeFrameContext {
  device: GPUDevice
  rendererConfig: SchrodingerRendererConfig
  schroedingerUniformData: ArrayBuffer
  basisUniformData: Float32Array
  schroedingerFloatView: Float32Array
  schroedingerIntView: Int32Array
  boundingRadius: number
  colorAlgorithm: number
  /** Cached quantum preset (computed in updateSchroedingerUniforms, needed by open quantum) */
  cachedPreset: CachedPresetData | null
  /** Rebuild the object bind group (e.g. after wigner cache resize) */
  rebuildObjectBindGroup: (additionalEntries: GPUBindGroupEntry[]) => void
}

/**
 * Per-mode strategy for quantum rendering.
 *
 * Encapsulates compute passes, bounding radius computation, and per-frame
 * dispatch logic. The renderer delegates mode-specific work to this interface
 * while handling shared concerns (uniform buffers, render pass, bind groups).
 */
export interface QuantumModeStrategy {
  /** Whether this mode uses a compute grid (FSF, TDSE, BEC, Dirac, Pauli) */
  readonly isComputeMode: boolean

  /**
   * Apply mode-specific overrides to the shader configuration.
   * Called during constructor to set feature flags.
   */
  configureShader(shader: SchroedingerWGSLShaderConfig, config: SchrodingerRendererConfig): void

  /**
   * Create mode-specific compute passes and return resources for bind group construction.
   * Called during createPipelineImpl. Returned promises are awaited in parallel
   * with render pipeline compilation.
   */
  setup(ctx: WebGPUSetupContext, config: SchrodingerRendererConfig): ModeSetupResult

  /**
   * Compute the raw bounding radius for this mode's physics.
   * Returns null to signal the renderer should use its default physics-based computation
   * (preset-based for HO/hydrogen analytic modes).
   */
  computeBoundingRadius(
    schroedinger: SchroedingerSnapshot,
    dimension: number,
    config: SchrodingerRendererConfig
  ): number | null

  /**
   * Execute per-frame compute work. Called after uniform updates, before the render pass.
   * Strategies dispatch their compute passes and update density textures here.
   */
  executeFrame(ctx: WebGPURenderContext, shared: ModeFrameContext): void

  /**
   * Set the uncertainty confidence mass on the density grid pass (if applicable).
   * Returns the log-rho threshold, or null if density grid is not available.
   */
  setUncertaintyConfidenceMass?(mass: number): number | null

  /**
   * Signal the strategy to reset its open quantum state (e.g. after preset regeneration).
   */
  resetOpenQuantumState?(): void

  /**
   * Release all mode-specific GPU resources and state.
   */
  dispose(): void
}
