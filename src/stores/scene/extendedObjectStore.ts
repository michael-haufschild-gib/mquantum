/**
 * Extended Object State Management using Zustand
 *
 * Manages parameters for Schroedinger, Pauli Spinor, and Bell-pair quantum
 * objects.
 *
 */

import { create } from 'zustand'

import { createDefaultBellPairConfig } from '@/lib/geometry/extended/bellPair'
import { createDefaultPauliConfig } from '@/lib/geometry/extended/pauli'
import { createDefaultSchroedingerConfig } from '@/lib/geometry/extended/schroedinger'

import { createBellPairSlice } from '../slices/geometry/bellPairSlice'
import { createPauliSpinorSlice } from '../slices/geometry/pauliSpinorSlice'
import { createSchroedingerSlice } from '../slices/geometry/schroedingerSlice'
import { resetModeSessionCaches } from '../slices/geometry/setters/quantumModeSetters'
import { ExtendedObjectSlice } from '../slices/geometry/types'

// Re-export type for consumers
export type { ExtendedObjectSlice as ExtendedObjectState } from '../slices/geometry/types'

// ============================================================================
// Store Implementation
// ============================================================================

export const useExtendedObjectStore = create<ExtendedObjectSlice>()((...a) => {
  const [set] = a

  return {
    // Version counters for dirty-flag tracking
    schroedingerVersion: 0,
    pauliSpinorVersion: 0,
    bellPairVersion: 0,

    ...createSchroedingerSlice(...a),
    ...createPauliSpinorSlice(...a),
    ...createBellPairSlice(...a),

    // --- Version Bump Action (for preset loading) ---
    bumpAllVersions: () => {
      set((state) => ({
        schroedingerVersion: state.schroedingerVersion + 1,
        pauliSpinorVersion: state.pauliSpinorVersion + 1,
        bellPairVersion: state.bellPairVersion + 1,
      }))
    },

    // --- Reset Action ---
    reset: () => {
      resetModeSessionCaches()
      set({
        schroedinger: createDefaultSchroedingerConfig(),
        schroedingerVersion: 0,
        pauliSpinor: createDefaultPauliConfig(),
        pauliSpinorVersion: 0,
        bellPair: createDefaultBellPairConfig(),
        bellPairVersion: 0,
      })
    },
  }
})
