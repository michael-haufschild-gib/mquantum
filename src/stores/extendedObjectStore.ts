/**
 * Extended Object State Management using Zustand
 *
 * Manages parameters for all object types including:
 * - Polytopes (hypercube, simplex, cross-polytope) - scale configuration
 * - Root Systems (A, D, E8 polytopes)
 * - Clifford Torus
 * - Mandelbulb
 * - Quaternion Julia
 *
 * The unified configuration ensures visual consistency across all object types.
 *
 * @see docs/prd/extended-objects.md
 * @see docs/research/nd-extended-objects-guide.md
 */

import {
  DEFAULT_BLACK_HOLE_CONFIG,
  DEFAULT_CLIFFORD_TORUS_CONFIG,
  DEFAULT_MANDELBROT_CONFIG,
  DEFAULT_NESTED_TORUS_CONFIG,
  DEFAULT_POLYTOPE_CONFIG,
  DEFAULT_QUATERNION_JULIA_CONFIG,
  DEFAULT_ROOT_SYSTEM_CONFIG,
  DEFAULT_SCHROEDINGER_CONFIG,
  DEFAULT_WYTHOFF_POLYTOPE_CONFIG,
} from '@/lib/geometry/extended/types'
import { create } from 'zustand'
import { createBlackHoleSlice } from './slices/geometry/blackholeSlice'
import { createCliffordTorusSlice } from './slices/geometry/cliffordTorusSlice'
import { createMandelbulbSlice } from './slices/geometry/mandelbulbSlice'
import { createNestedTorusSlice } from './slices/geometry/nestedTorusSlice'
import { createPolytopeSlice } from './slices/geometry/polytopeSlice'
import { createQuaternionJuliaSlice } from './slices/geometry/quaternionJuliaSlice'
import { createRootSystemSlice } from './slices/geometry/rootSystemSlice'
import { createSchroedingerSlice } from './slices/geometry/schroedingerSlice'
import { createWythoffPolytopeSlice } from './slices/geometry/wythoffPolytopeSlice'
import { ExtendedObjectSlice } from './slices/geometry/types'

// Re-export type for consumers
export type { ExtendedObjectSlice as ExtendedObjectState } from './slices/geometry/types'

// ============================================================================
// Store Implementation
// ============================================================================

export const useExtendedObjectStore = create<ExtendedObjectSlice>()((...a) => {
  const [set] = a

  return {
    // Version counters for dirty-flag tracking (initialized here, incremented by slices)
    polytopeVersion: 0,
    blackholeVersion: 0,
    schroedingerVersion: 0,
    mandelbulbVersion: 0,
    quaternionJuliaVersion: 0,

    ...createPolytopeSlice(...a),
    ...createWythoffPolytopeSlice(...a),
    ...createRootSystemSlice(...a),
    ...createCliffordTorusSlice(...a),
    ...createNestedTorusSlice(...a),
    ...createMandelbulbSlice(...a),
    ...createQuaternionJuliaSlice(...a),
    ...createSchroedingerSlice(...a),
    ...createBlackHoleSlice(...a),

    // --- Version Bump Action (for preset loading) ---
    bumpAllVersions: () => {
      set((state) => ({
        polytopeVersion: state.polytopeVersion + 1,
        blackholeVersion: state.blackholeVersion + 1,
        schroedingerVersion: state.schroedingerVersion + 1,
        mandelbulbVersion: state.mandelbulbVersion + 1,
        quaternionJuliaVersion: state.quaternionJuliaVersion + 1,
      }))
    },

    // --- Reset Action ---
    reset: () => {
      set({
        // Initialize with default values
        polytope: { ...DEFAULT_POLYTOPE_CONFIG },
        wythoffPolytope: { ...DEFAULT_WYTHOFF_POLYTOPE_CONFIG },
        rootSystem: { ...DEFAULT_ROOT_SYSTEM_CONFIG },
        cliffordTorus: { ...DEFAULT_CLIFFORD_TORUS_CONFIG },
        nestedTorus: { ...DEFAULT_NESTED_TORUS_CONFIG },
        mandelbulb: { ...DEFAULT_MANDELBROT_CONFIG },
        quaternionJulia: { ...DEFAULT_QUATERNION_JULIA_CONFIG },
        schroedinger: { ...DEFAULT_SCHROEDINGER_CONFIG },
        blackhole: { ...DEFAULT_BLACK_HOLE_CONFIG },
        polytopeVersion: 0, // Reset version on full reset
        blackholeVersion: 0, // Reset version on full reset
        schroedingerVersion: 0, // Reset version on full reset
        mandelbulbVersion: 0, // Reset version on full reset
        quaternionJuliaVersion: 0, // Reset version on full reset
      })
    },
  }
})