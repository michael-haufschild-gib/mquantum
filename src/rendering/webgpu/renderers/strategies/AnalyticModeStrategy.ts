/**
 * Strategy for analytic quantum modes: Harmonic Oscillator and Hydrogen ND.
 *
 * Manages DensityGridComputePass, EigenfunctionCacheComputePass, WignerCacheComputePass,
 * and the full Open Quantum System (density matrix evolution for both HO and Hydrogen).
 *
 * @module rendering/webgpu/renderers/strategies/AnalyticModeStrategy
 */

import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/types'

import type { WebGPURenderContext, WebGPUSetupContext } from '../../core/types'
import { SCHROEDINGER_LAYOUT } from '../schroedingerLayout'

const I = SCHROEDINGER_LAYOUT.index
import { DensityGridComputePass } from '../../passes/DensityGridComputePass'
import { EigenfunctionCacheComputePass } from '../../passes/EigenfunctionCacheComputePass'
import { WignerCacheComputePass } from '../../passes/WignerCacheComputePass'
import { normalizeWignerCacheResolution } from '../../passes/wignerCacheTypes'
import type { SchroedingerWGSLShaderConfig } from '../../shaders/schroedinger/compose'
import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'
import {
  type AnimationState,
  type ExtendedStoreSnapshot,
  type GeometryState,
  getStoreSnapshot,
  type PerformanceSnapshot,
  type RotationState,
} from '../schrodingerRendererTypes'
import { AnalyticOpenQuantumExecutor } from './analyticOpenQuantum'
import type {
  ModeFrameContext,
  ModeSetupResult,
  QuantumModeStrategy,
  SchroedingerSnapshot,
} from './types'

/** Check if a quantum mode is a hydrogen family mode (decoupled or coupled). */
function isHydrogenQuantumMode(mode: SchroedingerQuantumMode | undefined): boolean {
  return mode === 'hydrogenND' || mode === 'hydrogenNDCoupled'
}

function resolveFiniteAspect(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 1
  }
  const aspect = width / height
  return Number.isFinite(aspect) && aspect > 0 ? aspect : 1
}

/** Derived setup-time flags shared by every subsystem helper in `setup()`. */
interface AnalyticSetupEnv {
  dim: number
  isHydrogen: boolean
  isWigner: boolean
  pipelineIs2D: boolean
  isosurface: boolean
  useDensityGrid: boolean
  openQuantumEnabled: boolean
}

/** Refs captured at setup() call time and consumed by the deferred `getBindGroupEntries`. */
interface AnalyticBindGroupRefs {
  eigenCacheRef: EigenfunctionCacheComputePass | null
  wignerCacheRef: WignerCacheComputePass | null
  densityGridRef: DensityGridComputePass | null
  densityGridSamplerRef: GPUSampler | null
  useDensityGrid: boolean
}

/** Compute the derived flags driving each subsystem in `AnalyticModeStrategy.setup`. */
function computeAnalyticSetupEnv(config: SchrodingerRendererConfig): AnalyticSetupEnv {
  const dim = config.dimension ?? 3
  const isHydrogen = isHydrogenQuantumMode(config.quantumMode)
  const openQuantumEnabled = config.openQuantumEnabled ?? false
  const isWigner = config.representation === 'wigner'
  const pipelineIs2D = dim === 2 || isWigner
  const isosurface = config.isosurface ?? false
  // Use density grid for all 3D+ volumetric modes (non-isosurface, non-2D)
  const useDensityGrid = !isosurface && !pipelineIs2D
  return { dim, isHydrogen, isWigner, pipelineIs2D, isosurface, useDensityGrid, openQuantumEnabled }
}

/**
 * Build the deferred `getBindGroupEntries` payload from refs captured at setup() time.
 *
 * Pure function over the captured refs — keeps the strategy class free of glue logic
 * and makes the per-subsystem entry order auditable in one place.
 */
