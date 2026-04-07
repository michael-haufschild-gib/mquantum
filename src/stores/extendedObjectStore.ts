/**
 * Extended Object State Management using Zustand
 *
 * Manages parameters for Schroedinger and Pauli Spinor quantum objects.
 *
 */

import { create } from 'zustand'

import { createDefaultSchroedingerConfig } from '@/lib/geometry/extended/schroedinger'
import { DEFAULT_PAULI_CONFIG } from '@/lib/geometry/extended/types'

import { createPauliSpinorSlice } from './slices/geometry/pauliSpinorSlice'
import { createSchroedingerSlice } from './slices/geometry/schroedingerSlice'
import { resetModeSessionCaches } from './slices/geometry/setters/quantumModeSetters'
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
    pauliSpinorVersion: 0,

    ...createSchroedingerSlice(...a),
    ...createPauliSpinorSlice(...a),

    // --- Version Bump Action (for preset loading) ---
    bumpAllVersions: () => {
      set((state) => ({
        schroedingerVersion: state.schroedingerVersion + 1,
        pauliSpinorVersion: state.pauliSpinorVersion + 1,
      }))
    },

    // --- Reset Action ---
    reset: () => {
      resetModeSessionCaches()
      set({
        schroedinger: createDefaultSchroedingerConfig(),
        schroedingerVersion: 0,
        pauliSpinor: { ...DEFAULT_PAULI_CONFIG },
        pauliSpinorVersion: 0,
      })
    },
  }
})
