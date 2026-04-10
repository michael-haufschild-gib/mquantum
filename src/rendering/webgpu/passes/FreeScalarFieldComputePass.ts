/**
 * Free Scalar Field Compute Pass
 *
 * Implements a real Klein-Gordon scalar field on a 1D-11D spatial lattice
 * with symplectic leapfrog time integration.
 *
 * Architecture:
 * - 3 compute pipelines: init, updatePi, updatePhi
 * - 1 write-to-grid pipeline: writes selected field view to 3D density texture
 * - Per-frame: stepsPerFrame leapfrog steps, then one grid write
 * - Output: rgba16float 3D texture compatible with existing raymarching pipeline
 *
 * N-D support: dense N^d storage with stride-based indexing. The writeGrid shader
 * uses basis-rotated slicing to project the N-D field into a 3D density texture.
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { logger } from '@/lib/logger'
import { sampleAdiabaticVacuum } from '@/lib/physics/cosmology/adiabaticVacuum'
// k-space FFT + display pipeline runs in a Web Worker (kSpaceWorker.ts)
import { sampleVacuumSpectrum } from '@/lib/physics/freeScalar/vacuumSpectrum'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import {
  createDensityTexture,
  DENSITY_GRID_SIZE,
  GRID_WG as GRID_WORKGROUP_SIZE,
  LINEAR_WG as LINEAR_WORKGROUP_SIZE,
} from './computePassUtils'
import type {
  FsfBindGroupResult,
  FsfPassHelpers,
  FsfPipelineResult,
} from './FreeScalarFieldComputePassSetup'
import { buildFsfPipelines, rebuildFsfBindGroups } from './FreeScalarFieldComputePassSetup'
import {
  computeFsfConfigHash,
  computeFsfCosmologyCoefs,
  computeFsfInitHash,
  computeFsfMaxPhiEstimate,
  estimateFsfMaxFieldValue,
  FSF_COSMO_COEFS_BYTE_OFFSET,
  FSF_COSMO_COEFS_BYTE_SIZE,
  FSF_COSMO_COEFS_F32_COUNT,
  FSF_DT_BYTE_OFFSET,
  FSF_UNIFORM_SIZE,
  writeFsfUniforms,
} from './FreeScalarFieldComputePassUniforms'
import { FsfKSpaceManager } from './FreeScalarFieldKSpace'
import { requestStateSave as genericStateSave } from './stateSave'

/**
 * Uniform layout offsets (re-exported from the uniforms module for in-file
 * locality). Single source of truth lives in
 * `FreeScalarFieldComputePassUniforms.ts` so the partial-write paths and the
 * full-write `writeFsfUniforms` cannot drift apart.
 */
const UNIFORM_SIZE = FSF_UNIFORM_SIZE
const DT_BYTE_OFFSET = FSF_DT_BYTE_OFFSET
const COSMO_COEFS_BYTE_OFFSET = FSF_COSMO_COEFS_BYTE_OFFSET
const COSMO_COEFS_BYTE_SIZE = FSF_COSMO_COEFS_BYTE_SIZE

/**
 * Numerical floor on `|η|` during cosmological evolution. The canonical δφ
 * integrator is CFL-stable on its own — `ω² = k² + m²·a²` is bounded at
 * finite `a` — but the discontinuous clamp of `simEta` to this floor
 * drives a non-adiabatic jump in the cosmology coefficients `(A, B, C)`
 * over a single outer leapfrog step. Near the floor, `a(η) ∝ 1/|η|` in
 * de Sitter so a step from `η = −0.005` to `η = 0` (clamped to `−floor`)
 * multiplies `a` by `1/(H·floor)/200 ≈ 5×` *per step*. The leapfrog
 * pumps mode energy violently during that non-adiabatic transition and
 * `π` overshoots to `≫ 10⁶×` its previous value before any sub-step can
 * absorb the change — eventually overflowing float32 and producing NaN.
 *
 * Pick the floor at `|η| = 0.01` — deep enough in the late-time regime
 * that every lattice mode is well super-horizon (`k_min·|η| = 2π/(N·Δ)·η
 * ≪ 1` for the 64³/Δ=0.1 defaults), so the physics is already frozen
 * and further evolution toward `η → 0⁻` would add nothing, while the
 * coefficient jump at the clamp stays modest enough for the adaptive
 * CFL sub-stepper to handle without pumping the mode oscillators into
 * overflow. From `η₀ = −10` this still gives 1000× scale-factor growth
 * — plenty of dynamic range for the visualization.
 *
 * See `scripts/playwright-output/fsf-desitter-autoscale-flash.json` for
 * the captured trace that drove the floor increase.
 */
const COSMOLOGY_ETA_FLOOR = 1e-2

/**
 * Leapfrog CFL safety ceiling for the adaptive sub-stepping loop. The
 * physical dispersion at the current `η` is `ω² = k_max² + m²·a²`; a full
 * `dt·ω` exceeding this threshold triggers sub-stepping of the pi/phi
 * updates. The theoretical leapfrog limit is `dt·ω < 2`, where the
 * amplification factors sit exactly on the complex unit circle — *marginally*
 * stable, not strictly stable. At that edge, float32 roundoff and the
 * discontinuous jump in the cosmology coefficients when `simEta` is
 * clamped to the ETA floor push individual cells into the overflow regime
 * before the transient dies out, eventually producing NaN via the
 * Laplacian stencil (see `scripts/playwright-output/fsf-desitter-
 * autoscale-flash.json` for the captured trace that led here).
 *
 * We pick `1.0`, giving the sub-stepper a factor-of-2 margin on `dt·ω`
 * and `h²ω² ≤ 1` so the leapfrog eigenvalues sit well inside the stable
 * disk. The extra sub-steps are ~2× more work only at the deepest
 * late-time regime; everywhere else `ω·dt ≪ 1` already and nothing
 * changes.
 */
const COSMOLOGY_CFL_SAFETY = 1.0

/**
 * Hard cap on the number of cosmology sub-steps per outer leapfrog step.
 * Beyond this the user has driven the simulation so deep toward the
 * singularity (massive de Sitter at tiny |η|, Kasner/ekpyrotic near the
 * Big Bang) that further sub-stepping would stall the renderer. When
 * hit, we clamp and emit a deduplicated warning — honest "the integrator
 * can't keep up" rather than a silent numerical blow-up.
 */
const COSMOLOGY_MAX_SUBSTEPS = 32

