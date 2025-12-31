/**
 * Tests for Wythoff Polytope Store Slice
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { DEFAULT_WYTHOFF_POLYTOPE_CONFIG, DEFAULT_WYTHOFF_SCALES } from '@/lib/geometry/extended/types'

describe('Wythoff Polytope Store Slice', () => {
  beforeEach(() => {
    // Reset store to default state
    useExtendedObjectStore.getState().reset()
  })

  describe('initial state', () => {
    it('has correct default values', () => {
      const { wythoffPolytope } = useExtendedObjectStore.getState()

      expect(wythoffPolytope.symmetryGroup).toBe(DEFAULT_WYTHOFF_POLYTOPE_CONFIG.symmetryGroup)
      expect(wythoffPolytope.preset).toBe(DEFAULT_WYTHOFF_POLYTOPE_CONFIG.preset)
      expect(wythoffPolytope.scale).toBe(DEFAULT_WYTHOFF_POLYTOPE_CONFIG.scale)
      expect(wythoffPolytope.snub).toBe(DEFAULT_WYTHOFF_POLYTOPE_CONFIG.snub)
      expect(wythoffPolytope.customSymbol).toEqual(DEFAULT_WYTHOFF_POLYTOPE_CONFIG.customSymbol)
    })
  })

  describe('setWythoffSymmetryGroup', () => {
    it('updates symmetry group to A', () => {
      useExtendedObjectStore.getState().setWythoffSymmetryGroup('A')
      const { wythoffPolytope } = useExtendedObjectStore.getState()

      expect(wythoffPolytope.symmetryGroup).toBe('A')
    })

    it('updates symmetry group to D', () => {
      useExtendedObjectStore.getState().setWythoffSymmetryGroup('D')
      const { wythoffPolytope } = useExtendedObjectStore.getState()

      expect(wythoffPolytope.symmetryGroup).toBe('D')
    })
  })

  describe('setWythoffPreset', () => {
    it('updates preset and adjusts scale', () => {
      useExtendedObjectStore.getState().setWythoffPreset('truncated')
      const { wythoffPolytope } = useExtendedObjectStore.getState()

      expect(wythoffPolytope.preset).toBe('truncated')
      expect(wythoffPolytope.scale).toBe(DEFAULT_WYTHOFF_SCALES['truncated'])
    })

    it('updates preset to omnitruncated', () => {
      useExtendedObjectStore.getState().setWythoffPreset('omnitruncated')
      const { wythoffPolytope } = useExtendedObjectStore.getState()

      expect(wythoffPolytope.preset).toBe('omnitruncated')
      expect(wythoffPolytope.scale).toBe(DEFAULT_WYTHOFF_SCALES['omnitruncated'])
    })
  })

  describe('setWythoffCustomSymbol', () => {
    it('updates custom symbol', () => {
      const symbol = [true, false, true, false]
      useExtendedObjectStore.getState().setWythoffCustomSymbol(symbol)
      const { wythoffPolytope } = useExtendedObjectStore.getState()

      expect(wythoffPolytope.customSymbol).toEqual(symbol)
    })
  })

  describe('setWythoffScale', () => {
    it('updates scale within valid range', () => {
      useExtendedObjectStore.getState().setWythoffScale(3.0)
      const { wythoffPolytope } = useExtendedObjectStore.getState()

      expect(wythoffPolytope.scale).toBe(3.0)
    })

    it('clamps scale to minimum', () => {
      useExtendedObjectStore.getState().setWythoffScale(0.1)
      const { wythoffPolytope } = useExtendedObjectStore.getState()

      expect(wythoffPolytope.scale).toBe(0.5)
    })

    it('clamps scale to maximum', () => {
      useExtendedObjectStore.getState().setWythoffScale(10.0)
      const { wythoffPolytope } = useExtendedObjectStore.getState()

      expect(wythoffPolytope.scale).toBe(5.0)
    })
  })

  describe('setWythoffSnub', () => {
    it('enables snub variant', () => {
      useExtendedObjectStore.getState().setWythoffSnub(true)
      const { wythoffPolytope } = useExtendedObjectStore.getState()

      expect(wythoffPolytope.snub).toBe(true)
    })

    it('disables snub variant', () => {
      useExtendedObjectStore.getState().setWythoffSnub(true)
      useExtendedObjectStore.getState().setWythoffSnub(false)
      const { wythoffPolytope } = useExtendedObjectStore.getState()

      expect(wythoffPolytope.snub).toBe(false)
    })
  })

  describe('setWythoffConfig', () => {
    it('updates multiple config values at once', () => {
      useExtendedObjectStore.getState().setWythoffConfig({
        symmetryGroup: 'A',
        preset: 'rectified',
        scale: 2.5,
      })
      const { wythoffPolytope } = useExtendedObjectStore.getState()

      expect(wythoffPolytope.symmetryGroup).toBe('A')
      expect(wythoffPolytope.preset).toBe('rectified')
      expect(wythoffPolytope.scale).toBe(2.5)
    })
  })

  describe('initializeWythoffForDimension', () => {
    it('keeps D symmetry for dimension >= 4', () => {
      useExtendedObjectStore.getState().setWythoffSymmetryGroup('D')
      useExtendedObjectStore.getState().initializeWythoffForDimension(4)
      const { wythoffPolytope } = useExtendedObjectStore.getState()

      expect(wythoffPolytope.symmetryGroup).toBe('D')
    })

    it('changes D symmetry to B for dimension < 4', () => {
      useExtendedObjectStore.getState().setWythoffSymmetryGroup('D')
      useExtendedObjectStore.getState().initializeWythoffForDimension(3)
      const { wythoffPolytope } = useExtendedObjectStore.getState()

      expect(wythoffPolytope.symmetryGroup).toBe('B')
    })

    it('keeps A symmetry unchanged', () => {
      useExtendedObjectStore.getState().setWythoffSymmetryGroup('A')
      useExtendedObjectStore.getState().initializeWythoffForDimension(3)
      const { wythoffPolytope } = useExtendedObjectStore.getState()

      expect(wythoffPolytope.symmetryGroup).toBe('A')
    })
  })

  describe('reset', () => {
    it('resets to default values', () => {
      // Modify state
      useExtendedObjectStore.getState().setWythoffSymmetryGroup('A')
      useExtendedObjectStore.getState().setWythoffPreset('truncated')
      useExtendedObjectStore.getState().setWythoffScale(3.5)
      useExtendedObjectStore.getState().setWythoffSnub(true)

      // Reset
      useExtendedObjectStore.getState().reset()

      // Verify default values
      const { wythoffPolytope } = useExtendedObjectStore.getState()
      expect(wythoffPolytope.symmetryGroup).toBe(DEFAULT_WYTHOFF_POLYTOPE_CONFIG.symmetryGroup)
      expect(wythoffPolytope.preset).toBe(DEFAULT_WYTHOFF_POLYTOPE_CONFIG.preset)
      expect(wythoffPolytope.scale).toBe(DEFAULT_WYTHOFF_POLYTOPE_CONFIG.scale)
      expect(wythoffPolytope.snub).toBe(DEFAULT_WYTHOFF_POLYTOPE_CONFIG.snub)
    })
  })
})


























