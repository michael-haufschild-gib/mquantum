/**
 * Zeeman-Pauli Spinor Compute Pass
 *
 * Implements the non-relativistic two-component spinor solver using
 * split-operator Strang splitting with Stockham FFT on the GPU. This is the
 * Zeeman-only Pauli approximation: magnetic fields rotate spin through
 * σ·B_eff(x), but the kinetic term is scalar p²/(2m). It does not implement
 * gauge-covariant orbital coupling `(p - qA)^2/(2m)`.
 *
 * iℏ ∂ψ/∂t = [p²/(2m) + V(x) + σ·B_eff(x)] ψ
 *
 * Architecture:
 * - Single merged `spinor: array<vec2f>` storage buffer of length
 *   2·totalSites, where spinor[c·T + idx] = vec2f(re, im). One 8-byte
 *   vec2f load/store per site replaces two 4-byte scalar ops from the
 *   previous split-buffer layout.
 * - 2 independent FFTs per time step (reuses Stockham FFT from Dirac pass)
 * - Scalar kinetic phase exp(-iℏk²dt/(2m)) per component (reuses TDSE)
 * - Zeeman 2×2 SU(2) rotation in position space (closed-form)
 * - Spin-resolved density grid for dual-color volume rendering
 *
 * Strang splitting per substep:
 *   1. Half-step: scalar V + Zeeman σ·B rotation
 *   2. Pack + Forward FFT × 2 components
 *   3. Kinetic phase kick (scalar, identical for both)
 *   4. Inverse FFT × 2 components + Unpack
 *   5. Half-step: scalar V + Zeeman σ·B rotation
 */

import type { PauliConfig } from '@/lib/geometry/extended/types'
import { logger } from '@/lib/logger'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

import type { WebGPURenderContext } from '../core/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import { destroyGpuResources } from '../utils/gpuResourceHelpers'
import {
  computeStridesPadded,
  createDensityTexture,
  DENSITY_GRID_SIZE,
  DIAG_DECIMATION,
  GRID_WG,
  LINEAR_WG,
  MAX_DIM,
  pickSiteDispatch,
  sanitizeGridSizes,
} from './computePassUtils'
import { isFinitePositiveNorm } from './normalizationGuards'
import type { PauliBufferResult } from './PauliComputePassBuffers'
import {
  PAULI_UNIFORM_SIZE,
  rebuildPauliBuffers,
  writePauliUniforms,
} from './PauliComputePassBuffers'
import type { PauliBindGroupResult, PauliPipelineResult } from './PauliComputePassSetup'
import { buildPauliPipelines, rebuildPauliBindGroups } from './PauliComputePassSetup'
import {
  createPauliUniformStepStagingState,
  disposePauliUniformStepStaging,
  type PauliUniformStepStagingState,
  prePackPauliFrameSnapshots,
} from './PauliComputePassUniformStaging'
import { interleaveStateInjection, requestStateSave as genericStateSave } from './stateSave'

/** Number of f32 values in diagnostic result buffer:
 *  totalNorm, normUp, normDown, sigmaX, sigmaY, sigmaZ, maxDensity, pad */
const DIAG_RESULT_COUNT = 8

/**
 * Compute pass for Pauli equation split-operator dynamics.
 * Manages 2-component spinor buffers, FFT scratch, potential buffer,
 * and spin-resolved density grid output.
 */
export class PauliComputePass extends WebGPUBaseComputePass {
  // GPU buffers (created together by rebuildPauliBuffers)
  private buf: PauliBufferResult | null = null

  // Output texture (spin-resolved: R = |ψ↑|², B = |ψ↓|²)
  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null

  // Pipelines + bind group layouts (created together by buildPauliPipelines)
  private pl: PauliPipelineResult | null = null

  // Bind groups + renormalize uniform buffer (created by rebuildPauliBindGroups)
  private bg: PauliBindGroupResult | null = null

  /**
   * Generation counter for the pipeline build. Incremented every time a
   * config change kicks off a new `buildPauliPipelines` async run; the
   * resolution callback only commits its result if the gen hasn't moved
   * on. Prevents a stale, slow compile from clobbering a fresher one.
   */
  private pipelineGen = 0

  // Diagnostics state (not stored in buf — mutable per-frame)
  private diagFrameCounter = 0
  private diagMappingInFlight = false
  /** Monotonic generation counter — incremented on field init to invalidate stale readbacks. */
  private diagGeneration = 0

