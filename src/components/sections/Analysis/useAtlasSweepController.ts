/**
 * Quantumness Atlas Sweep Controller
 *
 * Orchestrates a tri-loop parameter sweep (N → λ → γ) that collects
 * three independent diagnostics per point: coordinate entanglement (S̄),
 * Wigner negativity (N̄_W), and spatial delocalization (IPR_norm).
 *
 * **Loop order** (outer → inner):
 * 1. N (dimension) — most expensive to change (pipeline rebuild)
 * 2. λ (coupling) — moderate cost (potential reconfiguration + field reset)
 * 3. γ (monitoring rate) — cheapest to change (just a uniform update)
 *
 * Each sweep point waits for `evolveSamples` entanglement worker results
 * (thermalization), then collects `measureSamples` diagnostic snapshots.
 * The controller polls the entanglement and diagnostics stores to read
 * results, feeds them to the atlas store accumulators, and advances to
 * the next point when enough samples are collected.
 *
 * @module components/sections/Analysis/useAtlasSweepController
 */

import { useEffect, useRef } from 'react'

import type { TdsePotentialType } from '@/lib/geometry/extended/tdse'
import { logger } from '@/lib/logger'
import { useCoordinateEntanglementStore } from '@/stores/coordinateEntanglementStore'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import {
  type AtlasSweepConfig,
  lambdaForStep,
  useQuantumnessAtlasStore,
} from '@/stores/quantumnessAtlasStore'

/** Polling interval for sweep progress (ms). */
const POLL_MS = 400

/** Pre-sweep physics state snapshot for restoration on abort/complete. */
interface PreSweepSnapshot {
  potentialType: TdsePotentialType
  anharmonicLambda: number
  dimension: number
  stochasticEnabled: boolean
  stochasticGamma: number
  entanglementEnabled: boolean
  computeWignerNegativity: boolean
}

/** Configures the TDSE for a specific atlas sweep point. */
function applyPointConfig(dim: number, lambda: number, gamma: number, dimChanged: boolean): void {
  const ext = useExtendedObjectStore.getState()
  const geo = useGeometryStore.getState()

  // Dimension change triggers full pipeline rebuild
  if (dimChanged || geo.dimension !== dim) {
    geo.setDimension(dim)
  }

  ext.setTdsePotentialType('coupledAnharmonic')
  ext.setTdseAnharmonicLambda(lambda)

  // Configure stochastic monitoring
  if (gamma > 0) {
    ext.setTdseStochasticEnabled(true)
    ext.setTdseStochasticGamma(gamma)
  } else {
    ext.setTdseStochasticEnabled(false)
  }

  // Reset the field to a fresh Gaussian for each point
  ext.resetTdseField()
}

/**
 * Manages the Quantumness Atlas sweep lifecycle.
 *
 * @returns Start/abort handlers for the atlas sweep.
 */
