/**
 * Strategy for analytic quantum modes: Harmonic Oscillator and Hydrogen ND.
 *
 * Manages DensityGridComputePass, EigenfunctionCacheComputePass, WignerCacheComputePass,
 * and the full Open Quantum System (density matrix evolution for both HO and Hydrogen).
 *
 * @module rendering/webgpu/renderers/strategies/AnalyticModeStrategy
 */

import type {
  HydrogenBasisState,
  OpenQuantumConfig,
  TransitionRate,
} from '@/lib/physics/openQuantum'
import { buildLindbladChannels } from '@/lib/physics/openQuantum/channels'
import type { ComplexMatrix } from '@/lib/physics/openQuantum/complexMatrix'
import {
  basisEnergies,
  basisLabels,
  buildHydrogenBasis,
} from '@/lib/physics/openQuantum/hydrogenBasis'
import { buildHydrogenChannels } from '@/lib/physics/openQuantum/hydrogenChannels'
import { buildTransitionRates } from '@/lib/physics/openQuantum/hydrogenRates'
import {
  densityMatrixFromCoefficients,
  evolveMultiStep,
} from '@/lib/physics/openQuantum/integrator'
import { buildLiouvillian } from '@/lib/physics/openQuantum/liouvillian'
import { computeMetrics } from '@/lib/physics/openQuantum/metrics'
import { computePropagator, evolvePropagatorStep } from '@/lib/physics/openQuantum/propagator'
import {
  computeActiveK,
  createPackedBuffer,
  packForGPU,
} from '@/lib/physics/openQuantum/statePacking'
// Open quantum imports
import type { DensityMatrix, LindbladChannel } from '@/lib/physics/openQuantum/types'
import { useOpenQuantumDiagnosticsStore } from '@/stores/openQuantumDiagnosticsStore'

