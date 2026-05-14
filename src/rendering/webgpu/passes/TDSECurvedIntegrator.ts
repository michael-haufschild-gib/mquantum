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
 * Scratch (allocated once per lattice rebuild, sized totalSites * 8 bytes
 * per `array<vec2f>` buffer; .x = Re, .y = Im):
 *   - staged                    — RK4 intermediate input ψ + α·k
 *   - tmp                       — Tψ scratch (overwritten per k_m)
 *   - k1, k2, k3, k4            — RK4 derivatives
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
  tdseCurvedKineticBlock3D,
  tdseCurvedStageBlock,
} from '../shaders/schroedinger/compute/tdseCurvedKinetic.wgsl'
import { tdseUniformsBlock } from '../shaders/schroedinger/compute/tdseUniforms.wgsl'
import { createComputeBGL } from '../utils/computeBindGroupLayout'
import type { SiteDispatch } from './computePassUtils'
import { TDSE_UNIFORM_OFFSET_STAGE_TIME_K1 } from './TDSEComputePassResources'

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

function sanitizeCurvedStageStepCount(steps: number): number {
  if (!Number.isFinite(steps) || steps <= 0) return 0
  return Math.min(Math.floor(steps), CURVED_MAX_STEPS_PER_FRAME)
}

function sanitizeCurvedStageStepIndex(stepIdx: number): number {
  if (!Number.isFinite(stepIdx) || stepIdx <= 0) return 0
  return Math.min(Math.floor(stepIdx), CURVED_MAX_STEPS_PER_FRAME - 1)
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0
}

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
  /**
   * 3-D dispatch sibling of {@link kineticPipeline}. Same BGLs, same body;
   * @workgroup_size(4,4,4) reads gid.xyz directly. Selected by host when
   * latticeDim===3 (see pickSiteDispatch in computePassUtils).
   */
  kineticPipeline3D: GPUComputePipeline
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

/**
 * vec2f scratch buffers used by the RK4 loop (all sized totalSites * 8 bytes;
 * each site stores one `vec2f` = .x Re, .y Im). Previous split Re/Im pairs
 * have been merged to match the TDSE-wide `array<vec2f>` ψ layout.
 */
