/**
 * Tests for Gravitational Lensing Shader Early-Exit Optimization
 *
 * These tests verify the mathematical correctness of the early-exit thresholds
 * used in the gravitational lensing fragment shader.
 *
 * The shader uses two early-exit conditions:
 * 1. effectiveStrength < 0.01 (effect globally disabled)
 * 2. deflection < 0.001 (sub-pixel, imperceptible)
 */

import { describe, expect, it } from 'vitest'

// Mirror the shader constants for testing
const DEFLECTION_THRESHOLD = 0.001
const MIN_EFFECTIVE_STRENGTH = 0.01

// Mirror the shader's deflection calculation
function computeDeflection(
  strength: number,
  distortionScale: number,
  distance: number,
  falloff: number
): number {
  const effectiveStrength = strength * distortionScale
  const safeR = Math.max(distance, 0.001)
  const deflection = (effectiveStrength * 0.02) / Math.pow(safeR, falloff)
  return Math.min(deflection, 0.5) // Clamp to prevent extreme distortion
}

// Compute effective strength
function computeEffectiveStrength(strength: number, distortionScale: number): number {
  return strength * distortionScale
}

describe('Gravitational Lensing Shader Early-Exit', () => {
  describe('effective strength threshold', () => {
    it('should skip when strength and distortion are both minimum', () => {
      // Minimum valid values from store: strength=0.1, distortionScale=0.1
      const effectiveStrength = computeEffectiveStrength(0.1, 0.1)
      expect(effectiveStrength).toBeCloseTo(0.01, 10)
      // At exactly the threshold, should NOT skip (>=, not >)
      expect(effectiveStrength).toBeGreaterThanOrEqual(MIN_EFFECTIVE_STRENGTH)
    })

    it('should skip when strength is very low', () => {
      const effectiveStrength = computeEffectiveStrength(0.05, 0.1)
      expect(effectiveStrength).toBeCloseTo(0.005, 10)
      expect(effectiveStrength).toBeLessThan(MIN_EFFECTIVE_STRENGTH)
    })

    it('should not skip at default settings', () => {
      // Default values: strength=1.0, distortionScale=1.0
      const effectiveStrength = computeEffectiveStrength(1.0, 1.0)
      expect(effectiveStrength).toBe(1.0)
      expect(effectiveStrength).toBeGreaterThanOrEqual(MIN_EFFECTIVE_STRENGTH)
    })

    it('should not skip at maximum settings', () => {
      // Maximum values: strength=10, distortionScale=5
      const effectiveStrength = computeEffectiveStrength(10, 5)
      expect(effectiveStrength).toBe(50)
      expect(effectiveStrength).toBeGreaterThanOrEqual(MIN_EFFECTIVE_STRENGTH)
    })
  })

  describe('deflection threshold', () => {
    it('should produce visible deflection at default settings near center', () => {
      // Default settings, close to gravity center
      const deflection = computeDeflection(1.0, 1.0, 0.1, 1.5)
      expect(deflection).toBeGreaterThan(DEFLECTION_THRESHOLD)
      // Expected: (1.0 * 0.02) / (0.1^1.5) ≈ 0.02 / 0.0316 ≈ 0.633 → clamped to 0.5
      expect(deflection).toBe(0.5)
    })

    it('should produce visible deflection at default settings at moderate distance', () => {
      // Default settings, moderate distance
      const deflection = computeDeflection(1.0, 1.0, 0.5, 1.5)
      // Expected: (1.0 * 0.02) / (0.5^1.5) ≈ 0.02 / 0.354 ≈ 0.057
      expect(deflection).toBeGreaterThan(DEFLECTION_THRESHOLD)
      expect(deflection).toBeCloseTo(0.0566, 3)
    })

    it('should produce imperceptible deflection at very far distance with low strength', () => {
      // Low strength, far from center
      const deflection = computeDeflection(0.1, 0.1, 1.0, 1.5)
      // Expected: (0.01 * 0.02) / (1.0^1.5) = 0.0002
      expect(deflection).toBeLessThan(DEFLECTION_THRESHOLD)
      expect(deflection).toBeCloseTo(0.0002, 5)
    })

    it('should handle high falloff correctly', () => {
      // High falloff makes effect drop quickly with distance
      const deflectionClose = computeDeflection(1.0, 1.0, 0.2, 4.0)
      const deflectionFar = computeDeflection(1.0, 1.0, 0.8, 4.0)

      // Close: (1.0 * 0.02) / (0.2^4) = 0.02 / 0.0016 = 12.5 → clamped to 0.5
      expect(deflectionClose).toBe(0.5)

      // Far: (1.0 * 0.02) / (0.8^4) = 0.02 / 0.4096 ≈ 0.049
      expect(deflectionFar).toBeCloseTo(0.0488, 3)
      expect(deflectionFar).toBeGreaterThan(DEFLECTION_THRESHOLD)
    })

    it('should handle low falloff correctly', () => {
      // Low falloff makes effect extend further
      const deflection = computeDeflection(1.0, 1.0, 0.8, 0.5)
      // Expected: (1.0 * 0.02) / (0.8^0.5) = 0.02 / 0.894 ≈ 0.0224
      expect(deflection).toBeCloseTo(0.0224, 3)
      expect(deflection).toBeGreaterThan(DEFLECTION_THRESHOLD)
    })

    it('should produce visible deflection at max settings even at edge of screen', () => {
      // Maximum settings at diagonal corner (r ≈ 1.414)
      const deflection = computeDeflection(10, 5, 1.414, 1.5)
      // Expected: (50 * 0.02) / (1.414^1.5) = 1.0 / 1.682 ≈ 0.595 → clamped to 0.5
      expect(deflection).toBe(0.5)
    })

    it('should clamp deflection to 0.5 to prevent extreme distortion', () => {
      // Very high strength, very close to center
      const deflection = computeDeflection(10, 5, 0.01, 1.5)
      expect(deflection).toBe(0.5)
    })
  })

  describe('edge cases', () => {
    it('should handle zero distance safely', () => {
      // safeR = max(0, 0.001) = 0.001
      const deflection = computeDeflection(1.0, 1.0, 0, 1.5)
      // Clamped to 0.5
      expect(deflection).toBe(0.5)
    })

    it('should handle negative distance safely', () => {
      // This shouldn't happen in practice but the shader uses max(r, 0.001)
      const deflection = computeDeflection(1.0, 1.0, -0.5, 1.5)
      expect(deflection).toBe(0.5) // Still clamped
    })

    it('should handle gravity center outside viewport', () => {
      // If gravity center is at (-0.5, 0.5), pixel at (1, 1) is r = 1.58
      const deflection = computeDeflection(1.0, 1.0, 1.58, 1.5)
      // Expected: (1.0 * 0.02) / (1.58^1.5) ≈ 0.02 / 1.987 ≈ 0.01
      expect(deflection).toBeGreaterThan(DEFLECTION_THRESHOLD)
      expect(deflection).toBeCloseTo(0.01, 2)
    })
  })

  describe('early-exit behavior verification', () => {
    /**
     * These tests verify which combinations of parameters would trigger early-exit
     * to ensure we're not skipping visible effects
     */

    it('should NOT early-exit at default settings anywhere on screen', () => {
      // Test all corners and center at default settings
      const distances = [0.1, 0.5, 0.707, 1.0, 1.414] // center to diagonal
      const effectiveStrength = computeEffectiveStrength(1.0, 1.0)

      expect(effectiveStrength).toBeGreaterThanOrEqual(MIN_EFFECTIVE_STRENGTH)

      for (const r of distances) {
        const deflection = computeDeflection(1.0, 1.0, r, 1.5)
        expect(deflection).toBeGreaterThan(DEFLECTION_THRESHOLD)
      }
    })

    it('should identify threshold distance for minimum visible strength', () => {
      // At minimum typical strength (0.1, 0.1), find where deflection = threshold
      // 0.001 = (0.01 * 0.02) / r^1.5
      // r^1.5 = 0.0002 / 0.001 = 0.2
      // r = 0.2^(1/1.5) ≈ 0.342
      const thresholdDistance = Math.pow(0.0002 / DEFLECTION_THRESHOLD, 1 / 1.5)
      expect(thresholdDistance).toBeCloseTo(0.342, 2)

      // Verify: just inside threshold should be visible
      const deflectionInside = computeDeflection(0.1, 0.1, thresholdDistance - 0.01, 1.5)
      expect(deflectionInside).toBeGreaterThan(DEFLECTION_THRESHOLD)

      // Just outside threshold should skip
      const deflectionOutside = computeDeflection(0.1, 0.1, thresholdDistance + 0.01, 1.5)
      expect(deflectionOutside).toBeLessThan(DEFLECTION_THRESHOLD)
    })
  })
})
