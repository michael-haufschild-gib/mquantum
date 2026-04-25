/**
 * TDSE Stochastic Localization — Pipeline, Buffer, and Dispatch
 *
 * Manages the stochastic localization compute pass: generates random collapse
 * centers on CPU, packs them into a uniform buffer, and dispatches the
 * localization shader each Strang step when γ > 0.
 *
 * Uses the CENTERED combined-field form:
 *   W(x) = Σ_k L_k(x) · ξ_k   (combined noise field)
 *   ⟨W⟩ = Σ|ψ|²W / Σ|ψ|²       (density-weighted mean, 2-channel reduction)
 *   ψ *= exp(√(γdt)(W - ⟨W⟩) - (γ/2)(W - ⟨W⟩)²dt)
 *
 * The centering ensures the kick has zero mean over the density, preventing
 * systematic norm suppression regardless of σ. The 2-channel reduction
 * (vs 8-channel per-center) scales to 32 centers for smooth collapse fields.
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
import {
  tdseStochasticLocBlock,
  tdseStochasticLocBlock3D,
} from '../shaders/schroedinger/compute/tdseStochasticLoc.wgsl'
import { tdseUniformsBlock } from '../shaders/schroedinger/compute/tdseUniforms.wgsl'
import { createComputeBGL } from '../utils/computeBindGroupLayout'
import type { SiteDispatch } from './computePassUtils'

/** Maximum collapse centers per dispatch (mirrors physics constant). */
const MAX_CENTERS_PER_DISPATCH = MAX_STOCHASTIC_SITES

/** Workgroup size for expectation reduction shaders (must match @workgroup_size in WGSL). */
export const EXPECT_WG = 256

/** Number of reduction channels: density-weighted W + bare norm. */
const EXPECT_CHANNELS = 2

/**
 * StochasticParams struct size in bytes.
 * Layout: 8 scalars × 4 bytes = 32, then array<vec4f, 96> = 1536. Total = 1568.
 */
const STOCHASTIC_UNIFORM_SIZE = 1568

/** Size of the expectation finalize uniform buffer (16 bytes). */
const EXPECT_FINALIZE_UNIFORM_SIZE = 16

/** Pure WGSL composition for the stochastic-localization apply-kick compute shader (1-D variant). */
export function composeTdseStochasticLocShader(): string {
  return tdseUniformsBlock + freeScalarNDIndexBlock + tdseStochasticLocBlock
}

/** Pure WGSL for the stochastic-localization apply-kick shader (3-D variant). */
export function composeTdseStochasticLoc3DShader(): string {
  return tdseUniformsBlock + freeScalarNDIndexBlock + tdseStochasticLocBlock3D
}

/** Pure WGSL composition for the 2-channel expect-reduce compute shader. */
export function composeTdseStochasticExpectReduceShader(): string {
  return tdseUniformsBlock + freeScalarNDIndexBlock + tdseStochasticExpectReduceBlock
}

/** Pure WGSL composition for the expect-finalize compute shader (pre-composed block). */
export function composeTdseStochasticExpectFinalizeShader(): string {
  return tdseStochasticExpectFinalizeBlock
}

/** Mutable state for the stochastic localization pass. */
export interface StochasticLocState {
  uniformBuffer: GPUBuffer | null
  pipeline: GPUComputePipeline | null
  /** 3-D dispatch sibling — same BGL/bindings, workgroup_size(4,4,4). */
  pipeline3D: GPUComputePipeline | null
  bgl: GPUBindGroupLayout | null
  bg: GPUBindGroup | null

  // Expectation reduction (2-channel: ⟨W⟩ + norm)
  expectReducePipeline: GPUComputePipeline | null
  expectFinalizePipeline: GPUComputePipeline | null
  expectReduceBGL: GPUBindGroupLayout | null
  expectFinalizeBGL: GPUBindGroupLayout | null
  expectReduceBG: GPUBindGroup | null
  expectFinalizeBG: GPUBindGroup | null
  expectPartialBuffer: GPUBuffer | null
  expectResultBuffer: GPUBuffer | null
  expectFinalizeUniformBuffer: GPUBuffer | null

  stepCounter: number
  rng: (() => number) | null
  lastSeed: number
  stagingBuffer: GPUBuffer | null
  stagingSlotCount: number
}

