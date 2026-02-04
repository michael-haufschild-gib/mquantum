/**
 * GPU Profiler API
 *
 * Exposes a window.__PROFILER__ API for automated performance analysis.
 * Wraps existing RenderGraph timing infrastructure with a Claude-friendly interface.
 *
 * DEV MODE ONLY - This entire module is tree-shaken in production builds.
 *
 * @example
 * ```javascript
 * // In browser console or via Chrome MCP:
 * window.__PROFILER__.enable()
 * window.__PROFILER__.startLogging(2000) // Log every 2s
 *
 * // Console outputs:
 * // {"type":"gpu-profile","frame":1234,"fps":58,"passes":[...]}
 *
 * window.__PROFILER__.stopLogging()
 * window.__PROFILER__.disable()
 * ```
 *
 * @module dev-tools/profiler/ProfilerAPI
 */

import type { RenderGraph } from '@/rendering/graph/RenderGraph'
import type { PassTiming, FrameStats } from '@/rendering/graph/types'
import { usePerformanceStore } from '@/stores/performanceStore'
import { SectionProfiler } from './SectionProfiler'

/**
 * Profile data output format for console logging.
 * Designed for machine parsing by Claude via Chrome MCP.
 */
export interface ProfileData {
  /** Discriminator for filtering console output */
  type: 'gpu-profile'

  /** Frame number */
  frame: number

  /** Current FPS */
  fps: number

  /** Target frame budget in ms (16.67 for 60fps) */
  budget: number

  /** Per-pass timing data */
  passes: Array<{
    name: string
    gpu: number
    cpu: number
    warning?: string
  }>

  /** Aggregate totals */
  total: {
    gpu: number
    cpu: number
  }
}

/**
 * Profiler API class.
 *
 * Provides a Claude-friendly interface to the RenderGraph's GPU timing system.
 * All methods are designed to be callable from the browser console.
 */
export class ProfilerAPI {
  private graph: RenderGraph | null = null
  private loggingInterval: ReturnType<typeof setInterval> | null = null
  private frameCount = 0
  private lastFrameTime = 0
  private fps = 0
  private enabled = false
  private sectionProfiler: SectionProfiler

  constructor() {
    this.sectionProfiler = new SectionProfiler(this)
  }

  /**
   * Attach to a RenderGraph instance.
   * Called internally when the graph is created.
   * @param graph
   */
  attach(graph: RenderGraph): void {
    this.graph = graph
    if (import.meta.env.DEV) {
      console.info('[Profiler] Attached to RenderGraph')
    }
  }

  /**
   * Detach from the current RenderGraph.
   * Called when the graph is disposed.
   */
  detach(): void {
    this.stopLogging()
    this.disable()
    this.graph = null
  }

  /**
   * Enable GPU timing collection.
   */
  enable(): void {
    if (!this.graph) {
      console.warn('[Profiler] No RenderGraph attached')
      return
    }

    this.graph.enableTimingQueries(true)
    this.enabled = true
    this.lastFrameTime = performance.now()

    if (import.meta.env.DEV) {
      console.info('[Profiler] GPU timing enabled')
    }
  }

  /**
   * Disable GPU timing collection.
   */
  disable(): void {
    if (!this.graph) return

    this.graph.enableTimingQueries(false)
    this.enabled = false

    if (import.meta.env.DEV) {
      console.info('[Profiler] GPU timing disabled')
    }
  }

  /**
   * Check if profiling is enabled.
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Get per-pass timing data from the last frame.
   * Returns empty array if timing is disabled or not available.
   */
  getPassTimings(): PassTiming[] {
    if (!this.graph) return []
    return this.graph.getPassTimings()
  }

  /**
   * Get complete frame statistics.
   * Returns null if timing is disabled or not available.
   */
  getFrameStats(): FrameStats | null {
    if (!this.graph) return null
    return this.graph.getFrameStats()
  }

  /**
   * Start automatic logging to console at specified interval.
   * Console output is JSON formatted for machine parsing.
   *
   * @param intervalMs - Logging interval in milliseconds (default: 1000)
   */
  startLogging(intervalMs = 1000): void {
    if (this.loggingInterval) {
      this.stopLogging()
    }

    if (!this.enabled) {
      this.enable()
    }

    this.loggingInterval = setInterval(() => {
      this.logProfileData()
    }, intervalMs)

    if (import.meta.env.DEV) {
      console.info(`[Profiler] Logging started (interval: ${intervalMs}ms)`)
    }
  }

  /**
   * Stop automatic logging.
   */
  stopLogging(): void {
    if (this.loggingInterval) {
      clearInterval(this.loggingInterval)
      this.loggingInterval = null

      if (import.meta.env.DEV) {
        console.info('[Profiler] Logging stopped')
      }
    }
  }

