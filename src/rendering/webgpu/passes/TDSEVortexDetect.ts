/**
 * TDSE Vortex Detection — GPU dispatch and readback.
 *
 * Integrates with TDSEComputePass to run plaquette-based vortex detection
 * at the same interval as norm diagnostics. Uses two-pass parallel reduction
 * to count phase singularities in the visible 3D slice.
 *
 * @module
 */

import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import { tdseUniformsBlock } from '../shaders/schroedinger/compute/tdseUniforms.wgsl'
import {
  vortexDetectFinalizeBlock,
  vortexDetectReduceBlock,
} from '../shaders/schroedinger/compute/vortexDetect.wgsl'
import { assembleShaderBlocks } from '../shaders/shared/compose-helpers'
import { createComputeBGL } from '../utils/computeBindGroupLayout'

/** Vortex detection state managed by TDSEComputePass. */
export interface VortexDetectState {
  initialized: boolean
  reducePipeline: GPUComputePipeline | null
  finalizePipeline: GPUComputePipeline | null
  reduceBindGroup: GPUBindGroup | null
  finalizeBindGroup: GPUBindGroup | null
  uniformBuffer: GPUBuffer | null
  partialCountsBuffer: GPUBuffer | null
  partialPosBuffer: GPUBuffer | null
  partialNegBuffer: GPUBuffer | null
  resultBuffer: GPUBuffer | null
  stagingBuffer: GPUBuffer | null
  mappingInFlight: boolean
  numWorkgroups: number
  /** Latest readback result: [totalPlaquettes, positiveCharge, negativeCharge] */
  lastResult: [number, number, number]
}

/** Create initial vortex detect state. */
export function createVortexDetectState(): VortexDetectState {
  return {
    initialized: false,
    reducePipeline: null,
    finalizePipeline: null,
    reduceBindGroup: null,
    finalizeBindGroup: null,
    uniformBuffer: null,
    partialCountsBuffer: null,
    partialPosBuffer: null,
    partialNegBuffer: null,
    resultBuffer: null,
    stagingBuffer: null,
    mappingInFlight: false,
    numWorkgroups: 0,
    lastResult: [0, 0, 0],
  }
}

const VD_UNIFORM_SIZE = 32 // 8 × u32/f32

/**
 * Build vortex detection pipelines and allocate buffers.
 */
export function initVortexDetect(
  device: GPUDevice,
  state: VortexDetectState,
  totalSites: number,
  tdseUniformBuffer: GPUBuffer,
  psiReBuffer: GPUBuffer,
  psiImBuffer: GPUBuffer
): void {
  const WG = 256
  state.numWorkgroups = Math.ceil(totalSites / WG)

  // Uniform buffer
  state.uniformBuffer = device.createBuffer({
    label: 'vortex-detect-uniforms',
    size: VD_UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  // Partial buffers (minimum 4 bytes to avoid zero-size bind group validation errors)
  const partialSize = Math.max(state.numWorkgroups * 4, 4)
  state.partialCountsBuffer = device.createBuffer({
    label: 'vortex-detect-partial-counts',
    size: partialSize,
    usage: GPUBufferUsage.STORAGE,
  })
  state.partialPosBuffer = device.createBuffer({
    label: 'vortex-detect-partial-pos',
    size: partialSize,
    usage: GPUBufferUsage.STORAGE,
  })
  state.partialNegBuffer = device.createBuffer({
    label: 'vortex-detect-partial-neg',
    size: partialSize,
    usage: GPUBufferUsage.STORAGE,
  })

  // Result buffer (3 × u32 = 12 bytes, padded to 16)
  state.resultBuffer = device.createBuffer({
    label: 'vortex-detect-result',
    size: 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  })
  state.stagingBuffer = device.createBuffer({
    label: 'vortex-detect-staging',
    size: 16,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })

  // Build reduce pipeline
  const { wgsl: reduceCode } = assembleShaderBlocks([
    { name: 'tdseUniforms', content: tdseUniformsBlock },
    { name: 'ndIndex', content: freeScalarNDIndexBlock },
    { name: 'vortexDetectReduce', content: vortexDetectReduceBlock },
  ])
  const reduceModule = device.createShaderModule({
    label: 'vortex-detect-reduce',
    code: reduceCode,
  })

  const reduceLayout = createComputeBGL(device, 'vortex-detect-reduce-layout', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'uniform',
    'storage',
    'storage',
    'storage',
  ])

  state.reducePipeline = device.createComputePipeline({
    label: 'vortex-detect-reduce-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [reduceLayout] }),
    compute: { module: reduceModule, entryPoint: 'main' },
  })

  state.reduceBindGroup = device.createBindGroup({
    label: 'vortex-detect-reduce-bg',
    layout: reduceLayout,
    entries: [
      { binding: 0, resource: { buffer: state.uniformBuffer } },
      { binding: 1, resource: { buffer: psiReBuffer } },
      { binding: 2, resource: { buffer: psiImBuffer } },
      { binding: 3, resource: { buffer: tdseUniformBuffer } },
      { binding: 4, resource: { buffer: state.partialCountsBuffer } },
      { binding: 5, resource: { buffer: state.partialPosBuffer } },
      { binding: 6, resource: { buffer: state.partialNegBuffer } },
    ],
  })

  // Build finalize pipeline
  const { wgsl: finalizeCode } = assembleShaderBlocks([
    { name: 'vortexDetectFinalize', content: vortexDetectFinalizeBlock },
  ])
  const finalizeModule = device.createShaderModule({
    label: 'vortex-detect-finalize',
    code: finalizeCode,
  })

  const finalizeLayout = createComputeBGL(device, 'vortex-detect-finalize-layout', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])

  state.finalizePipeline = device.createComputePipeline({
    label: 'vortex-detect-finalize-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [finalizeLayout] }),
    compute: { module: finalizeModule, entryPoint: 'main' },
  })

  state.finalizeBindGroup = device.createBindGroup({
    label: 'vortex-detect-finalize-bg',
    layout: finalizeLayout,
    entries: [
      { binding: 0, resource: { buffer: state.uniformBuffer } },
      { binding: 1, resource: { buffer: state.partialCountsBuffer } },
      { binding: 2, resource: { buffer: state.partialPosBuffer } },
      { binding: 3, resource: { buffer: state.partialNegBuffer } },
      { binding: 4, resource: { buffer: state.resultBuffer } },
    ],
  })

  state.initialized = true
}

