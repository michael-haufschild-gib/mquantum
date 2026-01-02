/**
 * GPU Profiler Module
 *
 * DEV MODE ONLY - This entire module is tree-shaken in production builds.
 *
 * Provides automated GPU performance profiling for shader optimization.
 * Exposes window.__PROFILER__ API for programmatic control via Chrome MCP.
 *
 * @module dev-tools/profiler
 */

import { ProfilerAPI } from './ProfilerAPI'
import type { RenderGraph } from '@/rendering/graph/RenderGraph'

export { ProfilerAPI } from './ProfilerAPI'
export type { ProfileData } from './ProfilerAPI'
export { SectionProfiler } from './SectionProfiler'
export type { SectionTiming } from './SectionProfiler'

// Singleton instance
let profilerInstance: ProfilerAPI | null = null

/**
 * Initialize the profiler and attach to a RenderGraph.
 * Should only be called in dev mode.
 *
 * @param graph - The RenderGraph instance to profile
 * @returns The ProfilerAPI instance
 */
export function initProfiler(graph: RenderGraph): ProfilerAPI {
  if (!import.meta.env.DEV) {
    throw new Error('initProfiler should only be called in dev mode')
  }

  if (profilerInstance) {
    profilerInstance.detach()
  }

  profilerInstance = new ProfilerAPI()
  profilerInstance.attach(graph)

  return profilerInstance
}

/**
 * Get the current profiler instance.
 * Returns null if profiler hasn't been initialized.
 */
export function getProfiler(): ProfilerAPI | null {
  return profilerInstance
}

/**
 * Dispose the profiler instance.
 * Called when the RenderGraph is disposed.
 */
export function disposeProfiler(): void {
  if (profilerInstance) {
    profilerInstance.detach()
    profilerInstance = null
  }
}
