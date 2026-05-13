/**
 * Free Scalar Field Compute Pass -- Resources
 *
 * Buffer management, resource disposal, and field initialization for the
 * FSF compute pass. Consolidated from FreeScalarFieldComputePassBuffers,
 * FreeScalarFieldComputePassDispose, and FreeScalarFieldComputePassInit.
 *
 * @module rendering/webgpu/passes/FreeScalarFieldComputePassResources
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { logger } from '@/lib/logger'
import { sampleAdiabaticVacuum } from '@/lib/physics/cosmology/adiabaticVacuum'
import { computeMassSquaredScale } from '@/lib/physics/cosmology/preheating'
import { computeFsfCosmologyCoefs } from '@/lib/physics/freeScalar/vacuumDispersion'
import { sampleVacuumSpectrum } from '@/lib/physics/freeScalar/vacuumSpectrum'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'

import type { WebGPURenderContext } from '../core/types'
import { destroyGpuResources } from '../utils/gpuResourceHelpers'
import { LINEAR_WG as LINEAR_WORKGROUP_SIZE } from './computePassUtils'
import type { FsfBindGroupResult, FsfPipelineResult } from './FreeScalarFieldComputePassSetup'
import {
  computeFsfConfigHash,
  FSF_DT_BYTE_OFFSET,
  FSF_UNIFORM_SIZE,
} from './FreeScalarFieldComputePassUniforms'
import type { FsfKSpaceManager } from './FreeScalarFieldKSpace'
import { getOrCreateFsfCosmoDebugBuffer } from './fsfCosmoDebug'
import { projectSimEta, writeFsfCosmologyCoefsSlot } from './fsfCosmologyStepping'
import { assertStateInjectionLength } from './stateSave'

// ---------------------------------------------------------------------------
// Buffer Management
// ---------------------------------------------------------------------------

/**
 * Create a 4-byte COPY_SRC staging buffer pre-populated with a single f32
 * `dt` value. Used by the leapfrog kickstart to stage `dt/2` and `dt` into
 * the uniform buffer's DT slot via `encoder.copyBufferToBuffer`.
 *
 * @param device - GPU device
 * @param label - Human-readable label suffix ('half' or 'full')
 * @param dt - Time step value to store
 * @returns A mapped-at-creation staging buffer containing the dt value
 */
export function createDtStagingBuffer(
  device: GPUDevice,
  label: 'half' | 'full',
  dt: number
): GPUBuffer {
  const staging = device.createBuffer({
    label: `free-scalar-${label}-dt-staging`,
    size: 4,
    usage: GPUBufferUsage.COPY_SRC,
    mappedAtCreation: true,
  })
  new Float32Array(staging.getMappedRange()).set([dt])
  staging.unmap()
  return staging
}

/**
 * Result of rebuilding the FSF field buffers. All GPU resources are
 * non-null after a successful call.
 */
export interface FsfBufferResult {
  phiBuffer: GPUBuffer
  piBuffer: GPUBuffer
  uniformBuffer: GPUBuffer
  totalSites: number
  configHash: string
}

/**
 * Old buffer references to destroy before rebuilding.
 */
export interface FsfDestroyableBuffers {
  phiBuffer: GPUBuffer | null
  piBuffer: GPUBuffer | null
  uniformBuffer: GPUBuffer | null
}

/**
 * Rebuild phi/pi storage buffers and uniform buffer when grid size changes.
 * The density texture is NOT recreated here -- its size is set at construction
 * and persists across lattice grid size changes to avoid invalidating the renderer's bind group.
 *
 * @param device - GPU device
 * @param config - Current free scalar config
 * @param old - Old buffers to destroy
 * @param kSpace - K-space manager whose staging buffers must be rebuilt
 * @returns Newly created buffers and derived state
 */
