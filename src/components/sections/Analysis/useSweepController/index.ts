/**
 * Atlas Sweep Controller Hook
 *
 * Manages the lifecycle of an entanglement atlas sweep: start/abort,
 * polling for convergence, physics state snapshot/restore.
 *
 * @module components/sections/Analysis/useSweepController
 */

import { useEffect, useRef } from 'react'

import type { TdsePotentialType } from '@/lib/geometry/extended/tdse'
import { logger } from '@/lib/logger'
import {
  type AtlasSweepConfig,
  lambdaForStep,
  useCoordinateEntanglementStore,
} from '@/stores/diagnostics/coordinateEntanglementStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

const SWEEP_EVOLVE_ENTRIES = 20
const SWEEP_MEASURE_ENTRIES = 10
const SWEEP_POLL_MS = 500

interface PreSweepSnapshot {
  potentialType: TdsePotentialType
  anharmonicLambda: number
  dimension: number
}

/** Manages atlas sweep lifecycle: start/abort, polling, physics state snapshot/restore. */
export function useSweepController(): {
  handleStartSweep: () => void
  handleAbortSweep: () => void
} {
  const sweepTickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stepStartNRef = useRef(0)
  const lastRecordedNRef = useRef(0)
  const preSweepRef = useRef<PreSweepSnapshot | null>(null)

  const sweepStatus = useCoordinateEntanglementStore((s) => s.sweepStatus)

  const restorePreSweepState = () => {
    const snap = preSweepRef.current
    if (!snap) return
    preSweepRef.current = null
    const ext = useExtendedObjectStore.getState()
    ext.setTdsePotentialType(snap.potentialType)
    ext.setTdseAnharmonicLambda(snap.anharmonicLambda)
    useGeometryStore.getState().setDimension(snap.dimension)
    // Defer field reset so dimension/potential changes fully propagate first
    queueMicrotask(() => {
      useExtendedObjectStore.getState().resetTdseField()
    })
  }

  const handleStartSweep = () => {
    // Guard against double-start: a programmatic re-invocation or a
    // fast double-click bypassing React's render cycle would otherwise
    // overwrite preSweepRef with the mid-sweep physics config, and a
    // subsequent abort/unmount would "restore" to that wrong state.
    // The UI gates the Start button by status, but the handler must
    // stay idempotent-safe for non-UI callers (tests, future wiring).
    if (useCoordinateEntanglementStore.getState().sweepStatus === 'running') return

    const config: AtlasSweepConfig = {
      lambdaMin: 0.01,
      lambdaMax: 50,
      lambdaSteps: 15,
      dimensions: [3, 4, 5],
    }

    const ext = useExtendedObjectStore.getState()
    const tdseState = ext.schroedinger.tdse
    preSweepRef.current = {
      potentialType: tdseState.potentialType,
      anharmonicLambda: tdseState.anharmonicLambda,
      dimension: useGeometryStore.getState().dimension,
    }

    const entStore = useCoordinateEntanglementStore.getState()
    entStore.clearHistory()
    entStore.startSweep(config)
    stepStartNRef.current = 0
    lastRecordedNRef.current = 0

    const firstLambda = lambdaForStep(config, 0)
    ext.setTdsePotentialType('coupledAnharmonic')
    ext.setTdseAnharmonicLambda(firstLambda)
    useGeometryStore.getState().setDimension(config.dimensions[0]!)
    ext.resetTdseField()
  }

  const handleAbortSweep = () => {
    useCoordinateEntanglementStore.getState().abortSweep()
    restorePreSweepState()
  }

  useEffect(() => {
    if (sweepStatus !== 'running') {
      if (sweepTickRef.current) {
        clearInterval(sweepTickRef.current)
        sweepTickRef.current = null
      }
      return
    }

    sweepTickRef.current = setInterval(() => {
      try {
        const entStore = useCoordinateEntanglementStore.getState()
        if (entStore.sweepStatus !== 'running') return

        const samplesSinceStart = entStore.longTimeN - stepStartNRef.current
        const totalNeeded = SWEEP_EVOLVE_ENTRIES + SWEEP_MEASURE_ENTRIES

        if (
          samplesSinceStart >= SWEEP_EVOLVE_ENTRIES &&
          entStore.longTimeN > lastRecordedNRef.current
        ) {
          entStore.recordSweepSample(entStore.currentNormalizedEntropy)
          lastRecordedNRef.current = entStore.longTimeN
        }

        if (samplesSinceStart >= totalNeeded) {
          entStore.completeSweepStep()
          const next = entStore.advanceSweepStep()

          if (next) {
            stepStartNRef.current = entStore.longTimeN
            lastRecordedNRef.current = entStore.longTimeN
            const ext = useExtendedObjectStore.getState()
            ext.setTdseAnharmonicLambda(next.lambda)
            const currentDim = useGeometryStore.getState().dimension
            if (currentDim !== next.dim) {
              useGeometryStore.getState().setDimension(next.dim)
            }
            ext.resetTdseField()
          } else {
            entStore.completeSweep()
            restorePreSweepState()
          }
        }
      } catch (err) {
        logger.error('[SweepController] poll error, aborting sweep:', err)
        if (sweepTickRef.current) {
          clearInterval(sweepTickRef.current)
          sweepTickRef.current = null
        }
        useCoordinateEntanglementStore.getState().abortSweep()
        restorePreSweepState()
      }
    }, SWEEP_POLL_MS)

    return () => {
      if (sweepTickRef.current) {
        clearInterval(sweepTickRef.current)
        sweepTickRef.current = null
      }
      // If unmounting while a sweep is running, abort and restore the
      // pre-sweep physics state so stores don't remain in sweep configuration.
      if (useCoordinateEntanglementStore.getState().sweepStatus === 'running') {
        useCoordinateEntanglementStore.getState().abortSweep()
        restorePreSweepState()
      }
    }
  }, [sweepStatus])

  return { handleStartSweep, handleAbortSweep }
}