/** Create initial stochastic localization state. */
export function createStochasticLocState(): StochasticLocState {
  return {
    uniformBuffer: null,
    pipeline: null,
    pipeline3D: null,
    bgl: null,
    bg: null,
    expectReducePipeline: null,
    expectFinalizePipeline: null,
    expectReduceBGL: null,
    expectFinalizeBGL: null,
    expectReduceBG: null,
    expectFinalizeBG: null,
    expectPartialBuffer: null,
    expectResultBuffer: null,
    expectFinalizeUniformBuffer: null,
    stepCounter: 0,
    rng: null,
    lastSeed: -1,
    stagingBuffer: null,
    stagingSlotCount: 0,
  }
}

/**
 * Build the stochastic localization compute pipeline.
 *
 * Localization shader bind group (4 bindings after vec2f-ψ merge):
 *   0: TDSEUniforms, 1: psi (vec2f), 2: StochasticParams, 3: expectResult
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
  // Localization pipeline: TDSEUniforms(storage), psi(vec2f rw), StochasticParams(uniform),
  // read-only-storage. Binding 0 (TDSEUniforms) — see tdseInit.wgsl.ts for the
  // spec-noncompliance rationale.
  state.bgl = createComputeBGL(device, 'tdse-stochastic-loc-bgl', [
    'read-only-storage',
    'storage',
    'uniform',
    'read-only-storage',
  ])

  const sm = createShaderModule(device, composeTdseStochasticLocShader(), 'tdse-stochastic-loc')
  state.pipeline = createComputePipeline(device, sm, [state.bgl], 'tdse-stochastic-loc')
  // 3-D dispatch sibling — same BGL/bindings, workgroup_size(4,4,4).
  const sm3D = createShaderModule(
    device,
    composeTdseStochasticLoc3DShader(),
    'tdse-stochastic-loc-3d'
  )
  state.pipeline3D = createComputePipeline(device, sm3D, [state.bgl], 'tdse-stochastic-loc-3d')

  state.uniformBuffer?.destroy()
  state.uniformBuffer = device.createBuffer({
    label: 'tdse-stochastic-uniform',
    size: STOCHASTIC_UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  // Expectation result: 2 floats [⟨W⟩, normSq]. Zero-initialized.
  state.expectResultBuffer?.destroy()
  state.expectResultBuffer = device.createBuffer({
    label: 'tdse-stochastic-expect-result',
    size: EXPECT_CHANNELS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(state.expectResultBuffer, 0, new Float32Array(EXPECT_CHANNELS))

  // Expectation reduction pipelines (2-channel: Σ|ψ|²W + Σ|ψ|²).
  // Binding 0 (TDSEUniforms) — see loc BGL comment; binding 2 (StochasticParams)
  // stays uniform; binding 1 is now the merged ψ (vec2f).
  state.expectReduceBGL = createComputeBGL(device, 'tdse-stochastic-expect-reduce-bgl', [
    'read-only-storage',
    'read-only-storage',
    'uniform',
    'storage',
  ])
  const reduceSm = createShaderModule(
    device,
    composeTdseStochasticExpectReduceShader(),
    'tdse-stochastic-expect-reduce'
  )
  state.expectReducePipeline = createComputePipeline(
    device,
    reduceSm,
    [state.expectReduceBGL],
    'tdse-stochastic-expect-reduce'
  )

  state.expectFinalizeBGL = createComputeBGL(device, 'tdse-stochastic-expect-finalize-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  const finalizeSm = createShaderModule(
    device,
    composeTdseStochasticExpectFinalizeShader(),
    'tdse-stochastic-expect-finalize'
  )
  state.expectFinalizePipeline = createComputePipeline(
    device,
    finalizeSm,
    [state.expectFinalizeBGL],
    'tdse-stochastic-expect-finalize'
  )
}

/** Rebuild bind groups after buffer reallocation. */
export function rebuildStochasticLocBindGroup(
  device: GPUDevice,
  state: StochasticLocState,
  uniformBuffer: GPUBuffer,
  psiBuffer: GPUBuffer
): void {
  if (!state.bgl || !state.uniformBuffer || !state.expectResultBuffer) return
  state.bg = device.createBindGroup({
    label: 'tdse-stochastic-loc-bg',
    layout: state.bgl,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: psiBuffer } },
      { binding: 2, resource: { buffer: state.uniformBuffer } },
      { binding: 3, resource: { buffer: state.expectResultBuffer } },
    ],
  })
}

/**
 * Rebuild expectation reduction buffers and bind groups.
 * Call after psi buffer reallocation.
 */
