/**
 * Temporal Depth Uniforms Hook
 *
 * Provides access to temporal depth uniforms for raymarching shaders.
 * Uses the render graph store to access the pass and compute uniforms on-demand.
 *
 * **Usage:**
 * ```tsx
 * const getTemporalUniforms = useTemporalDepthUniforms();
 *
 * useFrame(() => {
 *   const uniforms = getTemporalUniforms();
 *   if (uniforms) {
 *     material.uniforms.uPrevDepthTexture.value = uniforms.uPrevDepthTexture;
 *     // ... set other uniforms
 *   }
 * });
 * ```
 *
 * @module rendering/core/useTemporalDepthUniforms
 */

import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { TemporalDepthUniforms } from '@/rendering/graph/passes/TemporalDepthCapturePass'
import { useRenderGraphStore } from '@/stores/renderGraphStore'

/**
 * Hook that returns a function to get temporal depth uniforms.
 *
 * Returns a stable callback that reads from the render graph store.
 * The callback returns null if the graph or pass is not available.
 *
 * @returns Function that returns TemporalDepthUniforms or null
 */
export function useTemporalDepthUniforms(): () => TemporalDepthUniforms | null {
  const { graph, temporalDepthPass } = useRenderGraphStore(
    useShallow((s) => ({
      graph: s.graph,
      temporalDepthPass: s.temporalDepthPass,
    }))
  )

  return useCallback(() => {
    if (!graph || !temporalDepthPass) {
      return null
    }
    return temporalDepthPass.getTemporalUniforms(graph)
  }, [graph, temporalDepthPass])
}

/**
 * Direct access to temporal uniforms (non-hook version).
 *
 * Use this in non-React contexts or when you need synchronous access.
 * Returns null if the graph or pass is not available.
 *
 * @returns TemporalDepthUniforms or null
 */
export function getTemporalDepthUniforms(): TemporalDepthUniforms | null {
  const { graph, temporalDepthPass } = useRenderGraphStore.getState()
  if (!graph || !temporalDepthPass) {
    return null
  }
  return temporalDepthPass.getTemporalUniforms(graph)
}
