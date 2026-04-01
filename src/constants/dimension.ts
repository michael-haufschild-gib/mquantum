import { getQuantumTypesRequiringDimensionAbove } from '@/lib/geometry/registry'

/** Minimum supported dimension for quantum visualization. */
export const MIN_DIMENSION = 2

/** Maximum supported dimension for quantum visualization. */
export const MAX_DIMENSION = 11

/**
 * Quantum modes that require 3D+ dimensions (no 2D rendering path).
 * Compute modes render a 3D density grid via volume raymarching;
 * the 2D heatmap pipeline cannot sample their density grids.
 *
 * Derived from the quantum type registry: all entries with dimensions.min > 2.
 */
export const QUANTUM_MODES_3D_ONLY = getQuantumTypesRequiringDimensionAbove(2)
