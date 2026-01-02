/**
 * Tests for fractal shader optimizations (OPT-FR-1, OPT-FR-6)
 *
 * These tests verify:
 * - OPT-FR-1: Tetrahedron normal calculation is included and properly structured
 * - OPT-FR-6: Quaternion power fast paths exist for n=2,3,4,5,6,7,8
 */

import { describe, it, expect } from 'vitest'
import { normalBlock } from '@/rendering/shaders/shared/raymarch/normal.glsl'
import { quaternionBlock } from '@/rendering/shaders/julia/quaternion.glsl'

describe('Fractal Shader Optimizations', () => {
  describe('OPT-FR-1: Tetrahedron Normal Calculation', () => {
    it('should include GetNormalTetra function', () => {
      expect(normalBlock).toContain('vec3 GetNormalTetra(vec3 p)')
    })

    it('should define tetrahedron vertices k0, k1, k2, k3', () => {
      expect(normalBlock).toContain('const vec3 k0 = vec3( 1.0, -1.0, -1.0)')
      expect(normalBlock).toContain('const vec3 k1 = vec3(-1.0, -1.0,  1.0)')
      expect(normalBlock).toContain('const vec3 k2 = vec3(-1.0,  1.0, -1.0)')
      expect(normalBlock).toContain('const vec3 k3 = vec3( 1.0,  1.0,  1.0)')
    })

    it('should use weighted sum of tetrahedron samples', () => {
      // The tetrahedron method computes: k0*SDF(p+h*k0) + k1*SDF(p+h*k1) + ...
      expect(normalBlock).toContain('k0 * GetDist(p + h * k0)')
      expect(normalBlock).toContain('k1 * GetDist(p + h * k1)')
      expect(normalBlock).toContain('k2 * GetDist(p + h * k2)')
      expect(normalBlock).toContain('k3 * GetDist(p + h * k3)')
    })

    it('should include guard against zero-length normal', () => {
      // All normal functions should guard against zero-length using lenSq check
      // OPT-H9: Uses inversesqrt pattern with lenSq > 1e-8
      const zeroGuardPattern = /lenSq > 1e-8/g
      const matches = normalBlock.match(zeroGuardPattern)
      expect(matches).not.toBeNull()
      expect(matches!.length).toBeGreaterThanOrEqual(3) // GetNormal, GetNormalTetra, GetNormalFast
    })

    it('should still include GetNormal for ultra-high quality', () => {
      expect(normalBlock).toContain('vec3 GetNormal(vec3 p)')
    })

    it('should still include GetNormalFast for backwards compatibility', () => {
      expect(normalBlock).toContain('vec3 GetNormalFast(vec3 p)')
    })
  })

  describe('OPT-FR-6: Quaternion Power Fast Paths', () => {
    it('should include quatPow function', () => {
      expect(quaternionBlock).toContain('vec4 quatPow(vec4 q, float n)')
    })

    it('should include fast path for n=2', () => {
      expect(quaternionBlock).toContain('abs(n - 2.0) < 0.01')
      expect(quaternionBlock).toContain('return quatSqr(q);')
    })

    it('should include fast path for n=3', () => {
      expect(quaternionBlock).toContain('abs(n - 3.0) < 0.01')
      expect(quaternionBlock).toContain('quatMul(quatSqr(q), q)')
    })

    it('should include fast path for n=4', () => {
      expect(quaternionBlock).toContain('abs(n - 4.0) < 0.01')
    })

    it('should include fast path for n=5 (OPT-FR-6)', () => {
      expect(quaternionBlock).toContain('abs(n - 5.0) < 0.01')
      // n=5: q^4 * q
      expect(quaternionBlock).toContain('quatMul(q4, q)')
    })

    it('should include fast path for n=6 (OPT-FR-6)', () => {
      expect(quaternionBlock).toContain('abs(n - 6.0) < 0.01')
      // n=6: q^4 * q^2
      expect(quaternionBlock).toContain('quatMul(q4, q2)')
    })

    it('should include fast path for n=7 (OPT-FR-6)', () => {
      expect(quaternionBlock).toContain('abs(n - 7.0) < 0.01')
      // n=7: q^6 * q
      expect(quaternionBlock).toContain('quatMul(q6, q)')
    })

    it('should include fast path for n=8 - classic Mandelbulb (OPT-FR-6)', () => {
      expect(quaternionBlock).toContain('abs(n - 8.0) < 0.01')
      // n=8: ((q^2)^2)^2 = quatSqr(q4)
      expect(quaternionBlock).toContain('quatSqr(q4)')
    })

    it('should include general case for non-integer powers', () => {
      // General case uses hyperspherical coordinates
      expect(quaternionBlock).toContain('acos(clamp(q.x / r')
      expect(quaternionBlock).toContain('pow(r, n)')
      expect(quaternionBlock).toContain('cos(nTheta)')
      expect(quaternionBlock).toContain('sin(nTheta)')
    })

    it('should handle edge case of zero-length quaternion', () => {
      expect(quaternionBlock).toContain('if (r < EPS) return vec4(0.0)')
    })

    it('should handle pure scalar quaternion case', () => {
      expect(quaternionBlock).toContain('if (vLen < EPS)')
    })
  })

  describe('Quaternion Helper Functions', () => {
    it('should include quatMul for quaternion multiplication', () => {
      expect(quaternionBlock).toContain('vec4 quatMul(vec4 q1, vec4 q2)')
    })

    it('should include quatSqr for quaternion squaring', () => {
      expect(quaternionBlock).toContain('vec4 quatSqr(vec4 q)')
    })

    it('should include optimized quatSqr implementation', () => {
      // quatSqr uses pre-computed squares for efficiency
      expect(quaternionBlock).toContain('float xx = q.x * q.x')
      expect(quaternionBlock).toContain('float yy = q.y * q.y')
    })
  })
})