/**
 * Adiabatic sub-stepping ceiling. The leapfrog is CFL-stable as long as
 * `dt·ω < CFL_SAFETY`, but CFL alone does not guarantee that the slowly-
 * varying cosmological background stays *adiabatic* relative to the mode
 * oscillator — i.e. that the relative change in the zero-mode frequency
 * `ω₀ ≈ m·a` per sub-step satisfies `|Δω/ω| ≪ 1`. If it doesn't, the
 * leapfrog pumps the mode oscillator out of its instantaneous ground
 * state and the canonical amplitudes overshoot by orders of magnitude
 * (captured as the 92× energy jump at the floor crossing in
 * `scripts/playwright-output/fsf-desitter-autoscale-flash.json`).
 *
 * We require per sub-step `|Δω₀/ω_avg| < 0.1` — i.e. the scale factor
 * changes by no more than ~10% of its mean over one sub-step. Combined
 * with the CFL ceiling via `nSub = max(nSub_cfl, nSub_adiab)`, this
 * keeps the numerical integrator tracking the analytical mode functions
 * without excitations. Under Minkowski `a(η) ≡ 1` and the adiabatic
 * check returns 1, so nothing changes for the flat-background path.
 */
const COSMOLOGY_ADIABATIC_SAFETY = 0.1

/**
 * Pure, non-mutating projection of `simEta` after advancing by `dt`. Mirrors
 * the clamp/floor logic of `FreeScalarFieldComputePass.advanceSimEta`:
 * every proposal whose absolute value falls below `COSMOLOGY_ETA_FLOOR` —
 * including the `proposed === 0` and sign-flip cases — is snapped to
 * `±COSMOLOGY_ETA_FLOOR` with the original sign preserved.
 *
 * Exists so the CFL preview in the leapfrog loop can see the end-of-step
 * `simEta` *without* mutating the state. In de Sitter, `a(η) ∝ 1/|η|` grows
 * monotonically toward the singularity, so a CFL check evaluated only at
 * the start of the outer step misses the discontinuous jump to the floor
 * and the pi update at the end of the step runs above the leapfrog
 * stability limit. Projecting forward and computing CFL at both endpoints
 * fixes that; see `executeField` for the call site.
 *
 * The runtime instance method `advanceSimEta` delegates to this helper so
 * the clamp math lives in exactly one place.
 *
 * @param currentEta - Current conformal time (must be non-zero for cosmology)
 * @param dt - Leapfrog time step (positive)
 * @returns The projected `simEta` with the floor/sign clamp applied
 */
export function projectSimEta(currentEta: number, dt: number): number {
  const originalSign = currentEta < 0 ? -1 : 1
  // Move toward η = 0: opposite direction from the current branch's sign.
  const proposed = currentEta - originalSign * dt
  // Single check: floor OR sign flip (Math.sign(0) === 0 ≠ originalSign,
  // so the explicit `proposed === 0` clause is already covered).
  const crossedSingularity = Math.sign(proposed) !== originalSign
  if (crossedSingularity || Math.abs(proposed) < COSMOLOGY_ETA_FLOOR) {
    return originalSign * COSMOLOGY_ETA_FLOOR
  }
  return proposed
}

/**
 * Adiabatic-safety substep count for a single outer leapfrog step.
 *
 * Returns the minimum `nSub` such that the relative change in the
 * zero-mode frequency `ω₀ ≈ m·a` over a single sub-step stays below
 * `COSMOLOGY_ADIABATIC_SAFETY`. With `a² = aFull / aPotential` from
 * the cosmology coefficient ratio (by construction, aFull = a^n and
 * aPotential = a^(n-2), so their ratio is `a²` for any spatial
 * dimension), we compute `a_start` and `a_end` directly and use the
 * scalar fractional change `|a_end − a_start| / a_avg` — for
 * mass-dominated modes `ω₀ ∝ a`, so the fractional change in `ω₀`
 * equals the fractional change in `a`. For sub-horizon modes
 * `ω_k ≈ k_lat` doesn't depend on `a` at all, so this over-estimates
 * the adiabatic pressure — that's conservative (safer), never unsafe.
 *
 * Under Minkowski or the identity fallback, `a_start = a_end = 1` and
 * this returns 1 — no substepping pressure — so the flat-background
 * path is bit-identical to the previous behaviour.
 *
 * @param coefsStart - Cosmology coefficients at the start of the outer step
 * @param coefsEnd - Cosmology coefficients at the projected end of the outer step
 * @returns Integer sub-step count in `[1, COSMOLOGY_MAX_SUBSTEPS]`
 */
export function computeAdiabaticSubsteps(
  coefsStart: { aFull: number; aPotential: number },
  coefsEnd: { aFull: number; aPotential: number }
): number {
  const aSqStart = coefsStart.aPotential > 0 ? coefsStart.aFull / coefsStart.aPotential : 1
  const aSqEnd = coefsEnd.aPotential > 0 ? coefsEnd.aFull / coefsEnd.aPotential : 1
  const aStart = Math.sqrt(Math.max(aSqStart, 0))
  const aEnd = Math.sqrt(Math.max(aSqEnd, 0))
  const aAvg = 0.5 * (aStart + aEnd)
  if (!(aAvg > 0)) return 1
  const relativeChange = Math.abs(aEnd - aStart) / aAvg
  if (!(relativeChange > COSMOLOGY_ADIABATIC_SAFETY)) return 1
  const ideal = Math.ceil(relativeChange / COSMOLOGY_ADIABATIC_SAFETY)
  return ideal <= COSMOLOGY_MAX_SUBSTEPS ? ideal : COSMOLOGY_MAX_SUBSTEPS
}

// ───────────────────────────────────────────────────────────────────────────
// Debug trace (dev-only cosmology instrumentation)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Single cosmology snapshot captured by the debug ring buffer. Wire-compatible
 * with the playwright measurement spec — keep the shape flat and plain-f32
 * friendly so `page.evaluate` can read it without a deserialization layer.
 */
export interface FsfCosmoDebugSample {
  /** Frame ordinal since the last reset (monotonic, advances once per executeField). */
  frame: number
  /** `performance.now()` timestamp at the capture, ms since navigation. */
  t: number
  /** Sim conformal time `η` at the end of the frame's leapfrog loop. */
  simEta: number
  /** Scale factor `a(η)` reconstructed from aPotential and the latticeDim. */
  a: number
  /** Three cosmology coefs written to the uniform at the end of the frame. */
  aKinetic: number
  aPotential: number
  aFull: number
  /** Adaptive sub-step count chosen at the start of the frame (1 = no sub-stepping). */
  nSub: number
  /** Physical mass-term contribution `m²·a²` used for the CFL calculation. */
  mSqAsq: number
  /**
   * Max frame energy read from the diagnostics store at the capture point.
   * `NaN` if no diagnostics snapshot has landed yet (async readback pipeline).
   */
  diagTotalEnergy: number
  diagMaxPhi: number
  diagMaxPi: number
}

/**
 * Global ring buffer exposed on `window` when cosmology is active. The
 * playwright measurement spec polls this via `page.evaluate` to observe
 * the integrator without the async diagnostics readback latency masking
 * short-lived transients.
 *
 * Capacity is capped so long runs don't accumulate unbounded memory; the
 * buffer wraps around after `FSF_COSMO_DEBUG_CAPACITY` samples and exposes
 * `head` so the consumer can reconstruct the temporal order.
 */
