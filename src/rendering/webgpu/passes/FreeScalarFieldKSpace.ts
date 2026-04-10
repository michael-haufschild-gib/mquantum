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
import type { CosmologyCoefs } from '@/lib/physics/cosmology/background'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

import { computeFsfDiagnostics } from './FreeScalarFieldComputePassUniforms'

/** Pending k-space texture data computed async, uploaded synchronously next frame. */
export interface PendingKSpaceData {
  density: Uint16Array
  analysis: Uint16Array
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
   * Encodes copy commands on the encoder and starts async readback.
   */
  maybeStartKSpaceReadback(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    phiBuffer: GPUBuffer,
    piBuffer: GPUBuffer,
    totalSites: number,
    config: FreeScalarConfig,
    analysisMode: number
  ): void {
    if (analysisMode !== 3) {
      this.kSpaceFrameCounter = 0
      return
    }

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
    void this.readbackAndComputeKSpace(device, config) // fire-and-forget async
  }

  /**
   * Attempt diagnostics readback if conditions are met.
   *
   * @param coefs - Cosmology coefficients `(aKinetic, aPotential, aFull)`
   *                at the time the readback is requested. Caller obtains
   *                them from `computeFsfCosmologyCoefs(config, simEta)`,
   *                which collapses to identity under Minkowski. Propagated
   *                through to `computeFsfDiagnostics` so the reported
   *                Hamiltonian energy matches the canonical δφ integrator.
   */
  maybeStartDiagnosticsReadback(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    phiBuffer: GPUBuffer,
    piBuffer: GPUBuffer,
    totalSites: number,
    config: FreeScalarConfig,
    coefs: CosmologyCoefs
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
        if (msg.type === 'result' && msg.epoch === this.kSpaceReadbackEpoch) {
          this.pendingKSpaceData = { density: msg.density, analysis: msg.analysis }
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
    device: GPUDevice,
    config: FreeScalarConfig
  ): Promise<void> {
    const phiReadbackBuffer = this.phiReadbackBuffer
    const piReadbackBuffer = this.piReadbackBuffer
    const readbackEpoch = this.kSpaceReadbackEpoch
    if (!phiReadbackBuffer || !piReadbackBuffer) return

    this.kSpacePending = true

    try {
      await device.queue.onSubmittedWorkDone()
      if (readbackEpoch !== this.kSpaceReadbackEpoch) {
        this.kSpacePending = false
        return
      }

      await phiReadbackBuffer.mapAsync(GPUMapMode.READ)
      await piReadbackBuffer.mapAsync(GPUMapMode.READ)

      const phiMapped = new Float32Array(phiReadbackBuffer.getMappedRange())
      const piMapped = new Float32Array(piReadbackBuffer.getMappedRange())
      const totalSites = phiMapped.length
      const phiComplex = new Float32Array(totalSites * 2)
      const piComplex = new Float32Array(totalSites * 2)
      for (let i = 0; i < totalSites; i++) {
        phiComplex[i * 2] = phiMapped[i]!
        piComplex[i * 2] = piMapped[i]!
      }
      phiReadbackBuffer.unmap()
      piReadbackBuffer.unmap()

      if (readbackEpoch !== this.kSpaceReadbackEpoch) {
        this.kSpacePending = false
        return
      }

      const activeDims = config.gridSize.slice(0, config.latticeDim)
      const activeSpacing = config.spacing.slice(0, config.latticeDim)
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
        },
        [phiComplex.buffer, piComplex.buffer]
      )
    } catch (e) {
      logger.warn('[FreeScalarFieldComputePass] k-space readback failed:', e)
      this.kSpacePending = false
    }
  }

  private async readbackDiagnostics(
    device: GPUDevice,
    config: FreeScalarConfig,
    coefs: CosmologyCoefs
  ): Promise<void> {
    const phiBuf = this.diagPhiReadbackBuffer
    const piBuf = this.diagPiReadbackBuffer
    if (!phiBuf || !piBuf) return

    this.diagMappingInFlight = true
    const epoch = this.kSpaceReadbackEpoch

    try {
      await device.queue.onSubmittedWorkDone()
      if (epoch !== this.kSpaceReadbackEpoch) {
        this.diagMappingInFlight = false
        return
      }

      await phiBuf.mapAsync(GPUMapMode.READ)
      await piBuf.mapAsync(GPUMapMode.READ)

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
      piBuf.unmap()

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
