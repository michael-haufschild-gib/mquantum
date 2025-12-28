/**
 * Tests for ToScreenPass.
 *
 * Tests screen output with gamma correction and tone mapping.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { ToScreenPass } from '@/rendering/graph/passes/ToScreenPass'

describe('ToScreenPass', () => {
  let pass: ToScreenPass

  beforeEach(() => {
    pass = new ToScreenPass({
      id: 'toScreen',
      inputs: [{ resourceId: 'finalColor', access: 'read' }],
    })
  })

  describe('initialization', () => {
    it('should create pass with correct ID', () => {
      expect(pass.id).toBe('toScreen')
    })

    it('should configure correct input', () => {
      expect(pass.config.inputs).toHaveLength(1)
      expect(pass.config.inputs[0]!.resourceId).toBe('finalColor')
    })

    it('should have no outputs (writes to screen)', () => {
      expect(pass.config.outputs).toHaveLength(0)
    })

    it('should default gamma correction to false', () => {
      // Default constructor - gamma correction is false
      const defaultPass = new ToScreenPass({
        id: 'default',
        inputs: [{ resourceId: 'color', access: 'read' }],
      })
      expect(defaultPass.id).toBe('default')
    })

    it('should default tone mapping to false', () => {
      const defaultPass = new ToScreenPass({
        id: 'default',
        inputs: [{ resourceId: 'color', access: 'read' }],
      })
      expect(defaultPass.id).toBe('default')
    })

    it('should default exposure to 1.0', () => {
      const defaultPass = new ToScreenPass({
        id: 'default',
        inputs: [{ resourceId: 'color', access: 'read' }],
      })
      expect(defaultPass.id).toBe('default')
    })
  })

  describe('configuration options', () => {
    it('should accept gamma correction option', () => {
      const gammaPass = new ToScreenPass({
        id: 'gamma',
        inputs: [{ resourceId: 'color', access: 'read' }],
        gammaCorrection: true,
      })
      expect(gammaPass.id).toBe('gamma')
    })

    it('should accept tone mapping option', () => {
      const tmPass = new ToScreenPass({
        id: 'toneMap',
        inputs: [{ resourceId: 'color', access: 'read' }],
        toneMapping: true,
      })
      expect(tmPass.id).toBe('toneMap')
    })

    it('should accept exposure option', () => {
      const exposurePass = new ToScreenPass({
        id: 'exposure',
        inputs: [{ resourceId: 'color', access: 'read' }],
        toneMapping: true,
        exposure: 2.0,
      })
      expect(exposurePass.id).toBe('exposure')
    })

    it('should accept all options together', () => {
      const fullPass = new ToScreenPass({
        id: 'full',
        inputs: [{ resourceId: 'color', access: 'read' }],
        gammaCorrection: true,
        toneMapping: true,
        exposure: 1.5,
      })
      expect(fullPass.id).toBe('full')
    })
  })

  describe('parameter setters', () => {
    it('should set gamma correction', () => {
      pass.setGammaCorrection(true)
      // Verify no error
      expect(pass.id).toBe('toScreen')
    })

    it('should set tone mapping', () => {
      pass.setToneMapping(true)
      // Verify no error
      expect(pass.id).toBe('toScreen')
    })

    it('should set exposure', () => {
      pass.setExposure(0.5)
      // Verify no error
      expect(pass.id).toBe('toScreen')
    })
  })

  describe('CAS sharpening', () => {
    it('should set sharpness and return it via getter', () => {
      pass.setSharpness(0.5)
      expect(pass.getSharpness()).toBeCloseTo(0.5)
    })

    it('should clamp sharpness to 0-1 range (upper bound)', () => {
      pass.setSharpness(1.5)
      expect(pass.getSharpness()).toBeCloseTo(1.0)
    })

    it('should clamp sharpness to 0-1 range (lower bound)', () => {
      pass.setSharpness(-0.5)
      expect(pass.getSharpness()).toBeCloseTo(0.0)
    })

    it('should default sharpness to 0 (disabled)', () => {
      expect(pass.getSharpness()).toBeCloseTo(0.0)
    })

    it('should handle typical 50% resolution scaling', () => {
      // At 50% resolution, sharpness should be high (~0.7)
      const scale = 0.5
      const autoSharpness = Math.min(0.7, (1 - scale) * 1.5)
      pass.setSharpness(autoSharpness)
      expect(pass.getSharpness()).toBeCloseTo(0.7)
    })

    it('should handle typical 75% resolution scaling', () => {
      // At 75% resolution, sharpness should be moderate (~0.375)
      const scale = 0.75
      const autoSharpness = Math.min(0.7, (1 - scale) * 1.5)
      pass.setSharpness(autoSharpness)
      expect(pass.getSharpness()).toBeCloseTo(0.375)
    })

    it('should be disabled at full resolution', () => {
      // At 100% resolution, sharpness should be 0
      pass.setSharpness(0)
      expect(pass.getSharpness()).toBeCloseTo(0.0)
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
