/**
 * Free Scalar Field — K-Space Readback Manager
 *
 * Manages asynchronous GPU → CPU readback of phi/pi field data,
 * dispatches FFT computation to a Web Worker, and handles diagnostics
 * readback for field statistics.
 *
 * Extracted from FreeScalarFieldComputePass to keep file sizes manageable.
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { logger } from '@/lib/logger'
import type { KSpaceBasisCoefs } from '@/lib/physics/freeScalar/kSpaceOccupation'
import {
  computeFsfCosmologyCoefs,
  computeFsfVacuumDispersion,
} from '@/lib/physics/freeScalar/vacuumDispersion'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'

import {
  computeFsfDiagnostics,
  type FsfHamiltonianCoefs,
} from './FreeScalarFieldComputePassUniforms'

/**
 * Derive the canonical-basis rescale for the k-space `n_k` kernel from
 * the current FSF config's cosmology snapshot at the **live** conformal
 * time `simEta`. Under Minkowski or cosmology-disabled the helper
 * collapses to the identity pair, which makes the downstream kernel
 * bit-identical to its pre-cosmology implementation. Under FLRW the
 * pair is `(1/B, B)` where `B = a^(n−2)` is the per-frame `aPotential`
 * coefficient evaluated **at `simEta`** — keying this off `η₀` freezes
 * the thermometer at the initial vacuum once the sim starts evolving.
 *
 * @param config - Current FSF compute-pass config
 * @param simEta - Live conformal time from the compute pass (NOT `η₀`)
 * @returns `{aKinetic, aPotential}` to thread into the worker message
 */
function resolveKSpaceBasisCoefs(config: FreeScalarConfig, simEta: number): KSpaceBasisCoefs {
  const coefs = computeFsfCosmologyCoefs(config, simEta)
  return { aKinetic: coefs.aKinetic, aPotential: coefs.aPotential }
}

/**
 * Pending k-space texture data computed async, uploaded synchronously next frame.
 * Carries the total adiabatic-vacuum particle number `N(η)` alongside the
 * density/analysis textures so a single worker result delivers both the
 * visual and the thermometer readings.
 */
export interface PendingKSpaceData {
  density?: Uint16Array
  analysis?: Uint16Array
  /** Total particle number `N(η) = Σ_k max(n_k, 0)` at the current vacuum reference. */
  totalParticles: number
}

/**
 * Manages k-space FFT readback and diagnostics readback for the free scalar field.
 * Encapsulates the Web Worker lifecycle, staging buffer mapping, and epoch-based
 * invalidation of stale async jobs.
 */
export class FsfKSpaceManager {
  // k-Space readback state
  private phiReadbackBuffer: GPUBuffer | null = null
  private piReadbackBuffer: GPUBuffer | null = null
  private kSpacePending = false
  private kSpaceFrameCounter = 0
  private readonly K_SPACE_UPDATE_INTERVAL = 5
  /** Monotonic epoch used to invalidate stale async readback jobs after rebuild/dispose. */
  private kSpaceReadbackEpoch = 0
  /** Pending k-space texture data computed async, uploaded synchronously next frame. */
  private pendingKSpaceData: PendingKSpaceData | null = null
  /** Web Worker for offloading FFT + k-space CPU work from the main thread. */
  private kSpaceWorker: Worker | null = null

  // Diagnostics readback state
  private diagFrameCounter = 0
  private diagMappingInFlight = false
  private diagPhiReadbackBuffer: GPUBuffer | null = null
  private diagPiReadbackBuffer: GPUBuffer | null = null

