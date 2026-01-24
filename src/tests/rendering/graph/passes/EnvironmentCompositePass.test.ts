/**
 * Tests for EnvironmentCompositePass.
 *
 * Tests compositing of lensed environment behind main object layer.
 */

import { describe, expect, it, beforeEach } from 'vitest'

import { EnvironmentCompositePass } from '@/rendering/graph/passes/EnvironmentCompositePass'

describe('EnvironmentCompositePass', () => {
  let pass: EnvironmentCompositePass

  beforeEach(() => {
    pass = new EnvironmentCompositePass({
      id: 'envComposite',
      lensedEnvironmentInput: 'lensedEnvironment',
      mainObjectInput: 'mainObjectColor',
      mainObjectDepthInput: 'mainObjectColor',
      mainObjectDepthInputAttachment: 'depth',
      outputResource: 'compositedScene',
    })
  })

  describe('initialization', () => {
    it('should create pass with correct ID', () => {
      expect(pass.id).toBe('envComposite')
    })

    it('should configure three inputs', () => {
      expect(pass.config.inputs).toHaveLength(3)
    })

    it('should configure lensed environment input', () => {
      expect(pass.config.inputs[0]!.resourceId).toBe('lensedEnvironment')
      expect(pass.config.inputs[0]!.access).toBe('read')
    })

    it('should configure main object color input', () => {
      expect(pass.config.inputs[1]!.resourceId).toBe('mainObjectColor')
      expect(pass.config.inputs[1]!.access).toBe('read')
    })

    it('should configure main object depth input with attachment', () => {
      expect(pass.config.inputs[2]!.resourceId).toBe('mainObjectColor')
      expect(pass.config.inputs[2]!.access).toBe('read')
      expect(pass.config.inputs[2]!.attachment).toBe('depth')
    })

    it('should configure correct output', () => {
      expect(pass.config.outputs).toHaveLength(1)
      expect(pass.config.outputs[0]!.resourceId).toBe('compositedScene')
      expect(pass.config.outputs[0]!.access).toBe('write')
    })
  })

  describe('enabled callback', () => {
    it('should have undefined enabled callback when not provided', () => {
      const passNoEnabled = new EnvironmentCompositePass({
        id: 'test',
        lensedEnvironmentInput: 'env',
        mainObjectInput: 'obj',
        mainObjectDepthInput: 'depth',
        outputResource: 'out',
      })
      // Without enabled callback, config.enabled is undefined
      expect(passNoEnabled.config.enabled).toBeUndefined()
    })

    it('should store enabled callback in config', () => {
      const enabledFn = (frame: Parameters<NonNullable<typeof pass.config.enabled>>[0]) =>
        frame?.stores.postProcessing.gravityEnabled ?? false
      const passWithEnabled = new EnvironmentCompositePass({
        id: 'test',
        lensedEnvironmentInput: 'env',
        mainObjectInput: 'obj',
        mainObjectDepthInput: 'depth',
        outputResource: 'out',
        enabled: enabledFn,
      })

      // Enabled callback should be stored in config
      expect(passWithEnabled.config.enabled).toBeDefined()
      // When called with null frame, should return false
      expect(passWithEnabled.config.enabled!(null)).toBe(false)
    })
  })

  describe('depth attachment configuration', () => {
    it('should work without depth attachment specified', () => {
      const passNoAttachment = new EnvironmentCompositePass({
        id: 'test',
        lensedEnvironmentInput: 'env',
        mainObjectInput: 'obj',
        mainObjectDepthInput: 'depth',
        outputResource: 'out',
      })
      expect(passNoAttachment.config.inputs[2]!.attachment).toBeUndefined()
    })

    it('should accept numeric attachment', () => {
      const passNumericAttachment = new EnvironmentCompositePass({
        id: 'test',
        lensedEnvironmentInput: 'env',
        mainObjectInput: 'obj',
        mainObjectDepthInput: 'depth',
        mainObjectDepthInputAttachment: 0,
        outputResource: 'out',
      })
      expect(passNumericAttachment.config.inputs[2]!.attachment).toBe(0)
    })

    it('should accept depth string attachment', () => {
      const passDepthAttachment = new EnvironmentCompositePass({
        id: 'test',
        lensedEnvironmentInput: 'env',
        mainObjectInput: 'obj',
        mainObjectDepthInput: 'depth',
        mainObjectDepthInputAttachment: 'depth',
        outputResource: 'out',
      })
      expect(passDepthAttachment.config.inputs[2]!.attachment).toBe('depth')
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
      const customPass = new EnvironmentCompositePass({
        id: 'customComposite',
        lensedEnvironmentInput: 'env',
        mainObjectInput: 'obj',
        mainObjectDepthInput: 'depth',
        outputResource: 'out',
      })
      expect(customPass.id).toBe('customComposite')
    })

    it('should accept custom name', () => {
      const customPass = new EnvironmentCompositePass({
        id: 'test',
        name: 'Custom Composite Pass',
        lensedEnvironmentInput: 'env',
        mainObjectInput: 'obj',
        mainObjectDepthInput: 'depth',
        outputResource: 'out',
      })
      expect(customPass.config.name).toBe('Custom Composite Pass')
    })

    it('should accept priority', () => {
      const customPass = new EnvironmentCompositePass({
        id: 'test',
        lensedEnvironmentInput: 'env',
        mainObjectInput: 'obj',
        mainObjectDepthInput: 'depth',
        outputResource: 'out',
        priority: 50,
      })
      expect(customPass.config.priority).toBe(50)
    })
  })
})
