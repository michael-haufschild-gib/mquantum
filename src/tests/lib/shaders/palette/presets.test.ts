/**
 * Tests for Cosine Gradient Palette Presets
 */

import { describe, it, expect } from 'vitest'
import {
  COSINE_PRESETS,
  COSINE_PRESET_OPTIONS,
  BUILT_IN_PRESETS,
  getPresetById,
  getDefaultPresetForAlgorithm,
  type PresetKey,
} from '@/rendering/shaders/palette/presets'

describe('COSINE_PRESETS', () => {
  it('should have all preset keys defined', () => {
    const expectedKeys: PresetKey[] = [
      // Pastels
      'powderBlue',
      'dustyRose',
      'softLavender',
      'palePeach',
      // Desaturated Blues
      'steelBlue',
      'stormCloud',
      'deepSea',
      'slate',
      'fog',
      // Desaturated Reds/Pinks
      'crimsonFade',
      'driedRose',
      'terracotta',
      'clay',
      'burgundyMist',
      'mauve',
      // Earthy/Neutral
      'stone',
      'driftwood',
      'charcoal',
      'espresso',
      // Two-color blends
      'roseSteel',
      'dustyTwilight',
      'warmFog',
      'coolEmber',
      // Experimental
      'electric',
      'plasma',
      'nebula',
      'prism',
      // Wild/Unconventional
      'glitch',
      'infrared',
      'acidWash',
      'voidPulse',
      'solarFlare',
      'deepFry',
      'ghostwave',
      'toxicSpill',
      'binaryFade',
      'chromaticShift',
    ]

    for (const key of expectedKeys) {
      expect(COSINE_PRESETS[key]).toBeDefined()
    }
  })

  it('should have valid coefficient structure for all presets', () => {
    for (const [_key, coeffs] of Object.entries(COSINE_PRESETS)) {
      expect(coeffs.a).toHaveLength(3)
      expect(coeffs.b).toHaveLength(3)
      expect(coeffs.c).toHaveLength(3)
      expect(coeffs.d).toHaveLength(3)

      // All values should be numbers
      for (const arr of [coeffs.a, coeffs.b, coeffs.c, coeffs.d]) {
        for (const val of arr) {
          expect(typeof val).toBe('number')
          expect(Number.isFinite(val)).toBe(true)
        }
      }
    }
  })

  it('should have coefficients in reasonable ranges', () => {
    for (const [_key, coeffs] of Object.entries(COSINE_PRESETS)) {
      // a (base offset) typically [0, 1]
      for (const val of coeffs.a) {
        expect(val).toBeGreaterThanOrEqual(-1)
        expect(val).toBeLessThanOrEqual(2)
      }

      // b (amplitude) typically [-1, 1]
      for (const val of coeffs.b) {
        expect(val).toBeGreaterThanOrEqual(-2)
        expect(val).toBeLessThanOrEqual(2)
      }

      // c (frequency) typically [0, 5]
      for (const val of coeffs.c) {
        expect(val).toBeGreaterThanOrEqual(-1)
        expect(val).toBeLessThanOrEqual(5)
      }

      // d (phase) typically [0, 1]
      for (const val of coeffs.d) {
        expect(val).toBeGreaterThanOrEqual(-1)
        expect(val).toBeLessThanOrEqual(2)
      }
    }
  })
})

describe('COSINE_PRESET_OPTIONS', () => {
  it('should have matching entries for all COSINE_PRESETS', () => {
    const presetKeys = Object.keys(COSINE_PRESETS)

    for (const key of presetKeys) {
      const option = COSINE_PRESET_OPTIONS.find((o) => o.value === key)
      expect(option).toBeDefined()
      expect(option!.coefficients).toBe(COSINE_PRESETS[key as PresetKey])
    }
  })

  it('should have valid option structure', () => {
    for (const option of COSINE_PRESET_OPTIONS) {
      expect(typeof option.value).toBe('string')
      expect(option.value.length).toBeGreaterThan(0)
      expect(typeof option.label).toBe('string')
      expect(option.label.length).toBeGreaterThan(0)
      expect(option.coefficients).toBeDefined()
      expect(option.coefficients.a).toHaveLength(3)
    }
  })

  it('should have human-readable labels', () => {
    for (const option of COSINE_PRESET_OPTIONS) {
      // Labels should have spaces or be capitalized properly
      expect(option.label[0]).toBe(option.label[0]!.toUpperCase())
    }
  })
})