/**
 * Dispatch vortex detection compute passes, copy result to staging, and
 * schedule async readback. Uses onSubmittedWorkDone + mapAsync pattern
 * matching TDSEDiagnosticsReadback to avoid staging-buffer-while-mapped errors.
 */
export function dispatchAndReadbackVortexDetect(
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  state: VortexDetectState,
  totalSites: number,
  latticeDim: number,
  maxDensity: number
): void {
  if (
    !state.initialized ||
    !state.reducePipeline ||
    !state.finalizePipeline ||
    !state.reduceBindGroup ||
    !state.finalizeBindGroup ||
    !state.uniformBuffer ||
    !state.resultBuffer ||
    !state.stagingBuffer ||
    state.mappingInFlight
  )
    return

  // Write uniforms
  const data = new ArrayBuffer(VD_UNIFORM_SIZE)
  const u32 = new Uint32Array(data)
  const f32 = new Float32Array(data)
  u32[0] = totalSites
  u32[1] = state.numWorkgroups
  u32[2] = latticeDim
  f32[3] = 0.05 // density threshold: 5% of max
  f32[4] = maxDensity
  device.queue.writeBuffer(state.uniformBuffer, 0, data)

  // Pass 1: reduce
  const pass1 = encoder.beginComputePass({ label: 'vortex-detect-reduce' })
  pass1.setPipeline(state.reducePipeline)
  pass1.setBindGroup(0, state.reduceBindGroup)
  pass1.dispatchWorkgroups(state.numWorkgroups)
  pass1.end()

  // Pass 2: finalize
  const pass2 = encoder.beginComputePass({ label: 'vortex-detect-finalize' })
  pass2.setPipeline(state.finalizePipeline)
  pass2.setBindGroup(0, state.finalizeBindGroup)
  pass2.dispatchWorkgroups(1)
  pass2.end()

  // Copy result to staging and lock the buffer
  encoder.copyBufferToBuffer(state.resultBuffer, 0, state.stagingBuffer, 0, 16)
  state.mappingInFlight = true
  const staging = state.stagingBuffer

  // Wait for GPU to finish the copy before mapping
  device.queue
    .onSubmittedWorkDone()
    .then(() => {
      if (!staging || staging.mapState !== 'unmapped') {
        state.mappingInFlight = false
        return
      }
      staging
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          const mapped = new Uint32Array(staging.getMappedRange().slice(0))
          state.lastResult = [mapped[0] ?? 0, mapped[1] ?? 0, mapped[2] ?? 0]
          staging.unmap()
          state.mappingInFlight = false
        })
        .catch(() => {
          state.mappingInFlight = false
        })
    })
    .catch(() => {
      state.mappingInFlight = false
    })
}

/**
 * Dispose vortex detection GPU resources.
 */
export function disposeVortexDetect(state: VortexDetectState): void {
  state.uniformBuffer?.destroy()
  state.partialCountsBuffer?.destroy()
  state.partialPosBuffer?.destroy()
  state.partialNegBuffer?.destroy()
  state.resultBuffer?.destroy()
  state.stagingBuffer?.destroy()
  state.initialized = false
  state.reducePipeline = null
  state.finalizePipeline = null
  state.reduceBindGroup = null
  state.finalizeBindGroup = null
  state.uniformBuffer = null
  state.partialCountsBuffer = null
  state.partialPosBuffer = null
  state.partialNegBuffer = null
  state.resultBuffer = null
  state.stagingBuffer = null
}

/**
 * Rebuild vortex detection resources after buffer reallocation.
 * Disposes old resources and initializes new ones if buffers are available.
 */
export function rebuildVortexDetect(
  device: GPUDevice,
  state: VortexDetectState,
  totalSites: number,
  uniformBuffer: GPUBuffer | null,
  psiReBuffer: GPUBuffer | null,
  psiImBuffer: GPUBuffer | null
): void {
  disposeVortexDetect(state)
  if (uniformBuffer && psiReBuffer && psiImBuffer && totalSites > 0) {
    initVortexDetect(device, state, totalSites, uniformBuffer, psiReBuffer, psiImBuffer)
  }
}

/**
 * Run vortex detection if applicable (BEC mode with positive interaction).
 * Called from TDSEComputePass.dispatchDiagnostics.
 */
export function runVortexDetection(
  ctx: { device: GPUDevice; encoder: GPUCommandEncoder },
  state: VortexDetectState,
  config: { interactionStrength?: number; latticeDim: number },
  totalSites: number,
  maxDensity: number
): void {
  if (state.initialized && config.interactionStrength && config.interactionStrength > 0) {
    dispatchAndReadbackVortexDetect(
      ctx.device,
      ctx.encoder,
      state,
      totalSites,
      config.latticeDim,
      maxDensity
    )
  }
}
