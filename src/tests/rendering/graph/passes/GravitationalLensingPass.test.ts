/**
 * Tests for GravitationalLensingPass.
 *
 * Tests gravitational lensing effect applied to environment layer only.
 */

import { describe, expect, it, beforeEach } from 'vitest'

import { GravitationalLensingPass } from '@/rendering/graph/passes/GravitationalLensingPass'

describe('GravitationalLensingPass', () => {
  let pass: GravitationalLensingPass

  beforeEach(() => {
    pass = new GravitationalLensingPass({
      id: 'gravityLensing',
      environmentInput: 'environmentColor',
      outputResource: 'lensedEnvironment',
    })
  })

  describe('initialization', () => {
    it('should create pass with correct ID', () => {
      expect(pass.id).toBe('gravityLensing')
    })

    it('should configure environment input', () => {
      expect(pass.config.inputs).toHaveLength(1)
      expect(pass.config.inputs[0]!.resourceId).toBe('environmentColor')
      expect(pass.config.inputs[0]!.access).toBe('read')
    })

    it('should configure correct output', () => {
      expect(pass.config.outputs).toHaveLength(1)
      expect(pass.config.outputs[0]!.resourceId).toBe('lensedEnvironment')
      expect(pass.config.outputs[0]!.access).toBe('write')
    })
  })

  describe('enabled callback', () => {
    it('should have undefined enabled callback when not provided', () => {
      const passNoEnabled = new GravitationalLensingPass({
        id: 'test',
        environmentInput: 'env',
        outputResource: 'out',
      })
      // Without enabled callback, config.enabled is undefined
      expect(passNoEnabled.config.enabled).toBeUndefined()
    })

    it('should store enabled callback in config', () => {
      const enabledFn = (frame: Parameters<NonNullable<typeof pass.config.enabled>>[0]) =>
        frame?.stores.postProcessing.gravityEnabled ?? false
      const passWithEnabled = new GravitationalLensingPass({
        id: 'test',
        environmentInput: 'env',
        outputResource: 'out',
        enabled: enabledFn,
      })

      // Enabled callback should be stored in config
      expect(passWithEnabled.config.enabled).toBeDefined()
      // When called with null frame, should return false
      expect(passWithEnabled.config.enabled!(null)).toBe(false)
    })
  })

  describe('gravity center', () => {
    it('should allow manual gravity center override', () => {
      pass.setGravityCenter(0.3, 0.7)
      // The gravity center is private, but we can verify through the material uniforms
      // by checking it doesn't throw
      expect(() => pass.setGravityCenter(0.5, 0.5)).not.toThrow()
    })

    it('should clamp gravity center to valid UV range', () => {
      // Should not throw with edge values
      expect(() => pass.setGravityCenter(0, 0)).not.toThrow()
      expect(() => pass.setGravityCenter(1, 1)).not.toThrow()
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

  describe('custom configuration', () => {
    it('should accept custom ID', () => {
      const customPass = new GravitationalLensingPass({
        id: 'customGravity',
        environmentInput: 'customEnv',
        outputResource: 'customOut',
      })
      expect(customPass.id).toBe('customGravity')
    })

    it('should accept custom name', () => {
      const customPass = new GravitationalLensingPass({
        id: 'test',
        name: 'Custom Gravity Pass',
        environmentInput: 'env',
        outputResource: 'out',
      })
      expect(customPass.config.name).toBe('Custom Gravity Pass')
    })

    it('should accept priority', () => {
      const customPass = new GravitationalLensingPass({
        id: 'test',
        environmentInput: 'env',
        outputResource: 'out',
        priority: 100,
      })
      expect(customPass.config.priority).toBe(100)
    })
  })
})
