/**
 * Strategy for TDSE dynamics and BEC dynamics quantum modes.
 *
 * BEC is implemented as TDSE with a config adapter that maps BEC-specific
 * parameters (Thomas-Fermi, vortex, soliton) to the shared TDSE compute pass.
 *
 * @module rendering/webgpu/renderers/strategies/TdseBecStrategy
 */

import type { BecConfig } from '@/lib/geometry/extended/bec'
import type { TdseConfig, TdseInitialCondition } from '@/lib/geometry/extended/tdse'
import { logger } from '@/lib/logger'
import { thomasFermiMuND } from '@/lib/physics/bec/chemicalPotential'
import { computeIncompressibleSpectrum } from '@/lib/physics/bec/incompressibleSpectrum'
import { computeEffectiveSpacing } from '@/lib/physics/compactification'
import { useBecDiagnosticsStore } from '@/stores/becDiagnosticsStore'
import { useEigenstateDiagnosticsStore } from '@/stores/eigenstateDiagnosticsStore'
import { useMeasurementStore } from '@/stores/measurementStore'
import { useObservablesDiagnosticsStore } from '@/stores/observablesDiagnosticsStore'
import { useSimulationStateStore } from '@/stores/simulationStateStore'
import { useWavefunctionSliceStore } from '@/stores/wavefunctionSliceStore'

import type { WebGPURenderContext, WebGPUSetupContext } from '../../core/types'
import { TDSEComputePass } from '../../passes/TDSEComputePass'
import type { SchroedingerWGSLShaderConfig } from '../../shaders/schroedinger/compose'
import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'
import {
  type AnimationState,
  type ExtendedStoreSnapshot,
  getStoreSnapshot,
} from '../schrodingerRendererTypes'
import { applySharedPml, computeLatticeBoundingRadius } from './computeGridUtils'
import type {
  ModeFrameContext,
  ModeSetupResult,
  QuantumModeStrategy,
  SchroedingerSnapshot,
} from './types'

/** Interval (in diagnostic cycles) between spectrum computations. */
const SPECTRUM_INTERVAL = 4

/** Strategy for TDSE and BEC dynamics modes using split-operator compute dispatch. */
export class TdseBecStrategy implements QuantumModeStrategy {
  readonly isComputeMode = true

  private tdsePass: TDSEComputePass | null = null
  /** Counter for throttling spectrum computation (every SPECTRUM_INTERVAL diag cycles). */
  private spectrumCounter = 0
  /** Guard to prevent overlapping spectrum readbacks. */
  private spectrumInFlight = false

  configureShader(_shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // Compute mode overrides applied by renderer constructor
  }