export interface CurvedIntegratorScratch {
  staged: GPUBuffer
  tmp: GPUBuffer
  k1: GPUBuffer
  k2: GPUBuffer
  k3: GPUBuffer
  k4: GPUBuffer
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

// --- Pure WGSL composers (Phase 2b) ---
// All four compose functions share the same prelude (`tdseUniformsBlock +
// freeScalarNDIndexBlock`); each appends its specific kernel block.
const curvedPrelude = (): string => tdseUniformsBlock + freeScalarNDIndexBlock

/** Pure WGSL for the curved-kinetic half-step compute shader (1-D variant). */
export function composeTdseCurvedKineticShader(): string {
  return curvedPrelude() + tdseCurvedKineticBlock
}

/**
 * Pure WGSL for the curved-kinetic half-step compute shader (3-D variant).
 * Bit-identical output to {@link composeTdseCurvedKineticShader}; only
 * the dispatch shape and per-thread coord-decomposition path differ.
 */
export function composeTdseCurvedKinetic3DShader(): string {
  return curvedPrelude() + tdseCurvedKineticBlock3D
}

/** Pure WGSL for the curved RK4 buildK compute shader. */
export function composeTdseCurvedBuildKShader(): string {
  return curvedPrelude() + tdseCurvedBuildKBlock
}

/** Pure WGSL for the curved RK4 stage compute shader. */
export function composeTdseCurvedStageShader(): string {
  return curvedPrelude() + tdseCurvedStageBlock
}

/** Pure WGSL for the curved RK4 accumulate compute shader. */
export function composeTdseCurvedAccumulateShader(): string {
  return curvedPrelude() + tdseCurvedAccumulateBlock
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
  // Kinetic: group 0 = TDSEUniforms(storage) + ψ(vec2f read) + tmp(vec2f storage).
  // Group 1 = 16-byte RK4 stage-index uniform, rebound per k_m so the shader
  // can select the right stageTimeK{1..4} for time-dependent metrics.
  // Binding 0 (TDSEUniforms) — see tdseInit.wgsl.ts for the spec-noncompliance rationale.
  const kineticBGL = createComputeBGL(device, 'tdse-curved-kinetic-bgl', [
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const kineticStageBGL = createComputeBGL(device, 'tdse-curved-kinetic-stage-bgl', ['uniform'])
  const kineticPipeline = createComputePipeline(
    device,
    createShaderModule(device, composeTdseCurvedKineticShader(), 'tdse-curved-kinetic'),
    [kineticBGL, kineticStageBGL],
    'tdse-curved-kinetic'
  )
  const kineticPipeline3D = createComputePipeline(
    device,
    createShaderModule(device, composeTdseCurvedKinetic3DShader(), 'tdse-curved-kinetic-3d'),
    [kineticBGL, kineticStageBGL],
    'tdse-curved-kinetic-3d'
  )

  // buildK: TDSEUniforms(storage) + T(vec2f) + stageIn(vec2f) + potential + k(vec2f).
  // Binding 0 (TDSEUniforms) — see kinetic BGL comment.
  const buildKBGL = createComputeBGL(device, 'tdse-curved-buildk-bgl', [
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const buildKPipeline = createComputePipeline(
    device,
    createShaderModule(device, composeTdseCurvedBuildKShader(), 'tdse-curved-buildk'),
    [buildKBGL],
    'tdse-curved-buildk'
  )

  // stage: two bind groups. G0: TDSEUniforms(storage) + psi(vec2f) + k(vec2f) + stagedOut(vec2f). G1: α uniform.
  // Binding 0 (TDSEUniforms) — see kinetic BGL comment.
  const stageDataBGL = createComputeBGL(device, 'tdse-curved-stage-data-bgl', [
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const stageScalarBGL = createComputeBGL(device, 'tdse-curved-stage-scalar-bgl', ['uniform'])
  const stagePipeline = createComputePipeline(
    device,
    createShaderModule(device, composeTdseCurvedStageShader(), 'tdse-curved-stage'),
    [stageDataBGL, stageScalarBGL],
    'tdse-curved-stage'
  )

  // accumulate: G0: TDSEUniforms(storage) + psi(vec2f rw) + k(vec2f r). G1: coef uniform.
  // Binding 0 (TDSEUniforms) — see kinetic BGL comment.
  const accumulateDataBGL = createComputeBGL(device, 'tdse-curved-accumulate-data-bgl', [
    'read-only-storage',
    'storage',
    'read-only-storage',
  ])
  const accumulateScalarBGL = createComputeBGL(device, 'tdse-curved-accumulate-scalar-bgl', [
    'uniform',
  ])
  const accumulatePipeline = createComputePipeline(
    device,
    createShaderModule(device, composeTdseCurvedAccumulateShader(), 'tdse-curved-accumulate'),
    [accumulateDataBGL, accumulateScalarBGL],
    'tdse-curved-accumulate'
  )

  return {
    kineticPipeline,
    kineticPipeline3D,
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

/**
 * Create a vec2f (8 bytes/site) storage buffer with the usual RK4-scratch
 * usage flags. Each RK4 scratch array stores one complex ψ per site; this
 * function allocates 2× the site count in f32 terms to cover Re+Im packed
 * into a single `vec2f` element on the GPU.
 */
function createScratch(device: GPUDevice, totalSites: number, label: string): GPUBuffer {
  return device.createBuffer({
    label,
    size: totalSites * 8,
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
  scratch.staged.destroy()
  scratch.tmp.destroy()
  scratch.k1.destroy()
  scratch.k2.destroy()
  scratch.k3.destroy()
  scratch.k4.destroy()
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
    staged: mk('tdse-curved-staged'),
    tmp: mk('tdse-curved-tmp'),
    k1: mk('tdse-curved-k1'),
    k2: mk('tdse-curved-k2'),
    k3: mk('tdse-curved-k3'),
    k4: mk('tdse-curved-k4'),
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
  const clampedSteps = sanitizeCurvedStageStepCount(steps)
  if (clampedSteps === 0) return
  const data = scratch.stageTimeStagingData
  const safeSimTimeStart = finiteOrZero(simTimeStart)
  const safeDt = finiteOrZero(dt)
  const halfDt = 0.5 * safeDt
  for (let s = 0; s < clampedSteps; s++) {
    const t = safeSimTimeStart + s * safeDt
    const base = s * 4
    data[base] = t // K1 = t
    data[base + 1] = t + halfDt // K2 = t + dt/2
    data[base + 2] = t + halfDt // K3 = t + dt/2
    data[base + 3] = t + safeDt // K4 = t + dt
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
  const safeIdx = sanitizeCurvedStageStepIndex(stepIdx)
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
  psiBuffer: GPUBuffer
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
  const { uniformBuffer: uni, psiBuffer: psi } = inputs
  const { potentialBuffer: V, scratch: s } = inputs

  const mkBG = (label: string, layout: GPUBindGroupLayout, entries: GPUBindGroupEntry[]) =>
    device.createBindGroup({ label, layout, entries })

  // Kinetic variants. Input ψ source differs; output tmp is shared.
  const kineticPsiBG = mkBG('tdse-curved-kinetic-psi-bg', pipelines.kineticBGL, [
    { binding: 0, resource: { buffer: uni } },
    { binding: 1, resource: { buffer: psi } },
    { binding: 2, resource: { buffer: s.tmp } },
  ])
  const kineticStagedBG = mkBG('tdse-curved-kinetic-staged-bg', pipelines.kineticBGL, [
    { binding: 0, resource: { buffer: uni } },
    { binding: 1, resource: { buffer: s.staged } },
    { binding: 2, resource: { buffer: s.tmp } },
  ])

  // buildK — one BG per k_m. Stage input is ψ for k1, staged scratch for k2..k4.
  const mkBuildK = (label: string, stageBuf: GPUBuffer, kBuf: GPUBuffer): GPUBindGroup =>
    mkBG(label, pipelines.buildKBGL, [
      { binding: 0, resource: { buffer: uni } },
      { binding: 1, resource: { buffer: s.tmp } },
      { binding: 2, resource: { buffer: stageBuf } },
      { binding: 3, resource: { buffer: V } },
      { binding: 4, resource: { buffer: kBuf } },
    ])
  const buildK1BG = mkBuildK('tdse-curved-buildk-1', psi, s.k1)
  const buildK2BG = mkBuildK('tdse-curved-buildk-2', s.staged, s.k2)
  const buildK3BG = mkBuildK('tdse-curved-buildk-3', s.staged, s.k3)
  const buildK4BG = mkBuildK('tdse-curved-buildk-4', s.staged, s.k4)

  // stage — reads live ψ + one k_m, writes staged. Group 1 holds the α scalar.
  const mkStageFromK = (label: string, kBuf: GPUBuffer): GPUBindGroup =>
    mkBG(label, pipelines.stageDataBGL, [
      { binding: 0, resource: { buffer: uni } },
      { binding: 1, resource: { buffer: psi } },
      { binding: 2, resource: { buffer: kBuf } },
      { binding: 3, resource: { buffer: s.staged } },
    ])
  const stageFromK1BG = mkStageFromK('tdse-curved-stage-from-k1', s.k1)
  const stageFromK2BG = mkStageFromK('tdse-curved-stage-from-k2', s.k2)
  const stageFromK3BG = mkStageFromK('tdse-curved-stage-from-k3', s.k3)
  const stageAlpha05BG = mkBG('tdse-curved-stage-alpha-05', pipelines.stageScalarBGL, [
    { binding: 0, resource: { buffer: s.alpha05Buffer } },
  ])
  const stageAlpha10BG = mkBG('tdse-curved-stage-alpha-10', pipelines.stageScalarBGL, [
    { binding: 0, resource: { buffer: s.alpha10Buffer } },
  ])

  // accumulate — one BG per k_m, each writes into live ψ. Group 1 holds the coef scalar.
  const mkAccBG = (label: string, kBuf: GPUBuffer): GPUBindGroup =>
    mkBG(label, pipelines.accumulateDataBGL, [
      { binding: 0, resource: { buffer: uni } },
      { binding: 1, resource: { buffer: psi } },
      { binding: 2, resource: { buffer: kBuf } },
    ])
  const accumulateK1BG = mkAccBG('tdse-curved-accumulate-k1', s.k1)
  const accumulateK2BG = mkAccBG('tdse-curved-accumulate-k2', s.k2)
  const accumulateK3BG = mkAccBG('tdse-curved-accumulate-k3', s.k3)
  const accumulateK4BG = mkAccBG('tdse-curved-accumulate-k4', s.k4)
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
 * @param siteDispatch - 3-D dispatch shape + variant flag for the kinetic
 *   sub-step. The kinetic kernel reads coords, so the 3-D variant is used
 *   when latticeDim===3. The other three sub-steps (buildK / stage /
 *   accumulate) are pure linear per-site ops and stay on the 1-D path.
 */
export function runCurvedRK4Step(
  encoder: GPUCommandEncoder,
  state: CurvedIntegratorState,
  siteDispatch: SiteDispatch
): void {
  const { pipelines, scratch, bindGroups } = state
  if (!pipelines || !scratch || !bindGroups) return
  const wgCount = Math.ceil(scratch.totalSites / CURVED_WG)
  const kPl = siteDispatch.use3D ? pipelines.kineticPipeline3D : pipelines.kineticPipeline
  const kx = siteDispatch.x
  const ky = siteDispatch.y
  const kz = siteDispatch.z

  const pass = encoder.beginComputePass({ label: 'tdse-curved-rk4-step' })

  // ─── k1 ───────────────────────────────────────────────────────────────
  // Tψ into tmp (using live ψ as input). Stage index 0 → stageTimeK1.
  pass.setPipeline(kPl)
  pass.setBindGroup(0, bindGroups.kineticPsiBG)
  pass.setBindGroup(1, bindGroups.stageIndex0BG)
  pass.dispatchWorkgroups(kx, ky, kz)
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
  pass.setPipeline(kPl)
  pass.setBindGroup(0, bindGroups.kineticStagedBG)
  pass.setBindGroup(1, bindGroups.stageIndex1BG)
  pass.dispatchWorkgroups(kx, ky, kz)
  pass.setPipeline(pipelines.buildKPipeline)
  pass.setBindGroup(0, bindGroups.buildK2BG)
  pass.dispatchWorkgroups(wgCount)
  // Stage for k3: staged = ψ + 0.5·k2.
  pass.setPipeline(pipelines.stagePipeline)
  pass.setBindGroup(0, bindGroups.stageFromK2BG)
  pass.setBindGroup(1, bindGroups.stageAlpha05BG)
  pass.dispatchWorkgroups(wgCount)

  // ─── k3 ─── Stage index 2 → stageTimeK3 = t + dt/2.
  pass.setPipeline(kPl)
  pass.setBindGroup(0, bindGroups.kineticStagedBG)
  pass.setBindGroup(1, bindGroups.stageIndex2BG)
  pass.dispatchWorkgroups(kx, ky, kz)
  pass.setPipeline(pipelines.buildKPipeline)
  pass.setBindGroup(0, bindGroups.buildK3BG)
  pass.dispatchWorkgroups(wgCount)
  // Stage for k4: staged = ψ + 1.0·k3.
  pass.setPipeline(pipelines.stagePipeline)
  pass.setBindGroup(0, bindGroups.stageFromK3BG)
  pass.setBindGroup(1, bindGroups.stageAlpha10BG)
  pass.dispatchWorkgroups(wgCount)

  // ─── k4 ─── Stage index 3 → stageTimeK4 = t + dt.
  pass.setPipeline(kPl)
  pass.setBindGroup(0, bindGroups.kineticStagedBG)
  pass.setBindGroup(1, bindGroups.stageIndex3BG)
  pass.dispatchWorkgroups(kx, ky, kz)
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
