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

    it('should include uniformScale when not 1', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        uniformScale: 1.5,
      }
      const result = serializeState(state)
      expect(result).toContain('s=1.50')
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