describe('BUILT_IN_PRESETS', () => {
  it('should have all required fields', () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.id).toBeDefined()
      expect(typeof preset.id).toBe('string')
      expect(preset.name).toBeDefined()
      expect(typeof preset.name).toBe('string')
      expect(preset.algorithm).toBeDefined()
      expect(preset.coefficients).toBeDefined()
      expect(preset.distribution).toBeDefined()
      expect(typeof preset.isBuiltIn).toBe('boolean')
    }
  })

  it('should have valid algorithm values', () => {
    const validAlgorithms = ['cosine', 'lch', 'normal', 'monochromatic', 'analogous']

    for (const preset of BUILT_IN_PRESETS) {
      expect(validAlgorithms).toContain(preset.algorithm)
    }
  })

  it('should have valid distribution settings', () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(typeof preset.distribution.power).toBe('number')
      expect(preset.distribution.power).toBeGreaterThan(0)
      expect(typeof preset.distribution.cycles).toBe('number')
      expect(preset.distribution.cycles).toBeGreaterThan(0)
      expect(typeof preset.distribution.offset).toBe('number')
    }
  })

  it('should mark all as built-in', () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.isBuiltIn).toBe(true)
    }
  })

  it('should have unique IDs', () => {
    const ids = BUILT_IN_PRESETS.map((p) => p.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })
})

describe('getPresetById', () => {
  it('should return preset for valid ID', () => {
    const preset = getPresetById('powderBlue')
    expect(preset).toBeDefined()
    expect(preset!.id).toBe('powderBlue')
    expect(preset!.name).toBe('Powder Blue')
  })

  it('should return undefined for invalid ID', () => {
    const preset = getPresetById('nonexistent-preset')
    expect(preset).toBeUndefined()
  })

  it('should return undefined for empty string', () => {
    const preset = getPresetById('')
    expect(preset).toBeUndefined()
  })

  it('should be case-sensitive', () => {
    const preset = getPresetById('POWDERBLUE')
    expect(preset).toBeUndefined()
  })

  it('should return all built-in presets by ID', () => {
    for (const builtIn of BUILT_IN_PRESETS) {
      const preset = getPresetById(builtIn.id)
      expect(preset).toBeDefined()
      expect(preset!.id).toBe(builtIn.id)
    }
  })
})

describe('getDefaultPresetForAlgorithm', () => {
  it('should return a preset for cosine algorithm', () => {
    const preset = getDefaultPresetForAlgorithm('cosine')
    expect(preset).toBeDefined()
    expect(preset.algorithm).toBe('cosine')
  })

  it('should return a preset for lch algorithm', () => {
    const preset = getDefaultPresetForAlgorithm('lch')
    expect(preset).toBeDefined()
    expect(preset.algorithm).toBe('lch')
  })

  it('should return a preset for normal algorithm', () => {
    const preset = getDefaultPresetForAlgorithm('normal')
    expect(preset).toBeDefined()
    expect(preset.algorithm).toBe('normal')
  })

  it('should return a preset for monochromatic algorithm', () => {
    const preset = getDefaultPresetForAlgorithm('monochromatic')
    expect(preset).toBeDefined()
    expect(preset.algorithm).toBe('monochromatic')
  })

  it('should return a preset for analogous algorithm', () => {
    const preset = getDefaultPresetForAlgorithm('analogous')
    expect(preset).toBeDefined()
    expect(preset.algorithm).toBe('analogous')
  })

  it('should return fallback preset for unknown algorithm', () => {
    // @ts-expect-error - Testing with invalid algorithm
    const preset = getDefaultPresetForAlgorithm('unknown-algorithm')
    expect(preset).toBeDefined()
    // Should return first preset as fallback
    expect(preset.id).toBe(BUILT_IN_PRESETS[0]!.id)
  })
})

describe('preset categories', () => {
  it('should have pastel presets with high luminance values', () => {
    const pastels: PresetKey[] = ['powderBlue', 'dustyRose', 'softLavender', 'palePeach']

    for (const key of pastels) {
      const coeffs = COSINE_PRESETS[key]
      // Pastels typically have high a values (base brightness)
      const avgA = (coeffs.a[0] + coeffs.a[1] + coeffs.a[2]) / 3
      expect(avgA).toBeGreaterThan(0.7)
    }
  })

  it('should have desaturated blues with cool tones', () => {
    const coolBlues: PresetKey[] = ['steelBlue', 'stormCloud', 'deepSea', 'slate', 'fog']

    for (const key of coolBlues) {
      const coeffs = COSINE_PRESETS[key]
      // Blues typically have higher blue channel in base (a)
      expect(coeffs.a[2]).toBeGreaterThanOrEqual(coeffs.a[0])
    }
  })

  it('should have wild presets with unusual frequencies', () => {
    const wildPresets: PresetKey[] = ['glitch', 'binaryFade', 'acidWash']

    for (const key of wildPresets) {
      const coeffs = COSINE_PRESETS[key]
      // Wild presets often have c values > 1 or asymmetric
      const hasUnusualFreq =
        coeffs.c[0] > 1 ||
        coeffs.c[1] > 1 ||
        coeffs.c[2] > 1 ||
        Math.abs(coeffs.c[0] - coeffs.c[1]) > 0.5 ||
        Math.abs(coeffs.c[1] - coeffs.c[2]) > 0.5
      expect(hasUnusualFreq).toBe(true)
    }
  })
})
