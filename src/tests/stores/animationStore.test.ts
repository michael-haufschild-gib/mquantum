/**
 * Tests for animationStore
 */

import {
  BASE_ROTATION_RATE,
  DEFAULT_SPEED,
  MAX_SPEED,
  MIN_SPEED,
  useAnimationStore,
} from '@/stores/animationStore'
import { beforeEach, describe, expect, it } from 'vitest'

describe('animationStore', () => {
  beforeEach(() => {
    useAnimationStore.getState().reset()
  })

  describe('play/pause/toggle', () => {
    it('toggles isPlaying deterministically', () => {
      useAnimationStore.getState().pause()
      expect(useAnimationStore.getState().isPlaying).toBe(false)

      useAnimationStore.getState().toggle()
      expect(useAnimationStore.getState().isPlaying).toBe(true)

      useAnimationStore.getState().toggle()
      expect(useAnimationStore.getState().isPlaying).toBe(false)
    })
  })

  describe('setSpeed', () => {
    it('clamps to [MIN_SPEED, MAX_SPEED] and preserves in-range values', () => {
      const cases: Array<{ input: number; expected: number }> = [
        { input: MIN_SPEED - 999, expected: MIN_SPEED },
        { input: MIN_SPEED, expected: MIN_SPEED },
        { input: 2.5, expected: 2.5 },
        { input: MAX_SPEED, expected: MAX_SPEED },
        { input: MAX_SPEED + 999, expected: MAX_SPEED },
      ]

      for (const { input, expected } of cases) {
        useAnimationStore.getState().setSpeed(input)
        expect(useAnimationStore.getState().speed).toBe(expected)
      }
    })
  })

  describe('toggleDirection', () => {
    it('toggles direction sign', () => {
      const dir1 = useAnimationStore.getState().direction
      useAnimationStore.getState().toggleDirection()
      const dir2 = useAnimationStore.getState().direction
      useAnimationStore.getState().toggleDirection()
      const dir3 = useAnimationStore.getState().direction

      expect(dir2).toBe(-dir1)
      expect(dir3).toBe(dir1)
    })
  })

  describe('togglePlane', () => {
    it('should add plane to animating set', () => {
      // Use a plane not in the initial set (XY, YZ, XZ are in the initial set)
      useAnimationStore.getState().togglePlane('XW')
      expect(useAnimationStore.getState().animatingPlanes.has('XW')).toBe(true)
    })

    it('should remove plane from animating set', () => {
      useAnimationStore.getState().togglePlane('XY')
      expect(useAnimationStore.getState().animatingPlanes.has('XY')).toBe(false)
    })
  })

  describe('setPlaneAnimating', () => {
    it('should add plane when animating is true', () => {
      useAnimationStore.getState().setPlaneAnimating('XW', true)
      expect(useAnimationStore.getState().animatingPlanes.has('XW')).toBe(true)
    })

    it('should remove plane when animating is false', () => {
      useAnimationStore.getState().setPlaneAnimating('XW', true)
      useAnimationStore.getState().setPlaneAnimating('XW', false)
      expect(useAnimationStore.getState().animatingPlanes.has('XW')).toBe(false)
    })
  })

  describe('animateAll', () => {
    it('creates exactly n*(n-1)/2 planes and forces isPlaying=true', () => {
      const dims = [3, 4, 10, 11]
      for (const dim of dims) {
        useAnimationStore.getState().stopAll()
        useAnimationStore.getState().pause()

        useAnimationStore.getState().animateAll(dim)
        const planes = useAnimationStore.getState().animatingPlanes

        expect(useAnimationStore.getState().isPlaying).toBe(true)
        expect(planes.size).toBe((dim * (dim - 1)) / 2)
      }
    })
  })

  describe('stopAll', () => {
    it('should clear all animating planes', () => {
      useAnimationStore.getState().animateAll(4)
      useAnimationStore.getState().stopAll()
      expect(useAnimationStore.getState().animatingPlanes.size).toBe(0)
    })

    it('should stop playing', () => {
      useAnimationStore.getState().animateAll(4)
      useAnimationStore.getState().stopAll()
      expect(useAnimationStore.getState().isPlaying).toBe(false)
    })
  })

  describe('getRotationDelta', () => {
    it('should calculate correct delta at default speed', () => {
      const delta = useAnimationStore.getState().getRotationDelta(1000) // 1 second
      expect(delta).toBeCloseTo(BASE_ROTATION_RATE * DEFAULT_SPEED)
    })

    it('should scale delta with speed', () => {
      useAnimationStore.getState().setSpeed(2)
      const delta = useAnimationStore.getState().getRotationDelta(1000)
      expect(delta).toBeCloseTo(BASE_ROTATION_RATE * 2)
    })

    it('should reverse delta with direction', () => {
      useAnimationStore.getState().toggleDirection()
      const delta = useAnimationStore.getState().getRotationDelta(1000)
      expect(delta).toBeCloseTo(-BASE_ROTATION_RATE * DEFAULT_SPEED)
    })
  })

  describe('reset', () => {
    it('restores safe baseline invariants after arbitrary changes', () => {
      useAnimationStore.getState().play()
      useAnimationStore.getState().setSpeed(3)
      useAnimationStore.getState().toggleDirection()
      useAnimationStore.getState().animateAll(4)

      useAnimationStore.getState().reset()

      expect(useAnimationStore.getState().isPlaying).toBe(true)
      expect(useAnimationStore.getState().speed).toBe(DEFAULT_SPEED)
      expect(useAnimationStore.getState().direction).toBe(1)
    })
  })

  describe('randomizePlanes', () => {
    it('should select at least one plane', () => {
      // Run multiple times to ensure constraint holds
      for (let i = 0; i < 50; i++) {
        useAnimationStore.getState().randomizePlanes(4)
        expect(useAnimationStore.getState().animatingPlanes.size).toBeGreaterThanOrEqual(1)
      }
    })

    it('should only select planes valid for the given dimension', () => {
      // Test for 3D (only XY, YZ, XZ are valid)
      useAnimationStore.getState().randomizePlanes(3)
      const selected3D = Array.from(useAnimationStore.getState().animatingPlanes)
      const valid3D = ['XY', 'YZ', 'XZ']
      selected3D.forEach((plane) => {
        expect(valid3D).toContain(plane)
      })

      // Test for 4D
      useAnimationStore.getState().randomizePlanes(4)
      const selected4D = Array.from(useAnimationStore.getState().animatingPlanes)
      const valid4D = ['XY', 'YZ', 'XZ', 'XW', 'YW', 'ZW']
      selected4D.forEach((plane) => {
        expect(valid4D).toContain(plane)
      })
    })

    it('should auto-start animation', () => {
      useAnimationStore.getState().pause()
      expect(useAnimationStore.getState().isPlaying).toBe(false)

      useAnimationStore.getState().randomizePlanes(4)
      expect(useAnimationStore.getState().isPlaying).toBe(true)
    })

    it('should select between 1 and n*(n-1)/2 planes', () => {
      const dim = 5
      const maxPlanes = (dim * (dim - 1)) / 2

      for (let i = 0; i < 50; i++) {
        useAnimationStore.getState().randomizePlanes(dim)
        const count = useAnimationStore.getState().animatingPlanes.size
        expect(count).toBeGreaterThanOrEqual(1)
        expect(count).toBeLessThanOrEqual(maxPlanes)
      }
    })
  })

  describe('setDimension', () => {
    it('should filter out invalid planes when dimension decreases', () => {
      // Simulate the bug: animate 10D planes, then switch to 6D
      useAnimationStore.getState().animateAll(10)
      const planesBefore = useAnimationStore.getState().animatingPlanes
      expect(planesBefore.has('XA6')).toBe(true) // Valid in 10D
      expect(planesBefore.has('XA7')).toBe(true)
      expect(planesBefore.size).toBe((10 * 9) / 2) // 10D has 45 rotation planes

      // Switch to 6D - should filter out invalid planes
      useAnimationStore.getState().setDimension(6)
      const planesAfter = useAnimationStore.getState().animatingPlanes

      // Should only have 6D planes (15 planes)
      expect(planesAfter.size).toBe((6 * 5) / 2)
      expect(planesAfter.has('XY')).toBe(true)
      expect(planesAfter.has('XU')).toBe(true) // U is axis 5, valid in 6D
      expect(planesAfter.has('XA6')).toBe(false) // A6 is axis 6, invalid in 6D
      expect(planesAfter.has('XA7')).toBe(false)
    })

    it('should keep valid planes when dimension decreases', () => {
      // Clear defaults first
      useAnimationStore.getState().stopAll()

      // Add specific planes
      useAnimationStore.getState().togglePlane('XY')
      useAnimationStore.getState().togglePlane('XZ')
      useAnimationStore.getState().togglePlane('XW')

      useAnimationStore.getState().setDimension(4)

      const planes = useAnimationStore.getState().animatingPlanes
      expect(planes.has('XY')).toBe(true)
      expect(planes.has('XZ')).toBe(true)
      expect(planes.has('XW')).toBe(true)
    })

    it('should remove 4D planes when switching to 3D', () => {
      useAnimationStore.getState().animateAll(4)
      expect(useAnimationStore.getState().animatingPlanes.has('XW')).toBe(true)

      useAnimationStore.getState().setDimension(3)

      const planes = useAnimationStore.getState().animatingPlanes
      expect(planes.size).toBe(3) // Only XY, XZ, YZ
      expect(planes.has('XW')).toBe(false)
      expect(planes.has('YW')).toBe(false)
      expect(planes.has('ZW')).toBe(false)
    })

    it('should handle switching from 11D to 4D', () => {
      useAnimationStore.getState().animateAll(11)
      expect(useAnimationStore.getState().animatingPlanes.size).toBe((11 * 10) / 2) // 11D has 55 planes

      useAnimationStore.getState().setDimension(4)

      const planes = useAnimationStore.getState().animatingPlanes
      expect(planes.size).toBe((4 * 3) / 2) // 4D has 6 planes
    })

    it('should not affect isPlaying state', () => {
      useAnimationStore.getState().animateAll(10)
      expect(useAnimationStore.getState().isPlaying).toBe(true)

      useAnimationStore.getState().setDimension(4)

      expect(useAnimationStore.getState().isPlaying).toBe(true)
    })
  })
})
