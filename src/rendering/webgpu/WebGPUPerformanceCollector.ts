/**
 * WebGPU Performance Collector
 *
 * Collects rendering performance metrics for WebGPU mode and publishes them
 * to the performanceMetricsStore. Matches the tiered measurement approach
 * used in WebGL mode.
 *
 * @module rendering/webgpu/WebGPUPerformanceCollector
 */

import {
  usePerformanceMetricsStore,
  GRAPH_POINTS,
  type GPUStats,
  type BufferStats,
} from '@/stores/performanceMetricsStore'
import { useUIStore } from '@/stores/uiStore'
import type { WebGPUFrameStats } from './core/types'
import type { WebGPURenderGraph } from './graph/WebGPURenderGraph'

// ============================================================================
// Constants
// ============================================================================

/** Hidden - no stats collection at all */
const TIER_HIDDEN = 0

/** FPS only - minimal overhead */
const TIER_FPS_ONLY = 1

/** Full stats - all metrics collected */
const TIER_FULL_STATS = 2

/** Update interval for publishing to store (500ms = 2Hz) */
const PUBLISH_INTERVAL_MS = 500

/**
 * Exponential smoothing factor for published FPS.
 *
 * At 2 Hz publishing this provides readable FPS without masking sustained shifts.
 */
const FPS_SMOOTHING_ALPHA = 0.35

// ============================================================================
// Types
// ============================================================================

interface AccumulatedStats {
  frameCount: number
  totalCpuTimeMs: number
  totalFrameTimeMs: number
  lastFps: number
  minFps: number
  maxFps: number

  // Draw stats (accumulated)
  drawCalls: number
  triangles: number
  vertices: number
  lines: number
  points: number

  // FPS history for sparkline
  fpsHistory: number[]
  cpuHistory: number[]
  memHistory: number[]
}

// ============================================================================
// WebGPUStatsCollector Class
// ============================================================================

/**
 * Collects and publishes WebGPU rendering statistics.
 *
 * @example
 * ```ts
 * const collector = new WebGPUStatsCollector()
 * collector.initialize(device)
 *
 * // In RAF loop:
 * const cpuStart = performance.now()
 * const stats = graph.execute(delta)
 * const cpuEnd = performance.now()
 * collector.recordFrame(cpuEnd - cpuStart, stats, graph, size, dpr)
 * ```
 */
export class WebGPUStatsCollector {
  private gpuName = 'WebGPU'
  private measurementTier = TIER_HIDDEN
  private lastPublishTime = 0
  private lastFrameTime = 0
  private smoothedFps: number | null = null

  private accumulated: AccumulatedStats = {
    frameCount: 0,
    totalCpuTimeMs: 0,
    totalFrameTimeMs: 0,
    lastFps: 60,
    minFps: Infinity,
    maxFps: 0,
    drawCalls: 0,
    triangles: 0,
    vertices: 0,
    lines: 0,
    points: 0,
    fpsHistory: new Array(GRAPH_POINTS).fill(60),
    cpuHistory: new Array(GRAPH_POINTS).fill(0),
    memHistory: new Array(GRAPH_POINTS).fill(0),
  }

  /**
   * Initialize the collector with GPU adapter info.
   *
   * @param adapter The WebGPU adapter
   */
  initialize(adapter: GPUAdapter): void {
    // Extract GPU name from adapter.info (sync property in modern WebGPU)
    const info = adapter.info
    if (info) {
      const vendor = info.vendor || ''
      const architecture = info.architecture || ''
      const description = info.description || ''

      // Build a readable GPU name
      if (description) {
        this.gpuName = description
      } else if (vendor && architecture) {
        this.gpuName = `${vendor} ${architecture}`
      } else if (vendor) {
        this.gpuName = vendor
      } else {
        this.gpuName = 'WebGPU Device'
      }
    }

    // Set initial GPU name in store
    usePerformanceMetricsStore.getState().setGpuName(this.gpuName)
  }

  /**
   * Update measurement tier based on UI visibility state.
   * Called each frame to check if monitoring is visible.
   */
  updateMeasurementTier(): void {
    const uiState = useUIStore.getState()

    if (!uiState.showPerfMonitor) {
      this.measurementTier = TIER_HIDDEN
    } else if (!uiState.perfMonitorExpanded) {
      this.measurementTier = TIER_FPS_ONLY
    } else {
      this.measurementTier = TIER_FULL_STATS
    }
  }

  /**
   * Record a frame's statistics.
   *
   * @param cpuTimeMs CPU time for the frame in milliseconds
   * @param frameStats Stats returned from graph.execute()
   * @param graph The render graph (for resource info)
   * @param size Canvas size { width, height }
   * @param size.width
   * @param size.height
   * @param dpr Device pixel ratio
   */
  recordFrame(
    cpuTimeMs: number,
    frameStats: WebGPUFrameStats,
    graph: WebGPURenderGraph,
    size: { width: number; height: number },
    dpr: number
  ): void {
    this.updateMeasurementTier()

    // Skip if hidden
    if (this.measurementTier === TIER_HIDDEN) {
      return
    }

    const now = performance.now()
    const frameTimeMs = this.lastFrameTime > 0 ? now - this.lastFrameTime : 16.67
    this.lastFrameTime = now

    // Calculate FPS
    const fps = frameTimeMs > 0 ? 1000 / frameTimeMs : 60

    // Accumulate stats
    this.accumulated.frameCount++
    this.accumulated.totalCpuTimeMs += cpuTimeMs
    this.accumulated.totalFrameTimeMs += frameTimeMs
    this.accumulated.lastFps = fps
    this.accumulated.minFps = Math.min(this.accumulated.minFps, fps)
    this.accumulated.maxFps = Math.max(this.accumulated.maxFps, fps)

    // Full stats mode: accumulate draw stats
    if (this.measurementTier === TIER_FULL_STATS && frameStats.drawStats) {
      this.accumulated.drawCalls += frameStats.drawStats.calls
      this.accumulated.triangles += frameStats.drawStats.triangles
      this.accumulated.vertices += frameStats.drawStats.vertices
      this.accumulated.lines += frameStats.drawStats.lines
      this.accumulated.points += frameStats.drawStats.points
    }

    // Check if it's time to publish (2Hz)
    if (now - this.lastPublishTime >= PUBLISH_INTERVAL_MS) {
      this.publishMetrics(graph, size, dpr)
      this.lastPublishTime = now
    }
  }

