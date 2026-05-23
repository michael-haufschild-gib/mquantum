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

function finiteNonNegative(value: number, fallback = 0): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function finitePositive(value: number, fallback = 1): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function finiteCount(value: number, fallback = 0): number {
  return Math.round(finiteNonNegative(value, fallback))
}

function sanitizeGpuStats(stats: GPUStats, fallback: GPUStats): GPUStats {
  return {
    calls: finiteCount(stats.calls, fallback.calls),
    triangles: finiteCount(stats.triangles, fallback.triangles),
    vertices: finiteCount(stats.vertices, fallback.vertices),
    points: finiteCount(stats.points, fallback.points),
    lines: finiteCount(stats.lines, fallback.lines),
  }
}

function sanitizeMemoryStats(stats: MemoryStats, fallback: MemoryStats): MemoryStats {
  return {
    geometries: finiteCount(stats.geometries, fallback.geometries),
    textures: finiteCount(stats.textures, fallback.textures),
    programs: finiteCount(stats.programs, fallback.programs),
    heap: finiteNonNegative(stats.heap, fallback.heap),
  }
}

function sanitizeVramStats(stats: VRAMStats, fallback: VRAMStats): VRAMStats {
  return {
    geometries: finiteNonNegative(stats.geometries, fallback.geometries),
    textures: finiteNonNegative(stats.textures, fallback.textures),
    total: finiteNonNegative(stats.total, fallback.total),
  }
}

function sanitizeHistorySeries(values: number[], fallback: number[]): number[] {
  return values.map((value, index) => finiteNonNegative(value, fallback[index] ?? 0))
}

function sanitizeHistoryData(history: GraphData, fallback: GraphData): GraphData {
  return {
    fps: sanitizeHistorySeries(history.fps, fallback.fps),
    cpu: sanitizeHistorySeries(history.cpu, fallback.cpu),
    mem: sanitizeHistorySeries(history.mem, fallback.mem),
  }
}

function sanitizeBufferDimensions(
  dimensions: BufferDimensions,
  fallback: BufferDimensions
): BufferDimensions {
  return {
    width: finiteCount(dimensions.width, fallback.width),
    height: finiteCount(dimensions.height, fallback.height),
  }
}

function sanitizeBufferStats(buffers: BufferStats, fallback: BufferStats): BufferStats {
  return {
    temporal: sanitizeBufferDimensions(buffers.temporal, fallback.temporal),
    screen: sanitizeBufferDimensions(buffers.screen, fallback.screen),
  }
}

function sanitizeCpuBreakdown(breakdown: CpuBreakdown): CpuBreakdown {
  return {
    setupMs: finiteNonNegative(breakdown.setupMs),
    passesMs: finiteNonNegative(breakdown.passesMs),
    submitMs: finiteNonNegative(breakdown.submitMs),
  }
}

function sanitizePassTimings(timings: PassTimingEntry[]): PassTimingEntry[] {
  return timings.map((timing) => ({
    passId: timing.passId,
    gpuTimeMs: finiteNonNegative(timing.gpuTimeMs),
    computeGpuTimeMs: finiteNonNegative(timing.computeGpuTimeMs),
    renderGpuTimeMs: finiteNonNegative(timing.renderGpuTimeMs),
    cpuTimeMs: finiteNonNegative(timing.cpuTimeMs),
    skipped: timing.skipped === true,
  }))
}

function sanitizeMetricsPatch(
  metrics: Partial<PerformanceMetricsState>,
  state: PerformanceMetricsState
): Partial<PerformanceMetricsState> {
  const patch: Partial<PerformanceMetricsState> = { ...metrics }
  if (metrics.fps !== undefined) patch.fps = finiteNonNegative(metrics.fps, state.fps)
  if (metrics.minFps !== undefined) {
    patch.minFps =
      metrics.minFps === Infinity ? Infinity : finiteNonNegative(metrics.minFps, state.minFps)
  }
  if (metrics.maxFps !== undefined) patch.maxFps = finiteNonNegative(metrics.maxFps, state.maxFps)
  if (metrics.frameTime !== undefined) {
    patch.frameTime = finiteNonNegative(metrics.frameTime, state.frameTime)
  }
  if (metrics.cpuTime !== undefined)
    patch.cpuTime = finiteNonNegative(metrics.cpuTime, state.cpuTime)
  if (metrics.gpu) patch.gpu = sanitizeGpuStats(metrics.gpu, state.gpu)
  if (metrics.sceneGpu) patch.sceneGpu = sanitizeGpuStats(metrics.sceneGpu, state.sceneGpu)
  if (metrics.memory) patch.memory = sanitizeMemoryStats(metrics.memory, state.memory)
  if (metrics.vram) patch.vram = sanitizeVramStats(metrics.vram, state.vram)
  if (metrics.viewport) {
    patch.viewport = {
      width: finiteCount(metrics.viewport.width, state.viewport.width),
      height: finiteCount(metrics.viewport.height, state.viewport.height),
      dpr: finitePositive(metrics.viewport.dpr, state.viewport.dpr),
    }
  }
  if (metrics.history) patch.history = sanitizeHistoryData(metrics.history, state.history)
  return patch
}

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

  updateMetrics: (metrics) =>
    set((state) => ({ ...state, ...sanitizeMetricsPatch(metrics, state) })),
  setGpuName: (name) => set({ gpuName: name.trim() || 'Unknown GPU' }),
  updateBufferStats: (buffers) =>
    set((state) => ({ buffers: sanitizeBufferStats(buffers, state.buffers) })),
  updateSceneGpu: (stats) =>
    set((state) => ({ sceneGpu: sanitizeGpuStats(stats, state.sceneGpu) })),
  updatePassTimings: (timings, totalGpuMs) => {
    const passTimings = sanitizePassTimings(timings)
    const fallbackTotalGpuMs = passTimings.reduce((sum, timing) => sum + timing.gpuTimeMs, 0)
    set({
      passTimings,
      totalGpuTimeMs: finiteNonNegative(totalGpuMs, fallbackTotalGpuMs),
    })
  },
  updateCpuBreakdown: (breakdown) => set({ cpuBreakdown: sanitizeCpuBreakdown(breakdown) }),
}))
