/**
 * Tests for color algorithm availability filtering
 *
 * Verifies that color algorithms are correctly filtered based on object type:
 * - Quantum-only algorithms: Only available for Schroedinger
 * - Blackhole-only algorithms: Only available for Blackhole
 * - Geometric phase algorithms: Available for all EXCEPT blackhole
 * - General algorithms: Available for all object types
 */

import { describe, it, expect } from 'vitest'
import {
  isColorAlgorithmAvailable,
  isQuantumOnlyAlgorithm,
  isBlackHoleOnlyAlgorithm,
  isGeometricPhaseAlgorithm,
  isPolytopeOnlyAlgorithm,
  QUANTUM_ONLY_ALGORITHMS,
  BLACKHOLE_ONLY_ALGORITHMS,
  GEOMETRIC_PHASE_ALGORITHMS,
  POLYTOPE_ONLY_ALGORITHMS,
  type ColorAlgorithm,
} from '@/rendering/shaders/palette/types'
import type { ObjectType } from '@/lib/geometry/types'

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

    it('should classify accretionGradient and gravitationalRedshift as blackhole-only', () => {
      expect(BLACKHOLE_ONLY_ALGORITHMS).toContain('accretionGradient')
      expect(BLACKHOLE_ONLY_ALGORITHMS).toContain('gravitationalRedshift')
      expect(isBlackHoleOnlyAlgorithm('accretionGradient')).toBe(true)
      expect(isBlackHoleOnlyAlgorithm('gravitationalRedshift')).toBe(true)
    })

    it('should classify dimension as polytope-only', () => {
      expect(POLYTOPE_ONLY_ALGORITHMS).toContain('dimension')
      expect(isPolytopeOnlyAlgorithm('dimension')).toBe(true)
    })
  })

  describe('isColorAlgorithmAvailable', () => {
    const objectTypes: ObjectType[] = [
      'hypercube',
      'simplex',
      'mandelbulb',
      'schroedinger',
      'blackhole',
      'clifford-torus',
    ]

    describe('geometric phase algorithms (phase, mixed)', () => {
      const geometricAlgorithms: ColorAlgorithm[] = ['phase', 'mixed']

      it('should NOT be available for blackhole', () => {
        for (const algo of geometricAlgorithms) {
          expect(isColorAlgorithmAvailable(algo, 'blackhole')).toBe(false)
        }
      })

      it('should be available for all non-blackhole object types', () => {
        const nonBlackholeTypes = objectTypes.filter((t) => t !== 'blackhole')

        for (const algo of geometricAlgorithms) {
          for (const objectType of nonBlackholeTypes) {
            expect(
              isColorAlgorithmAvailable(algo, objectType),
              `${algo} should be available for ${objectType}`
            ).toBe(true)
          }
        }
      })
    })

    describe('blackhole-only algorithms', () => {
      const blackholeAlgorithms: ColorAlgorithm[] = ['accretionGradient', 'gravitationalRedshift']

      it('should only be available for blackhole', () => {
        for (const algo of blackholeAlgorithms) {
          expect(isColorAlgorithmAvailable(algo, 'blackhole')).toBe(true)
        }
      })

      it('should NOT be available for non-blackhole types', () => {
        const nonBlackholeTypes = objectTypes.filter((t) => t !== 'blackhole')

        for (const algo of blackholeAlgorithms) {
          for (const objectType of nonBlackholeTypes) {
            expect(
              isColorAlgorithmAvailable(algo, objectType),
              `${algo} should NOT be available for ${objectType}`
            ).toBe(false)
          }
        }
      })
    })

    describe('blackbody algorithm', () => {
      it('should be available for schroedinger and blackhole only', () => {
        expect(isColorAlgorithmAvailable('blackbody', 'schroedinger')).toBe(true)
        expect(isColorAlgorithmAvailable('blackbody', 'blackhole')).toBe(true)
      })

      it('should NOT be available for other object types', () => {
        const otherTypes = objectTypes.filter((t) => t !== 'schroedinger' && t !== 'blackhole')

        for (const objectType of otherTypes) {
          expect(
            isColorAlgorithmAvailable('blackbody', objectType),
            `blackbody should NOT be available for ${objectType}`
          ).toBe(false)
        }
      })
    })

    describe('polytope-only algorithms', () => {
      const polytopeAlgorithms: ColorAlgorithm[] = ['dimension']
      const polytopeTypes: ObjectType[] = [
        'hypercube',
        'simplex',
        'cross-polytope',
        'wythoff-polytope',
      ]

      it('should be available for polytope types', () => {
        for (const algo of polytopeAlgorithms) {
          for (const objectType of polytopeTypes) {
            expect(
              isColorAlgorithmAvailable(algo, objectType),
              `${algo} should be available for ${objectType}`
            ).toBe(true)
          }
        }
      })

      it('should NOT be available for non-polytope types', () => {
        const nonPolytopeTypes: ObjectType[] = [
          'mandelbulb',
          'schroedinger',
          'blackhole',
          'clifford-torus',
        ]

        for (const algo of polytopeAlgorithms) {
          for (const objectType of nonPolytopeTypes) {
            expect(
              isColorAlgorithmAvailable(algo, objectType),
              `${algo} should NOT be available for ${objectType}`
            ).toBe(false)
          }
        }
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

      it('should be available for all object types', () => {
        for (const algo of generalAlgorithms) {
          for (const objectType of objectTypes) {
            expect(
              isColorAlgorithmAvailable(algo, objectType),
              `${algo} should be available for ${objectType}`
            ).toBe(true)
          }
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
})
