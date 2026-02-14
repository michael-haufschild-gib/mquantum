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

    it('should serialize bloom v2 settings', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        bloomEnabled: true,
        bloomMode: 'convolution',
        bloomGain: 2.5,
        bloomThreshold: -1,
        bloomKnee: 0.25,
        bloomBands: [
          { enabled: true, weight: 1.0, size: 1.1, tint: '#FF0000' },
          { enabled: true, weight: 0.8, size: 1.2, tint: '#00FF00' },
          { enabled: false, weight: 0.0, size: 1.0, tint: '#0000FF' },
          { enabled: false, weight: 0.0, size: 1.0, tint: '#FFFFFF' },
          { enabled: false, weight: 0.0, size: 1.0, tint: '#FFFFFF' },
        ],
        bloomConvolutionRadius: 3,
        bloomConvolutionResolutionScale: 0.75,
        bloomConvolutionBoost: 1.8,
        bloomConvolutionTint: '#112233',
      }
      const result = serializeState(state)
      expect(result).toContain('be=1')
      expect(result).toContain('bm=c')
      expect(result).toContain('bga=2.50')
      expect(result).toContain('bt=-1.00')
      expect(result).toContain('bk=0.25')
      expect(result).toContain('bb0=1%7C1.00%7C1.10%7CFF0000')
      expect(result).toContain('bcr=3.00')
      expect(result).toContain('bcs=0.75')
      expect(result).toContain('bcb=1.80')
      expect(result).toContain('bct=112233')
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

    it('should deserialize bloom v2 settings', () => {
      const result = deserializeState(
        'be=1&bm=g&bga=2.20&bt=-1.00&bk=0.30&bb0=1|1.00|1.10|FF0000&bb1=1|0.80|1.20|00FF00&bcr=2.50&bcs=0.60&bcb=1.50&bct=abcdef'
      )

      expect(result.bloomEnabled).toBe(true)
      expect(result.bloomMode).toBe('gaussian')
      expect(result.bloomGain).toBeCloseTo(2.2)
      expect(result.bloomThreshold).toBeCloseTo(-1)
      expect(result.bloomKnee).toBeCloseTo(0.3)
      expect(result.bloomBands?.[0]).toEqual({
        enabled: true,
        weight: 1,
        size: 1.1,
        tint: '#FF0000',
      })
      expect(result.bloomBands?.[1]).toEqual({
        enabled: true,
        weight: 0.8,
        size: 1.2,
        tint: '#00FF00',
      })
      expect(result.bloomConvolutionRadius).toBeCloseTo(2.5)
      expect(result.bloomConvolutionResolutionScale).toBeCloseTo(0.6)
      expect(result.bloomConvolutionBoost).toBeCloseTo(1.5)
      expect(result.bloomConvolutionTint).toBe('#abcdef')
    })

    it('should reject out-of-range bloom v2 values', () => {
      const result = deserializeState('bga=99&bt=99&bk=99&bcr=99&bcs=99&bcb=99&bct=ZZZZZZ')
      expect(result.bloomGain).toBeUndefined()
      expect(result.bloomThreshold).toBeUndefined()
      expect(result.bloomKnee).toBeUndefined()
      expect(result.bloomConvolutionRadius).toBeUndefined()
      expect(result.bloomConvolutionResolutionScale).toBeUndefined()
      expect(result.bloomConvolutionBoost).toBeUndefined()
      expect(result.bloomConvolutionTint).toBeUndefined()
    })

    it('should ignore sparse bloom band tokens after first missing band', () => {
      const result = deserializeState('bb0=1|1.00|1.10|FF0000&bb2=1|0.60|1.20|00FF00')
      expect(result.bloomBands).toEqual([
        {
          enabled: true,
          weight: 1,
          size: 1.1,
          tint: '#FF0000',
        },
      ])
    })

    it('should normalize bloom band enabled flags to a contiguous prefix', () => {
      const result = deserializeState('bb0=1|1.00|1.00|FFFFFF&bb1=0|0.80|1.00|00FF00&bb2=1|0.60|1.00|FF0000')
      expect(result.bloomBands).toEqual([
        {
          enabled: true,
          weight: 1,
          size: 1,
          tint: '#FFFFFF',
        },
        {
          enabled: false,
          weight: 0.8,
          size: 1,
          tint: '#00FF00',
        },
        {
          enabled: false,
          weight: 0.6,
          size: 1,
          tint: '#FF0000',
        },
      ])
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
    it('should preserve bloom v2 state through serialize/deserialize cycle', () => {
      const original: ShareableState = {
        dimension: 5,
        objectType: 'schroedinger',
        bloomEnabled: true,
        bloomMode: 'convolution',
        bloomGain: 1.8,
        bloomThreshold: 1.2,
        bloomKnee: 0.12,
        bloomBands: [
          { enabled: true, weight: 1.0, size: 1.0, tint: '#ffffff' },
          { enabled: true, weight: 0.8, size: 1.1, tint: '#ffeeaa' },
          { enabled: true, weight: 0.6, size: 1.2, tint: '#aaffee' },
          { enabled: false, weight: 0.4, size: 1.3, tint: '#ffffff' },
          { enabled: false, weight: 0.2, size: 1.4, tint: '#ffffff' },
        ],
      }

      const serialized = serializeState(original)
      const deserialized = deserializeState(serialized)

      expect(deserialized.dimension).toBe(original.dimension)
      expect(deserialized.objectType).toBe(original.objectType)
      expect(deserialized.bloomMode).toBe(original.bloomMode)
      expect(deserialized.bloomGain).toBeCloseTo(original.bloomGain!)
      expect(deserialized.bloomThreshold).toBeCloseTo(original.bloomThreshold!)
      expect(deserialized.bloomKnee).toBeCloseTo(original.bloomKnee!)
      expect(deserialized.bloomBands?.[0]?.enabled).toBe(true)
      expect(deserialized.bloomBands?.[3]?.enabled).toBe(false)
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