export function rebuildFsfFieldBuffers(
  device: GPUDevice,
  config: FreeScalarConfig,
  old: FsfDestroyableBuffers,
  kSpace: FsfKSpaceManager
): FsfBufferResult {
  // Destroy old k-space staging buffers and invalidate in-flight jobs
  kSpace.destroyBuffers()

  // Destroy old field buffers
  old.phiBuffer?.destroy()
  old.piBuffer?.destroy()
  old.uniformBuffer?.destroy()

  // Compute total sites as product of all active dimensions
  let totalSites = 1
  for (let d = 0; d < config.latticeDim; d++) {
    totalSites *= config.gridSize[d]!
  }
  const bufferSize = totalSites * 4 // f32 per site

  // Create phi and pi storage buffers (COPY_SRC needed for k-space readback)
  const phiBuffer = device.createBuffer({
    label: 'free-scalar-phi',
    size: bufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  })

  const piBuffer = device.createBuffer({
    label: 'free-scalar-pi',
    size: bufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  })

  // Create k-space and diagnostics staging buffers
  kSpace.createBuffers(device, bufferSize)

  // Create params buffer as STORAGE (not UNIFORM) because `FreeScalarUniforms`
  // embeds scalar arrays that are spec-forbidden in uniform address space.
  // See `freeScalarInit.wgsl.ts` for the full rationale and matching binding
  // decl. Labelled "uniforms" to preserve the existing name.
  const uniformBuffer = device.createBuffer({
    label: 'free-scalar-uniforms',
    size: FSF_UNIFORM_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })

  const configHash = computeFsfConfigHash(config)

  return {
    phiBuffer,
    piBuffer,
    uniformBuffer,
    totalSites,
    configHash,
  }
}

// ---------------------------------------------------------------------------
// Disposal
// ---------------------------------------------------------------------------

/**
 * Mutable GPU resource fields on FreeScalarFieldComputePass that must be
 * destroyed and nulled during disposal. Mirrors the private field
 * declarations on the class.
 */
export interface FsfGpuFields {
  phiBuffer: GPUBuffer | null
  piBuffer: GPUBuffer | null
  uniformBuffer: GPUBuffer | null
  densityTexture: GPUTexture | null
  densityTextureView: GPUTextureView | null
  analysisTexture: GPUTexture | null
  analysisTextureView: GPUTextureView | null
  normalTexture: GPUTexture | null
  normalTextureView: GPUTextureView | null
  gradientPipeline: GPUComputePipeline | null
  gradientBindGroup: GPUBindGroup | null
  pipelineGeneration: number
  pl: FsfPipelineResult | null
  bg: FsfBindGroupResult | null
  initialized: boolean
  lastConfigHash: string
  lastInitHash: string | null
  pendingStagingBuffers: GPUBuffer[]
}

/**
 * Destroy all GPU buffers, textures, and pipeline references owned by
 * the FSF compute pass, then null every field so stale references
 * cannot be used after disposal.
 *
 * The caller passes a mutable snapshot of the class's GPU fields so
 * field accesses stay visible to `--noUnusedLocals`. After return the
 * caller writes the nulled fields back via `Object.assign(this, fields)`.
 *
 * @param fields - Mutable pass GPU fields to destroy and null
 * @param kSpace - K-space manager instance to dispose
 */
export function disposeFsfPassGpu(fields: FsfGpuFields, kSpace: FsfKSpaceManager): void {
  // Invalidate in-flight async gradient pipeline results
  fields.pipelineGeneration++

  destroyGpuResources(
    fields.phiBuffer,
    fields.piBuffer,
    fields.uniformBuffer,
    fields.densityTexture,
    fields.analysisTexture,
    fields.normalTexture
  )
  for (const buf of fields.pendingStagingBuffers) buf.destroy()
  fields.pendingStagingBuffers.length = 0

  fields.phiBuffer = fields.piBuffer = fields.uniformBuffer = null
  fields.densityTexture = fields.analysisTexture = fields.normalTexture = null
  fields.densityTextureView = fields.analysisTextureView = fields.normalTextureView = null
  fields.gradientPipeline = null
  fields.gradientBindGroup = null
  kSpace.dispose()
  fields.pl = null
  fields.bg = null
  fields.initialized = false
  fields.lastConfigHash = ''
  fields.lastInitHash = null
}

// ---------------------------------------------------------------------------
// Field Initialization
// ---------------------------------------------------------------------------

/**
 * State references needed by the field initialization logic.
 * Mirrors the private fields on FreeScalarFieldComputePass that
 * `initializeField` reads and writes.
 */
