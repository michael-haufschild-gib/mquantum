/**
 * Measurement Store
 *
 * Tracks accumulated Born rule measurement results and statistics
 * for the measurement simulation feature (C3).
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
}

interface MeasurementState {
  /** Whether measurement mode is active */
  enabled: boolean
  /** Accumulated measurement records */
  measurements: MeasurementRecord[]
  /** Total number of measurements taken (including cleared) */
  totalCount: number
  /** Collapse Gaussian width (σ in world units) */
  collapseWidth: number
  /** Auto-evolve: frames to evolve after collapse before next measurement */
  autoEvolveFrames: number

  /** Per-dimension mean of measured positions */
  positionMean: number[]
  /** Per-dimension std deviation of measured positions */
  positionStd: number[]

  setEnabled: (enabled: boolean) => void
  setCollapseWidth: (width: number) => void
  setAutoEvolveFrames: (frames: number) => void
  addMeasurement: (position: number[], density: number) => void
  clearMeasurements: () => void
}

function computeStats(measurements: MeasurementRecord[]): {
  positionMean: number[]
  positionStd: number[]
} {
  if (measurements.length === 0) return { positionMean: [], positionStd: [] }

  const dims = measurements[0]!.position.length
  const mean = new Array<number>(dims).fill(0)
  const sq = new Array<number>(dims).fill(0)

  for (const m of measurements) {
    for (let d = 0; d < dims; d++) {
      mean[d]! += m.position[d]!
      sq[d]! += m.position[d]! * m.position[d]!
    }
  }

  const n = measurements.length
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
  positionMean: [],
  positionStd: [],

  setEnabled: (enabled) => set({ enabled }),
  setCollapseWidth: (width) => set({ collapseWidth: Math.max(0.05, Math.min(5, width)) }),
  setAutoEvolveFrames: (frames) =>
    set({ autoEvolveFrames: Math.max(1, Math.min(300, Math.floor(frames))) }),

  addMeasurement: (position, density) => {
    set((state) => {
      const record: MeasurementRecord = {
        position: [...position],
        density,
        index: state.totalCount,
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
    set({
      measurements: [],
      totalCount: 0,
      positionMean: [],
      positionStd: [],
    }),
}))