export function useAtlasSweepController(): {
  handleStartAtlasSweep: (config?: Partial<AtlasSweepConfig>) => void
  handleAbortAtlasSweep: () => void
} {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const snapshotRef = useRef<PreSweepSnapshot | null>(null)
  /** Tracks the entanglement store's longTimeN at the start of each point. */
  const pointStartNRef = useRef(0)
  /** Tracks how many diagnostic samples have been recorded for the current point. */
  const samplesRecordedRef = useRef(0)
  /** Tracks entSamples at last poll to detect new worker arrivals. */
  const lastSeenNRef = useRef(0)

  const status = useQuantumnessAtlasStore((s) => s.status)

  const restoreSnapshot = () => {
    const snap = snapshotRef.current
    if (!snap) return
    snapshotRef.current = null

    const ext = useExtendedObjectStore.getState()
    ext.setTdsePotentialType(snap.potentialType)
    ext.setTdseAnharmonicLambda(snap.anharmonicLambda)

    if (snap.stochasticEnabled) {
      ext.setTdseStochasticEnabled(true)
      ext.setTdseStochasticGamma(snap.stochasticGamma)
    } else {
      ext.setTdseStochasticEnabled(false)
    }

    useGeometryStore.getState().setDimension(snap.dimension)

    // Restore entanglement settings
    const entStore = useCoordinateEntanglementStore.getState()
    entStore.setEnabled(snap.entanglementEnabled)
    entStore.setComputeWignerNegativity(snap.computeWignerNegativity)

    queueMicrotask(() => {
      useExtendedObjectStore.getState().resetTdseField()
    })
  }

  const handleStartAtlasSweep = (configOverride?: Partial<AtlasSweepConfig>) => {
    const atlasStore = useQuantumnessAtlasStore.getState()
    if (configOverride) {
      atlasStore.setConfig(configOverride)
    }

    // Snapshot current physics state
    const ext = useExtendedObjectStore.getState()
    const tdse = ext.schroedinger.tdse
    const entStore = useCoordinateEntanglementStore.getState()
    snapshotRef.current = {
      potentialType: tdse.potentialType,
      anharmonicLambda: tdse.anharmonicLambda,
      dimension: useGeometryStore.getState().dimension,
      stochasticEnabled: tdse.stochasticEnabled,
      stochasticGamma: tdse.stochasticGamma,
      entanglementEnabled: entStore.enabled,
      computeWignerNegativity: entStore.computeWignerNegativity,
    }

    // Enable entanglement + Wigner for the sweep
    entStore.setEnabled(true)
    entStore.setComputeWignerNegativity(true)
    entStore.clearHistory()

    // Start sweep — must re-read state after startSweep() because the
    // atlasStore snapshot captured above is stale after setConfig()/startSweep()
    atlasStore.startSweep()

    const config = useQuantumnessAtlasStore.getState().config
    const firstDim = config.dimensions[0]!
    const firstLambda = lambdaForStep(config, 0)
    const firstGamma = config.gammas[0]!

    pointStartNRef.current = useCoordinateEntanglementStore.getState().longTimeN
    samplesRecordedRef.current = 0
    lastSeenNRef.current = 0

    applyPointConfig(firstDim, firstLambda, firstGamma, true)
  }

  const handleAbortAtlasSweep = () => {
    useQuantumnessAtlasStore.getState().abortSweep()
    restoreSnapshot()
  }

  useEffect(() => {
    if (status !== 'running') {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }

    pollRef.current = setInterval(() => {
      try {
        const atlas = useQuantumnessAtlasStore.getState()
        if (atlas.status !== 'running') return

        const config = atlas.config
        const entStore = useCoordinateEntanglementStore.getState()
        const diagStore = useDiagnosticsStore.getState()

        // How many entanglement worker results have arrived since point start
        const entSamples = entStore.longTimeN - pointStartNRef.current
        const evolveNeeded = config.evolveSamples
        const measureNeeded = config.measureSamples

        // Tick frame counter
        atlas.tickFrame()

        // During measurement window: record one sample per poll if new data arrived
        if (entSamples >= evolveNeeded && samplesRecordedRef.current < measureNeeded) {
          // Check if at least one new worker result arrived since last poll
          if (entSamples > lastSeenNRef.current) {
            lastSeenNRef.current = entSamples
            const S = entStore.currentNormalizedEntropy
            const NW = entStore.currentAverageWignerNegativity
            const tdseIpr = diagStore.tdse.ipr

            // Compute normalized IPR = IPR / totalSites
            // IPR from diagnostics is already (Σ|ψ|²)² / Σ|ψ|⁴
            // We normalize by totalSites for [0,1] range
            const dim = config.dimensions[atlas.progress.dimIdx]!
            const gridSizePerDim = getGridSizeForDim(dim)
            const totalSites = Math.pow(gridSizePerDim, dim)
            const iprNorm = totalSites > 0 ? tdseIpr / totalSites : 0

            atlas.recordSample(S, NW, iprNorm)
            samplesRecordedRef.current++
          }
        }

        // Point complete when we've recorded the required number of measurement samples
        if (samplesRecordedRef.current >= measureNeeded) {
          const dim = config.dimensions[atlas.progress.dimIdx]!
          const gridSizePerDim = getGridSizeForDim(dim)
          const next = atlas.completePointAndAdvance(gridSizePerDim)

          if (next === null) {
            // Sweep complete
            atlas.completeSweep()
            restoreSnapshot()
            return
          }

          // Reset refs for next point
          pointStartNRef.current = entStore.longTimeN
          samplesRecordedRef.current = 0
          lastSeenNRef.current = 0

          applyPointConfig(next.dim, next.lambda, next.gamma, next.dimChanged)
        }
      } catch (err) {
        logger.error('[AtlasSweepController] poll error, aborting:', err)
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
        useQuantumnessAtlasStore.getState().abortSweep()
        restoreSnapshot()
      }
    }, POLL_MS)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      if (useQuantumnessAtlasStore.getState().status === 'running') {
        useQuantumnessAtlasStore.getState().abortSweep()
        restoreSnapshot()
      }
    }
  }, [status])

  return { handleStartAtlasSweep, handleAbortAtlasSweep }
}

/**
 * Returns the TDSE grid size per dimension for a given total dimension count.
 * Must match the grid sizes used by the TDSE pipeline.
 */
function getGridSizeForDim(_dim: number): number {
  // Read the actual grid size per dimension from the TDSE config.
  // gridSize is an array (one per lattice dim); all entries are equal
  // in the standard setup, so we read the first.
  const ext = useExtendedObjectStore.getState()
  const gridSize = ext.schroedinger.tdse.gridSize
  return gridSize[0] ?? 64
}
