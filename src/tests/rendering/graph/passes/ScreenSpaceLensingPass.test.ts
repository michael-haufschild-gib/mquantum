/**
 * Tests for ScreenSpaceLensingPass.
 *
 * Tests gravitational lensing post-processing effect.
 */

import { describe, expect, it, beforeEach } from 'vitest'

import { ScreenSpaceLensingPass } from '@/rendering/graph/passes/ScreenSpaceLensingPass'

describe('ScreenSpaceLensingPass', () => {
  let pass: ScreenSpaceLensingPass

  beforeEach(() => {
    pass = new ScreenSpaceLensingPass({
      id: 'lensing',
      colorInput: 'sceneColor',
      outputResource: 'lensedScene',
    })
  })

  describe('initialization', () => {
    it('should create pass with correct ID', () => {
      expect(pass.id).toBe('lensing')
    })

    it('should configure color input', () => {
      expect(pass.config.inputs).toHaveLength(1)
      expect(pass.config.inputs[0]!.resourceId).toBe('sceneColor')
    })

    it('should configure correct output', () => {
      expect(pass.config.outputs).toHaveLength(1)
      expect(pass.config.outputs[0]!.resourceId).toBe('lensedScene')
    })

    it('should include depth input when provided', () => {
      const depthPass = new ScreenSpaceLensingPass({
        id: 'lensing-depth',
        colorInput: 'sceneColor',
        depthInput: 'sceneDepth',
        outputResource: 'lensedScene',
      })
      expect(depthPass.config.inputs).toHaveLength(2)
      expect(depthPass.config.inputs[1]!.resourceId).toBe('sceneDepth')
    })
  })

  describe('default parameters', () => {
    it('should default black hole center to screen center', () => {
      const params = pass.getParameters()
      expect(params.blackHoleCenter.x).toBeCloseTo(0.5)
      expect(params.blackHoleCenter.y).toBeCloseTo(0.5)
    })

    it('should default horizon radius to 0.05', () => {
      const params = pass.getParameters()
      expect(params.horizonRadius).toBeCloseTo(0.05)
    })

    it('should default intensity to 1.0', () => {
      const params = pass.getParameters()
      expect(params.intensity).toBeCloseTo(1.0)
    })

    it('should default mass to 1.0', () => {
      const params = pass.getParameters()
      expect(params.mass).toBeCloseTo(1.0)
    })

    it('should default distortionScale to 1.0', () => {
      const params = pass.getParameters()
      expect(params.distortionScale).toBeCloseTo(1.0)
    })

    it('should default falloff to 1.5', () => {
      const params = pass.getParameters()
      expect(params.falloff).toBeCloseTo(1.5)
    })

    it('should default chromatic aberration to 0.5', () => {
      const params = pass.getParameters()
      expect(params.chromaticAberration).toBeCloseTo(0.5)
    })
  })

  describe('custom configuration', () => {
    it('should accept custom black hole center via centerX/centerY', () => {
      const customPass = new ScreenSpaceLensingPass({
        id: 'custom',
        colorInput: 'color',
        outputResource: 'output',
        centerX: 0.3,
        centerY: 0.7,
      })
      const params = customPass.getParameters()
      expect(params.blackHoleCenter.x).toBeCloseTo(0.3)
      expect(params.blackHoleCenter.y).toBeCloseTo(0.7)
    })

    it('should accept custom horizon radius', () => {
      const customPass = new ScreenSpaceLensingPass({
        id: 'custom',
        colorInput: 'color',
        outputResource: 'output',
        horizonRadius: 0.1,
      })
      const params = customPass.getParameters()
      expect(params.horizonRadius).toBeCloseTo(0.1)
    })

    it('should accept custom intensity', () => {
      const customPass = new ScreenSpaceLensingPass({
        id: 'custom',
        colorInput: 'color',
        outputResource: 'output',
        intensity: 2.5,
      })
      const params = customPass.getParameters()
      expect(params.intensity).toBeCloseTo(2.5)
    })

    it('should accept custom mass', () => {
      const customPass = new ScreenSpaceLensingPass({
        id: 'custom',
        colorInput: 'color',
        outputResource: 'output',
        mass: 5.0,
      })
      const params = customPass.getParameters()
      expect(params.mass).toBeCloseTo(5.0)
    })

    it('should accept custom distortionScale', () => {
      const customPass = new ScreenSpaceLensingPass({
        id: 'custom',
        colorInput: 'color',
        outputResource: 'output',
        distortionScale: 2.0,
      })
      const params = customPass.getParameters()
      expect(params.distortionScale).toBeCloseTo(2.0)
    })

    it('should accept custom falloff', () => {
      const customPass = new ScreenSpaceLensingPass({
        id: 'custom',
        colorInput: 'color',
        outputResource: 'output',
        falloff: 2.0,
      })
      const params = customPass.getParameters()
      expect(params.falloff).toBeCloseTo(2.0)
    })

    it('should accept chromatic aberration value', () => {
      const customPass = new ScreenSpaceLensingPass({
        id: 'custom',
        colorInput: 'color',
        outputResource: 'output',
        chromaticAberration: 0.8,
      })
      const params = customPass.getParameters()
      expect(params.chromaticAberration).toBeCloseTo(0.8)
    })
  })

  describe('parameter setters', () => {
    it('should set black hole center', () => {
      pass.setBlackHoleCenter(0.2, 0.8)
      const params = pass.getParameters()
      expect(params.blackHoleCenter.x).toBeCloseTo(0.2)
      expect(params.blackHoleCenter.y).toBeCloseTo(0.8)
    })

    it('should set black hole center via setCenter alias', () => {
      pass.setCenter(0.1, 0.9)
      const params = pass.getParameters()
      expect(params.blackHoleCenter.x).toBeCloseTo(0.1)
      expect(params.blackHoleCenter.y).toBeCloseTo(0.9)
    })

    it('should set horizon radius', () => {
      pass.setHorizonRadius(0.15)
      const params = pass.getParameters()
      expect(params.horizonRadius).toBeCloseTo(0.15)
    })

    it('should set intensity', () => {
      pass.setIntensity(3.0)
      const params = pass.getParameters()
      expect(params.intensity).toBeCloseTo(3.0)
    })

    it('should set mass', () => {
      pass.setMass(2.5)
      const params = pass.getParameters()
      expect(params.mass).toBeCloseTo(2.5)
    })

    it('should set distortion scale', () => {
      pass.setDistortionScale(1.5)
      const params = pass.getParameters()
      expect(params.distortionScale).toBeCloseTo(1.5)
    })

    it('should set falloff', () => {
      pass.setFalloff(3.0)
      const params = pass.getParameters()
      expect(params.falloff).toBeCloseTo(3.0)
    })

    it('should set chromatic aberration', () => {
      pass.setChromaticAberration(0.8)
      const params = pass.getParameters()
      expect(params.chromaticAberration).toBeCloseTo(0.8)
    })
  })

  describe('getParameters', () => {
    it('should return all parameters', () => {
      const params = pass.getParameters()
      expect(params).toHaveProperty('blackHoleCenter')
      expect(params).toHaveProperty('horizonRadius')
      expect(params).toHaveProperty('intensity')
      expect(params).toHaveProperty('mass')
      expect(params).toHaveProperty('distortionScale')
      expect(params).toHaveProperty('falloff')
      expect(params).toHaveProperty('chromaticAberration')
      expect(params).toHaveProperty('hybridSkyEnabled')
      expect(params).toHaveProperty('hasSkyCubemap')
    })

    it('should return a clone of blackHoleCenter', () => {
      const params1 = pass.getParameters()
      const params2 = pass.getParameters()
      // Should be different Vector2 instances
      expect(params1.blackHoleCenter).not.toBe(params2.blackHoleCenter)
      // But with same values
      expect(params1.blackHoleCenter.x).toBe(params2.blackHoleCenter.x)
      expect(params1.blackHoleCenter.y).toBe(params2.blackHoleCenter.y)
    })
  })

  describe('hybrid sky mode', () => {
    it('should default hybrid sky to enabled', () => {
      const params = pass.getParameters()
      expect(params.hybridSkyEnabled).toBe(true)
    })

    it('should accept hybridSkyEnabled config option', () => {
      const disabledPass = new ScreenSpaceLensingPass({
        id: 'no-hybrid',
        colorInput: 'color',
        outputResource: 'output',
        hybridSkyEnabled: false,
      })
      const params = disabledPass.getParameters()
      expect(params.hybridSkyEnabled).toBe(false)
    })

    it('should set hybrid sky enabled', () => {
      pass.setHybridSkyEnabled(false)
      const params = pass.getParameters()
      expect(params.hybridSkyEnabled).toBe(false)
    })

    it('should default to no sky cubemap', () => {
      const params = pass.getParameters()
      expect(params.hasSkyCubemap).toBe(false)
    })

    it('should set sky cubemap', () => {
      // We can't easily create a real CubeTexture in tests without WebGL context
      // Just verify the setter works without error
      pass.setSkyCubemap(null)
      const params = pass.getParameters()
      expect(params.hasSkyCubemap).toBe(false)
    })
  })

  describe('disposal', () => {
    it('should dispose without error', () => {
      expect(() => pass.dispose()).not.toThrow()
    })

    it('should be safe to call dispose multiple times', () => {
      pass.dispose()
      expect(() => pass.dispose()).not.toThrow()
    })
  })
})
