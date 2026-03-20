/**
 * Quantum Carpet Store
 *
 * State management for the quantum carpet spacetime diagram.
 * Tracks carpet accumulation (writeHead, totalFrames), display settings
 * (colormap, axis, log scale), and the CPU-side carpet data buffer
 * received from GPU readback.
 *
 * @module stores/carpetStore
 */

import { create } from 'zustand'

/** Available perceptually uniform colormaps. */
export type CarpetColormap = 'viridis' | 'inferno' | 'magma' | 'plasma'

/** Valid history length options (rows in the rolling 2D texture). */
export type CarpetHistoryLength = 256 | 512 | 1024

/** Quantum carpet store state — spacetime diagram accumulation and display settings. */
export interface CarpetState {
  /** Master toggle — controls texture creation and compute dispatch. */
  enabled: boolean
  /** Which spatial axis to slice along (0 = x₀, 1 = x₁, ...). */
  sliceAxis: number
  /** Slice position on perpendicular axis 1 (normalized 0..1, default 0.5 = center). */
  slicePositionY: number
  /** Slice position on perpendicular axis 2 (normalized 0..1, default 0.5 = center). */
  slicePositionZ: number
  /** Active colormap selection. */
  colormap: CarpetColormap
  /** Use log scale (reads .g channel) vs linear (.r channel). */
  logScale: boolean
  /** Whether accumulation is paused (GPU dispatch skipped, display frozen). */
  paused: boolean
  /** Number of history rows in the rolling 2D texture. */
  historyLength: CarpetHistoryLength
  /** Current write head position (modulo historyLength). Set by compute pass. */
  writeHead: number
  /** Total frames accumulated since last clear. */
  totalFrames: number
  /** Simulation time per frame (for axis label). Set by compute pass. */
  dtPerFrame: number
  /** CPU-side carpet data from GPU readback. null when no data available. */
  carpetData: Float32Array | null
  /** writeHead at the time carpetData was captured (for correct rolling display). */
  readbackWriteHead: number
  /** totalFrames at the time carpetData was captured. */
  readbackTotalFrames: number
  /** Grid size of the density texture (spatial resolution). Set by compute pass. */
  gridSize: number

  // ── Actions ──
  setEnabled: (v: boolean) => void
  setSliceAxis: (axis: number) => void
  setSlicePositionY: (v: number) => void
  setSlicePositionZ: (v: number) => void
  setColormap: (c: CarpetColormap) => void
  setLogScale: (v: boolean) => void
  togglePaused: () => void
  setHistoryLength: (v: CarpetHistoryLength) => void
  /** Reset writeHead, totalFrames, and clear carpet data. */
  clear: () => void
  /** Advance the write head by one row. Called by compute pass each frame. */
  advanceHead: (dt: number) => void
  /** Store the latest readback data from GPU with the writeHead/totalFrames at capture time. */
  setCarpetData: (
    data: Float32Array,
    gridSize: number,
    captureWriteHead: number,
    captureTotalFrames: number
  ) => void
}

export const useCarpetStore = create<CarpetState>((set, get) => ({
  enabled: false,
  sliceAxis: 0,
  slicePositionY: 0.5,
  slicePositionZ: 0.5,
  colormap: 'viridis',
  logScale: false,
  paused: false,
  historyLength: 512,
  writeHead: 0,
  totalFrames: 0,
  dtPerFrame: 0,
  carpetData: null,
  readbackWriteHead: 0,
  readbackTotalFrames: 0,
  gridSize: 96,

  setEnabled: (v) => set({ enabled: v }),

  setSliceAxis: (axis) => {
    const clamped = Math.max(0, Math.floor(axis))
    set({
      sliceAxis: clamped,
      writeHead: 0,
      totalFrames: 0,
      carpetData: null,
      readbackWriteHead: 0,
      readbackTotalFrames: 0,
    })
  },

  setSlicePositionY: (v) => set({ slicePositionY: Math.max(0, Math.min(1, v)) }),
  setSlicePositionZ: (v) => set({ slicePositionZ: Math.max(0, Math.min(1, v)) }),

  setColormap: (c) => set({ colormap: c }),
  setLogScale: (v) =>
    set({
      logScale: v,
      writeHead: 0,
      totalFrames: 0,
      carpetData: null,
      readbackWriteHead: 0,
      readbackTotalFrames: 0,
    }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),

  setHistoryLength: (v) => {
    set({
      historyLength: v,
      writeHead: 0,
      totalFrames: 0,
      carpetData: null,
      readbackWriteHead: 0,
      readbackTotalFrames: 0,
    })
  },

  clear: () =>
    set({
      writeHead: 0,
      totalFrames: 0,
      carpetData: null,
      readbackWriteHead: 0,
      readbackTotalFrames: 0,
    }),

  advanceHead: (dt) => {
    const { writeHead, historyLength, totalFrames } = get()
    set({
      writeHead: (writeHead + 1) % historyLength,
      totalFrames: totalFrames + 1,
      dtPerFrame: dt,
    })
  },

  setCarpetData: (data, gridSize, captureWriteHead, captureTotalFrames) =>
    set({
      carpetData: data,
      gridSize,
      readbackWriteHead: captureWriteHead,
      readbackTotalFrames: captureTotalFrames,
    }),
}))
