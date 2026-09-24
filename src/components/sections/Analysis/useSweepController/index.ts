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
import { useAnimationStore } from '@/stores/scene/animationStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

const SWEEP_EVOLVE_ENTRIES = 20
const SWEEP_MEASURE_ENTRIES = 10
const SWEEP_POLL_MS = 500
/**
 * Polls without a new finite entanglement sample before a step is closed as
 * stalled (60 × 500 ms = 30 s). Non-finite results (e.g. a diverging
 * high-λ point) never advance `longTimeN`, so without this the sweep waited
 * forever; the step is instead recorded with whatever finite samples it has
 * (NaN → rendered as "no finite samples") and the sweep moves on.
 */
const SWEEP_STALL_POLL_LIMIT = 60

/**
 * Entanglement samples are only produced while the simulation is playing in
 * a visible tab (TDSE runs on requestAnimationFrame and skips entanglement
 * readback when paused). Stall polls are counted only then, so pausing or
 * backgrounding pauses the sweep instead of closing its steps as NaN.
 */
function isEntanglementSamplingActive(): boolean {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false
  return useAnimationStore.getState().isPlaying
}

type EntanglementStoreState = ReturnType<typeof useCoordinateEntanglementStore.getState>

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
  const stallSeenNRef = useRef(0)
  const stallPollsRef = useRef(0)
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
    stallSeenNRef.current = 0
    stallPollsRef.current = 0

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

    // Count polls without a new finite sample; true once the step is stalled.
    const pollStalled = (longTimeN: number): boolean => {
      if (longTimeN === stallSeenNRef.current) {
        if (isEntanglementSamplingActive()) stallPollsRef.current++
      } else {
        stallSeenNRef.current = longTimeN
        stallPollsRef.current = 0
      }
      return stallPollsRef.current >= SWEEP_STALL_POLL_LIMIT
    }

    // Close the current step, then start the next one or finish the sweep.
    const closeStep = (entStore: EntanglementStoreState, stalled: boolean): void => {
      if (stalled) {
        logger.warn(
          `[SweepController] no finite entanglement sample for ${SWEEP_STALL_POLL_LIMIT} polls — closing step`
        )
      }
      stallPollsRef.current = 0
      entStore.completeSweepStep()
      const next = entStore.advanceSweepStep()

      if (!next) {
        entStore.completeSweep()
        restorePreSweepState()
        return
      }
      stepStartNRef.current = entStore.longTimeN
      lastRecordedNRef.current = entStore.longTimeN
      const ext = useExtendedObjectStore.getState()
      ext.setTdseAnharmonicLambda(next.lambda)
      const currentDim = useGeometryStore.getState().dimension
      if (currentDim !== next.dim) {
        useGeometryStore.getState().setDimension(next.dim)
      }
      ext.resetTdseField()
    }

    sweepTickRef.current = setInterval(() => {
      try {
        const entStore = useCoordinateEntanglementStore.getState()
        if (entStore.sweepStatus !== 'running') return

        const samplesSinceStart = entStore.longTimeN - stepStartNRef.current
        const totalNeeded = SWEEP_EVOLVE_ENTRIES + SWEEP_MEASURE_ENTRIES
        const stalled = pollStalled(entStore.longTimeN)

        if (
          samplesSinceStart >= SWEEP_EVOLVE_ENTRIES &&
          entStore.longTimeN > lastRecordedNRef.current
        ) {
          entStore.recordSweepSample(entStore.currentNormalizedEntropy)
          lastRecordedNRef.current = entStore.longTimeN
        }

        if (samplesSinceStart >= totalNeeded || stalled) {
          closeStep(entStore, stalled)
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
