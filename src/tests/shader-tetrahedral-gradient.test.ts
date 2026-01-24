/**
 * Tests for Tetrahedral Gradient Sampling in Schrödinger Shader
 *
 * Verifies that the tetrahedral gradient sampling is properly included
 * in the composed shader and replaces the old gradient functions.
 */

import { describe, it, expect } from 'vitest'
import { composeSchroedingerShader } from '../rendering/shaders/schroedinger/compose'

describe('Tetrahedral Gradient Sampling', () => {
  const baseConfig = {
    dimension: 4,
    shadows: false,
    temporal: false,
    ambientOcclusion: false,
    overrides: [] as string[],
  }

  describe('Shader includes tetrahedral gradient functions', () => {
    it('should include tetrahedral stencil constants', () => {
      const result = composeSchroedingerShader(baseConfig)

      // Check for tetrahedral vertex constants
      expect(result.glsl).toContain('const vec3 TETRA_V0')
      expect(result.glsl).toContain('const vec3 TETRA_V1')
      expect(result.glsl).toContain('const vec3 TETRA_V2')
      expect(result.glsl).toContain('const vec3 TETRA_V3')
    })

    it('should include TetraSample struct', () => {
      const result = composeSchroedingerShader(baseConfig)

      expect(result.glsl).toContain('struct TetraSample')
      expect(result.glsl).toContain('float rho;')
      expect(result.glsl).toContain('vec3 gradient;')
    })

    it('should include sampleWithTetrahedralGradient function', () => {
      const result = composeSchroedingerShader(baseConfig)

      expect(result.glsl).toContain(
        'TetraSample sampleWithTetrahedralGradient(vec3 pos, float t, float delta)'
      )
    })

    it('should include computeGradientTetrahedral function', () => {
      const result = composeSchroedingerShader(baseConfig)

      expect(result.glsl).toContain(
        'vec3 computeGradientTetrahedral(vec3 pos, float t, float delta)'
      )
    })
  })

  describe('Shader uses tetrahedral gradient in raymarch loops', () => {
    it('should use TetraSample in volumeRaymarch', () => {
      const result = composeSchroedingerShader(baseConfig)

      // Check that volumeRaymarch uses the tetrahedral sampling
      expect(result.glsl).toContain('TetraSample tetra = sampleWithTetrahedralGradient')
    })

    it('should NOT contain old computeDensityGradientFast function', () => {
      const result = composeSchroedingerShader(baseConfig)

      // The old function should be removed
      expect(result.glsl).not.toContain('computeDensityGradientFast')
    })

    it('should NOT contain old computeDensityGradient function', () => {
      const result = composeSchroedingerShader(baseConfig)

      // The old 6-sample central differences function should be removed
      expect(result.glsl).not.toContain('vec3 computeDensityGradient(vec3 pos')
    })
  })

  describe('Shader uses tetrahedral gradient for surface normals', () => {
    it('should use computeGradientTetrahedral for normals', () => {
      const result = composeSchroedingerShader(baseConfig)

      // Check that the shader uses tetrahedral gradient for normal computation
      expect(result.glsl).toContain('computeGradientTetrahedral')
    })
  })

  describe('Tetrahedral stencil mathematical properties', () => {
    // These tests verify the mathematical correctness of the tetrahedral stencil
    // The vertices should form a regular tetrahedron centered at origin

    it('should use correct normalization factor (1/sqrt(3))', () => {
      const result = composeSchroedingerShader(baseConfig)

      // 1/sqrt(3) ≈ 0.5773503
      expect(result.glsl).toContain('0.5773503')
    })

    it('should use correct gradient scale factor (0.75/delta)', () => {
      const result = composeSchroedingerShader(baseConfig)

      // Scale factor for tetrahedral gradient: 3/(4*delta) = 0.75/delta
      expect(result.glsl).toContain('0.75 / delta')
    })

    it('should average 4 samples for density approximation', () => {
      const result = composeSchroedingerShader(baseConfig)

      // Should contain the averaging operation
      expect(result.glsl).toContain('* 0.25')
    })
  })

  describe('Dispersion compatibility', () => {
    it('should work with dispersion enabled', () => {
      const result = composeSchroedingerShader({
        ...baseConfig,
        dispersion: true,
      })

      // Should include both tetrahedral gradient and dispersion
      expect(result.glsl).toContain('TetraSample tetra')
      expect(result.glsl).toContain('#define USE_DISPERSION')
    })

    it('should still use gradient for dispersion extrapolation', () => {
      const result = composeSchroedingerShader({
        ...baseConfig,
        dispersion: true,
      })

      // The dispersion code should reference gradient for extrapolation
      expect(result.glsl).toContain('dot(gradient, dispOffset')
    })
  })
})
