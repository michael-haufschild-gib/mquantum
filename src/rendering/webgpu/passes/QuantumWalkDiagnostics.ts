/**
 * Quantum Walk — Diagnostics Subsystem
 *
 * Manages GPU compute pipelines for norm/position reduction, dispatches
 * diagnostic passes, and schedules async readback to the diagnostics store.
 *
 * @module rendering/webgpu/passes/QuantumWalkDiagnostics
 */

import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'

import type { WebGPURenderContext } from '../core/types'
import {
  QW_DIAG_RESULT_COUNT,
  qwDiagFinalizeBlock,
  qwDiagReduceBlock,
} from '../shaders/schroedinger/compute/qwDiagnostics.wgsl'
import { createComputeBGL } from '../utils/computeBindGroupLayout'

const DIAG_WG = 256
const DIAG_INTERVAL = 10

/**
 * Self-contained diagnostics subsystem for quantum walk.
 * Owns GPU pipelines and buffers for norm + position reduction with async readback.
 */
export class QwDiagnostics {
  private reducePipeline: GPUComputePipeline | null = null
  private finalizePipeline: GPUComputePipeline | null = null
  private uniformBuffer: GPUBuffer | null = null
  private partialNormBuffer: GPUBuffer | null = null
  private partialPosSumBuffer: GPUBuffer | null = null
  private partialPosSqSumBuffer: GPUBuffer | null = null
  private resultBuffer: GPUBuffer | null = null
  private stagingBuffer: GPUBuffer | null = null
  private reduceBG: GPUBindGroup | null = null
  private finalizeBG: GPUBindGroup | null = null
  private mappingInFlight = false
  private stepAccumulator = 0
  private epoch = 0
  private readonly uniformData = new Uint32Array(8)

