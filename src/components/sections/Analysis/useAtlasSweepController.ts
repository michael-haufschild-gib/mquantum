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

/** If no new entanglement sample arrives for this many polls, abort the point as stalled. */
const STALL_POLL_LIMIT = 75 // 75 × 400ms = 30s

/** Update stall counter. Returns true if stalled (no progress for STALL_POLL_LIMIT polls). */
function checkStalled(
  entSamples: number,
  lastSeenN: number,
  stallCountRef: { current: number }
): boolean {
  if (entSamples === lastSeenN && entSamples === 0) {
    stallCountRef.current++
  } else if (entSamples > lastSeenN) {
    stallCountRef.current = 0
  }
  return stallCountRef.current >= STALL_POLL_LIMIT
}

/** Pre-sweep physics state snapshot for restoration on abort/complete. */
interface PreSweepSnapshot {
  potentialType: TdsePotentialType
  anharmonicLambda: number
  dimension: number
  stochasticEnabled: boolean
  stochasticGamma: number
  entanglementEnabled: boolean
  computeWignerNegativity: boolean
  computePairwiseMI: boolean
  computeBipartitions: boolean
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

  // Configure stochastic monitoring — always set gamma to avoid stale values
  ext.setTdseStochasticGamma(gamma)
  ext.setTdseStochasticEnabled(gamma > 0)

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
  /** Polls without new entanglement data — detects stalled simulations. */
  const stallCountRef = useRef(0)

  const status = useQuantumnessAtlasStore((s) => s.status)

  const restoreSnapshot = () => {
    const snap = snapshotRef.current
    if (!snap) return
    snapshotRef.current = null

    const ext = useExtendedObjectStore.getState()
    ext.setTdsePotentialType(snap.potentialType)
    ext.setTdseAnharmonicLambda(snap.anharmonicLambda)

    ext.setTdseStochasticGamma(snap.stochasticGamma)
    ext.setTdseStochasticEnabled(snap.stochasticEnabled)

    useGeometryStore.getState().setDimension(snap.dimension)

    // Restore entanglement settings
    const entStore = useCoordinateEntanglementStore.getState()
    entStore.setEnabled(snap.entanglementEnabled)
    entStore.setComputeWignerNegativity(snap.computeWignerNegativity)
    entStore.setComputePairwiseMI(snap.computePairwiseMI)
    entStore.setComputeBipartitions(snap.computeBipartitions)

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
      computePairwiseMI: entStore.computePairwiseMI,
      computeBipartitions: entStore.computeBipartitions,
    }

    // Start sweep first — if validation throws, no state is mutated
    atlasStore.startSweep()

    // Enable entanglement + Wigner for the sweep, disable expensive MI/bipartitions
    entStore.setEnabled(true)
    entStore.setComputeWignerNegativity(true)
    entStore.setComputePairwiseMI(false)
    entStore.setComputeBipartitions(false)
    entStore.clearHistory()

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

        // Stall detection: abort if no worker results for ~30s
        if (checkStalled(entSamples, lastSeenNRef.current, stallCountRef)) {
          logger.warn('[atlas] Sweep stalled — no entanglement results after 30s, aborting')
          useQuantumnessAtlasStore.getState().abortSweep()
          restoreSnapshot()
          return
        }

        // During measurement window: record one sample per poll when new data exists.
        // Intentionally takes one snapshot per poll (not one per worker result) because
        // the entanglement store only holds current values, not a per-result history.
        // The 400ms polling interval provides natural decorrelation between samples.
        if (entSamples >= evolveNeeded && samplesRecordedRef.current < measureNeeded) {
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
          stallCountRef.current = 0

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