function buildAnalyticBindGroupEntries(refs: AnalyticBindGroupRefs): GPUBindGroupEntry[] {
  const { eigenCacheRef, wignerCacheRef, densityGridRef, densityGridSamplerRef, useDensityGrid } =
    refs
  const entries: GPUBindGroupEntry[] = []

  // Eigencache buffer + metadata (available after init)
  if (eigenCacheRef) {
    const cacheBuffer = eigenCacheRef.getCacheBuffer()
    const metaBuffer = eigenCacheRef.getMetadataBuffer()
    if (cacheBuffer && metaBuffer) {
      entries.push(
        { binding: 2, resource: { buffer: cacheBuffer } },
        { binding: 3, resource: { buffer: metaBuffer } }
      )
    }
  }

  // Wigner cache texture + sampler (available after init)
  if (wignerCacheRef) {
    const cacheView = wignerCacheRef.getCacheTextureView()
    const cacheSampler = wignerCacheRef.getCacheSampler()
    if (cacheView && cacheSampler) {
      entries.push({ binding: 2, resource: cacheView }, { binding: 3, resource: cacheSampler })
    }
  }

  // Density grid texture + sampler (created during async init)
  if (useDensityGrid && densityGridRef && densityGridSamplerRef) {
    const view = densityGridRef.getDensityTextureView()
    if (view) {
      entries.push({ binding: 4, resource: view }, { binding: 5, resource: densityGridSamplerRef })
      // Pre-computed gradient normal texture; fall back to density view
      // to avoid bind group layout/entry mismatch
      const normalView = densityGridRef.getNormalTextureView()
      entries.push({ binding: 7, resource: normalView ?? view })
    }
  }

  return entries
}

/**
 * Stride for packing rotation version and animation-time bucket into a single JS number.
 * A prime near 2^24 keeps both ranges disjoint for long sessions while leaving
 * plenty of safe-integer headroom (rotationVersion can safely reach ~5×10^8 before
 * precision loss at Number.MAX_SAFE_INTEGER = 2^53 - 1). Wrapping bucket modulo this
 * value also bounds the time bucket range to ~38 h at 120 Hz, well beyond any
 * realistic single session.
 */
const BASIS_VERSION_MIXER = 16777213 // largest prime < 2^24
const BASIS_TIME_BUCKET_MODULO = BASIS_VERSION_MIXER

/**
 * Compute the basis-uniform version key from rotation and slice-animation state.
 *
 * In 4D+ with slice animation enabled, the basis vectors change continuously with
 * `accumulatedTime`, so we bucketize time at 120 Hz to drive uniform-buffer rewrites
 * while still letting the dirty-flag short-circuit static frames.
 *
 * The bucket is wrapped to `[0, BASIS_VERSION_MIXER)` via `((x%M)+M)%M` so:
 *   1. Long-running sessions cannot overflow into the rotationVersion range and
 *      cause dirty-check key collisions.
 *   2. Negative `accumulatedTime` (possible if `direction = -1` is exposed via the
 *      animation store's `toggleDirection`) cannot produce a negative remainder
 *      that collides with the previous rotationVersion bucket — JS `%` preserves
 *      sign, so e.g. `-120 % M === -120`, which equals `(N-1)*M + (M-120)` and
 *      would silently skip a needed `updateBasisUniforms` write.
 */
function computeBasisVersion(
  rotationVersion: number,
  sliceAnimationEnabled: boolean,
  dimension: number,
  accumulatedTime: number
): number {
  const rawBucket = sliceAnimationEnabled && dimension > 3 ? Math.floor(accumulatedTime * 120.0) : 0
  const basisTimeBucket =
    ((rawBucket % BASIS_TIME_BUCKET_MODULO) + BASIS_TIME_BUCKET_MODULO) % BASIS_TIME_BUCKET_MODULO
  return rotationVersion * BASIS_VERSION_MIXER + basisTimeBucket
}

/** Strategy for analytic quantum modes (harmonic oscillator, hydrogen) evaluated per-fragment in WGSL. */
export class AnalyticModeStrategy implements QuantumModeStrategy {
  readonly isComputeMode = false

  // ── Compute passes ──
  private densityGridPass: DensityGridComputePass | null = null
  private densityGridInitialized = false
  densityGridSampler: GPUSampler | null = null

  private eigenCachePass: EigenfunctionCacheComputePass | null = null
  private eigenCacheInitialized = false

