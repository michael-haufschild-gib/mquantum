/**
 * Tests for URL state serializer
 */

import { describe, it, expect } from 'vitest'
import {
  serializeState,
  deserializeState,
  generateShareUrl,
  type ShareableState,
} from '@/lib/url/state-serializer'
import { DEFAULT_SHADER_SETTINGS } from '@/stores/defaults/visualDefaults'

describe('state-serializer', () => {
  describe('serializeState', () => {
    it('should serialize basic dimension and objectType', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
      }
      const result = serializeState(state)
      expect(result).toContain('d=4')
      expect(result).toContain('t=schroedinger')
    })

    it('should serialize quantum mode when non-default', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        quantumMode: 'tdseDynamics',
      }
      const result = serializeState(state)
      expect(result).toContain('qm=tdseDynamics')
    })

    it('should include uniformScale when not 1', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        uniformScale: 1.5,
      }
      const result = serializeState(state)
      expect(result).toContain('s=1.50')
    })

    it('should serialize non-default skybox selection', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        skyboxSelection: 'procedural_aurora',
      }
      const result = serializeState(state)
      expect(result).toContain('sb=procedural_aurora')
    })

    it('should omit default skybox selection for shorter URLs', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        skyboxSelection: 'none',
      }
      const result = serializeState(state)
      expect(result).not.toContain('sb=')
    })

    it('should serialize non-default core skybox controls', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        skyboxIntensity: 2.4,
        skyboxRotation: 1.2345,
        skyboxAnimationMode: 'ethereal',
        skyboxAnimationSpeed: 1.25,
        skyboxHighQuality: true,
      }
      const result = serializeState(state)
      expect(result).toContain('sbi=2.40')
      expect(result).toContain('sbr=1.2345')
      expect(result).toContain('sbm=ethereal')
      expect(result).toContain('sbs=1.250')
      expect(result).toContain('sbh=1')
    })

    it('should serialize bloom settings', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        bloomEnabled: true,
        bloomGain: 2.5,
        bloomThreshold: 0.5,
        bloomKnee: 0.25,
        bloomRadius: 2.0,
      }
      const result = serializeState(state)
      expect(result).toContain('be=1')
      expect(result).toContain('bga=2.50')
      expect(result).toContain('bt=0.50')
      expect(result).toContain('bk=0.25')
      expect(result).toContain('br=2.00')
    })

    it('should omit default bloom values for shorter URLs', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        bloomGain: 0.8, // DEFAULT_BLOOM_GAIN
        bloomThreshold: 1.0, // DEFAULT_BLOOM_THRESHOLD
        bloomKnee: 0.2, // DEFAULT_BLOOM_KNEE
        bloomRadius: 1.0, // DEFAULT_BLOOM_RADIUS
      }
      const result = serializeState(state)
      expect(result).not.toContain('bga=')
      expect(result).not.toContain('bt=')
      expect(result).not.toContain('bk=')
      expect(result).not.toContain('br=')
    })

    it('should serialize tone mapping settings', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        toneMappingEnabled: false,
        toneMappingAlgorithm: 'reinhard',
        exposure: 1.5,
      }
      const result = serializeState(state)
      expect(result).toContain('tm=0')
      expect(result).toContain('ta=reinhard')
      expect(result).toContain('ex=1.5')
    })
  })

  describe('deserializeState', () => {
    it('should deserialize dimension/objectType/uniformScale', () => {
      const result = deserializeState('d=5&t=schroedinger&s=1.50')
      expect(result.dimension).toBe(5)
      expect(result.objectType).toBe('schroedinger')
      expect(result.uniformScale).toBeCloseTo(1.5)
    })

    it('should deserialize valid quantum mode', () => {
      const result = deserializeState('qm=tdseDynamics')
      expect(result.quantumMode).toBe('tdseDynamics')
    })

    it('should ignore invalid quantum mode', () => {
      const result = deserializeState('qm=unknownMode')
      expect(result.quantumMode).toBeUndefined()
    })

    it('should deserialize bloom settings', () => {
      const result = deserializeState('be=1&bga=2.20&bt=0.50&bk=0.30&br=2.50')

      expect(result.bloomEnabled).toBe(true)
      expect(result.bloomGain).toBeCloseTo(2.2)
      expect(result.bloomThreshold).toBeCloseTo(0.5)
      expect(result.bloomKnee).toBeCloseTo(0.3)
      expect(result.bloomRadius).toBeCloseTo(2.5)
    })

    it('should reject out-of-range bloom values', () => {
      const result = deserializeState('bga=99&bt=99&bk=99&br=99')
      expect(result.bloomGain).toBeUndefined()
      expect(result.bloomThreshold).toBeUndefined()
      expect(result.bloomKnee).toBeUndefined()
      expect(result.bloomRadius).toBeUndefined()
    })

    it('should reject bloom threshold outside the 0..5 contract', () => {
      const negative = deserializeState('bt=-0.5')
      const aboveMax = deserializeState('bt=5.1')

      expect(negative.bloomThreshold).toBeUndefined()
      expect(aboveMax.bloomThreshold).toBeUndefined()
    })

    it('should reject below-minimum bloom radius', () => {
      const result = deserializeState('br=0.1')
      expect(result.bloomRadius).toBeUndefined()
    })

    it('should extract bloomRadius from old band size params (backward compat)', () => {
      // Old format: bb0=enabled|weight|size|tint
      const result = deserializeState('bb0=1|1.00|1.50|FF0000&bb1=1|0.80|2.50|00FF00')
      // Average of sizes: (1.5 + 2.5) / 2 = 2.0
      expect(result.bloomRadius).toBeCloseTo(2.0)
    })

    it('should ignore old band params when new br param is present', () => {
      const result = deserializeState('br=3.00&bb0=1|1.00|1.50|FF0000&bb1=1|0.80|2.50|00FF00')
      // br takes precedence — should NOT average band sizes
      expect(result.bloomRadius).toBeCloseTo(3.0)
    })

    it('should ignore old bloom mode and convolution params silently', () => {
      const result = deserializeState('bm=c&bcr=3.00&bcs=0.75&bcb=1.80&bct=112233')
      // None of the removed fields should appear on result
      expect(result).not.toHaveProperty('bloomMode')
      expect(result).not.toHaveProperty('bloomConvolutionRadius')
      expect(result).not.toHaveProperty('bloomConvolutionResolutionScale')
      expect(result).not.toHaveProperty('bloomConvolutionBoost')
      expect(result).not.toHaveProperty('bloomConvolutionTint')
    })

    it('should deserialize colors with # prefix', () => {
      const result = deserializeState('ec=FF0000&bg=000000')
      expect(result.edgeColor).toBe('#FF0000')
      expect(result.backgroundColor).toBe('#000000')
    })

    it('should deserialize valid skybox selection', () => {
      const result = deserializeState('sb=procedural_ocean')
      expect(result.skyboxSelection).toBe('procedural_ocean')
    })

    it('should ignore invalid skybox selection', () => {
      const result = deserializeState('sb=invalid_selection')
      expect(result.skyboxSelection).toBeUndefined()
    })

    it('should deserialize valid core skybox controls', () => {
      const result = deserializeState('sbi=2.25&sbr=1.5&sbm=cinematic&sbs=0.750&sbh=1')
      expect(result.skyboxIntensity).toBeCloseTo(2.25)
      expect(result.skyboxRotation).toBeCloseTo(1.5)
      expect(result.skyboxAnimationMode).toBe('cinematic')
      expect(result.skyboxAnimationSpeed).toBeCloseTo(0.75)
      expect(result.skyboxHighQuality).toBe(true)
    })

    it('should reject invalid core skybox control values', () => {
      const result = deserializeState('sbi=-1&sbr=abc&sbm=invalid&sbs=7&sbh=2')
      expect(result.skyboxIntensity).toBeUndefined()
      expect(result.skyboxRotation).toBeUndefined()
      expect(result.skyboxAnimationMode).toBeUndefined()
      expect(result.skyboxAnimationSpeed).toBeUndefined()
      expect(result.skyboxHighQuality).toBeUndefined()
    })

    it('should ignore invalid objectType', () => {
      const result = deserializeState('t=invalid')
      expect(result.objectType).toBeUndefined()
    })

    it('should deserialize tone mapping settings', () => {
      const result = deserializeState('tm=0&ta=reinhard&ex=1.5')
      expect(result.toneMappingEnabled).toBe(false)
      expect(result.toneMappingAlgorithm).toBe('reinhard')
      expect(result.exposure).toBeCloseTo(1.5)
    })
  })

  describe('roundtrip serialization', () => {
    it('should preserve bloom state through serialize/deserialize cycle', () => {
      const original: ShareableState = {
        dimension: 5,
        objectType: 'schroedinger',
        bloomEnabled: true,
        bloomGain: 1.8,
        bloomThreshold: 1.2,
        bloomKnee: 0.12,
        bloomRadius: 2.5,
      }

      const serialized = serializeState(original)
      const deserialized = deserializeState(serialized)

      expect(deserialized.dimension).toBe(original.dimension)
      expect(deserialized.objectType).toBe(original.objectType)
      expect(deserialized.bloomEnabled).toBe(true)
      expect(deserialized.bloomGain).toBeCloseTo(original.bloomGain!)
      expect(deserialized.bloomThreshold).toBeCloseTo(original.bloomThreshold!)
      expect(deserialized.bloomKnee).toBeCloseTo(original.bloomKnee!)
      expect(deserialized.bloomRadius).toBeCloseTo(original.bloomRadius!)
    })

    it('should preserve default surface shader settings when sh param is omitted', () => {
      const original: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        shaderType: 'surface',
        shaderSettings: {
          wireframe: { ...DEFAULT_SHADER_SETTINGS.wireframe },
          surface: {
            ...DEFAULT_SHADER_SETTINGS.surface,
            specularIntensity: 1.3,
          },
        },
      }

      const serialized = serializeState(original)
      const deserialized = deserializeState(serialized)

      expect(serialized).toContain('ss=')
      expect(serialized).not.toMatch(/(?:^|&)sh=/)
      expect(deserialized.shaderType).toBe('surface')
      expect(deserialized.shaderSettings?.surface.specularIntensity).toBeCloseTo(1.3)
    })

    it('should preserve skybox selection through serialize/deserialize cycle', () => {
      const original: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        skyboxSelection: 'procedural_nebula',
      }

      const serialized = serializeState(original)
      const deserialized = deserializeState(serialized)

      expect(deserialized.skyboxSelection).toBe('procedural_nebula')
    })

    it('should preserve core skybox controls through serialize/deserialize cycle', () => {
      const original: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        skyboxIntensity: 1.8,
        skyboxRotation: 2.2,
        skyboxAnimationMode: 'tumble',
        skyboxAnimationSpeed: 0.6,
        skyboxHighQuality: true,
      }

      const serialized = serializeState(original)
      const deserialized = deserializeState(serialized)

      expect(deserialized.skyboxIntensity).toBeCloseTo(1.8)
      expect(deserialized.skyboxRotation).toBeCloseTo(2.2)
      expect(deserialized.skyboxAnimationMode).toBe('tumble')
      expect(deserialized.skyboxAnimationSpeed).toBeCloseTo(0.6)
      expect(deserialized.skyboxHighQuality).toBe(true)
    })
  })

  describe('generateShareUrl', () => {
    it('should generate URL with state params', () => {
      const originalWindow = globalThis.window
      globalThis.window = {
        location: {
          origin: 'https://example.com',
          pathname: '/app',
        },
      } as unknown as Window & typeof globalThis

      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
      }
      const url = generateShareUrl(state)

      expect(url).toContain('https://example.com/app')
      expect(url).toContain('d=4')
      expect(url).toContain('t=schroedinger')

      globalThis.window = originalWindow
    })
  })
})
