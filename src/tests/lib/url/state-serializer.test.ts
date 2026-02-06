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

    it('should omit uniformScale when it equals 1', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        uniformScale: 1,
      }
      const result = serializeState(state)
      expect(result).not.toContain('s=')
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

    it('should serialize edgeColor without #', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        edgeColor: '#FF0000',
      }
      const result = serializeState(state)
      expect(result).toContain('ec=FF0000')
      expect(result).not.toContain('ec=#')
    })

    it('should serialize backgroundColor without #', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        backgroundColor: '#000000',
      }
      const result = serializeState(state)
      expect(result).toContain('bg=000000')
    })

    it('should serialize bloom settings', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        bloomEnabled: false,
        bloomIntensity: 0.75,
        bloomThreshold: 0.3,
        bloomRadius: 0.2,
      }
      const result = serializeState(state)
      expect(result).toContain('be=0')
      expect(result).toContain('bi=0.75')
      expect(result).toContain('bt=0.30')
      expect(result).toContain('br=0.20')
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
    it('should deserialize dimension', () => {
      const result = deserializeState('d=5')
      expect(result.dimension).toBe(5)
    })

    it('should clamp dimension to valid range', () => {
      const resultLow = deserializeState('d=1')
      expect(resultLow.dimension).toBeUndefined()

      const resultHigh = deserializeState('d=20')
      expect(resultHigh.dimension).toBeUndefined()
    })

    it('should deserialize objectType', () => {
      const result = deserializeState('t=schroedinger')
      expect(result.objectType).toBe('schroedinger')
    })

    it('should ignore invalid objectType', () => {
      const result = deserializeState('t=invalid')
      expect(result.objectType).toBeUndefined()
    })

    it('should deserialize uniformScale', () => {
      const result = deserializeState('s=1.50')
      expect(result.uniformScale).toBeCloseTo(1.5)
    })

    it('should ignore invalid uniformScale', () => {
      const result = deserializeState('s=abc')
      expect(result.uniformScale).toBeUndefined()

      const resultNegative = deserializeState('s=-1')
      expect(resultNegative.uniformScale).toBeUndefined()
    })

    it('should deserialize colors with # prefix', () => {
      const result = deserializeState('ec=FF0000&bg=000000')
      expect(result.edgeColor).toBe('#FF0000')
      expect(result.backgroundColor).toBe('#000000')
    })

    it('should ignore invalid hex colors', () => {
      const result = deserializeState('ec=GG0000')
      expect(result.edgeColor).toBeUndefined()
    })

    it('should ignore legacy edges visibility URL param', () => {
      const result = deserializeState('ev=0')
      expect('edgesVisible' in result).toBe(false)
    })

    it('should ignore legacy faces visibility URL param', () => {
      const result = deserializeState('fv=0')
      expect('facesVisible' in result).toBe(false)
    })

    it('should deserialize bloom settings', () => {
      const result = deserializeState('be=0&bi=0.50&bt=0.30&br=0.20')
      expect(result.bloomEnabled).toBe(false)
      expect(result.bloomIntensity).toBeCloseTo(0.5)
      expect(result.bloomThreshold).toBeCloseTo(0.3)
      expect(result.bloomRadius).toBeCloseTo(0.2)
    })

    it('should clamp bloom values to valid ranges', () => {
      const result = deserializeState('bi=10&bt=5&br=5')
      // Out of range values should be ignored
      expect(result.bloomIntensity).toBeUndefined()
      expect(result.bloomThreshold).toBeUndefined()
      expect(result.bloomRadius).toBeUndefined()
    })

    it('should ignore bloomLevels above the implemented max', () => {
      const result = deserializeState('bl=8')
      expect(result.bloomLevels).toBeUndefined()
    })

    it('should deserialize tone mapping settings', () => {
      const result = deserializeState('tm=0&ta=reinhard&ex=1.5')
      expect(result.toneMappingEnabled).toBe(false)
      expect(result.toneMappingAlgorithm).toBe('reinhard')
      expect(result.exposure).toBeCloseTo(1.5)
    })

    it('should handle legacy dualOutline shader type', () => {
      const result = deserializeState('sh=dualOutline')
      expect(result.shaderType).toBe('wireframe')
    })

    it('should deserialize specular color', () => {
      const result = deserializeState('sc=FFFFFF')
      expect(result.specularColor).toBe('#FFFFFF')
    })
  })

  describe('roundtrip serialization', () => {
    it('should preserve state through serialize/deserialize cycle', () => {
      const original: ShareableState = {
        dimension: 5,
        objectType: 'schroedinger',
        uniformScale: 1.5,
        edgeColor: '#00FF00',
        backgroundColor: '#111111',
        bloomEnabled: true,
        bloomIntensity: 0.8,
        toneMappingEnabled: true,
        exposure: 1.2,
      }

      const serialized = serializeState(original)
      const deserialized = deserializeState(serialized)

      expect(deserialized.dimension).toBe(original.dimension)
      expect(deserialized.objectType).toBe(original.objectType)
      expect(deserialized.uniformScale).toBeCloseTo(original.uniformScale!)
      expect(deserialized.edgeColor).toBe(original.edgeColor)
      expect(deserialized.backgroundColor).toBe(original.backgroundColor)
    })
  })

  describe('generateShareUrl', () => {
    it('should generate URL with state params', () => {
      // Mock window.location
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

    it('should return base URL when no params needed (minimal state)', () => {
      // Mock window.location
      const originalWindow = globalThis.window
      globalThis.window = {
        location: {
          origin: 'https://example.com',
          pathname: '/',
        },
      } as unknown as Window & typeof globalThis

      const state: ShareableState = {
        dimension: 4, // Always required
        objectType: 'schroedinger', // Always required
      }
      const url = generateShareUrl(state)

      // Should have params since dimension and objectType are always serialized
      expect(url).toContain('?')

      globalThis.window = originalWindow
    })
  })
})
