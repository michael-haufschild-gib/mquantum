/**
 * TDSE Stochastic Localization — Pipeline, Buffer, and Dispatch
 *
 * Manages the stochastic localization compute pass: generates random collapse
 * centers on CPU, packs them into a uniform buffer, and dispatches the
 * localization shader each Strang step when γ > 0.
 *
 * Mirrors TDSEComputePassDisorder.ts architecture: state struct, pipeline build,
 * conditional dispatch.
 *
 * @module rendering/webgpu/passes/TDSEStochasticLocalization
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'
import { gaussianPair, mulberry32 } from '@/lib/math/rng'
import { MAX_STOCHASTIC_SITES } from '@/lib/physics/stochastic/localizationKernel'

import type { WebGPURenderContext } from '../core/types'
import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import {
  tdseStochasticExpectFinalizeBlock,
  tdseStochasticExpectReduceBlock,
} from '../shaders/schroedinger/compute/tdseStochasticExpect.wgsl'
import { tdseStochasticLocBlock } from '../shaders/schroedinger/compute/tdseStochasticLoc.wgsl'
import { tdseUniformsBlock } from '../shaders/schroedinger/compute/tdseUniforms.wgsl'

/** Maximum collapse centers per dispatch (mirrors physics constant). */
const MAX_CENTERS_PER_DISPATCH = MAX_STOCHASTIC_SITES

/** Workgroup size for expectation reduction shaders (must match @workgroup_size in WGSL). */
export const EXPECT_WG = 256

/**
 * StochasticParams struct size in bytes.
 * Layout: 8 scalars × 4 bytes = 32, then array<vec4f, 24> = 384. Total = 416.
 * Each center uses 3 vec4f: (x0..x3), (x4..x7), (x8..x10, noise).
 */
const STOCHASTIC_UNIFORM_SIZE = 416

/** Maximum floats for ⟨L_k⟩ expectations (one per center). */
const MAX_EXPECTATION_FLOATS = MAX_CENTERS_PER_DISPATCH

/** Mutable state for the stochastic localization pass. */
export interface StochasticLocState {
  uniformBuffer: GPUBuffer | null
  pipeline: GPUComputePipeline | null
  expectReducePipeline: GPUComputePipeline | null
  expectFinalizePipeline: GPUComputePipeline | null
  expectReduceBGL: GPUBindGroupLayout | null
  expectFinalizeBGL: GPUBindGroupLayout | null
  expectReduceBG: GPUBindGroup | null
  expectFinalizeBG: GPUBindGroup | null
  /** Partial sums buffer for expectation reduction: MAX_CENTERS × numWorkgroups floats */
  expectPartialBuffer: GPUBuffer | null
  /** Final expectation values: MAX_CENTERS floats */
  expectResultBuffer: GPUBuffer | null
  /** Uniform buffer for the finalize pass (numWorkgroups + padding) */
  expectFinalizeUniformBuffer: GPUBuffer | null
  bgl: GPUBindGroupLayout | null
  bg: GPUBindGroup | null
  /** Per-frame step counter for PRNG seeding. */
  stepCounter: number
  /** CPU-side PRNG instance, recreated when seed changes. */
  rng: (() => number) | null
  lastSeed: number
}

/** Create initial stochastic localization state. */
export function createStochasticLocState(): StochasticLocState {
  return {
    uniformBuffer: null,
    pipeline: null,
    expectReducePipeline: null,
    expectFinalizePipeline: null,
    expectReduceBGL: null,
    expectFinalizeBGL: null,
    expectReduceBG: null,
    expectFinalizeBG: null,
    expectPartialBuffer: null,
    expectResultBuffer: null,
    expectFinalizeUniformBuffer: null,
    bgl: null,
    bg: null,
    stepCounter: 0,
    rng: null,
    lastSeed: -1,
  }
}

/**
 * Build the stochastic localization compute pipeline and bind group layout.
 *
 * The bind group layout matches the shader:
 *   binding 0: TDSEUniforms (uniform, from existing pass)
 *   binding 1: psiRe (storage, read-write)
 *   binding 2: psiIm (storage, read-write)
 *   binding 3: StochasticParams (uniform, new)
 *   binding 4: expectations (storage, read — ⟨L_k⟩ values from reduction)
 */