export interface FsfCosmoDebugBuffer {
  samples: FsfCosmoDebugSample[]
  capacity: number
  head: number // index of next write — the oldest sample is at (head) mod capacity
  enabled: boolean
}

const FSF_COSMO_DEBUG_CAPACITY = 2048

/**
 * Lazily-initialized shared debug buffer. Single instance per page — we
 * currently have only one FSF compute pass per app. The `enabled` flag is
 * toggled by the playwright spec before kicking off the measurement
 * (`window.__fsfCosmoDebug.enabled = true`) so normal runs pay nothing.
 */
function getOrCreateFsfCosmoDebugBuffer(): FsfCosmoDebugBuffer | null {
  if (typeof globalThis === 'undefined') return null
  const g = globalThis as unknown as { __fsfCosmoDebug?: FsfCosmoDebugBuffer }
  if (!g.__fsfCosmoDebug) {
    g.__fsfCosmoDebug = {
      samples: [],
      capacity: FSF_COSMO_DEBUG_CAPACITY,
      head: 0,
      enabled: false,
    }
  }
  return g.__fsfCosmoDebug
}

/**
 * Compute pass for free scalar field simulation on a lattice.
 * Manages phi/pi storage buffers, leapfrog integration, and density grid output.
 */
export class FreeScalarFieldComputePass extends WebGPUBaseComputePass {
  // GPU resources
  private phiBuffer: GPUBuffer | null = null
  private piBuffer: GPUBuffer | null = null
  private uniformBuffer: GPUBuffer | null = null
  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null
  private analysisTexture: GPUTexture | null = null
  private analysisTextureView: GPUTextureView | null = null

  // Pipeline + bind group bundles (created by setup functions)
  private pl: FsfPipelineResult | null = null
  private bg: FsfBindGroupResult | null = null

  /** Helper callbacks bridging base-class protected methods to standalone setup functions. */
  private readonly setupHelpers: FsfPassHelpers = {
    createShaderModule: (d, code, label) => this.createShaderModule(d, code, label),
    createComputePipeline: (d, sm, bgls, label) => this.createComputePipeline(d, sm, bgls, label),
  }

  // State tracking
  private initialized = false
  private stepAccumulator = 0
  private lastConfigHash = ''
  /**
   * Monotonic frame counter for the debug trace ring buffer. Only advanced
   * when `cosmology.enabled` is true — we don't care about the Minkowski
   * path from a debugging standpoint.
   */
  private debugFrameIndex = 0
  /**
   * Last adaptive sub-step count chosen by the leapfrog loop. Captured
   * into each debug sample so the playwright spec can correlate CFL
   * pressure with field statistics.
   */
  private lastDebugNSub = 1
  /**
   * Last `computeFsfInitHash(config)` value. `null` until the first call to
   * `maybeRebuild` so the bootstrap path can distinguish "no prior init
   * state" from "matches the empty hash". The previous form used the empty
   * string as a sentinel, which would have collided with a legitimately
   * empty hash and silently re-initialized on every frame.
   */
  private lastInitHash: string | null = null
  private lastAutoScale = true
  private lastAnalysisMode = 0
  private totalSites = 0
  private maxFieldValue = 1.0
  private maxPhiEstimate = 1.0
  private pendingStagingBuffers: GPUBuffer[] = []

  /**
   * Current simulation conformal time `η`. Only meaningful when
   * `config.cosmology.enabled` is true. Advances by `dt·stepsPerFrame` per
   * playing frame, starting from `config.cosmology.eta0` on reset.
   */
  private simEta = 0

  // Save/load state
  private pendingInjection: { re: Float32Array; im: Float32Array } | null = null
  private saveMappingInFlight = false
  /**
   * Optional `simEta` provided by a load-from-file operation. When non-null,
   * it overrides `config.cosmology.eta0` as the starting time for the
   * resumed simulation so the cosmological clock resumes where the user
   * saved it.
   */
  private pendingLoadedSimEta: number | null = null

  // Pre-allocated uniform data (reused each frame to avoid GC pressure)
  private readonly uniformData = new ArrayBuffer(UNIFORM_SIZE)
  private readonly uniformU32 = new Uint32Array(this.uniformData)

  /**
   * Pre-allocated scratch for the per-leapfrog-step partial uniform upload
   * of the three cosmology coefficients `(aKinetic, aPotential, aFull)`.
   * Reused across every substep to avoid GC pressure — a bare
   * `new Float32Array([...])` per call would allocate up to
   * `stepsPerFrame · substepCap` ArrayBuffers per frame under adaptive
   * CFL sub-stepping.
   */
  private readonly cosmoCoefsScratch = new Float32Array(FSF_COSMO_COEFS_F32_COUNT)

  /**
   * Dedup set for the "sub-step cap reached" warning so the adaptive-CFL
   * failure log fires once per session instead of spamming at 60fps.
   */
  private readonly cflCapWarnedKeys = new Set<string>()

  // K-space and diagnostics readback (delegated to FsfKSpaceManager)
  private readonly kSpace = new FsfKSpaceManager()

  constructor() {
    super({
      id: 'free-scalar-field-compute',
      inputs: [],
      outputs: [],
      isCompute: true,
      workgroupSize: [LINEAR_WORKGROUP_SIZE, 1, 1],
    })
  }

  /**
   * Eagerly create the 3D density texture so it's available for bind group
   * creation in the renderer pipeline. Must be called before the renderer
   * creates its object bind group (which references this texture at binding 4/5).
   * @param device - GPU device
   */
  initializeDensityTexture(device: GPUDevice): void {
    if (this.densityTexture) return

    this.densityTexture = createDensityTexture(device, 'free-scalar', GPUTextureUsage.COPY_DST)

    this.densityTextureView = this.densityTexture.createView({
      label: 'free-scalar-density-view',
      dimension: '3d',
    })

    this.analysisTexture = device.createTexture({
      label: 'free-scalar-analysis-grid',
      size: {
        width: DENSITY_GRID_SIZE,
        height: DENSITY_GRID_SIZE,
        depthOrArrayLayers: DENSITY_GRID_SIZE,
      },
      format: 'rgba16float',
      dimension: '3d',
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST,
    })

    this.analysisTextureView = this.analysisTexture.createView({
      label: 'free-scalar-analysis-view',
      dimension: '3d',
    })
  }

