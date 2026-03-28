/**
 * Tests for URL state serializer
 */

import { describe, expect, it } from 'vitest'

import {
  deserializeState,
  generateShareUrl,
  serializeState,
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
      expect(tooLow.dimension).toBe(2) // clamped to MIN_DIMENSION
      expect(tooHigh.dimension).toBe(11) // clamped to MAX_DIMENSION
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

    it('should roundtrip all quantum modes', () => {
      const modes = [
        'hydrogenND',
        'freeScalarField',
        'tdseDynamics',
        'becDynamics',
        'diracEquation',
      ] as const

      for (const mode of modes) {
        const serialized = serializeState({
          dimension: 3,
          objectType: 'schroedinger',
          quantumMode: mode,
        })
        const deserialized = deserializeState(serialized)
        expect(deserialized.quantumMode, `roundtrip failed for ${mode}`).toBe(mode)
      }
    })

    it('should roundtrip all valid dimensions (3-11)', () => {
      for (let d = 3; d <= 11; d++) {
        const serialized = serializeState({ dimension: d, objectType: 'schroedinger' })
        const deserialized = deserializeState(serialized)
        expect(deserialized.dimension, `roundtrip failed for d=${d}`).toBe(d)
      }
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

  describe('extended params', () => {
    it('roundtrips representation mode', () => {
      for (const repr of ['position', 'momentum', 'wigner'] as const) {
        const s = serializeState({ dimension: 3, objectType: 'schroedinger', representation: repr })
        const d = deserializeState(s)
        expect(d.representation, `roundtrip failed for repr=${repr}`).toBe(repr)
      }
    })

    it('roundtrips boolean flags', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        isoEnabled: true,
        crossSectionEnabled: true,
        observablesEnabled: true,
        diagnosticsEnabled: true,
        absorberEnabled: false,
        imaginaryTimeEnabled: true,
        classicalOverlayEnabled: true,
      }
      const d = deserializeState(serializeState(state))
      expect(d.isoEnabled).toBe(true)
      expect(d.crossSectionEnabled).toBe(true)
      expect(d.observablesEnabled).toBe(true)
      expect(d.diagnosticsEnabled).toBe(true)
      expect(d.absorberEnabled).toBe(false)
      expect(d.imaginaryTimeEnabled).toBe(true)
      expect(d.classicalOverlayEnabled).toBe(true)
    })

    it('roundtrips numeric params with clamping', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        isoThreshold: -3,
        densityGain: 5.0,
        scale: 1.5,
        termCount: 4,
        seed: 42,
        hydrogenN: 3,
        hydrogenL: 2,
        hydrogenM: -1,
      }
      const d = deserializeState(serializeState(state))
      expect(d.isoThreshold).toBeCloseTo(-3)
      expect(d.densityGain).toBeCloseTo(5.0)
      expect(d.scale).toBeCloseTo(1.5)
      expect(d.termCount).toBe(4)
      expect(d.seed).toBe(42)
      expect(d.hydrogenN).toBe(3)
      expect(d.hydrogenL).toBe(2)
      expect(d.hydrogenM).toBe(-1)
    })

    it('roundtrips TDSE potential type', () => {
      for (const pot of ['free', 'barrier', 'harmonicTrap', 'doubleSlit'] as const) {
        const s = serializeState({ dimension: 3, objectType: 'schroedinger', potentialType: pot })
        expect(deserializeState(s).potentialType, `roundtrip failed for pot=${pot}`).toBe(pot)
      }
    })

    it('clamps numeric params to valid ranges', () => {
      const d = deserializeState('tc=99&hyd_n=-5&hyd_l=99&hyd_m=-99&scale=100&dg=-1&iso_t=5')
      expect(d.termCount).toBe(8) // clamped to max
      expect(d.hydrogenN).toBe(1) // clamped to min
      expect(d.hydrogenL).toBe(6) // clamped to max
      expect(d.hydrogenM).toBe(-6) // clamped to min
      expect(d.scale).toBeCloseTo(2.0) // clamped to max
      expect(d.densityGain).toBeCloseTo(0.01) // clamped to min
      expect(d.isoThreshold).toBeCloseTo(0) // clamped to max
    })

    it('ignores invalid enum values', () => {
      const d = deserializeState('repr=invalid&pot=unknown')
      expect(d.representation).toBeUndefined()
      expect(d.potentialType).toBeUndefined()
    })

    it('omits undefined extended params from serialized output', () => {
      const s = serializeState({ dimension: 3, objectType: 'schroedinger' })
      expect(s).not.toContain('repr=')
      expect(s).not.toContain('iso=')
      expect(s).not.toContain('tc=')
      expect(s).not.toContain('obs=')
    })

    it('strips undefined keys from deserialized output', () => {
      const d = deserializeState('d=3&t=schroedinger')
      expect(Object.keys(d)).toEqual(['dimension', 'objectType'])
    })

    it('full TDSE scene roundtrip with all extended params', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'tdseDynamics',
        potentialType: 'harmonicTrap',
        absorberEnabled: false,
        diagnosticsEnabled: true,
        observablesEnabled: true,
        imaginaryTimeEnabled: false,
      }
      const d = deserializeState(serializeState(state))
      expect(d.quantumMode).toBe('tdseDynamics')
      expect(d.potentialType).toBe('harmonicTrap')
      expect(d.absorberEnabled).toBe(false)
      expect(d.diagnosticsEnabled).toBe(true)
      expect(d.observablesEnabled).toBe(true)
      expect(d.imaginaryTimeEnabled).toBe(false)
    })

    it('roundtrips coupledAnharmonic with anharmonicLambda', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'tdseDynamics',
        potentialType: 'coupledAnharmonic',
        anharmonicLambda: 5.5,
      }
      const d = deserializeState(serializeState(state))
      expect(d.potentialType).toBe('coupledAnharmonic')
      expect(d.anharmonicLambda).toBeCloseTo(5.5, 1)
    })

    it('omits anharmonicLambda for non-coupledAnharmonic potentials', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        potentialType: 'harmonicTrap',
      }
      const s = serializeState(state)
      expect(s).not.toContain('anh_l')
    })

    it('roundtrips andersonDisorder with disorder params', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'tdseDynamics',
        potentialType: 'andersonDisorder',
        disorderStrength: 8.0,
        disorderSeed: 42,
        disorderDistribution: 'gaussian',
      }
      const d = deserializeState(serializeState(state))
      expect(d.potentialType).toBe('andersonDisorder')
      expect(d.disorderStrength).toBeCloseTo(8.0, 1)
      expect(d.disorderSeed).toBe(42)
      expect(d.disorderDistribution).toBe('gaussian')
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
