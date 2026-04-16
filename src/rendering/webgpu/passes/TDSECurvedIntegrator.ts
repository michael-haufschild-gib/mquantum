/**
 * TDSE Curved-Space RK4 Integrator
 *
 * One classical 4th-order Runge–Kutta step of ∂_t ψ = (−i/ℏ) · Ĥ ψ on a
 * curved spatial metric (Morris–Thorne v1). All state is kept in GPU
 * scratch buffers managed by this module; the owning {@link TDSEComputePass}
 * holds a single {@link CurvedIntegratorState} and invokes
 * {@link runCurvedRK4Step} from its evolution branch.
 *
 * Pipelines:
 *   - kinetic:    Tψ into tmp (see tdseCurvedKineticBlock)
 *   - buildK:     k = (−i/ℏ)(Tψ + V·ψ_in) (see tdseCurvedBuildKBlock)
 *   - stage:      staged = ψ + α · k (with α from small uniform)
 *   - accumulate: ψ += coef · dt · k (coef from small uniform)
 *
 * Scratch (allocated once per lattice rebuild, sized totalSites * 4 bytes
 * per Float32 array):
 *   - stagedRe, stagedIm        — RK4 intermediate input ψ + α·k
 *   - tmpRe,    tmpIm           — Tψ scratch (overwritten per k_m)
 *   - k{1..4}Re, k{1..4}Im      — RK4 derivatives
 *
 * Small 16-byte uniform buffers hold the RK4 constants 0.5/0.5/1.0 (stage α)
 * and 1/6/2/6/2/6/1/6 (accumulate coef). These are dt-independent and are
 * written once at buffer rebuild time; dt itself is read from TDSEUniforms.
 *
 * Zero-regression invariant: no entry point in this module mutates any
 * existing TDSE buffer or pipeline. Callers that do not instantiate a
 * {@link CurvedIntegratorState} see no side effects.
 *
 * @module rendering/webgpu/passes/TDSECurvedIntegrator
 */

import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import {
  tdseCurvedAccumulateBlock,
  tdseCurvedBuildKBlock,
  tdseCurvedKineticBlock,
  tdseCurvedStageBlock,
} from '../shaders/schroedinger/compute/tdseCurvedKinetic.wgsl'
import { tdseUniformsBlock } from '../shaders/schroedinger/compute/tdseUniforms.wgsl'
import { createComputeBGL } from '../utils/computeBindGroupLayout'
import { TDSE_UNIFORM_OFFSET_STAGE_TIME_K1 } from './TDSEComputePassBuffers'

/** Workgroup size — must match `@workgroup_size` in all curved kernels. */
const CURVED_WG = 64

/**
 * Maximum number of Strang steps per frame for which the curved integrator
 * can stage pre-computed RK4 stage times. Sized for 64 — well above any
 * realistic `stepsPerFrame` × `speed` product, and small enough to fit in a
 * single 1 KiB uniform-staging buffer.
 */
export const CURVED_MAX_STEPS_PER_FRAME = 64

/**
 * Byte offset of the `stageTimeK1` field inside `TDSEUniforms`. Used by
 * the per-step stage-time copy. Re-exported under a local name for call
 * sites in this module; the canonical source lives in
 * {@link TDSE_UNIFORM_OFFSET_STAGE_TIME_K1}.
 */
export const CURVED_STAGE_TIMES_OFFSET = TDSE_UNIFORM_OFFSET_STAGE_TIME_K1

/** Byte size of one (K1, K2, K3, K4) quartet of f32 stage times. */
export const CURVED_STAGE_TIMES_STRIDE = 16

/** Factory signatures matching the base pass's protected helpers. */
type CreateShaderModule = (device: GPUDevice, code: string, label: string) => GPUShaderModule
type CreateComputePipeline = (
  device: GPUDevice,
  module: GPUShaderModule,
  layouts: GPUBindGroupLayout[],
  label: string
) => GPUComputePipeline

/** Compiled curved-integrator pipelines and their bind-group layouts. */
export interface CurvedIntegratorPipelines {
  kineticPipeline: GPUComputePipeline
  /** Group 0: uniform + psi(re,im) + out(re,im) storage. */
  kineticBGL: GPUBindGroupLayout
  /**
   * Group 1 for the kinetic pipeline: 16-byte uniform holding the current
   * RK4 stage index (0..3). Used by time-dependent metrics (deSitter) to
   * select one of `TDSEUniforms.stageTimeK{1..4}`.
   */
  kineticStageBGL: GPUBindGroupLayout
  buildKPipeline: GPUComputePipeline
  buildKBGL: GPUBindGroupLayout
  stagePipeline: GPUComputePipeline
  stageDataBGL: GPUBindGroupLayout
  stageScalarBGL: GPUBindGroupLayout
  accumulatePipeline: GPUComputePipeline
  accumulateDataBGL: GPUBindGroupLayout
  accumulateScalarBGL: GPUBindGroupLayout
}

