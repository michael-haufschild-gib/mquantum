/**
 * Tests for ToneMappingPass.
 *
 * Tests HDR to LDR tone mapping post-processing effect.
 * Covers all Three.js tone mapping algorithms.
 */

import * as THREE from 'three'
import { describe, expect, it, beforeEach } from 'vitest'

import { ToneMappingPass } from '@/rendering/graph/passes/ToneMappingPass'

describe('ToneMappingPass', () => {
  let pass: ToneMappingPass

  beforeEach(() => {
    pass = new ToneMappingPass({
      id: 'toneMapping',
      colorInput: 'hdrColor',
      outputResource: 'ldrColor',
    })
  })

  describe('initialization', () => {
    it('should create pass with correct ID', () => {
      expect(pass.id).toBe('toneMapping')
    })

    it('should configure color input', () => {
      expect(pass.config.inputs).toHaveLength(1)
      expect(pass.config.inputs[0]!.resourceId).toBe('hdrColor')
    })

    it('should configure correct output', () => {
      expect(pass.config.outputs).toHaveLength(1)
      expect(pass.config.outputs[0]!.resourceId).toBe('ldrColor')
    })
  })

  describe('default parameters', () => {
    it('should default to NoToneMapping', () => {
      const settings = pass.getSettings()
      expect(settings.toneMapping).toBe(THREE.NoToneMapping)
    })

    it('should default exposure to 1.0', () => {
      const settings = pass.getSettings()
      expect(settings.exposure).toBe(1.0)
    })
  })

  describe('custom configuration', () => {
    it('should accept ACES Filmic tone mapping', () => {
      const customPass = new ToneMappingPass({
        id: 'custom',
        colorInput: 'color',
        outputResource: 'output',
        toneMapping: THREE.ACESFilmicToneMapping,
      })
      const settings = customPass.getSettings()
      expect(settings.toneMapping).toBe(THREE.ACESFilmicToneMapping)
      customPass.dispose()
    })

    it('should accept Reinhard tone mapping', () => {
      const customPass = new ToneMappingPass({
        id: 'custom',
        colorInput: 'color',
        outputResource: 'output',
        toneMapping: THREE.ReinhardToneMapping,
      })
      const settings = customPass.getSettings()
      expect(settings.toneMapping).toBe(THREE.ReinhardToneMapping)
      customPass.dispose()
    })

    it('should accept AgX tone mapping (mode 6)', () => {
      const customPass = new ToneMappingPass({
        id: 'custom',
        colorInput: 'color',
        outputResource: 'output',
        toneMapping: 6, // AgXToneMapping
      })
      const settings = customPass.getSettings()
      expect(settings.toneMapping).toBe(6)
      customPass.dispose()
    })

    it('should accept Neutral tone mapping (mode 7)', () => {
      const customPass = new ToneMappingPass({
        id: 'custom',
        colorInput: 'color',
        outputResource: 'output',
        toneMapping: 7, // NeutralToneMapping
      })
      const settings = customPass.getSettings()
      expect(settings.toneMapping).toBe(7)
      customPass.dispose()
    })

    it('should accept custom exposure', () => {
      const customPass = new ToneMappingPass({
        id: 'custom',
        colorInput: 'color',
        outputResource: 'output',
        exposure: 1.5,
      })
      const settings = customPass.getSettings()
      expect(settings.exposure).toBe(1.5)
      customPass.dispose()
    })

    it('should accept all custom parameters', () => {
      const customPass = new ToneMappingPass({
        id: 'custom',
        colorInput: 'color',
        outputResource: 'output',
        toneMapping: THREE.ACESFilmicToneMapping,
        exposure: 0.8,
      })
      const settings = customPass.getSettings()
      expect(settings.toneMapping).toBe(THREE.ACESFilmicToneMapping)
      expect(settings.exposure).toBe(0.8)
      customPass.dispose()
    })
  })

  describe('parameter setters', () => {
    it('should set tone mapping mode', () => {
      pass.setToneMapping(THREE.ACESFilmicToneMapping)
      const settings = pass.getSettings()
      expect(settings.toneMapping).toBe(THREE.ACESFilmicToneMapping)
    })

    it('should set exposure', () => {
      pass.setExposure(2.0)
      const settings = pass.getSettings()
      expect(settings.exposure).toBe(2.0)
    })

    it('should support all standard Three.js tone mapping modes', () => {
      const modes = [
        THREE.NoToneMapping,
        THREE.LinearToneMapping,
        THREE.ReinhardToneMapping,
        THREE.CineonToneMapping,
        THREE.ACESFilmicToneMapping,
        6, // AgXToneMapping
        7, // NeutralToneMapping
      ]

      for (const mode of modes) {
        pass.setToneMapping(mode)
        const settings = pass.getSettings()
        expect(settings.toneMapping).toBe(mode)
      }
    })

    it('should handle extreme exposure values', () => {
      pass.setExposure(0.1)
      expect(pass.getSettings().exposure).toBe(0.1)

      pass.setExposure(3.0)
      expect(pass.getSettings().exposure).toBe(3.0)
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
