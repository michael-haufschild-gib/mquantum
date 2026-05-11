/**
 * Abstract base class for single-pass compute-grid quantum mode strategies.
 *
 * The Pauli, Dirac, Quantum Walk, and Free Scalar Field strategies all share
 * the same scaffolding: a single compute pass per strategy, density-texture
 * setup, per-frame dispatch with a uniform argument shape, color-algorithm
 * derived field-view overrides, shared PML absorber injection, simulation
 * state IO, and same-subclass compute pass adoption for warm pipeline swaps.
 *
 * Concrete subclasses provide a tiny set of hooks describing the per-mode
 * differences (pass constructor, config accessor, dispatch signature,
 * optional binding/diagnostic extensions). All cross-cutting concerns live
 * here.
 *
 * @module rendering/webgpu/renderers/strategies/SinglePassComputeStrategy
 */

import type { WebGPURenderContext, WebGPUSetupContext } from '../../core/types'
import type { SchroedingerWGSLShaderConfig } from '../../shaders/schroedinger/compose'
import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'
import {
  type AnimationState,
  type ExtendedStoreSnapshot,
  getStoreSnapshot,
} from '../schrodingerRendererTypes'
import {
  applySharedPml,
  createDensityTextureBindings,
  handleSimulationStateIO,
  type StateSaveLoadPass,
} from './computeGridUtils'
import type {
  ModeFrameContext,
  ModeSetupResult,
  QuantumModeStrategy,
  SchroedingerSnapshot,
} from './types'

/**
 * Minimal compute pass contract that single-pass strategies depend on.
 * Combined with {@link StateSaveLoadPass} via the TPass generic constraint
 * so {@link handleSimulationStateIO} can be invoked uniformly.
 */
export interface SinglePassComputePass {
  /** Current density grid edge length (cube). Used to detect resolution changes. */
  getDensityGridSize(): number
  /** Allocate the density texture on the given device. */
  initializeDensityTexture(device: GPUDevice): void
  /** Return the density texture view, or null if not yet initialized. */
  getDensityTextureView(): GPUTextureView | null
  /** Release GPU resources. */
  dispose(): void
}

/**
 * Arguments delivered to the concrete `executePass` hook each frame.
 * Packaged into one object to keep the abstract dispatch signature stable
 * regardless of which mode-specific extra arguments the concrete pass needs.
 */
export interface SinglePassFrameArgs {
  isPlaying: boolean
  speed: number
  basisX: Float32Array | undefined
  basisY: Float32Array | undefined
  basisZ: Float32Array | undefined
  boundingRadius: number
  colorAlgorithm: number
}

/**
 * Abstract base class for single-pass compute-grid strategies. Concrete
 * subclasses (Pauli, Dirac, Quantum Walk, Free Scalar Field) implement a
 * handful of hooks describing per-mode specifics; the base class handles
 * setup, per-frame dispatch, simulation state IO, compute pass adoption,
 * and disposal uniformly.
 */
export abstract class SinglePassComputeStrategy<
  TPass extends SinglePassComputePass & StateSaveLoadPass,
  TConfig extends {
    needsReset?: boolean
    absorberEnabled?: boolean
    absorberWidth?: number
    pmlTargetReflection?: number
  },