  private wignerCachePass: WignerCacheComputePass | null = null
  private wignerCacheInitialized = false
  private lastWignerCacheResolution = 256

  // ── Open quantum executor ──
  private openQuantumExecutor = new AnalyticOpenQuantumExecutor()

  configureShader(_shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // Analytic modes use the default shader config set by the renderer constructor.
    // No overrides needed — feature flags (eigencache, wigner, density grid, etc.)
    // are already determined by the renderer based on dimension, representation, etc.
  }

  setup(ctx: WebGPUSetupContext, config: SchrodingerRendererConfig): ModeSetupResult {
    const env = computeAnalyticSetupEnv(config)

    // Reset open quantum state on pipeline rebuild
    this.openQuantumExecutor.reset()

    const initPromises: Promise<void>[] = []
    this.setupDensityGridPass(ctx, config, env, initPromises)
    this.setupEigenCachePass(ctx, config, env, initPromises)
    this.setupWignerCachePass(ctx, config, env, initPromises)

    const additionalLayoutEntries = this.buildAnalyticLayoutEntries(ctx, env)

    // Capture refs for the deferred getBindGroupEntries callback. Local consts
    // (not `this.*` reads) so the callback returns the references that existed
    // at setup() call time even if a later setup() overwrites them.
    const eigenCacheRef = this.eigenCachePass
    const wignerCacheRef = this.wignerCachePass
    const densityGridRef = this.densityGridPass
    const densityGridSamplerRef = this.densityGridSampler

    return {
      initPromises,
      additionalLayoutEntries,
      getBindGroupEntries: () =>
        buildAnalyticBindGroupEntries({
          eigenCacheRef,
          wignerCacheRef,
          densityGridRef,
          densityGridSamplerRef,
          useDensityGrid: env.useDensityGrid,
        }),
    }
  }

  /** Dispose any prior density-grid pass and create a new one when not in 2D pipeline mode. */
  private setupDensityGridPass(
    ctx: WebGPUSetupContext,
    config: SchrodingerRendererConfig,
    env: AnalyticSetupEnv,
    initPromises: Promise<void>[]
  ): void {
    // ── Density grid compute pass ──
    this.densityGridPass?.dispose()
    this.densityGridPass = null
    this.densityGridInitialized = false

    if (env.pipelineIs2D) return

    const { dim, isHydrogen, openQuantumEnabled, useDensityGrid } = env
    const forceRgba = useDensityGrid || dim > 3 || openQuantumEnabled || isHydrogen
    const isHydrogenOQ = openQuantumEnabled && isHydrogen

    // User-selected grid resolution (fallback to dimension-adaptive default).
    const baseDensityGridSize = config.densityGridResolution ?? (dim <= 5 ? 96 : 128)
    const estimatedK = openQuantumEnabled ? (isHydrogen ? 10 : (config.termCount ?? 4)) : 0
    const densityGridSize = openQuantumEnabled
      ? AnalyticOpenQuantumExecutor.computeGridSize(baseDensityGridSize, estimatedK)
      : baseDensityGridSize

    this.densityGridPass = new DensityGridComputePass({
      dimension: dim,
      quantumMode: config.quantumMode as 'harmonicOscillator' | 'hydrogenND' | 'hydrogenNDCoupled',
      termCount: config.termCount,
      gridSize: densityGridSize,
      forceRgba,
      useDensityMatrix: openQuantumEnabled,
      useHydrogenBasis: isHydrogenOQ,
    })
    initPromises.push(
      this.densityGridPass.initialize(ctx).then(() => {
        this.densityGridInitialized = true
      })
    )

    // getDensityTextureView() is consumed lazily in getBindGroupEntries() below
  }