  /** Get the density texture view for binding into the raymarching pipeline. */
  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
  }

  /** Get the analysis texture view for binding into the raymarching pipeline. */
  getAnalysisTextureView(): GPUTextureView | null {
    return this.analysisTextureView
  }

  /** Current config hash for diagnostic logging. */
  getConfigHash(): string {
    return this.lastConfigHash
  }

  /** Current maxFieldValue used for normalization. */
  getMaxFieldValue(): number {
    return this.maxFieldValue
  }

  /** Get the density texture for direct access. */
  getDensityTexture(): GPUTexture | null {
    return this.densityTexture
  }

  /**
   * Set loaded field data for injection on next initialization.
   * For FSF, "re" maps to phi (field) and "im" maps to pi (conjugate momentum).
   *
   * @param re - phi buffer data (totalSites floats)
   * @param im - pi buffer data (totalSites floats)
   */
  setLoadedWavefunction(re: Float32Array, im: Float32Array): void {
    this.pendingInjection = { re, im }
  }

  /**
   * Set loaded cosmological sim time from a save file. Consumed once on the
   * next reinitialization — after which `config.cosmology.eta0` is again the
   * source of truth for subsequent resets.
   *
   * @param eta - Saved `simEta` to restore
   */
  setLoadedRuntimeSimEta(eta: number): void {
    if (!Number.isFinite(eta) || eta === 0) return
    this.pendingLoadedSimEta = eta
  }

  /**
   * Initiate async save of the current field state.
   * Copies phi/pi buffers to staging within the current command encoder,
   * then maps async after GPU submit.
   *
   * @param ctx - Render context (device + encoder)
   */
  requestStateSave(ctx: WebGPURenderContext): void {
    if (!this.phiBuffer || !this.piBuffer || this.saveMappingInFlight) return
    const byteSize = this.totalSites * 4

    this.saveMappingInFlight = true
    // Capture simEta synchronously at the save-request site so it lines up
    // with the phi/pi buffers being copied on the same command encoder.
    // (The async getMetadata resolves later, by which time simEta may have
    // advanced by a few frames — use this closure value, not a read.)
    const simEtaAtSave = this.simEta
    genericStateSave(ctx, {
      source: { layout: 'separate', reBuffer: this.phiBuffer, imBuffer: this.piBuffer, byteSize },
      totalSites: this.totalSites,
      label: 'fsf',
      getMetadata: async () => {
        const fsfConfig = useExtendedObjectStore.getState().schroedinger.freeScalar
        return {
          quantumMode: 'freeScalarField',
          config: {
            quantumMode: 'freeScalarField',
            freeScalar: fsfConfig,
            _runtimeMeta: { simEta: simEtaAtSave },
          } as Record<string, unknown>,
          gridSize: fsfConfig.gridSize?.slice(0, fsfConfig.latticeDim ?? 3) ?? [64],
          componentCount: 1,
        }
      },
      onFinished: () => {
        this.saveMappingInFlight = false
      },
    })
  }

  /**
   * Rebuild phi/pi storage buffers and uniform buffer when grid size changes.
   * The density texture is NOT recreated here — it has a fixed size (DENSITY_GRID_SIZE³)
   * and persists across grid size changes to avoid invalidating the renderer's bind group.
   */
  private rebuildFieldBuffers(device: GPUDevice, config: FreeScalarConfig): void {
    // Destroy old k-space staging buffers and invalidate in-flight jobs
    this.kSpace.destroyBuffers()

    // Destroy old field buffers
    this.phiBuffer?.destroy()
    this.piBuffer?.destroy()
    this.uniformBuffer?.destroy()

    // Compute total sites as product of all active dimensions
    this.totalSites = 1
    for (let d = 0; d < config.latticeDim; d++) {
      this.totalSites *= config.gridSize[d]!
    }
    const bufferSize = this.totalSites * 4 // f32 per site

    // Create phi and pi storage buffers (COPY_SRC needed for k-space readback)
    this.phiBuffer = device.createBuffer({
      label: 'free-scalar-phi',
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    })

    this.piBuffer = device.createBuffer({
      label: 'free-scalar-pi',
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    })

    // Create k-space and diagnostics staging buffers
    this.kSpace.createBuffers(device, bufferSize)

    // Create uniform buffer
    this.uniformBuffer = this.createUniformBuffer(device, UNIFORM_SIZE, 'free-scalar-uniforms')

    // Ensure density texture exists (creates if not yet initialized)
    this.initializeDensityTexture(device)

    this.lastConfigHash = computeFsfConfigHash(config)
  }

  protected async createPipeline(_ctx: WebGPUSetupContext): Promise<void> {
    // Resources will be created on first execute when config is available
  }

  private buildPipelines(device: GPUDevice): void {
    this.pl = buildFsfPipelines(device, this.setupHelpers)
  }

  private rebuildBindGroups(device: GPUDevice): void {
    if (
      !this.pl ||
      !this.uniformBuffer ||
      !this.phiBuffer ||
      !this.piBuffer ||
      !this.densityTextureView ||
      !this.analysisTextureView
    )
      return

    this.bg = rebuildFsfBindGroups(device, this.pl, {
      uniformBuffer: this.uniformBuffer,
      phiBuffer: this.phiBuffer,
      piBuffer: this.piBuffer,
      densityTextureView: this.densityTextureView,
      analysisTextureView: this.analysisTextureView,
    })
  }

  /** Check if config changed and rebuild buffers/pipelines/bind groups as needed. */
  private maybeRebuild(device: GPUDevice, config: FreeScalarConfig): void {
    const configHash = computeFsfConfigHash(config)
    if (configHash !== this.lastConfigHash || !this.phiBuffer) {
      logger.log(
        `[FSF-COMPUTE] rebuild: ${this.lastConfigHash} → ${configHash}` +
          ` (latticeDim=${config.latticeDim}, grid=${config.gridSize}, needsReset=${config.needsReset})`
      )
      this.rebuildFieldBuffers(device, config)
      this.buildPipelines(device)
      this.rebuildBindGroups(device)
      this.initialized = false
    }
    const initHash = computeFsfInitHash(config)
    // Skip the dirty-flag flip on the bootstrap call (`lastInitHash === null`)
    // — the rebuild branch above handles fresh-buffer initialization. After
    // bootstrap, any change to the init hash forces a re-init so the new
    // mass / mode / seed lands in the field buffers next frame.
    if (this.lastInitHash !== null && initHash !== this.lastInitHash) {
      this.initialized = false
    }
    this.lastInitHash = initHash
  }

  /** Upload pending k-space texture data from the async worker. */
  private flushKSpaceData(device: GPUDevice): void {
    const pending = this.kSpace.takePendingData()
    if (!pending || !this.densityTexture || !this.analysisTexture) return
    const { density, analysis } = pending
    const gs = Math.round(Math.cbrt(density.length / 4))
    const layout = { bytesPerRow: gs * 8, rowsPerImage: gs }
    const size = { width: gs, height: gs, depthOrArrayLayers: gs }
    device.queue.writeTexture(
      { texture: this.densityTexture },
      density.buffer,
      { offset: density.byteOffset, ...layout },
      size
    )
    device.queue.writeTexture(
      { texture: this.analysisTexture },
      analysis.buffer,
      { offset: analysis.byteOffset, ...layout },
      size
    )
  }

  /** Initialize field state and perform leapfrog kickstart. */
  private initializeField(ctx: WebGPURenderContext, config: FreeScalarConfig): void {
    const { device, encoder } = ctx

    // When a save is resumed the restored phi/pi buffers are already on the
    // leapfrog half-offset grid (pi is dt/2 ahead of phi, as it was at save
    // time). Running the usual dt/2 kickstart afterwards would double-advance
    // pi to a full step ahead and desync the integrator on frame 1. Track
    // whether init consumed an injection so the kickstart block below can be
    // skipped in that one case only.
    let injectedFromSave = false

    // Check for pending loaded wavefunction data — skip init and inject directly
    if (this.pendingInjection && this.phiBuffer && this.piBuffer) {
      const { re, im } = this.pendingInjection
      const elementCount = Math.min(re.length, this.totalSites)
      const reData = re.slice(0, elementCount)
      const imData = im.slice(0, elementCount)
      device.queue.writeBuffer(this.phiBuffer, 0, reData)
      device.queue.writeBuffer(this.piBuffer, 0, imData)
      this.pendingInjection = null
      injectedFromSave = true
      logger.log(`[FSF] Injected loaded field state (${elementCount} sites)`)
    } else if (config.initialCondition === 'vacuumNoise') {
      // When cosmology is active, sample the Bunch-Davies adiabatic vacuum
      // at eta0 using the Mukhanov-Sasaki effective mass. Otherwise use the
      // ordinary Minkowski vacuum sampler. Both paths return (phi, pi) in
      // the same shape, so the downstream GPU upload is unchanged.
      const { phi, pi } = config.cosmology.enabled
        ? sampleAdiabaticVacuum(
            config,
            {
              preset: config.cosmology.preset,
              spacetimeDim: config.latticeDim + 1,
              steepness: config.cosmology.steepness,
              hubble: config.cosmology.hubble,
            },
            config.cosmology.eta0,
            config.vacuumSeed
          )
        : sampleVacuumSpectrum(config, config.vacuumSeed, 'kgFloor')
      device.queue.writeBuffer(this.phiBuffer!, 0, phi as Float32Array<ArrayBuffer>)
      device.queue.writeBuffer(this.piBuffer!, 0, pi as Float32Array<ArrayBuffer>)
    } else if (this.pl && this.bg) {
      const pass = ctx.beginComputePass({ label: 'free-scalar-init-pass' })
      this.dispatchCompute(
        pass,
        this.pl.initPipeline,
        [this.bg.initBG],
        Math.ceil(this.totalSites / LINEAR_WORKGROUP_SIZE)
      )
      pass.end()
    }

    // Leapfrog half-step kickstart: advance pi from t=0 to t=dt/2.
    // Skipped when we injected a saved state — the saved pi is already on
    // the half-offset grid, and a second kick would full-step it ahead of phi.
    if (!injectedFromSave && this.pl && this.bg && this.uniformBuffer) {
      const halfDtStaging = device.createBuffer({
        label: 'free-scalar-half-dt-staging',
        size: 4,
        usage: GPUBufferUsage.COPY_SRC,
        mappedAtCreation: true,
      })
      new Float32Array(halfDtStaging.getMappedRange()).set([config.dt * 0.5])
      halfDtStaging.unmap()
      encoder.copyBufferToBuffer(halfDtStaging, 0, this.uniformBuffer, DT_BYTE_OFFSET, 4)

      const kickPass = ctx.beginComputePass({ label: 'free-scalar-leapfrog-kickstart' })
      this.dispatchCompute(
        kickPass,
        this.pl.updatePiPipeline,
        [this.bg.updatePiBG],
        Math.ceil(this.totalSites / LINEAR_WORKGROUP_SIZE)
      )
      kickPass.end()

      const fullDtStaging = device.createBuffer({
        label: 'free-scalar-full-dt-staging',
        size: 4,
        usage: GPUBufferUsage.COPY_SRC,
        mappedAtCreation: true,
      })
      new Float32Array(fullDtStaging.getMappedRange()).set([config.dt])
      fullDtStaging.unmap()
      encoder.copyBufferToBuffer(fullDtStaging, 0, this.uniformBuffer, DT_BYTE_OFFSET, 4)
      this.pendingStagingBuffers.push(halfDtStaging, fullDtStaging)
    }

    this.initialized = true
    this.stepAccumulator = 0
    // Reset the debug trace counter so each reset starts from frame 0.
    // Also clear the shared ring buffer so the playwright spec sees only
    // data from the post-reset evolution.
    this.debugFrameIndex = 0
    this.lastDebugNSub = 1
    if (config.cosmology.enabled) {
      const debugBuf = getOrCreateFsfCosmoDebugBuffer()
      if (debugBuf) {
        debugBuf.samples.length = 0
        debugBuf.head = 0
      }
    }
    // Invalidate in-flight async readbacks BEFORE resetting the diagnostics store.
    // Without this, a stale readback from the old field can resolve between frames,
    // pass the epoch check, and set initialEnergy from old data — corrupting energyDrift.
    this.kSpace.invalidateReadbacks()
    useDiagnosticsStore.getState().resetFsf()
  }

  /**
   * Write the uniform buffer with current config values.
   * Delegates to the standalone writeFsfUniforms function.
   *
   * The current `simEta` is always forwarded — `computeMEffSq` collapses
   * to `mass²` when cosmology is disabled, so a single call site covers
   * both branches without a conditional. When cosmology is enabled, the
   * shader sees the time-evolving Mukhanov-Sasaki effective mass.
   */
  updateUniforms(
    device: GPUDevice,
    config: FreeScalarConfig,
    basisX?: Float32Array,
    basisY?: Float32Array,
    basisZ?: Float32Array,
    boundingRadius?: number,
    colorAlgorithm?: number
  ): void {
    if (!this.uniformBuffer) return

    this.maxFieldValue = estimateFsfMaxFieldValue(config, this.maxPhiEstimate)
    writeFsfUniforms(device, this.uniformBuffer, this.uniformData, {
      config,
      totalSites: this.totalSites,
      maxFieldValue: this.maxFieldValue,
      basisX,
      basisY,
      basisZ,
      boundingRadius,
      colorAlgorithm,
      simEta: this.simEta,
    })
  }

  /** Current simulation conformal time η — exposed for analysis readouts. */
  getSimEta(): number {
    return this.simEta
  }

  /**
   * Overwrite the contiguous 12-byte cosmology coefficients slot
   * `(aKinetic, aPotential, aFull)` in the uniform buffer, avoiding the
   * full 528-byte re-upload that `writeFsfUniforms` performs. Called from
   * the leapfrog substep loop when cosmology is active so every
   * drift + kick pair consumes fresh coefficients evaluated at the current
   * `simEta`.
   *
   * Allocates nothing per call — the values are staged through the
   * pre-allocated `cosmoCoefsScratch` buffer.
   *
   * @param device - GPU device
   * @param aKinetic - a^(−(n−2)) at current η
   * @param aPotential - a^(n−2) at current η
   * @param aFull - a^n at current η
   */
  private writeCosmologyCoefsSlot(
    device: GPUDevice,
    aKinetic: number,
    aPotential: number,
    aFull: number
  ): void {
    if (!this.uniformBuffer) return
    this.cosmoCoefsScratch[0] = aKinetic
    this.cosmoCoefsScratch[1] = aPotential
    this.cosmoCoefsScratch[2] = aFull
    device.queue.writeBuffer(
      this.uniformBuffer,
      COSMO_COEFS_BYTE_OFFSET,
      this.cosmoCoefsScratch.buffer,
      this.cosmoCoefsScratch.byteOffset,
      COSMO_COEFS_BYTE_SIZE
    )
  }

  /**
   * Adaptive CFL sub-step count for the canonical δφ leapfrog. The
   * physical dispersion `ω² = k_max² + m²·a²` is bounded as long as `a`
   * is bounded, but massive modes in de Sitter (or any late-time limit
   * where `a → ∞`) drive `m·a·dt` above the leapfrog stability ceiling.
   * When that happens we subdivide the outer step and take several
   * smaller leapfrog sub-steps with frozen coefs, preserving second-order
   * accuracy within the sub-step window.
   *
   * Uses the maximum over active dimensions of `k_max_d = π/spacing[d]`
   * (Nyquist) as the effective cutoff — close enough to the discrete
   * Laplacian spectrum that the safety factor absorbs the difference.
   *
   * @param config - Free scalar field configuration
   * @param aFull - a^n at the current η (source of the time-varying mass term)
   * @param aPotential - a^(n−2) at the current η
   * @returns Integer sub-step count in `[1, COSMOLOGY_MAX_SUBSTEPS]`
   */
  private computeAdaptiveSubsteps(
    config: FreeScalarConfig,
    aFull: number,
    aPotential: number
  ): number {
    // Physical dispersion uses m²·a² = m²·(aFull/aPotential).
    const aSq = aPotential > 0 ? aFull / aPotential : 1
    const massSq = config.mass * config.mass * aSq

    let kMaxSq = 0
    for (let d = 0; d < config.latticeDim; d++) {
      const spacing = config.spacing[d]!
      if (!(spacing > 0) || config.gridSize[d]! <= 1) continue
      // Nyquist: k_max_d = π/a_d, contributing (π/a)² per dimension to k².
      const kmax = Math.PI / spacing
      kMaxSq += kmax * kmax
    }

    const omega = Math.sqrt(Math.max(kMaxSq + massSq, 0))
    const cflRatio = config.dt * omega
    if (!(cflRatio > COSMOLOGY_CFL_SAFETY)) return 1

    const ideal = Math.ceil(cflRatio / COSMOLOGY_CFL_SAFETY)
    if (ideal <= COSMOLOGY_MAX_SUBSTEPS) return ideal

    // Cap reached: emit a dedupe-by-preset warning so the user learns
    // once that the integrator is saturated.
    const cosmo = config.cosmology
    const key = `${cosmo.preset}|d=${config.latticeDim}|m=${config.mass}|dt=${config.dt}`
    if (!this.cflCapWarnedKeys.has(key)) {
      this.cflCapWarnedKeys.add(key)
      logger.warn(
        `[FSF-COMPUTE] cosmology sub-step cap reached (preset=${cosmo.preset}, ` +
          `ω·dt=${cflRatio.toFixed(3)}, ideal=${ideal}, cap=${COSMOLOGY_MAX_SUBSTEPS}). ` +
          `Evolution continues but with reduced stability — increase stepsPerFrame, ` +
          `reduce dt, or step back from the singularity.`
      )
    }
    return COSMOLOGY_MAX_SUBSTEPS
  }

  /**
   * Advance `simEta` by one leapfrog step, clamping at `±COSMOLOGY_ETA_FLOOR`
   * so the cosmological clock never crosses the `η = 0` singularity. Both
   * branches move toward zero: for `eta0 < 0` (deep past, the usual
   * inflationary convention) we add `+dt`; for `eta0 > 0` (unusual but
   * allowed by the store) we subtract `dt`. In every case `|simEta|`
   * decreases monotonically until it hits the floor.
   *
   * The clamp math is delegated to the module-level `projectSimEta` helper
   * so the CFL preview in the leapfrog loop shares a single definition of
   * the floor/sign logic and can't drift from the runtime advance.
   *
   * @param dt - Leapfrog time step
   * @returns New `simEta` (with clamp applied)
   */
  private advanceSimEta(dt: number): number {
    this.simEta = projectSimEta(this.simEta, dt)
    return this.simEta
  }

  /**
   * Test-only shim exposing `advanceSimEta` so unit tests can exercise the
   * cosmological-clock direction and clamp logic without spinning up a GPU.
   * Not used at runtime.
   */
  _testAdvanceSimEta(currentSimEta: number, dt: number): number {
    this.simEta = currentSimEta
    return this.advanceSimEta(dt)
  }

  /**
   * Execute the free scalar field compute pass.
   * Handles initialization, leapfrog steps, and grid write.
   */
  executeField(
    ctx: WebGPURenderContext,
    config: FreeScalarConfig,
    isPlaying: boolean,
    speed: number,
    basisX?: Float32Array,
    basisY?: Float32Array,
    basisZ?: Float32Array,
    boundingRadius?: number,
    colorAlgorithm?: number
  ): void {
    const { device, encoder } = ctx

    for (const buf of this.pendingStagingBuffers) buf.destroy()
    this.pendingStagingBuffers.length = 0
    this.flushKSpaceData(device)

    this.maybeRebuild(device, config)

    // Recompute maxPhiEstimate when autoScale transitions off→on
    const autoScaleTransition = config.autoScale && !this.lastAutoScale
    this.lastAutoScale = config.autoScale

    if (!this.initialized || config.needsReset || autoScaleTransition) {
      this.maxPhiEstimate = computeFsfMaxPhiEstimate(config)
    }

    // Reset simEta BEFORE writing uniforms so the first post-reset frame
    // sees the correct mEffSq(eta0). initializeField will subsequently
    // sample the adiabatic vacuum at this same eta0, keeping the evolution
    // self-consistent from the start.
    //
    // When resuming from a saved state (pendingLoadedSimEta set by the
    // load path), the saved sim time overrides `config.cosmology.eta0`
    // so the cosmological clock picks up where the user left off.
    const willReinitialize = !this.initialized || config.needsReset
    if (willReinitialize) {
      if (config.cosmology.enabled) {
        this.simEta =
          this.pendingLoadedSimEta !== null ? this.pendingLoadedSimEta : config.cosmology.eta0
        this.pendingLoadedSimEta = null
      } else {
        this.simEta = 0
        this.pendingLoadedSimEta = null
      }
    }

    this.updateUniforms(device, config, basisX, basisY, basisZ, boundingRadius, colorAlgorithm)

    if (willReinitialize) {
      this.initializeField(ctx, config)
    }

    // Leapfrog time steps (only when playing)
    if (isPlaying && this.pl && this.bg) {
      const scaledSteps = config.stepsPerFrame * speed
      this.stepAccumulator += scaledSteps
      const stepsThisFrame = Math.floor(this.stepAccumulator)
      this.stepAccumulator -= stepsThisFrame

      const linearWorkgroups = Math.ceil(this.totalSites / LINEAR_WORKGROUP_SIZE)
      const cosmologyActive = config.cosmology.enabled

      // Cache the original dt — when adaptive sub-stepping kicks in we
      // overwrite the uniform slot with `dt/nSub` and must restore it
      // before the next outer step.
      const dtFull = config.dt
      // Track the maximum sub-step count chosen this frame for the debug
      // trace ring buffer — lets the playwright spec see when CFL safety
      // is approaching its ceiling.
      let maxNSubThisFrame = 1

      for (let step = 0; step < stepsThisFrame; step++) {
        // Adaptive sub-stepping combines TWO independent requirements:
        //
        // 1. CFL stability — `dt·ω < COSMOLOGY_CFL_SAFETY` where
        //    `ω² = k_max² + m²·a²`. This keeps the leapfrog's
        //    characteristic eigenvalues inside the stable disk so the
        //    integrator doesn't blow up. Evaluated at BOTH endpoints of
        //    the outer step (the current `simEta` AND the projected
        //    end-of-step `simEta`); in de Sitter `a(η) ∝ 1/|η|` grows
        //    monotonically toward the singularity, so a check at only
        //    the start would miss the discontinuous jump to the
        //    `COSMOLOGY_ETA_FLOOR` and the pi dispatch at the end of
        //    the step would run with the larger post-jump frequency but
        //    the stale nSub=1 interval — which detonates the leapfrog
        //    in a single step (captured in
        //    `scripts/playwright-output/fsf-desitter-autoscale-flash.json`).
        //
        // 2. Adiabaticity — `|Δω₀/ω_avg| < COSMOLOGY_ADIABATIC_SAFETY`
        //    per sub-step where `ω₀ ≈ m·a` is the zero-mode frequency.
        //    CFL alone is not sufficient: even with the leapfrog well
        //    inside its stable disk, a discontinuous jump in the
        //    cosmology coefficients across one outer step will *pump*
        //    the mode oscillators out of their instantaneous ground
        //    state, producing canonical amplitudes that overshoot by
        //    orders of magnitude before settling. Requiring the scale
        //    factor to change by no more than ~10% per sub-step keeps
        //    the numerical integrator tracking the analytical mode
        //    functions without excitations.
        //
        // Final `nSub = max(nSub_cfl, nSub_adiab)`. For Kasner/ekpyrotic
        // `a(η)` shrinks toward the big bang so the CFL at the start is
        // the tighter bound and adiabaticity there is mild; for de
        // Sitter it's the reverse. Taking the max over both constraints
        // at both endpoints handles every preset without a preset-
        // specific branch.
        let nSub = 1
        if (cosmologyActive) {
          const coefsStart = computeFsfCosmologyCoefs(config, this.simEta)
          const endSimEta = projectSimEta(this.simEta, dtFull)
          const coefsEnd = computeFsfCosmologyCoefs(config, endSimEta)
          const nSubStart = this.computeAdaptiveSubsteps(
            config,
            coefsStart.aFull,
            coefsStart.aPotential
          )
          const nSubEnd = this.computeAdaptiveSubsteps(
            config,
            coefsEnd.aFull,
            coefsEnd.aPotential
          )
          const nSubCfl = nSubStart > nSubEnd ? nSubStart : nSubEnd
          const nSubAdiab = computeAdiabaticSubsteps(coefsStart, coefsEnd)
          nSub = nSubCfl > nSubAdiab ? nSubCfl : nSubAdiab
          if (nSub > maxNSubThisFrame) maxNSubThisFrame = nSub
          if (nSub !== 1) {
            // Re-stage the shader dt to the sub-step size for the duration
            // of this outer step. Restored at the end of the outer step.
            const subDt = dtFull / nSub
            this.cosmoCoefsScratch[0] = subDt
            device.queue.writeBuffer(
              this.uniformBuffer!,
              DT_BYTE_OFFSET,
              this.cosmoCoefsScratch.buffer,
              this.cosmoCoefsScratch.byteOffset,
              4
            )
          }
        }

        for (let sub = 0; sub < nSub; sub++) {
          const phiPass = ctx.beginComputePass({
            label: `free-scalar-update-phi-${step}-${sub}`,
          })
          this.dispatchCompute(
            phiPass,
            this.pl.updatePhiPipeline,
            [this.bg.updatePhiBG],
            linearWorkgroups
          )
          phiPass.end()

          // Advance the cosmological clock AFTER the phi drift and BEFORE
          // the pi kick so the time-dependent coefficients used by the pi
          // dispatch match the advanced phi time slice. This is the
          // canonical leapfrog time ordering extended to time-dependent
          // Hamiltonians — first-order accurate in the coefficient time,
          // second-order in the (p, q) update. When cosmology is disabled
          // there is no clock to advance.
          if (cosmologyActive) {
            const subDt = nSub === 1 ? dtFull : dtFull / nSub
            const newEta = this.advanceSimEta(subDt)
            const coefs = computeFsfCosmologyCoefs(config, newEta)
            this.writeCosmologyCoefsSlot(device, coefs.aKinetic, coefs.aPotential, coefs.aFull)
          }

          const piPass = ctx.beginComputePass({
            label: `free-scalar-update-pi-${step}-${sub}`,
          })
          this.dispatchCompute(
            piPass,
            this.pl.updatePiPipeline,
            [this.bg.updatePiBG],
            linearWorkgroups
          )
          piPass.end()

          if (config.absorberEnabled) {
            const absPass = ctx.beginComputePass({
              label: `free-scalar-absorber-${step}-${sub}`,
            })
            this.dispatchCompute(
              absPass,
              this.pl.absorberPipeline,
              [this.bg.initBG],
              linearWorkgroups
            )
            absPass.end()
          }
        }

        // Restore the full dt in the uniform slot so the next outer step's
        // pre-flight CFL check (and any non-cosmology downstream reader)
        // sees the user-configured integrator step.
        if (nSub !== 1) {
          this.cosmoCoefsScratch[0] = dtFull
          device.queue.writeBuffer(
            this.uniformBuffer!,
            DT_BYTE_OFFSET,
            this.cosmoCoefsScratch.buffer,
            this.cosmoCoefsScratch.byteOffset,
            4
          )
        }
      }

      // Record the CFL sub-step pressure seen this frame for the debug
      // trace. `maxNSubThisFrame` is 1 for the common no-substep case.
      this.lastDebugNSub = maxNSubThisFrame
    }

    // Write to 3D density grid texture
    if (this.pl && this.bg) {
      const gridWorkgroups = Math.ceil(DENSITY_GRID_SIZE / GRID_WORKGROUP_SIZE)
      const gridPass = ctx.beginComputePass({ label: 'free-scalar-write-grid-pass' })
      this.dispatchCompute(
        gridPass,
        this.pl.writeGridPipeline,
        [this.bg.writeGridBG],
        gridWorkgroups,
        gridWorkgroups,
        gridWorkgroups
      )
      gridPass.end()
    } else {
      logger.warn(
        `[FreeScalarFieldComputePass] writeGrid skipped: pl=${!!this.pl}, bg=${!!this.bg}`
      )
    }

    // k-Space occupation: async CPU readback → FFT → texture upload
    const analysisMode = this.uniformU32[47]!

    // Clear textures on transition into k-space mode to avoid showing stale position-space data
    if (
      analysisMode === 3 &&
      this.lastAnalysisMode !== 3 &&
      this.densityTexture &&
      this.analysisTexture
    ) {
      const bytesPerTexel = 8
      const bytesPerRow = DENSITY_GRID_SIZE * bytesPerTexel
      const rowsPerImage = DENSITY_GRID_SIZE
      const totalBytes = bytesPerRow * rowsPerImage * DENSITY_GRID_SIZE
      const zeros = new Uint8Array(totalBytes)
      const texSize = {
        width: DENSITY_GRID_SIZE,
        height: DENSITY_GRID_SIZE,
        depthOrArrayLayers: DENSITY_GRID_SIZE,
      }
      device.queue.writeTexture(
        { texture: this.densityTexture },
        zeros,
        { bytesPerRow, rowsPerImage },
        texSize
      )
      device.queue.writeTexture(
        { texture: this.analysisTexture },
        zeros,
        { bytesPerRow, rowsPerImage },
        texSize
      )
    }
    this.lastAnalysisMode = analysisMode

    // Delegate k-space and diagnostics readback to the manager
    if (this.initialized && this.phiBuffer && this.piBuffer) {
      this.kSpace.maybeStartKSpaceReadback(
        device,
        encoder,
        this.phiBuffer,
        this.piBuffer,
        this.totalSites,
        config,
        analysisMode
      )
      // Snapshot the cosmology coefficients at the exact moment the readback
      // is requested so the diagnostics Hamiltonian term matches the
      // time-dependent coefs that were used in the pi-update for this
      // frame's buffers. `computeFsfCosmologyCoefs` collapses to identity
      // under Minkowski, so the same call covers both branches without a
      // conditional.
      const coefs = computeFsfCosmologyCoefs(config, this.simEta)
      this.kSpace.maybeStartDiagnosticsReadback(
        device,
        encoder,
        this.phiBuffer,
        this.piBuffer,
        this.totalSites,
        config,
        coefs
      )

      // Debug trace capture — guarded by the global `enabled` flag so it's
      // a cheap no-op in normal runs. The playwright measurement spec flips
      // the flag on before driving the preset and reads the ring buffer
      // afterward via `page.evaluate`.
      if (config.cosmology.enabled) {
        this.captureCosmoDebugSample(config, coefs, isPlaying ? this.debugFrameIndexTick() : this.debugFrameIndex)
      }
    }
  }

  /**
   * Advance the debug frame counter and return the new value. Extracted so
   * the capture call site stays a single expression.
   */
  private debugFrameIndexTick(): number {
    this.debugFrameIndex += 1
    return this.debugFrameIndex
  }

  /**
   * Push one cosmology debug snapshot into the ring buffer if it's enabled.
   * Samples the live diagnostics store so the trace carries both the
   * current cosmology coefs (pinned to the frame's `simEta`) and the
   * most recent async readback of field statistics (`maxPhi`, `maxPi`,
   * `totalEnergy`). Early-out cost is a single property read.
   */
  private captureCosmoDebugSample(
    config: FreeScalarConfig,
    coefs: { aKinetic: number; aPotential: number; aFull: number },
    frameIndex: number
  ): void {
    const buf = getOrCreateFsfCosmoDebugBuffer()
    if (!buf || !buf.enabled) return

    // Reconstruct `a` from the cosmology coefs so the trace has a single
    // source of truth that matches what the shader saw. aPotential = a^(n−2)
    // so a = aPotential^(1/(n−2)); for latticeDim=1 (n=2) aPotential ≡ 1
    // and we fall back to the raw power-law evaluation.
    const n = config.latticeDim + 1
    let a = 1
    if (n > 2 && coefs.aPotential > 0) {
      a = Math.pow(coefs.aPotential, 1 / (n - 2))
    }
    const mSqAsq = config.mass * config.mass * a * a

    // Sample the diagnostics store at the capture instant. The store holds
    // the most recent async readback, which may lag the current frame by
    // `diagnosticsInterval` frames. We mark it with the frame index so the
    // consumer can cross-reference.
    const diagState = useDiagnosticsStore.getState().fsf
    const sample: FsfCosmoDebugSample = {
      frame: frameIndex,
      t: typeof performance !== 'undefined' ? performance.now() : 0,
      simEta: this.simEta,
      a,
      aKinetic: coefs.aKinetic,
      aPotential: coefs.aPotential,
      aFull: coefs.aFull,
      nSub: this.lastDebugNSub,
      mSqAsq,
      diagTotalEnergy: diagState.totalEnergy,
      diagMaxPhi: diagState.maxPhi,
      diagMaxPi: diagState.maxPi,
    }

    if (buf.samples.length < buf.capacity) {
      buf.samples.push(sample)
      buf.head = buf.samples.length
    } else {
      buf.samples[buf.head % buf.capacity] = sample
      buf.head += 1
    }
  }

  /** Standard execute method (required by base class but we use executeField instead). */
  execute(_ctx: WebGPURenderContext): void {
    // No-op: use executeField() which takes the config parameter
  }

  /** Release all GPU resources. */
  dispose(): void {
    const gpuBuffers: (GPUBuffer | null)[] = [this.phiBuffer, this.piBuffer, this.uniformBuffer]
    for (const buf of gpuBuffers) buf?.destroy()
    this.densityTexture?.destroy()
    this.analysisTexture?.destroy()
    for (const buf of this.pendingStagingBuffers) buf.destroy()
    this.pendingStagingBuffers.length = 0

    this.phiBuffer = this.piBuffer = this.uniformBuffer = null
    this.densityTexture = null
    this.densityTextureView = null
    this.analysisTexture = null
    this.analysisTextureView = null
    this.kSpace.dispose()
    this.pl = null
    this.bg = null
    this.initialized = false
    this.lastConfigHash = ''
    this.lastInitHash = null
    super.dispose()
  }
}