> implements QuantumModeStrategy {
  readonly isComputeMode = true

  /**
   * The currently owned compute pass, or null when none has been created /
   * adopted yet. `protected` so subclasses can read it in their own hooks
   * (e.g. FreeScalarField needs the pass instance inside the bind group
   * closure built during `augmentSetup`). The field is named identically
   * across every subclass so tests can poke it uniformly.
   */
  protected pass: TPass | null = null
  private readonly frameArgs: SinglePassFrameArgs = {
    isPlaying: false,
    speed: 1,
    basisX: undefined,
    basisY: undefined,
    basisZ: undefined,
    boundingRadius: 0,
    colorAlgorithm: 0,
  }

  // ── Subclass hooks (abstract) ───────────────────────────────────────────

  /** Construct a new compute pass at the given density grid resolution. */
  protected abstract createPass(densityGridResolution: number): TPass

  /** Read the per-mode config from the extended-store snapshot. */
  protected abstract getConfig(extended: ExtendedStoreSnapshot | undefined): TConfig | undefined

  /** Quantum-mode keys passed to {@link handleSimulationStateIO}. */
  protected abstract get stateIOModeKeys(): string[]

  /** Sub-key passed to `clearComputeNeedsReset` (e.g. 'dirac'). */
  protected abstract get configSubKey(): string

  /** Dispatch the compute pass with its mode-specific signature. */
  protected abstract executePass(
    pass: TPass,
    ctx: WebGPURenderContext,
    config: TConfig,
    args: SinglePassFrameArgs
  ): void

  // ── Subclass hooks (optional) ───────────────────────────────────────────

  /**
   * Transform the per-mode config before dispatch. Default applies the
   * shared PML absorber overrides; subclasses can add color-algorithm
   * derived field-view overrides on top.
   */
  protected deriveEffectiveConfig(
    config: TConfig,
    _ctx: WebGPURenderContext,
    schroedinger: SchroedingerSnapshot | undefined
  ): TConfig {
    return applySharedPml(config, schroedinger) as TConfig
  }

  /**
   * Whether {@link handleSimulationStateIO} runs before or after the compute
   * dispatch. FSF needs 'before' so pending injections / save metadata land
   * in time for the field reinit; all other modes use 'after'.
   */
  protected stateIOOrder: 'before' | 'after' = 'after'

  /**
   * Inject extra layout entries and bind group entries beyond the standard
   * density-texture pair (bindings 4 + 5). Default is identity.
   */
  protected augmentSetup(
    _ctx: WebGPUSetupContext,
    _config: SchrodingerRendererConfig,
    bindings: ReturnType<typeof createDensityTextureBindings>
  ): ReturnType<typeof createDensityTextureBindings> {
    return bindings
  }

  /** Post-execute hook (e.g. FSF dev diagnostics). Default is no-op. */
  protected afterExecute(
    _ctx: WebGPURenderContext,
    _pass: TPass,
    _config: TConfig,
    _args: SinglePassFrameArgs
  ): void {
    // no-op
  }

  // ── QuantumModeStrategy implementation ──────────────────────────────────

  /**
   * Default bounding radius is null (signals the renderer to fall back to
   * its own physics-based default). Subclasses with a lattice override.
   */
  computeBoundingRadius(
    _schroedinger: SchroedingerSnapshot,
    _dimension: number,
    _config: SchrodingerRendererConfig
  ): number | null {
    return null
  }

  /**
   * No-op default — compute mode overrides are applied by the renderer
   * constructor's isComputeMode path. Subclasses may override if needed.
   */
  configureShader(_shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // no-op
  }

  setup(ctx: WebGPUSetupContext, config: SchrodingerRendererConfig): ModeSetupResult {
    // Recreate the compute pass when the density grid resolution changes
    // in-place — otherwise the existing pass keeps its old texture/buffer
    // sizes and the new resolution silently has no effect.
    if (!this.pass || this.pass.getDensityGridSize() !== config.densityGridResolution) {
      this.pass?.dispose()
      this.pass = this.createPass(config.densityGridResolution ?? 0)
      this.pass.initializeDensityTexture(ctx.device)
    }

    const baseBindings = createDensityTextureBindings(
      ctx.device,
      this.pass.getDensityTextureView() ?? null
    )
    const bindings = this.augmentSetup(ctx, config, baseBindings)
    return { initPromises: [], ...bindings }
  }

  executeFrame(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    const pass = this.pass
    if (!pass) return

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
    const config = this.getConfig(extended)
    if (!config) return

    const isPlaying = animation?.isPlaying ?? false
    const speed = animation?.speed ?? 1.0
    const schroedinger = extended?.schroedinger as SchroedingerSnapshot | undefined
    const effectiveConfig = this.deriveEffectiveConfig(config, ctx, schroedinger)
    const args = this.frameArgs
    args.isPlaying = isPlaying
    args.speed = speed
    args.basisX = schroedinger?.basisX as Float32Array | undefined
    args.basisY = schroedinger?.basisY as Float32Array | undefined
    args.basisZ = schroedinger?.basisZ as Float32Array | undefined
    args.boundingRadius = shared.boundingRadius
    args.colorAlgorithm = shared.colorAlgorithm

    if (this.stateIOOrder === 'before') {
      handleSimulationStateIO(ctx, pass, this.stateIOModeKeys)
    }

    this.executePass(pass, ctx, effectiveConfig, args)

    if (config.needsReset) {
      extended?.clearComputeNeedsReset?.(this.configSubKey)
    }

    if (this.stateIOOrder === 'after') {
      handleSimulationStateIO(ctx, pass, this.stateIOModeKeys)
    }

    this.afterExecute(ctx, pass, effectiveConfig, args)
  }

  /**
   * Transfer compute pass ownership between two instances of the SAME
   * concrete subclass. Uses prototype identity (not `instanceof`) so the
   * check lives in one place instead of being duplicated per subclass.
   */
  adoptComputeState(source: QuantumModeStrategy, nextConfig?: SchrodingerRendererConfig): boolean {
    if (Object.getPrototypeOf(source) !== Object.getPrototypeOf(this)) return false
    const other = source as SinglePassComputeStrategy<TPass, TConfig>
    const otherPass = other.pass
    if (!otherPass) return false
    const nextN = nextConfig?.densityGridResolution
    if (nextN && otherPass.getDensityGridSize() !== nextN) return false
    this.pass?.dispose()
    this.pass = otherPass
    other.pass = null
    return true
  }

  getDensityTextureView(): GPUTextureView | null {
    return this.pass?.getDensityTextureView() ?? null
  }

  dispose(): void {
    this.pass?.dispose()
    this.pass = null
  }
}