  /**
   * Create staging buffers for k-space and diagnostics readback.
   * @param device - GPU device
   * @param bufferSize - Size in bytes (totalSites * 4)
   */
  createBuffers(device: GPUDevice, bufferSize: number): void {
    this.phiReadbackBuffer = device.createBuffer({
      label: 'free-scalar-phi-readback',
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
    this.piReadbackBuffer = device.createBuffer({
      label: 'free-scalar-pi-readback',
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
    this.diagPhiReadbackBuffer = device.createBuffer({
      label: 'free-scalar-diag-phi-readback',
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
    this.diagPiReadbackBuffer = device.createBuffer({
      label: 'free-scalar-diag-pi-readback',
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
  }

  /**
   * Invalidate all in-flight async readback jobs without destroying buffers.
   * Called on field reinitialization to prevent stale readbacks from
   * corrupting the diagnostics store's initialEnergy baseline.
   *
   * Also drops `pendingKSpaceData` — without this, a worker result that
   * was already pushed onto the pending queue *before* the reset would be
   * uploaded into the texture on the next frame, painting one frame of
   * stale k-space pixels after every cosmology reset.
   */
  invalidateReadbacks(): void {
    this.kSpaceReadbackEpoch++
    this.pendingKSpaceData = null
  }

  /** Destroy staging buffers and invalidate in-flight jobs. */
  destroyBuffers(): void {
    this.kSpaceReadbackEpoch++
    this.pendingKSpaceData = null
    // Cancel any pending mapAsync before destroying staging buffers.
    if (this.diagMappingInFlight) {
      this.diagPhiReadbackBuffer?.unmap()
      this.diagPiReadbackBuffer?.unmap()
      this.diagMappingInFlight = false
    }
    this.phiReadbackBuffer?.destroy()
    this.piReadbackBuffer?.destroy()
    this.diagPhiReadbackBuffer?.destroy()
    this.diagPiReadbackBuffer?.destroy()
    this.phiReadbackBuffer = null
    this.piReadbackBuffer = null
    this.diagPhiReadbackBuffer = null
    this.diagPiReadbackBuffer = null
  }

  /** Consume pending k-space texture data (if any). Returns null if nothing pending. */
  takePendingData(): PendingKSpaceData | null {
    const data = this.pendingKSpaceData
    this.pendingKSpaceData = null
    return data
  }

  /**
   * Attempt k-space readback if conditions are met.
   *
   * Encodes copy commands on the encoder and starts an async FFT +
   * particle-count readback. **Runs every `K_SPACE_UPDATE_INTERVAL`
   * frames regardless of the active analysis view** — the adiabatic
   * N(η) thermometer is a general FSF instrument that feeds the
   * diagnostics store's particle-history ring buffer; the density /
   * analysis textures produced as a side effect are only *sampled* by
   * the raymarcher when the analysis panel sits in k-space view, but
   * the thermometer itself must not be gated on that view or it
   * silently stops reporting the moment the user flips to a different
   * analysis mode.
   *
   * @param simEta - Live conformal time from the compute pass. Threaded
   *                 through to `readbackAndComputeKSpace` so the
   *                 dispersion and canonical-basis coefs are evaluated
   *                 at the exact moment the (phi, pi) buffers were
   *                 copied — **never** at `config.cosmology.eta0`,
   *                 which would freeze N(η) at the initial vacuum.
   */
  maybeStartKSpaceReadback(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    phiBuffer: GPUBuffer,
    piBuffer: GPUBuffer,
    totalSites: number,
    config: FreeScalarConfig,
    simEta: number,
    densityGridSize?: number,
    includeTextures = true
  ): void {
    this.kSpaceFrameCounter++
    if (
      this.kSpacePending ||
      this.kSpaceFrameCounter < this.K_SPACE_UPDATE_INTERVAL ||
      !this.phiReadbackBuffer ||
      !this.piReadbackBuffer
    ) {
      return
    }

    this.kSpaceFrameCounter = 0
    const bufferSize = totalSites * 4
    encoder.copyBufferToBuffer(phiBuffer, 0, this.phiReadbackBuffer, 0, bufferSize)
    encoder.copyBufferToBuffer(piBuffer, 0, this.piReadbackBuffer, 0, bufferSize)
    void this.readbackAndComputeKSpace(device, config, simEta, densityGridSize, includeTextures)
  }

  /**
   * Attempt diagnostics readback if conditions are met.
   *
   * @param coefs - Cosmology + preheating coefficients
   *                `(aKinetic, aPotential, aFull, massSquaredScale)` at the
   *                time the readback is requested. Caller obtains the
   *                cosmology triple from `computeFsfCosmologyCoefs(config,
   *                simEta)` and `massSquaredScale` from
   *                `computeMassSquaredScale` evaluated at the same clock
   *                the pi-update last saw — both collapse to identity
   *                under Minkowski + preheating disabled. Propagated
   *                through to `computeFsfDiagnostics` so the reported
   *                Hamiltonian energy matches the canonical δφ integrator
   *                even while the time-dependent drive is active.
   */
  maybeStartDiagnosticsReadback(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    phiBuffer: GPUBuffer,
    piBuffer: GPUBuffer,
    totalSites: number,
    config: FreeScalarConfig,
    coefs: FsfHamiltonianCoefs
  ): void {
    if (
      !config.diagnosticsEnabled ||
      this.diagMappingInFlight ||
      !this.diagPhiReadbackBuffer ||
      !this.diagPiReadbackBuffer
    ) {
      return
    }

    this.diagFrameCounter++
    if (this.diagFrameCounter < config.diagnosticsInterval) return

    this.diagFrameCounter = 0
    const bufferSize = totalSites * 4
    encoder.copyBufferToBuffer(phiBuffer, 0, this.diagPhiReadbackBuffer, 0, bufferSize)
    encoder.copyBufferToBuffer(piBuffer, 0, this.diagPiReadbackBuffer, 0, bufferSize)
    void this.readbackDiagnostics(device, config, coefs)
  }

  /** Get or create the k-space Web Worker. */
  private getKSpaceWorker(): Worker {
    if (!this.kSpaceWorker) {
      this.kSpaceWorker = new Worker(
        new URL('@/lib/physics/freeScalar/kSpaceWorker.ts', import.meta.url),
        { type: 'module' }
      )
      this.kSpaceWorker.onmessage = (e: MessageEvent) => {
        const msg = e.data
        // Stale reply from a previous epoch: drop on the floor.
        if (msg.epoch !== this.kSpaceReadbackEpoch) {
          this.kSpacePending = false
          return
        }
        if (msg.type === 'error') {
          logger.warn('[FreeScalarFieldComputePass] k-space worker compute failed:', msg.message)
          this.kSpacePending = false
          return
        }
        if (msg.type === 'result') {
          // Number.isFinite (not `typeof === 'number'`) so a NaN or
          // ±Infinity from a worker-side numerical failure falls back
          // cleanly to 0 instead of poisoning `pendingKSpaceData` and
          // the diagnostics ring buffer.
          const totalParticles = Number.isFinite(msg.totalParticles) ? msg.totalParticles : 0
          if (msg.density && msg.analysis) {
            this.pendingKSpaceData = {
              density: msg.density,
              analysis: msg.analysis,
              totalParticles,
            }
          }
          // Feed the adiabatic-vacuum particle number into the diagnostics
          // ring buffer. Gated on the epoch check above so a worker result
          // that lands after a cosmology reset is dropped along with its
          // density/analysis payload.
          useDiagnosticsStore.getState().pushFsfParticleNumber(totalParticles)
        }
        this.kSpacePending = false
      }
      this.kSpaceWorker.onerror = (e) => {
        logger.warn('[FreeScalarFieldComputePass] k-space worker error:', e.message)
        this.kSpacePending = false
      }
    }
    return this.kSpaceWorker
  }

  private async readbackAndComputeKSpace(
    _device: GPUDevice,
    config: FreeScalarConfig,
    simEta: number,
    densityGridSize?: number,
    includeTextures = true
  ): Promise<void> {
    const phiReadbackBuffer = this.phiReadbackBuffer
    const piReadbackBuffer = this.piReadbackBuffer
    const readbackEpoch = this.kSpaceReadbackEpoch
    if (!phiReadbackBuffer || !piReadbackBuffer) return

    this.kSpacePending = true

    let phiMapped = false
    let piMapped = false
    try {
      // PERF: mapAsync waits for the GPU copy — skip onSubmittedWorkDone() to avoid
      // a pipeline stall. Yield via queueMicrotask so the buffer isn't in "pending
      // map" state when queue.submit() fires later in the same synchronous block.
      await new Promise<void>((r) => queueMicrotask(r))
      await phiReadbackBuffer.mapAsync(GPUMapMode.READ)
      phiMapped = true
      if (readbackEpoch !== this.kSpaceReadbackEpoch) {
        phiReadbackBuffer.unmap()
        this.kSpacePending = false
        return
      }
      await piReadbackBuffer.mapAsync(GPUMapMode.READ)
      piMapped = true

      const phiData = new Float32Array(phiReadbackBuffer.getMappedRange())
      const piData = new Float32Array(piReadbackBuffer.getMappedRange())
      const totalSites = phiData.length
      const phiComplex = new Float32Array(totalSites * 2)
      const piComplex = new Float32Array(totalSites * 2)
      for (let i = 0; i < totalSites; i++) {
        phiComplex[i * 2] = phiData[i]!
        piComplex[i * 2] = piData[i]!
      }
      phiReadbackBuffer.unmap()
      phiMapped = false
      piReadbackBuffer.unmap()
      piMapped = false

      if (readbackEpoch !== this.kSpaceReadbackEpoch) {
        this.kSpacePending = false
        return
      }

      // Use the live `simEta` captured when the copy was encoded — not
      // `config.cosmology.eta0`, which would peg the vacuum reference
      // at the initial state and turn the thermometer into a constant
      // once the sim started evolving. See the round-2 review finding
      // for the scientific rationale.
      const activeDims = config.gridSize.slice(0, config.latticeDim)
      const activeSpacing = config.spacing.slice(0, config.latticeDim)
      const dispersion = computeFsfVacuumDispersion(config, simEta)
      const basisCoefs = resolveKSpaceBasisCoefs(config, simEta)
      const worker = this.getKSpaceWorker()
      worker.postMessage(
        {
          type: 'compute',
          epoch: readbackEpoch,
          phiComplex,
          piComplex,
          gridSize: activeDims,
          spacing: activeSpacing,
          mass: config.mass,
          latticeDim: config.latticeDim,
          kSpaceViz: config.kSpaceViz,
          dispersion,
          basisCoefs,
          outputGridSize: densityGridSize,
          includeTextures,
        },
        [phiComplex.buffer, piComplex.buffer]
      )
    } catch (e) {
      // Unmap any buffers left mapped after a partial failure
      if (phiMapped)
        try {
          phiReadbackBuffer.unmap()
        } catch {
          /* already destroyed */
        }
      if (piMapped)
        try {
          piReadbackBuffer.unmap()
        } catch {
          /* already destroyed */
        }
      logger.warn('[FreeScalarFieldComputePass] k-space readback failed:', e)
      this.kSpacePending = false
    }
  }

  private async readbackDiagnostics(
    _device: GPUDevice,
    config: FreeScalarConfig,
    coefs: FsfHamiltonianCoefs
  ): Promise<void> {
    const phiBuf = this.diagPhiReadbackBuffer
    const piBuf = this.diagPiReadbackBuffer
    if (!phiBuf || !piBuf) return

    this.diagMappingInFlight = true
    const epoch = this.kSpaceReadbackEpoch
    let phiMapped = false
    let piMapped = false

    try {
      // PERF: mapAsync waits for the GPU copy — skip onSubmittedWorkDone() to avoid
      // a pipeline stall. Yield so the buffer isn't in "pending map" during submit.
      await new Promise<void>((r) => queueMicrotask(r))
      await phiBuf.mapAsync(GPUMapMode.READ)
      phiMapped = true
      if (epoch !== this.kSpaceReadbackEpoch) {
        phiBuf.unmap()
        this.diagMappingInFlight = false
        return
      }
      await piBuf.mapAsync(GPUMapMode.READ)
      piMapped = true

      // Post-map epoch re-check: a reset can land while mapAsync is awaiting,
      // which invalidates these mapped ranges logically even though WebGPU
      // lets us read them. Bail out before computing a stale snapshot.
      if (epoch !== this.kSpaceReadbackEpoch) {
        phiBuf.unmap()
        piBuf.unmap()
        this.diagMappingInFlight = false
        return
      }

      const phi = new Float32Array(phiBuf.getMappedRange())
      const pi = new Float32Array(piBuf.getMappedRange())
      const snapshot = computeFsfDiagnostics(phi, pi, config, coefs)

      phiBuf.unmap()
      phiMapped = false
      piBuf.unmap()
      piMapped = false

      // Final epoch check just before pushing so a reset that lands between
      // the compute above and this store write cannot repopulate a
      // freshly-cleared diagnostics store with stale field data.
      if (epoch !== this.kSpaceReadbackEpoch) {
        this.diagMappingInFlight = false
        return
      }

      useDiagnosticsStore.getState().pushFsfSnapshot(snapshot)
      this.diagMappingInFlight = false
    } catch (e) {
      // Unmap any buffers left mapped after a partial failure
      if (phiMapped)
        try {
          phiBuf.unmap()
        } catch {
          /* already destroyed */
        }
      if (piMapped)
        try {
          piBuf.unmap()
        } catch {
          /* already destroyed */
        }
      // Buffer may be destroyed mid-readback during mode transitions.
      // Log in dev to surface unexpected failures.
      logger.warn('[FSF KSpace] Diagnostics readback failed:', e)
      this.diagMappingInFlight = false
    }
  }

  /** Release all resources including the Web Worker. */
  dispose(): void {
    this.destroyBuffers()
    this.kSpacePending = false
    this.kSpaceFrameCounter = 0
    this.kSpaceWorker?.terminate()
    this.kSpaceWorker = null
  }
}
