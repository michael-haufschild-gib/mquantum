/**
 * Strategy for TDSE dynamics and BEC dynamics quantum modes.
 *
 * BEC is implemented as TDSE with a config adapter that maps BEC-specific
 * parameters (Thomas-Fermi, vortex, soliton) to the shared TDSE compute pass.
 *
 * @module rendering/webgpu/renderers/strategies/TdseBecStrategy
 */

import type { TdseConfig } from '@/lib/geometry/extended/tdse'
import { logger } from '@/lib/logger'
import { computeEffectiveSpacing } from '@/lib/physics/compactification'
import type {
  EntanglementWorkerRequest,
  EntanglementWorkerResponse,
} from '@/lib/physics/coordinateEntanglement.worker'
import { useCoordinateEntanglementStore } from '@/stores/coordinateEntanglementStore'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useSimulationStateStore } from '@/stores/simulationStateStore'
import { useWavefunctionSliceStore } from '@/stores/wavefunctionSliceStore'

import type { WebGPURenderContext, WebGPUSetupContext } from '../../core/types'
import { TDSEComputePass } from '../../passes/TDSEComputePass'
import type { SchroedingerWGSLShaderConfig } from '../../shaders/schroedinger/compose'
import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'
import {
  type AnimationState,
  type AppearanceStoreState,
  type ExtendedStoreSnapshot,
  getStoreSnapshot,
} from '../schrodingerRendererTypes'
import {
  applySharedPml,
  computeLatticeBoundingRadius,
  createDensityTextureBindings,
  handleSimulationStateIO,
} from './computeGridUtils'
import { buildBecConfig } from './TdseBecConfigBuilder'
import { getCurrentEigenstateEnergy, handleMeasurement } from './TdseBecMeasurement'
import {
  createBecSpectrumWorkerState,
  dispatchBecSpectrumComputation,
} from './TdseBecSpectrumWorker'
import { applyIslandOverlay } from './tdseIslandOverlay'
import type {
  ModeFrameContext,
  ModeSetupResult,
  QuantumModeStrategy,
  SchroedingerSnapshot,
} from './types'

/** Interval (in diagnostic cycles) between spectrum computations. */
const SPECTRUM_INTERVAL = 4

/** Interval (in frames) between entanglement readbacks. */
const ENTANGLEMENT_DECIMATION = 10

/** Strategy for TDSE and BEC dynamics modes using split-operator compute dispatch. */
export class TdseBecStrategy implements QuantumModeStrategy {
  readonly isComputeMode = true

  private tdsePass: TDSEComputePass | null = null
  /**
   * True once this strategy's compute pass has been moved to a successor via
   * `adoptComputeState`. The warm-swap flow (see `scenePassSetup.warmSwap...`)
   * leaves the predecessor renderer in the graph for a few frames while the
   * new pipeline finishes compiling asynchronously. During that window the
   * predecessor's `executeFrame` would otherwise hit `tdsePass=null`, warn, and
   * skip silently. This flag tells it to skip without warning and tells
   * `dispose` that the GPU resources have already been handed off.
   */
  private transferredOut = false
  /** Counter for throttling spectrum computation (every SPECTRUM_INTERVAL diag cycles). */
  private spectrumCounter = 0
  /** Frame counter for entanglement readback decimation. */
  private entanglementFrameCounter = 0
  /** Guard to prevent overlapping entanglement readbacks. */
  private entanglementInFlight = false
  /** Web Worker for entanglement computation (lazy-initialized). */
  private entanglementWorker: Worker | null = null
  /** Epoch counter for entanglement worker results ordering. */
  private entanglementEpoch = 0
  /** BEC incompressible spectrum worker state (worker, epoch, in-flight, disposed). */
  private readonly spectrumWorkerState = createBecSpectrumWorkerState()
  /** Set on dispose to prevent late async callbacks from resurrecting resources. */
  private disposed = false

  configureShader(_shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // Compute mode overrides applied by renderer constructor
  }

