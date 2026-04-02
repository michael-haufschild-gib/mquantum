/**
 * Shared utilities for compute-grid-based quantum mode strategies.
 *
 * All lattice-based modes (FSF, TDSE, BEC, Dirac, Pauli) share the same
 * bounding radius computation and PML override pattern.
 *
 * @module rendering/webgpu/renderers/strategies/computeGridUtils
 */

/**
 * Compute bounding radius from lattice extent.
 * Uses the maximum extent across all active dimensions (not just 0..2) so that
 * after N-D rotation, the density texture covers the full lattice.
 *
 * @param latticeDim - Number of lattice dimensions
 * @param gridSize - Grid points per dimension
 * @param spacing - Spatial spacing per dimension
 * @returns Raw bounding radius (half-extent × 1.15 margin)
 */
export function computeLatticeBoundingRadius(
  latticeDim: number,
  gridSize: number[],
  spacing: number[]
): number {
  let maxExtent = 0
  for (let d = 0; d < latticeDim; d++) {
    const Ld = (gridSize[d] ?? 32) * (spacing[d] ?? 0.1)
    if (Ld > maxExtent) maxExtent = Ld
  }
  // Fallback: 32 grid points × 0.1 default spacing = 3.2 (matches DEFAULT_FREE_SCALAR_CONFIG)
  if (maxExtent <= 0) maxExtent = 3.2
  // 1.15x margin so the field doesn't fill the entire cube edge-to-edge
  return (maxExtent / 2) * 1.15
}

/**
 * Apply shared PML (perfectly matched layer) absorber overrides.
 * Each mode stores per-mode PML settings, but the shared schroedinger-level
 * absorber controls take precedence when set.
 *
 * @param config - Mode-specific config object
 * @param schroedinger - Parent schroedinger store snapshot
 * @returns Config with shared PML values overriding per-mode values
 */
export function applySharedPml<
  T extends {
    absorberEnabled?: boolean
    absorberWidth?: number
    pmlTargetReflection?: number
  },
>(
  config: T,
  schroedinger:
    | {
        absorberEnabled?: boolean
        absorberWidth?: number
        pmlTargetReflection?: number
      }
    | undefined
): T {
  return {
    ...config,
    absorberEnabled: schroedinger?.absorberEnabled ?? config.absorberEnabled,
    absorberWidth: schroedinger?.absorberWidth ?? config.absorberWidth,
    pmlTargetReflection: schroedinger?.pmlTargetReflection ?? config.pmlTargetReflection,
  }
}