/** Float32 scratch buffers used by the RK4 loop (all sized totalSites * 4 bytes). */
export interface CurvedIntegratorScratch {
  stagedRe: GPUBuffer
  stagedIm: GPUBuffer
  tmpRe: GPUBuffer
  tmpIm: GPUBuffer
  k1Re: GPUBuffer
  k1Im: GPUBuffer
  k2Re: GPUBuffer
  k2Im: GPUBuffer
  k3Re: GPUBuffer
  k3Im: GPUBuffer
  k4Re: GPUBuffer
  k4Im: GPUBuffer
  /** Small 16-byte uniform buffers, pre-populated with RK4 constants. */
  alpha05Buffer: GPUBuffer // α = 0.5 (for k2, k3 staging)
  alpha10Buffer: GPUBuffer // α = 1.0 (for k4 staging)
  coef1Buffer: GPUBuffer // c = 1/6
  coef2Buffer: GPUBuffer // c = 2/6
  coef3Buffer: GPUBuffer // c = 2/6 (separate buffer to keep one BG per k)
  coef4Buffer: GPUBuffer // c = 1/6
  /**
   * Four 16-byte uniforms holding u32 stage indices 0, 1, 2, 3. Bound to
   * group 1 of the kinetic pipeline, one per k_m, so the shader can pick
   * the correct stageTimeK{1..4} field from TDSEUniforms.
   */
  stageIndex0Buffer: GPUBuffer
  stageIndex1Buffer: GPUBuffer
  stageIndex2Buffer: GPUBuffer
  stageIndex3Buffer: GPUBuffer
  /**
   * Per-frame staging for RK4 stage-time offsets. One (K1,K2,K3,K4) quartet
   * per step, sized for up to {@link CURVED_MAX_STEPS_PER_FRAME} steps. The
   * CPU fills this once per frame via {@link writeCurvedStageTimes}, then
   * the encoder copies the active slot into the TDSEUniforms buffer before
   * each RK4 step via {@link copyCurvedStageTimesForStep}. Without this,
   * `stageTimeK1..K4` in `TDSEUniforms` remain at the frame-start value for
   * every step in a `stepsPerFrame > 1` frame — breaking time-dependent
   * metrics (`deSitter` a(t) = exp(H·t)) by ~(stepsPerFrame−1)·dt per frame.
   */
  stageTimeStagingBuffer: GPUBuffer
  /** CPU-side Float32 view backing `stageTimeStagingBuffer`. */
  stageTimeStagingData: Float32Array
  totalSites: number
}

/** Bind groups for the RK4 dispatches, rebuilt when buffers change. */
export interface CurvedIntegratorBindGroups {
  /** Kinetic with live ψ as input (used for k1). */
  kineticPsiBG: GPUBindGroup
  /** Kinetic with staged scratch as input (used for k2, k3, k4). */
  kineticStagedBG: GPUBindGroup
  /** Stage-index bind groups for group 1 of the kinetic pipeline. */
  stageIndex0BG: GPUBindGroup
  stageIndex1BG: GPUBindGroup
  stageIndex2BG: GPUBindGroup
  stageIndex3BG: GPUBindGroup
  /** buildK for each k_m — input stage is ψ for k1, staged for k2..k4. */
  buildK1BG: GPUBindGroup
  buildK2BG: GPUBindGroup
  buildK3BG: GPUBindGroup
  buildK4BG: GPUBindGroup
  /** stage for building the k2/k3/k4 inputs. Output always targets staged. */
  stageFromK1BG: GPUBindGroup
  stageFromK2BG: GPUBindGroup
  stageFromK3BG: GPUBindGroup
  /** Stage α source buffers (in their own bind group, group 1). */
  stageAlpha05BG: GPUBindGroup
  stageAlpha10BG: GPUBindGroup
  /** accumulate for each k_m (writes into live ψ). */
  accumulateK1BG: GPUBindGroup
  accumulateK2BG: GPUBindGroup
  accumulateK3BG: GPUBindGroup
  accumulateK4BG: GPUBindGroup
  /** accumulate coef source buffers (group 1). */
  accCoef1BG: GPUBindGroup
  accCoef2BG: GPUBindGroup
  accCoef3BG: GPUBindGroup
  accCoef4BG: GPUBindGroup
}

