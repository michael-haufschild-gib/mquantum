/**
 * Tests for multi-light type definitions and factory functions
 *
 * These tests verify actual behavior and logic, not default values.
 */

import {
  clampConeAngle,
  clampDecay,
  clampIntensity,
  clampPenumbra,
  clampRange,
  cloneLight,
  createNewLight,
  DEFAULT_NEW_LIGHT_POSITIONS,
  directionToRotation,
  normalizeRotation,
  normalizeRotationSigned,
  normalizeRotationTuple,
  normalizeRotationTupleSigned,
  rotationToDirection,
  type LightSource,
} from '@/rendering/lights/types'
import { describe, expect, it } from 'vitest'

describe('Light Types', () => {
  describe('createNewLight', () => {
    it('should generate unique IDs', () => {
      const light1 = createNewLight('point', 0)
      const light2 = createNewLight('point', 0)

      expect(light1.id).not.toBe(light2.id)
    })

    it('should use different positions based on existing count', () => {
      const light0 = createNewLight('point', 0)
      const light1 = createNewLight('point', 1)
      const light2 = createNewLight('point', 2)
      const light3 = createNewLight('point', 3)

      expect(light0.position).toEqual(DEFAULT_NEW_LIGHT_POSITIONS[0])
      expect(light1.position).toEqual(DEFAULT_NEW_LIGHT_POSITIONS[1])
      expect(light2.position).toEqual(DEFAULT_NEW_LIGHT_POSITIONS[2])
      expect(light3.position).toEqual(DEFAULT_NEW_LIGHT_POSITIONS[3])
    })

    it('should handle count beyond available positions', () => {
      const light = createNewLight('point', 10)
      // Should use last position
      expect(light.position).toEqual(DEFAULT_NEW_LIGHT_POSITIONS[3])
    })

    it('should increment name based on existing count', () => {
      const light2 = createNewLight('point', 1)
      const light3 = createNewLight('directional', 2)

      expect(light2.name).toBe('Point Light 2')
      expect(light3.name).toBe('Directional Light 3')
    })

    it('should set spot light rotation to point at origin', () => {
      const light = createNewLight('spot', 0)
      // Position is [5, 5, 5], so direction to origin is normalized [-5, -5, -5]
      // The light should point toward the origin
      const dir = rotationToDirection(light.rotation)

      // Direction should point toward origin (negative of normalized position)
      // Position [5,5,5] -> direction should be roughly [-0.577, -0.577, -0.577]
      expect(dir[0]).toBeCloseTo(-1 / Math.sqrt(3), 3)
      expect(dir[1]).toBeCloseTo(-1 / Math.sqrt(3), 3)
      expect(dir[2]).toBeCloseTo(-1 / Math.sqrt(3), 3)
    })

    it('should set directional light rotation to point at origin', () => {
      const light = createNewLight('directional', 0)
      // Same as spot light - should point toward origin
      const dir = rotationToDirection(light.rotation)

      expect(dir[0]).toBeCloseTo(-1 / Math.sqrt(3), 3)
      expect(dir[1]).toBeCloseTo(-1 / Math.sqrt(3), 3)
      expect(dir[2]).toBeCloseTo(-1 / Math.sqrt(3), 3)
    })

    it('should point spot lights at origin from different positions', () => {
      // Test each default position
      for (let i = 0; i < DEFAULT_NEW_LIGHT_POSITIONS.length; i++) {
        const light = createNewLight('spot', i)
        const pos = light.position
        const dir = rotationToDirection(light.rotation)

        // Direction should be toward origin: normalized(-position)
        const length = Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2)
        const expectedDir = [-pos[0] / length, -pos[1] / length, -pos[2] / length]

        expect(dir[0]).toBeCloseTo(expectedDir[0]!, 3)
        expect(dir[1]).toBeCloseTo(expectedDir[1]!, 3)
        expect(dir[2]).toBeCloseTo(expectedDir[2]!, 3)
      }
    })
  })

  describe('cloneLight', () => {
    it('should create a copy with new ID', () => {
      const original: LightSource = {
        id: 'original-id',
        name: 'Original Light',
        type: 'point',
        enabled: true,
        position: [1, 2, 3],
        rotation: [0.1, 0.2, 0.3],
        color: '#FF0000',
        intensity: 2.0,
        coneAngle: 45,
        penumbra: 0.3,
        range: 0,
        decay: 2,
      }

      const clone = cloneLight(original)

      expect(clone.id).not.toBe(original.id)
      expect(clone.id).toMatch(/^light-\d+-/)
    })

    it('should append (Copy) to name', () => {
      const original: LightSource = {
        id: 'test',
        name: 'Test Light',
        type: 'point',
        enabled: true,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        color: '#FFFFFF',
        intensity: 1.0,
        coneAngle: 30,
        penumbra: 0.5,
        range: 0,
        decay: 2,
      }

      const clone = cloneLight(original)

      expect(clone.name).toBe('Test Light (Copy)')
    })

    it('should offset position by 1 on X axis', () => {
      const original: LightSource = {
        id: 'test',
        name: 'Test',
        type: 'point',
        enabled: true,
        position: [5, 10, 15],
        rotation: [0, 0, 0],
        color: '#FFFFFF',
        intensity: 1.0,
        coneAngle: 30,
        penumbra: 0.5,
        range: 0,
        decay: 2,
      }

      const clone = cloneLight(original)

      expect(clone.position).toEqual([6, 10, 15])
    })

    it('should copy all other properties unchanged', () => {
      const original: LightSource = {
        id: 'test',
        name: 'Test',
        type: 'spot',
        enabled: false,
        position: [0, 0, 0],
        rotation: [1, 2, 3],
        color: '#00FF00',
        intensity: 2.5,
        coneAngle: 60,
        penumbra: 0.8,
        range: 10,
        decay: 1,
      }

      const clone = cloneLight(original)

      expect(clone.type).toBe('spot')
      expect(clone.enabled).toBe(false)
      expect(clone.rotation).toEqual([1, 2, 3])
      expect(clone.color).toBe('#00FF00')
      expect(clone.intensity).toBe(2.5)
      expect(clone.coneAngle).toBe(60)
      expect(clone.penumbra).toBe(0.8)
    })
  })

  describe('rotationToDirection', () => {
    it('should return forward direction for zero rotation', () => {
      const dir = rotationToDirection([0, 0, 0])

      // Forward is -Z
      expect(dir[0]).toBeCloseTo(0, 5)
      expect(dir[1]).toBeCloseTo(0, 5)
      expect(dir[2]).toBeCloseTo(-1, 5)
    })

    it('should handle Y rotation (yaw)', () => {
      // 90 degree Y rotation should point in -X direction
      const dir = rotationToDirection([0, Math.PI / 2, 0])

      expect(dir[0]).toBeCloseTo(-1, 5)
      expect(dir[1]).toBeCloseTo(0, 5)
      expect(dir[2]).toBeCloseTo(0, 1)
    })

    it('should handle X rotation (pitch)', () => {
      // 90 degree X rotation should point up
      const dir = rotationToDirection([Math.PI / 2, 0, 0])

      expect(dir[0]).toBeCloseTo(0, 5)
      expect(dir[1]).toBeCloseTo(1, 5)
      expect(dir[2]).toBeCloseTo(0, 1)
    })

    it('should return normalized vector', () => {
      const dir = rotationToDirection([0.5, 0.5, 0.5])
      const length = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2)

      expect(length).toBeCloseTo(1, 5)
    })
  })

  describe('directionToRotation', () => {
    it('should return zero rotation for forward direction (-Z)', () => {
      const rot = directionToRotation([0, 0, -1])

      expect(rot[0]).toBeCloseTo(0, 5) // pitch
      expect(rot[1]).toBeCloseTo(0, 5) // yaw
      expect(rot[2]).toBe(0) // roll always 0
    })

    it('should return correct rotation for -X direction', () => {
      // Looking left (-X) should be 90 degree Y rotation
      const rot = directionToRotation([-1, 0, 0])

      expect(rot[0]).toBeCloseTo(0, 5) // no pitch
      expect(rot[1]).toBeCloseTo(Math.PI / 2, 5) // 90 deg yaw
      expect(rot[2]).toBe(0)
    })

    it('should return correct rotation for +X direction', () => {
      // Looking right (+X) should be -90 degree Y rotation
      const rot = directionToRotation([1, 0, 0])

      expect(rot[0]).toBeCloseTo(0, 5) // no pitch
      expect(rot[1]).toBeCloseTo(-Math.PI / 2, 5) // -90 deg yaw
      expect(rot[2]).toBe(0)
    })

    it('should return correct rotation for upward direction', () => {
      // Looking up should be 90 degree X rotation (pitch)
      const rot = directionToRotation([0, 1, 0])

      expect(rot[0]).toBeCloseTo(Math.PI / 2, 5) // 90 deg pitch
      expect(rot[2]).toBe(0)
    })

    it('should return correct rotation for downward direction', () => {
      // Looking down should be -90 degree X rotation (pitch)
      const rot = directionToRotation([0, -1, 0])

      expect(rot[0]).toBeCloseTo(-Math.PI / 2, 5) // -90 deg pitch
      expect(rot[2]).toBe(0)
    })

    it('should be inverse of rotationToDirection', () => {
      // Test various rotations - direction -> rotation should recover original
      const testRotations: [number, number, number][] = [
        [0, 0, 0],
        [0.3, 0.5, 0],
        [-0.5, 0.8, 0],
        [0.2, -0.7, 0],
        [Math.PI / 4, Math.PI / 3, 0],
      ]

      for (const rot of testRotations) {
        const dir = rotationToDirection(rot)
        const recovered = directionToRotation(dir)

        expect(recovered[0]).toBeCloseTo(rot[0], 4)
        expect(recovered[1]).toBeCloseTo(rot[1], 4)
        expect(recovered[2]).toBe(0)
      }
    })

    it('should clamp extreme Y values to prevent NaN', () => {
      // Y values > 1 or < -1 would cause asin to return NaN without clamping
      const upExtreme = directionToRotation([0, 2, 0])
      const downExtreme = directionToRotation([0, -2, 0])

      expect(Number.isNaN(upExtreme[0])).toBe(false)
      expect(Number.isNaN(downExtreme[0])).toBe(false)
      expect(upExtreme[0]).toBeCloseTo(Math.PI / 2, 5)
      expect(downExtreme[0]).toBeCloseTo(-Math.PI / 2, 5)
    })
  })

  describe('validation functions', () => {
    describe('clampIntensity', () => {
      it('should clamp values to valid range', () => {
        expect(clampIntensity(-1)).toBe(0.1)
        expect(clampIntensity(0)).toBe(0.1)
        expect(clampIntensity(1.5)).toBe(1.5)
        expect(clampIntensity(5)).toBe(3)
      })

      it('should return minimum for non-finite values', () => {
        expect(clampIntensity(Number.NaN)).toBe(0.1)
        expect(clampIntensity(Number.POSITIVE_INFINITY)).toBe(0.1)
        expect(clampIntensity(Number.NEGATIVE_INFINITY)).toBe(0.1)
      })
    })

    describe('clampConeAngle', () => {
      it('should clamp values to valid range', () => {
        expect(clampConeAngle(-10)).toBe(1)
        expect(clampConeAngle(45)).toBe(45)
        expect(clampConeAngle(180)).toBe(120)
      })

      it('should return minimum for non-finite values', () => {
        expect(clampConeAngle(Number.NaN)).toBe(1)
        expect(clampConeAngle(Number.POSITIVE_INFINITY)).toBe(1)
        expect(clampConeAngle(Number.NEGATIVE_INFINITY)).toBe(1)
      })
    })

    describe('clampPenumbra', () => {
      it('should clamp values to valid range', () => {
        expect(clampPenumbra(-0.5)).toBe(0)
        expect(clampPenumbra(0.5)).toBe(0.5)
        expect(clampPenumbra(2)).toBe(1)
      })

      it('should return minimum for non-finite values', () => {
        expect(clampPenumbra(Number.NaN)).toBe(0)
        expect(clampPenumbra(Number.POSITIVE_INFINITY)).toBe(0)
        expect(clampPenumbra(Number.NEGATIVE_INFINITY)).toBe(0)
      })
    })

    describe('clampRange', () => {
      it('should clamp values to valid range', () => {
        expect(clampRange(-10)).toBe(1)
        expect(clampRange(50)).toBe(50)
        expect(clampRange(150)).toBe(100)
      })
    })

    describe('clampDecay', () => {
      it('should clamp values to valid range', () => {
        expect(clampDecay(-1)).toBe(0.1)
        expect(clampDecay(1.5)).toBe(1.5)
        expect(clampDecay(5)).toBe(3)
      })
    })

    describe('normalizeRotation', () => {
      const TWO_PI = Math.PI * 2

      it('should normalize negative angles to [0, 2pi)', () => {
        expect(normalizeRotation(-Math.PI)).toBeCloseTo(Math.PI, 10)
        expect(normalizeRotation(-TWO_PI)).toBeCloseTo(0, 10)
      })

      it('should normalize angles >= 2pi to [0, 2pi)', () => {
        expect(normalizeRotation(TWO_PI)).toBeCloseTo(0, 10)
        expect(normalizeRotation(TWO_PI + 0.1)).toBeCloseTo(0.1, 10)
      })

      it('should handle large angles', () => {
        const result = normalizeRotation(-TWO_PI * 10 + 1)
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThan(TWO_PI)
        expect(result).toBeCloseTo(1, 10)
      })
    })

    describe('normalizeRotationTuple', () => {
      const TWO_PI = Math.PI * 2

      it('should normalize each component independently', () => {
        const result = normalizeRotationTuple([-Math.PI, -0.5, TWO_PI + 0.1])
        expect(result[0]).toBeCloseTo(Math.PI, 10)
        expect(result[1]).toBeCloseTo(TWO_PI - 0.5, 10)
        expect(result[2]).toBeCloseTo(0.1, 10)
      })
    })

    describe('normalizeRotationSigned', () => {
      const TWO_PI = Math.PI * 2

      it('should normalize values >= pi to [-pi, pi)', () => {
        expect(normalizeRotationSigned(Math.PI)).toBeCloseTo(-Math.PI, 10)
        expect(normalizeRotationSigned(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1, 10)
      })

      it('should normalize values < -pi to [-pi, pi)', () => {
        expect(normalizeRotationSigned(-Math.PI - 0.1)).toBeCloseTo(Math.PI - 0.1, 10)
        expect(normalizeRotationSigned(-TWO_PI + 0.1)).toBeCloseTo(0.1, 10)
      })

      it('should preserve direction math - rotationToDirection should give same result', () => {
        const testAngles = [
          -Math.PI / 4,
          Math.PI / 4,
          -Math.PI / 2,
          (3 * Math.PI) / 4,
          (-3 * Math.PI) / 4,
        ]
        for (const angle of testAngles) {
          const rotation: [number, number, number] = [angle, 0, 0]
          const normalizedRotation: [number, number, number] = [
            normalizeRotationSigned(angle),
            0,
            0,
          ]
          const dir1 = rotationToDirection(rotation)
          const dir2 = rotationToDirection(normalizedRotation)
          expect(dir1[0]).toBeCloseTo(dir2[0], 5)
          expect(dir1[1]).toBeCloseTo(dir2[1], 5)
          expect(dir1[2]).toBeCloseTo(dir2[2], 5)
        }
      })

      it('should return 0 for non-finite values', () => {
        expect(normalizeRotationSigned(Number.NaN)).toBe(0)
        expect(normalizeRotationSigned(Number.POSITIVE_INFINITY)).toBe(0)
        expect(normalizeRotationSigned(Number.NEGATIVE_INFINITY)).toBe(0)
      })
    })

    describe('normalizeRotationTupleSigned', () => {
      it('should normalize each component to [-pi, pi) independently', () => {
        const result = normalizeRotationTupleSigned([Math.PI + 0.1, -Math.PI - 0.1, 0])
        expect(result[0]).toBeCloseTo(-Math.PI + 0.1, 10)
        expect(result[1]).toBeCloseTo(Math.PI - 0.1, 10)
        expect(result[2]).toBe(0)
      })

      it('should preserve directionToRotation output range', () => {
        const testDirections: [number, number, number][] = [
          [0, 0, -1], // forward
          [0, -1, 0], // down
          [1, 0, 0], // right
          [-1, 0, 0], // left
        ]
        for (const dir of testDirections) {
          const rotation = directionToRotation(dir)
          const normalizedRotation = normalizeRotationTupleSigned(rotation)
          expect(normalizedRotation[0]).toBeCloseTo(rotation[0], 5)
          expect(normalizedRotation[1]).toBeCloseTo(rotation[1], 5)
          expect(normalizedRotation[2]).toBe(0)
        }
      })
    })
  })
})
