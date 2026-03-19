/**
 * Cosine Gradient Palette Presets
 *
 * Re-exports cosine coefficient data and provides preset UI options,
 * full color presets (with algorithm + distribution), and lookup functions.
 *
 * @see https://iquilezles.org/articles/palettes/
 */

import type { ColorAlgorithm, CosineCoefficients, DistributionSettings } from './types'

// Re-export coefficient data from dedicated module
export { COSINE_PRESETS, type PresetKey } from './cosinePresetData'

import { COSINE_PRESETS } from './cosinePresetData'

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
  id: string
  name: string
  algorithm: ColorAlgorithm
  coefficients: CosineCoefficients
  distribution: DistributionSettings
  isBuiltIn: boolean
}

import { BUILT_IN_PRESETS } from './builtInPresets'

export { BUILT_IN_PRESETS }

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
  return preset ?? BUILT_IN_PRESETS[0]!
}
