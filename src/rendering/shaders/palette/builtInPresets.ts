/**
 * Built-in Color Presets
 *
 * Full color presets with algorithm and distribution settings.
 * Extracted from presets.ts to maintain file size limits.
 *
 * @module rendering/shaders/palette/builtInPresets
 */

import { COSINE_PRESETS } from './cosinePresetData'
import type { ColorPreset } from './presets'

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