  /**
   * Publish accumulated metrics to the store.
   * @param graph
   * @param size
   * @param size.width
   * @param size.height
   * @param dpr
   */
  private publishMetrics(
    graph: WebGPURenderGraph,
    size: { width: number; height: number },
    dpr: number
  ): void {
    const { updateMetrics, updateBufferStats, updateSceneGpu } =
      usePerformanceMetricsStore.getState()

    const frameCount = this.accumulated.frameCount || 1

    // Calculate window averages (frame-time based, not last-sample instantaneous FPS).
    const avgFrameTime = this.accumulated.totalFrameTimeMs / frameCount
    const avgCpuTime = this.accumulated.totalCpuTimeMs / frameCount
    const windowAvgFps = avgFrameTime > 0 ? 1000 / avgFrameTime : this.accumulated.lastFps
    const smoothedFps =
      this.smoothedFps === null
        ? windowAvgFps
        : this.smoothedFps + FPS_SMOOTHING_ALPHA * (windowAvgFps - this.smoothedFps)
    this.smoothedFps = smoothedFps

    // Update FPS history (shift left, add new value)
    this.accumulated.fpsHistory.shift()
    this.accumulated.fpsHistory.push(smoothedFps)
    this.accumulated.cpuHistory.shift()
    this.accumulated.cpuHistory.push(avgCpuTime)

    // Get heap memory (if available)
    let heapMB = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perfMemory = (performance as any).memory
    if (perfMemory) {
      heapMB = perfMemory.usedJSHeapSize / (1024 * 1024)
    }
    this.accumulated.memHistory.shift()
    this.accumulated.memHistory.push(heapMB)

    // Build GPU stats (averaged per frame)
    const gpuStats: GPUStats = {
      calls: Math.round(this.accumulated.drawCalls / frameCount),
      triangles: Math.round(this.accumulated.triangles / frameCount),
      points: Math.round(this.accumulated.points / frameCount),
      lines: Math.round(this.accumulated.lines / frameCount),
      uniqueVertices: Math.round(this.accumulated.vertices / frameCount),
    }

    // Update metrics
    updateMetrics({
      fps: Math.round(smoothedFps),
      minFps: Math.round(this.accumulated.minFps),
      maxFps: Math.round(this.accumulated.maxFps),
      frameTime: avgFrameTime,
      cpuTime: avgCpuTime,
      gpu: gpuStats,
      memory: {
        geometries: 0, // WebGPU doesn't have direct geometry count
        textures: 0, // Will be filled from pool
        programs: 0, // Pipelines count would go here
        heap: heapMB,
      },
      vram: {
        geometries: graph.getVRAMUsage() / (1024 * 1024), // Convert to MB
        textures: 0,
        total: graph.getVRAMUsage() / (1024 * 1024),
      },
      viewport: {
        width: size.width,
        height: size.height,
        dpr,
      },
      history: {
        fps: [...this.accumulated.fpsHistory],
        cpu: [...this.accumulated.cpuHistory],
        mem: [...this.accumulated.memHistory],
      },
    })

    // Update scene GPU stats (same as gpu for WebGPU - no post-processing separation yet)
    updateSceneGpu(gpuStats)

    // Update buffer dimensions
    if (this.measurementTier === TIER_FULL_STATS) {
      const resourceDims = graph.getResourceDimensions()
      const bufferStats: BufferStats = {
        depth: resourceDims.get('depth-buffer') ?? { width: 0, height: 0 },
        normal: resourceDims.get('normal-buffer') ?? { width: 0, height: 0 },
        temporal: resourceDims.get('temporal-depth') ?? { width: 0, height: 0 },
        screen: { width: size.width, height: size.height },
      }
      updateBufferStats(bufferStats)
    }

    // Reset accumulators
    this.accumulated.frameCount = 0
    this.accumulated.totalCpuTimeMs = 0
    this.accumulated.totalFrameTimeMs = 0
    this.accumulated.minFps = Infinity
    this.accumulated.maxFps = 0
    this.accumulated.drawCalls = 0
    this.accumulated.triangles = 0
    this.accumulated.vertices = 0
    this.accumulated.lines = 0
    this.accumulated.points = 0
  }

  /**
   * Reset the collector state.
   */
  reset(): void {
    this.lastPublishTime = 0
    this.lastFrameTime = 0
    this.smoothedFps = null
    this.accumulated = {
      frameCount: 0,
      totalCpuTimeMs: 0,
      totalFrameTimeMs: 0,
      lastFps: 60,
      minFps: Infinity,
      maxFps: 0,
      drawCalls: 0,
      triangles: 0,
      vertices: 0,
      lines: 0,
      points: 0,
      fpsHistory: new Array(GRAPH_POINTS).fill(60),
      cpuHistory: new Array(GRAPH_POINTS).fill(0),
      memHistory: new Array(GRAPH_POINTS).fill(0),
    }
  }
}
