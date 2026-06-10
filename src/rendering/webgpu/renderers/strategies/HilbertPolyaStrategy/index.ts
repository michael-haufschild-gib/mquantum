/**
 * Strategy for the Hilbert–Pólya Spectrum mode (Evans-landscape filaments).
 *
 * The mode is fully analytic: the dedicated volumetric main block
 * (`mainHilbertPolya.wgsl.ts`) trilinearly samples a (Re z, Im z, θ) volume
 * LUT that a Web Worker computes (one FFT per (θ, Im z) line — far too heavy
 * for the render thread) and that this strategy uploads progressively as a
 * group-2 read-only storage buffer (binding 2). A new worker job is launched
 * only when a LUT-shaping config field (zMax / yExtent) changes — never per
 * frame; glow / fog / plane-marker / filament width are plain uniforms (the
 * LUT stores a distance field, so width is applied in the shader).
 * Slices arrive top-θ first (sharp filaments first) and are written into the
 * buffer at their slice offset as they land, so the volume crystallizes
 * progressively instead of popping in at once.
 *
 * @module rendering/webgpu/renderers/strategies/HilbertPolyaStrategy
 */

import { DEFAULT_HILBERT_POLYA_CONFIG } from '@/lib/geometry/extended/hilbertPolya'
import { createHilbertPolyaVolumeWorker } from '@/lib/physics/hilbertPolya/createVolumeWorker'
import { HP_VOL_NX, HP_VOL_NY, HP_VOLUME_BYTES } from '@/lib/physics/hilbertPolya/evans'
import type {
  HpVolumeJobRequest,
  HpVolumeSliceResponse,
} from '@/lib/physics/hilbertPolya/volume.worker'

import type { WebGPURenderContext, WebGPUSetupContext } from '../../../core/types'
import type { SchroedingerWGSLShaderConfig } from '../../../shaders/schroedinger/compose'
import type { SchrodingerRendererConfig } from '../../schrodingerRendererTypes'
import { type ExtendedStoreSnapshot, getStoreSnapshot } from '../../schrodingerRendererTypes'
import type {
  ModeFrameContext,
  ModeSetupResult,
  QuantumModeStrategy,
  SchroedingerSnapshot,
} from '../types'

/** Byte size of one θ-slice: NX × NY voxels × vec4f × 4 bytes. */
const HP_SLICE_BYTES = HP_VOL_NX * HP_VOL_NY * 4 * 4

/** Sphere radius containing the vec3f(3.2, 1.2, 2.0) half-extent box. */
const HP_BOUNDING_RADIUS = 4.0

/** One worker-computed θ-slice awaiting GPU upload. */
interface PendingSlice {
  k: number
  data: Float32Array
}

/** Strategy for the Hilbert–Pólya volumetric mode — no compute passes. */
export class HilbertPolyaStrategy implements QuantumModeStrategy {
  readonly isComputeMode = false

  /** The volume LUT storage buffer (group 2, binding 2). */
  private volumeBuffer: GPUBuffer | null = null

  /** Config hash of the last-requested volume (`null` forces a first-frame job). */
  private lastVolumeHash: string | null = null

  /** Lazily created compute worker (browser only — guarded by `typeof Worker`). */
  private worker: Worker | null = null

  /** Monotonic job id; slice responses from superseded jobs are dropped. */
  private activeJobId = 0

  /** Worker-delivered slices waiting for the next frame's buffer upload. */
  private readonly pendingSlices: PendingSlice[] = []

  configureShader(shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // buildShaderConfig already returns the dedicated Hilbert–Pólya shader
    // config; re-assert the structural flags defensively so a stale cached
    // config can never compose the shared-path shader with this strategy's
    // single-storage-buffer bind group layout.
    shader.isHilbertPolya = true
    shader.isRiemannZeta = false
    shader.isCoherenceHorizon = false
    shader.useDensityGrid = false
    shader.useEigenfunctionCache = false
    shader.temporalAccumulation = false
    shader.isosurface = false
    shader.isWigner = false
    shader.useWignerCache = false
    shader.useDensityMatrix = false
  }

  setup(ctx: WebGPUSetupContext, _config: SchrodingerRendererConfig): ModeSetupResult {
    if (!this.volumeBuffer) {
      this.volumeBuffer = ctx.device.createBuffer({
        label: 'hilbert-polya-volume',
        size: HP_VOLUME_BYTES,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      })
      // Force a recompute + upload on the next frame for this buffer.
      this.lastVolumeHash = null
    }
    const buffer = this.volumeBuffer
    return {
      initPromises: [],
      additionalLayoutEntries: [
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'read-only-storage' as const },
        },
      ],
      getBindGroupEntries: () => (buffer ? [{ binding: 2, resource: { buffer } }] : []),
    }
  }

  computeBoundingRadius(
    _schroedinger: SchroedingerSnapshot,
    _dimension: number,
    _config: SchrodingerRendererConfig
  ): number | null {
    // The volume is a fixed model-space box with half-extents (3.2, 1.2, 2.0);
    // a radius-4 sphere contains it (|halfExt| ≈ 3.96) regardless of config.
    return HP_BOUNDING_RADIUS
  }

  executeFrame(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    const buffer = this.volumeBuffer
    if (!buffer) return

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const cfg = extended?.schroedinger?.hilbertPolya
    const defaults = DEFAULT_HILBERT_POLYA_CONFIG

    const zMax =
      typeof cfg?.zMax === 'number' && Number.isFinite(cfg.zMax) ? cfg.zMax : defaults.zMax
    const yExtent =
      typeof cfg?.yExtent === 'number' && Number.isFinite(cfg.yExtent)
        ? cfg.yExtent
        : defaults.yExtent
    // Only zMax / yExtent change the LUT shape (it stores a distance field);
    // glow, fog, plane marker AND filament width are plain shader uniforms.
    const hash = `${zMax}|${yExtent}`
    if (hash !== this.lastVolumeHash && typeof Worker !== 'undefined') {
      this.lastVolumeHash = hash
      this.activeJobId += 1
      this.pendingSlices.length = 0
      const request: HpVolumeJobRequest = {
        type: 'compute',
        jobId: this.activeJobId,
        params: { zMax, yExtent },
      }
      this.ensureWorker().postMessage(request)
    }

    // Drain worker-delivered slices into the storage buffer (progressive upload).
    if (this.pendingSlices.length > 0) {
      for (const slice of this.pendingSlices) {
        shared.device.queue.writeBuffer(
          buffer,
          slice.k * HP_SLICE_BYTES,
          slice.data as Float32Array<ArrayBuffer>
        )
      }
      this.pendingSlices.length = 0
    }
  }

  /** Lazily create the volume worker and attach the slice-response handler. */
  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = createHilbertPolyaVolumeWorker()
    worker.onmessage = (event: MessageEvent<HpVolumeSliceResponse>) => {
      const msg = event.data
      if (msg.type !== 'slice' || msg.jobId !== this.activeJobId) return
      this.pendingSlices.push({ k: msg.k, data: msg.data })
    }
    this.worker = worker
    return worker
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = null
    this.pendingSlices.length = 0
    this.volumeBuffer?.destroy()
    this.volumeBuffer = null
    this.lastVolumeHash = null
  }
}
