/**
 * Density-grid world-mapping values for the Schrodinger uniform buffer.
 *
 * Modes currently use normalized density-grid display axes: the solver's
 * physical coordinate ranges are mapped into the render cube uniformly.
 */

import type { SchroedingerConfig } from '@/lib/geometry/extended/types'

import { SCHROEDINGER_LAYOUT } from './schroedingerLayout'

const I = SCHROEDINGER_LAYOUT.index

/** Inputs needed to derive the density-grid world mapping. */
export interface DensityGridMappingInputs {
  quantumModeStr: string
  boundingRadius: number
  schroedinger: Partial<SchroedingerConfig> | undefined
}

/** Center and half-extents consumed by the shader's world-to-UVW map. */
export interface DensityGridMapping {
  center: readonly [number, number, number]
  halfExtent: readonly [number, number, number]
}

/** Compute density-grid center and half-extent values for the active mode. */
export function computeDensityGridMapping(input: DensityGridMappingInputs): DensityGridMapping {
  const isotropicHalf = Math.max(1e-3, input.boundingRadius)
  return {
    center: [0, 0, 0],
    halfExtent: [isotropicHalf, isotropicHalf, isotropicHalf],
  }
}

/** Pack density-grid mapping values into the Schrodinger uniform float view. */
export function packDensityGridMapping(
  floatView: Float32Array,
  input: DensityGridMappingInputs
): void {
  const mapping = computeDensityGridMapping(input)
  floatView[I.densityGridCenter] = mapping.center[0]
  floatView[I.densityGridCenter + 1] = mapping.center[1]
  floatView[I.densityGridCenter + 2] = mapping.center[2]
  floatView[I.densityGridHalfExtent] = mapping.halfExtent[0]
  floatView[I.densityGridHalfExtent + 1] = mapping.halfExtent[1]
  floatView[I.densityGridHalfExtent + 2] = mapping.halfExtent[2]
}
