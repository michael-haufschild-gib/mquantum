/**
 * TDSE Compute Pass — Resource Management
 *
 * Consolidates all GPU resource lifecycle concerns for the TDSE compute pass:
 *   - Type interfaces for buffer/pipeline results (from TDSEComputePassTypes)
 *   - Buffer creation and initialization (from TDSEComputePassBuffers)
 *   - Bind group construction (from TDSEComputePassBindGroups)
 *   - Resource cleanup / disposal (from TDSEComputePassDispose)
 *
 * @module rendering/webgpu/passes/TDSEComputePassResources
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import { useHellerSpectrometerStore } from '@/stores/diagnostics/hellerSpectrometerStore'

import { destroyGpuResources } from '../utils/gpuResourceHelpers'
import { assertPow2Log2, FFT_UNIFORM_SIZE, PACK_UNIFORM_SIZE } from './computePassUtils'
import { buildFFTTwiddleTable, FFT_TWIDDLE_BYTES } from './FFTTwiddle'
import type { DisorderState } from './TDSEComputePassDisorder'
import { disposeDisorder } from './TDSEComputePassDisorder'
import type { ObsGSPipelineResult, TdsePipelineResult } from './TDSEComputePassPipelineTypes'
import { buildTdseFFTAxisStagingData, buildTdseFFTStagingData } from './TDSEComputePassUniforms'
import type { DiagReadbackState } from './TDSEDiagnosticsReadback'
import { destroyGSBuffers, type GramSchmidtState } from './TDSEGramSchmidt'
import {
  disposeHellerStagingBuffers,
  type HellerReadbackState,
  resetHellerCapture,
} from './TDSEHellerReadback'
import { disposeObservables, type ObservablesState } from './TDSEObservablesDispatch'
import type { SaveLoadState } from './TDSEStateSaveLoad'
import { disposeStochasticLoc, type StochasticLocState } from './TDSEStochasticLocalization'
import { TDSE_UNIFORMS_LAYOUT } from './tdseUniformsLayout'
import { disposeVortexDetect, type VortexDetectState } from './TDSEVortexDetect'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper callbacks that bridge to the base class's protected methods.
 * Passed by TDSEComputePass so the standalone functions can use the
 * same shader compilation / pipeline creation infrastructure.
 */
export interface TdsePassHelpers {
  createShaderModule: (device: GPUDevice, code: string, label: string) => GPUShaderModule
  createComputePipeline: (
    device: GPUDevice,
    shaderModule: GPUShaderModule,
    bindGroupLayouts: GPUBindGroupLayout[],
    label: string
  ) => GPUComputePipeline
  createUniformBuffer: (device: GPUDevice, size: number, label: string) => GPUBuffer
}

export type { ObsGSPipelineResult, TdsePipelineResult }

/**
 * Bind group objects created by `rebuildTdseBindGroups`.
 */
export interface TdseBindGroupResult {
  initBG: GPUBindGroup
  potentialBG: GPUBindGroup
  potentialHalfBG: GPUBindGroup
  fusedPotentialPackBG: GPUBindGroup
  fusedUnpackPotentialBG: GPUBindGroup
  packBG: GPUBindGroup
  unpackBG: GPUBindGroup
  fftStageABBG: GPUBindGroup
  fftStageBABG: GPUBindGroup
  /** Shared-memory FFT bind group: axis uniforms + complexBuf(rw) */
  fftSharedMemBG: GPUBindGroup
  /** PERF: per-slot FFT bind groups (length = 2 × latticeDim) for batched Strang dispatch. */
  fftSharedMemBGs: GPUBindGroup[]
  kineticBG: GPUBindGroup
  writeGridBG: GPUBindGroup
  diagReduceBG: GPUBindGroup
  diagFinalizeBG: GPUBindGroup
  renormalizeBG: GPUBindGroup
  renormalizeUniformBuffer: GPUBuffer
}

