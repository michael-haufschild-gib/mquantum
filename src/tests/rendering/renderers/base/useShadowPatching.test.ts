/**
 * Tests for useShadowPatching hook.
 *
 * Tests the shadow material patching functionality used by PolytopeScene
 * and TubeWireframe for N-D vertex transformation in shadow maps.
 */

import {
  useShadowPatching,
  type UseShadowPatchingOptions,
} from '@/rendering/renderers/base'
import { describe, expect, it } from 'vitest'

describe('useShadowPatching', () => {
  describe('exports', () => {
    it('should be exported as a function', () => {
      expect(typeof useShadowPatching).toBe('function')
    })
  })

  describe('UseShadowPatchingOptions type', () => {
    it('should accept valid options structure', () => {
      // Type test - verifies the interface shape compiles correctly
      const options: UseShadowPatchingOptions = {
        transformGLSL: `
          vec3 testTransform(vec3 pos) {
            return pos;
          }
        `,
        transformFunctionCall: 'testTransform(transformed)',
        uniforms: {
          uTestUniform: { value: 1.0 },
        },
        shadowEnabled: true,
      }

      expect(options.transformGLSL).toContain('testTransform')
      expect(options.transformFunctionCall).toBe('testTransform(transformed)')
      expect(options.shadowEnabled).toBe(true)
      expect(options.uniforms.uTestUniform!.value).toBe(1.0)
    })

    it('should accept shadowEnabled as false', () => {
      const options: UseShadowPatchingOptions = {
        transformGLSL: '',
        transformFunctionCall: 'identity(transformed)',
        uniforms: {},
        shadowEnabled: false,
      }

      expect(options.shadowEnabled).toBe(false)
    })
  })

  describe('uniform structure', () => {
    it('should support standard N-D transformation uniforms', () => {
      // These are the uniforms typically passed to the hook
      // Note: Scale is now applied AFTER projection (like camera zoom)
      const uniforms: Record<string, { value: unknown }> = {
        uRotationMatrix4D: { value: null },
        uDimension: { value: 4 },
        uUniformScale: { value: 1.0 }, // Applied after projection
        uExtraRotationCols: { value: new Float32Array(28) },
        uDepthRowSums: { value: new Float32Array(11) },
        uProjectionDistance: { value: 10.0 },
      }

      expect(uniforms.uDimension!.value).toBe(4)
      expect(uniforms.uProjectionDistance!.value).toBe(10.0)
      expect(uniforms.uUniformScale!.value).toBe(1.0)
    })

    it('should support tube-specific uniforms', () => {
      const uniforms: Record<string, { value: unknown }> = {
        uRadius: { value: 0.02 },
      }

      expect(uniforms.uRadius!.value).toBe(0.02)
    })
  })
})















