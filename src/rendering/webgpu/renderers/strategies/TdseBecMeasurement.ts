/**
 * Born-rule measurement and eigenstate energy helpers for TDSE/BEC modes.
 *
 * Extracted from TdseBecStrategy.ts to keep the strategy file under the
 * project's 600-line cap. Handles measurement readback, wavefunction
 * collapse injection, and eigenstate energy retrieval from the diagnostics store.
 *
 * @module rendering/webgpu/renderers/strategies/TdseBecMeasurement
 */

import type { TdseConfig } from '@/lib/geometry/extended/tdse'
import { logger } from '@/lib/logger'
import { computeEffectiveSpacing } from '@/lib/physics/compactification'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useMeasurementStore } from '@/stores/measurementStore'

import type { WebGPURenderContext } from '../../core/types'
import type { TDSEComputePass } from '../../passes/TDSEComputePass'

/** Read the current eigenstate energy from the observables store if available. */
export function getCurrentEigenstateEnergy(): number {
  const obs = useDiagnosticsStore.getState().observables
  return obs.hasData ? obs.totalEnergy : NaN
}

/**
 * Handle measurement readback and collapse injection.
 *
 * Checks the measurement store for pending requests, triggers async
 * readback, samples from |psi|^2, and injects collapsed wavefunction.
 */
export function handleMeasurement(
  ctx: WebGPURenderContext,
  tdsePass: TDSEComputePass,
  tdseConfig: TdseConfig
): void {
  const mState = useMeasurementStore.getState()

  // Tick cooldown each frame
  if (mState.cooldownFrames > 0) {
    mState.tickCooldown()
  }

  // Check for pending measurement
  if (!mState.pendingMeasurement || mState.isCollapsing) return

  const gridSize = tdseConfig.gridSize.slice(0, tdseConfig.latticeDim)
  const spacing = computeEffectiveSpacing(
    tdseConfig.gridSize,
    tdseConfig.spacing,
    tdseConfig.compactDims,
    tdseConfig.compactRadii,
    tdseConfig.latticeDim
  )
  const measureAxis = mState.measureAxis
  const collapseWidth = mState.collapseWidth

  mState.startCollapse()

  // Request async readback
  const readbackPromise = tdsePass.requestMeasurementReadback(ctx)

  void readbackPromise
    .then(async (data) => {
      if (!data) {
        useMeasurementStore.getState().completeMeasurement([], 0, null)
        return
      }

      const { executeFullMeasurement, executePartialMeasurement } =
        await import('@/lib/physics/measurementOrchestrator')

      const config = {
        latticeDim: gridSize.length,
        gridSize,
        spacing,
        compactDims: tdseConfig.compactDims as boolean[] | undefined,
        metric: tdseConfig.metric,
        time: tdsePass.simTime,
      }

      const inject = (re: Float32Array, im: Float32Array) => {
        tdsePass.setLoadedWavefunction(re, im, true)
      }
      const record = (pos: number[], density: number, axis: number | null) => {
        useMeasurementStore.getState().completeMeasurement(pos, density, axis)
      }

      if (measureAxis !== null && measureAxis < gridSize.length) {
        executePartialMeasurement(
          data.re,
          data.im,
          config,
          measureAxis,
          collapseWidth,
          inject,
          record
        )
      } else {
        executeFullMeasurement(data.re, data.im, config, collapseWidth, inject, record)
      }
    })
    .catch((err) => {
      logger.error('[Measurement] Collapse failed:', err)
      const s = useMeasurementStore.getState()
      if (s.isCollapsing) s.completeMeasurement([], 0, null)
    })
}
