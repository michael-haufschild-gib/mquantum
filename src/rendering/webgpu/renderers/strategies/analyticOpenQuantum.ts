/**
 * Open Quantum System executor for the AnalyticModeStrategy.
 *
 * Manages density matrix evolution, population tracking, and GPU uniform
 * updates for both Harmonic Oscillator and Hydrogen ND open quantum modes.
 *
 * @module rendering/webgpu/renderers/strategies/analyticOpenQuantum
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
import { densityMatrixFromCoefficients } from '@/lib/physics/openQuantum/integrator'
import { buildLiouvillian } from '@/lib/physics/openQuantum/liouvillian'
import { computeMetrics } from '@/lib/physics/openQuantum/metrics'
import { computePropagator, evolvePropagatorStep } from '@/lib/physics/openQuantum/propagator'
import {
  computeActiveK,
  createPackedBuffer,
  packForGPU,
} from '@/lib/physics/openQuantum/statePacking'
import type { DensityMatrix, LindbladChannel } from '@/lib/physics/openQuantum/types'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

import type { WebGPURenderContext } from '../../core/types'
import type { DensityGridComputePass } from '../../passes/DensityGridComputePass'
import { packHydrogenBasisForGPU } from '../schrodingerRendererTypes'
import {
  type ExtendedStoreSnapshot,
  getStoreSnapshot,
  type PerformanceSnapshot,
} from '../schrodingerRendererTypes'
import type { CachedPresetData, ModeFrameContext } from './types'

/**
 * Encapsulates all open quantum system state and execution logic.
 * Used as a delegate by AnalyticModeStrategy.
 */
export class AnalyticOpenQuantumExecutor {
  private state: DensityMatrix | null = null
  private packedBuffer: Float32Array = createPackedBuffer()
  private frameCounter = 0
  private lastVonNeumann = 0
  private initialized = false
  private resetTokenSeen = -1
  private updateTick = 0
  private lastSchroedingerVersion = -1

  // HO caches
  private hoCacheKey = ''
  private hoChannels: LindbladChannel[] = []
  private hoEnergies: Float64Array | null = null
  private hoPropagator: ComplexMatrix | null = null
  private hoPopulationLabels: string[] | null = null

  // Hydrogen caches
  private hydrogenBasis: HydrogenBasisState[] | null = null
  private hydrogenRates: TransitionRate[] | null = null
  private hydrogenChannels: LindbladChannel[] | null = null
  private hydrogenPropagator: ComplexMatrix | null = null
  private hydrogenBasisPackedBuffer: ArrayBuffer | null = null
  private hydrogenBasisLabels: string[] = []
  private hydrogenOQConfigHash = ''

  execute(
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

    const resetToken = oqConfig.resetToken ?? 0
    let forceUpdate = schroedingerVersion !== this.lastSchroedingerVersion
    if (resetToken !== this.resetTokenSeen) {
      this.initialized = false
      this.resetTokenSeen = resetToken
      forceUpdate = true
    }

    const isHydrogenOQ =
      shared.rendererConfig.quantumMode === 'hydrogenND' ||
      shared.rendererConfig.quantumMode === 'hydrogenNDCoupled'

    if (isHydrogenOQ) {
      this.executeHydrogen(
        shared,
        gridPass,
        extended,
        oqConfig,
        schroedingerVersion,
        performance,
        forceUpdate
      )
    } else {
      this.executeHO(
        shared,
        gridPass,
        oqConfig,
        shared.cachedPreset.preset,
        shared.cachedPreset.config,
        schroedingerVersion,
        performance,
        forceUpdate
      )
    }
  }

