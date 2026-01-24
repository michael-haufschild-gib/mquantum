/**
 * Object Type Registry Tests
 *
 * Tests for the centralized object type registry and helper functions.
 */

import { describe, it, expect } from 'vitest'
import {
  // Registry data
  getAllObjectTypes,
  // Core lookups
  getObjectTypeEntry,
  // Rendering capabilities
  canRenderFaces,
  canRenderEdges,
  isRaymarchingType,
  isRaymarchingFractal,
  getFaceDetectionMethod,
  determineRenderMode,
  // Dimension constraints
  getDimensionConstraints,
  isAvailableForDimension,
  getAvailableTypesForDimension,
  getRecommendedDimension,
  // Animation
  getAnimationCapabilities,
  hasTypeSpecificAnimations,
  getAvailableAnimationSystems,
  // UI
  getControlsComponentKey,
  hasTimelineControls,
  // Validation
  getValidObjectTypes,
  isValidObjectType,
  getTypeName,
  getTypeDescription,
} from '@/lib/geometry/registry'

describe('Object Type Registry', () => {
  describe('Registry Structure', () => {
    it('contains all 11 object types', () => {
      const types = getAllObjectTypes()
      expect(types).toHaveLength(11)
      expect(types).toContain('hypercube')
      expect(types).toContain('simplex')
      expect(types).toContain('cross-polytope')
      expect(types).toContain('root-system')
      expect(types).toContain('clifford-torus')
      expect(types).toContain('nested-torus')
      expect(types).toContain('mandelbulb')
      expect(types).toContain('quaternion-julia')
      expect(types).toContain('schroedinger')
      expect(types).toContain('blackhole')
    })

    it('returns valid entry for each object type', () => {
      const types = getAllObjectTypes()
      for (const type of types) {
        const entry = getObjectTypeEntry(type)
        expect(entry).toBeDefined()
        expect(entry?.type).toBe(type)
        expect(entry?.name).toBeTruthy()
        expect(entry?.description).toBeTruthy()
      }
    })

    it('returns undefined for invalid object type', () => {
      const entry = getObjectTypeEntry('invalid-type' as never)
      expect(entry).toBeUndefined()
    })
  })

  describe('Rendering Capabilities', () => {
    it('polytopes support faces and edges', () => {
      expect(canRenderFaces('hypercube')).toBe(true)
      expect(canRenderFaces('simplex')).toBe(true)
      expect(canRenderFaces('cross-polytope')).toBe(true)
      expect(canRenderEdges('hypercube')).toBe(true)
    })

    it('raymarched fractals support faces via raymarching', () => {
      expect(canRenderFaces('mandelbulb')).toBe(true)
      expect(canRenderFaces('quaternion-julia')).toBe(true)
    })

    it('isRaymarchingType identifies raymarched types', () => {
      expect(isRaymarchingType('mandelbulb')).toBe(true)
      expect(isRaymarchingType('quaternion-julia')).toBe(true)
      expect(isRaymarchingType('hypercube')).toBe(false)
      expect(isRaymarchingType('root-system')).toBe(false)
    })

    it('isRaymarchingFractal checks dimension', () => {
      expect(isRaymarchingFractal('mandelbulb', 3)).toBe(true)
      expect(isRaymarchingFractal('mandelbulb', 4)).toBe(true)
      expect(isRaymarchingFractal('hypercube', 4)).toBe(false)
    })

    it('returns correct face detection method', () => {
      expect(getFaceDetectionMethod('hypercube')).toBe('analytical-quad')
      expect(getFaceDetectionMethod('simplex')).toBe('triangles')
      expect(getFaceDetectionMethod('root-system')).toBe('metadata') // Pre-computed faces from 3-cycle detection
      expect(getFaceDetectionMethod('clifford-torus')).toBe('grid')
      expect(getFaceDetectionMethod('mandelbulb')).toBe('none')
    })

    it('determineRenderMode returns correct mode', () => {
      expect(determineRenderMode('hypercube', 4, true)).toBe('polytope')
      expect(determineRenderMode('mandelbulb', 4, true)).toBe('raymarch-mandelbulb')
      expect(determineRenderMode('quaternion-julia', 4, true)).toBe('raymarch-quaternion-julia')
      expect(determineRenderMode('quaternion-julia', 4, false)).toBe('none')
    })
  })

  describe('Dimension Constraints', () => {
    it('returns dimension constraints for each type', () => {
      const cubeConstraints = getDimensionConstraints('hypercube')
      expect(cubeConstraints?.min).toBe(3)
      expect(cubeConstraints?.max).toBe(11)

      const juliaConstraints = getDimensionConstraints('quaternion-julia')
      expect(juliaConstraints?.min).toBe(3)
      expect(juliaConstraints?.recommended).toBe(4)
    })

    it('isAvailableForDimension checks constraints', () => {
      expect(isAvailableForDimension('hypercube', 3)).toBe(true)
      expect(isAvailableForDimension('hypercube', 11)).toBe(true)
      expect(isAvailableForDimension('nested-torus', 3)).toBe(false)
      expect(isAvailableForDimension('nested-torus', 4)).toBe(true)
    })

    it('getAvailableTypesForDimension returns filtered list', () => {
      const typesAt4D = getAvailableTypesForDimension(4)
      expect(typesAt4D.length).toBeGreaterThan(0)
      expect(typesAt4D.find((t) => t.type === 'nested-torus')?.available).toBe(true)
    })

    it('getRecommendedDimension returns value for fractal types', () => {
      expect(getRecommendedDimension('quaternion-julia')).toBe(4)
      expect(getRecommendedDimension('mandelbulb')).toBe(4)
      expect(getRecommendedDimension('hypercube')).toBeUndefined()
    })
  })

  describe('Animation Capabilities', () => {
    it('hasTypeSpecificAnimations returns true for fractals with animations', () => {
      expect(hasTypeSpecificAnimations('mandelbulb')).toBe(true)
      // NOTE: quaternion-julia has no type-specific animations
      // Smooth shape morphing is achieved via 4D+ rotation
      expect(hasTypeSpecificAnimations('quaternion-julia')).toBe(false)
      expect(hasTypeSpecificAnimations('hypercube')).toBe(false)
    })

    it('getAnimationCapabilities returns animation config', () => {
      const mandelbulbAnim = getAnimationCapabilities('mandelbulb')
      expect(mandelbulbAnim?.hasTypeSpecificAnimations).toBe(true)
      expect(Object.keys(mandelbulbAnim?.systems ?? {})).toContain('powerAnimation')
    })

    it('getAvailableAnimationSystems filters by dimension', () => {
      const systems4D = getAvailableAnimationSystems('mandelbulb', 4)
      expect(Object.keys(systems4D)).toContain('sliceAnimation')

      const systems3D = getAvailableAnimationSystems('mandelbulb', 3)
      expect(Object.keys(systems3D)).not.toContain('sliceAnimation')
    })
  })

  describe('UI Components', () => {
    it('returns controls component key for each type', () => {
      expect(getControlsComponentKey('hypercube')).toBe('PolytopeSettings')
      expect(getControlsComponentKey('mandelbulb')).toBe('MandelbulbControls')
      expect(getControlsComponentKey('quaternion-julia')).toBe('QuaternionJuliaControls')
    })

    it('hasTimelineControls returns true for types with animations', () => {
      // Fractals with type-specific animations have timeline controls
      expect(hasTimelineControls('mandelbulb')).toBe(true)
      // NOTE: quaternion-julia has no type-specific animations
      // Smooth shape morphing is achieved via 4D+ rotation
      expect(hasTimelineControls('quaternion-julia')).toBe(false)
      expect(hasTimelineControls('schroedinger')).toBe(true)
      expect(hasTimelineControls('blackhole')).toBe(true)
      // Polytopes no longer have timeline controls (modulation removed)
      expect(hasTimelineControls('hypercube')).toBe(false)
      expect(hasTimelineControls('simplex')).toBe(false)
      expect(hasTimelineControls('cross-polytope')).toBe(false)
      expect(hasTimelineControls('wythoff-polytope')).toBe(false)
      // Extended objects without animations
      expect(hasTimelineControls('clifford-torus')).toBe(false)
      expect(hasTimelineControls('nested-torus')).toBe(false)
      expect(hasTimelineControls('root-system')).toBe(false)
    })
  })

  describe('Validation', () => {
    it('getValidObjectTypes returns all types', () => {
      const validTypes = getValidObjectTypes()
      expect(validTypes).toHaveLength(11)
    })

    it('isValidObjectType validates correctly', () => {
      expect(isValidObjectType('hypercube')).toBe(true)
      expect(isValidObjectType('mandelbulb')).toBe(true)
      expect(isValidObjectType('invalid')).toBe(false)
      expect(isValidObjectType('')).toBe(false)
    })

    it('getTypeName returns display name', () => {
      expect(getTypeName('hypercube')).toBe('Hypercube')
      expect(getTypeName('cross-polytope')).toBe('Cross-Polytope')
      expect(getTypeName('quaternion-julia')).toBe('Quaternion Julia')
    })

    it('getTypeDescription returns description', () => {
      const desc = getTypeDescription('hypercube')
      expect(desc).toBeTruthy()
      expect(typeof desc).toBe('string')
    })
  })
})