  // State
  private initialized = false
  private lastConfigHash = ''
  /** Cached V(x)-shaping parameters — dirty check for potentialPipeline dispatch. */
  private lastPotentialType: PauliConfig['potentialType'] | null = null
  private lastPotentialHarmonicOmega = NaN
  private lastPotentialWellDepth = NaN
  private lastPotentialWellWidth = NaN
  private lastPotentialMass = NaN
  private lastPotentialLatticeDim = 0
  private readonly lastPotentialGridSize = new Array<number>(MAX_DIM).fill(NaN)
  private readonly lastPotentialSpacing = new Array<number>(MAX_DIM).fill(NaN)
  private simTime = 0
  private maxDensity = 1.0
  private stepAccumulator = 0
  private uniformStepStaging: PauliUniformStepStagingState = createPauliUniformStepStagingState()
  /** Cached for async diagnostics readback — Larmor ω_L = 2·B₀/ℏ for H = σ·B (μ_B=1 units) */
  private cachedFieldStrength = 0
  private cachedHbar = 1
  /** Initial total norm from first diagnostics readback (for relative drift) */
  private initialNorm = 0

  // Save/load state
  private pendingInjection: { re: Float32Array; im: Float32Array } | null = null
  private saveMappingInFlight = false

  // Pre-allocated uniform views
  private readonly uniformData = new ArrayBuffer(PAULI_UNIFORM_SIZE)
  private readonly uniformU32 = new Uint32Array(this.uniformData)
  private readonly uniformF32 = new Float32Array(this.uniformData)
  private readonly strideScratch = new Array<number>(MAX_DIM).fill(0)

  private readonly densityGridSize: number

  constructor(densityGridSize: number = DENSITY_GRID_SIZE) {
    super({
      id: 'pauli-compute',
      inputs: [],
      outputs: [],
      isCompute: true,
      workgroupSize: [LINEAR_WG, 1, 1],
    })
    this.densityGridSize = densityGridSize
  }

  /** Pipeline creation is managed by buildPipelines() during executePauli */
  protected async createPipeline(): Promise<void> {
    /* no-op */
  }

  /** Returns the density texture for the renderer to sample */
  getDensityTexture(): GPUTexture | null {
    return this.densityTexture
  }

