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

    it('should serialize scene-only payloads and skip object params', () => {
      const state: ShareableState = {
        scene: 'schroedinger bloom',
      }

      const result = serializeState(state)
      expect(result).toBe('scene=schroedinger+bloom')
      expect(result).not.toContain('d=')
      expect(result).not.toContain('t=')
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

    it('should reject malformed dimension tokens', () => {
      const trailingText = deserializeState('d=4abc&t=schroedinger')
      const decimalNumber = deserializeState('d=3.9&t=schroedinger')

      expect(trailingText.dimension).toBeUndefined()
      expect(decimalNumber.dimension).toBeUndefined()
      expect(trailingText.objectType).toBe('schroedinger')
      expect(decimalNumber.objectType).toBe('schroedinger')
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

  describe('open quantum params', () => {
    it('serializes oq params when enabled', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        openQuantumEnabled: true,
        openQuantumDephasingRate: 1.5,
        openQuantumRelaxationRate: 0.3,
        openQuantumThermalUpRate: 0.0,
      }
      const result = serializeState(state)
      expect(result).toContain('oq=1')
      expect(result).toContain('oq_dp=1.50')
      expect(result).toContain('oq_rx=0.30')
      // thermalUpRate=0 should be omitted
      expect(result).not.toContain('oq_th')
    })

    it('omits all oq params when disabled', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        openQuantumEnabled: false,
        openQuantumDephasingRate: 2.0,
      }
      const result = serializeState(state)
      expect(result).not.toContain('oq')
      expect(result).not.toContain('oq_dp')
    })

    it('deserializes oq params', () => {
      const result = deserializeState('d=3&t=schroedinger&oq=1&oq_dp=1.50&oq_rx=0.30&oq_th=0.10')
      expect(result.openQuantumEnabled).toBe(true)
      expect(result.openQuantumDephasingRate).toBeCloseTo(1.5)
      expect(result.openQuantumRelaxationRate).toBeCloseTo(0.3)
      expect(result.openQuantumThermalUpRate).toBeCloseTo(0.1)
    })

    it('clamps oq rates to [0, 5]', () => {
      const result = deserializeState('oq=1&oq_dp=-1&oq_rx=99')
      expect(result.openQuantumDephasingRate).toBe(0)
      expect(result.openQuantumRelaxationRate).toBe(5)
    })

    it('ignores oq rate params when oq is not 1', () => {
      const result = deserializeState('oq_dp=2.0')
      expect(result.openQuantumEnabled).toBeUndefined()
      expect(result.openQuantumDephasingRate).toBeUndefined()
    })

    it('rejects non-finite oq rate values', () => {
      const result = deserializeState('oq=1&oq_dp=NaN&oq_rx=Infinity')
      expect(result.openQuantumDephasingRate).toBeUndefined()
      expect(result.openQuantumRelaxationRate).toBeUndefined()
    })

    it('roundtrips open quantum state', () => {
      const original: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        openQuantumEnabled: true,
        openQuantumDephasingRate: 2.5,
        openQuantumRelaxationRate: 1.0,
        openQuantumThermalUpRate: 0.5,
      }
      const serialized = serializeState(original)
      const deserialized = deserializeState(serialized)

      expect(deserialized.openQuantumEnabled).toBe(true)
      expect(deserialized.openQuantumDephasingRate).toBeCloseTo(2.5)
      expect(deserialized.openQuantumRelaxationRate).toBeCloseTo(1.0)
      expect(deserialized.openQuantumThermalUpRate).toBeCloseTo(0.5)
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
