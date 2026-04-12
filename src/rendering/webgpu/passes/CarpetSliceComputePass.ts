/**
 * Carpet Slice Compute Pass
 *
 * Extracts a 1D spatial slice from the 3D density texture each frame
 * and writes it as a row into a rolling 2D carpet texture.
 * Performs periodic GPU readback to provide CPU-side data for the
 * QuantumCarpetPanel React component.
 *
 * NOT a render graph pass — dispatched directly by WebGPUSchrodingerRenderer
 * after the quantum mode strategy compute, since it reads from the
 * density texture that the strategy just wrote.
 *
 * @module rendering/webgpu/passes/CarpetSliceComputePass
 */

import { DENSITY_GRID_SIZE } from '@/rendering/webgpu/passes/computePassUtils'
import { carpetSliceShader } from '@/rendering/webgpu/shaders/schroedinger/compute/carpetSlice.wgsl'

/** Uniform buffer size for CarpetSliceParams (8 u32/f32 fields x 4 bytes = 32 bytes). */
const PARAMS_SIZE = 32

/** Workgroup size — must match @workgroup_size in carpet slice shader. */
const WORKGROUP_SIZE = 64

/** Readback throttle: perform GPU->CPU readback every N frames. */
const READBACK_INTERVAL = 3

/** Parameters for a carpet slice dispatch (read from store by caller). */
export interface CarpetDispatchParams {
  sliceAxis: number
  slicePositionY: number
  slicePositionZ: number
  logScale: boolean
  historyLength: number
  writeHead: number
  totalFrames: number
  /** When true, read density from alpha channel (compute modes); otherwise read from red (analytic modes). */
  readAlpha: boolean
}

/** Callback to deliver readback data to the store with capture-time metadata. */
export type CarpetReadbackCallback = (
  data: Float32Array,
  gridSize: number,
  captureWriteHead: number,
  captureTotalFrames: number
) => void

/**
 * Unpack a GPU staging buffer (with 256-byte row alignment padding) into a
 * dense `gridSize × historyLength` Float32Array. Pure function so it can be
 * unit-tested without a real GPUDevice.
 *
 * The staging buffer layout is `historyLength` rows, each with
 * `paddedRowFloats` floats, where `paddedRowFloats = bytesPerRow / 4` and
 * `bytesPerRow = ceil(gridSize * 4 / 256) * 256`. Only the first `gridSize`
 * floats of each row carry real carpet data — the rest is row-alignment
 * padding required by `copyTextureToBuffer`.
 *
 * @param src - Flat view over the mapped staging buffer
 * @param gridSize - Number of valid floats per row
 * @param historyLength - Number of rows
 * @param paddedRowFloats - Float stride per row (includes alignment padding)
 * @returns Dense `gridSize × historyLength` Float32Array in row-major order
 */
export function unpackCarpetStaging(
  src: Float32Array,
  gridSize: number,
  historyLength: number,
  paddedRowFloats: number
): Float32Array {
  const result = new Float32Array(gridSize * historyLength)
  for (let row = 0; row < historyLength; row++) {
    const srcOffset = row * paddedRowFloats
    const dstOffset = row * gridSize
    for (let col = 0; col < gridSize; col++) {
      result[dstOffset + col] = src[srcOffset + col]!
    }
  }
  return result
}

/**
 * `bytesPerRow` for `copyTextureToBuffer` of a single-row-f32 carpet row,
 * rounded up to the 256-byte alignment WebGPU requires. Shared by the
 * staging-buffer allocation (`ensureTextures`) and the readback copy
 * (`performReadback`) so the two sites can never drift.
 */
function alignedBytesPerRow(gridSize: number): number {
  return Math.ceil((gridSize * 4) / 256) * 256
}

/**
 * GPU compute pass that extracts 1D spatial slices from a 3D density texture
 * and accumulates them into a rolling 2D carpet texture for spacetime diagrams.
 */
