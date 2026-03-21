/**
 * Density Grid Diagnostics Store
 *
 * Runtime store for analytic mode (HO, hydrogen) density diagnostics.
 * Updated by DensityGridComputePass after each GPU readback cycle.
 * E2e tests read these values to verify shader correctness against
 * analytical expectations — the GPU correctness oracle.
 *
 * Also stores center-plane wavefunction slices |ψ(x)|² along each axis
 * for data export.
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

/** Center-plane wavefunction slice data for export. */
export interface WavefunctionSliceData {
  /** |ψ|² values along x-axis at y=center, z=center */
  sliceX: Float32Array | null
  /** |ψ|² values along y-axis at x=center, z=center */
  sliceY: Float32Array | null
  /** |ψ|² values along z-axis at x=center, y=center */
  sliceZ: Float32Array | null
  /** Grid resolution of the slice */
  sliceGridSize: number
  /** World-space half-extent for mapping grid index to position */
  sliceWorldBound: number
}

interface DensityDiagnosticsState extends DensityDiagnosticsSnapshot, WavefunctionSliceData {
  /** Whether any diagnostics data has been received from GPU */
  hasData: boolean

  /** Push a new diagnostics snapshot from GPU readback */
  pushSnapshot: (snapshot: DensityDiagnosticsSnapshot) => void
  /** Push center-plane wavefunction slices */
  pushSlices: (slices: WavefunctionSliceData) => void
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
  sliceX: null,
  sliceY: null,
  sliceZ: null,
  sliceGridSize: 0,
  sliceWorldBound: 0,

  pushSnapshot: (snapshot) => {
    set({ ...snapshot, hasData: true })
  },

  pushSlices: (slices) => {
    set(slices)
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
      sliceX: null,
      sliceY: null,
      sliceZ: null,
      sliceGridSize: 0,
      sliceWorldBound: 0,
    })
  },
}))