export function rebuildExpectationBindGroups(
  device: GPUDevice,
  state: StochasticLocState,
  uniformBuffer: GPUBuffer,
  psiBuffer: GPUBuffer,
  numWorkgroups: number
): void {
  if (
    !state.expectReduceBGL ||
    !state.expectFinalizeBGL ||
    !state.uniformBuffer ||
    !state.expectResultBuffer
  )
    return

  // Partial sums: 2 channels × numWorkgroups
  state.expectPartialBuffer?.destroy()
  state.expectPartialBuffer = device.createBuffer({
    label: 'tdse-stochastic-expect-partial',
    size: EXPECT_CHANNELS * numWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })

  state.expectReduceBG = device.createBindGroup({
    label: 'tdse-stochastic-expect-reduce-bg',
    layout: state.expectReduceBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: psiBuffer } },
      { binding: 2, resource: { buffer: state.uniformBuffer } },
      { binding: 3, resource: { buffer: state.expectPartialBuffer } },
    ],
  })

  state.expectFinalizeUniformBuffer?.destroy()
  state.expectFinalizeUniformBuffer = device.createBuffer({
    label: 'tdse-stochastic-expect-finalize-uniform',
    size: EXPECT_FINALIZE_UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const uData = new Uint32Array(4)
  uData[0] = numWorkgroups
  device.queue.writeBuffer(state.expectFinalizeUniformBuffer, 0, uData)

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

/** Pack collapse centers and noise into the stochastic uniform buffer. */
function packStochasticUniforms(
  config: TdseConfig,
  state: StochasticLocState,
  batchCount: number,
  placementRadius: number
): ArrayBuffer {
  if (!state.rng || state.lastSeed !== config.stochasticSeed) {
    state.rng = mulberry32(config.stochasticSeed)
    state.lastSeed = config.stochasticSeed
  }

  const buf = new ArrayBuffer(STOCHASTIC_UNIFORM_SIZE)
  const f32 = new Float32Array(buf)
  const u32 = new Uint32Array(buf)

  f32[0] = config.stochasticGamma
  f32[1] = config.stochasticSigma
  u32[2] = batchCount
  u32[3] = state.stepCounter
  u32[4] = config.stochasticSeed
  f32[5] = config.dt
  u32[6] = 0
  u32[7] = 0

  const rng = state.rng
  const latticeDim = config.latticeDim

  for (let k = 0; k < MAX_CENTERS_PER_DISPATCH; k++) {
    const baseIdx = 8 + k * 12
    if (k < batchCount) {
      for (let d = 0; d < 11; d++) {
        if (d < latticeDim) {
          const dimHalfExtent = config.gridSize[d]! * config.spacing[d]! * 0.5
          const halfExtent = Math.min(placementRadius, dimHalfExtent)
          f32[baseIdx + d] = rng() * 2 * halfExtent - halfExtent
        } else {
          f32[baseIdx + d] = 0
        }
      }
      const [g1] = gaussianPair(rng)
      f32[baseIdx + 11] = g1
    } else {
      for (let i = 0; i < 12; i++) f32[baseIdx + i] = 0
    }
  }

  return buf
}

/**
 * Number of CSL sub-steps per Strang evolution step.
 * Auto-computed: M = ceil(γ·dt / 0.01), clamped [1, 8].
 */
export function computeCSLSubsteps(gamma: number, dt: number): number {
  return Math.max(1, Math.min(8, Math.ceil((gamma * dt) / 0.01)))
}

/** Pre-compute stochastic uniform data for all steps+substeps in the frame. */
export function prepareStochasticStaging(
  device: GPUDevice,
  config: TdseConfig,
  state: StochasticLocState,
  stepsThisFrame: number,
  boundingRadius = 2.0
): void {
  if (
    !config.stochasticEnabled ||
    config.stochasticGamma <= 0 ||
    !state.uniformBuffer ||
    stepsThisFrame <= 0
  ) {
    return
  }

  const nLoc = Math.max(1, Math.min(MAX_CENTERS_PER_DISPATCH, config.stochasticNumSites))
  const cslSubsteps = computeCSLSubsteps(config.stochasticGamma, config.dt)
  const totalSlots = stepsThisFrame * cslSubsteps

  if (!state.stagingBuffer || state.stagingSlotCount < totalSlots) {
    state.stagingBuffer?.destroy()
    const slotCount = Math.max(totalSlots, 16)
    state.stagingBuffer = device.createBuffer({
      label: 'tdse-stochastic-staging',
      size: slotCount * STOCHASTIC_UNIFORM_SIZE,
      usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    })
    state.stagingSlotCount = slotCount
  }

  const placementRadius = Math.max(
    boundingRadius + config.stochasticSigma,
    config.stochasticSigma * 2
  )

  const subConfig: TdseConfig =
    cslSubsteps > 1 ? { ...config, stochasticGamma: config.stochasticGamma / cslSubsteps } : config

  const totalSize = totalSlots * STOCHASTIC_UNIFORM_SIZE
  const combined = new ArrayBuffer(totalSize)
  const dst = new Uint8Array(combined)

  for (let slot = 0; slot < totalSlots; slot++) {
    const stepData = packStochasticUniforms(subConfig, state, nLoc, placementRadius)
    dst.set(new Uint8Array(stepData), slot * STOCHASTIC_UNIFORM_SIZE)
    state.stepCounter++
  }

  device.queue.writeBuffer(state.stagingBuffer, 0, combined, 0, totalSize)
}

/**
 * Dispatch stochastic localization for one (sub-)step.
 *
 * 1. Copy step's uniform data from staging
 * 2. Reduce ⟨W⟩ via 2-channel reduction (density-weighted noise field mean)
 * 3. Apply centered kick: ψ *= exp(√(γdt)(W - ⟨W⟩) - (γ/2)(W - ⟨W⟩)²dt)
 */
export function maybeDispatchStochasticLoc(
  _device: GPUDevice,
  ctx: WebGPURenderContext,
  config: TdseConfig,
  state: StochasticLocState,
  siteDispatch: SiteDispatch,
  totalSites: number,
  step: number,
  dispatchCompute: (
    pass: GPUComputePassEncoder,
    pipeline: GPUComputePipeline,
    bindGroups: GPUBindGroup[],
    wgX: number,
    wgY?: number,
    wgZ?: number
  ) => void
): void {
  if (
    !config.stochasticEnabled ||
    config.stochasticGamma <= 0 ||
    !state.pipeline ||
    !state.bg ||
    !state.uniformBuffer ||
    !state.stagingBuffer
  ) {
    return
  }

  if (step >= state.stagingSlotCount) return

  // Copy this step's uniform data from staging to active buffer
  ctx.encoder.copyBufferToBuffer(
    state.stagingBuffer,
    step * STOCHASTIC_UNIFORM_SIZE,
    state.uniformBuffer,
    0,
    STOCHASTIC_UNIFORM_SIZE
  )

  // Compute ⟨W⟩ via 2-channel reduction
  if (
    state.expectReducePipeline &&
    state.expectReduceBG &&
    state.expectFinalizePipeline &&
    state.expectFinalizeBG
  ) {
    const expectWG = Math.ceil(totalSites / EXPECT_WG)
    const rPass = ctx.beginComputePass({ label: `tdse-stochastic-expect-reduce-${step}` })
    dispatchCompute(rPass, state.expectReducePipeline, [state.expectReduceBG], expectWG)
    rPass.end()

    const fPass = ctx.beginComputePass({ label: `tdse-stochastic-expect-finalize-${step}` })
    dispatchCompute(fPass, state.expectFinalizePipeline, [state.expectFinalizeBG], 1)
    fPass.end()
  }

  // Apply the centered stochastic localization kick. 3-D dispatch fast-path
  // when latticeDim===3 (skips the per-thread shift/mask coord decomposition).
  const kickPipeline = siteDispatch.use3D && state.pipeline3D ? state.pipeline3D : state.pipeline
  const pass = ctx.beginComputePass({ label: `tdse-stochastic-loc-step${step}` })
  dispatchCompute(pass, kickPipeline, [state.bg], siteDispatch.x, siteDispatch.y, siteDispatch.z)
  pass.end()
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
  state.stagingBuffer?.destroy()
  state.stagingBuffer = null
  state.stagingSlotCount = 0
  state.expectPartialBuffer?.destroy()
  state.expectPartialBuffer = null
  state.expectResultBuffer?.destroy()
  state.expectResultBuffer = null
  state.expectFinalizeUniformBuffer?.destroy()
  state.expectFinalizeUniformBuffer = null
  state.bg = null
  state.expectReduceBG = null
  state.expectFinalizeBG = null
  // Pipelines are GC'd by the underlying GPUDevice; null the refs so a
  // subsequent buildStochasticLocPipeline call recompiles cleanly.
  state.pipeline = null
  state.pipeline3D = null
  state.stepCounter = 0
  state.rng = null
  state.lastSeed = -1
}