import type { WebGPURenderContext, WebGPUSetupContext } from '../../core/types'
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
import { packHydrogenBasisForGPU } from '../schrodingerRendererTypes'
import type {
  CachedPresetData,
  ModeFrameContext,
  ModeSetupResult,
  QuantumModeStrategy,
  SchroedingerSnapshot,
} from './types'

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

  // ── Open quantum state ──
  private openQuantumState: DensityMatrix | null = null
  private openQuantumPackedBuffer: Float32Array = createPackedBuffer()
  private openQuantumFrameCounter = 0
  private openQuantumLastVonNeumann = 0
  private openQuantumInitialized = false
  private openQuantumResetTokenSeen = -1
  private openQuantumUpdateTick = 0
  private openQuantumLastSchroedingerVersion = -1

  // HO open quantum caches
  private hoOpenQuantumCacheKey = ''
  private hoOpenQuantumChannels: LindbladChannel[] = []
  private hoOpenQuantumEnergies: Float64Array | null = null
  private hoPopulationLabels: string[] | null = null

  // Hydrogen open quantum caches
  private hydrogenBasis: HydrogenBasisState[] | null = null
  private hydrogenRates: TransitionRate[] | null = null
  private hydrogenChannels: LindbladChannel[] | null = null
  private hydrogenPropagator: ComplexMatrix | null = null
  private hydrogenBasisPackedBuffer: ArrayBuffer | null = null
  private hydrogenBasisLabels: string[] = []
  private hydrogenOQConfigHash = ''

  configureShader(_shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // Analytic modes use the default shader config set by the renderer constructor.
    // No overrides needed — feature flags (eigencache, wigner, density grid, etc.)
    // are already determined by the renderer based on dimension, representation, etc.
  }

  setup(ctx: WebGPUSetupContext, config: SchrodingerRendererConfig): ModeSetupResult {
    const { device } = ctx
    const dim = config.dimension ?? 3
    const isHydrogen = config.quantumMode === 'hydrogenND'
    const openQuantumEnabled = config.openQuantumEnabled ?? false
    const isWigner = config.representation === 'wigner'
    const pipelineIs2D = dim === 2 || isWigner

    // Reset open quantum state on pipeline rebuild
    this.resetOpenQuantumState()

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
        ? AnalyticModeStrategy.computeOpenQuantumGridSize(baseDensityGridSize, estimatedK)
        : baseDensityGridSize

      this.densityGridPass = new DensityGridComputePass({
        dimension: dim,
        quantumMode: config.quantumMode as 'harmonicOscillator' | 'hydrogenND',
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
    const useEigenfunctionCache = useDensityGrid || pipelineIs2D ? false : enableCache

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
    const basisTimeBucket =
      sliceAnimationEnabled && dimension > 3 ? Math.floor(accumulatedTime * 120.0) : 0
    const basisVersion = rotationVersion * 1000003 + basisTimeBucket

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
      this.executeOpenQuantum(ctx, shared, gridPass, schroedingerVersion, performance)
    }

    // Execute compute pass — fills the 3D density texture
    gridPass.execute(ctx)
    gridPass.postFrame?.()
  }

  private executeOpenQuantum(
    ctx: WebGPURenderContext,
    shared: ModeFrameContext,
    gridPass: DensityGridComputePass,
    schroedingerVersion: number,
    performance: PerformanceSnapshot | undefined
  ): void {
    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const oqConfig = extended?.schroedinger?.openQuantum
    if (!oqConfig?.enabled) return

    if (!shared.cachedPreset) return
    const cachedPreset = shared.cachedPreset.preset
    const cachedPresetConfig = shared.cachedPreset.config

    const resetToken = oqConfig.resetToken ?? 0
    let forceOpenQuantumUpdate = schroedingerVersion !== this.openQuantumLastSchroedingerVersion
    if (resetToken !== this.openQuantumResetTokenSeen) {
      this.openQuantumInitialized = false
      this.openQuantumResetTokenSeen = resetToken
      forceOpenQuantumUpdate = true
    }

    const isHydrogenOQ = shared.rendererConfig.quantumMode === 'hydrogenND'

    if (isHydrogenOQ) {
      this.executeHydrogenOpenQuantum(
        ctx,
        shared,
        gridPass,
        extended,
        oqConfig,
        schroedingerVersion,
        performance,
        forceOpenQuantumUpdate
      )
    } else {
      this.executeHOOpenQuantum(
        ctx,
        shared,
        gridPass,
        extended,
        oqConfig,
        cachedPreset,
        cachedPresetConfig,
        schroedingerVersion,
        performance,
        forceOpenQuantumUpdate
      )
    }
  }

  private executeHydrogenOpenQuantum(
    _ctx: WebGPURenderContext,
    shared: ModeFrameContext,
    gridPass: DensityGridComputePass,
    extended: ExtendedStoreSnapshot | undefined,
    oqConfig: OpenQuantumConfig,
    schroedingerVersion: number,
    performance: PerformanceSnapshot | undefined,
    forceOpenQuantumUpdate: boolean
  ): void {
    const dim = shared.rendererConfig.dimension ?? 3
    const maxN = oqConfig.hydrogenBasisMaxN ?? 2
    const schCfg = extended?.schroedinger
    const extraDimOmega = (schCfg?.extraDimOmega as number[] | undefined) ?? []
    const dt = oqConfig.dt ?? 0.01
    const substeps = oqConfig.substeps ?? 4

    // User's selected orbital — used as OQ initial state
    const userN = schCfg?.principalQuantumNumber ?? 1
    const userL = schCfg?.azimuthalQuantumNumber ?? 0
    const userM = schCfg?.magneticQuantumNumber ?? 0

    // Config hash for cache invalidation
    const hash = `h:${maxN}:${dim}:${oqConfig.bathTemperature}:${oqConfig.couplingScale}:${oqConfig.dephasingRate}:${oqConfig.dephasingModel}:${dt}:${substeps}:${extraDimOmega.join(',')}:${userN}:${userL}:${userM}`
    const configChanged = hash !== this.hydrogenOQConfigHash

    if (configChanged) {
      // Rebuild basis, rates, channels, Liouvillian, propagator
      this.hydrogenBasis = buildHydrogenBasis(maxN, dim, extraDimOmega)
      const K = this.hydrogenBasis.length
      const energies = basisEnergies(this.hydrogenBasis)
      this.hydrogenRates = buildTransitionRates(
        this.hydrogenBasis,
        oqConfig.bathTemperature ?? 300,
        oqConfig.couplingScale ?? 1.0
      )
      this.hydrogenChannels = buildHydrogenChannels(
        this.hydrogenBasis,
        this.hydrogenRates,
        oqConfig.dephasingRate ?? 0.5,
        (oqConfig.dephasingModel ?? 'uniform') !== 'none'
      )
      const liouvillian = buildLiouvillian(energies, this.hydrogenChannels, K)
      this.hydrogenPropagator = computePropagator(liouvillian, dt * substeps, K)

      this.hydrogenBasisPackedBuffer = packHydrogenBasisForGPU(this.hydrogenBasis, dim)
      this.hydrogenBasisLabels = basisLabels(this.hydrogenBasis)

      this.hydrogenOQConfigHash = hash
      this.openQuantumInitialized = false
      forceOpenQuantumUpdate = true
    }

    const basis = this.hydrogenBasis!
    const K = basis.length

    // Initialize ρ as the user's selected orbital |n,l,m⟩⟨n,l,m|
    let stateReinitialized = false
    if (!this.openQuantumState || this.openQuantumState.K !== K || !this.openQuantumInitialized) {
      const matchIdx = basis.findIndex((s) => s.n === userN && s.l === userL && s.m === userM)
      const initialIdx = matchIdx >= 0 ? matchIdx : 0
      const coeffsRe = new Float64Array(K)
      coeffsRe[initialIdx] = 1.0
      this.openQuantumState = densityMatrixFromCoefficients(coeffsRe, new Float64Array(K), K)
      this.openQuantumInitialized = true
      this.openQuantumFrameCounter = 0
      this.openQuantumLastVonNeumann = 0
      stateReinitialized = true
    }

    const shouldUpdate = this.shouldUpdateOpenQuantumThisFrame(
      performance,
      K,
      forceOpenQuantumUpdate || stateReinitialized
    )
    if (shouldUpdate) {
      evolvePropagatorStep(this.hydrogenPropagator!, this.openQuantumState)

      this.openQuantumFrameCounter++
      const includeVonNeumann = this.openQuantumFrameCounter % 4 === 0
      const metrics = computeMetrics(
        this.openQuantumState,
        includeVonNeumann,
        this.openQuantumLastVonNeumann
      )
      if (includeVonNeumann) {
        this.openQuantumLastVonNeumann = metrics.vonNeumannEntropy
      }
      const diagStore = useOpenQuantumDiagnosticsStore.getState()
      diagStore.pushMetrics(metrics)

      // Extract per-state populations
      const pops = new Float32Array(K)
      const el = this.openQuantumState.elements
      for (let k = 0; k < K; k++) {
        pops[k] = el[2 * (k * K + k)]!
      }
      diagStore.setPopulations(
        pops,
        this.hydrogenBasisLabels.length ? this.hydrogenBasisLabels : basisLabels(basis)
      )

      // Adaptive basis cap
      const renderBasisK = this.getOpenQuantumRenderBasisLimit(performance, K)
      const populationK = computeActiveK(this.openQuantumState!)
      const effectiveK = Math.min(renderBasisK, populationK)
      packForGPU(this.openQuantumState, metrics, this.openQuantumPackedBuffer, effectiveK)
      gridPass.updateOpenQuantumUniforms(shared.device, this.openQuantumPackedBuffer)

      gridPass.updateHydrogenBasisUniforms(shared.device, this.hydrogenBasisPackedBuffer!)
      this.openQuantumLastSchroedingerVersion = schroedingerVersion
    }
  }

  private executeHOOpenQuantum(
    _ctx: WebGPURenderContext,
    shared: ModeFrameContext,
    gridPass: DensityGridComputePass,
    _extended: ExtendedStoreSnapshot | undefined,
    oqConfig: OpenQuantumConfig,
    cachedPreset: CachedPresetData['preset'],
    cachedPresetConfig: CachedPresetData['config'],
    schroedingerVersion: number,
    performance: PerformanceSnapshot | undefined,
    forceOpenQuantumUpdate: boolean
  ): void {
    const K = cachedPreset.termCount

    // Initialize ρ from pure-state coefficients on first frame or preset change
    let stateReinitialized = false
    if (!this.openQuantumState || this.openQuantumState.K !== K || !this.openQuantumInitialized) {
      const coeffsRe = new Float64Array(K)
      const coeffsIm = new Float64Array(K)
      for (let k = 0; k < K; k++) {
        const pair = cachedPreset.coefficients[k]
        coeffsRe[k] = pair?.[0] ?? 0
        coeffsIm[k] = pair?.[1] ?? 0
      }
      this.openQuantumState = densityMatrixFromCoefficients(coeffsRe, coeffsIm, K)
      this.openQuantumInitialized = true
      this.openQuantumFrameCounter = 0
      this.openQuantumLastVonNeumann = 0
      stateReinitialized = true
    }

    const presetKey = cachedPresetConfig
      ? `${cachedPresetConfig.presetName}:${cachedPresetConfig.seed}:${cachedPresetConfig.termCount}:${cachedPresetConfig.dimension}`
      : `k:${K}`
    const hoCacheKey = [
      presetKey,
      oqConfig.dephasingRate ?? 0,
      oqConfig.relaxationRate ?? 0,
      oqConfig.thermalUpRate ?? 0,
      oqConfig.dephasingEnabled ? 1 : 0,
      oqConfig.relaxationEnabled ? 1 : 0,
      oqConfig.thermalEnabled ? 1 : 0,
    ].join(':')

    if (
      hoCacheKey !== this.hoOpenQuantumCacheKey ||
      !this.hoOpenQuantumEnergies ||
      this.hoOpenQuantumEnergies.length !== K
    ) {
      this.hoOpenQuantumChannels = buildLindbladChannels(oqConfig, K)
      const energies = new Float64Array(K)
      for (let k = 0; k < K; k++) {
        energies[k] = cachedPreset.energies[k] ?? 0
      }
      this.hoOpenQuantumEnergies = energies
      this.hoOpenQuantumCacheKey = hoCacheKey
      this.openQuantumInitialized = false
      forceOpenQuantumUpdate = true
    }

    const shouldUpdate = this.shouldUpdateOpenQuantumThisFrame(
      performance,
      K,
      forceOpenQuantumUpdate || stateReinitialized
    )
    if (shouldUpdate) {
      const dt = oqConfig.dt ?? 0.01
      const substeps = oqConfig.substeps ?? 4
      evolveMultiStep(
        this.openQuantumState,
        this.hoOpenQuantumEnergies!,
        this.hoOpenQuantumChannels,
        dt,
        substeps
      )

      this.openQuantumFrameCounter++
      const includeVonNeumann = this.openQuantumFrameCounter % 4 === 0
      const metrics = computeMetrics(
        this.openQuantumState,
        includeVonNeumann,
        this.openQuantumLastVonNeumann
      )
      if (includeVonNeumann) {
        this.openQuantumLastVonNeumann = metrics.vonNeumannEntropy
      }
      const diagStore = useOpenQuantumDiagnosticsStore.getState()
      diagStore.pushMetrics(metrics)

      const pops = new Float32Array(K)
      const el = this.openQuantumState.elements
      for (let k = 0; k < K; k++) {
        pops[k] = el[2 * (k * K + k)]!
      }
      if (!this.hoPopulationLabels || this.hoPopulationLabels.length !== K) {
        const SUB = [
          '\u2080',
          '\u2081',
          '\u2082',
          '\u2083',
          '\u2084',
          '\u2085',
          '\u2086',
          '\u2087',
          '\u2088',
          '\u2089',
        ]
        this.hoPopulationLabels = Array.from(
          { length: K },
          (_, i) => `\u03C8${i < 10 ? SUB[i] : String(i)}`
        )
      }
      diagStore.setPopulations(pops, this.hoPopulationLabels)

      const renderBasisK = this.getOpenQuantumRenderBasisLimit(performance, K)
      const populationK = computeActiveK(this.openQuantumState!)
      const effectiveK = Math.min(renderBasisK, populationK)
      packForGPU(this.openQuantumState, metrics, this.openQuantumPackedBuffer, effectiveK)
      gridPass.updateOpenQuantumUniforms(shared.device, this.openQuantumPackedBuffer)
      this.openQuantumLastSchroedingerVersion = schroedingerVersion
    }
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

  private executeWignerCache(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    const wignerPass = this.wignerCachePass
    if (!wignerPass || !this.wignerCacheInitialized) return

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const rotation = getStoreSnapshot<RotationState>(ctx, 'rotation')
    const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
    const schroedingerVersion = extended?.schroedingerVersion ?? 0
    const rotationVersion = rotation?.version ?? 0
    const isAnimating = animation?.isPlaying ?? false

    // Check for cache resolution change
    const wignerCacheResolution = extended?.schroedinger?.wignerCacheResolution ?? 256
    if (wignerCacheResolution !== this.lastWignerCacheResolution) {
      const didResize = wignerPass.resize(ctx.device, wignerCacheResolution)
      this.lastWignerCacheResolution = wignerCacheResolution
      if (didResize) {
        const newCacheView = wignerPass.getCacheTextureView()
        const newCacheSampler = wignerPass.getCacheSampler()
        if (newCacheView && newCacheSampler) {
          // Signal the renderer to rebuild the object bind group with new texture
          shared.rebuildObjectBindGroup([
            { binding: 2, resource: newCacheView },
            { binding: 3, resource: newCacheSampler },
          ])
        }
      }
    }

    // Sync Schroedinger uniforms
    wignerPass.updateSchroedingerUniforms(
      ctx.device,
      shared.schroedingerUniformData,
      schroedingerVersion
    )

    // Sync basis uniforms
    const geometry = getStoreSnapshot<GeometryState>(ctx, 'geometry')
    const dimension = geometry?.dimension ?? shared.rendererConfig.dimension ?? 3
    const sliceAnimEnabled = extended?.schroedinger?.sliceAnimationEnabled ?? false
    const accTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0
    const basisTimeBucket = sliceAnimEnabled && dimension > 3 ? Math.floor(accTime * 120.0) : 0
    const basisVersion = rotationVersion * 1000003 + basisTimeBucket
    wignerPass.updateBasisUniforms(
      ctx.device,
      shared.basisUniformData.buffer as ArrayBuffer,
      basisVersion
    )

    // Determine mode for grid range
    const schroedinger = extended?.schroedinger
    const crossTermsEnabled = schroedinger?.wignerCrossTermsEnabled ?? false
    const termCount = shared.rendererConfig.termCount ?? 1
    const isHydrogen = shared.rendererConfig.quantumMode === 'hydrogenND'
    const wignerDimIdx = shared.schroedingerIntView[1456 / 4] ?? 0
    const isHydrogenRadial = isHydrogen && wignerDimIdx < 3

    // Update grid x/p ranges from Schroedinger uniform buffer
    const xRange = shared.schroedingerFloatView[1464 / 4]!
    const pRange = shared.schroedingerFloatView[1468 / 4]!
    const aspect = ctx.size.width / ctx.size.height
    let xMin: number
    let xMax: number
    if (isHydrogenRadial) {
      const n = schroedinger?.principalQuantumNumber ?? 2
      const a0 = schroedinger?.bohrRadiusScale ?? 1.0
      const rCenter = n * n * a0
      xMin = Math.max(0, rCenter - xRange * aspect)
      xMax = rCenter + xRange * aspect
    } else {
      xMax = xRange * aspect
      xMin = -xMax
    }
    wignerPass.updateGridParams(ctx.device, xMin, xMax, -pRange, pRange)

    // Update time for animated HO superpositions
    if (isAnimating) {
      const time = ctx.frame?.time ?? 0
      wignerPass.updateTimeOnly(ctx.device, time)
    }

    const updateFlags = wignerPass.needsUpdate(
      isAnimating,
      crossTermsEnabled,
      termCount,
      isHydrogen
    )

    if (wignerPass.isTwoPhaseActive()) {
      if (updateFlags.spatial) {
        wignerPass.executeSpatial(ctx)
      }
      if (updateFlags.reconstruct) {
        const time = ctx.frame?.time ?? 0
        const timeScale = shared.schroedingerFloatView[676 / 4] ?? 0.8
        wignerPass.updateReconstructParams(
          ctx.device,
          shared.schroedingerUniformData,
          time,
          timeScale
        )
        wignerPass.executeReconstruct(ctx)
      }
    } else {
      if (updateFlags.spatial) {
        wignerPass.execute(ctx)
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // OPEN QUANTUM HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  private shouldUpdateOpenQuantumThisFrame(
    performance: PerformanceSnapshot | undefined,
    basisK: number,
    forceUpdate: boolean
  ): boolean {
    if (forceUpdate) {
      this.openQuantumUpdateTick = 0
      return true
    }
    const stride = this.computeOpenQuantumFrameStride(performance, basisK)
    if (stride <= 1) {
      this.openQuantumUpdateTick = 0
      return true
    }
    this.openQuantumUpdateTick = (this.openQuantumUpdateTick + 1) % stride
    return this.openQuantumUpdateTick === 0
  }

  private computeOpenQuantumFrameStride(
    performance: PerformanceSnapshot | undefined,
    basisK: number
  ): number {
    const qualityMultiplier = performance?.qualityMultiplier ?? 1.0
    const interacting = performance?.isInteracting ?? false
    const sceneTransitioning = performance?.sceneTransitioning ?? false
    const heavyBasis = basisK >= 10

    if (sceneTransitioning) return heavyBasis ? 5 : 4
    if (interacting) return heavyBasis ? 4 : 3
    if (qualityMultiplier < 0.5) return heavyBasis ? 4 : 3
    if (qualityMultiplier < 0.75) return 3
    return heavyBasis ? 3 : 2
  }

  private getOpenQuantumRenderBasisLimit(
    performance: PerformanceSnapshot | undefined,
    basisK: number
  ): number {
    if (basisK <= 8) return basisK
    const qualityMultiplier = performance?.qualityMultiplier ?? 1.0
    const interacting = performance?.isInteracting ?? false
    const sceneTransitioning = performance?.sceneTransitioning ?? false
    if (sceneTransitioning) return Math.min(basisK, 6)
    if (interacting || qualityMultiplier < 0.5) return Math.min(basisK, 8)
    if (qualityMultiplier < 0.75) return Math.min(basisK, 10)
    return basisK
  }

  private static computeOpenQuantumGridSize(baseSize: number, basisK: number): number {
    if (basisK <= 6) return baseSize
    if (basisK <= 10) return Math.min(baseSize, 48)
    return Math.min(baseSize, 32)
  }

  resetOpenQuantumState(): void {
    this.openQuantumState = null
    this.openQuantumInitialized = false
    this.openQuantumFrameCounter = 0
    this.openQuantumResetTokenSeen = -1
    this.openQuantumUpdateTick = 0
    this.openQuantumLastSchroedingerVersion = -1
    this.hoOpenQuantumCacheKey = ''
    this.hoOpenQuantumChannels = []
    this.hoOpenQuantumEnergies = null
    this.hydrogenBasis = null
    this.hydrogenRates = null
    this.hydrogenChannels = null
    this.hydrogenPropagator = null
    this.hydrogenBasisPackedBuffer = null
    this.hydrogenBasisLabels = []
    this.hoPopulationLabels = null
    this.hydrogenOQConfigHash = ''
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ═══════════════════════════════════════════════════════════════════════

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

    this.resetOpenQuantumState()
  }
}