  /**
   * Update frame counter for FPS calculation.
   * Called internally by the render loop.
   */
  updateFrame(): void {
    this.frameCount++

    const now = performance.now()
    const delta = now - this.lastFrameTime

    // Update FPS every 500ms
    if (delta >= 500) {
      this.fps = (this.frameCount / delta) * 1000
      this.frameCount = 0
      this.lastFrameTime = now
    }
  }

  /**
   * Set debug visualization mode.
   * This updates the shader uniform via the performance store.
   *
   * @param mode - 0=off, 1=iterations, 2=depth, 3=normals
   */
  setDebugMode(mode: number): void {
    // Update the store, which triggers shader uniform updates
    usePerformanceStore.getState().setDebugMode(mode)
    if (import.meta.env.DEV) {
      const modeNames = ['off', 'iteration heatmap', 'depth', 'normals']
      console.info(`[Profiler] Debug mode: ${modeNames[mode] ?? mode}`)
    }
  }

  /**
   * Get current debug visualization mode.
   */
  getDebugMode(): number {
    return usePerformanceStore.getState().debugMode
  }

  /**
   * Log current profile data to console in JSON format.
   * Output is designed for machine parsing by Claude via Chrome MCP.
   */
  private logProfileData(): void {
    const timings = this.getPassTimings()
    const stats = this.getFrameStats()

    if (timings.length === 0) {
      return // No data yet (queries are async)
    }

    const budget = 16.67 // 60fps target

    // Build pass data with warnings
    const passes = timings
      .filter((t) => !t.skipped && t.gpuTimeMs > 0)
      .map((t) => {
        const pass: ProfileData['passes'][0] = {
          name: t.passId,
          gpu: Math.round(t.gpuTimeMs * 100) / 100,
          cpu: Math.round(t.cpuTimeMs * 100) / 100,
        }

        // Add warning for passes exceeding budget fraction
        if (t.gpuTimeMs > budget * 0.5) {
          pass.warning = 'high'
        }
        if (t.gpuTimeMs > budget) {
          pass.warning = 'exceeds budget'
        }

        return pass
      })

    // Calculate totals
    const totalGpu = timings.reduce((sum, t) => sum + t.gpuTimeMs, 0)
    const totalCpu = timings.reduce((sum, t) => sum + t.cpuTimeMs, 0)

    const profileData: ProfileData = {
      type: 'gpu-profile',
      frame: stats?.targetSwitches ?? 0, // Use target switches as proxy for frame
      fps: Math.round(this.fps * 10) / 10,
      budget,
      passes,
      total: {
        gpu: Math.round(totalGpu * 100) / 100,
        cpu: Math.round(totalCpu * 100) / 100,
      },
    }

    // Output as single-line JSON for easy parsing
    console.log(JSON.stringify(profileData))
  }

  /**
   * Get a human-readable summary of current performance.
   * Useful for quick checks in the console.
   */
  getSummary(): string {
    const timings = this.getPassTimings()
    if (timings.length === 0) {
      return 'No timing data available (enable profiling first)'
    }

    const totalGpu = timings.reduce((sum, t) => sum + t.gpuTimeMs, 0)
    const slowest = timings.reduce((a, b) => (a.gpuTimeMs > b.gpuTimeMs ? a : b))

    return [
      `FPS: ${Math.round(this.fps)}`,
      `Total GPU: ${totalGpu.toFixed(2)}ms`,
      `Slowest: ${slowest.passId} (${slowest.gpuTimeMs.toFixed(2)}ms)`,
      `Active passes: ${timings.filter((t) => !t.skipped).length}`,
    ].join('\n')
  }

  /**
   * Get the top N slowest passes.
   * Useful for identifying optimization targets.
   *
   * @param n - Number of passes to return (default: 5)
   */
  getSlowestPasses(n = 5): Array<{ name: string; gpu: number; percentage: number }> {
    const timings = this.getPassTimings()
    const totalGpu = timings.reduce((sum, t) => sum + t.gpuTimeMs, 0)

    return timings
      .filter((t) => !t.skipped && t.gpuTimeMs > 0)
      .sort((a, b) => b.gpuTimeMs - a.gpuTimeMs)
      .slice(0, n)
      .map((t) => ({
        name: t.passId,
        gpu: Math.round(t.gpuTimeMs * 100) / 100,
        percentage: Math.round((t.gpuTimeMs / totalGpu) * 1000) / 10,
      }))
  }

  /**
   * Get the section profiler for intra-shader A/B testing.
   *
   * @returns SectionProfiler instance
   */
  getSectionProfiler(): SectionProfiler {
    return this.sectionProfiler
  }
}
