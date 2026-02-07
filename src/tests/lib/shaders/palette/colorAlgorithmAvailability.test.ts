/**
 * Tests for color algorithm availability filtering
 *
 * Verifies that color algorithms are correctly filtered based on object type.
 * After cleanup, only 'schroedinger' object type remains.
 * - Quantum-only algorithms: Empty (phase uses geometric data)
 * - Blackhole-only algorithms: Empty (blackhole removed)
 * - Geometric phase algorithms: Available for all types
 * - General algorithms: Available for all object types
 */

import { describe, it, expect } from 'vitest'
import {
  isColorAlgorithmAvailable,
  isQuantumOnlyAlgorithm,
  isGeometricPhaseAlgorithm,
  isPolytopeOnlyAlgorithm,
  QUANTUM_ONLY_ALGORITHMS,
  GEOMETRIC_PHASE_ALGORITHMS,
  POLYTOPE_ONLY_ALGORITHMS,
  type ColorAlgorithm,
} from '@/rendering/shaders/palette/types'

describe('Color Algorithm Availability', () => {
  describe('algorithm classification', () => {
    it('should have no quantum-only algorithms (phase uses geometric data)', () => {
      // Phase and mixed were incorrectly classified as quantum-only
      // They actually use geometric position (atan of x,z), not quantum wavefunction
      expect(QUANTUM_ONLY_ALGORITHMS).toHaveLength(0)
    })

    it('should classify phase and mixed as geometric phase algorithms', () => {
      expect(GEOMETRIC_PHASE_ALGORITHMS).toContain('phase')
      expect(GEOMETRIC_PHASE_ALGORITHMS).toContain('mixed')
      expect(isGeometricPhaseAlgorithm('phase')).toBe(true)
      expect(isGeometricPhaseAlgorithm('mixed')).toBe(true)
    })

    it('should have no polytope-only algorithms', () => {
      expect(POLYTOPE_ONLY_ALGORITHMS).toHaveLength(0)
    })
  })

  describe('isColorAlgorithmAvailable', () => {
    describe('geometric phase algorithms (phase, mixed)', () => {
      const geometricAlgorithms: ColorAlgorithm[] = ['phase', 'mixed']

      it('should be available for schroedinger', () => {
        for (const algo of geometricAlgorithms) {
          expect(
            isColorAlgorithmAvailable(algo, 'schroedinger'),
            `${algo} should be available for schroedinger`
          ).toBe(true)
        }
      })
    })

    describe('blackbody algorithm', () => {
      it('should be available for schroedinger', () => {
        expect(isColorAlgorithmAvailable('blackbody', 'schroedinger')).toBe(true)
      })
    })

    describe('general algorithms', () => {
      const generalAlgorithms: ColorAlgorithm[] = [
        'monochromatic',
        'analogous',
        'cosine',
        'normal',
        'distance',
        'lch',
        'multiSource',
        'radial',
      ]

      it('should be available for schroedinger', () => {
        for (const algo of generalAlgorithms) {
          expect(
            isColorAlgorithmAvailable(algo, 'schroedinger'),
            `${algo} should be available for schroedinger`
          ).toBe(true)
        }
      })
    })
  })

  describe('isQuantumOnlyAlgorithm', () => {
    it('should return false for phase (uses geometric position, not quantum data)', () => {
      expect(isQuantumOnlyAlgorithm('phase')).toBe(false)
    })

    it('should return false for mixed (uses geometric position, not quantum data)', () => {
      expect(isQuantumOnlyAlgorithm('mixed')).toBe(false)
    })

    it('should return false for general algorithms', () => {
      expect(isQuantumOnlyAlgorithm('monochromatic')).toBe(false)
      expect(isQuantumOnlyAlgorithm('cosine')).toBe(false)
    })
  })

  describe('isPolytopeOnlyAlgorithm', () => {
    it('should return false for all algorithms (no polytope-only algorithms remain)', () => {
      expect(isPolytopeOnlyAlgorithm('monochromatic')).toBe(false)
      expect(isPolytopeOnlyAlgorithm('cosine')).toBe(false)
    })
  })
})