/** Full state owned by a {@link TDSEComputePass} instance for the curved path. */
export interface CurvedIntegratorState {
  pipelines: CurvedIntegratorPipelines | null
  scratch: CurvedIntegratorScratch | null
  bindGroups: CurvedIntegratorBindGroups | null
}

/** Create a fresh (empty) curved integrator state. */
export function createCurvedIntegratorState(): CurvedIntegratorState {
  return { pipelines: null, scratch: null, bindGroups: null }
}

/**
 * Compile all curved-integrator pipelines. Call once per device lifetime;
 * safe to call lazily on first curved dispatch so that flat-only sessions
 * never pay the shader-compile cost.
 */
export function buildCurvedPipelines(
  device: GPUDevice,
  createShaderModule: CreateShaderModule,
  createComputePipeline: CreateComputePipeline
): CurvedIntegratorPipelines {
  const unifAndIndex = tdseUniformsBlock + freeScalarNDIndexBlock

  // Kinetic: group 0 = uniform + 2 read-only storage (psi) + 2 storage (tmp out).
  // Group 1 = 16-byte RK4 stage-index uniform, rebound per k_m so the shader
  // can select the right stageTimeK{1..4} for time-dependent metrics.
  const kineticBGL = createComputeBGL(device, 'tdse-curved-kinetic-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'storage',
    'storage',
  ])
  const kineticStageBGL = createComputeBGL(device, 'tdse-curved-kinetic-stage-bgl', ['uniform'])
  const kineticPipeline = createComputePipeline(
    device,
    createShaderModule(device, unifAndIndex + tdseCurvedKineticBlock, 'tdse-curved-kinetic'),
    [kineticBGL, kineticStageBGL],
    'tdse-curved-kinetic'
  )

  // buildK: uniform + T(re,im) + stageIn(re,im) + potential + k(re,im).
  const buildKBGL = createComputeBGL(device, 'tdse-curved-buildk-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'storage',
    'storage',
  ])
  const buildKPipeline = createComputePipeline(
    device,
    createShaderModule(device, unifAndIndex + tdseCurvedBuildKBlock, 'tdse-curved-buildk'),
    [buildKBGL],
    'tdse-curved-buildk'
  )

  // stage: two bind groups. G0: uniform + psi + k + staged-out. G1: α uniform.
  const stageDataBGL = createComputeBGL(device, 'tdse-curved-stage-data-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'storage',
    'storage',
  ])
  const stageScalarBGL = createComputeBGL(device, 'tdse-curved-stage-scalar-bgl', ['uniform'])
  const stagePipeline = createComputePipeline(
    device,
    createShaderModule(device, unifAndIndex + tdseCurvedStageBlock, 'tdse-curved-stage'),
    [stageDataBGL, stageScalarBGL],
    'tdse-curved-stage'
  )

  // accumulate: G0: uniform + psi(rw) + k(r). G1: coef uniform.
  const accumulateDataBGL = createComputeBGL(device, 'tdse-curved-accumulate-data-bgl', [
    'uniform',
    'storage',
    'storage',
    'read-only-storage',
    'read-only-storage',
  ])
  const accumulateScalarBGL = createComputeBGL(device, 'tdse-curved-accumulate-scalar-bgl', [
    'uniform',
  ])
  const accumulatePipeline = createComputePipeline(
    device,
    createShaderModule(device, unifAndIndex + tdseCurvedAccumulateBlock, 'tdse-curved-accumulate'),
    [accumulateDataBGL, accumulateScalarBGL],
    'tdse-curved-accumulate'
  )

  return {
    kineticPipeline,
    kineticBGL,
    kineticStageBGL,
    buildKPipeline,
    buildKBGL,
    stagePipeline,
    stageDataBGL,
    stageScalarBGL,
    accumulatePipeline,
    accumulateDataBGL,
    accumulateScalarBGL,
  }
}