  private executeHydrogen(
    shared: ModeFrameContext,
    gridPass: DensityGridComputePass,
    extended: ExtendedStoreSnapshot | undefined,
    oqConfig: OpenQuantumConfig,
    schroedingerVersion: number,
    performance: PerformanceSnapshot | undefined,
    forceUpdate: boolean
  ): void {
    const dim = shared.rendererConfig.dimension ?? 3
    const maxN = oqConfig.hydrogenBasisMaxN ?? 2
    const schCfg = extended?.schroedinger
    const extraDimOmega = (schCfg?.extraDimOmega as number[] | undefined) ?? []
    const dt = oqConfig.dt ?? 0.01
    const substeps = oqConfig.substeps ?? 4

    const userN = schCfg?.principalQuantumNumber ?? 1
    const userL = schCfg?.azimuthalQuantumNumber ?? 0
    const userM = schCfg?.magneticQuantumNumber ?? 0

    const hash = `h:${maxN}:${dim}:${oqConfig.bathTemperature}:${oqConfig.couplingScale}:${oqConfig.dephasingRate}:${oqConfig.dephasingModel}:${dt}:${substeps}:${extraDimOmega.join(',')}:${userN}:${userL}:${userM}`
    const configChanged = hash !== this.hydrogenOQConfigHash

    if (configChanged) {
      this.hydrogenBasis = buildHydrogenBasis(maxN, dim, extraDimOmega)
      const K = this.hydrogenBasis.length
      const energies = basisEnergies(this.hydrogenBasis)
      this.hydrogenRates = buildTransitionRates(
        this.hydrogenBasis,
        oqConfig.bathTemperature ?? 300,
        oqConfig.couplingScale ?? 1.0,
        dim
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
      this.initialized = false
      forceUpdate = true
    }

    const basis = this.hydrogenBasis!
    const K = basis.length

    let stateReinitialized = false
    if (!this.state || this.state.K !== K || !this.initialized) {
      const matchIdx = basis.findIndex((s) => s.n === userN && s.l === userL && s.m === userM)
      const initialIdx = matchIdx >= 0 ? matchIdx : 0
      const coeffsRe = new Float64Array(K)
      coeffsRe[initialIdx] = 1.0
      this.state = densityMatrixFromCoefficients(coeffsRe, new Float64Array(K), K)
      this.initialized = true
      this.frameCounter = 0
      this.lastVonNeumann = 0
      stateReinitialized = true
    }

    if (!this.shouldUpdateThisFrame(performance, K, forceUpdate || stateReinitialized)) return

    evolvePropagatorStep(this.hydrogenPropagator!, this.state)
    this.publishMetricsAndPack(K, gridPass, shared, schroedingerVersion, performance)
    gridPass.updateHydrogenBasisUniforms(shared.device, this.hydrogenBasisPackedBuffer!)
  }

  private executeHO(
    shared: ModeFrameContext,
    gridPass: DensityGridComputePass,
    oqConfig: OpenQuantumConfig,
    cachedPreset: CachedPresetData['preset'],
    cachedPresetConfig: CachedPresetData['config'],
    schroedingerVersion: number,
    performance: PerformanceSnapshot | undefined,
    forceUpdate: boolean
  ): void {
    const K = cachedPreset.termCount

    let stateReinitialized = false
    if (!this.state || this.state.K !== K || !this.initialized) {
      const coeffsRe = new Float64Array(K)
      const coeffsIm = new Float64Array(K)
      for (let k = 0; k < K; k++) {
        const pair = cachedPreset.coefficients[k]
        coeffsRe[k] = pair?.[0] ?? 0
        coeffsIm[k] = pair?.[1] ?? 0
      }
      this.state = densityMatrixFromCoefficients(coeffsRe, coeffsIm, K)
      this.initialized = true
      this.frameCounter = 0
      this.lastVonNeumann = 0
      stateReinitialized = true
    }

    const presetKey = cachedPresetConfig
      ? `${cachedPresetConfig.presetName}:${cachedPresetConfig.seed}:${cachedPresetConfig.termCount}:${cachedPresetConfig.dimension}`
      : `k:${K}`
    const dt = oqConfig.dt ?? 0.01
    const substeps = oqConfig.substeps ?? 4
    const hoCacheKey = [
      presetKey,
      oqConfig.dephasingRate ?? 0,
      oqConfig.relaxationRate ?? 0,
      oqConfig.thermalUpRate ?? 0,
      oqConfig.dephasingEnabled ? 1 : 0,
      oqConfig.relaxationEnabled ? 1 : 0,
      oqConfig.thermalEnabled ? 1 : 0,
      dt,
      substeps,
    ].join(':')

    if (hoCacheKey !== this.hoCacheKey || !this.hoEnergies || this.hoEnergies.length !== K) {
      this.hoChannels = buildLindbladChannels(oqConfig, K)
      const energies = new Float64Array(K)
      for (let k = 0; k < K; k++) {
        energies[k] = cachedPreset.energies[k] ?? 0
      }
      this.hoEnergies = energies
      const liouvillian = buildLiouvillian(energies, this.hoChannels, K)
      this.hoPropagator = computePropagator(liouvillian, dt * substeps, K)
      this.hoCacheKey = hoCacheKey
      this.initialized = false
      forceUpdate = true
    }

    if (!this.shouldUpdateThisFrame(performance, K, forceUpdate || stateReinitialized)) return

    evolvePropagatorStep(this.hoPropagator!, this.state)

    this.publishMetricsAndPack(K, gridPass, shared, schroedingerVersion, performance)
  }

  private publishMetricsAndPack(
    K: number,
    gridPass: DensityGridComputePass,
    shared: ModeFrameContext,
    schroedingerVersion: number,
    performance: PerformanceSnapshot | undefined
  ): void {
    this.frameCounter++
    const includeVonNeumann = this.frameCounter % 4 === 0
    const metrics = computeMetrics(this.state!, includeVonNeumann, this.lastVonNeumann)
    if (includeVonNeumann) {
      this.lastVonNeumann = metrics.vonNeumannEntropy
    }

    const diagStore = useDiagnosticsStore.getState()
    diagStore.pushOpenQuantumMetrics(metrics)

    const pops = new Float32Array(K)
    const el = this.state!.elements
    for (let k = 0; k < K; k++) {
      pops[k] = el[2 * (k * K + k)]!
    }

    // Labels
    const labels = this.hydrogenBasisLabels.length
      ? this.hydrogenBasisLabels
      : this.getHOPopulationLabels(K)
    diagStore.setOpenQuantumPopulations(pops, labels)

    const renderBasisK = this.getRenderBasisLimit(performance, K)
    const populationK = computeActiveK(this.state!)
    const effectiveK = Math.min(renderBasisK, populationK)
    packForGPU(this.state!, metrics, this.packedBuffer, effectiveK)
    gridPass.updateOpenQuantumUniforms(shared.device, this.packedBuffer)
    this.lastSchroedingerVersion = schroedingerVersion
  }

  private getHOPopulationLabels(K: number): string[] {
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
    return this.hoPopulationLabels
  }

  private shouldUpdateThisFrame(
    performance: PerformanceSnapshot | undefined,
    basisK: number,
    forceUpdate: boolean
  ): boolean {
    if (forceUpdate) {
      this.updateTick = 0
      return true
    }
    const stride = this.computeFrameStride(performance, basisK)
    if (stride <= 1) {
      this.updateTick = 0
      return true
    }
    this.updateTick = (this.updateTick + 1) % stride
    return this.updateTick === 0
  }

  private computeFrameStride(performance: PerformanceSnapshot | undefined, basisK: number): number {
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

  private getRenderBasisLimit(
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

  static computeGridSize(baseSize: number, basisK: number): number {
    // Density matrix mode recomputes the full grid every evolution step.
    // Smaller grids dramatically reduce per-frame GPU cost: 64³ vs 96³ = 3.4× fewer voxels.
    // For small basis (K≤6), decoherence smooths density — 64³ suffices (>10 samples/node for n≤8).
    if (basisK <= 6) return Math.min(baseSize, 64)
    if (basisK <= 10) return Math.min(baseSize, 48)
    return Math.min(baseSize, 32)
  }

  reset(): void {
    this.state = null
    this.initialized = false
    this.frameCounter = 0
    this.resetTokenSeen = -1
    this.updateTick = 0
    this.lastSchroedingerVersion = -1
    this.hoCacheKey = ''
    this.hoChannels = []
    this.hoEnergies = null
    this.hoPropagator = null
    this.hydrogenBasis = null
    this.hydrogenRates = null
    this.hydrogenChannels = null
    this.hydrogenPropagator = null
    this.hydrogenBasisPackedBuffer = null
    this.hydrogenBasisLabels = []
    this.hoPopulationLabels = null
    this.hydrogenOQConfigHash = ''
  }
}
