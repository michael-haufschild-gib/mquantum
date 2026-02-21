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
    it('should serialize dimension and objectType', () => {
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

    it('should omit harmonicOscillator quantum mode (default)', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        quantumMode: 'harmonicOscillator',
      }
      const result = serializeState(state)
      expect(result).not.toContain('qm=')
    })
  })

  describe('deserializeState', () => {
    it('should deserialize dimension and objectType', () => {
      const result = deserializeState('d=5&t=schroedinger')
      expect(result.dimension).toBe(5)
      expect(result.objectType).toBe('schroedinger')
    })

    it('should deserialize valid quantum mode', () => {
      const result = deserializeState('qm=tdseDynamics')
      expect(result.quantumMode).toBe('tdseDynamics')
    })

    it('should ignore invalid quantum mode', () => {
      const result = deserializeState('qm=unknownMode')
      expect(result.quantumMode).toBeUndefined()
    })

    it('should ignore invalid objectType', () => {
      const result = deserializeState('t=invalid')
      expect(result.objectType).toBeUndefined()
    })

    it('should clamp dimension to valid range', () => {
      const tooLow = deserializeState('d=0')
      const tooHigh = deserializeState('d=99')
      expect(tooLow.dimension).toBeUndefined()
      expect(tooHigh.dimension).toBeUndefined()
    })

    it('should return scene param and skip other params', () => {
      const result = deserializeState('scene=my%20scene&d=5&t=schroedinger')
      expect(result.scene).toBe('my scene')
      expect(result.dimension).toBeUndefined()
      expect(result.objectType).toBeUndefined()
    })

    it('should ignore empty scene param', () => {
      const result = deserializeState('scene=&d=5')
      expect(result.scene).toBeUndefined()
      expect(result.dimension).toBe(5)
    })

    it('should return empty object for no params', () => {
      const result = deserializeState('')
      expect(Object.keys(result)).toHaveLength(0)
    })
  })

  describe('roundtrip serialization', () => {
    it('should preserve dimension/objectType/quantumMode', () => {
      const original: ShareableState = {
        dimension: 7,
        objectType: 'schroedinger',
        quantumMode: 'hydrogenND',
      }

      const serialized = serializeState(original)
      const deserialized = deserializeState(serialized)

      expect(deserialized.dimension).toBe(7)
      expect(deserialized.objectType).toBe('schroedinger')
      expect(deserialized.quantumMode).toBe('hydrogenND')
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