  setup(ctx: WebGPUSetupContext, config: SchrodingerRendererConfig): ModeSetupResult {
    // Dormancy guard: if this strategy was previously the source of a
    // warm-swap transfer (adoptComputeState set `transferredOut = true` and
    // nulled out `tdsePass`), we must not silently allocate a brand-new
    // compute pass here. The successor owns the adopted state; resurrecting
    // this instance would run a parallel integrator with a duplicate density
    // texture and every downstream consumer would race over which view is
    // live. Re-assert the dormant flag so `executeFrame` keeps its silent
    // skip, clear the warning latches so a future re-use starts fresh, and
    // return an empty bindings set — there is no texture view to hand to
    // the render graph because we relinquished it.
    if (this.transferredOut && !this.tdsePass) {
      this.warnedTdsePassNull = false
      this.warnedDensityNull = false
      logger.log('[TdseBecStrategy] setup skipped: strategy is transferred-out (dormant)')
      const emptyBindings = createDensityTextureBindings(ctx.device, null)
      return { initPromises: [], ...emptyBindings }
    }

    // Normal fresh-setup or resume-after-adoption path.
    this.transferredOut = false
    this.warnedTdsePassNull = false
    this.warnedDensityNull = false
    if (!this.tdsePass) {
      this.tdsePass = new TDSEComputePass(config.densityGridResolution)
      this.tdsePass.initializeDensityTexture(ctx.device)
    }
    logger.log(
      `[TdseBecStrategy] setup densityView=${this.tdsePass.getDensityTextureView()?.label ?? 'null'}`
    )

    const bindings = createDensityTextureBindings(
      ctx.device,
      this.tdsePass.getDensityTextureView() ?? null
    )
    return { initPromises: [], ...bindings }
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

  private warnedTdsePassNull = false
  private warnedDensityNull = false

  executeFrame(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    const tdsePass = this.tdsePass
    if (!tdsePass) {
      // Silent skip during the warm-swap window: adoptComputeState has moved
      // our compute pass to a successor strategy that's compiling its pipeline
      // asynchronously. The graph still calls us because this renderer hasn't
      // been swapped out yet — our objectBindGroup still references the (now
      // adopted) density texture, so the render-pass draw in the outer
      // renderer uses valid data. Returning here just skips the redundant
      // compute dispatch.
      if (this.transferredOut) return
      if (!this.warnedTdsePassNull) {
        logger.warn(`[TdseBecStrategy] executeFrame: tdsePass is NULL`)
        this.warnedTdsePassNull = true
      }
      return
    }

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
      const result = buildBecConfig(extended.schroedinger.bec, extended?.schroedinger)
      tdseConfig = result.config
      clearReset = extended?.clearBecNeedsReset
    }

    if (!tdseConfig) return

    const schroedinger = extended?.schroedinger

    // For TDSE mode, overlay the top-level autoScaleMaxGain (set by the Exposure slider)
    // onto the nested TdseConfig. BEC mode already maps this in buildBecConfig.
    if (!isBecMode && schroedinger?.autoScaleMaxGain !== undefined) {
      tdseConfig = { ...tdseConfig, autoScaleMaxGain: schroedinger.autoScaleMaxGain }
    }

    // quantumPotential computes Q = -½·∇²R/R treating the density grid's R
    // channel as √ρ_total. The TDSE/BEC write-grid shader only puts true
    // density in R when fieldView='density'; other views (phase, current,
    // superfluidVelocity, healing, potential) write the view's scalar instead,
    // so Q would be computed on the wrong field and produce a physically
    // meaningless (and visually empty) scene. Presets like BEC vortexDipole
    // default to fieldView='phase', so without this override a user picking
    // quantumPotential on the vortex-antivortex scenario would see nothing.
    // Override fieldView at frame time — mirrors the DiracStrategy guardrail
    // for the same algorithm.
    const appearance = getStoreSnapshot<AppearanceStoreState>(ctx, 'appearance')
    if (appearance?.colorAlgorithm === 'quantumPotential' && tdseConfig.fieldView !== 'density') {
      tdseConfig = { ...tdseConfig, fieldView: 'density' }
    }

    // Analog-Hawking island overlay: when the user has toggled the overlay
    // on AND the BEC is in blackHoleAnalog mode with a horizon AND the
    // page-curve store has accumulated an island radius > 0, forward the
    // island centroid (x₀ in world units) and radius into the TDSE uniforms
    // so the write-grid shader can paint the island voxels. When any of
    // those preconditions fails we pass through with the defaults and the
    // shader no-ops. Mirrors the hawkingVmax/hawkingSeed plumbing pattern.
    if (isBecMode && extended?.schroedinger?.bec) {
      tdseConfig = applyIslandOverlay(tdseConfig, extended.schroedinger.bec)
    }

    const tdseWithSharedPml = applySharedPml(tdseConfig, schroedinger)

    if (!tdsePass.getDensityTextureView()) {
      if (!this.warnedDensityNull) {
        logger.warn(`[TdseBecStrategy] executeFrame: densityTextureView is NULL`)
        this.warnedDensityNull = true
      }
    }

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

    // Coordinate entanglement diagnostics (TDSE mode only)
    if (!isBecMode && isPlaying) {
      this.maybeComputeEntanglement(ctx, tdsePass, tdseConfig)
    }

    // Simulation state save/load
    handleSimulationStateIO(ctx, tdsePass, ['tdseDynamics', 'becDynamics'])

    // Wavefunction slice capture
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

    // Eigenstate storage for Gram-Schmidt + scar analysis
    const simState = useSimulationStateStore.getState()
    if (simState.storeEigenstateRequested) {
      const energy = getCurrentEigenstateEnergy()
      const newCount = tdsePass.storeCurrentEigenstate(ctx.device, energy, tdseConfig)
      simState.clearStoreEigenstateRequest(
        newCount >= 0 ? newCount : tdsePass.getStoredEigenstateCount()
      )
      if (newCount >= 0) {
        useDiagnosticsStore.getState().pushEigenstate(energy, NaN)
      }
    }

    // C3: Born rule measurement
    handleMeasurement(ctx, tdsePass, tdseConfig)
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

    useDiagnosticsStore.getState().updateBec({
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
   * Reads back psi from GPU, then ships the data to a Web Worker for the
   * velocity-field + Helmholtz decomposition (previously run on the main thread,
   * where the 3× Float64 FFT + shell binning at 64³ could consume 5–30 ms and
   * jitter rendering for BEC turbulence presets).
   */
  private maybeComputeSpectrum(
    ctx: WebGPURenderContext,
    tdsePass: TDSEComputePass,
    extended: ExtendedStoreSnapshot | undefined
  ): void {
    const bec = extended?.schroedinger?.bec
    const g = bec?.interactionStrength ?? 0
    if (g <= 0 || !bec || this.spectrumWorkerState.inFlight) return

    this.spectrumCounter++
    if (this.spectrumCounter < SPECTRUM_INTERVAL) return
    this.spectrumCounter = 0
    this.spectrumWorkerState.inFlight = true

    const gridSize = bec.gridSize.slice(0, bec.latticeDim)
    const spacingArr = computeEffectiveSpacing(
      bec.gridSize as number[],
      bec.spacing as number[],
      bec.compactDims as boolean[] | undefined,
      bec.compactRadii as number[] | undefined,
      bec.latticeDim as number
    )
    const hbar = bec.hbar ?? 1.0
    const mass = bec.mass ?? 1.0
    const epoch = ++this.spectrumWorkerState.epoch

    void tdsePass.requestMeasurementReadback(ctx).then(
      (result) => {
        if (this.disposed || this.transferredOut) {
          this.spectrumWorkerState.inFlight = false
          return
        }
        if (!result) {
          this.spectrumWorkerState.inFlight = false
          return
        }
        dispatchBecSpectrumComputation(
          this.spectrumWorkerState,
          result,
          gridSize,
          spacingArr,
          hbar,
          mass,
          epoch
        )
      },
      () => {
        this.spectrumWorkerState.inFlight = false
      }
    )
  }

  /**
   * Trigger async coordinate entanglement computation at decimated intervals.
   * Reads back psi from GPU, ships to a Web Worker for CPU-side
   * reduced density matrix + eigendecomposition.
   */
  private maybeComputeEntanglement(
    ctx: WebGPURenderContext,
    tdsePass: TDSEComputePass,
    config: TdseConfig
  ): void {
    const entStore = useCoordinateEntanglementStore.getState()
    if (!entStore.enabled || this.entanglementInFlight) return

    this.entanglementFrameCounter++
    if (this.entanglementFrameCounter < ENTANGLEMENT_DECIMATION) return
    this.entanglementFrameCounter = 0
    this.entanglementInFlight = true

    const gridSize = config.gridSize.slice(0, config.latticeDim)
    const epoch = ++this.entanglementEpoch

    void tdsePass.requestMeasurementReadback(ctx).then(
      (result) => {
        // Guard against late callbacks after dispose() or warm-swap handoff.
        // Clearing `entanglementInFlight` here is safe because both lifecycle
        // exits guarantee no further dispatches will run through this instance.
        if (this.disposed || this.transferredOut) {
          this.entanglementInFlight = false
          return
        }

        if (!result) {
          this.entanglementInFlight = false
          return
        }

        try {
          // Lazy-initialize the worker
          if (!this.entanglementWorker) {
            this.entanglementWorker = new Worker(
              new URL('../../../../lib/physics/coordinateEntanglement.worker.ts', import.meta.url),
              { type: 'module' }
            )
            this.entanglementWorker.onmessage = (e: MessageEvent<EntanglementWorkerResponse>) => {
              this.entanglementInFlight = false
              if (e.data.type !== 'result') return
              // Discard stale results from previous epochs or after lifecycle exit.
              if (this.disposed || this.transferredOut || e.data.epoch !== this.entanglementEpoch)
                return
              useCoordinateEntanglementStore.getState().pushResult(e.data.result)
            }
            this.entanglementWorker.onerror = () => {
              this.entanglementInFlight = false
              logger.warn('[Entanglement] Worker error')
            }
          }

          const request: EntanglementWorkerRequest = {
            type: 'compute',
            epoch,
            psiRe: result.re,
            psiIm: result.im,
            gridSize,
            options: {
              computePairwiseMI: entStore.computePairwiseMI,
              computeBipartitions: entStore.computeBipartitions,
              computeWignerNegativity: entStore.computeWignerNegativity,
            },
          }

          // Transfer psi arrays to worker (zero-copy)
          this.entanglementWorker.postMessage(request, [result.re.buffer, result.im.buffer])
        } catch (err) {
          this.entanglementInFlight = false
          logger.warn('[Entanglement] Failed to dispatch to worker:', err)
        }
      },
      () => {
        this.entanglementInFlight = false
      }
    )
  }

  adoptComputeState(source: QuantumModeStrategy, nextConfig?: SchrodingerRendererConfig): boolean {
    if (!(source instanceof TdseBecStrategy) || !source.tdsePass) return false
    const nextN = nextConfig?.densityGridResolution
    if (nextN && source.tdsePass.densityGridSize !== nextN) return false
    this.tdsePass?.dispose()
    this.tdsePass = source.tdsePass
    source.tdsePass = null
    source.transferredOut = true
    this.transferredOut = false
    return true
  }

  getDensityTextureView(): GPUTextureView | null {
    return this.tdsePass?.getDensityTextureView() ?? null
  }

  dispose(): void {
    this.disposed = true
    this.tdsePass?.dispose()
    this.tdsePass = null
    this.entanglementWorker?.terminate()
    this.entanglementWorker = null
    this.spectrumWorkerState.disposed = true
    this.spectrumWorkerState.worker?.terminate()
    this.spectrumWorkerState.worker = null
  }
}
