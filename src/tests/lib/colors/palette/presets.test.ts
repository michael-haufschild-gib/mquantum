/**
 * Tests for Cosine Gradient Palette Presets
 */

import { describe, expect, it } from 'vitest'

import {
  BUILT_IN_PRESETS,
  COSINE_PRESET_OPTIONS,
  COSINE_PRESETS,
  getDefaultPresetForAlgorithm,
  getPresetById,
  type PresetKey,
} from '@/lib/colors/palette/presets'

describe('COSINE_PRESETS', () => {
  // `COSINE_PRESETS` is declared as `Record<PresetKey, CosineCoefficients>`,
  // so TypeScript already guarantees every `PresetKey` maps to an entry —
  // there is no point in hardcoding the 36 preset names into an assertion
  // list that must be maintained alongside the source. The earlier test here
  // was redundant with the type system and added maintenance burden.

  it('should have valid coefficient structure for all presets', () => {
    for (const [_key, coeffs] of Object.entries(COSINE_PRESETS)) {
      expect(coeffs.a).toHaveLength(3)
      expect(coeffs.b).toHaveLength(3)
      expect(coeffs.c).toHaveLength(3)
      expect(coeffs.d).toHaveLength(3)

      // All values should be finite numbers
      for (const arr of [coeffs.a, coeffs.b, coeffs.c, coeffs.d]) {
        for (const val of arr) {
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
  it('should include an entry for every COSINE_PRESETS key', () => {
    // Regression guard for the preset → option mapping. The options array
    // is hand-maintained (not derived from the PresetKey type), so adding
    // a new preset to `cosinePresetData.ts` without updating this list
    // would silently drop it from the UI dropdown. The reverse direction
    // (every option value maps to a real preset) is covered by the next
    // test. Both directions matter — TypeScript only enforces one.
    const presetKeys = Object.keys(COSINE_PRESETS) as PresetKey[]
    const optionValues = new Set(COSINE_PRESET_OPTIONS.map((o) => o.value))
    const missing = presetKeys.filter((k) => !optionValues.has(k))
    expect(missing, `COSINE_PRESET_OPTIONS is missing: ${missing.join(', ')}`).toEqual([])

    // And the option count must equal the preset count — catches a
    // duplicate option entry that would otherwise let the missing-check
    // pass while a preset is still effectively shadowed.
    expect(COSINE_PRESET_OPTIONS).toHaveLength(presetKeys.length)
  })

  it('every option value maps to a real COSINE_PRESETS entry', () => {
    // Reverse direction: if someone typos an option value (`powderrBlue`),
    // the dropdown would offer a selection that crashes the consumer when
    // it tries to look up the coefficients.
    const presetKeys = new Set(Object.keys(COSINE_PRESETS))
    for (const option of COSINE_PRESET_OPTIONS) {
      expect(presetKeys.has(option.value), `orphan option: ${option.value}`).toBe(true)
      expect(option.coefficients).toBe(COSINE_PRESETS[option.value as PresetKey])
    }
  })

  it('every option has a label and full coefficient set', () => {
    for (const option of COSINE_PRESET_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0)
      expect(option.coefficients.a).toHaveLength(3)
      expect(option.coefficients.b).toHaveLength(3)
      expect(option.coefficients.c).toHaveLength(3)
      expect(option.coefficients.d).toHaveLength(3)
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
  it('should have all required fields with valid values', () => {
    const validAlgorithms = ['radial', 'lch']
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.id.length).toBeGreaterThan(0)
      expect(preset.name.length).toBeGreaterThan(0)
      expect(validAlgorithms).toContain(preset.algorithm)
      expect(preset.coefficients.a).toHaveLength(3)
      expect(preset.distribution.power).toBeGreaterThan(0)
      expect(preset.isBuiltIn).toBe(true)
    }
  })

  it('should have valid algorithm values', () => {
    const validAlgorithms = ['radial', 'lch']

    for (const preset of BUILT_IN_PRESETS) {
      expect(validAlgorithms).toContain(preset.algorithm)
    }
  })

  it('should have valid distribution settings', () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.distribution.power).toBeGreaterThan(0)
      expect(preset.distribution.cycles).toBeGreaterThan(0)
      expect(Number.isFinite(preset.distribution.offset)).toBe(true)
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
    expect(preset).toMatchObject({ id: 'powderBlue', name: 'Powder Blue' })
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
      expect(preset).toMatchObject({ id: builtIn.id })
    }
  })
})

describe('getDefaultPresetForAlgorithm', () => {
  it('should return a preset for radial algorithm', () => {
    const preset = getDefaultPresetForAlgorithm('radial')
    expect(preset.algorithm).toBe('radial')
  })

  it('should return a preset for lch algorithm', () => {
    const preset = getDefaultPresetForAlgorithm('lch')
    expect(preset.algorithm).toBe('lch')
  })

  it('should return fallback preset for unknown algorithm', () => {
    // @ts-expect-error - Testing with invalid algorithm
    const preset = getDefaultPresetForAlgorithm('unknown-algorithm')
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