  /** Dispose any prior eigenfunction cache pass and create a new one when caching is enabled. */
  private setupEigenCachePass(
    ctx: WebGPUSetupContext,
    config: SchrodingerRendererConfig,
    env: AnalyticSetupEnv,
    initPromises: Promise<void>[]
  ): void {
    // ── Eigenfunction cache compute pass ──
    this.eigenCachePass?.dispose()
    this.eigenCachePass = null
    this.eigenCacheInitialized = false

    const { dim, isHydrogen, pipelineIs2D } = env
    const enableCache = config.eigenfunctionCacheEnabled ?? !pipelineIs2D
    // Cache is created alongside the density grid (bindings 2/3 vs 4/5 — disjoint).
    // The grid serves non-phase color algorithms; phase algorithms fall back to
    // the inline raymarcher which uses the cache for fast per-step evaluation.
    const useEigenfunctionCache = pipelineIs2D ? false : enableCache

    if (pipelineIs2D || !useEigenfunctionCache) return

    this.eigenCachePass = new EigenfunctionCacheComputePass({
      dimension: dim,
      isHydrogenND: isHydrogen,
    })
    initPromises.push(
      this.eigenCachePass.initialize(ctx).then(() => {
        this.eigenCacheInitialized = true
      })
    )
  }

  /** Dispose any prior Wigner cache pass and create a new one when in Wigner representation. */
  private setupWignerCachePass(
    ctx: WebGPUSetupContext,
    config: SchrodingerRendererConfig,
    env: AnalyticSetupEnv,
    initPromises: Promise<void>[]
  ): void {
    // ── Wigner cache compute pass ──
    this.wignerCachePass?.dispose()
    this.wignerCachePass = null
    this.wignerCacheInitialized = false

    if (!env.isWigner) return

    this.wignerCachePass = new WignerCacheComputePass({
      dimension: env.dim,
      quantumMode: config.quantumMode as 'harmonicOscillator' | 'hydrogenND',
      termCount: config.termCount,
    })
    // Reset stale resolution tracker. The new pass starts at the constructor
    // default (256), but the strategy instance is reused across pipeline
    // rebuilds, so a previously-cached value (e.g. 512 from a prior rebuild)
    // would make syncWignerCacheResolution short-circuit and silently leave
    // the user's chosen resolution unapplied — the cache would render at 256
    // even though the Cache Resolution dropdown still showed 512.
    this.lastWignerCacheResolution = NaN
    initPromises.push(
      this.wignerCachePass.initialize(ctx).then(() => {
        this.wignerCacheInitialized = true
      })
    )
  }

