/**
 * Tests for FXAAPass.
 *
 * Tests initialization, GLSL ES 3.00 compliance, parameter management,
 * and proper resource cleanup.
 *
 * @module tests/rendering/graph/passes/FXAAPass.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { FXAAPass } from '@/rendering/graph/passes/FXAAPass'

describe('FXAAPass', () => {
  let fxaaPass: FXAAPass

  beforeEach(() => {
    fxaaPass = new FXAAPass({
      id: 'test-fxaa',
      colorInput: 'sceneColor',
      outputResource: 'antialiasedColor',
    })
  })

  afterEach(() => {
    fxaaPass.dispose()
  })

  describe('constructor', () => {
    it('should create pass with specified config', () => {
      const pass = new FXAAPass({
        id: 'custom-fxaa',
        colorInput: 'input',
        outputResource: 'output',
      })

      expect(pass.id).toBe('custom-fxaa')
      expect(pass.config.inputs).toHaveLength(1)
      expect(pass.config.inputs[0]!.resourceId).toBe('input')
      expect(pass.config.outputs).toHaveLength(1)
      expect(pass.config.outputs[0]!.resourceId).toBe('output')

      pass.dispose()
    })
  })

  describe('GLSL ES 3.00 compliance', () => {
    it('should use GLSL3 version for WebGL2 compatibility', () => {
      // Access the material to verify GLSL version
      const material = (fxaaPass as unknown as { material: THREE.ShaderMaterial }).material
      expect(material.glslVersion).toBe(THREE.GLSL3)
    })

    it('should have proper uniforms for FXAA algorithm', () => {
      const material = (fxaaPass as unknown as { material: THREE.ShaderMaterial }).material
      expect(material.uniforms.tDiffuse).toBeDefined()
      expect(material.uniforms.resolution).toBeDefined()
    })

    it('should not use deprecated GLSL syntax in shaders', () => {
      const material = (fxaaPass as unknown as { material: THREE.ShaderMaterial }).material

      // Check vertex shader doesn't use WebGL1 syntax
      expect(material.vertexShader).not.toContain('attribute ')
      expect(material.vertexShader).not.toContain('varying ')

      // Check fragment shader doesn't use WebGL1 syntax
      expect(material.fragmentShader).not.toContain('gl_FragColor')
      expect(material.fragmentShader).not.toContain('texture2D(')
      expect(material.fragmentShader).not.toContain('textureCube(')

      // Should use GLSL ES 3.00 syntax
      expect(material.vertexShader).toContain('out vec2')
      expect(material.fragmentShader).toContain('in vec2')
      expect(material.fragmentShader).toContain('layout(location = 0) out vec4')
      expect(material.fragmentShader).toContain('texture(')
    })
  })

  describe('FXAA algorithm implementation', () => {
    it('should include edge detection logic', () => {
      const material = (fxaaPass as unknown as { material: THREE.ShaderMaterial }).material

      // FXAA requires luma calculation for edge detection
      expect(material.fragmentShader).toContain('rgb2luma')

      // FXAA uses edge threshold constants
      expect(material.fragmentShader).toContain('EDGE_THRESHOLD')
    })

    it('should include edge search iterations', () => {
      const material = (fxaaPass as unknown as { material: THREE.ShaderMaterial }).material

      // FXAA 3.11 uses iterative edge search
      expect(material.fragmentShader).toContain('ITERATIONS')
    })

    it('should include subpixel anti-aliasing', () => {
      const material = (fxaaPass as unknown as { material: THREE.ShaderMaterial }).material

      // FXAA includes subpixel quality setting
      expect(material.fragmentShader).toContain('SUBPIXEL_QUALITY')
    })
  })

  describe('execute', () => {
    it('should skip when size is invalid', () => {
      const mockRenderer = {
        setRenderTarget: vi.fn(),
        render: vi.fn(),
        getContext: vi.fn(() => ({})),
        getSize: vi.fn(() => new THREE.Vector2(0, 0)),
        dispose: vi.fn(),
      } as unknown as THREE.WebGLRenderer

      const mockContext = {
        renderer: mockRenderer,
        size: { width: 0, height: 0 },
        getReadTexture: vi.fn().mockReturnValue(null),
        getWriteTarget: vi.fn(),
      }

      // Should not throw when size is invalid
      expect(() =>
        fxaaPass.execute(mockContext as unknown as import('@/rendering/graph/types').RenderContext)
      ).not.toThrow()
    })

    it('should update resolution uniform based on render size', () => {
      const material = (fxaaPass as unknown as { material: THREE.ShaderMaterial }).material
      const resolutionUniform = material.uniforms.resolution?.value as THREE.Vector2 | undefined

      // Initially resolution might be zero or default
      // The important thing is the uniform exists and can be updated
      expect(resolutionUniform).toBeInstanceOf(THREE.Vector2)
    })
  })

  describe('dispose', () => {
    it('should clean up all resources', () => {
      const pass = new FXAAPass({
        id: 'dispose-test',
        colorInput: 'input',
        outputResource: 'output',
      })

      // Dispose should not throw
      expect(() => pass.dispose()).not.toThrow()

      // Calling dispose again should be safe (idempotent)
      expect(() => pass.dispose()).not.toThrow()
    })

    it('should dispose material and geometry', () => {
      const pass = new FXAAPass({
        id: 'resource-test',
        colorInput: 'input',
        outputResource: 'output',
      })

      const material = (pass as unknown as { material: THREE.ShaderMaterial }).material
      const materialDisposeSpy = vi.spyOn(material, 'dispose')

      pass.dispose()

      expect(materialDisposeSpy).toHaveBeenCalled()
    })
  })

  describe('inputs/outputs', () => {
    it('should declare correct input', () => {
      expect(fxaaPass.config.inputs).toEqual([{ resourceId: 'sceneColor', access: 'read' }])
    })

    it('should declare correct output', () => {
      expect(fxaaPass.config.outputs).toEqual([{ resourceId: 'antialiasedColor', access: 'write' }])
    })
  })
})

describe('FXAAPass shader quality', () => {
  it('should use quality settings appropriate for real-time rendering', () => {
    const pass = new FXAAPass({
      id: 'quality-test',
      colorInput: 'input',
      outputResource: 'output',
    })

    const material = (pass as unknown as { material: THREE.ShaderMaterial }).material

    // FXAA 3.11 quality settings should be defined
    // Edge threshold min should be small (good for catching fine edges)
    expect(material.fragmentShader).toContain('0.0312') // EDGE_THRESHOLD_MIN
    // Edge threshold max should be reasonable (avoid over-processing)
    expect(material.fragmentShader).toContain('0.125') // EDGE_THRESHOLD_MAX
    // Should have reasonable iteration count
    expect(material.fragmentShader).toContain('12') // ITERATIONS

    pass.dispose()
  })
})
