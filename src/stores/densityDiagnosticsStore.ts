/**
 * Density Grid Diagnostics Store
 *
 * Runtime store for analytic mode (HO, hydrogen) density diagnostics.
 * Updated by DensityGridComputePass after each GPU readback cycle.
 * E2e tests read these values to verify shader correctness against
 * analytical expectations — the GPU correctness oracle.
 *
 * @module stores/densityDiagnosticsStore
 */

import { create } from 'zustand'

interface DensityDiagnosticsSnapshot {
  /** Maximum density |ψ|² in the grid */
  maxDensity: number
  /** Sum of all non-zero density voxels (unnormalized total probability) */
  totalDensityMass: number
  /** Number of voxels with density above threshold */
  activeVoxelCount: number
  /** Density at grid center voxel (nearest to world origin) */
  centerDensity: number
  /** Grid resolution used for this readback */
  gridSize: number
  /** World-space half-extent (grid covers [-worldBound, +worldBound]³) */
  worldBound: number
}

interface DensityDiagnosticsState extends DensityDiagnosticsSnapshot {
  /** Whether any diagnostics data has been received from GPU */
  hasData: boolean

  /** Push a new diagnostics snapshot from GPU readback */
  pushSnapshot: (snapshot: DensityDiagnosticsSnapshot) => void
  /** Reset to initial state */
  reset: () => void
}

export const useDensityDiagnosticsStore = create<DensityDiagnosticsState>((set) => ({
  hasData: false,
  maxDensity: 0,
  totalDensityMass: 0,
  activeVoxelCount: 0,
  centerDensity: 0,
  gridSize: 0,
  worldBound: 0,

  pushSnapshot: (snapshot) => {
    set({ ...snapshot, hasData: true })
  },

  reset: () => {
    set({
      hasData: false,
      maxDensity: 0,
      totalDensityMass: 0,
      activeVoxelCount: 0,
      centerDensity: 0,
      gridSize: 0,
      worldBound: 0,
    })
  },
}))
