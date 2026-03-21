/**
 * Wavefunction Slice Store
 *
 * Request/fulfillment store for capturing a 1D cross-section |ψ(x)|²
 * from the live simulation. The UI sets a capture request; the render
 * loop fulfills it during the next diagnostics readback cycle.
 *
 * Used for data export of wavefunction slices in dynamic modes
 * (TDSE, BEC, FSF, Dirac, Pauli). Analytic modes use the
 * densityDiagnosticsStore slices populated by DensityGridComputePass.
 *
 * @module stores/wavefunctionSliceStore
 */

import { create } from 'zustand'

/** Axis along which to extract the 1D slice. */
export type SliceAxis = 'x' | 'y' | 'z'

interface WavefunctionSliceState {
  /** Whether a slice capture has been requested by the UI */
  captureRequested: boolean
  /** Which axis to slice along */
  requestedAxis: SliceAxis

  /** Captured slice data (|ψ|² along the requested axis at center of other axes) */
  sliceData: Float32Array | null
  /** Axis of the captured slice */
  sliceAxis: SliceAxis
  /** Number of grid points in the slice */
  sliceGridSize: number
  /** World-space half-extent for coordinate mapping */
  sliceWorldBound: number
  /** Whether slice data is available */
  hasData: boolean

  /** Request a slice capture for the given axis */
  requestCapture: (axis: SliceAxis) => void
  /** Called by the render loop to deliver captured slice data */
  fulfillCapture: (data: {
    sliceData: Float32Array
    axis: SliceAxis
    gridSize: number
    worldBound: number
  }) => void
  /** Clear the capture request (called by render loop after initiating readback) */
  clearRequest: () => void
  /** Reset all state */
  reset: () => void
}

/**
 * Zustand store for wavefunction slice capture requests and results.
 *
 * @example
 * ```ts
 * // UI triggers capture
 * useWavefunctionSliceStore.getState().requestCapture('x')
 *
 * // Render loop fulfills
 * useWavefunctionSliceStore.getState().fulfillCapture({ sliceData, axis, gridSize, worldBound })
 * ```
 */
export const useWavefunctionSliceStore = create<WavefunctionSliceState>((set) => ({
  captureRequested: false,
  requestedAxis: 'x',

  sliceData: null,
  sliceAxis: 'x',
  sliceGridSize: 0,
  sliceWorldBound: 0,
  hasData: false,

  requestCapture: (axis) => set({ captureRequested: true, requestedAxis: axis }),

  fulfillCapture: (data) =>
    set({
      sliceData: data.sliceData,
      sliceAxis: data.axis,
      sliceGridSize: data.gridSize,
      sliceWorldBound: data.worldBound,
      hasData: true,
      captureRequested: false,
    }),

  clearRequest: () => set({ captureRequested: false }),

  reset: () =>
    set({
      captureRequested: false,
      requestedAxis: 'x',
      sliceData: null,
      sliceAxis: 'x',
      sliceGridSize: 0,
      sliceWorldBound: 0,
      hasData: false,
    }),
}))