/** Buffers and resources needed to create bind groups. */
export interface TdseBindGroupInputs {
  uniformBuffer: GPUBuffer
  /** Merged ψ (array<vec2f>). */
  psiBuffer: GPUBuffer
  potentialBuffer: GPUBuffer
  fftScratchA: GPUBuffer
  fftScratchB: GPUBuffer
  fftUniformBuffer: GPUBuffer
  /** Per-axis uniform buffer for shared-memory FFT (legacy singular — used by observables path). */
  fftAxisUniformBuffer: GPUBuffer
  /** PERF: per-slot axis uniforms (length = 2 × latticeDim) for batched Strang FFT. */
  fftAxisUniformBuffers: GPUBuffer[]
  /**
   * CPU-precomputed radix-2 twiddle table bound to every TDSE FFT dispatch
   * (shared-mem + per-stage kernels). Replaces per-thread `cos/sin` at
   * stages >= 2. See `FFTTwiddle.ts` for format.
   */
  fftTwiddleBuffer: GPUBuffer
  packUniformBuffer: GPUBuffer
  densityTextureView: GPUTextureView
  diagUniformBuffer: GPUBuffer
  diagPartialSumsBuffer: GPUBuffer
  diagPartialMaxBuffer: GPUBuffer
  diagPartialLeftBuffer: GPUBuffer
  diagPartialRightBuffer: GPUBuffer
  diagPartialIprBuffer: GPUBuffer
  diagResultBuffer: GPUBuffer
  totalSites: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Buffers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TDSEUniforms struct size in bytes.
 *
 * Last documented offsets in `tdseUniforms.wgsl.ts`:
 *   - compactDimsMask:     u32 @ 736
 *   - branchingEnabled:    u32 @ 740
 *   - branchPlanePosition: f32 @ 744
 *   - bhMass:              f32 @ 748 (blackHoleRingdown / Regge-Wheeler)
 *   - bhMultipoleL:        f32 @ 752
 *   - bhSpin:              f32 @ 756
 *   - hawkingVmax:         f32 @ 760 (analog Hawking / waterfall horizon)
 *   - hawkingLh:           f32 @ 764
 *   - hawkingDeltaN:       f32 @ 768
 *   - hawkingInjectRate:   f32 @ 772
 *   - hawkingPairInjection:u32 @ 776
 *   - hawkingSeed:         u32 @ 780
 *   - hawkingStepIndex:    u32 @ 784
 *   - _padHawk0:           u32 @ 788 (16-byte align)
 *   - wormholeCosTau:      f32 @ 792 (host-precomputed cos(0.5·dt·g))
 *   - wormholeSinTau:      f32 @ 796 (host-precomputed sin(0.5·dt·g))
 *   - wormholeCouplingEnabled: u32 @ 800 (ER=EPR double-trace coupling)
 *   - wormholeCouplingG:       f32 @ 804
 *   - wormholeMirrorAxis:      u32 @ 808
 *   - _padWormhole:            u32 @ 812 (16-byte align)
 *   - islandOverlayEnabled:    u32 @ 816 (analog-Hawking island overlay)
 *   - islandCenterX0:          f32 @ 820
 *   - islandRadiusWs:          f32 @ 824
 *   - islandBoost:             f32 @ 828
 *   - metricKind:              u32 @ 832 (curved-space TDSE v1 metric)
 *   - throatRadius:            f32 @ 836
 *   - _padMetric0..1:          u32 @ 840/844 (16-byte align)
 *   - schwarzschildMass:       f32 @ 848 (curved-space TDSE v2 metric block)
 *   - hubbleRate:              f32 @ 852
 *   - adsRadius:               f32 @ 856
 *   - sphereRadius:            f32 @ 860
 *   - doubleThroatSep:         f32 @ 864
 *   - doubleThroatRad:         f32 @ 868
 *   - _padV2a/b:               f32 @ 872/876
 *   - torusPeriod[0..2]:       f32 @ 880/884/888
 *   - _padV2c:                 f32 @ 892
 *   - stageTimeK1..K4:         f32 @ 896/900/904/908 (RK4 stage-time offsets)
 *   - showCurvatureOverlay:    u32 @ 912 (Wave 6: diagnostic Ricci overlay flag)
 *   - densityViewMode:         u32 @ 916 (Wave 6: 0=coordinate, 1=proper ×√|g|)
 *   - curvatureOverlayOpacity: f32 @ 920 (Wave 6: clamped [0, 1])
 *   - densityDisplayMax:       f32 @ 924 (density-view normalization scale)
 *   - invSpacing:              array<f32,12> @ 928 (host-precomputed 1/max(dx,1e-12))
 *   - invSpacing2:             array<f32,12> @ 976 (invSpacing^2; saves a mul per cell)
 *
 * Total = 832 + 16 + 64 + 16 + 48 + 48 = 1024. The constants below are now
 * derived from `TDSE_UNIFORMS_LAYOUT` (which mirrors the WGSL struct
 * field-by-field), so adding a field to the layout automatically updates
 * both `TDSE_UNIFORM_SIZE` and `TDSE_UNIFORM_OFFSET_STAGE_TIME_K1`.
 *
 * Exported as `TDSE_UNIFORM_SIZE` so tests that validate struct packing
 * offsets can import the canonical size instead of hardcoding a literal
 * that silently drifts from the WGSL definition.
 */
export const TDSE_UNIFORM_SIZE = TDSE_UNIFORMS_LAYOUT.totalSize
const UNIFORM_SIZE = TDSE_UNIFORM_SIZE

/**
 * Byte offset of `TDSEUniforms.simTime`. Curved time-dependent metrics patch
 * this after ordered RK4 substeps so post-evolution visualization shaders
 * read the same metric time as the final RK4/renormalization step.
 */
export const TDSE_UNIFORM_OFFSET_SIM_TIME = TDSE_UNIFORMS_LAYOUT.byteOffset.simTime

/**
 * Byte offset of `TDSEUniforms.stageTimeK1` — start of the 16-byte
 * (K1, K2, K3, K4) RK4 stage-time quartet consumed by the curved-space
 * integrator for time-dependent metrics (deSitter).
 *
 * Canonical source of truth. Importers (e.g. {@link TDSECurvedIntegrator})
 * must reference this constant rather than duplicating the literal — the
 * next field insertion in `TDSEUniforms` would silently redirect copies
 * into the wrong slots otherwise.
 */
export const TDSE_UNIFORM_OFFSET_STAGE_TIME_K1 = TDSE_UNIFORMS_LAYOUT.byteOffset.stageTimeK1

/**
 * Byte offset of `TDSEUniforms.stageTimeK4`. Post-evolution deSitter
 * diagnostics intentionally use this field as the metric volume time, so the
 * curved path patches it back to the just-integrated final time after any
 * full-uniform final snapshot.
 */
export const TDSE_UNIFORM_OFFSET_STAGE_TIME_K4 = TDSE_UNIFORMS_LAYOUT.byteOffset.stageTimeK4
/** Diagnostics workgroup size (must match @workgroup_size in diagnostic shaders) */
const DIAG_WG = 256
/** DiagReduceUniforms struct size (32 bytes) */
const DIAG_UNIFORM_SIZE = 32
/** Number of f32 values in diagnostic result buffer: [norm, maxDensity, normLeft, normRight, sumPsi4, properMaxDensity] */
const DIAG_RESULT_COUNT = 6

/** Old buffers to destroy before rebuilding. Any field may be null. */
export interface TdseDestroyableBuffers {
  /**
   * Merged ψ buffer (array<vec2f>, 8 bytes per site: .x = Re, .y = Im).
   * Replaces the previous split psiReBuffer + psiImBuffer pair — one load per
   * site instead of two, halved binding count, one vec2f store on writes.
   */
  psiBuffer: GPUBuffer | null
  potentialBuffer: GPUBuffer | null
  fftScratchA: GPUBuffer | null
  fftScratchB: GPUBuffer | null
  uniformBuffer: GPUBuffer | null
  fftUniformBuffer: GPUBuffer | null
  fftStagingBuffer: GPUBuffer | null
  fftAxisUniformBuffer: GPUBuffer | null
  fftAxisStagingBuffer: GPUBuffer | null
  /** PERF: one pre-populated uniform buffer per (axis, direction) slot — eliminates
   *  per-axis copyBufferToBuffer + per-dispatch compute pass boundaries. */
  fftAxisUniformBuffers?: GPUBuffer[] | null
  /** CPU-precomputed radix-2 twiddle table (replaces cos/sin in the butterfly). */
  fftTwiddleBuffer?: GPUBuffer | null
  packUniformBuffer: GPUBuffer | null
  omegaStagingBuffer: GPUBuffer | null
  diagUniformBuffer: GPUBuffer | null
  diagPartialSumsBuffer: GPUBuffer | null
  diagPartialMaxBuffer: GPUBuffer | null
  diagPartialLeftBuffer: GPUBuffer | null
  diagPartialRightBuffer: GPUBuffer | null
  diagPartialIprBuffer: GPUBuffer | null
  diagResultBuffer: GPUBuffer | null
  diagStagingBuffer: GPUBuffer | null
}

/**
 * GPU buffers created by {@link rebuildTdseBuffers}.
 * Every field is non-null after a successful call.
 */
export interface TdseBufferResult {
  /** Merged ψ buffer (array<vec2f>, 8 bytes per site). */
  psiBuffer: GPUBuffer
  potentialBuffer: GPUBuffer
  fftScratchA: GPUBuffer
  fftScratchB: GPUBuffer
  uniformBuffer: GPUBuffer
  fftUniformBuffer: GPUBuffer
  fftStagingBuffer: GPUBuffer
  fftAxisUniformBuffer: GPUBuffer
  fftAxisStagingBuffer: GPUBuffer
  /** PERF: per-slot axis uniforms for batched Strang FFT dispatch
   *  (length = 2 × latticeDim: forward axes first, then inverse axes).
   *  Each buffer holds a single pre-populated FFTAxisUniforms struct. */
  fftAxisUniformBuffers: GPUBuffer[]
  /** CPU-precomputed radix-2 twiddle table (replaces per-thread cos/sin). */
  fftTwiddleBuffer: GPUBuffer
  packUniformBuffer: GPUBuffer
  omegaStagingBuffer: GPUBuffer
  diagUniformBuffer: GPUBuffer
  diagPartialSumsBuffer: GPUBuffer
  diagPartialMaxBuffer: GPUBuffer
  diagPartialLeftBuffer: GPUBuffer
  diagPartialRightBuffer: GPUBuffer
  diagPartialIprBuffer: GPUBuffer
  diagResultBuffer: GPUBuffer
  diagStagingBuffer: GPUBuffer
  totalSites: number
  fwdStageCount: number
  /** Forward axis count for shared-mem FFT (= latticeDim; inverse starts at this offset) */
  fwdAxisCount: number
  diagNumWorkgroups: number
}

/**
 * Helper callbacks that bridge to the base class's protected methods.
 */
export interface TdseBufferHelpers {
  createUniformBuffer: (device: GPUDevice, size: number, label: string) => GPUBuffer
}

/**
 * Destroy old GPU buffers and create all buffers required by the TDSE
 * compute pass for the given lattice configuration.
 *
 * @param device - WebGPU device
 * @param config - Current TDSE configuration (already sanitized)
 * @param old - Buffers from the previous configuration to destroy
 * @param helpers - Base-class helper methods
 * @returns All newly created buffers and derived scalar state
 */
export function rebuildTdseBuffers(
  device: GPUDevice,
  config: TdseConfig,
  old: TdseDestroyableBuffers,
  helpers: TdseBufferHelpers
): TdseBufferResult {
  // Destroy old buffers
  destroyGpuResources(
    old.psiBuffer,
    old.potentialBuffer,
    old.fftScratchA,
    old.fftScratchB,
    old.uniformBuffer,
    old.fftUniformBuffer,
    old.fftStagingBuffer,
    old.fftAxisUniformBuffer,
    old.fftAxisStagingBuffer,
    old.fftTwiddleBuffer,
    old.packUniformBuffer,
    old.omegaStagingBuffer,
    old.diagUniformBuffer,
    old.diagPartialSumsBuffer,
    old.diagPartialMaxBuffer,
    old.diagPartialLeftBuffer,
    old.diagPartialRightBuffer,
    old.diagPartialIprBuffer,
    old.diagResultBuffer,
    old.diagStagingBuffer
  )
  if (old.fftAxisUniformBuffers) {
    for (const b of old.fftAxisUniformBuffers) b.destroy()
  }

  let totalSites = 1
  for (let d = 0; d < config.latticeDim; d++) totalSites *= config.gridSize[d]!
  const siteBytes = totalSites * 4
  const complexBytes = totalSites * 8 // 2 floats per complex

  // Merged ψ buffer (array<vec2f>). Each site is (re, im) packed in 8 bytes.
  // Replaces the earlier split psiReBuffer + psiImBuffer pair. Same byte count
  // in aggregate (totalSites * 8), but one load per site and one binding.
  const psiBuffer = device.createBuffer({
    label: 'tdse-psi',
    size: complexBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  const potentialBuffer = device.createBuffer({
    label: 'tdse-potential',
    size: siteBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  const fftScratchA = device.createBuffer({
    label: 'tdse-fft-scratch-a',
    size: complexBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  const fftScratchB = device.createBuffer({
    label: 'tdse-fft-scratch-b',
    size: complexBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  // TDSEUniforms embeds scalar arrays (array<u32, 12>, array<f32, 12>) that
  // are spec-forbidden in uniform address space — bind as storage instead.
  // See freeScalarInit.wgsl.ts for the rationale. writeBuffer works the same.
  const uniformBuffer = device.createBuffer({
    label: 'tdse-uniforms',
    size: UNIFORM_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  })
  const fftUniformBuffer = helpers.createUniformBuffer(
    device,
    FFT_UNIFORM_SIZE,
    'tdse-fft-uniforms'
  )
  const packUniformBuffer = helpers.createUniformBuffer(
    device,
    PACK_UNIFORM_SIZE,
    'tdse-pack-uniforms'
  )

  // FFT staging buffer: pre-computed stage uniforms for all axes x both directions.
  // encoder.copyBufferToBuffer from staging to fftUniformBuffer before each dispatch
  // ensures correct per-stage data (device.queue.writeBuffer would race with command buffer).
  let fwdStageCount = 0
  for (let d = 0; d < config.latticeDim; d++) {
    fwdStageCount += assertPow2Log2(config.gridSize[d]!)
  }
  const totalFFTStages = fwdStageCount * 2 // forward + inverse
  const fftStagingBuffer = device.createBuffer({
    label: 'tdse-fft-staging',
    size: Math.max(FFT_UNIFORM_SIZE, totalFFTStages * FFT_UNIFORM_SIZE),
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  // Pre-compute and upload FFT staging data once (only depends on grid config)
  const fftStagingData = buildTdseFFTStagingData(config, totalSites)
  device.queue.writeBuffer(fftStagingBuffer, 0, fftStagingData)

  // Shared-memory FFT: per-axis uniform buffer + staging buffer
  const fftAxisUniformBuffer = helpers.createUniformBuffer(
    device,
    FFT_UNIFORM_SIZE,
    'tdse-fft-axis-uniforms'
  )
  const axisSlotCount = config.latticeDim * 2 // forward + inverse
  const fftAxisStagingBuffer = device.createBuffer({
    label: 'tdse-fft-axis-staging',
    size: Math.max(FFT_UNIFORM_SIZE, axisSlotCount * FFT_UNIFORM_SIZE),
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  const fftAxisStagingData = buildTdseFFTAxisStagingData(config, totalSites)
  device.queue.writeBuffer(fftAxisStagingBuffer, 0, fftAxisStagingData)

  // PERF: per-slot uniform buffers for batched Strang-step FFT dispatch.
  // Each (axis, direction) gets its own uniform buffer with its 32-byte
  // FFTAxisUniforms struct pre-populated. With one bind group per buffer,
  // all latticeDim × 2 FFT dispatches can run inside a single compute pass
  // without per-axis copyBufferToBuffer calls forcing pass boundaries.
  const fftAxisUniformBuffers: GPUBuffer[] = new Array(axisSlotCount)
  const axisStagingBytes = new Uint8Array(fftAxisStagingData)
  for (let slot = 0; slot < axisSlotCount; slot++) {
    const buf = helpers.createUniformBuffer(
      device,
      FFT_UNIFORM_SIZE,
      `tdse-fft-axis-uniforms-${slot}`
    )
    const slotOffset = slot * FFT_UNIFORM_SIZE
    const slotData = axisStagingBytes.slice(slotOffset, slotOffset + FFT_UNIFORM_SIZE)
    device.queue.writeBuffer(buf, 0, slotData)
    fftAxisUniformBuffers[slot] = buf
  }

  // CPU-precomputed radix-2 twiddle table. Replaces per-thread cos/sin in the
  // Stockham butterfly at stages s >= 2. Sized for N_MAX_FFT_TWIDDLE = 128;
  // a single 512-byte buffer serves every axis length in [8, 128] and both
  // FFT kernels (shared-mem + per-stage). See FFTTwiddle.ts for layout.
  // Rebuilt on every grid-dim rebuild but uploaded exactly once — values are
  // axis-length-independent.
  const fftTwiddleBuffer = device.createBuffer({
    label: 'tdse-fft-twiddle',
    size: FFT_TWIDDLE_BYTES,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(fftTwiddleBuffer, 0, buildFFTTwiddleTable())

  // Pack uniforms: totalSites and invN don't change between frames
  const packData = new ArrayBuffer(PACK_UNIFORM_SIZE)
  const pu32 = new Uint32Array(packData)
  const pf32 = new Float32Array(packData)
  pu32[0] = totalSites
  pf32[1] = 1.0 / totalSites
  device.queue.writeBuffer(packUniformBuffer, 0, packData)

  // Staging buffer for trap-frequency quench: holds evolution harmonicOmega (4 bytes)
  // to overwrite the init-time value between init and potential fill passes.
  const omegaStagingBuffer = device.createBuffer({
    label: 'tdse-omega-staging',
    size: 4,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })

  // Diagnostics: norm reduction buffers
  const diagNumWorkgroups = Math.ceil(totalSites / DIAG_WG)
  const diagUniformBuffer = helpers.createUniformBuffer(
    device,
    DIAG_UNIFORM_SIZE,
    'tdse-diag-uniforms'
  )
  const diagPartialSumsBuffer = device.createBuffer({
    label: 'tdse-diag-partial-sums',
    size: diagNumWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagPartialMaxBuffer = device.createBuffer({
    label: 'tdse-diag-partial-max',
    // Two f32 lanes per workgroup: raw maxDensity and proper-density max.
    size: diagNumWorkgroups * 8,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagPartialLeftBuffer = device.createBuffer({
    label: 'tdse-diag-partial-left',
    size: diagNumWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagPartialRightBuffer = device.createBuffer({
    label: 'tdse-diag-partial-right',
    size: diagNumWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagPartialIprBuffer = device.createBuffer({
    label: 'tdse-diag-partial-ipr',
    size: diagNumWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagResultBuffer = device.createBuffer({
    label: 'tdse-diag-result',
    size: DIAG_RESULT_COUNT * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  })
  const diagStagingBuffer = device.createBuffer({
    label: 'tdse-diag-staging',
    size: DIAG_RESULT_COUNT * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  useDiagnosticsStore.getState().resetTdse()

  return {
    psiBuffer,
    potentialBuffer,
    fftScratchA,
    fftScratchB,
    uniformBuffer,
    fftUniformBuffer,
    fftStagingBuffer,
    fftAxisUniformBuffer,
    fftAxisStagingBuffer,
    fftAxisUniformBuffers,
    fftTwiddleBuffer,
    packUniformBuffer,
    omegaStagingBuffer,
    diagUniformBuffer,
    diagPartialSumsBuffer,
    diagPartialMaxBuffer,
    diagPartialLeftBuffer,
    diagPartialRightBuffer,
    diagPartialIprBuffer,
    diagResultBuffer,
    diagStagingBuffer,
    totalSites,
    fwdStageCount,
    fwdAxisCount: config.latticeDim,
    diagNumWorkgroups,
  }
}

/** Mutable buffer fields on TDSEComputePass that mirror TdseBufferResult + TdseDestroyableBuffers. */
export interface TdsePassBufferFields {
  /** Merged ψ buffer (array<vec2f>, 8 bytes per site). */
  psiBuffer: GPUBuffer | null
  potentialBuffer: GPUBuffer | null
  fftScratchA: GPUBuffer | null
  fftScratchB: GPUBuffer | null
  uniformBuffer: GPUBuffer | null
  fftUniformBuffer: GPUBuffer | null
  fftStagingBuffer: GPUBuffer | null
  fftAxisUniformBuffer: GPUBuffer | null
  fftAxisStagingBuffer: GPUBuffer | null
  fftAxisUniformBuffers: GPUBuffer[] | null
  fftTwiddleBuffer: GPUBuffer | null
  packUniformBuffer: GPUBuffer | null
  omegaStagingBuffer: GPUBuffer | null
  diagUniformBuffer: GPUBuffer | null
  diagPartialSumsBuffer: GPUBuffer | null
  diagPartialMaxBuffer: GPUBuffer | null
  diagPartialLeftBuffer: GPUBuffer | null
  diagPartialRightBuffer: GPUBuffer | null
  diagPartialIprBuffer: GPUBuffer | null
  totalSites: number
  fwdAxisCount: number
  diagNumWorkgroups: number
}

/** Collect old buffer references from the pass for destroy-and-rebuild. */
export function collectOldBuffers(
  fields: TdsePassBufferFields,
  diagResultBuffer: GPUBuffer | null,
  diagStagingBuffer: GPUBuffer | null
): TdseDestroyableBuffers {
  return { ...fields, diagResultBuffer, diagStagingBuffer }
}

/** Apply rebuild result to the pass's mutable buffer fields and derived scalars. */
export function applyBufferResult(fields: TdsePassBufferFields, r: TdseBufferResult): void {
  fields.psiBuffer = r.psiBuffer
  fields.potentialBuffer = r.potentialBuffer
  fields.fftScratchA = r.fftScratchA
  fields.fftScratchB = r.fftScratchB
  fields.uniformBuffer = r.uniformBuffer
  fields.fftUniformBuffer = r.fftUniformBuffer
  fields.fftStagingBuffer = r.fftStagingBuffer
  fields.fftAxisUniformBuffer = r.fftAxisUniformBuffer
  fields.fftAxisStagingBuffer = r.fftAxisStagingBuffer
  fields.fftAxisUniformBuffers = r.fftAxisUniformBuffers
  fields.fftTwiddleBuffer = r.fftTwiddleBuffer
  fields.packUniformBuffer = r.packUniformBuffer
  fields.omegaStagingBuffer = r.omegaStagingBuffer
  fields.diagUniformBuffer = r.diagUniformBuffer
  fields.diagPartialSumsBuffer = r.diagPartialSumsBuffer
  fields.diagPartialMaxBuffer = r.diagPartialMaxBuffer
  fields.diagPartialLeftBuffer = r.diagPartialLeftBuffer
  fields.diagPartialRightBuffer = r.diagPartialRightBuffer
  fields.diagPartialIprBuffer = r.diagPartialIprBuffer
  fields.totalSites = r.totalSites
  fields.fwdAxisCount = r.fwdAxisCount
  fields.diagNumWorkgroups = r.diagNumWorkgroups
}

// ─────────────────────────────────────────────────────────────────────────────
// Bind Groups
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create all bind groups for the TDSE compute pass from pipelines and buffers.
 *
 * @param device - WebGPU device
 * @param pipelines - Pipeline layouts from buildTdsePipelines
 * @param inputs - GPU buffers and resources
 * @param oldRenormUniformBuffer - Previous renormalize uniform buffer to destroy (may be null)
 * @returns All bind groups and the renormalize uniform buffer
 */
export function rebuildTdseBindGroups(
  device: GPUDevice,
  pipelines: TdsePipelineResult,
  inputs: TdseBindGroupInputs,
  oldRenormUniformBuffer: GPUBuffer | null
): TdseBindGroupResult {
  const {
    uniformBuffer,
    psiBuffer,
    potentialBuffer,
    fftScratchA,
    fftScratchB,
    fftUniformBuffer,
    fftAxisUniformBuffer,
    fftAxisUniformBuffers,
    fftTwiddleBuffer,
    packUniformBuffer,
    densityTextureView,
    diagUniformBuffer,
    diagPartialSumsBuffer,
    diagPartialMaxBuffer,
    diagPartialLeftBuffer,
    diagPartialRightBuffer,
    diagPartialIprBuffer,
    diagResultBuffer,
    totalSites,
  } = inputs

  const initBG = device.createBindGroup({
    label: 'tdse-init-bg',
    layout: pipelines.initBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: psiBuffer } },
    ],
  })

  const potentialBG = device.createBindGroup({
    label: 'tdse-potential-bg',
    layout: pipelines.potentialBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: potentialBuffer } },
    ],
  })

  const potentialHalfBG = device.createBindGroup({
    label: 'tdse-potential-half-bg',
    layout: pipelines.potentialHalfBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: psiBuffer } },
      { binding: 2, resource: { buffer: potentialBuffer } },
    ],
  })

  // PERF: Fused potentialHalf + pack bind group (vec2f ψ)
  const fusedPotentialPackBG = device.createBindGroup({
    label: 'tdse-fused-potential-pack-bg',
    layout: pipelines.fusedPotentialPackBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: psiBuffer } },
      { binding: 2, resource: { buffer: potentialBuffer } },
      { binding: 3, resource: { buffer: fftScratchA } },
    ],
  })

  // PERF: Fused unpack + potentialHalf bind group (vec2f ψ)
  // Note: shared-memory FFT writes result back to fftScratchA in-place,
  // so the fused unpack always reads from fftScratchA.
  const fusedUnpackPotentialBG = device.createBindGroup({
    label: 'tdse-fused-unpack-potential-bg',
    layout: pipelines.fusedUnpackPotentialBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchA } },
      { binding: 2, resource: { buffer: psiBuffer } },
      { binding: 3, resource: { buffer: potentialBuffer } },
    ],
  })

  const packBG = device.createBindGroup({
    label: 'tdse-pack-bg',
    layout: pipelines.packBGL,
    entries: [
      { binding: 0, resource: { buffer: packUniformBuffer } },
      { binding: 1, resource: { buffer: psiBuffer } },
      { binding: 2, resource: { buffer: fftScratchA } },
    ],
  })

  const unpackBG = device.createBindGroup({
    label: 'tdse-unpack-bg',
    layout: pipelines.unpackBGL,
    entries: [
      { binding: 0, resource: { buffer: packUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchA } },
      { binding: 2, resource: { buffer: psiBuffer } },
    ],
  })

  // FFT bind groups for A->B and B->A ping-pong. Binding 3 is the twiddle
  // table that replaces cos/sin at stages >= 2 (see FFTTwiddle.ts).
  const fftStageABBG = device.createBindGroup({
    label: 'tdse-fft-ab-bg',
    layout: pipelines.fftStageBGL,
    entries: [
      { binding: 0, resource: { buffer: fftUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchA } },
      { binding: 2, resource: { buffer: fftScratchB } },
      { binding: 3, resource: { buffer: fftTwiddleBuffer } },
    ],
  })
  const fftStageBABG = device.createBindGroup({
    label: 'tdse-fft-ba-bg',
    layout: pipelines.fftStageBGL,
    entries: [
      { binding: 0, resource: { buffer: fftUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchB } },
      { binding: 2, resource: { buffer: fftScratchA } },
      { binding: 3, resource: { buffer: fftTwiddleBuffer } },
    ],
  })

  // Shared-memory FFT bind group: per-axis uniforms + complexBuf (read_write on fftScratchA).
  // `fftSharedMemBG` uses the legacy single-uniform buffer; observables momentum FFT path
  // (runPostStepDispatches) copies the right axis slot into it via copyBufferToBuffer.
  // Binding 2 is the twiddle table shared with the per-stage kernel.
  const fftSharedMemBG = device.createBindGroup({
    label: 'tdse-fft-shared-mem-bg',
    layout: pipelines.fftSharedMemBGL,
    entries: [
      { binding: 0, resource: { buffer: fftAxisUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchA } },
      { binding: 2, resource: { buffer: fftTwiddleBuffer } },
    ],
  })
  // PERF: per-slot bind groups (one per axis per direction) so the Strang-step
  // FFT dispatches can run in a single compute pass without per-axis uniform
  // copies forcing pass boundaries.
  const fftSharedMemBGs: GPUBindGroup[] = new Array(fftAxisUniformBuffers.length)
  for (let slot = 0; slot < fftAxisUniformBuffers.length; slot++) {
    fftSharedMemBGs[slot] = device.createBindGroup({
      label: `tdse-fft-shared-mem-bg-slot-${slot}`,
      layout: pipelines.fftSharedMemBGL,
      entries: [
        { binding: 0, resource: { buffer: fftAxisUniformBuffers[slot]! } },
        { binding: 1, resource: { buffer: fftScratchA } },
        { binding: 2, resource: { buffer: fftTwiddleBuffer } },
      ],
    })
  }

  const kineticBG = device.createBindGroup({
    label: 'tdse-kinetic-bg',
    layout: pipelines.kineticBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchA } },
    ],
  })

  const writeGridBG = device.createBindGroup({
    label: 'tdse-write-grid-bg',
    layout: pipelines.writeGridBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: psiBuffer } },
      { binding: 2, resource: { buffer: potentialBuffer } },
      { binding: 3, resource: densityTextureView },
    ],
  })

  // Diagnostics bind groups. ψ is now a single vec2f binding; partial-sum
  // buffers shifted down by one binding index to stay contiguous.
  const diagReduceBG = device.createBindGroup({
    label: 'tdse-diag-reduce-bg',
    layout: pipelines.diagReduceBGL,
    entries: [
      { binding: 0, resource: { buffer: diagUniformBuffer } },
      { binding: 1, resource: { buffer: psiBuffer } },
      { binding: 2, resource: { buffer: diagPartialSumsBuffer } },
      { binding: 3, resource: { buffer: diagPartialMaxBuffer } },
      { binding: 4, resource: { buffer: diagPartialLeftBuffer } },
      { binding: 5, resource: { buffer: diagPartialRightBuffer } },
      { binding: 6, resource: { buffer: diagPartialIprBuffer } },
      { binding: 7, resource: { buffer: uniformBuffer } },
    ],
  })

  const diagFinalizeBG = device.createBindGroup({
    label: 'tdse-diag-finalize-bg',
    layout: pipelines.diagFinalizeBGL,
    entries: [
      { binding: 0, resource: { buffer: diagUniformBuffer } },
      { binding: 1, resource: { buffer: diagPartialSumsBuffer } },
      { binding: 2, resource: { buffer: diagPartialMaxBuffer } },
      { binding: 3, resource: { buffer: diagResultBuffer } },
      { binding: 4, resource: { buffer: diagPartialLeftBuffer } },
      { binding: 5, resource: { buffer: diagPartialRightBuffer } },
      { binding: 6, resource: { buffer: diagPartialIprBuffer } },
    ],
  })

  // Renormalization bind group
  oldRenormUniformBuffer?.destroy()
  const renormalizeUniformBuffer = device.createBuffer({
    label: 'tdse-renormalize-uniforms',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  // TDSE has 1 component; BEC also has 1 component (shared pass)
  // targetNorm (f32 at offset 4) starts at 0; updated when initialNorm is captured
  const renormBuf = new ArrayBuffer(16)
  new Uint32Array(renormBuf)[0] = totalSites
  new Float32Array(renormBuf)[1] = 0 // targetNorm = 0 → shader skips until set
  device.queue.writeBuffer(renormalizeUniformBuffer, 0, renormBuf)
  const renormalizeBG = device.createBindGroup({
    label: 'tdse-renormalize-bg',
    layout: pipelines.renormalizeBGL,
    entries: [
      { binding: 0, resource: { buffer: renormalizeUniformBuffer } },
      { binding: 1, resource: { buffer: diagResultBuffer } },
      { binding: 2, resource: { buffer: psiBuffer } },
    ],
  })

  return {
    initBG,
    potentialBG,
    potentialHalfBG,
    fusedPotentialPackBG,
    fusedUnpackPotentialBG,
    packBG,
    unpackBG,
    fftStageABBG,
    fftStageBABG,
    fftSharedMemBG,
    fftSharedMemBGs,
    kineticBG,
    writeGridBG,
    diagReduceBG,
    diagFinalizeBG,
    renormalizeBG,
    renormalizeUniformBuffer,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispose
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dispose all extracted-module state: diagnostics readback, Gram-Schmidt
 * eigenstates, save/load staging buffers, and observables resources.
 *
 * @param diagState - Diagnostics readback state
 * @param gsState - Gram-Schmidt state
 * @param slState - Save/load state
 * @param obsState - Observables state
 */
export function disposeTdseResources(
  diagState: DiagReadbackState,
  gsState: GramSchmidtState,
  slState: SaveLoadState,
  obsState: ObservablesState
): void {
  // Cancel any pending mapAsync before destroying staging buffers
  if (diagState.diagMappingInFlight && diagState.diagStagingBuffer) {
    diagState.diagStagingBuffer.unmap()
    diagState.diagMappingInFlight = false
  }
  // Diagnostics readback buffers
  diagState.diagResultBuffer?.destroy()
  diagState.diagStagingBuffer?.destroy()
  diagState.diagResultBuffer = diagState.diagStagingBuffer = null
  diagState.diagHistory.clear()
  useDiagnosticsStore.getState().resetTdse()

  // Gram-Schmidt eigenstates and infrastructure
  destroyGSBuffers(gsState)

  // Save/load state
  slState.pendingInjection = null

  // Observables compute resources
  disposeObservables(obsState)
}

/**
 * Mutable TDSE pass GPU buffer/texture fields used during disposal.
 * All handles are nulled and `initialized`/`lastConfigHash` are reset
 * in place by {@link destroyTdsePassGpu}.
 */
export interface TdsePassGpuSnapshot {
  psiBuffer: GPUBuffer | null
  potentialBuffer: GPUBuffer | null
  fftScratchA: GPUBuffer | null
  fftScratchB: GPUBuffer | null
  uniformBuffer: GPUBuffer | null
  fftUniformBuffer: GPUBuffer | null
  fftStagingBuffer: GPUBuffer | null
  fftAxisUniformBuffer: GPUBuffer | null
  fftAxisStagingBuffer: GPUBuffer | null
  /** PERF: per-slot axis uniform buffers for batched Strang FFT (length = 2 × latticeDim). */
  fftAxisUniformBuffers: GPUBuffer[] | null
  /** CPU-precomputed FFT twiddle table (replaces cos/sin in the butterfly). */
  fftTwiddleBuffer: GPUBuffer | null
  packUniformBuffer: GPUBuffer | null
  omegaStagingBuffer: GPUBuffer | null
  densityTexture: GPUTexture | null
  densityTextureView: GPUTextureView | null
  diagUniformBuffer: GPUBuffer | null
  diagPartialSumsBuffer: GPUBuffer | null
  diagPartialMaxBuffer: GPUBuffer | null
  diagPartialLeftBuffer: GPUBuffer | null
  diagPartialRightBuffer: GPUBuffer | null
  diagPartialIprBuffer: GPUBuffer | null
  pl: { renormalizePipeline?: unknown } | null
  bg: TdseBindGroupResult | null
  initialized: boolean
  lastConfigHash: string
}

/**
 * Destroy all GPU buffers/textures owned by the pass and null their handles.
 * Mutates `fields` in place.
 */
export function destroyTdsePassGpu(fields: TdsePassGpuSnapshot): void {
  destroyGpuResources(
    fields.psiBuffer,
    fields.potentialBuffer,
    fields.fftScratchA,
    fields.fftScratchB,
    fields.uniformBuffer,
    fields.fftUniformBuffer,
    fields.fftStagingBuffer,
    fields.fftAxisUniformBuffer,
    fields.fftAxisStagingBuffer,
    fields.fftTwiddleBuffer,
    fields.packUniformBuffer,
    fields.omegaStagingBuffer,
    fields.densityTexture,
    fields.diagUniformBuffer,
    fields.diagPartialSumsBuffer,
    fields.diagPartialMaxBuffer,
    fields.diagPartialLeftBuffer,
    fields.diagPartialRightBuffer,
    fields.diagPartialIprBuffer,
    fields.bg?.renormalizeUniformBuffer
  )
  if (fields.fftAxisUniformBuffers) {
    for (const b of fields.fftAxisUniformBuffers) b.destroy()
  }
  fields.psiBuffer = fields.potentialBuffer = null
  fields.fftScratchA = fields.fftScratchB = fields.omegaStagingBuffer = null
  fields.uniformBuffer = fields.fftUniformBuffer = fields.fftStagingBuffer = null
  fields.fftAxisUniformBuffer = fields.fftAxisStagingBuffer = null
  fields.fftAxisUniformBuffers = null
  fields.fftTwiddleBuffer = null
  fields.packUniformBuffer = fields.diagUniformBuffer = null
  fields.diagPartialSumsBuffer = fields.diagPartialMaxBuffer = null
  fields.diagPartialLeftBuffer = fields.diagPartialRightBuffer = fields.diagPartialIprBuffer = null
  fields.densityTexture = fields.densityTextureView = null
  fields.pl = fields.bg = null
  fields.initialized = false
  fields.lastConfigHash = ''
}

/**
 * Full pass disposal: cleans up vortex, disorder, stochastic, Heller state,
 * GPU buffers, and extracted-module resources, then writes nulled fields back.
 *
 * Extracted from TDSEComputePass.dispose() to keep the orchestrator under
 * the 600-line limit.
 *
 * @param pass - Mutable pass fields (cleared in place)
 * @param vdState - Vortex detection state
 * @param disorderState - Anderson disorder state
 * @param stochasticState - Stochastic localization state
 * @param hellerState - Heller spectrometer readback state
 * @param diagState - Diagnostics readback state
 * @param gsState - Gram-Schmidt state
 * @param slState - Save/load state
 * @param obsState - Observables state
 */
export function disposeFullPass(
  pass: TdsePassGpuSnapshot,
  vdState: VortexDetectState,
  disorderState: DisorderState,
  stochasticState: StochasticLocState,
  hellerState: HellerReadbackState,
  diagState: DiagReadbackState,
  gsState: GramSchmidtState,
  slState: SaveLoadState,
  obsState: ObservablesState
): void {
  disposeVortexDetect(vdState)
  disposeDisorder(disorderState)
  disposeStochasticLoc(stochasticState)

  // Invalidate any in-flight Heller readback and drop psi0 snapshot.
  // `resetHellerCapture` bumps the generation counter, which causes the
  // async mapAsync handler to bail out before touching the staging
  // buffers we are about to destroy. Order matters: bump first, then
  // release the pool.
  resetHellerCapture(hellerState)
  disposeHellerStagingBuffers(hellerState)
  hellerState.psiBuffer = null
  hellerState.totalSites = 0
  useHellerSpectrometerStore.getState().setBufferRef(null)

  destroyTdsePassGpu(pass)
  disposeTdseResources(diagState, gsState, slState, obsState)
}
