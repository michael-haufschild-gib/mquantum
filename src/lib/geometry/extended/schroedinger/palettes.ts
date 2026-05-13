import type { CosineCoefficients } from '@/lib/colors/palette/types'

import { SchroedingerPalette } from '../types'

/**
 * Palette definitions for Schrödinger visualization.
 *
 * Each palette uses the Inigo Quilez cosine gradient formula:
 *   color(t) = a + b * cos(2π(c·t + d))
 *
 * Every entry must produce a visually distinct result.
 * Reference: https://iquilezles.org/articles/palettes/
 */
export const SCHROEDINGER_PALETTE_DEFINITIONS: Record<SchroedingerPalette, CosineCoefficients> = {
  // Standard Hue Shifters — vary only in phase offset d
  monochrome: {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.0, 0.0],
  },
  complement: {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.5, 0.5],
  },
  triadic: {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.33, 0.67],
  },
  analogous: {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.8, 0.9, 0.3],
  },
  shifted: {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.5, 0.5, 0.5],
  },

  // Artistic Presets — each uses unique a/b/c/d combinations
  nebula: {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 0.5],
    d: [0.8, 0.9, 0.3],
  },
  sunset: {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 0.7, 0.4],
    d: [0.0, 0.15, 0.2],
  },
  aurora: {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 0.7, 0.4],
    d: [0.3, 0.2, 0.0],
  },
  ocean: {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [2.0, 1.0, 0.0],
    d: [0.5, 0.2, 0.25],
  },
  fire: {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 0.7, 0.4],
    d: [0.0, 0.05, 0.15],
  },
  ice: {
    a: [0.8, 0.9, 1.0],
    b: [0.2, 0.2, 0.2],
    c: [1.0, 1.0, 1.0],
    d: [0.3, 0.4, 0.5],
  },
  forest: {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 2.0, 1.0],
    d: [0.0, 0.25, 0.0],
  },
  plasma: {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.3, 0.2, 0.2],
  },
}
