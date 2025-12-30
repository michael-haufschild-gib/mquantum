/**
 * Render Graph Store
 *
 * Holds references to the render graph and key passes for external access.
 * This enables React components to access render graph data through a clean interface.
 *
 * **Design Principles:**
 * - Stores references, not data (the graph/passes are the source of truth)
 * - Minimal interface - only what external consumers need
 * - Set once during PostProcessingV2 initialization, cleared on unmount
 *
 * @module stores/renderGraphStore
 */

import { create } from 'zustand'

import type { RenderGraph } from '@/rendering/graph/RenderGraph'
import type { TemporalDepthCapturePass } from '@/rendering/graph/passes/TemporalDepthCapturePass'

// =============================================================================
// Types
// =============================================================================

interface RenderGraphState {
  /** Reference to the active render graph instance */
  graph: RenderGraph | null

  /** Reference to the temporal depth capture pass (for Mandelbulb/Julia) */
  temporalDepthPass: TemporalDepthCapturePass | null

  /** Set the render graph reference */
  setGraph: (graph: RenderGraph | null) => void

  /** Set the temporal depth pass reference */
  setTemporalDepthPass: (pass: TemporalDepthCapturePass | null) => void

  /** Clear all references (call on unmount) */
  clear: () => void
}

// =============================================================================
// Store
// =============================================================================

export const useRenderGraphStore = create<RenderGraphState>((set) => ({
  graph: null,
  temporalDepthPass: null,

  setGraph: (graph) => set({ graph }),

  setTemporalDepthPass: (pass) => set({ temporalDepthPass: pass }),

  clear: () => set({ graph: null, temporalDepthPass: null }),
}))
