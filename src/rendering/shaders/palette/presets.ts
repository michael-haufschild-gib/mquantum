/**
 * Cosine Gradient Palette Presets
 *
 * Pre-configured coefficient sets for common color palettes.
 * Based on Inigo Quilez's cosine palette technique.
 *
 * @see https://iquilezles.org/articles/palettes/
 * @see docs/prd/advanced-color-system.md
 */

import type { ColorAlgorithm, CosineCoefficients, DistributionSettings } from './types'

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

/**
 * Preset option type for dropdown menus.
 */
export interface PresetOption {
  value: string
  label: string
  coefficients: CosineCoefficients
}

/**
 * Preset options for UI dropdown.
 * Organized by color family for easier navigation.
 */
export const COSINE_PRESET_OPTIONS: PresetOption[] = [
  // Pastels
  { value: 'powderBlue', label: 'Powder Blue', coefficients: COSINE_PRESETS.powderBlue },
  { value: 'dustyRose', label: 'Dusty Rose', coefficients: COSINE_PRESETS.dustyRose },
  { value: 'softLavender', label: 'Soft Lavender', coefficients: COSINE_PRESETS.softLavender },
  { value: 'palePeach', label: 'Pale Peach', coefficients: COSINE_PRESETS.palePeach },
  // Desaturated Blues
  { value: 'steelBlue', label: 'Steel Blue', coefficients: COSINE_PRESETS.steelBlue },
  { value: 'stormCloud', label: 'Storm Cloud', coefficients: COSINE_PRESETS.stormCloud },
  { value: 'deepSea', label: 'Deep Sea', coefficients: COSINE_PRESETS.deepSea },
  { value: 'slate', label: 'Slate', coefficients: COSINE_PRESETS.slate },
  { value: 'fog', label: 'Fog', coefficients: COSINE_PRESETS.fog },
  // Desaturated Reds/Pinks
  { value: 'crimsonFade', label: 'Crimson Fade', coefficients: COSINE_PRESETS.crimsonFade },
  { value: 'driedRose', label: 'Dried Rose', coefficients: COSINE_PRESETS.driedRose },
  { value: 'terracotta', label: 'Terracotta', coefficients: COSINE_PRESETS.terracotta },
  { value: 'clay', label: 'Clay', coefficients: COSINE_PRESETS.clay },
  { value: 'burgundyMist', label: 'Burgundy Mist', coefficients: COSINE_PRESETS.burgundyMist },
  { value: 'mauve', label: 'Mauve', coefficients: COSINE_PRESETS.mauve },
  // Earthy/Neutral
  { value: 'stone', label: 'Stone', coefficients: COSINE_PRESETS.stone },
  { value: 'driftwood', label: 'Driftwood', coefficients: COSINE_PRESETS.driftwood },
  { value: 'charcoal', label: 'Charcoal', coefficients: COSINE_PRESETS.charcoal },
  { value: 'espresso', label: 'Espresso', coefficients: COSINE_PRESETS.espresso },
  // Two-color blends
  { value: 'roseSteel', label: 'Rose Steel', coefficients: COSINE_PRESETS.roseSteel },
  { value: 'dustyTwilight', label: 'Dusty Twilight', coefficients: COSINE_PRESETS.dustyTwilight },
  { value: 'warmFog', label: 'Warm Fog', coefficients: COSINE_PRESETS.warmFog },
  { value: 'coolEmber', label: 'Cool Ember', coefficients: COSINE_PRESETS.coolEmber },
  // Experimental
  { value: 'electric', label: 'Electric', coefficients: COSINE_PRESETS.electric },
  { value: 'plasma', label: 'Plasma', coefficients: COSINE_PRESETS.plasma },
  { value: 'nebula', label: 'Nebula', coefficients: COSINE_PRESETS.nebula },
  { value: 'prism', label: 'Prism', coefficients: COSINE_PRESETS.prism },
  // Wild/Unconventional
  { value: 'glitch', label: 'Glitch', coefficients: COSINE_PRESETS.glitch },
  { value: 'infrared', label: 'Infrared', coefficients: COSINE_PRESETS.infrared },
  { value: 'acidWash', label: 'Acid Wash', coefficients: COSINE_PRESETS.acidWash },
  { value: 'voidPulse', label: 'Void Pulse', coefficients: COSINE_PRESETS.voidPulse },
  { value: 'solarFlare', label: 'Solar Flare', coefficients: COSINE_PRESETS.solarFlare },
  { value: 'deepFry', label: 'Deep Fry', coefficients: COSINE_PRESETS.deepFry },
  { value: 'ghostwave', label: 'Ghostwave', coefficients: COSINE_PRESETS.ghostwave },
  { value: 'toxicSpill', label: 'Toxic Spill', coefficients: COSINE_PRESETS.toxicSpill },
  { value: 'binaryFade', label: 'Binary Fade', coefficients: COSINE_PRESETS.binaryFade },
  {
    value: 'chromaticShift',
    label: 'Chromatic Shift',
    coefficients: COSINE_PRESETS.chromaticShift,
  },
]

/**
 * Full color preset including algorithm and distribution settings.
 */
export interface ColorPreset {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** Color algorithm to use */
  algorithm: ColorAlgorithm
  /** Cosine palette coefficients */
  coefficients: CosineCoefficients
  /** Distribution settings */
  distribution: DistributionSettings
  /** Whether this is a built-in preset (cannot be deleted) */
  isBuiltIn: boolean
}

