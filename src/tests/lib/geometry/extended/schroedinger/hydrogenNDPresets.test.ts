/**
 * Tests for Hydrogen ND presets and utility functions
 */

import { describe, expect, it } from 'vitest'

import {
  getHydrogenNDPreset,
  getHydrogenNDPresetsGroupedByDimension,
  getHydrogenNDPresetsWithKeysByDimension,
  getPresetsForDimension,
  HYDROGEN_ND_PRESETS,
  type HydrogenNDPreset,
  hydrogenNDToLabel,
} from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets'

describe('Hydrogen ND Presets', () => {
  describe('HYDROGEN_ND_PRESETS', () => {
    it('should have all expected ND presets', () => {
      expect(Object.keys(HYDROGEN_ND_PRESETS)).toEqual([
        '1s_2d',
        '2s_2d',
        '2p_2d',
        '1s_3d',
        '2s_3d',
        '2pz_3d',
        '3dz2_3d',
        '3dxy_3d',
        '4fz3_3d',
        '2pz_4d',
        '3dz2_4d',
        '2pz_5d',
        '3dz2_5d',
        '2pz_6d',
        '3dz2_6d',
        '4fz3_6d',
        'custom',
      ])
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

        expect(preset.dimension).toBeGreaterThanOrEqual(2)
        expect(preset.dimension).toBeLessThanOrEqual(11)
      }
    })

    it('should have correct dimension for named presets', () => {
      // 2D presets
      expect(HYDROGEN_ND_PRESETS['1s_2d'].dimension).toBe(2)
      expect(HYDROGEN_ND_PRESETS['2s_2d'].dimension).toBe(2)
      expect(HYDROGEN_ND_PRESETS['2p_2d'].dimension).toBe(2)

      // 3D presets
      expect(HYDROGEN_ND_PRESETS['1s_3d'].dimension).toBe(3)
      expect(HYDROGEN_ND_PRESETS['2s_3d'].dimension).toBe(3)
      expect(HYDROGEN_ND_PRESETS['2pz_3d'].dimension).toBe(3)
      expect(HYDROGEN_ND_PRESETS['3dz2_3d'].dimension).toBe(3)
      expect(HYDROGEN_ND_PRESETS['3dxy_3d'].dimension).toBe(3)
      expect(HYDROGEN_ND_PRESETS['4fz3_3d'].dimension).toBe(3)

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

      // Should have groups for 2D, 3D, 4D, 5D, 6D (based on current presets)
      expect(groups[2]?.length).toBeGreaterThan(0)
      expect(groups[3]?.length).toBeGreaterThan(0)
      expect(groups[4]?.length).toBeGreaterThan(0)
      expect(groups[5]?.length).toBeGreaterThan(0)
      expect(groups[6]?.length).toBeGreaterThan(0)

      // Each group should have correct dimension presets
      for (const preset of groups[2]!) {
        expect(preset.dimension).toBe(2)
      }
      for (const preset of groups[3]!) {
        expect(preset.dimension).toBe(3)
      }
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
    it('returns exact keys per dimension in registry order', () => {
      const groups = getHydrogenNDPresetsWithKeysByDimension()

      expect(Object.keys(groups).map(Number)).toEqual([2, 3, 4, 5, 6])
      expect(groups[2]?.map(([key]) => key)).toEqual(['1s_2d', '2s_2d', '2p_2d'])
      expect(groups[3]?.map(([key]) => key)).toEqual([
        '1s_3d',
        '2s_3d',
        '2pz_3d',
        '3dz2_3d',
        '3dxy_3d',
        '4fz3_3d',
      ])
      expect(groups[4]?.map(([key]) => key)).toEqual(['2pz_4d', '3dz2_4d'])
      expect(groups[5]?.map(([key]) => key)).toEqual(['2pz_5d', '3dz2_5d'])
      expect(groups[6]?.map(([key]) => key)).toEqual(['2pz_6d', '3dz2_6d', '4fz3_6d'])
    })

    it('should return presets with their keys grouped by dimension', () => {
      const groups = getHydrogenNDPresetsWithKeysByDimension()

      // Should have groups for 2D, 3D, 4D, 5D, 6D
      expect(groups[2]?.length).toBeGreaterThan(0)
      expect(groups[3]?.length).toBeGreaterThan(0)
      expect(groups[4]?.length).toBeGreaterThan(0)
      expect(groups[5]?.length).toBeGreaterThan(0)
      expect(groups[6]?.length).toBeGreaterThan(0)

      // Each entry should be a tuple [key, preset]
      for (const [key, preset] of groups[2]!) {
        expect(preset.dimension).toBe(2)
        expect(HYDROGEN_ND_PRESETS[key]).toBe(preset)
      }
      for (const [key, preset] of groups[3]!) {
        expect(preset.dimension).toBe(3)
        expect(HYDROGEN_ND_PRESETS[key]).toBe(preset)
      }
      for (const [key, preset] of groups[4]!) {
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
    it('returns exact preset names up through the requested dimension', () => {
      expect(getPresetsForDimension(4).map((p) => p.name)).toEqual([
        '1s (Ground State)',
        '2s',
        '2px',
        '1s (Ground State)',
        '2s',
        '2pz',
        '3dz²',
        '3dx²-y²',
        '4fz³',
        '2pz + 4D Ground',
        '3dz² + 4D Ground',
      ])
    })

    it('should return presets for lower dimensions too', () => {
      const presets6d = getPresetsForDimension(6)

      expect(presets6d.map((p) => p.dimension)).toEqual([
        2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 5, 5, 6, 6, 6,
      ])
    })

    it('should not include presets for higher dimensions', () => {
      const presets4d = getPresetsForDimension(4)

      // Should not include 5D or 6D presets
      expect(presets4d.every((p) => p.dimension <= 4)).toBe(true)
    })

    it('should return 2D and 3D presets for dimension 3', () => {
      const presets3d = getPresetsForDimension(3)

      expect(presets3d.length).toBeGreaterThan(0)
      expect(presets3d.every((p) => p.dimension <= 3)).toBe(true)
      expect(presets3d.some((p) => p.dimension === 2)).toBe(true)
      expect(presets3d.some((p) => p.dimension === 3)).toBe(true)
    })

    it('should return 2D presets for dimension 2', () => {
      const presets2d = getPresetsForDimension(2)

      expect(presets2d.length).toBeGreaterThan(0)
      expect(presets2d.every((p) => p.dimension === 2)).toBe(true)
    })

    it('should not include custom preset', () => {
      const presets = getPresetsForDimension(11)

      expect(presets.every((p) => p.name !== 'Custom')).toBe(true)
    })
  })

  describe('hydrogenNDToLabel', () => {
    it('generates s-orbital label for l=0', () => {
      expect(hydrogenNDToLabel(1, 0, 0, 3, [0, 0, 0, 0, 0, 0, 0, 0])).toBe('1s')
    })

    it('generates pz label for l=1, m=0', () => {
      expect(hydrogenNDToLabel(2, 1, 0, 3, [0, 0, 0, 0, 0, 0, 0, 0])).toBe('2pz')
    })

    it('generates px label for l=1, m=1', () => {
      expect(hydrogenNDToLabel(2, 1, 1, 3, [0, 0, 0, 0, 0, 0, 0, 0])).toBe('2px')
    })

    it('generates py label for l=1, m=-1', () => {
      expect(hydrogenNDToLabel(2, 1, -1, 3, [0, 0, 0, 0, 0, 0, 0, 0])).toBe('2py')
    })

    it('generates dz² label for l=2, m=0', () => {
      expect(hydrogenNDToLabel(3, 2, 0, 3, [0, 0, 0, 0, 0, 0, 0, 0])).toBe('3dz²')
    })

    it('generates d label for l=2, m≠0', () => {
      expect(hydrogenNDToLabel(3, 2, 1, 3, [0, 0, 0, 0, 0, 0, 0, 0])).toBe('3d')
    })

    it('generates generic f-orbital label for l=3', () => {
      expect(hydrogenNDToLabel(4, 3, 0, 3, [0, 0, 0, 0, 0, 0, 0, 0])).toBe('4f')
    })

    it('generates fallback label for high l', () => {
      // l=7 → no letter in lookup table
      expect(hydrogenNDToLabel(8, 7, 0, 3, [0, 0, 0, 0, 0, 0, 0, 0])).toBe('8l=7')
    })

    it('appends dimension for 4D+ with ground states', () => {
      expect(hydrogenNDToLabel(2, 1, 0, 4, [0, 0, 0, 0, 0, 0, 0, 0])).toBe('2pz + 4D')
    })

    it('shows extra dim quantum numbers when excited', () => {
      const label = hydrogenNDToLabel(2, 1, 0, 5, [1, 2, 0, 0, 0, 0, 0, 0])
      expect(label).toBe('2pz + 5D (n4=1, n5=2)')
    })

    it('shows only used extra dims for the dimension', () => {
      // 4D has 1 extra dim, so only extraDimN[0] is shown
      const label = hydrogenNDToLabel(2, 1, 0, 4, [3, 0, 0, 0, 0, 0, 0, 0])
      expect(label).toBe('2pz + 4D (n4=3)')
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