  setup(ctx: WebGPUSetupContext, _config: SchrodingerRendererConfig): ModeSetupResult {
    const { device } = ctx

    this.tdsePass?.dispose()
    this.tdsePass = new TDSEComputePass()
    this.tdsePass.initializeDensityTexture(device)

    const densityTextureView = this.tdsePass.getDensityTextureView() ?? null

    const additionalLayoutEntries: GPUBindGroupLayoutEntry[] = []

    const sampler = densityTextureView
      ? device.createSampler({
          label: 'density-grid-sampler',
          magFilter: 'linear',
          minFilter: 'linear',
        })
      : null

    if (densityTextureView) {
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

    return {
      initPromises: [],
      additionalLayoutEntries,
      getBindGroupEntries: () => {
        if (!densityTextureView || !sampler) return []
        return [
          { binding: 4, resource: densityTextureView },
          { binding: 5, resource: sampler },
        ]
      },
    }
  }

  computeBoundingRadius(
    schroedinger: SchroedingerSnapshot,
    _dimension: number,
    config: SchrodingerRendererConfig
  ): number | null {
    const latticeConfig =
      config.quantumMode === 'becDynamics' ? schroedinger.bec : schroedinger.tdse
    if (!latticeConfig) return null
    const latDim = latticeConfig.latticeDim ?? 3
    const effSpacing = computeEffectiveSpacing(
      latticeConfig.gridSize ?? [32],
      latticeConfig.spacing ?? [0.1],
      latticeConfig.compactDims as boolean[] | undefined,
      latticeConfig.compactRadii as number[] | undefined,
      latDim
    )
    return computeLatticeBoundingRadius(latDim, latticeConfig.gridSize ?? [32], effSpacing)
  }

  executeFrame(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    const tdsePass = this.tdsePass
    if (!tdsePass) return

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
    const quantumMode = extended?.schroedinger?.quantumMode
    const isBecMode = quantumMode === 'becDynamics'
    const isPlaying = animation?.isPlaying ?? false
    const speed = animation?.speed ?? 1.0

    // Build TDSE config — either direct from store or mapped from BEC
    let tdseConfig = extended?.schroedinger?.tdse
    let clearReset: (() => void) | undefined = extended?.clearTdseNeedsReset

    if (isBecMode && extended?.schroedinger?.bec) {
      const result = TdseBecStrategy.buildBecConfig(
        extended.schroedinger.bec,
        extended?.schroedinger
      )
      tdseConfig = result.config
      clearReset = extended?.clearBecNeedsReset
    }

    if (!tdseConfig) return

    const schroedinger = extended?.schroedinger
    const tdseWithSharedPml = applySharedPml(tdseConfig, schroedinger)

    tdsePass.executeTDSE(
      ctx,
      tdseWithSharedPml,
      isPlaying,
      speed,
      schroedinger?.basisX as Float32Array | undefined,
      schroedinger?.basisY as Float32Array | undefined,
      schroedinger?.basisZ as Float32Array | undefined,
      shared.boundingRadius
    )

    // Clear needsReset after processing
    if (tdseConfig.needsReset) {
      clearReset?.()
    }

    // BEC diagnostics
    if (isBecMode) {
      this.updateBecDiagnostics(tdsePass, extended)
      this.maybeComputeSpectrum(ctx, tdsePass, extended)
    }

    // B1: Simulation state save/load
    const simState = useSimulationStateStore.getState()
    if (simState.saveRequested) {
      simState.clearSaveRequest()
      tdsePass.requestStateSave(ctx)
    }

    // B2: Wavefunction slice capture
    const sliceStore = useWavefunctionSliceStore.getState()
    if (sliceStore.captureRequested) {
      sliceStore.clearRequest()
      tdsePass.requestSliceCapture(
        ctx,
        sliceStore.requestedAxis,
        tdseConfig.gridSize ?? [64],
        shared.boundingRadius
      )
    }
    if (simState.pendingLoadData) {
      const loadData = simState.pendingLoadData
      // Only inject if this strategy handles the loaded mode (TDSE or BEC)
      if (loadData.quantumMode === 'tdseDynamics' || loadData.quantumMode === 'becDynamics') {
        tdsePass.setLoadedWavefunction(loadData.psiRe, loadData.psiIm)
        simState.clearLoadData()
      }
    }

    // B3: Eigenstate storage for Gram-Schmidt + scar analysis
    if (simState.storeEigenstateRequested) {
      const energy = TdseBecStrategy.getCurrentEigenstateEnergy()
      const newCount = tdsePass.storeCurrentEigenstate(ctx.device, energy, tdseConfig)
      simState.clearStoreEigenstateRequest(
        newCount >= 0 ? newCount : tdsePass.getStoredEigenstateCount()
      )
      if (newCount >= 0) {
        useEigenstateDiagnosticsStore.getState().pushEigenstate(energy, NaN)
      }
    }

    // C3: Born rule measurement
    TdseBecStrategy.handleMeasurement(ctx, tdsePass, tdseConfig)
  }

  /** Read the current eigenstate energy from the observables store if available. */
  private static getCurrentEigenstateEnergy(): number {
    const obs = useObservablesDiagnosticsStore.getState()
    return obs.hasData ? obs.totalEnergy : NaN
  }

  /**
   * Handle measurement readback and collapse injection.
   * Checks the measurement store for pending requests, triggers async
   * readback, samples from |psi|^2, and injects collapsed wavefunction.
   */
  private static handleMeasurement(
    ctx: WebGPURenderContext,
    tdsePass: TDSEComputePass,
    tdseConfig: TdseConfig
  ): void {
    const mState = useMeasurementStore.getState()

    // Tick cooldown each frame
    if (mState.cooldownFrames > 0) {
      mState.tickCooldown()
    }

    // Check for pending measurement
    if (!mState.pendingMeasurement || mState.isCollapsing) return

    const gridSize = tdseConfig.gridSize.slice(0, tdseConfig.latticeDim)
    const spacing = computeEffectiveSpacing(
      tdseConfig.gridSize, tdseConfig.spacing,
      tdseConfig.compactDims, tdseConfig.compactRadii, tdseConfig.latticeDim
    )
    const measureAxis = mState.measureAxis
    const collapseWidth = mState.collapseWidth

    mState.startCollapse()

    // Request async readback
    const readbackPromise = tdsePass.requestMeasurementReadback(ctx)

    void readbackPromise
      .then(async (data) => {
        if (!data) {
          useMeasurementStore.getState().completeMeasurement([], 0, null)
          return
        }

        const { executeFullMeasurement, executePartialMeasurement } =
          await import('@/lib/physics/measurementOrchestrator')

        const config = {
          latticeDim: gridSize.length,
          gridSize,
          spacing,
          compactDims: tdseConfig.compactDims as boolean[] | undefined,
        }

        const inject = (re: Float32Array, im: Float32Array) => {
          tdsePass.setLoadedWavefunction(re, im, true)
        }
        const record = (pos: number[], density: number, axis: number | null) => {
          useMeasurementStore.getState().completeMeasurement(pos, density, axis)
        }

        if (measureAxis !== null && measureAxis < gridSize.length) {
          executePartialMeasurement(
            data.re,
            data.im,
            config,
            measureAxis,
            collapseWidth,
            inject,
            record
          )
        } else {
          executeFullMeasurement(data.re, data.im, config, collapseWidth, inject, record)
        }
      })
      .catch((err) => {
        logger.error('[Measurement] Collapse failed:', err)
        const s = useMeasurementStore.getState()
        if (s.isCollapsing) s.completeMeasurement([], 0, null)
      })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BEC CONFIG BUILDER
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Map BEC store config to TDSE config format.
   * BEC is physically a nonlinear Schrodinger equation solved via the same
   * split-operator TDSE pipeline, with mode-specific initial conditions
   * (Thomas-Fermi, vortex imprint, dark soliton) and an anisotropic trap.
   */
  /** Validate BEC initial condition and compute mapped init type + momentum params. */
  private static prepareBecInitCondition(bec: BecConfig, g: number, latDim: number) {
    let initCond = bec.initialCondition ?? 'thomasFermi'

    // Attractive BEC (g < 0): Thomas-Fermi doesn't apply → force Gaussian
    if (
      g < 0 &&
      (initCond === 'thomasFermi' ||
        initCond === 'vortexImprint' ||
        initCond === 'vortexLattice' ||
        initCond === 'darkSoliton' ||
        initCond === 'vortexReconnection')
    ) {
      initCond = 'gaussianPacket'
    }

    // Map BEC init conditions to TDSE shader init condition strings:
    // vortexLattice → vortexImprint (same shader, different count)
    // vortexReconnection → ndVortexPair (new shader branch for configurable-plane vortices)
    let mappedInit: string = initCond
    if (initCond === 'vortexLattice') mappedInit = 'vortexImprint'
    else if (initCond === 'vortexReconnection') mappedInit = 'ndVortexPair'

    // Build momentum vector — encode BEC-specific params
    const mom = new Array(Math.max(latDim, 5)).fill(0) as number[]
    if (initCond === 'vortexImprint' || initCond === 'vortexLattice') {
      mom[0] = bec.vortexCharge ?? 1
      if (initCond === 'vortexLattice') {
        mom[3] = bec.vortexLatticeCount ?? 4
        mom[4] = bec.vortexAlternateCharge ? 1.0 : 0.0
      }
    }
    if (initCond === 'vortexReconnection') {
      mom[0] = bec.vortexCharge ?? 1
    }
    if (initCond === 'darkSoliton') {
      mom[1] = bec.solitonDepth ?? 1.0
      mom[2] = bec.solitonVelocity ?? 0.0
    }
    return { mappedInit, mom }
  }

  /**
   * Map BEC store config to TDSE config format.
   */
  private static buildBecConfig(
    bec: BecConfig,
    schroedinger:
      | {
          absorberEnabled?: boolean
          absorberWidth?: number
          pmlTargetReflection?: number
          autoScaleMaxGain?: number
        }
      | undefined
  ): { config: TdseConfig } {
    const g = bec.interactionStrength ?? 500
    const omega = bec.trapOmega ?? 1.0
    const latDim = bec.latticeDim ?? 3
    const initOmega = bec.initTrapOmega ?? omega
    const anisotropy = bec.trapAnisotropy ?? (new Array(latDim).fill(1.0) as number[])

    // Chemical potential for init shader
    let effectiveInitOmega = initOmega
    if (g > 0 && anisotropy.length > 0) {
      let anisotropyProduct = 1.0
      for (let d = 0; d < latDim; d++) {
        anisotropyProduct *= anisotropy[d] ?? 1.0
      }
      effectiveInitOmega = initOmega * Math.pow(anisotropyProduct, 1 / latDim)
    }
    const mu =
      g > 0
        ? thomasFermiMuND(latDim, g, effectiveInitOmega)
        : Math.pow(1 / (2 * Math.PI), latDim / 4)

    const { mappedInit, mom } = TdseBecStrategy.prepareBecInitCondition(bec, g, latDim)

    return {
      config: {
        latticeDim: latDim,
        gridSize: bec.gridSize ?? new Array(latDim).fill(8),
        spacing: bec.spacing ?? new Array(latDim).fill(0.15),
        mass: bec.mass ?? 1.0,
        hbar: bec.hbar ?? 1.0,
        dt: bec.dt ?? 0.002,
        stepsPerFrame: bec.stepsPerFrame ?? 4,
        initialCondition: mappedInit as TdseInitialCondition,
        packetCenter: new Array(latDim).fill(0),
        packetWidth: 1.0,
        packetAmplitude: mu,
        packetMomentum: mom,
        potentialType: 'becTrap',
        barrierHeight: 0,
        barrierWidth: 0,
        barrierCenter: 0,
        wellDepth: 0,
        wellWidth: 0,
        stepHeight: 0,
        harmonicOmega: omega,
        harmonicOmegaInit: initOmega !== omega ? initOmega : undefined,
        slitSeparation: 0,
        slitWidth: 0,
        wallThickness: 0,
        wallHeight: 0,
        latticeDepth: 0,
        latticePeriod: 1,
        doubleWellLambda: 0,
        doubleWellSeparation: 1,
        doubleWellAsymmetry: 0,
        radialWellInner: 0.6,
        radialWellOuter: 1.8,
        radialWellDepth: 50,
        radialWellTilt: 0.5,
        anharmonicLambda: 0,
        disorderStrength: 0,
        disorderSeed: 42,
        disorderDistribution: 'uniform' as const,
        driveEnabled: false,
        driveWaveform: 'sine',
        driveFrequency: 0,
        driveAmplitude: 0,
        trapAnisotropy: anisotropy,
        absorberEnabled: schroedinger?.absorberEnabled ?? false,
        absorberWidth: schroedinger?.absorberWidth ?? 0.2,
        pmlTargetReflection: schroedinger?.pmlTargetReflection ?? 1e-6,
        fieldView: bec.fieldView ?? 'density',
        autoScale: bec.autoScale ?? true,
        autoScaleMaxGain: schroedinger?.autoScaleMaxGain ?? 20,
        showPotential: false,
        autoLoop: false,
        diagnosticsEnabled: bec.diagnosticsEnabled ?? true,
        diagnosticsInterval: bec.diagnosticsInterval ?? 5,
        needsReset: bec.needsReset ?? false,
        slicePositions: bec.slicePositions ?? [],
        interactionStrength: g,
        customPotentialExpression: '',
        observablesEnabled: bec.observablesEnabled ?? false,
        imaginaryTimeEnabled: false,
        // N-D vortex reconnection plane configuration
        vortexPlane1: bec.vortexPlane1 ?? [0, 1],
        vortexPlane2: bec.vortexPlane2 ?? [2, 3],
        vortexSeparation: bec.vortexSeparation ?? 0.0,
        vortexPairCount: bec.vortexPairCount ?? 2,
        // Kaluza-Klein compactification (pass through from BEC config)
        compactDims: bec.compactDims ?? new Array(latDim).fill(false) as boolean[],
        compactRadii: bec.compactRadii ?? new Array(latDim).fill(1.0) as number[],
      },
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BEC DIAGNOSTICS
  // ═══════════════════════════════════════════════════════════════════════

  private updateBecDiagnostics(
    tdsePass: TDSEComputePass,
    extended: ExtendedStoreSnapshot | undefined
  ): void {
    const diag = tdsePass.getDiagnostics()
    if (!diag) return

    const bec = extended?.schroedinger?.bec
    const g = bec?.interactionStrength ?? 500
    const mass = bec?.mass ?? 1.0
    const hbar = bec?.hbar ?? 1.0
    const omega = bec?.trapOmega ?? 1.0
    const aniso = bec?.trapAnisotropy ?? []
    const latDim = bec?.latticeDim ?? 3

    // Geometric mean of effective trap frequencies for anisotropic R_TF
    let omegaProd = 1.0
    for (let d = 0; d < latDim; d++) {
      omegaProd *= omega * (aniso[d] ?? 1.0)
    }
    const omegaEff = Math.pow(omegaProd, 1 / latDim)
    const peakN = diag.maxDensity
    const mu = g * peakN
    const xiDenom = 2 * mass * g * peakN
    const xi = xiDenom > 0 ? hbar / Math.sqrt(xiDenom) : Infinity
    const csVal = (g * peakN) / mass
    const cs = csVal > 0 ? Math.sqrt(csVal) : 0
    const rtfDenom = mass * omegaEff * omegaEff
    const rtf = rtfDenom > 0 && mu > 0 ? Math.sqrt((2 * mu) / rtfDenom) : 0

    // Vortex count from plaquette-based phase singularity detection
    const [vortexPlaquettes, posCharge, negCharge] = tdsePass.getVortexCounts()
    const estimatedVortexCount = Math.max(posCharge, negCharge)

    useBecDiagnosticsStore.getState().update({
      totalNorm: diag.totalNorm,
      maxDensity: peakN,
      normDrift: diag.normDrift,
      chemicalPotential: mu,
      healingLength: xi,
      soundSpeed: cs,
      thomasFermiRadius: rtf,
      vortexCount: estimatedVortexCount,
      vortexPlaquettes,
      vortexPositiveCharge: posCharge,
      vortexNegativeCharge: negCharge,
    })
  }

  /**
   * Trigger async incompressible E(k) spectrum computation at throttled intervals.
   * Reads back psi from GPU, computes velocity field + Helmholtz decomposition on CPU.
   */
  private maybeComputeSpectrum(
    ctx: WebGPURenderContext,
    tdsePass: TDSEComputePass,
    extended: ExtendedStoreSnapshot | undefined
  ): void {
    const bec = extended?.schroedinger?.bec
    const g = bec?.interactionStrength ?? 0
    if (g <= 0 || !bec || this.spectrumInFlight) return

    this.spectrumCounter++
    if (this.spectrumCounter < SPECTRUM_INTERVAL) return
    this.spectrumCounter = 0
    this.spectrumInFlight = true

    const gridSize = bec.gridSize.slice(0, bec.latticeDim)
    const spacingArr = computeEffectiveSpacing(
      bec.gridSize as number[], bec.spacing as number[],
      bec.compactDims as boolean[] | undefined,
      bec.compactRadii as number[] | undefined,
      bec.latticeDim as number
    )
    const hbar = bec.hbar ?? 1.0
    const mass = bec.mass ?? 1.0

    void tdsePass.requestMeasurementReadback(ctx).then(
      (result) => {
        this.spectrumInFlight = false
        if (!result) return
        try {
          const spec = computeIncompressibleSpectrum(
            result.re,
            result.im,
            gridSize,
            spacingArr,
            hbar,
            mass
          )
          useBecDiagnosticsStore
            .getState()
            .setIncompressibleSpectrum(
              spec.spectrum,
              spec.kValues,
              spec.totalIncompressible,
              spec.totalCompressible
            )
        } catch {
          logger.warn('[BEC] Incompressible spectrum computation failed')
        }
      },
      () => {
        this.spectrumInFlight = false
      }
    )
  }

  getDensityTextureView(): GPUTextureView | null {
    return this.tdsePass?.getDensityTextureView() ?? null
  }

  dispose(): void {
    this.tdsePass?.dispose()
    this.tdsePass = null
  }
}
