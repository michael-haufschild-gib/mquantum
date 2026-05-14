/**
 * Performance metrics store.
 *
 * Holds per-frame GPU timing, draw call counts, memory stats, and
 * historical frame time data for the performance monitor overlay.
 * Updated by the render graph's stats collector after each frame.
 *
 * @module stores/performanceMetricsStore
 */

import { create } from 'zustand'

/** GPU timing metrics collected per frame. */
export interface GPUStats {
  calls: number
  triangles: number
  vertices: number
  points: number
  lines: number
}

/** JavaScript heap memory usage snapshot. */
export interface MemoryStats {
  geometries: number
  textures: number
  programs: number
  heap: number
}

/** GPU buffer and texture memory usage. */
export interface VRAMStats {
  geometries: number
  textures: number
  total: number
}

/** Time-series data points for performance sparklines. */
export interface GraphData {
  fps: number[]
  cpu: number[]
  mem: number[]
}

/** Width and height of a GPU buffer in pixels. */
export interface BufferDimensions {
  width: number
  height: number
}

/** Metadata for a named GPU buffer resource. */
export interface BufferStats {
  temporal: BufferDimensions
  screen: BufferDimensions
}

/** Per-pass timing data surfaced from the render graph. */
export interface PassTimingEntry {
  passId: string
  gpuTimeMs: number
  /** GPU time in compute passes (FFT, density grid). 0 if no compute work. */
  computeGpuTimeMs: number
  /** GPU time in render passes (volume raymarch, post-processing). 0 if no render work. */
  renderGpuTimeMs: number
  cpuTimeMs: number
  skipped: boolean
}

/** CPU time breakdown for the three phases of frame execution. */
export interface CpuBreakdown {
  setupMs: number
  passesMs: number
  submitMs: number
}

/** Aggregated performance metrics store state. */
export interface PerformanceMetricsState {
  fps: number
  minFps: number
  maxFps: number
  frameTime: number
  cpuTime: number
  gpu: GPUStats
  sceneGpu: GPUStats // Main scene geometry only (excludes post-processing passes)
  memory: MemoryStats
  vram: VRAMStats
  viewport: { width: number; height: number; dpr: number }
  buffers: BufferStats
  history: GraphData
  gpuName: string
  passTimings: PassTimingEntry[]
  totalGpuTimeMs: number
  cpuBreakdown: CpuBreakdown

  // Actions
  updateMetrics: (metrics: Partial<PerformanceMetricsState>) => void
  setGpuName: (name: string) => void
  updateBufferStats: (buffers: BufferStats) => void
  /** Update scene-only GPU stats (excludes post-processing passes) */
  updateSceneGpu: (stats: GPUStats) => void
  updatePassTimings: (timings: PassTimingEntry[], totalGpuMs: number) => void
  updateCpuBreakdown: (breakdown: CpuBreakdown) => void
}

export const GRAPH_POINTS = 40

const DEFAULT_BUFFER_DIMENSIONS: BufferDimensions = { width: 0, height: 0 }

export const usePerformanceMetricsStore = create<PerformanceMetricsState>((set) => ({
  fps: 60,
  minFps: Infinity,
  maxFps: 0,
  frameTime: 0,
  cpuTime: 0,
  gpu: { calls: 0, triangles: 0, vertices: 0, points: 0, lines: 0 },
  sceneGpu: { calls: 0, triangles: 0, vertices: 0, points: 0, lines: 0 },
  memory: { geometries: 0, textures: 0, programs: 0, heap: 0 },
  vram: { geometries: 0, textures: 0, total: 0 },
  viewport: { width: 0, height: 0, dpr: 1 },
  buffers: {
    temporal: { ...DEFAULT_BUFFER_DIMENSIONS },
    screen: { ...DEFAULT_BUFFER_DIMENSIONS },
  },
  history: {
    fps: new Array(GRAPH_POINTS).fill(60),
    cpu: new Array(GRAPH_POINTS).fill(0),
    mem: new Array(GRAPH_POINTS).fill(0),
  },
  gpuName: 'Unknown GPU',
  passTimings: [],
  totalGpuTimeMs: 0,
  cpuBreakdown: { setupMs: 0, passesMs: 0, submitMs: 0 },

  updateMetrics: (metrics) => set((state) => ({ ...state, ...metrics })),
  setGpuName: (name) => set({ gpuName: name }),
  updateBufferStats: (buffers) => set({ buffers }),
  updateSceneGpu: (stats) => set({ sceneGpu: stats }),
  updatePassTimings: (timings, totalGpuMs) =>
    set({ passTimings: timings, totalGpuTimeMs: totalGpuMs }),
  updateCpuBreakdown: (breakdown) => set({ cpuBreakdown: breakdown }),
}))