export function buildStochasticLocPipeline(
  device: GPUDevice,
  state: StochasticLocState,
  createShaderModule: (device: GPUDevice, code: string, label: string) => GPUShaderModule,
  createComputePipeline: (
    device: GPUDevice,
    module: GPUShaderModule,
    layouts: GPUBindGroupLayout[],
    label: string
  ) => GPUComputePipeline
): void {
  state.bgl = device.createBindGroupLayout({
    label: 'tdse-stochastic-loc-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    ],
  })

  const shaderCode = tdseUniformsBlock + freeScalarNDIndexBlock + tdseStochasticLocBlock
  const sm = createShaderModule(device, shaderCode, 'tdse-stochastic-loc')
  state.pipeline = createComputePipeline(device, sm, [state.bgl], 'tdse-stochastic-loc')

  state.uniformBuffer?.destroy()
  state.uniformBuffer = device.createBuffer({
    label: 'tdse-stochastic-uniform',
    size: STOCHASTIC_UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  // Expectation result buffer: holds ⟨L_k⟩ for up to 8 centers.
  // Zero-initialized to prevent uninitialized reads before first reduction.
  state.expectResultBuffer?.destroy()
  state.expectResultBuffer = device.createBuffer({
    label: 'tdse-stochastic-expect-result',
    size: MAX_EXPECTATION_FLOATS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(state.expectResultBuffer, 0, new Float32Array(MAX_EXPECTATION_FLOATS))
}

/**
 * Rebuild the stochastic localization bind group after buffer reallocation.
 */
export function rebuildStochasticLocBindGroup(
  device: GPUDevice,
  state: StochasticLocState,
  uniformBuffer: GPUBuffer,
  psiReBuffer: GPUBuffer,
  psiImBuffer: GPUBuffer
): void {
  if (!state.bgl || !state.uniformBuffer || !state.expectResultBuffer) return
  state.bg = device.createBindGroup({
    label: 'tdse-stochastic-loc-bg',
    layout: state.bgl,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: psiReBuffer } },
      { binding: 2, resource: { buffer: psiImBuffer } },
      { binding: 3, resource: { buffer: state.uniformBuffer } },
      { binding: 4, resource: { buffer: state.expectResultBuffer } },
    ],
  })
}

/** Size of the expectation finalize uniform buffer (16 bytes). */
const EXPECT_FINALIZE_UNIFORM_SIZE = 16

/**
 * Build the expectation reduction pipelines for computing ⟨L_k⟩.
 * Called once during initial pipeline setup.
 */
export function buildExpectationPipelines(
  device: GPUDevice,
  state: StochasticLocState,
  createShaderModule: (device: GPUDevice, code: string, label: string) => GPUShaderModule,
  createComputePipeline: (
    device: GPUDevice,
    module: GPUShaderModule,
    layouts: GPUBindGroupLayout[],
    label: string
  ) => GPUComputePipeline
): void {
  // Reduce BGL: TDSEUniforms, psiRe, psiIm, StochasticParams, partialExpect
  state.expectReduceBGL = device.createBindGroupLayout({
    label: 'tdse-stochastic-expect-reduce-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })

  const reduceCode = tdseUniformsBlock + freeScalarNDIndexBlock + tdseStochasticExpectReduceBlock
  const reduceSm = createShaderModule(device, reduceCode, 'tdse-stochastic-expect-reduce')
  state.expectReducePipeline = createComputePipeline(
    device,
    reduceSm,
    [state.expectReduceBGL],
    'tdse-stochastic-expect-reduce'
  )

  // Finalize BGL: FinalizeUniforms, partialExpect(read), result(read-write)
  state.expectFinalizeBGL = device.createBindGroupLayout({
    label: 'tdse-stochastic-expect-finalize-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })

  const finalizeCode = tdseStochasticExpectFinalizeBlock
  const finalizeSm = createShaderModule(device, finalizeCode, 'tdse-stochastic-expect-finalize')
  state.expectFinalizePipeline = createComputePipeline(
    device,
    finalizeSm,
    [state.expectFinalizeBGL],
    'tdse-stochastic-expect-finalize'
  )
}

/**
 * Rebuild expectation reduction buffers and bind groups.
 * Call after psi buffer reallocation (which changes numWorkgroups).
 */
export function rebuildExpectationBindGroups(
  device: GPUDevice,
  state: StochasticLocState,
  uniformBuffer: GPUBuffer,
  psiReBuffer: GPUBuffer,
  psiImBuffer: GPUBuffer,
  numWorkgroups: number
): void {
  if (
    !state.expectReduceBGL ||
    !state.expectFinalizeBGL ||
    !state.uniformBuffer ||
    !state.expectResultBuffer
  )
    return

  // Partial sums buffer: 8 centers × numWorkgroups floats
  state.expectPartialBuffer?.destroy()
  state.expectPartialBuffer = device.createBuffer({
    label: 'tdse-stochastic-expect-partial',
    size: MAX_EXPECTATION_FLOATS * numWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })

  // Reduce bind group
  state.expectReduceBG = device.createBindGroup({
    label: 'tdse-stochastic-expect-reduce-bg',
    layout: state.expectReduceBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: psiReBuffer } },
      { binding: 2, resource: { buffer: psiImBuffer } },
      { binding: 3, resource: { buffer: state.uniformBuffer } },
      { binding: 4, resource: { buffer: state.expectPartialBuffer } },
    ],
  })

  // Finalize uniform buffer (16 bytes: numWorkgroups + padding)
  state.expectFinalizeUniformBuffer?.destroy()
  state.expectFinalizeUniformBuffer = device.createBuffer({
    label: 'tdse-stochastic-expect-finalize-uniform',
    size: EXPECT_FINALIZE_UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const uData = new Uint32Array(4)
  uData[0] = numWorkgroups
  device.queue.writeBuffer(state.expectFinalizeUniformBuffer, 0, uData)

  // Finalize bind group
  state.expectFinalizeBG = device.createBindGroup({
    label: 'tdse-stochastic-expect-finalize-bg',
    layout: state.expectFinalizeBGL,
    entries: [
      { binding: 0, resource: { buffer: state.expectFinalizeUniformBuffer } },
      { binding: 1, resource: { buffer: state.expectPartialBuffer } },
      { binding: 2, resource: { buffer: state.expectResultBuffer } },
    ],
  })
}

/**
 * Generate collapse centers and noise for one batch dispatch.
 *
 * @param config - TDSE config with stochastic parameters
 * @param state - Stochastic state (owns the PRNG)
 * @param batchStart - First center index in this batch
 * @param batchCount - Number of centers in this batch (≤ 8)
 * @returns ArrayBuffer of packed uniform data
 */
function packStochasticUniforms(
  config: TdseConfig,
  state: StochasticLocState,
  _batchStart: number,
  batchCount: number
): ArrayBuffer {
  // Ensure PRNG is initialized
  if (!state.rng || state.lastSeed !== config.stochasticSeed) {
    state.rng = mulberry32(config.stochasticSeed)
    state.lastSeed = config.stochasticSeed
  }

  const buf = new ArrayBuffer(STOCHASTIC_UNIFORM_SIZE)
  const f32 = new Float32Array(buf)
  const u32 = new Uint32Array(buf)

  // Scalar fields (offset 0–31 bytes)
  f32[0] = config.stochasticGamma
  f32[1] = config.stochasticSigma
  u32[2] = batchCount
  u32[3] = state.stepCounter
  u32[4] = config.stochasticSeed
  f32[5] = config.dt
  u32[6] = 0 // _pad0
  u32[7] = 0 // _pad1

  // Collapse centers: 8 × 3 vec4f starting at offset 32 bytes (f32 index 8)
  // Each center: 3 vec4f = 12 floats: (x0..x3), (x4..x7), (x8..x10, noise)
  const rng = state.rng
  const latticeDim = config.latticeDim

  for (let k = 0; k < MAX_CENTERS_PER_DISPATCH; k++) {
    const baseIdx = 8 + k * 12 // f32 offset for this center (3 vec4 × 4 floats)

    if (k < batchCount) {
      // Generate world-space center coordinates for all latticeDim dimensions
      for (let d = 0; d < 11; d++) {
        if (d < latticeDim) {
          const halfExtent = config.gridSize[d]! * config.spacing[d]! * 0.5
          f32[baseIdx + d] = rng() * 2 * halfExtent - halfExtent
        } else {
          f32[baseIdx + d] = 0
        }
      }
      // Gaussian noise dW ~ N(0, 1) at the last slot of the 3rd vec4
      const [g1] = gaussianPair(rng)
      f32[baseIdx + 11] = g1
    } else {
      // Unused center slot — zero all 12 floats
      for (let i = 0; i < 12; i++) f32[baseIdx + i] = 0
    }
  }

  return buf
}

/**
 * Dispatch stochastic localization if enabled and γ > 0.
 *
 * Called once per Strang step, between the fused unpack+potentialHalf (step 6+7)
 * and the absorber (step 8).
 *
 * @param device - WebGPU device
 * @param ctx - Render context for beginComputePass
 * @param config - TDSE configuration
 * @param state - Stochastic localization state
 * @param linearWG - Workgroup count for linear dispatch (workgroup_size=64)
 * @param totalSites - Total lattice sites (for expectation reduction dispatch sizing)
 * @param step - Current step index within the frame
 * @param dispatchCompute - Pass's dispatch helper
 */
export function maybeDispatchStochasticLoc(
  device: GPUDevice,
  ctx: WebGPURenderContext,
  config: TdseConfig,
  state: StochasticLocState,
  linearWG: number,
  totalSites: number,
  step: number,
  dispatchCompute: (
    pass: GPUComputePassEncoder,
    pipeline: GPUComputePipeline,
    bindGroups: GPUBindGroup[],
    wgX: number
  ) => void
): void {
  if (
    !config.stochasticEnabled ||
    config.stochasticGamma <= 0 ||
    !state.pipeline ||
    !state.bg ||
    !state.uniformBuffer
  ) {
    return
  }

  // Cap to MAX_CENTERS_PER_DISPATCH (8). Single dispatch — multi-batch is
  // broken because device.queue.writeBuffer overwrites the uniform buffer
  // before encoded compute passes execute.
  const nLoc = Math.max(1, Math.min(MAX_CENTERS_PER_DISPATCH, config.stochasticNumSites))

  const uniformData = packStochasticUniforms(config, state, 0, nLoc)
  device.queue.writeBuffer(state.uniformBuffer, 0, uniformData)

  // Compute ⟨L_k⟩ expectations via two-pass reduction
  const hasExpectPipeline =
    state.expectReducePipeline &&
    state.expectReduceBG &&
    state.expectFinalizePipeline &&
    state.expectFinalizeBG

  if (hasExpectPipeline) {
    const expectWG = Math.ceil(totalSites / EXPECT_WG)
    const rPass = ctx.beginComputePass({
      label: `tdse-stochastic-expect-reduce-step${step}`,
    })
    dispatchCompute(rPass, state.expectReducePipeline!, [state.expectReduceBG!], expectWG)
    rPass.end()

    const fPass = ctx.beginComputePass({
      label: `tdse-stochastic-expect-finalize-step${step}`,
    })
    dispatchCompute(fPass, state.expectFinalizePipeline!, [state.expectFinalizeBG!], 1)
    fPass.end()
  }

  // Apply the stochastic localization kick
  const pass = ctx.beginComputePass({
    label: `tdse-stochastic-loc-step${step}`,
  })
  dispatchCompute(pass, state.pipeline, [state.bg], linearWG)
  pass.end()

  state.stepCounter++
}

/** Reset the step counter (called on wavefunction re-initialization). */
export function resetStochasticLocState(state: StochasticLocState): void {
  state.stepCounter = 0
  state.rng = null
  state.lastSeed = -1
}

/** Destroy stochastic localization GPU resources. */
export function disposeStochasticLoc(state: StochasticLocState): void {
  state.uniformBuffer?.destroy()
  state.uniformBuffer = null
  state.expectPartialBuffer?.destroy()
  state.expectPartialBuffer = null
  state.expectResultBuffer?.destroy()
  state.expectResultBuffer = null
  state.expectFinalizeUniformBuffer?.destroy()
  state.expectFinalizeUniformBuffer = null
  state.bg = null
  state.expectReduceBG = null
  state.expectFinalizeBG = null
  state.stepCounter = 0
  state.rng = null
  state.lastSeed = -1
}
