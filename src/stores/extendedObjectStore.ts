/**
 * Extended Object State Management using Zustand
 *
 * Manages parameters for Schroedinger quantum objects.
 *
 * @see docs/prd/extended-objects.md
 */

import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/types'
import { create } from 'zustand'
import { createSchroedingerSlice } from './slices/geometry/schroedingerSlice'
import { ExtendedObjectSlice } from './slices/geometry/types'

// Re-export type for consumers
export type { ExtendedObjectSlice as ExtendedObjectState } from './slices/geometry/types'

// ============================================================================
// Store Implementation
// ============================================================================

export const useExtendedObjectStore = create<ExtendedObjectSlice>()((...a) => {
  const [set] = a

  return {
    // Version counters for dirty-flag tracking
    schroedingerVersion: 0,

    ...createSchroedingerSlice(...a),

    // --- Version Bump Action (for preset loading) ---
    bumpAllVersions: () => {
      set((state) => ({
        schroedingerVersion: state.schroedingerVersion + 1,
      }))
    },

    // --- Reset Action ---
    reset: () => {
      set({
        schroedinger: { ...DEFAULT_SCHROEDINGER_CONFIG },
        schroedingerVersion: 0,
      })
    },
  }
})