/** Create an f32 storage buffer with the usual RK4-scratch usage flags. */
function createScratch(device: GPUDevice, totalSites: number, label: string): GPUBuffer {
  return device.createBuffer({
    label,
    size: totalSites * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
}

/** Create + populate a small 16-byte uniform buffer holding one f32 value. */
function createScalarUniform(device: GPUDevice, label: string, value: number): GPUBuffer {
  const buf = device.createBuffer({
    label,
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const data = new ArrayBuffer(16)
  new Float32Array(data)[0] = value
  device.queue.writeBuffer(buf, 0, data)
  return buf
}

/** Create + populate a small 16-byte uniform buffer holding one u32 value. */
function createU32Uniform(device: GPUDevice, label: string, value: number): GPUBuffer {
  const buf = device.createBuffer({
    label,
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const data = new ArrayBuffer(16)
  new Uint32Array(data)[0] = value >>> 0
  device.queue.writeBuffer(buf, 0, data)
  return buf
}

/** Destroy every scratch buffer held by the integrator state (safe on null). */
export function disposeCurvedScratch(scratch: CurvedIntegratorScratch | null): void {
  if (!scratch) return
  scratch.stagedRe.destroy()
  scratch.stagedIm.destroy()
  scratch.tmpRe.destroy()
  scratch.tmpIm.destroy()
  scratch.k1Re.destroy()
  scratch.k1Im.destroy()
  scratch.k2Re.destroy()
  scratch.k2Im.destroy()
  scratch.k3Re.destroy()
  scratch.k3Im.destroy()
  scratch.k4Re.destroy()
  scratch.k4Im.destroy()
  scratch.alpha05Buffer.destroy()
  scratch.alpha10Buffer.destroy()
  scratch.coef1Buffer.destroy()
  scratch.coef2Buffer.destroy()
  scratch.coef3Buffer.destroy()
  scratch.coef4Buffer.destroy()
  scratch.stageIndex0Buffer.destroy()
  scratch.stageIndex1Buffer.destroy()
  scratch.stageIndex2Buffer.destroy()
  scratch.stageIndex3Buffer.destroy()
  scratch.stageTimeStagingBuffer.destroy()
}

/**
 * Allocate fresh scratch buffers (and the small RK4-constant uniforms) for
 * a lattice of `totalSites` voxels. Caller must {@link disposeCurvedScratch}
 * any prior scratch before overwriting.
 */
export function createCurvedScratchBuffers(
  device: GPUDevice,
  totalSites: number
): CurvedIntegratorScratch {
  const mk = (label: string) => createScratch(device, totalSites, label)
  const oneSixth = 1 / 6
  const twoSixths = 2 / 6
  // 4 f32 per step, one step per active RK4 frame. COPY_SRC so
  // `copyBufferToBuffer` can fan it into `TDSEUniforms.stageTimeK{1..4}`
  // before each step's kinetic dispatch. COPY_DST so `device.queue.writeBuffer`
  // can refresh it once per frame.
  const stageTimeStagingBuffer = device.createBuffer({
    label: 'tdse-curved-stage-times-staging',
    size: CURVED_MAX_STEPS_PER_FRAME * CURVED_STAGE_TIMES_STRIDE,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  return {
    stagedRe: mk('tdse-curved-stagedRe'),
    stagedIm: mk('tdse-curved-stagedIm'),
    tmpRe: mk('tdse-curved-tmpRe'),
    tmpIm: mk('tdse-curved-tmpIm'),
    k1Re: mk('tdse-curved-k1Re'),
    k1Im: mk('tdse-curved-k1Im'),
    k2Re: mk('tdse-curved-k2Re'),
    k2Im: mk('tdse-curved-k2Im'),
    k3Re: mk('tdse-curved-k3Re'),
    k3Im: mk('tdse-curved-k3Im'),
    k4Re: mk('tdse-curved-k4Re'),
    k4Im: mk('tdse-curved-k4Im'),
    alpha05Buffer: createScalarUniform(device, 'tdse-curved-alpha-05', 0.5),
    alpha10Buffer: createScalarUniform(device, 'tdse-curved-alpha-10', 1.0),
    coef1Buffer: createScalarUniform(device, 'tdse-curved-coef-1-6', oneSixth),
    coef2Buffer: createScalarUniform(device, 'tdse-curved-coef-2-6a', twoSixths),
    coef3Buffer: createScalarUniform(device, 'tdse-curved-coef-2-6b', twoSixths),
    coef4Buffer: createScalarUniform(device, 'tdse-curved-coef-1-6b', oneSixth),
    stageIndex0Buffer: createU32Uniform(device, 'tdse-curved-stage-idx-0', 0),
    stageIndex1Buffer: createU32Uniform(device, 'tdse-curved-stage-idx-1', 1),
    stageIndex2Buffer: createU32Uniform(device, 'tdse-curved-stage-idx-2', 2),
    stageIndex3Buffer: createU32Uniform(device, 'tdse-curved-stage-idx-3', 3),
    stageTimeStagingBuffer,
    stageTimeStagingData: new Float32Array(CURVED_MAX_STEPS_PER_FRAME * 4),
    totalSites,
  }
}

/**
 * Fill `scratch.stageTimeStagingBuffer` with RK4 stage-time offsets for
 * the next `steps` Strang steps. Stage ordering matches the classical
 * tableau: K1=t, K2=t+dt/2, K3=t+dt/2, K4=t+dt — computed from the
 * absolute simulation time at the START of each step so that
 * time-dependent metrics (deSitter) see the correct `a(t)` across every
 * step in a multi-step frame.
 *
 * Caller must invoke this exactly once per frame, BEFORE the encoder's
 * curved-RK4 loop emits any {@link copyCurvedStageTimesForStep} call.
 * `steps` is clamped to {@link CURVED_MAX_STEPS_PER_FRAME}; excess steps
 * fall back to the last-populated slot — harmless for static metrics and
 * a small remaining drift (~dt per step above the cap) for deSitter,
 * which is only hit when `stepsPerFrame × speed > 64`.
 *
 * @param device - GPU device (for the `writeBuffer` queue).
 * @param scratch - Curved integrator scratch state owning the staging buffer.
 * @param simTimeStart - Simulation time at the start of the frame's first step.
 * @param dt - Integration step size (seconds).
 * @param steps - Number of Strang steps the frame will execute.
 */
export function writeCurvedStageTimes(
  device: GPUDevice,
  scratch: CurvedIntegratorScratch,
  simTimeStart: number,
  dt: number,
  steps: number
): void {
  const clampedSteps = Math.max(0, Math.min(steps, CURVED_MAX_STEPS_PER_FRAME))
  if (clampedSteps === 0) return
  const data = scratch.stageTimeStagingData
  const halfDt = 0.5 * dt
  for (let s = 0; s < clampedSteps; s++) {
    const t = simTimeStart + s * dt
    const base = s * 4
    data[base] = t // K1 = t
    data[base + 1] = t + halfDt // K2 = t + dt/2
    data[base + 2] = t + halfDt // K3 = t + dt/2
    data[base + 3] = t + dt // K4 = t + dt
  }
  // Upload only the populated prefix. WebGPU writeBuffer is queue-serialized,
  // so this completes before the command buffer that reads the staging data
  // via copyBufferToBuffer.
  device.queue.writeBuffer(
    scratch.stageTimeStagingBuffer,
    0,
    data.buffer,
    data.byteOffset,
    clampedSteps * CURVED_STAGE_TIMES_STRIDE
  )
}

/**
 * Emit a `copyBufferToBuffer` that copies the 4 RK4 stage times for step
 * `stepIdx` from the staging buffer into `TDSEUniforms.stageTimeK{1..4}`.
 * Must run on the same encoder as the subsequent RK4 kinetic dispatches so
 * the copy is ordered before the dispatches read the uniform.
 *
 * Out-of-range `stepIdx` (≥ {@link CURVED_MAX_STEPS_PER_FRAME}) is clamped
 * to the last slot to avoid a GPU validation error; the small residual
 * drift is acceptable only on deSitter and only when stepsPerFrame × speed
 * exceeds the cap.
 */
export function copyCurvedStageTimesForStep(
  encoder: GPUCommandEncoder,
  scratch: CurvedIntegratorScratch,
  uniformBuffer: GPUBuffer,
  stepIdx: number
): void {
  const safeIdx = Math.max(0, Math.min(stepIdx, CURVED_MAX_STEPS_PER_FRAME - 1))
  encoder.copyBufferToBuffer(
    scratch.stageTimeStagingBuffer,
    safeIdx * CURVED_STAGE_TIMES_STRIDE,
    uniformBuffer,
    CURVED_STAGE_TIMES_OFFSET,
    CURVED_STAGE_TIMES_STRIDE
  )
}

/** Inputs required to (re)build the RK4 bind groups. */
export interface CurvedBindGroupInputs {
  uniformBuffer: GPUBuffer
  psiReBuffer: GPUBuffer
  psiImBuffer: GPUBuffer
  potentialBuffer: GPUBuffer
  scratch: CurvedIntegratorScratch
}

/**
 * Rebuild every bind group used by the RK4 dispatches. Must be called whenever
 * the pass-owned ψ / potential buffers change (i.e. on lattice rebuild).
 */
export function rebuildCurvedBindGroups(
  device: GPUDevice,
  pipelines: CurvedIntegratorPipelines,
  inputs: CurvedBindGroupInputs
): CurvedIntegratorBindGroups {
  const { uniformBuffer: uni, psiReBuffer: psiRe, psiImBuffer: psiIm } = inputs
  const { potentialBuffer: V, scratch: s } = inputs

  const mkBG = (label: string, layout: GPUBindGroupLayout, entries: GPUBindGroupEntry[]) =>
    device.createBindGroup({ label, layout, entries })

  // Kinetic variants. Input ψ source differs; output tmp is shared.
  const kineticPsiBG = mkBG('tdse-curved-kinetic-psi-bg', pipelines.kineticBGL, [
    { binding: 0, resource: { buffer: uni } },
    { binding: 1, resource: { buffer: psiRe } },
    { binding: 2, resource: { buffer: psiIm } },
    { binding: 3, resource: { buffer: s.tmpRe } },
    { binding: 4, resource: { buffer: s.tmpIm } },
  ])
  const kineticStagedBG = mkBG('tdse-curved-kinetic-staged-bg', pipelines.kineticBGL, [
    { binding: 0, resource: { buffer: uni } },
    { binding: 1, resource: { buffer: s.stagedRe } },
    { binding: 2, resource: { buffer: s.stagedIm } },
    { binding: 3, resource: { buffer: s.tmpRe } },
    { binding: 4, resource: { buffer: s.tmpIm } },
  ])

  // buildK — one BG per k_m. Stage input is ψ for k1, staged scratch for k2..k4.
  const mkBuildK = (
    label: string,
    stageReBuf: GPUBuffer,
    stageImBuf: GPUBuffer,
    kReBuf: GPUBuffer,
    kImBuf: GPUBuffer
  ): GPUBindGroup =>
    mkBG(label, pipelines.buildKBGL, [
      { binding: 0, resource: { buffer: uni } },
      { binding: 1, resource: { buffer: s.tmpRe } },
      { binding: 2, resource: { buffer: s.tmpIm } },
      { binding: 3, resource: { buffer: stageReBuf } },
      { binding: 4, resource: { buffer: stageImBuf } },
      { binding: 5, resource: { buffer: V } },
      { binding: 6, resource: { buffer: kReBuf } },
      { binding: 7, resource: { buffer: kImBuf } },
    ])
  const buildK1BG = mkBuildK('tdse-curved-buildk-1', psiRe, psiIm, s.k1Re, s.k1Im)
  const buildK2BG = mkBuildK('tdse-curved-buildk-2', s.stagedRe, s.stagedIm, s.k2Re, s.k2Im)
  const buildK3BG = mkBuildK('tdse-curved-buildk-3', s.stagedRe, s.stagedIm, s.k3Re, s.k3Im)
  const buildK4BG = mkBuildK('tdse-curved-buildk-4', s.stagedRe, s.stagedIm, s.k4Re, s.k4Im)

  // stage — reads live ψ + one k_m, writes staged. Group 1 holds the α scalar.
  const mkStageFromK = (label: string, kReBuf: GPUBuffer, kImBuf: GPUBuffer): GPUBindGroup =>
    mkBG(label, pipelines.stageDataBGL, [
      { binding: 0, resource: { buffer: uni } },
      { binding: 1, resource: { buffer: psiRe } },
      { binding: 2, resource: { buffer: psiIm } },
      { binding: 3, resource: { buffer: kReBuf } },
      { binding: 4, resource: { buffer: kImBuf } },
      { binding: 5, resource: { buffer: s.stagedRe } },
      { binding: 6, resource: { buffer: s.stagedIm } },
    ])
  const stageFromK1BG = mkStageFromK('tdse-curved-stage-from-k1', s.k1Re, s.k1Im)
  const stageFromK2BG = mkStageFromK('tdse-curved-stage-from-k2', s.k2Re, s.k2Im)
  const stageFromK3BG = mkStageFromK('tdse-curved-stage-from-k3', s.k3Re, s.k3Im)
  const stageAlpha05BG = mkBG('tdse-curved-stage-alpha-05', pipelines.stageScalarBGL, [
    { binding: 0, resource: { buffer: s.alpha05Buffer } },
  ])
  const stageAlpha10BG = mkBG('tdse-curved-stage-alpha-10', pipelines.stageScalarBGL, [
    { binding: 0, resource: { buffer: s.alpha10Buffer } },
  ])

  // accumulate — one BG per k_m, each writes into live ψ. Group 1 holds the coef scalar.
  const mkAccBG = (label: string, kReBuf: GPUBuffer, kImBuf: GPUBuffer): GPUBindGroup =>
    mkBG(label, pipelines.accumulateDataBGL, [
      { binding: 0, resource: { buffer: uni } },
      { binding: 1, resource: { buffer: psiRe } },
      { binding: 2, resource: { buffer: psiIm } },
      { binding: 3, resource: { buffer: kReBuf } },
      { binding: 4, resource: { buffer: kImBuf } },
    ])
  const accumulateK1BG = mkAccBG('tdse-curved-accumulate-k1', s.k1Re, s.k1Im)
  const accumulateK2BG = mkAccBG('tdse-curved-accumulate-k2', s.k2Re, s.k2Im)
  const accumulateK3BG = mkAccBG('tdse-curved-accumulate-k3', s.k3Re, s.k3Im)
  const accumulateK4BG = mkAccBG('tdse-curved-accumulate-k4', s.k4Re, s.k4Im)
  const accCoef1BG = mkBG('tdse-curved-acc-coef-1', pipelines.accumulateScalarBGL, [
    { binding: 0, resource: { buffer: s.coef1Buffer } },
  ])
  const accCoef2BG = mkBG('tdse-curved-acc-coef-2', pipelines.accumulateScalarBGL, [
    { binding: 0, resource: { buffer: s.coef2Buffer } },
  ])
  const accCoef3BG = mkBG('tdse-curved-acc-coef-3', pipelines.accumulateScalarBGL, [
    { binding: 0, resource: { buffer: s.coef3Buffer } },
  ])
  const accCoef4BG = mkBG('tdse-curved-acc-coef-4', pipelines.accumulateScalarBGL, [
    { binding: 0, resource: { buffer: s.coef4Buffer } },
  ])

  // Kinetic group-1 stage-index bind groups — one per RK4 stage. The
  // kineticStageBGL layout holds a single 16-byte uniform; bound per k_m.
  const stageIndex0BG = mkBG('tdse-curved-kinetic-stage-0', pipelines.kineticStageBGL, [
    { binding: 0, resource: { buffer: s.stageIndex0Buffer } },
  ])
  const stageIndex1BG = mkBG('tdse-curved-kinetic-stage-1', pipelines.kineticStageBGL, [
    { binding: 0, resource: { buffer: s.stageIndex1Buffer } },
  ])
  const stageIndex2BG = mkBG('tdse-curved-kinetic-stage-2', pipelines.kineticStageBGL, [
    { binding: 0, resource: { buffer: s.stageIndex2Buffer } },
  ])
  const stageIndex3BG = mkBG('tdse-curved-kinetic-stage-3', pipelines.kineticStageBGL, [
    { binding: 0, resource: { buffer: s.stageIndex3Buffer } },
  ])

  return {
    kineticPsiBG,
    kineticStagedBG,
    stageIndex0BG,
    stageIndex1BG,
    stageIndex2BG,
    stageIndex3BG,
    buildK1BG,
    buildK2BG,
    buildK3BG,
    buildK4BG,
    stageFromK1BG,
    stageFromK2BG,
    stageFromK3BG,
    stageAlpha05BG,
    stageAlpha10BG,
    accumulateK1BG,
    accumulateK2BG,
    accumulateK3BG,
    accumulateK4BG,
    accCoef1BG,
    accCoef2BG,
    accCoef3BG,
    accCoef4BG,
  }
}

/**
 * Encode one classical RK4 step of the curved-space TDSE.
 *
 * Requires the state's pipelines, scratch, and bind groups to be populated;
 * caller (TDSEComputePass) must have ensured that via
 * {@link buildCurvedPipelines}, {@link createCurvedScratchBuffers}, and
 * {@link rebuildCurvedBindGroups}. The per-step dt is read from the
 * TDSEUniforms buffer on the GPU (already populated by `writeTdseUniforms`).
 *
 * @param encoder - Current frame command encoder.
 * @param state - Fully populated curved integrator state.
 */
export function runCurvedRK4Step(encoder: GPUCommandEncoder, state: CurvedIntegratorState): void {
  const { pipelines, scratch, bindGroups } = state
  if (!pipelines || !scratch || !bindGroups) return
  const wgCount = Math.ceil(scratch.totalSites / CURVED_WG)

  const pass = encoder.beginComputePass({ label: 'tdse-curved-rk4-step' })

  // ─── k1 ───────────────────────────────────────────────────────────────
  // Tψ into tmp (using live ψ as input). Stage index 0 → stageTimeK1.
  pass.setPipeline(pipelines.kineticPipeline)
  pass.setBindGroup(0, bindGroups.kineticPsiBG)
  pass.setBindGroup(1, bindGroups.stageIndex0BG)
  pass.dispatchWorkgroups(wgCount)
  // k1 = (−i/ℏ)(Tψ + V·ψ).
  pass.setPipeline(pipelines.buildKPipeline)
  pass.setBindGroup(0, bindGroups.buildK1BG)
  pass.dispatchWorkgroups(wgCount)
  // Stage for k2: staged = ψ + 0.5·k1.
  pass.setPipeline(pipelines.stagePipeline)
  pass.setBindGroup(0, bindGroups.stageFromK1BG)
  pass.setBindGroup(1, bindGroups.stageAlpha05BG)
  pass.dispatchWorkgroups(wgCount)

  // ─── k2 ─── Stage index 1 → stageTimeK2 = t + dt/2.
  pass.setPipeline(pipelines.kineticPipeline)
  pass.setBindGroup(0, bindGroups.kineticStagedBG)
  pass.setBindGroup(1, bindGroups.stageIndex1BG)
  pass.dispatchWorkgroups(wgCount)
  pass.setPipeline(pipelines.buildKPipeline)
  pass.setBindGroup(0, bindGroups.buildK2BG)
  pass.dispatchWorkgroups(wgCount)
  // Stage for k3: staged = ψ + 0.5·k2.
  pass.setPipeline(pipelines.stagePipeline)
  pass.setBindGroup(0, bindGroups.stageFromK2BG)
  pass.setBindGroup(1, bindGroups.stageAlpha05BG)
  pass.dispatchWorkgroups(wgCount)

  // ─── k3 ─── Stage index 2 → stageTimeK3 = t + dt/2.
  pass.setPipeline(pipelines.kineticPipeline)
  pass.setBindGroup(0, bindGroups.kineticStagedBG)
  pass.setBindGroup(1, bindGroups.stageIndex2BG)
  pass.dispatchWorkgroups(wgCount)
  pass.setPipeline(pipelines.buildKPipeline)
  pass.setBindGroup(0, bindGroups.buildK3BG)
  pass.dispatchWorkgroups(wgCount)
  // Stage for k4: staged = ψ + 1.0·k3.
  pass.setPipeline(pipelines.stagePipeline)
  pass.setBindGroup(0, bindGroups.stageFromK3BG)
  pass.setBindGroup(1, bindGroups.stageAlpha10BG)
  pass.dispatchWorkgroups(wgCount)

  // ─── k4 ─── Stage index 3 → stageTimeK4 = t + dt.
  pass.setPipeline(pipelines.kineticPipeline)
  pass.setBindGroup(0, bindGroups.kineticStagedBG)
  pass.setBindGroup(1, bindGroups.stageIndex3BG)
  pass.dispatchWorkgroups(wgCount)
  pass.setPipeline(pipelines.buildKPipeline)
  pass.setBindGroup(0, bindGroups.buildK4BG)
  pass.dispatchWorkgroups(wgCount)

  // ─── final combine: ψ += (dt/6)(k1 + 2k2 + 2k3 + k4) as four dispatches ──
  pass.setPipeline(pipelines.accumulatePipeline)
  pass.setBindGroup(0, bindGroups.accumulateK1BG)
  pass.setBindGroup(1, bindGroups.accCoef1BG)
  pass.dispatchWorkgroups(wgCount)
  pass.setBindGroup(0, bindGroups.accumulateK2BG)
  pass.setBindGroup(1, bindGroups.accCoef2BG)
  pass.dispatchWorkgroups(wgCount)
  pass.setBindGroup(0, bindGroups.accumulateK3BG)
  pass.setBindGroup(1, bindGroups.accCoef3BG)
  pass.dispatchWorkgroups(wgCount)
  pass.setBindGroup(0, bindGroups.accumulateK4BG)
  pass.setBindGroup(1, bindGroups.accCoef4BG)
  pass.dispatchWorkgroups(wgCount)

  pass.end()
}