  /**
   * Create diagnostic compute pipelines and fixed-size buffers.
   *
   * @param device - WebGPU device
   */
  buildPipelines(device: GPUDevice): void {
    const reduceModule = device.createShaderModule({
      label: 'qw-diag-reduce',
      code: qwDiagReduceBlock,
    })
    const finalizeModule = device.createShaderModule({
      label: 'qw-diag-finalize',
      code: qwDiagFinalizeBlock,
    })
    const reduceBGL = createComputeBGL(device, 'qw-diag-reduce-bgl', [
      'uniform',
      'read-only-storage',
      'storage',
      'storage',
      'storage',
    ])
    const finalizeBGL = createComputeBGL(device, 'qw-diag-finalize-bgl', [
      'uniform',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
    ])
    this.reducePipeline = device.createComputePipeline({
      label: 'qw-diag-reduce-pipeline',
      layout: device.createPipelineLayout({
        label: 'qw-diag-reduce-layout',
        bindGroupLayouts: [reduceBGL],
      }),
      compute: { module: reduceModule, entryPoint: 'main' },
    })
    this.finalizePipeline = device.createComputePipeline({
      label: 'qw-diag-finalize-pipeline',
      layout: device.createPipelineLayout({
        label: 'qw-diag-finalize-layout',
        bindGroupLayouts: [finalizeBGL],
      }),
      compute: { module: finalizeModule, entryPoint: 'main' },
    })
    this.uniformBuffer = device.createBuffer({
      label: 'qw-diag-uniform',
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.resultBuffer = device.createBuffer({
      label: 'qw-diag-result',
      size: QW_DIAG_RESULT_COUNT * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    })
    this.stagingBuffer = device.createBuffer({
      label: 'qw-diag-staging',
      size: QW_DIAG_RESULT_COUNT * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
  }

  /** Reset accumulator and store state. */
  reset(): void {
    this.epoch++
    this.stepAccumulator = 0
    useDiagnosticsStore.getState().resetQw()
  }

  /**
   * Conditionally dispatch diagnostics based on step accumulator.
   * Call every frame when animation is playing.
   *
   * @param ctx - WebGPU render context
   * @param coinStateA - Current coin state buffer
   * @param totalSites - Total lattice sites
   * @param latticeDim - Lattice dimensionality
   * @param gridSize0 - Size of first grid dimension
   * @param stepsPerFrame - Steps dispatched per frame
   * @param speed - Animation speed multiplier
   * @param stepCount - Total steps executed so far
   */
  maybeDispatch(
    ctx: WebGPURenderContext,
    coinStateA: GPUBuffer,
    totalSites: number,
    latticeDim: number,
    gridSize0: number,
    stepsPerFrame: number,
    speed: number,
    stepCount: number
  ): void {
    this.stepAccumulator += stepsPerFrame * speed
    if (this.stepAccumulator < DIAG_INTERVAL) return
    this.stepAccumulator -= DIAG_INTERVAL
    this.dispatch(ctx, coinStateA, totalSites, latticeDim, gridSize0, stepCount)
  }

  private dispatch(
    ctx: WebGPURenderContext,
    coinStateA: GPUBuffer,
    totalSites: number,
    latticeDim: number,
    gridSize0: number,
    stepCount: number
  ): void {
    if (
      !this.reducePipeline ||
      !this.finalizePipeline ||
      !this.uniformBuffer ||
      !this.resultBuffer ||
      !this.stagingBuffer
    )
      return

    const { device } = ctx
    const numCoinStates = 2 * latticeDim
    const numWG = Math.ceil(totalSites / DIAG_WG)

    // Create or resize partial buffers
    const neededPartials = numWG * 4
    if (!this.partialNormBuffer || this.partialNormBuffer.size < neededPartials) {
      this.partialNormBuffer?.destroy()
      this.partialPosSumBuffer?.destroy()
      this.partialPosSqSumBuffer?.destroy()
      this.partialNormBuffer = device.createBuffer({
        label: 'qw-diag-partial-norm',
        size: neededPartials,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      })
      this.partialPosSumBuffer = device.createBuffer({
        label: 'qw-diag-partial-pos',
        size: neededPartials,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      })
      this.partialPosSqSumBuffer = device.createBuffer({
        label: 'qw-diag-partial-pos2',
        size: neededPartials,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      })
    }

    // stride0 = totalSites / gridSize0 = product of all other dim sizes
    // For 1D: stride0 = 1. For 2D [64,64]: stride0 = 64.
    const stride0 = gridSize0 > 0 ? Math.floor(totalSites / gridSize0) : 1
    this.uniformData[0] = totalSites
    this.uniformData[1] = numCoinStates
    this.uniformData[2] = numWG
    this.uniformData[3] = gridSize0
    this.uniformData[4] = stride0
    this.uniformData[5] = 0
    this.uniformData[6] = 0
    this.uniformData[7] = 0
    device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData)

    this.reduceBG = device.createBindGroup({
      label: 'qw-diag-reduce-bg',
      layout: this.reducePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: coinStateA } },
        { binding: 2, resource: { buffer: this.partialNormBuffer! } },
        { binding: 3, resource: { buffer: this.partialPosSumBuffer! } },
        { binding: 4, resource: { buffer: this.partialPosSqSumBuffer! } },
      ],
    })
    this.finalizeBG = device.createBindGroup({
      label: 'qw-diag-finalize-bg',
      layout: this.finalizePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.partialNormBuffer! } },
        { binding: 2, resource: { buffer: this.partialPosSumBuffer! } },
        { binding: 3, resource: { buffer: this.partialPosSqSumBuffer! } },
        { binding: 4, resource: { buffer: this.resultBuffer } },
      ],
    })

    // Pass 1: reduce coin state → partial sums
    const p1 = ctx.beginComputePass({ label: 'qw-diag-reduce' })
    p1.setPipeline(this.reducePipeline)
    p1.setBindGroup(0, this.reduceBG)
    p1.dispatchWorkgroups(numWG)
    p1.end()

    // Pass 2: finalize partial sums → result
    const p2 = ctx.beginComputePass({ label: 'qw-diag-finalize' })
    p2.setPipeline(this.finalizePipeline)
    p2.setBindGroup(0, this.finalizeBG)
    p2.dispatchWorkgroups(1)
    p2.end()

    this.scheduleReadback(ctx, stepCount)
  }

  private scheduleReadback(ctx: WebGPURenderContext, stepCount: number): void {
    if (this.mappingInFlight || !this.resultBuffer || !this.stagingBuffer) return

    const byteSize = QW_DIAG_RESULT_COUNT * 4
    ctx.encoder.copyBufferToBuffer(this.resultBuffer, 0, this.stagingBuffer, 0, byteSize)
    this.mappingInFlight = true
    const staging = this.stagingBuffer
    const capturedEpoch = this.epoch

    ctx.device.queue
      .onSubmittedWorkDone()
      .then(() => {
        if (capturedEpoch !== this.epoch || !staging || staging.mapState !== 'unmapped') {
          this.mappingInFlight = false
          return
        }
        staging
          .mapAsync(GPUMapMode.READ)
          .then(() => {
            if (capturedEpoch !== this.epoch) {
              this.mappingInFlight = false
              return
            }
            const data = new Float32Array(staging.getMappedRange())
            const totalNorm = data[0]!
            const posSum = data[1]!
            const posSqSum = data[2]!
            staging.unmap()
            this.mappingInFlight = false

            if (isFinite(totalNorm)) {
              useDiagnosticsStore
                .getState()
                .pushQwDiagnostics(totalNorm, stepCount, posSum, posSqSum)
            }
          })
          .catch(() => {
            this.mappingInFlight = false
          })
      })
      .catch(() => {
        this.mappingInFlight = false
      })
  }

  /** Destroy all owned GPU resources and invalidate in-flight readbacks. */
  dispose(): void {
    this.epoch++
    this.uniformBuffer?.destroy()
    this.partialNormBuffer?.destroy()
    this.partialPosSumBuffer?.destroy()
    this.partialPosSqSumBuffer?.destroy()
    this.resultBuffer?.destroy()
    this.stagingBuffer?.destroy()
    this.uniformBuffer = null
    this.partialNormBuffer = null
    this.partialPosSumBuffer = null
    this.partialPosSqSumBuffer = null
    this.resultBuffer = null
    this.stagingBuffer = null
    this.reduceBG = null
    this.finalizeBG = null
    this.mappingInFlight = false
    this.stepAccumulator = 0
  }
}
