/**
 * Cosine Palette Coefficient Data
 *
 * Pre-configured coefficient sets for common color palettes.
 * Based on Inigo Quilez's cosine palette technique.
 * Extracted to break circular dependencies between presets.ts and builtInPresets.ts.
 *
 * @see https://iquilezles.org/articles/palettes/
 * @module lib/colors/palette/cosinePresetData
 */

import type { CosineCoefficients } from './types'

/**
 * Preset keys for type safety
 *
 * Elegant smooth gradient presets - designed to avoid "rainbow" effects
 * by using low frequency values and cohesive color families.
 */
export type PresetKey =
  // Pastels - soft, high luminance, low saturation
  | 'powderBlue'
  | 'dustyRose'
  | 'softLavender'
  | 'palePeach'
  // Desaturated Blues
  | 'steelBlue'
  | 'stormCloud'
  | 'deepSea'
  | 'slate'
  | 'fog'
  // Desaturated Reds/Pinks (keeping crimsonFade)
  | 'crimsonFade'
  | 'driedRose'
  | 'terracotta'
  | 'clay'
  | 'burgundyMist'
  | 'mauve'
  // Earthy/Neutral
  | 'stone'
  | 'driftwood'
  | 'charcoal'
  | 'espresso'
  // Two-color blends
  | 'roseSteel'
  | 'dustyTwilight'
  | 'warmFog'
  | 'coolEmber'
  // Experimental - higher frequencies/amplitudes
  | 'electric'
  | 'plasma'
  | 'nebula'
  | 'prism'
  // Wild/Unconventional
  | 'glitch'
  | 'infrared'
  | 'acidWash'
  | 'voidPulse'
  | 'solarFlare'
  | 'deepFry'
  | 'ghostwave'
  | 'toxicSpill'
  | 'binaryFade'
  | 'chromaticShift'

/**
 * Built-in cosine palette coefficient presets.
 *
 * Most presets use c: [0.5, 0.5, 0.5] for half-cycle gradients.
 * Experimental presets use higher frequencies for more dynamic effects.
 */
