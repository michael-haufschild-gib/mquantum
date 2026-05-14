/**
 * Measurement Store
 *
 * Tracks accumulated Born rule measurement results and statistics
 * for the measurement simulation feature (C3). Supports full and
 * partial (per-axis) measurement in N dimensions.
 *
 * @module stores/measurementStore
 */

import { create } from 'zustand'

/** Maximum number of stored measurements. */
const MAX_MEASUREMENTS = 1000

/** A single measurement result. */
export interface MeasurementRecord {
  /** N-D world-space position of the measurement */
  position: number[]
  /** Probability density |ψ|² at the sampled point */
  density: number
  /** Measurement index (sequential) */
  index: number
  /** Which axis was measured (null = full measurement) */
  measuredAxis: number | null
}

/** Pending measurement request from a canvas click. */
export interface PendingMeasurement {
  /** 3D world-space click position (from raycast) */
  clickPosition: [number, number, number]
}

interface MeasurementState {
  /** Whether measurement mode is active */
  enabled: boolean
  /** Accumulated measurement records */
  measurements: MeasurementRecord[]
  /** Total number of measurements taken (including cleared) */
  totalCount: number
  /** Collapse Gaussian width (sigma in world units) */
  collapseWidth: number
  /** Auto-evolve: frames to evolve after collapse before next measurement */
  autoEvolveFrames: number

  /** Axis to measure (null = full measurement of all axes) */
  measureAxis: number | null
  /** Whether a measurement readback/collapse is in progress */
  isCollapsing: boolean
  /** Monotonic token used to ignore stale async collapse readbacks */
  collapseGeneration: number
  /** Pending measurement request from canvas click */
  pendingMeasurement: PendingMeasurement | null
  /** Post-collapse cooldown counter (frames remaining) */
  cooldownFrames: number

  /** Per-dimension mean of measured positions */
  positionMean: number[]
  /** Per-dimension std deviation of measured positions */
  positionStd: number[]

  setEnabled: (enabled: boolean) => void
  setCollapseWidth: (width: number) => void
  setAutoEvolveFrames: (frames: number) => void
  setMeasureAxis: (axis: number | null) => void
  requestMeasurement: (clickPosition: [number, number, number]) => void
  startCollapse: () => void
  completeMeasurement: (position: number[], density: number, measuredAxis: number | null) => void
  tickCooldown: () => void
  /**
   * @internal Test-only seam for seeding measurement records without the
   * GPU readback → sample → inject → completeMeasurement pipeline.
   *
   * Unlike {@link completeMeasurement}, this does NOT touch the collapse
   * state machine (`isCollapsing`, `cooldownFrames`) — tests that need to
   * inspect stats, point-cloud rendering, or the clear button without
   * waiting for a real GPU measurement use this to pre-populate records.
   * Production code paths should use `completeMeasurement`; calling
   * `addMeasurement` from a live frame loop would bypass the cooldown and
   * leave the state machine inconsistent.
   */
  addMeasurement: (position: number[], density: number) => void
  clearMeasurements: () => void
}

function computeStats(measurements: MeasurementRecord[]): {
  positionMean: number[]
  positionStd: number[]
} {
  // Failed readbacks (TdseBecMeasurement → completeMeasurement([], 0, null))
  // append a record with `position: []`. Pick the latticeDim from the FIRST
  // valid record and skip any record whose position length doesn't match —
  // otherwise `m.position[d]` returns undefined for the empty record and NaN
  // poisons every accumulator, surfacing as `NaN` in the stats table.
  const firstValid = measurements.find((m) => m.position.length > 0)
  if (!firstValid) return { positionMean: [], positionStd: [] }

  const dims = firstValid.position.length
  const mean = new Array<number>(dims).fill(0)
  const sq = new Array<number>(dims).fill(0)
  let n = 0

  for (const m of measurements) {
    if (m.position.length !== dims) continue
    for (let d = 0; d < dims; d++) {
      mean[d]! += m.position[d]!
      sq[d]! += m.position[d]! * m.position[d]!
    }
    n += 1
  }

  if (n === 0) return { positionMean: [], positionStd: [] }
  const positionMean = mean.map((s) => s / n)
  const positionStd = sq.map((s2, d) => {
    const variance = s2 / n - positionMean[d]! * positionMean[d]!
    return Math.sqrt(Math.max(0, variance))
  })

  return { positionMean, positionStd }
}

export const useMeasurementStore = create<MeasurementState>((set) => ({
  enabled: false,
  measurements: [],
  totalCount: 0,
  collapseWidth: 0.3,
  autoEvolveFrames: 30,
  measureAxis: null,
  isCollapsing: false,
  collapseGeneration: 0,
  pendingMeasurement: null,
  cooldownFrames: 0,
  positionMean: [],
  positionStd: [],

  setEnabled: (enabled) =>
    set((state) =>
      enabled
        ? { enabled }
        : {
            enabled,
            isCollapsing: false,
            pendingMeasurement: null,
            cooldownFrames: 0,
            collapseGeneration: state.collapseGeneration + 1,
          }
    ),
  setCollapseWidth: (width) => set({ collapseWidth: Math.max(0.05, Math.min(5, width)) }),
  setAutoEvolveFrames: (frames) =>
    set({ autoEvolveFrames: Math.max(1, Math.min(300, Math.floor(frames))) }),
  setMeasureAxis: (axis) => set({ measureAxis: axis }),

  requestMeasurement: (clickPosition) => set({ pendingMeasurement: { clickPosition } }),

  startCollapse: () =>
    set((state) => ({
      isCollapsing: true,
      pendingMeasurement: null,
      collapseGeneration: state.collapseGeneration + 1,
    })),

  completeMeasurement: (position, density, measuredAxis) => {
    set((state) => {
      const record: MeasurementRecord = {
        position: [...position],
        density,
        index: state.totalCount,
        measuredAxis,
      }
      const measurements = [...state.measurements, record].slice(-MAX_MEASUREMENTS)
      const stats = computeStats(measurements)
      return {
        measurements,
        totalCount: state.totalCount + 1,
        isCollapsing: false,
        cooldownFrames: state.autoEvolveFrames,
        ...stats,
      }
    })
  },

  tickCooldown: () =>
    set((state) => ({
      cooldownFrames: Math.max(0, state.cooldownFrames - 1),
    })),

  addMeasurement: (position, density) => {
    set((state) => {
      const record: MeasurementRecord = {
        position: [...position],
        density,
        index: state.totalCount,
        measuredAxis: null,
      }
      const measurements = [...state.measurements, record].slice(-MAX_MEASUREMENTS)
      const stats = computeStats(measurements)
      return {
        measurements,
        totalCount: state.totalCount + 1,
        ...stats,
      }
    })
  },

  clearMeasurements: () =>
    set((state) => ({
      measurements: [],
      totalCount: 0,
      positionMean: [],
      positionStd: [],
      isCollapsing: false,
      cooldownFrames: 0,
      pendingMeasurement: null,
      collapseGeneration: state.collapseGeneration + 1,
    })),
}))
