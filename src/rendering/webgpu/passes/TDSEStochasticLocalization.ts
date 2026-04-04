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

import type { WebGPURenderContext } from '../core/types'
import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import { tdseStochasticLocBlock } from '../shaders/schroedinger/compute/tdseStochasticLoc.wgsl'
import { tdseUniformsBlock } from '../shaders/schroedinger/compute/tdseUniforms.wgsl'

/** Maximum collapse centers per dispatch (packed into uniform struct). */
const MAX_CENTERS_PER_DISPATCH = 8

/**
 * StochasticParams struct size in bytes.
 * Layout: 8 scalars × 4 bytes = 32, then array<vec4f, 8> = 128. Total = 160.
 */
const STOCHASTIC_UNIFORM_SIZE = 160

/** Mutable state for the stochastic localization pass. */
export interface StochasticLocState {
  uniformBuffer: GPUBuffer | null
  pipeline: GPUComputePipeline | null
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
  if (!state.bgl || !state.uniformBuffer) return
  state.bg = device.createBindGroup({
    label: 'tdse-stochastic-loc-bg',
    layout: state.bgl,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: psiReBuffer } },
      { binding: 2, resource: { buffer: psiImBuffer } },
      { binding: 3, resource: { buffer: state.uniformBuffer } },
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
 * @returns Float32Array of packed uniform data (160 bytes)
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

  // Collapse centers: 8 × vec4f starting at offset 32 bytes (f32 index 8)
  const rng = state.rng
  const latticeDim = Math.min(config.latticeDim, 3)

  for (let k = 0; k < MAX_CENTERS_PER_DISPATCH; k++) {
    const baseIdx = 8 + k * 4 // f32 offset for this center

    if (k < batchCount) {
      // Generate world-space center coordinates (within grid extent)
      for (let d = 0; d < 3; d++) {
        if (d < latticeDim) {
          const halfExtent = config.gridSize[d]! * config.spacing[d]! * 0.5
          // Random position within the grid
          f32[baseIdx + d] = rng() * 2 * halfExtent - halfExtent
        } else {
          f32[baseIdx + d] = 0
        }
      }
      // Gaussian noise dW ~ N(0, 1) for this center
      const [g1] = gaussianPair(rng)
      f32[baseIdx + 3] = g1
    } else {
      // Unused center slot — zero weight
      f32[baseIdx] = 0
      f32[baseIdx + 1] = 0
      f32[baseIdx + 2] = 0
      f32[baseIdx + 3] = 0
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
 * @param linearWG - Workgroup count for linear dispatch
 * @param step - Current step index within the frame
 * @param dispatchCompute - Pass's dispatch helper
 */
export function maybeDispatchStochasticLoc(
  device: GPUDevice,
  ctx: WebGPURenderContext,
  config: TdseConfig,
  state: StochasticLocState,
  linearWG: number,
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

  const nLoc = Math.max(1, Math.min(32, config.stochasticNumSites))
  const numDispatches = Math.ceil(nLoc / MAX_CENTERS_PER_DISPATCH)

  for (let batch = 0; batch < numDispatches; batch++) {
    const batchStart = batch * MAX_CENTERS_PER_DISPATCH
    const batchCount = Math.min(MAX_CENTERS_PER_DISPATCH, nLoc - batchStart)

    const uniformData = packStochasticUniforms(config, state, batchStart, batchCount)
    device.queue.writeBuffer(state.uniformBuffer, 0, uniformData)

    const pass = ctx.beginComputePass({
      label: `tdse-stochastic-loc-step${step}-batch${batch}`,
    })
    dispatchCompute(pass, state.pipeline, [state.bg], linearWG)
    pass.end()
  }

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
  state.bg = null
  state.stepCounter = 0
  state.rng = null
  state.lastSeed = -1
}