export const COSINE_PRESETS: Record<PresetKey, CosineCoefficients> = {
  // ============================================================================
  // PASTELS - Soft, high luminance, low saturation
  // ============================================================================

  /** Soft powder blue - airy and calm */
  powderBlue: {
    a: [0.85, 0.88, 0.95],
    b: [0.1, 0.08, 0.05],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  /** Muted dusty rose - soft romantic pink */
  dustyRose: {
    a: [0.88, 0.78, 0.8],
    b: [0.12, 0.12, 0.1],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  /** Pale lavender - gentle purple */
  softLavender: {
    a: [0.85, 0.82, 0.92],
    b: [0.1, 0.1, 0.08],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  /** Warm pale peach - soft warmth */
  palePeach: {
    a: [0.92, 0.85, 0.8],
    b: [0.08, 0.1, 0.1],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  // ============================================================================
  // DESATURATED BLUES - Cool, muted, sophisticated
  // ============================================================================

  /** Gray-blue industrial - cool and modern */
  steelBlue: {
    a: [0.45, 0.5, 0.58],
    b: [0.2, 0.2, 0.25],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  /** Dark brooding blue-gray - dramatic */
  stormCloud: {
    a: [0.35, 0.38, 0.48],
    b: [0.25, 0.25, 0.3],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  /** Deep navy desaturated - oceanic depth */
  deepSea: {
    a: [0.2, 0.28, 0.42],
    b: [0.15, 0.2, 0.3],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  /** Blue-gray gradient - sophisticated cool */
  slate: {
    a: [0.5, 0.52, 0.58],
    b: [0.22, 0.22, 0.22],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  /** Light misty blue-gray - ethereal */
  fog: {
    a: [0.75, 0.78, 0.82],
    b: [0.15, 0.14, 0.12],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  // ============================================================================
  // DESATURATED REDS/PINKS - Warm, muted, elegant
  // ============================================================================

  /** Dark red to light pink - rich and romantic */
  crimsonFade: {
    a: [0.6, 0.2, 0.3],
    b: [0.4, 0.3, 0.3],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  /** Faded rose - vintage pink */
  driedRose: {
    a: [0.7, 0.5, 0.52],
    b: [0.2, 0.18, 0.18],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  /** Earthy red-orange - warm clay */
  terracotta: {
    a: [0.6, 0.38, 0.32],
    b: [0.25, 0.2, 0.18],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  /** Muted red-brown - natural earth */
  clay: {
    a: [0.55, 0.4, 0.35],
    b: [0.25, 0.2, 0.18],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  /** Soft wine - muted burgundy */
  burgundyMist: {
    a: [0.5, 0.28, 0.35],
    b: [0.28, 0.18, 0.2],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  /** Dusty purple-pink - sophisticated */
  mauve: {
    a: [0.62, 0.48, 0.55],
    b: [0.2, 0.18, 0.2],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  // ============================================================================
  // EARTHY/NEUTRAL - Natural, grounded tones
  // ============================================================================

  /** Warm gray-brown - natural stone */
  stone: {
    a: [0.52, 0.48, 0.45],
    b: [0.22, 0.22, 0.2],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  /** Weathered gray-tan - aged wood */
  driftwood: {
    a: [0.55, 0.5, 0.45],
    b: [0.2, 0.2, 0.18],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  /** Dark gray to silver - refined monochrome */
  charcoal: {
    a: [0.38, 0.38, 0.4],
    b: [0.32, 0.32, 0.32],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  /** Deep warm brown - rich coffee */
  espresso: {
    a: [0.35, 0.25, 0.2],
    b: [0.25, 0.2, 0.18],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.0],
  },

  // ============================================================================
  // TWO-COLOR BLENDS - Elegant color transitions
  // ============================================================================

  /** Dusty rose to steel blue - soft contrast */
  roseSteel: {
    a: [0.6, 0.48, 0.55],
    b: [0.2, 0.18, 0.22],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.5],
  },

  /** Mauve to deep blue - evening fade */
  dustyTwilight: {
    a: [0.5, 0.38, 0.52],
    b: [0.22, 0.2, 0.28],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.5],
  },

  /** Warm gray to cool gray - subtle shift */
  warmFog: {
    a: [0.65, 0.62, 0.6],
    b: [0.18, 0.18, 0.2],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.0, 0.5],
  },

  /** Muted blue to warm ember - temperature contrast */
  coolEmber: {
    a: [0.5, 0.42, 0.45],
    b: [0.28, 0.22, 0.25],
    c: [0.5, 0.5, 0.5],
    d: [0.5, 0.25, 0.0],
  },

  // ============================================================================
  // EXPERIMENTAL - Higher frequencies and amplitudes
  // ============================================================================

  /** Vibrant electric - high contrast cycling */
  electric: {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [0.8, 0.8, 0.8],
    d: [0.0, 0.1, 0.2],
  },

  /** Hot plasma - intense warm cycling */
  plasma: {
    a: [0.5, 0.3, 0.4],
    b: [0.5, 0.4, 0.4],
    c: [1.0, 0.7, 0.5],
    d: [0.0, 0.1, 0.15],
  },

  /** Deep space colors - purple/blue intensity */
  nebula: {
    a: [0.4, 0.3, 0.55],
    b: [0.4, 0.35, 0.45],
    c: [0.7, 0.8, 0.6],
    d: [0.2, 0.1, 0.0],
  },

  /** Controlled spectrum - elegant multi-hue */
  prism: {
    a: [0.6, 0.6, 0.6],
    b: [0.35, 0.35, 0.35],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.15, 0.3],
  },

  // ============================================================================
  // WILD/UNCONVENTIONAL - Rule-breaking experimental presets
  // ============================================================================

  /** Digital corruption - asymmetric frequencies create unpredictable shifts */
  glitch: {
    a: [0.5, 0.4, 0.6],
    b: [0.5, 0.6, 0.4],
    c: [1.7, 0.3, 2.1],
    d: [0.0, 0.5, 0.25],
  },

  /** Heat vision - inverted blue channel, hot reds dominate */
  infrared: {
    a: [0.7, 0.2, 0.1],
    b: [0.3, 0.4, -0.1],
    c: [0.6, 0.8, 0.4],
    d: [0.0, 0.1, 0.9],
  },

  /** Corrosive neon - high saturation with clashing phases */
  acidWash: {
    a: [0.3, 0.7, 0.3],
    b: [0.7, 0.3, 0.7],
    c: [1.2, 0.6, 1.8],
    d: [0.3, 0.0, 0.6],
  },

  /** Deep darkness with occasional bright pulses */
  voidPulse: {
    a: [0.15, 0.1, 0.2],
    b: [0.35, 0.25, 0.5],
    c: [0.25, 0.25, 0.25],
    d: [0.0, 0.0, 0.0],
  },

  /** Intense solar corona - extreme warm with blue edges */
  solarFlare: {
    a: [0.8, 0.4, 0.2],
    b: [0.2, 0.5, 0.6],
    c: [0.4, 1.2, 1.8],
    d: [0.0, 0.2, 0.5],
  },

  /** Oversaturated contrast - like a fried meme */
  deepFry: {
    a: [0.6, 0.3, 0.2],
    b: [0.6, 0.7, 0.5],
    c: [1.5, 1.8, 0.8],
    d: [0.1, 0.0, 0.4],
  },

  /** Ethereal with negative amplitude - creates ghostly inversions */
  ghostwave: {
    a: [0.8, 0.85, 0.9],
    b: [-0.3, -0.2, -0.1],
    c: [0.4, 0.5, 0.6],
    d: [0.0, 0.1, 0.2],
  },

  /** Radioactive green bleeding into harsh magentas */
  toxicSpill: {
    a: [0.2, 0.5, 0.15],
    b: [0.5, 0.4, 0.6],
    c: [0.8, 0.3, 1.4],
    d: [0.5, 0.0, 0.3],
  },

  /** Sharp two-tone with almost no transition */
  binaryFade: {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [3.0, 3.0, 3.0],
    d: [0.0, 0.0, 0.0],
  },

  /** RGB channels completely out of phase - creates chromatic aberration feel */
  chromaticShift: {
    a: [0.5, 0.5, 0.5],
    b: [0.45, 0.45, 0.45],
    c: [0.8, 0.8, 0.8],
    d: [0.0, 0.33, 0.66],
  },
} as const
