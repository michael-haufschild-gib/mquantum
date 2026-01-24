/**
 * Tests for Hydrogen ND presets and utility functions
 */

import { describe, it, expect } from 'vitest'
import {
  HYDROGEN_ND_PRESETS,
  getHydrogenNDPreset,
  getHydrogenNDPresetsGroupedByDimension,
  getHydrogenNDPresetsWithKeysByDimension,
  getPresetsForDimension,
  type HydrogenNDPreset,
} from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets'

describe('Hydrogen ND Presets', () => {
  describe('HYDROGEN_ND_PRESETS', () => {
    it('should have all expected ND presets', () => {
      // 4D presets
      expect(HYDROGEN_ND_PRESETS['2pz_4d']).toBeDefined()
      expect(HYDROGEN_ND_PRESETS['3dz2_4d']).toBeDefined()

      // 5D presets
      expect(HYDROGEN_ND_PRESETS['2pz_5d']).toBeDefined()
      expect(HYDROGEN_ND_PRESETS['3dz2_5d']).toBeDefined()

      // 6D presets
      expect(HYDROGEN_ND_PRESETS['2pz_6d']).toBeDefined()
      expect(HYDROGEN_ND_PRESETS['3dz2_6d']).toBeDefined()
      expect(HYDROGEN_ND_PRESETS['4fz3_6d']).toBeDefined()

      // Custom
      expect(HYDROGEN_ND_PRESETS['custom']).toBeDefined()
    })

    it('should have valid 3D quantum numbers for all presets', () => {
      for (const [_name, preset] of Object.entries(HYDROGEN_ND_PRESETS)) {
        // Validate 3D quantum number constraints
        expect(preset.n).toBeGreaterThanOrEqual(1)
        expect(preset.n).toBeLessThanOrEqual(7)
        expect(preset.l).toBeGreaterThanOrEqual(0)
        expect(preset.l).toBeLessThan(preset.n)
        expect(Math.abs(preset.m)).toBeLessThanOrEqual(preset.l)
        expect(preset.bohrRadiusScale).toBeGreaterThan(0)
      }
    })

    it('should have valid extra dimension quantum numbers', () => {
      for (const [_name, preset] of Object.entries(HYDROGEN_ND_PRESETS)) {
        // extraDimN should have 8 values (for dims 4-11)
        expect(preset.extraDimN).toHaveLength(8)

        // extraDimOmega should have 8 values
        expect(preset.extraDimOmega).toHaveLength(8)

        // Each extra dim quantum number should be in valid range (0-6)
        for (const n of preset.extraDimN) {
          expect(n).toBeGreaterThanOrEqual(0)
          expect(n).toBeLessThanOrEqual(6)
        }

        // Each extra dim omega should be positive
        for (const omega of preset.extraDimOmega) {
          expect(omega).toBeGreaterThan(0)
        }
      }
    })

    it('should have valid dimension values', () => {
      for (const [name, preset] of Object.entries(HYDROGEN_ND_PRESETS)) {
        if (name === 'custom') continue // Custom doesn't have a fixed dimension

        expect(preset.dimension).toBeGreaterThanOrEqual(3)
        expect(preset.dimension).toBeLessThanOrEqual(11)
      }
    })

    it('should have correct dimension for named presets', () => {
      // 4D presets
      expect(HYDROGEN_ND_PRESETS['2pz_4d'].dimension).toBe(4)
      expect(HYDROGEN_ND_PRESETS['3dz2_4d'].dimension).toBe(4)

      // 5D presets
      expect(HYDROGEN_ND_PRESETS['2pz_5d'].dimension).toBe(5)
      expect(HYDROGEN_ND_PRESETS['3dz2_5d'].dimension).toBe(5)

      // 6D presets
      expect(HYDROGEN_ND_PRESETS['2pz_6d'].dimension).toBe(6)
      expect(HYDROGEN_ND_PRESETS['3dz2_6d'].dimension).toBe(6)
      expect(HYDROGEN_ND_PRESETS['4fz3_6d'].dimension).toBe(6)
    })
  })

  describe('getHydrogenNDPreset', () => {
    it('should return the correct preset for known names', () => {
      const preset2pz4d = getHydrogenNDPreset('2pz_4d')
      expect(preset2pz4d.n).toBe(2)
      expect(preset2pz4d.l).toBe(1)
      expect(preset2pz4d.m).toBe(0)
      expect(preset2pz4d.dimension).toBe(4)

      const preset3dz26d = getHydrogenNDPreset('3dz2_6d')
      expect(preset3dz26d.n).toBe(3)
      expect(preset3dz26d.l).toBe(2)
      expect(preset3dz26d.dimension).toBe(6)
    })

    it('should return 2pz_4d as fallback for unknown names', () => {
      // Cast to any to test fallback behavior
      const preset = getHydrogenNDPreset('unknown' as never)
      expect(preset.n).toBe(2)
      expect(preset.l).toBe(1)
      expect(preset.m).toBe(0)
      expect(preset.dimension).toBe(4)
    })
  })

  describe('getHydrogenNDPresetsGroupedByDimension', () => {
    it('should group presets by dimension', () => {
      const groups = getHydrogenNDPresetsGroupedByDimension()

      // Should have groups for 4D, 5D, 6D (based on current presets)
      expect(groups[4]).toBeDefined()
      expect(groups[5]).toBeDefined()
      expect(groups[6]).toBeDefined()

      // Each group should have correct dimension presets
      for (const preset of groups[4]!) {
        expect(preset.dimension).toBe(4)
      }
      for (const preset of groups[5]!) {
        expect(preset.dimension).toBe(5)
      }
      for (const preset of groups[6]!) {
        expect(preset.dimension).toBe(6)
      }
    })

    it('should not include custom preset', () => {
      const groups = getHydrogenNDPresetsGroupedByDimension()

      for (const presets of Object.values(groups)) {
        for (const preset of presets as HydrogenNDPreset[]) {
          expect(preset.name).not.toBe('Custom')
        }
      }
    })
  })

  describe('getHydrogenNDPresetsWithKeysByDimension', () => {
    it('should return presets with their keys grouped by dimension', () => {
      const groups = getHydrogenNDPresetsWithKeysByDimension()

      // Should have groups for 4D, 5D, 6D
      expect(groups[4]).toBeDefined()
      expect(groups[5]).toBeDefined()
      expect(groups[6]).toBeDefined()

      // Each entry should be a tuple [key, preset]
      for (const [key, preset] of groups[4]!) {
        expect(typeof key).toBe('string')
        expect(preset.dimension).toBe(4)
        expect(HYDROGEN_ND_PRESETS[key]).toBe(preset)
      }
    })

    it('should not include custom preset', () => {
      const groups = getHydrogenNDPresetsWithKeysByDimension()

      for (const presets of Object.values(groups)) {
        for (const [key, _preset] of presets) {
          expect(key).not.toBe('custom')
        }
      }
    })
  })

  describe('getPresetsForDimension', () => {
    it('should return presets for exact dimension', () => {
      const presets4d = getPresetsForDimension(4)

      // Should include 4D presets
      expect(presets4d.some((p) => p.name.includes('4D'))).toBe(true)
    })

    it('should return presets for lower dimensions too', () => {
      const presets6d = getPresetsForDimension(6)

      // Should include 4D, 5D, and 6D presets
      expect(presets6d.some((p) => p.dimension === 4)).toBe(true)
      expect(presets6d.some((p) => p.dimension === 5)).toBe(true)
      expect(presets6d.some((p) => p.dimension === 6)).toBe(true)
    })

    it('should not include presets for higher dimensions', () => {
      const presets4d = getPresetsForDimension(4)

      // Should not include 5D or 6D presets
      expect(presets4d.every((p) => p.dimension <= 4)).toBe(true)
    })

    it('should return empty for dimension 3', () => {
      const presets3d = getPresetsForDimension(3)

      // No ND presets for 3D (that's just regular hydrogen)
      expect(presets3d.length).toBe(0)
    })

    it('should not include custom preset', () => {
      const presets = getPresetsForDimension(11)

      expect(presets.every((p) => p.name !== 'Custom')).toBe(true)
    })
  })

  describe('Preset Structure', () => {
    it('should have all required fields in each preset', () => {
      const requiredFields = [
        'name',
        'description',
        'n',
        'l',
        'm',
        'useReal',
        'bohrRadiusScale',
        'dimension',
        'extraDimN',
        'extraDimOmega',
      ]

      for (const [_key, preset] of Object.entries(HYDROGEN_ND_PRESETS)) {
        for (const field of requiredFields) {
          expect(preset).toHaveProperty(field)
        }
      }
    })

    it('should have meaningful descriptions', () => {
      for (const [_key, preset] of Object.entries(HYDROGEN_ND_PRESETS)) {
        expect(preset.description.length).toBeGreaterThan(10)
      }
    })

    it('should have meaningful names', () => {
      for (const [_key, preset] of Object.entries(HYDROGEN_ND_PRESETS)) {
        expect(preset.name.length).toBeGreaterThan(0)
      }
    })
  })
})
