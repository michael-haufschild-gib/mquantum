/**
 * Free Scalar Field Compute Pass -- Field Initialization
 *
 * Handles initial condition setup (vacuum noise, GPU init, save injection)
 * and leapfrog kickstart for the FSF compute pass. Extracted from
 * FreeScalarFieldComputePass to keep individual files under the
 * project's 600-line ESLint limit.
 *
 * @module rendering/webgpu/passes/FreeScalarFieldComputePassInit
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { logger } from '@/lib/logger'
import { sampleAdiabaticVacuum } from '@/lib/physics/cosmology/adiabaticVacuum'
import { computeMassSquaredScale } from '@/lib/physics/cosmology/preheating'
import { computeFsfCosmologyCoefs } from '@/lib/physics/freeScalar/vacuumDispersion'
import { sampleVacuumSpectrum } from '@/lib/physics/freeScalar/vacuumSpectrum'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

import type { WebGPURenderContext } from '../core/types'
import { LINEAR_WG as LINEAR_WORKGROUP_SIZE } from './computePassUtils'
import { createDtStagingBuffer } from './FreeScalarFieldComputePassBuffers'
import type { FsfBindGroupResult, FsfPipelineResult } from './FreeScalarFieldComputePassSetup'
import { FSF_DT_BYTE_OFFSET } from './FreeScalarFieldComputePassUniforms'
import type { FsfKSpaceManager } from './FreeScalarFieldKSpace'
import { getOrCreateFsfCosmoDebugBuffer } from './fsfCosmoDebug'
import { writeFsfCosmologyCoefsSlot } from './fsfCosmologyStepping'

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
    const { re, im } = ic.pendingInjection
    const elementCount = Math.min(re.length, ic.totalSites)
    const reData = re.slice(0, elementCount)
    const imData = im.slice(0, elementCount)
    device.queue.writeBuffer(ic.phiBuffer, 0, reData)
    device.queue.writeBuffer(ic.piBuffer, 0, imData)
    injectedFromSave = true
    logger.log(`[FSF] Injected loaded field state (${elementCount} sites)`)
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
        // on the first step. `advanceSimEta` adds `dt` regardless of the
        // η sign (both η<0 FLRW and η>0 Bianchi branches advance by
        // adding dt — see `projectSimEta`), so the midpoint is simply
        // `simEta + midDt`.
        const midEta = ic.simEta + midDt
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