export interface FsfInitContext {
  pl: FsfPipelineResult | null
  bg: FsfBindGroupResult | null
  phiBuffer: GPUBuffer | null
  piBuffer: GPUBuffer | null
  uniformBuffer: GPUBuffer | null
  totalSites: number
  simEta: number
  pendingInjection: { re: Float32Array; im: Float32Array } | null
  pendingStagingBuffers: GPUBuffer[]
  kSpace: FsfKSpaceManager
  /**
   * Reusable 6-f32 scratch used by {@link writeFsfCosmologyCoefsSlot}.
   * Shared with the per-frame substep loop so kickstart coef writes avoid
   * a fresh allocation per reset.
   */
  cosmoCoefsScratch: Float32Array
  /** Minkowski-path preheating clock counter at kickstart time. */
  preheatingTime: number
  /** Preheating drive anchor captured at reset. */
  preheatingReferenceEta: number
  dispatchCompute: (
    pass: GPUComputePassEncoder,
    pipeline: GPUComputePipeline,
    bindGroups: GPUBindGroup[],
    x: number,
    y?: number,
    z?: number
  ) => void
  beginComputePass: (descriptor: GPUComputePassDescriptor) => GPUComputePassEncoder
}

/**
 * Scalar state written back to the pass after initialization completes.
 */
export interface FsfInitResult {
  initialized: boolean
  stepAccumulator: number
  debugFrameIndex: number
  lastDebugNSub: number
  pendingInjection: null
}

/**
 * Initialize field state and perform leapfrog kickstart.
 *
 * When a save is resumed, the restored phi/pi buffers are already on the
 * leapfrog half-offset grid (pi is dt/2 ahead of phi). The kickstart is
 * skipped in that case to avoid double-advancing pi.
 *
 * @param ctx - WebGPU render context (device + encoder)
 * @param config - Current free scalar config
 * @param ic - Mutable init context with pass state references
 * @returns Scalar state to write back to the pass
 */
