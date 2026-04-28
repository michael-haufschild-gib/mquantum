/**
 * TDSE Compute Pass — Initialization Logic
 *
 * Extracted from TDSEComputePass to keep the main file under the 600-line limit.
 * Handles wavefunction initialization, potential filling, and quench setup.
 *
 * @module rendering/webgpu/passes/TDSEComputePassInit
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

import type { WebGPURenderContext } from '../core/types'
import { LINEAR_WG, pickSiteDispatch } from './computePassUtils'
import {
  uploadAndersonDisorderBuffer,
  uploadCustomPotentialBuffer,
} from './TDSEComputePassCustomPotential'
import type { DisorderState } from './TDSEComputePassDisorder'
import { maybeDispatchDisorder } from './TDSEComputePassDisorder'
import { estimateInitialDensity } from './TDSEComputePassDispatchers'
import type { TdseBindGroupResult, TdsePipelineResult } from './TDSEComputePassSetup'
import type { DiagReadbackState } from './TDSEDiagnosticsReadback'
import { injectLoadedWavefunction, type SaveLoadState } from './TDSEStateSaveLoad'
import type { StochasticLocState } from './TDSEStochasticLocalization'
import { resetStochasticLocState } from './TDSEStochasticLocalization'

/** State references needed by the init logic. */
export interface InitContext {
  pl: TdsePipelineResult | null
  bg: TdseBindGroupResult | null
  initialized: boolean
  totalSites: number
  simTime: number
  stepAccumulator: number
  uniformBuffer: GPUBuffer | null
  potentialBuffer: GPUBuffer | null
  omegaStagingBuffer: GPUBuffer | null
  customPotentialScale: number
  diagState: DiagReadbackState
  slState: SaveLoadState
  disorderState: DisorderState
  stochasticState: StochasticLocState | null
  dispatchCompute: (
    pass: GPUComputePassEncoder,
    pipeline: GPUComputePipeline,
    bindGroups: GPUBindGroup[],
    x: number,
    y?: number,
    z?: number
  ) => void
}

/**
 * Initialize wavefunction and potential if not yet initialized, reset requested, or auto-loop.
 *
 * @returns Updated scalar state (initialized, simTime, stepAccumulator, customPotentialScale)
 */
export function maybeInitialize(
  ctx: WebGPURenderContext,
  config: TdseConfig,
  ic: InitContext
): void {
  const { device, encoder } = ctx
  const isMeasurementCollapse = !!ic.slState.pendingInjection?.isMeasurementCollapse
  const needsInit =
    !ic.initialized ||
    config.needsReset ||
    ic.diagState.pendingAutoReset ||
    !!ic.slState.pendingInjection
  if (!needsInit) return

  // Measurement collapse: inject wavefunction without full reinit
  if (isMeasurementCollapse) {
    const targetNorm = ic.slState.pendingInjection?.targetNorm
    injectLoadedWavefunction(device, ic.slState, ic.totalSites)
    ic.slState.pendingInjection = null
    if (Number.isFinite(targetNorm) && targetNorm! > 0) {
      ic.diagState.initialNorm = targetNorm!
      ic.diagState.prevNorm = targetNorm!
      if (ic.bg?.renormalizeUniformBuffer) {
        device.queue.writeBuffer(ic.bg.renormalizeUniformBuffer, 4, new Float32Array([targetNorm!]))
      }
    }
    ic.diagState.maxDensity = 1.0
    ic.diagState.diagGeneration++
    return
  }

  const linearWG = Math.ceil(ic.totalSites / LINEAR_WG)
  // 3-D dispatch fast-path for latticeDim===3 — saves the per-thread
  // linearToND coord decomposition. Falls back to 1-D for other dims.
  const siteDispatch = pickSiteDispatch(config.latticeDim, ic.totalSites, config.gridSize)
  const hasOmegaQuench =
    config.harmonicOmegaInit !== undefined && config.harmonicOmegaInit !== config.harmonicOmega

  // Both the injection path and the GPU init dispatch run alongside the
  // potential fill below, which itself needs the compiled pipelines.
  // If we let injection complete here without pipelines, we'd reach
  // `initialized = true` with an unfilled potential and no retry path.
  // Defer the entire init until pipelines are ready — pendingInjection
  // stays set so the next call still injects.
  if (!ic.pl || !ic.bg) {
    return
  }

  // Inject loaded wavefunction or dispatch GPU init shader.
  // injectLoadedWavefunction clears `pendingInjection` internally on success.
  if (!injectLoadedWavefunction(device, ic.slState, ic.totalSites)) {
    const pass = ctx.beginComputePass({ label: 'tdse-init-pass' })
    const initPl = siteDispatch.use3D ? ic.pl.initPipeline3D : ic.pl.initPipeline
    ic.dispatchCompute(pass, initPl, [ic.bg.initBG], siteDispatch.x, siteDispatch.y, siteDispatch.z)
    pass.end()
  }

  // For trap-frequency quench: restore evolution omega before filling the potential
  if (hasOmegaQuench && ic.uniformBuffer && ic.omegaStagingBuffer) {
    const buf = new Float32Array(1)
    buf[0] = config.harmonicOmega
    device.queue.writeBuffer(ic.omegaStagingBuffer, 0, buf)
    encoder.copyBufferToBuffer(ic.omegaStagingBuffer, 0, ic.uniformBuffer, 308, 4)
  }

  // Fill potential buffer
  if (ic.pl && ic.bg) {
    if (config.potentialType === 'custom') {
      ic.customPotentialScale = uploadCustomPotentialBuffer(device, ic.potentialBuffer, config)
    } else if (config.potentialType === 'andersonDisorder') {
      ic.customPotentialScale = uploadAndersonDisorderBuffer(device, ic.potentialBuffer, config)
    } else {
      const pass = ctx.beginComputePass({ label: 'tdse-potential-fill' })
      const potPl = siteDispatch.use3D ? ic.pl.potentialPipeline3D : ic.pl.potentialPipeline
      ic.dispatchCompute(
        pass,
        potPl,
        [ic.bg.potentialBG],
        siteDispatch.x,
        siteDispatch.y,
        siteDispatch.z
      )
      pass.end()
    }
    // Disorder overlay for non-Anderson potentials only.
    // Anderson disorder is fully generated by uploadAndersonDisorderBuffer.
    if (config.potentialType !== 'andersonDisorder') {
      maybeDispatchDisorder(
        device,
        ctx,
        config,
        ic.disorderState,
        ic.potentialBuffer,
        ic.totalSites,
        linearWG,
        ic.dispatchCompute
      )
    }
  }

  ic.diagState.maxDensity = estimateInitialDensity(config)
  ic.diagState.initialNorm = -1.0
  ic.diagState.initialMaxDensity = 1.0
  ic.diagState.prevNorm = 0
  ic.diagState.stagnationCount = 0
  ic.simTime = 0
  ic.stepAccumulator = 0
  if (ic.stochasticState) resetStochasticLocState(ic.stochasticState)
  ic.diagState.pendingAutoReset = false
  ic.diagState.diagGeneration++
  ic.initialized = true

  // Seed targetNorm for imaginary-time renormalization
  if (config.imaginaryTimeEnabled && ic.bg?.renormalizeUniformBuffer) {
    device.queue.writeBuffer(ic.bg.renormalizeUniformBuffer, 4, new Float32Array([1.0]))
  }
  ic.diagState.diagHistory.clear()
  useDiagnosticsStore.getState().resetTdse()
}