  /** Returns the density texture view for binding */
  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
  }

  /**
   * Set loaded spinor data for injection on next maybeInitialize.
   *
   * The caller supplies the spinor in the legacy split layout (re and im
   * Float32Arrays of length 2·totalSites, each containing the c=0 slice
   * followed by the c=1 slice). We interleave into the merged vec2f
   * storage on upload: `merged[2i] = re[i]`, `merged[2i + 1] = im[i]`.
   *
   * @param re - Real part of the spinor buffer (2 * totalSites floats)
   * @param im - Imaginary part of the spinor buffer (2 * totalSites floats)
   */
  setLoadedWavefunction(re: Float32Array, im: Float32Array): void {
    this.pendingInjection = { re, im }
  }

  /**
   * Initiate async save of the current spinor state.
   * Copies the merged spinor buffer to staging within the current command
   * encoder, then maps async after GPU submit. The `interleaved` save
   * layout deinterleaves the vec2f stream [re, im, re, im, ...] into the
   * separate re/im Float32Arrays that the serializer expects — this
   * matches the legacy split-buffer save output byte-for-byte because
   * the merged vec2f stream is exactly [re_c0s0, im_c0s0, re_c0s1, ...,
   * re_c1s0, im_c1s0, ...] while the old split layout stored
   * [re_c0s0, re_c0s1, ..., re_c1s0, ...] and [im_c0s0, ...] in parallel
   * arrays of length 2·T.
   *
   * @param ctx - Render context (device + encoder)
   */
  requestStateSave(ctx: WebGPURenderContext): boolean {
    if (!this.buf?.spinorBuffer || this.saveMappingInFlight) return false
    const totalSites = this.buf.totalSites ?? 0
    if (totalSites === 0) return false
    const elementCount = 2 * totalSites
    const byteSize = elementCount * 2 * Float32Array.BYTES_PER_ELEMENT

    this.saveMappingInFlight = true
    genericStateSave(ctx, {
      source: {
        layout: 'interleaved',
        buffer: this.buf.spinorBuffer,
        byteSize,
        elementCount,
      },
      totalSites: this.buf.totalSites,
      label: 'pauli',
      getMetadata: async () => {
        const pauliConfig = useExtendedObjectStore.getState().pauliSpinor
        return {
          quantumMode: 'pauliSpinor',
          config: { pauli: pauliConfig } as Record<string, unknown>,
          gridSize: pauliConfig?.gridSize?.slice(0, pauliConfig?.latticeDim ?? 3) ?? [64],
          componentCount: 2,
        }
      },
      onFinished: () => {
        this.saveMappingInFlight = false
      },
    })
    return true
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Compute a hash string for config change detection.
   *
   * Unlike the shared computeConfigHash (grid topology only), the Pauli hash
   * includes spacing because spacing changes affect FFT k-vectors and require
   * buffer rebuild. This parallels Dirac's approach of appending spinor size.
   */
  private computeConfigHash(config: PauliConfig): string {
    return `${config.latticeDim}|${config.gridSize.join(',')}|${config.spacing.join(',')}`
  }

  /**
   * Check V(x)-shaping parameters. A difference here triggers a single
   * pauliPotential dispatch before the next Strang loop so the substep kernel
   * reads a fresh potential[idx] without recomputing V per voxel.
   *
   * Pauli V is not time-dependent (no driven branch), so simTime is absent.
   * Grid topology and spacing are included because they define the physical
   * position (f32(coord) − N/2 + 0.5)·spacing used by every V formula.
   */
  private consumePauliPotentialDirty(config: PauliConfig): boolean {
    let dirty =
      this.lastPotentialType !== config.potentialType ||
      this.lastPotentialHarmonicOmega !== config.harmonicOmega ||
      this.lastPotentialWellDepth !== config.wellDepth ||
      this.lastPotentialWellWidth !== config.wellWidth ||
      this.lastPotentialMass !== config.mass ||
      this.lastPotentialLatticeDim !== config.latticeDim

    for (let d = 0; d < config.latticeDim; d++) {
      if (
        this.lastPotentialGridSize[d] !== config.gridSize[d] ||
        this.lastPotentialSpacing[d] !== config.spacing[d]
      ) {
        dirty = true
        break
      }
    }

    if (!dirty) return false

    this.lastPotentialType = config.potentialType
    this.lastPotentialHarmonicOmega = config.harmonicOmega
    this.lastPotentialWellDepth = config.wellDepth
    this.lastPotentialWellWidth = config.wellWidth
    this.lastPotentialMass = config.mass
    this.lastPotentialLatticeDim = config.latticeDim
    for (let d = 0; d < config.latticeDim; d++) {
      this.lastPotentialGridSize[d] = config.gridSize[d]!
      this.lastPotentialSpacing[d] = config.spacing[d]!
    }
    return true
  }

  private invalidatePauliPotential(): void {
    this.lastPotentialType = null
  }

  // ============================================================================
  // Buffer & Resource Rebuild (delegated to PauliComputePassBuffers)
  // ============================================================================

  /** Allocate GPU buffers for the spinor field, FFT scratch, and output texture */
  private rebuildBuffers(device: GPUDevice, config: PauliConfig): void {
    // Cancel any pending diagnostic mapAsync before destroying the staging buffer.
    // Bumping diagGeneration invalidates any readback callback whose captured
    // `staging` reference now points at a buffer slated for replacement.
    this.diagGeneration++
    if (this.diagMappingInFlight && this.buf?.diagStagingBuffer) {
      this.buf.diagStagingBuffer.unmap()
      this.diagMappingInFlight = false
    }

    if (!this.densityTexture) this.initializeDensityTexture(device)

    const oldBuf = this.buf
    this.buf = rebuildPauliBuffers(device, config, {
      spinorBuffer: oldBuf?.spinorBuffer ?? null,
      fftScratchA: oldBuf?.fftScratchA ?? null,
      uniformBuffer: oldBuf?.uniformBuffer ?? null,
      fftAxisUniformBuffers: oldBuf?.fftAxisUniformBuffers ?? null,
      fftTwiddleBuffer: oldBuf?.fftTwiddleBuffer ?? null,
      packUniformBuffer: oldBuf?.packUniformBuffer ?? null,
      packUniformBufferNoNorm: oldBuf?.packUniformBufferNoNorm ?? null,
      potentialBuffer: oldBuf?.potentialBuffer ?? null,
      diagUniformBuffer: oldBuf?.diagUniformBuffer ?? null,
      diagPartialBuffer: oldBuf?.diagPartialBuffer ?? null,
      diagResultBuffer: oldBuf?.diagResultBuffer ?? null,
      diagStagingBuffer: oldBuf?.diagStagingBuffer ?? null,
    })
    this.diagFrameCounter = 0
    this.diagMappingInFlight = false
    this.lastConfigHash = this.computeConfigHash(config)
    // Freshly-created potentialBuffer holds uninitialized memory — force the
    // next executePauli to fire the potential fill kernel before the Strang
    // loop reads from it (otherwise potentialHalf would see garbage).
    this.invalidatePauliPotential()
  }

  /** Create the 3D density texture for spin-resolved rendering */
  initializeDensityTexture(device: GPUDevice): void {
    this.densityTexture?.destroy()
    this.densityTexture = createDensityTexture(device, 'pauli', 0, this.densityGridSize)
    this.densityTextureView = this.densityTexture.createView({
      label: 'pauli-density-view',
      dimension: '3d',
    })
  }

  /** Get the configured density grid resolution. */
  getDensityGridSize(): number {
    return this.densityGridSize
  }

  // ============================================================================
  // Pipeline & Bind Group Rebuild (delegated to PauliComputePassSetup)
  // ============================================================================

  /** Called immediately after rebuildBuffers, so all buffer fields are non-null. */
  private rebuildBindGroups(device: GPUDevice, existingRenorm?: GPUBuffer | null): void {
    if (!this.pl || !this.buf || !this.densityTextureView) return
    this.bg = rebuildPauliBindGroups(
      device,
      this.pl,
      {
        uniformBuffer: this.buf.uniformBuffer,
        spinorBuffer: this.buf.spinorBuffer,
        fftScratchA: this.buf.fftScratchA,
        fftAxisUniformBuffers: this.buf.fftAxisUniformBuffers,
        fftTwiddleBuffer: this.buf.fftTwiddleBuffer,
        packUniformBuffer: this.buf.packUniformBuffer,
        packUniformBufferNoNorm: this.buf.packUniformBufferNoNorm,
        potentialBuffer: this.buf.potentialBuffer,
        densityTextureView: this.densityTextureView,
        diagUniformBuffer: this.buf.diagUniformBuffer,
        diagPartialBuffer: this.buf.diagPartialBuffer,
        diagResultBuffer: this.buf.diagResultBuffer,
        totalSites: this.buf.totalSites,
      },
      existingRenorm ?? this.bg?.renormalizeUniformBuffer ?? null
    )
  }

  // ============================================================================
  /** Initialize spinor state if not yet initialized or reset requested. */
  private maybeInitialize(ctx: WebGPURenderContext, config: PauliConfig): void {
    if (this.initialized && !config.needsReset) return
    if (!this.buf) return
    const { device } = ctx

    // Check for pending loaded wavefunction data — skip init shader and inject directly.
    // Interleave the incoming split (re, im) arrays of length 2·T into the
    // merged vec2f buffer: interleaved[2i] = re[i], interleaved[2i + 1] = im[i].
    // One writeBuffer call replaces the two that the split-buffer layout needed.
    // Injection only needs the spinor buffer; it can complete even while the
    // async pipeline build is still pending.
    if (this.pendingInjection) {
      const expected = 2 * this.buf.totalSites
      let interleaved: Float32Array<ArrayBuffer>
      try {
        interleaved = interleaveStateInjection(
          'Pauli',
          this.pendingInjection,
          expected,
          `${expected} (2·totalSites)`
        )
      } catch (err) {
        this.pendingInjection = null
        throw err
      }
      device.queue.writeBuffer(this.buf.spinorBuffer, 0, interleaved)
      this.pendingInjection = null
      logger.log(`[Pauli] Injected loaded wavefunction (${expected} elements)`)
    } else {
      // Init dispatch needs the compiled init pipelines + their bind groups.
      // While the async pipeline build is still pending, defer the init
      // kernel to a later frame so we don't permanently mark
      // `initialized = true` without ever running it.
      if (!this.pl || !this.bg) return
      const pass = ctx.beginComputePass({ label: 'pauli-init-pass' })
      const dispatch = pickSiteDispatch(config.latticeDim, this.buf.totalSites, config.gridSize)
      const pipeline = dispatch.use3D ? this.pl.init3DPipeline : this.pl.initPipeline
      if (dispatch.use3D) {
        this.dispatchCompute(pass, pipeline, [this.bg.spinorBG], dispatch.x, dispatch.y, dispatch.z)
      } else {
        this.dispatchCompute(pass, pipeline, [this.bg.spinorBG], dispatch.x)
      }
      pass.end()
    }
    this.maxDensity = 1.0
    this.simTime = 0
    this.stepAccumulator = 0
    this.initialNorm = 0
    this.initialized = true
    // Invalidate in-flight readbacks before resetting diagnostics store
    this.diagGeneration++
    useDiagnosticsStore.getState().resetPauli()
  }

  /** Upload uniform data to GPU */
  private updateUniforms(
    device: GPUDevice,
    config: PauliConfig,
    basisX?: Float32Array,
    basisY?: Float32Array,
    basisZ?: Float32Array,
    boundingRadius?: number
  ): void {
    if (!this.buf) return
    writePauliUniforms(
      device,
      this.buf.uniformBuffer,
      this.uniformData,
      this.uniformU32,
      this.uniformF32,
      {
        config,
        totalSites: this.buf.totalSites,
        simTime: this.simTime,
        maxDensity: this.maxDensity,
        strides: computeStridesPadded(config.gridSize, config.latticeDim, this.strideScratch),
        basisX,
        basisY,
        basisZ,
        boundingRadius,
      }
    )
  }

  // ============================================================================
  // FFT Dispatch (shared-memory variant — single dispatch per axis)
  // ============================================================================

  /**
   * Dispatch one shared-memory FFT axis inside an already-open compute pass.
   *
   * The shared-memory kernel performs all log2(N) butterfly stages for one
   * pencil inside a single workgroup using workgroup-local shared memory.
   * One workgroup is dispatched per pencil (`totalSites / axisDim`); the
   * caller has already set the pipeline on the encoder.
   *
   * @param passEncoder - Active compute pass encoder.
   * @param axisDim - Per-axis grid dimension (power of two, [8, 128]).
   * @param slot - Index into `bg.fftSharedMemBGs` for this (axis, direction).
   */
  private dispatchFFTAxisInPass(
    passEncoder: GPUComputePassEncoder,
    axisDim: number,
    slot: number
  ): void {
    if (!this.bg || !this.buf) return
    const bg = this.bg.fftSharedMemBGs[slot]
    if (!bg) return
    passEncoder.setBindGroup(0, bg)
    passEncoder.dispatchWorkgroups(this.buf.totalSites / axisDim)
  }

  // ============================================================================
  // Main Execution
  // ============================================================================

  /** Required by WebGPUBasePass — not used directly */
  execute(_ctx: WebGPURenderContext): void {
    // Use executePauli instead
  }

  /**
   * Execute the Pauli equation time stepping loop.
   * Called from the renderer each frame.
   */
  executePauli(
    ctx: WebGPURenderContext,
    rawConfig: PauliConfig,
    isPlaying: boolean,
    speed: number,
    basisX?: Float32Array,
    basisY?: Float32Array,
    basisZ?: Float32Array,
    boundingRadius?: number
  ): void {
    const config = sanitizeGridSizes(rawConfig)
    const { device } = ctx
    const configHash = this.computeConfigHash(config)

    // Rebuild if config changed.
    // Pipelines are compiled asynchronously (via createComputePipelineAsync
    // inside buildPauliPipelines) so the JS main thread keeps rendering
    // while WGSL→backend compilation runs on a worker. While the build is
    // outstanding, this.pl / this.bg are null and the executePauli early
    // return below skips the Strang loop. The first frame after the
    // promise resolves wires up bind groups and runs maybeInitialize.
    if (configHash !== this.lastConfigHash || !this.buf) {
      logger.log(`[Pauli-COMPUTE] rebuild: ${this.lastConfigHash} → ${configHash}`)
      this.rebuildBuffers(device, config)
      // Drop stale pipelines/bind groups until the new compile lands so
      // the next frame doesn't dispatch against an old layout that
      // doesn't match the rebuilt buffers.
      // Capture the renormalize buffer before nulling bg — rebuildBindGroups
      // reuses it instead of leaking a new allocation each rebuild.
      const oldRenorm = this.bg?.renormalizeUniformBuffer ?? null
      this.pl = null
      this.bg = null
      this.initialized = false
      this.simTime = 0
      const myGen = ++this.pipelineGen
      buildPauliPipelines(device)
        .then((result) => {
          // Discard if a newer rebuild has started while we were compiling.
          if (myGen !== this.pipelineGen) {
            oldRenorm?.destroy()
            return
          }
          // Buffer guard: dispose() bumps pipelineGen so this branch is
          // unreachable post-dispose, but make the contract explicit.
          if (!this.buf) {
            oldRenorm?.destroy()
            return
          }
          this.pl = result
          this.rebuildBindGroups(device, oldRenorm)
        })
        .catch((err: unknown) => {
          if (myGen !== this.pipelineGen) {
            oldRenorm?.destroy()
            return
          }
          logger.error('[Pauli-COMPUTE] pipeline build failed', err)
          // rebuildBuffers already advanced lastConfigHash; clear it so
          // executePauli retries on the next frame instead of being
          // wedged with pl/bg null.
          this.lastConfigHash = ''
        })
    }

    this.updateUniforms(device, config, basisX, basisY, basisZ, boundingRadius)
    this.maybeInitialize(ctx, config)

    if (!this.pl || !this.bg || !this.buf) return
    const linearWG = Math.ceil(this.buf.totalSites / LINEAR_WG)
    // 3D-vs-1D site dispatch picker for init/potential/potentialHalf/absorber.
    // Computed once per executePauli call so all site kernels in this frame
    // share the same shape decision.
    const siteDispatch = pickSiteDispatch(config.latticeDim, this.buf.totalSites, config.gridSize)
    const dispatchSite = (
      pass: GPUComputePassEncoder,
      pipeline1D: GPUComputePipeline,
      pipeline3D: GPUComputePipeline,
      bindGroups: GPUBindGroup[]
    ): void => {
      if (siteDispatch.use3D) {
        this.dispatchCompute(
          pass,
          pipeline3D,
          bindGroups,
          siteDispatch.x,
          siteDispatch.y,
          siteDispatch.z
        )
      } else {
        this.dispatchCompute(pass, pipeline1D, bindGroups, siteDispatch.x)
      }
    }

    // Refresh scalar potential V(x) only when its shaping parameters change.
    // Uniforms are written above, so the fill kernel reads the current
    // potentialType / harmonicOmega / wellDepth / wellWidth / mass values.
    if (this.consumePauliPotentialDirty(config)) {
      const p = ctx.beginComputePass({ label: 'pauli-potential-fill' })
      dispatchSite(p, this.pl.potentialPipeline, this.pl.potential3DPipeline, [this.bg.potentialBG])
      p.end()
    }

    // Time evolution (Strang splitting).
    //
    // PERF: every dispatch in a single Strang substep is encoded inside one
    // batched compute pass. Previously each substep opened ~80 separate
    // `MTLComputeCommandEncoder`s (V-half, pack/unpack/FFT-stage per
    // component per direction, kinetic, absorber) — each pass open/close
    // costs 5–20 µs CPU/driver overhead on Metal-backed WebGPU. Per-slot
    // FFT bind groups (`bg.fftSharedMemBGs`) plus the shared-memory FFT
    // kernel mean no per-axis `copyBufferToBuffer` is needed between FFT
    // axes, so the entire substep stays inside one pass. Implicit WAW/RAW
    // barriers between dispatches against overlapping storage buffers are
    // inserted by the driver automatically, so correctness is unchanged.
    if (isPlaying) {
      const scaledSteps = config.stepsPerFrame * speed
      this.stepAccumulator += scaledSteps
      const stepsThisFrame = Math.floor(this.stepAccumulator)
      this.stepAccumulator -= stepsThisFrame

      const fwdAxisCount = this.buf.fwdAxisCount
      const uniformStaging = prePackPauliFrameSnapshots({
        state: this.uniformStepStaging,
        device,
        config,
        totalSites: this.buf.totalSites,
        simTime: this.simTime,
        stepsThisFrame,
        maxDensity: this.maxDensity,
        uniformU32: this.uniformU32,
        uniformF32: this.uniformF32,
        uniformData: this.uniformData,
        basisX,
        basisY,
        basisZ,
        boundingRadius,
      })

      for (let step = 0; step < stepsThisFrame; step++) {
        if (uniformStaging) {
          ctx.encoder.copyBufferToBuffer(
            uniformStaging,
            step * PAULI_UNIFORM_SIZE,
            this.buf.uniformBuffer,
            0,
            PAULI_UNIFORM_SIZE
          )
        }
        const strangPass = ctx.beginComputePass({ label: `pauli-strang-${step}` })

        // 1. Half-step V + Zeeman rotation
        dispatchSite(strangPass, this.pl.potentialHalfPipeline, this.pl.potentialHalf3DPipeline, [
          this.bg.potentialHalfBG,
        ])

        // 2-3. Forward FFT for each spinor component (2 independent FFTs)
        for (let c = 0; c < 2; c++) {
          // Pack: spinor[c slice] → fftScratchA
          const packBG = this.bg.cachedPackBGs[c]
          if (packBG) {
            this.dispatchCompute(strangPass, this.pl.packPipeline, [packBG], linearWG)
          }
          // Forward FFT axes (shared-mem kernel, slots [0, fwdAxisCount))
          strangPass.setPipeline(this.pl.fftSharedMemPipeline)
          let fftSlot = 0
          for (let d = config.latticeDim - 1; d >= 0; d--) {
            this.dispatchFFTAxisInPass(strangPass, config.gridSize[d]!, fftSlot)
            fftSlot++
          }
          // Unpack (no normalization for forward FFT): fftScratchA → spinor[c slice]
          const unpackBG = this.bg.cachedUnpackBGsNoNorm[c]
          if (unpackBG) {
            this.dispatchCompute(strangPass, this.pl.unpackPipeline, [unpackBG], linearWG)
          }
        }

        // 4. Kinetic phase kick (scalar, applied to both components in-place).
        // Uses 3-D dispatch when latticeDim===3 to skip the per-thread
        // linearToND k-coord decode. Pipeline shape and dispatch shape are
        // paired by pickSiteDispatch + buildPauliPipelines.
        dispatchSite(strangPass, this.pl.kineticPipeline, this.pl.kinetic3DPipeline, [
          this.bg.spinorBG,
        ])

        // 5. Inverse FFT for each spinor component
        for (let c = 0; c < 2; c++) {
          const packBG = this.bg.cachedPackBGs[c]
          if (packBG) {
            this.dispatchCompute(strangPass, this.pl.packPipeline, [packBG], linearWG)
          }
          // Inverse FFT axes (slots [fwdAxisCount, fwdAxisCount * 2))
          strangPass.setPipeline(this.pl.fftSharedMemPipeline)
          let fftSlot = fwdAxisCount
          for (let d = config.latticeDim - 1; d >= 0; d--) {
            this.dispatchFFTAxisInPass(strangPass, config.gridSize[d]!, fftSlot)
            fftSlot++
          }
          // Unpack with 1/N normalization
          const unpackBG = this.bg.cachedUnpackBGs[c]
          if (unpackBG) {
            this.dispatchCompute(strangPass, this.pl.unpackPipeline, [unpackBG], linearWG)
          }
        }

        // 6. Second half-step V + Zeeman
        dispatchSite(strangPass, this.pl.potentialHalfPipeline, this.pl.potentialHalf3DPipeline, [
          this.bg.potentialHalfBG,
        ])

        // 7. Absorber (PML damping at boundaries) — inline in the same pass
        dispatchSite(strangPass, this.pl.absorberPipeline, this.pl.absorber3DPipeline, [
          this.bg.spinorBG,
        ])

        // 8. Periodic renormalization: counteract f32 norm drift on the
        //    last step of the frame. Skipped under PML — see
        //    TDSEComputePassEvolution for the long explanation. With
        //    absorberEnabled the user is watching physical wave-packet
        //    decay at boundaries, and the renorm pass would scale ψ back
        //    up to its initial norm and visually cancel every step's
        //    absorption.
        if (step === stepsThisFrame - 1 && !config.absorberEnabled) {
          this.dispatchCompute(
            strangPass,
            this.pl.diagReducePipeline,
            [this.bg.diagReduceBG],
            this.buf.diagNumWorkgroups
          )
          this.dispatchCompute(
            strangPass,
            this.pl.diagFinalizePipeline,
            [this.bg.diagFinalizeBG],
            1
          )
          const renormWG = Math.ceil((2 * this.buf.totalSites) / LINEAR_WG)
          this.dispatchCompute(
            strangPass,
            this.pl.renormalizePipeline,
            [this.bg.renormalizeBG],
            renormWG
          )
        }

        strangPass.end()
        this.simTime += config.dt
      }
      if (uniformStaging) {
        ctx.encoder.copyBufferToBuffer(
          uniformStaging,
          stepsThisFrame * PAULI_UNIFORM_SIZE,
          this.buf.uniformBuffer,
          0,
          PAULI_UNIFORM_SIZE
        )
      }
    }

    // Write density grid
    const gridWG = Math.ceil(this.densityGridSize / GRID_WG)
    const wgPass = ctx.beginComputePass({ label: 'pauli-write-grid-pass' })
    this.dispatchCompute(
      wgPass,
      this.pl.writeGridPipeline,
      [this.bg.writeGridBG],
      gridWG,
      gridWG,
      gridWG
    )
    wgPass.end()

    // Decimated diagnostics to keep maxDensity updated for display normalization
    this.diagFrameCounter++
    const interval = config.diagnosticsEnabled
      ? config.diagnosticsInterval || DIAG_DECIMATION
      : DIAG_DECIMATION
    if (this.diagFrameCounter >= interval) {
      this.diagFrameCounter = 0
      this.cachedFieldStrength = config.fieldStrength
      this.cachedHbar = config.hbar
      this.dispatchDiagnostics(ctx)
    }
  }

  // ============================================================================
  // Diagnostics
  // ============================================================================

  /** Dispatch GPU diagnostics reduction and readback */
  private dispatchDiagnostics(ctx: WebGPURenderContext): void {
    const { device, encoder } = ctx
    if (!this.pl || !this.bg || !this.buf) return

    const pass = ctx.beginComputePass({ label: 'pauli-diag-reduce' })
    this.dispatchCompute(
      pass,
      this.pl.diagReducePipeline,
      [this.bg.diagReduceBG],
      this.buf.diagNumWorkgroups
    )
    pass.end()

    const fPass = ctx.beginComputePass({ label: 'pauli-diag-finalize' })
    this.dispatchCompute(fPass, this.pl.diagFinalizePipeline, [this.bg.diagFinalizeBG], 1)
    fPass.end()

    if (!this.diagMappingInFlight) {
      encoder.copyBufferToBuffer(
        this.buf.diagResultBuffer,
        0,
        this.buf.diagStagingBuffer,
        0,
        DIAG_RESULT_COUNT * Float32Array.BYTES_PER_ELEMENT
      )
      this.diagMappingInFlight = true
      const capturedGen = this.diagGeneration

      // PERF: mapAsync waits for the GPU copy — skip onSubmittedWorkDone()
      // to avoid an extra GPU fence. Matches TDSE readback pattern.
      // Defer via queueMicrotask so the buffer isn't in "pending map" state
      // when queue.submit() fires later in the same synchronous block.
      // The captured `staging` reference is used throughout the callback —
      // `this.buf` may be replaced by `rebuildBuffers()` between scheduling
      // the microtask and mapAsync resolving, and `rebuildBuffers()` bumps
      // `diagGeneration` so the capturedGen guard invalidates this readback.
      const staging = this.buf.diagStagingBuffer
      queueMicrotask(() =>
        staging
          .mapAsync(GPUMapMode.READ)
          .then(() => {
            if (capturedGen !== this.diagGeneration || staging.mapState !== 'mapped') {
              try {
                staging.unmap()
              } catch {
                /* already unmapped */
              }
              this.diagMappingInFlight = false
              return
            }
            const data = new Float32Array(staging.getMappedRange())
            if (data.length >= DIAG_RESULT_COUNT) {
              const totalNorm = data[0]!
              const normUp = data[1]!
              const normDown = data[2]!
              const sigmaX = data[3]!
              const sigmaY = data[4]!
              const sigmaZ = data[5]!
              const rawMaxDensity = Math.max(0.001, data[6]!)
              const totalNormIsSafe = isFinitePositiveNorm(totalNorm)
              // Asymmetric maxDensity smoothing (matches TDSE/Dirac pattern):
              // snap up instantly (new features visible immediately),
              // EMA down with α=0.4 (fading features blend smoothly).
              if (rawMaxDensity > 0) {
                if (this.maxDensity <= 0.001 || rawMaxDensity >= this.maxDensity) {
                  this.maxDensity = rawMaxDensity
                } else {
                  this.maxDensity += 0.4 * (rawMaxDensity - this.maxDensity)
                }
              }

              const safeTotalNorm = totalNormIsSafe ? totalNorm : 1
              const spinUpFraction = normUp / safeTotalNorm
              const spinDownFraction = normDown / safeTotalNorm
              const spinExpectationZ = sigmaZ / safeTotalNorm
              const coherenceMagnitude = Math.sqrt(
                (sigmaX * sigmaX + sigmaY * sigmaY) / (safeTotalNorm * safeTotalNorm)
              )
              const safeHbar =
                Number.isFinite(this.cachedHbar) && Math.abs(this.cachedHbar) > 1e-9
                  ? this.cachedHbar
                  : 1.0
              const larmorFrequency = (2 * this.cachedFieldStrength) / safeHbar

              if (this.initialNorm === 0 && totalNormIsSafe) {
                this.initialNorm = totalNorm
                if (this.bg?.renormalizeUniformBuffer) {
                  const buf = new Float32Array([totalNorm])
                  device.queue.writeBuffer(this.bg.renormalizeUniformBuffer, 4, buf)
                }
              }
              const normDrift =
                isFinitePositiveNorm(this.initialNorm) && totalNormIsSafe
                  ? (totalNorm - this.initialNorm) / this.initialNorm
                  : 0

              useDiagnosticsStore.getState().updatePauli({
                totalNorm,
                normDrift,
                maxDensity: this.maxDensity,
                spinUpFraction,
                spinDownFraction,
                spinExpectationZ,
                coherenceMagnitude,
                larmorFrequency,
              })
            }

            staging.unmap()
            this.diagMappingInFlight = false
          })
          .catch(() => {
            this.diagMappingInFlight = false
          })
      )
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  dispose(): void {
    // Invalidate any in-flight async pipeline build so its `.then()`
    // handler no-ops instead of writing into destroyed state.
    this.pipelineGen++
    // Cancel any pending diagnostic mapAsync before destroying buffers
    if (this.diagMappingInFlight && this.buf?.diagStagingBuffer) {
      this.buf.diagStagingBuffer.unmap()
      this.diagMappingInFlight = false
    }
    if (this.buf) {
      destroyGpuResources(
        this.buf.spinorBuffer,
        this.buf.fftScratchA,
        this.buf.uniformBuffer,
        this.buf.fftTwiddleBuffer,
        this.buf.packUniformBuffer,
        this.buf.packUniformBufferNoNorm,
        this.buf.potentialBuffer,
        this.buf.diagUniformBuffer,
        this.buf.diagPartialBuffer,
        this.buf.diagResultBuffer,
        this.buf.diagStagingBuffer
      )
      for (const b of this.buf.fftAxisUniformBuffers) b.destroy()
    }
    destroyGpuResources(this.densityTexture, this.bg?.renormalizeUniformBuffer)
    disposePauliUniformStepStaging(this.uniformStepStaging)
    super.dispose()
  }
}