export function initializeFsfField(
  ctx: WebGPURenderContext,
  config: FreeScalarConfig,
  ic: FsfInitContext
): FsfInitResult {
  const { device, encoder } = ctx

  // Track whether init consumed an injection so the kickstart can be skipped
  let injectedFromSave = false

  // Check for pending loaded wavefunction data -- skip init and inject directly
  if (ic.pendingInjection && ic.phiBuffer && ic.piBuffer) {
    try {
      assertStateInjectionLength('FSF', ic.pendingInjection, ic.totalSites)
    } catch (err) {
      ic.pendingInjection = null
      throw err
    }
    const { re, im } = ic.pendingInjection
    device.queue.writeBuffer(ic.phiBuffer, 0, re as Float32Array<ArrayBuffer>)
    device.queue.writeBuffer(ic.piBuffer, 0, im as Float32Array<ArrayBuffer>)
    injectedFromSave = true
    logger.log(`[FSF] Injected loaded field state (${ic.totalSites} sites)`)
  } else if (config.initialCondition === 'vacuumNoise') {
    // Sample the adiabatic vacuum or Minkowski vacuum spectrum
    const { phi, pi } = config.cosmology.enabled
      ? sampleAdiabaticVacuum(
          config,
          {
            preset: config.cosmology.preset,
            spacetimeDim: config.latticeDim + 1,
            steepness: config.cosmology.steepness,
            hubble: config.cosmology.hubble,
            kasnerExponents: config.cosmology.kasnerExponents,
            lqcRhoCritical: config.cosmology.lqcRhoCritical,
            lqcEquationOfState: config.cosmology.lqcEquationOfState,
            lqcInitialRhoRatio: config.cosmology.lqcInitialRhoRatio,
          },
          ic.simEta,
          config.vacuumSeed
        )
      : sampleVacuumSpectrum(config, config.vacuumSeed, 'kgFloor')
    device.queue.writeBuffer(ic.phiBuffer!, 0, phi as Float32Array<ArrayBuffer>)
    device.queue.writeBuffer(ic.piBuffer!, 0, pi as Float32Array<ArrayBuffer>)
  } else if (ic.pl && ic.bg) {
    const pass = ic.beginComputePass({ label: 'free-scalar-init-pass' })
    ic.dispatchCompute(
      pass,
      ic.pl.initPipeline,
      [ic.bg.initBG],
      Math.ceil(ic.totalSites / LINEAR_WORKGROUP_SIZE)
    )
    pass.end()
  }

  // Leapfrog half-step kickstart: advance pi from t=0 to t=dt/2.
  // Skipped when we injected a saved state.
  if (!injectedFromSave && ic.pl && ic.bg && ic.uniformBuffer) {
    // Midpoint coefs for the kickstart kick. The kickstart advances pi
    // over the interval [0, dt/2] (physical: [η₀, η₀+dt/2]) — the
    // midpoint-rule coefs live at η₀ + dt/4, NOT at η₀ where
    // `updateUniforms` already wrote them. Without this correction the
    // kickstart kick would bake in a first-order coef-time discrepancy
    // that the main substep loop's midpoint scheme can never correct.
    // Under Minkowski + preheating-off every coef is 1 and this reduces
    // to the pre-fix no-op. Under cosmology / preheating we compute the
    // midpoint coefs and stage them into the uniform slot *before* the
    // kickstart dispatch; the first substep of the first frame will
    // overwrite them with its own midpoint coefs at η₀ + dt/2 anyway.
    const cosmoOn = config.cosmology.enabled
    const preheatingOn = config.preheating.enabled
    if (cosmoOn || preheatingOn) {
      const subDt = config.dt * 0.5
      const midDt = subDt * 0.5 // advance to η₀ + dt/4 for the kick midpoint
      let aKinetic = 1
      let aPotential = 1
      let aFull = 1
      let aPotentialRatio1 = 1
      let aPotentialRatio2 = 1
      let preheatingClock: number
      if (cosmoOn) {
        // Evaluate cosmology coefs at the kickstart interval midpoint
        // without mutating `simEta` — the kickstart does not advance the
        // simulation clock. The main substep loop will advance from η₀
        // on the first step. Use the same floor/sign projection as the
        // runtime clock so the kickstart cannot sample coefs inside
        // |eta| < COSMOLOGY_ETA_FLOOR.
        const midEta = projectSimEta(ic.simEta, midDt)
        const coefs = computeFsfCosmologyCoefs(config, midEta)
        aKinetic = coefs.aKinetic
        aPotential = coefs.aPotential
        aFull = coefs.aFull
        aPotentialRatio1 = coefs.aPotentialRatio1 ?? 1
        aPotentialRatio2 = coefs.aPotentialRatio2 ?? 1
        preheatingClock = midEta
      } else {
        // Minkowski + preheating: drive clock at midpoint of preheatingTime.
        preheatingClock = ic.preheatingTime + midDt
      }
      const massSquaredScale = preheatingOn
        ? computeMassSquaredScale(preheatingClock, config.preheating, ic.preheatingReferenceEta)
        : 1
      writeFsfCosmologyCoefsSlot(
        device,
        ic.uniformBuffer,
        ic.cosmoCoefsScratch,
        aKinetic,
        aPotential,
        aFull,
        massSquaredScale,
        aPotentialRatio1,
        aPotentialRatio2
      )
    }

    const halfDtStaging = createDtStagingBuffer(device, 'half', config.dt * 0.5)
    encoder.copyBufferToBuffer(halfDtStaging, 0, ic.uniformBuffer, FSF_DT_BYTE_OFFSET, 4)

    const kickPass = ic.beginComputePass({ label: 'free-scalar-leapfrog-kickstart' })
    ic.dispatchCompute(
      kickPass,
      ic.pl.updatePiPipeline,
      [ic.bg.updatePiBG],
      Math.ceil(ic.totalSites / LINEAR_WORKGROUP_SIZE)
    )
    kickPass.end()

    const fullDtStaging = createDtStagingBuffer(device, 'full', config.dt)
    encoder.copyBufferToBuffer(fullDtStaging, 0, ic.uniformBuffer, FSF_DT_BYTE_OFFSET, 4)
    ic.pendingStagingBuffers.push(halfDtStaging, fullDtStaging)
  }

  // Reset the debug trace counter so each reset starts from frame 0.
  if (config.cosmology.enabled) {
    const debugBuf = getOrCreateFsfCosmoDebugBuffer()
    if (debugBuf) {
      debugBuf.samples.length = 0
      debugBuf.head = 0
    }
  }
  // Invalidate in-flight async readbacks BEFORE resetting the diagnostics store.
  ic.kSpace.invalidateReadbacks()
  useDiagnosticsStore.getState().resetFsf()

  return {
    initialized: true,
    stepAccumulator: 0,
    debugFrameIndex: 0,
    lastDebugNSub: 1,
    pendingInjection: null,
  }
}