export class CarpetSliceComputePass {
  private device: GPUDevice | null = null
  private pipeline: GPUComputePipeline | null = null
  private bindGroupLayout: GPUBindGroupLayout | null = null
  private uniformBuffer: GPUBuffer | null = null
  private uniformData = new ArrayBuffer(PARAMS_SIZE)
  private uniformU32 = new Uint32Array(this.uniformData)
  private uniformF32 = new Float32Array(this.uniformData)

  // Carpet texture (rolling 2D buffer)
  private carpetTexture: GPUTexture | null = null
  private carpetTextureView: GPUTextureView | null = null
  private currentHistoryLength = 0

  // Readback
  private stagingBuffer: GPUBuffer | null = null
  private readbackInFlight = false
  private framesSinceReadback = 0
  /** Set by `dispose()` to short-circuit in-flight readback callbacks so they
   *  don't try to touch buffers the renderer just destroyed. */
  private disposed = false

  // Bind group cache
  private lastDensityView: GPUTextureView | null = null
  private bindGroup: GPUBindGroup | null = null

  /**
   * Initialize GPU resources (pipeline, bind group layout, uniform buffer).
   * @param device - GPUDevice
   */
  initialize(device: GPUDevice): void {
    this.device = device
    this.disposed = false

    const shaderModule = device.createShaderModule({
      label: 'carpet-slice-compute',
      code: carpetSliceShader,
    })

    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'carpet-slice-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: 'float', viewDimension: '3d' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: 'write-only',
            format: 'r32float',
            viewDimension: '2d',
          },
        },
      ],
    })

    const pipelineLayout = device.createPipelineLayout({
      label: 'carpet-slice-pl',
      bindGroupLayouts: [this.bindGroupLayout],
    })

    this.pipeline = device.createComputePipeline({
      label: 'carpet-slice-pipeline',
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    })

    this.uniformBuffer = device.createBuffer({
      label: 'carpet-slice-uniforms',
      size: PARAMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
  }

  /**
   * Ensure the carpet texture and staging buffer exist with the correct size.
   * Recreates them if historyLength changed.
   */
  private ensureTextures(historyLength: number): void {
    if (!this.device) return
    if (this.carpetTexture && this.currentHistoryLength === historyLength) return

    this.carpetTexture?.destroy()
    this.stagingBuffer?.destroy()

    this.carpetTexture = this.device.createTexture({
      label: 'carpet-rolling-2d',
      size: { width: DENSITY_GRID_SIZE, height: historyLength },
      format: 'r32float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
    })
    this.carpetTextureView = this.carpetTexture.createView({
      label: 'carpet-rolling-2d-view',
    })

    // Staging buffer — row stride must be 256-byte aligned for copyTextureToBuffer
    const bytesPerRow = alignedBytesPerRow(DENSITY_GRID_SIZE)
    this.stagingBuffer = this.device.createBuffer({
      label: 'carpet-staging',
      size: bytesPerRow * historyLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    })

    this.currentHistoryLength = historyLength
    this.bindGroup = null
    this.lastDensityView = null
  }

  /**
   * Dispatch the carpet slice compute shader and schedule readback.
   *
   * @param encoder - Command encoder for the current frame
   * @param densityTextureView - The 3D density texture view from the active strategy
   * @param params - Carpet configuration (read from store by caller)
   * @param onReadback - Callback to deliver readback data
   */
  dispatch(
    encoder: GPUCommandEncoder,
    densityTextureView: GPUTextureView,
    params: CarpetDispatchParams,
    onReadback: CarpetReadbackCallback
  ): void {
    if (!this.device || !this.pipeline || !this.uniformBuffer || !this.bindGroupLayout) return

    const {
      sliceAxis,
      slicePositionY,
      slicePositionZ,
      logScale,
      historyLength,
      writeHead,
      readAlpha,
    } = params

    this.ensureTextures(historyLength)
    if (!this.carpetTextureView) return

    // Write uniforms
    this.uniformU32[0] = sliceAxis
    this.uniformU32[1] = writeHead
    this.uniformF32[2] = slicePositionY
    this.uniformF32[3] = slicePositionZ
    this.uniformU32[4] = logScale ? 1 : 0
    this.uniformU32[5] = DENSITY_GRID_SIZE
    this.uniformU32[6] = readAlpha ? 1 : 0
    this.uniformU32[7] = 0
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData)

    // Rebuild bind group if density view changed
    if (densityTextureView !== this.lastDensityView || !this.bindGroup) {
      this.bindGroup = this.device.createBindGroup({
        label: 'carpet-slice-bg',
        layout: this.bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: densityTextureView },
          { binding: 2, resource: this.carpetTextureView },
        ],
      })
      this.lastDensityView = densityTextureView
    }

    // Dispatch compute (2 workgroups for 96 threads)
    const computePass = encoder.beginComputePass({ label: 'carpet-slice' })
    computePass.setPipeline(this.pipeline)
    computePass.setBindGroup(0, this.bindGroup)
    computePass.dispatchWorkgroups(Math.ceil(DENSITY_GRID_SIZE / WORKGROUP_SIZE))
    computePass.end()

    // Throttled readback — capture writeHead/totalFrames at submission time
    this.framesSinceReadback++
    if (this.framesSinceReadback >= READBACK_INTERVAL && !this.readbackInFlight) {
      this.performReadback(encoder, historyLength, writeHead, params.totalFrames, onReadback)
      this.framesSinceReadback = 0
    }
  }

  /**
   * Copy carpet texture to staging buffer via the frame encoder and map for CPU read.
   * Uses onSubmittedWorkDone to ensure the frame encoder's commands complete before mapping.
   */
  private performReadback(
    encoder: GPUCommandEncoder,
    historyLength: number,
    captureWriteHead: number,
    captureTotalFrames: number,
    onReadback: CarpetReadbackCallback
  ): void {
    if (!this.device || !this.carpetTexture || !this.stagingBuffer) return

    const bytesPerRow = alignedBytesPerRow(DENSITY_GRID_SIZE)

    encoder.copyTextureToBuffer(
      { texture: this.carpetTexture },
      { buffer: this.stagingBuffer, bytesPerRow, rowsPerImage: historyLength },
      { width: DENSITY_GRID_SIZE, height: historyLength }
    )

    this.readbackInFlight = true

    const staging = this.stagingBuffer
    const device = this.device
    const gridSize = DENSITY_GRID_SIZE
    const hl = historyLength

    device.queue
      .onSubmittedWorkDone()
      .then(() => {
        if (this.disposed || staging.mapState !== 'unmapped') {
          this.readbackInFlight = false
          return
        }
        staging.mapAsync(GPUMapMode.READ).then(
          () => {
            // try/finally guarantees `readbackInFlight` is released even if the
            // row-unpacking or the store callback throws. Without it, a throw
            // anywhere in the success path would permanently wedge carpet
            // readbacks: every subsequent `dispatch` hits the `!readbackInFlight`
            // gate and skips, so the CPU-side carpet panel freezes on the last
            // delivered frame with no runtime signal.
            try {
              if (this.disposed) {
                try {
                  staging.unmap()
                } catch {
                  // Buffer already destroyed — safe to ignore
                }
                return
              }

              const mapped = staging.getMappedRange()
              const src = new Float32Array(mapped)
              const paddedRowFloats = bytesPerRow / 4
              const result = unpackCarpetStaging(src, gridSize, hl, paddedRowFloats)

              staging.unmap()
              onReadback(result, gridSize, captureWriteHead, captureTotalFrames)
            } finally {
              this.readbackInFlight = false
            }
          },
          () => {
            this.readbackInFlight = false
          }
        )
      })
      .catch(() => {
        this.readbackInFlight = false
      })
  }

  /**
   * Release all GPU resources.
   */
  dispose(): void {
    this.disposed = true
    this.carpetTexture?.destroy()
    this.carpetTexture = null
    this.carpetTextureView = null
    this.stagingBuffer?.destroy()
    this.stagingBuffer = null
    this.uniformBuffer?.destroy()
    this.uniformBuffer = null
    this.bindGroup = null
    this.lastDensityView = null
    this.pipeline = null
    this.bindGroupLayout = null
    this.device = null
    this.currentHistoryLength = 0
    this.readbackInFlight = false
  }
}