/**
 * Built-in full presets with algorithm and distribution.
 * Each preset is carefully tuned for smooth, elegant gradients.
 */
export const BUILT_IN_PRESETS: ColorPreset[] = [
  // ===========================================================================
  // PASTELS
  // ===========================================================================
  {
    id: 'powderBlue',
    name: 'Powder Blue',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.powderBlue,
    distribution: { power: 0.8, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'dustyRose',
    name: 'Dusty Rose',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.dustyRose,
    distribution: { power: 0.9, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'softLavender',
    name: 'Soft Lavender',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.softLavender,
    distribution: { power: 0.8, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'palePeach',
    name: 'Pale Peach',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.palePeach,
    distribution: { power: 0.9, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  // ===========================================================================
  // DESATURATED BLUES
  // ===========================================================================
  {
    id: 'steelBlue',
    name: 'Steel Blue',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.steelBlue,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'stormCloud',
    name: 'Storm Cloud',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.stormCloud,
    distribution: { power: 1.2, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'deepSea',
    name: 'Deep Sea',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.deepSea,
    distribution: { power: 1.3, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'slate',
    name: 'Slate',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.slate,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'fog',
    name: 'Fog',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.fog,
    distribution: { power: 0.7, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  // ===========================================================================
  // DESATURATED REDS/PINKS
  // ===========================================================================
  {
    id: 'crimsonFade',
    name: 'Crimson Fade',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.crimsonFade,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'driedRose',
    name: 'Dried Rose',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.driedRose,
    distribution: { power: 0.9, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'terracotta',
    name: 'Terracotta',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.terracotta,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'clay',
    name: 'Clay',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.clay,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'burgundyMist',
    name: 'Burgundy Mist',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.burgundyMist,
    distribution: { power: 1.1, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'mauve',
    name: 'Mauve',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.mauve,
    distribution: { power: 0.9, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  // ===========================================================================
  // EARTHY/NEUTRAL
  // ===========================================================================
  {
    id: 'stone',
    name: 'Stone',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.stone,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'driftwood',
    name: 'Driftwood',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.driftwood,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'charcoal',
    name: 'Charcoal',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.charcoal,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'espresso',
    name: 'Espresso',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.espresso,
    distribution: { power: 1.2, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  // ===========================================================================
  // TWO-COLOR BLENDS
  // ===========================================================================
  {
    id: 'roseSteel',
    name: 'Rose Steel',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.roseSteel,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'dustyTwilight',
    name: 'Dusty Twilight',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.dustyTwilight,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'warmFog',
    name: 'Warm Fog',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.warmFog,
    distribution: { power: 0.9, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'coolEmber',
    name: 'Cool Ember',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.coolEmber,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  // ===========================================================================
  // EXPERIMENTAL - Higher frequencies
  // ===========================================================================
  {
    id: 'electric',
    name: 'Electric',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.electric,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'plasma',
    name: 'Plasma',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.plasma,
    distribution: { power: 0.8, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'nebula',
    name: 'Nebula',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.nebula,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'prism',
    name: 'Prism',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.prism,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  // ===========================================================================
  // WILD/UNCONVENTIONAL
  // ===========================================================================
  {
    id: 'glitch',
    name: 'Glitch',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.glitch,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'infrared',
    name: 'Infrared',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.infrared,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'acidWash',
    name: 'Acid Wash',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.acidWash,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'voidPulse',
    name: 'Void Pulse',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.voidPulse,
    distribution: { power: 1.5, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'solarFlare',
    name: 'Solar Flare',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.solarFlare,
    distribution: { power: 0.8, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'deepFry',
    name: 'Deep Fry',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.deepFry,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'ghostwave',
    name: 'Ghostwave',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.ghostwave,
    distribution: { power: 0.7, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'toxicSpill',
    name: 'Toxic Spill',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.toxicSpill,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'binaryFade',
    name: 'Binary Fade',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.binaryFade,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  {
    id: 'chromaticShift',
    name: 'Chromatic Shift',
    algorithm: 'radial',
    coefficients: COSINE_PRESETS.chromaticShift,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
  // ===========================================================================
  // ALGORITHM-BASED PRESETS
  // ===========================================================================
  {
    id: 'lch-smooth',
    name: 'LCH Smooth',
    algorithm: 'lch',
    coefficients: COSINE_PRESETS.crimsonFade,
    distribution: { power: 1.0, cycles: 1.0, offset: 0.0 },
    isBuiltIn: true,
  },
]

/**
 * Get a preset by ID.
 * @param id - The preset ID
 * @returns The color preset or undefined if not found
 */
export function getPresetById(id: string): ColorPreset | undefined {
  return BUILT_IN_PRESETS.find((preset) => preset.id === id)
}

/**
 * Get default preset for a given algorithm.
 * @param algorithm - The color algorithm
 * @returns The default preset for that algorithm
 */
export function getDefaultPresetForAlgorithm(algorithm: ColorAlgorithm): ColorPreset {
  const preset = BUILT_IN_PRESETS.find((p) => p.algorithm === algorithm)
  // BUILT_IN_PRESETS is guaranteed to have at least one element
  return preset ?? BUILT_IN_PRESETS[0]!
}
