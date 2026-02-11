/**
 * Schroedinger Fractal Module
 *
 * Schroedinger uses GPU raymarching exclusively - no CPU geometry needed.
 * This module provides the generator that returns minimal geometry to signal
 * the renderer to use SchroedingerMesh for GPU-based raymarching.
 */

import type { NdGeometry } from '../../types'
import type { SchroedingerConfig } from '../types'

/**
 * Generate minimal geometry for Schroedinger raymarching
 *
 * Returns empty geometry that signals to UnifiedRenderer to use SchroedingerMesh.
 * All fractal computation happens on the GPU via raymarching shaders.
 *
 * @param dimension - Dimensionality (2-11)
 * @param _config - Configuration (used by shader, not CPU)
 * @returns Minimal NdGeometry for raymarching
 */
export function generateSchroedinger(dimension: number, _config: SchroedingerConfig): NdGeometry {
  if (dimension < 2) {
    throw new Error(`Schroedinger requires dimension >= 2, got ${dimension}`)
  }

  const name = dimension === 3 ? 'Schroedinger' : `${dimension}D Schroedinger`

  return {
    dimension,
    type: 'schroedinger',
    vertices: [], // Empty - GPU raymarching handles rendering
    edges: [],
    metadata: {
      name,
      properties: {
        renderMode: 'raymarching',
      },
    },
  }
}