  /**
   * Build the bind group layout entries declared by whichever subsystems setup() activated.
   * Side effect: creates `this.densityGridSampler` when the density grid path is active —
   * the sampler is then captured by `getBindGroupEntries` along with the other refs.
   */
  private buildAnalyticLayoutEntries(
    ctx: WebGPUSetupContext,
    env: AnalyticSetupEnv
  ): GPUBindGroupLayoutEntry[] {
    const { device } = ctx
    const additionalLayoutEntries: GPUBindGroupLayoutEntry[] = []

    // ── Build additional bind group layout entries (metadata only, no GPU resources) ──

    // Eigenfunction cache: storage buffer + metadata uniform
    if (this.eigenCachePass) {
      additionalLayoutEntries.push(
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'read-only-storage' as const },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const },
        }
      )
    }

    // Wigner cache: pre-computed 2D texture + bilinear sampler
    if (this.wignerCachePass) {
      additionalLayoutEntries.push(
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const, viewDimension: '2d' as const },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' as const },
        }
      )
    }

    // Density grid texture + sampler (always declare if useDensityGrid — texture created during init)
    if (env.useDensityGrid) {
      this.densityGridSampler = device.createSampler({
        label: 'density-grid-sampler',
        magFilter: 'linear',
        minFilter: 'linear',
      })
      additionalLayoutEntries.push(
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const, viewDimension: '3d' as const },
        },
        {
          binding: 5,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' as const },
        },
        {
          binding: 7,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const, viewDimension: '3d' as const },
        }
      )
    }

    return additionalLayoutEntries
  }

  computeBoundingRadius(
    _schroedinger: SchroedingerSnapshot,
    _dimension: number,
    _config: SchrodingerRendererConfig
  ): number | null {
    // Return null to signal the renderer should use its default physics-based
    // bounding radius computation (computeBoundingRadius from schroedinger/boundingRadius).
    // The analytic modes have complex preset-dependent physics that remains in the renderer.
    return null
  }

  setUncertaintyConfidenceMass(mass: number): number | null {
    if (!this.densityGridPass) return null
    this.densityGridPass.setConfidenceMass(mass)
    return this.densityGridPass.getLogRhoThreshold()
  }

  executeFrame(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    this.executeDensityGrid(ctx, shared)
    this.executeEigenCache(ctx, shared)
    this.executeWignerCache(ctx, shared)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DENSITY GRID + OPEN QUANTUM
  // ═══════════════════════════════════════════════════════════════════════

  private executeDensityGrid(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    const gridPass = this.densityGridPass
    if (!gridPass || !this.densityGridInitialized) return

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const rotation = getStoreSnapshot<RotationState>(ctx, 'rotation')
    const geometry = getStoreSnapshot<GeometryState>(ctx, 'geometry')
    const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
    const schroedingerVersion = extended?.schroedingerVersion ?? 0
    const rotationVersion = rotation?.version ?? 0
    const dimension = geometry?.dimension ?? shared.rendererConfig.dimension ?? 3
    const sliceAnimationEnabled = extended?.schroedinger?.sliceAnimationEnabled ?? false
    const accumulatedTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0
    const basisVersion = computeBasisVersion(
      rotationVersion,
      sliceAnimationEnabled,
      dimension,
      accumulatedTime
    )

    // Sync uniform data from renderer to compute pass
    gridPass.updateSchroedingerUniforms(
      ctx.device,
      shared.schroedingerUniformData,
      schroedingerVersion
    )
    gridPass.updateBasisUniforms(
      ctx.device,
      shared.basisUniformData.buffer as ArrayBuffer,
      basisVersion
    )
    gridPass.updateWorldBound(ctx.device, shared.boundingRadius)

    // Open quantum system: evolve density matrix and upload to GPU
    const performance = getStoreSnapshot<PerformanceSnapshot>(ctx, 'performance')
    if (shared.rendererConfig.openQuantumEnabled) {
      this.openQuantumExecutor.execute(ctx, shared, gridPass, schroedingerVersion, performance)
    }

    // Execute compute pass — fills the 3D density texture
    gridPass.execute(ctx)
    gridPass.postFrame?.()
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EIGENFUNCTION CACHE
  // ═══════════════════════════════════════════════════════════════════════

  private executeEigenCache(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    const cachePass = this.eigenCachePass
    if (!cachePass || !this.eigenCacheInitialized) return

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const geometry = getStoreSnapshot<GeometryState>(ctx, 'geometry')
    const schroedingerVersion = extended?.schroedingerVersion ?? 0
    const dimension = geometry?.dimension ?? shared.rendererConfig.dimension ?? 3

    cachePass.updateFromUniforms(
      ctx.device,
      shared.schroedingerUniformData,
      schroedingerVersion,
      dimension
    )
    cachePass.execute(ctx)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WIGNER CACHE
  // ═══════════════════════════════════════════════════════════════════════

  /** Check for Wigner cache resolution changes and resize if needed. */
  private syncWignerCacheResolution(
    wignerPass: NonNullable<typeof this.wignerCachePass>,
    ctx: WebGPURenderContext,
    shared: ModeFrameContext,
    resolution: number
  ): void {
    const normalizedResolution = normalizeWignerCacheResolution(resolution)
    if (normalizedResolution === this.lastWignerCacheResolution) return
    const didResize = wignerPass.resize(ctx.device, normalizedResolution)
    this.lastWignerCacheResolution = normalizedResolution
    if (didResize) {
      const newCacheView = wignerPass.getCacheTextureView()
      const newCacheSampler = wignerPass.getCacheSampler()
      if (newCacheView && newCacheSampler) {
        shared.rebuildObjectBindGroup([
          { binding: 2, resource: newCacheView },
          { binding: 3, resource: newCacheSampler },
        ])
      }
    }
  }

  /** Compute Wigner grid x-range, accounting for hydrogen radial center. */
  private computeWignerGridRange(
    xRange: number,
    aspect: number,
    isHydrogenRadial: boolean,
    schroedinger: Partial<import('@/lib/geometry/extended/types').SchroedingerConfig> | undefined
  ): { xMin: number; xMax: number } {
    if (isHydrogenRadial) {
      const n = schroedinger?.principalQuantumNumber ?? 2
      const a0 = schroedinger?.bohrRadiusScale ?? 1.0
      const rCenter = n * n * a0
      return { xMin: Math.max(0, rCenter - xRange * aspect), xMax: rCenter + xRange * aspect }
    }
    const xMax = xRange * aspect
    return { xMin: -xMax, xMax }
  }

  private executeWignerCache(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    const wignerPass = this.wignerCachePass
    if (!wignerPass || !this.wignerCacheInitialized) return

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const rotation = getStoreSnapshot<RotationState>(ctx, 'rotation')
    const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
    const isAnimating = animation?.isPlaying ?? false

    this.syncWignerCacheResolution(
      wignerPass,
      ctx,
      shared,
      extended?.schroedinger?.wignerCacheResolution ?? 256
    )

    wignerPass.updateSchroedingerUniforms(
      ctx.device,
      shared.schroedingerUniformData,
      extended?.schroedingerVersion ?? 0
    )

    // Sync basis uniforms
    const geometry = getStoreSnapshot<GeometryState>(ctx, 'geometry')
    const dimension = geometry?.dimension ?? shared.rendererConfig.dimension ?? 3
    const sliceAnimEnabled = extended?.schroedinger?.sliceAnimationEnabled ?? false
    const accTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0
    const rotationVersion = rotation?.version ?? 0
    wignerPass.updateBasisUniforms(
      ctx.device,
      shared.basisUniformData.buffer as ArrayBuffer,
      computeBasisVersion(rotationVersion, sliceAnimEnabled, dimension, accTime)
    )

    const schroedinger = extended?.schroedinger
    const isHydrogen = isHydrogenQuantumMode(shared.rendererConfig.quantumMode)
    const isHydrogenRadial =
      isHydrogen && (shared.schroedingerIntView[I.wignerDimensionIndex] ?? 0) < 3

    const xRange = shared.schroedingerFloatView[I.wignerXRange]!
    const pRange = shared.schroedingerFloatView[I.wignerPRange]!
    const { xMin, xMax } = this.computeWignerGridRange(
      xRange,
      resolveFiniteAspect(ctx.size.width, ctx.size.height),
      isHydrogenRadial,
      schroedinger
    )
    wignerPass.updateGridParams(ctx.device, xMin, xMax, -pRange, pRange)

    if (isAnimating) wignerPass.updateTimeOnly(ctx.device, accTime)

    const crossTermsEnabled = schroedinger?.wignerCrossTermsEnabled ?? false
    const termCount = shared.rendererConfig.termCount ?? 1
    const updateFlags = wignerPass.needsUpdate(
      isAnimating,
      crossTermsEnabled,
      termCount,
      isHydrogen
    )

    if (wignerPass.isTwoPhaseActive()) {
      if (updateFlags.spatial) wignerPass.executeSpatial(ctx)
      if (updateFlags.reconstruct) {
        wignerPass.updateReconstructParams(
          ctx.device,
          shared.schroedingerUniformData,
          accTime,
          shared.schroedingerFloatView[I.timeScale] ?? 0.8,
          crossTermsEnabled
        )
        wignerPass.executeReconstruct(ctx)
      }
    } else if (updateFlags.spatial) {
      wignerPass.execute(ctx)
    }
  }

  resetOpenQuantumState(): void {
    this.openQuantumExecutor.reset()
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ═══════════════════════════════════════════════════════════════════════

  getDensityTextureView(): GPUTextureView | null {
    return this.densityGridPass?.getDensityTextureView() ?? null
  }

  dispose(): void {
    this.densityGridPass?.dispose()
    this.densityGridPass = null
    this.densityGridInitialized = false
    this.densityGridSampler = null

    this.eigenCachePass?.dispose()
    this.eigenCachePass = null
    this.eigenCacheInitialized = false

    this.wignerCachePass?.dispose()
    this.wignerCachePass = null
    this.wignerCacheInitialized = false

    this.openQuantumExecutor.reset()
  }
}
