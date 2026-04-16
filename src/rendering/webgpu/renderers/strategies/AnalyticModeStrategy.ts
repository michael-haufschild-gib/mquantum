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
 * The bucket is wrapped modulo `BASIS_VERSION_MIXER` so long-running sessions cannot
 * overflow into the rotationVersion range and cause dirty-check key collisions.
 * `accumulatedTime` is always ≥ 0, so a single modulo is sufficient.
 */
function computeBasisVersion(
  rotationVersion: number,
  sliceAnimationEnabled: boolean,
  dimension: number,
  accumulatedTime: number
): number {
  const rawBucket = sliceAnimationEnabled && dimension > 3 ? Math.floor(accumulatedTime * 120.0) : 0
  const basisTimeBucket = rawBucket % BASIS_TIME_BUCKET_MODULO
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
    const { device } = ctx
    const dim = config.dimension ?? 3
    const isHydrogen = isHydrogenQuantumMode(config.quantumMode)
    const openQuantumEnabled = config.openQuantumEnabled ?? false
    const isWigner = config.representation === 'wigner'
    const pipelineIs2D = dim === 2 || isWigner

    // Reset open quantum state on pipeline rebuild
    this.openQuantumExecutor.reset()

    const initPromises: Promise<void>[] = []
    const additionalLayoutEntries: GPUBindGroupLayoutEntry[] = []

    // ── Density grid compute pass ──
    this.densityGridPass?.dispose()
    this.densityGridPass = null
    this.densityGridInitialized = false

    const isosurface = config.isosurface ?? false
    // Use density grid for all 3D+ volumetric modes (non-isosurface, non-2D)
    const useDensityGrid = !isosurface && !pipelineIs2D

    if (!pipelineIs2D) {
      const forceRgba = useDensityGrid || dim > 3 || openQuantumEnabled || isHydrogen
      const isHydrogenOQ = openQuantumEnabled && isHydrogen

      // Adaptive grid resolution
      const baseDensityGridSize = dim <= 3 ? 96 : dim <= 5 ? 96 : 128
      const estimatedK = openQuantumEnabled ? (isHydrogen ? 10 : (config.termCount ?? 4)) : 0
      const densityGridSize = openQuantumEnabled
        ? AnalyticOpenQuantumExecutor.computeGridSize(baseDensityGridSize, estimatedK)
        : baseDensityGridSize

      this.densityGridPass = new DensityGridComputePass({
        dimension: dim,
        quantumMode: config.quantumMode as
          | 'harmonicOscillator'
          | 'hydrogenND'
          | 'hydrogenNDCoupled',
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

    // ── Eigenfunction cache compute pass ──
    this.eigenCachePass?.dispose()
    this.eigenCachePass = null
    this.eigenCacheInitialized = false

    const enableCache = config.eigenfunctionCacheEnabled ?? !pipelineIs2D
    // Cache is created alongside the density grid (bindings 2/3 vs 4/5 — disjoint).
    // The grid serves non-phase color algorithms; phase algorithms fall back to
    // the inline raymarcher which uses the cache for fast per-step evaluation.
    const useEigenfunctionCache = pipelineIs2D ? false : enableCache

    if (!pipelineIs2D && useEigenfunctionCache) {
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

    // ── Wigner cache compute pass ──
    this.wignerCachePass?.dispose()
    this.wignerCachePass = null
    this.wignerCacheInitialized = false

    if (isWigner) {
      this.wignerCachePass = new WignerCacheComputePass({
        dimension: dim,
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
    if (useDensityGrid) {
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

    // Capture references for the deferred getBindGroupEntries callback
    const eigenCacheRef = this.eigenCachePass
    const wignerCacheRef = this.wignerCachePass
    const densityGridRef = this.densityGridPass
    const densityGridSamplerRef = this.densityGridSampler

    return {
      initPromises,
      additionalLayoutEntries,
      getBindGroupEntries: () => {
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
            entries.push(
              { binding: 2, resource: cacheView },
              { binding: 3, resource: cacheSampler }
            )
          }
        }

        // Density grid texture + sampler (created during async init)
        if (useDensityGrid && densityGridRef && densityGridSamplerRef) {
          const view = densityGridRef.getDensityTextureView()
          if (view) {
            entries.push(
              { binding: 4, resource: view },
              { binding: 5, resource: densityGridSamplerRef }
            )
            // Pre-computed gradient normal texture; fall back to density view
            // to avoid bind group layout/entry mismatch
            const normalView = densityGridRef.getNormalTextureView()
            entries.push({ binding: 7, resource: normalView ?? view })
          }
        }

        return entries
      },
    }
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
    if (resolution === this.lastWignerCacheResolution) return
    const didResize = wignerPass.resize(ctx.device, resolution)
    this.lastWignerCacheResolution = resolution
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
      ctx.size.width / ctx.size.height,
      isHydrogenRadial,
      schroedinger
    )
    wignerPass.updateGridParams(ctx.device, xMin, xMax, -pRange, pRange)

    if (isAnimating) wignerPass.updateTimeOnly(ctx.device, ctx.frame?.time ?? 0)

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
          ctx.frame?.time ?? 0,
          shared.schroedingerFloatView[I.timeScale] ?? 0.8
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
