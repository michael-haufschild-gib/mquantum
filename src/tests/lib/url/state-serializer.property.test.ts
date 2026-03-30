/**
 * Property-based tests for URL state serializer.
 *
 * Uses fast-check to verify roundtrip fidelity, injection safety,
 * and deserialization robustness across arbitrary inputs.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { deserializeState, serializeState, type ShareableState } from '@/lib/url/state-serializer'

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const QUANTUM_MODES = [
  'harmonicOscillator',
  'hydrogenND',
  'freeScalarField',
  'tdseDynamics',
  'becDynamics',
  'diracEquation',
  'quantumWalk',
] as const

const REPRESENTATIONS = ['position', 'momentum', 'wigner'] as const

const POTENTIAL_TYPES = [
  'free',
  'barrier',
  'step',
  'finiteWell',
  'harmonicTrap',
  'driven',
  'doubleSlit',
  'periodicLattice',
  'doubleWell',
] as const

/** Arbitrary valid ShareableObjectState with all optional fields populated. */
const arbObjectState: fc.Arbitrary<ShareableState> = fc.record(
  {
    dimension: fc.integer({ min: 2, max: 11 }),
    objectType: fc.constant('schroedinger' as const),
    quantumMode: fc.constantFrom(...QUANTUM_MODES),
    representation: fc.constantFrom(...REPRESENTATIONS),
    isoEnabled: fc.boolean(),
    isoThreshold: fc.double({ min: -6, max: 0, noNaN: true, noDefaultInfinity: true }),
    crossSectionEnabled: fc.boolean(),
    densityGain: fc.double({ min: 0.01, max: 50, noNaN: true, noDefaultInfinity: true }),
    scale: fc.double({ min: 0.1, max: 2.0, noNaN: true, noDefaultInfinity: true }),
    termCount: fc.integer({ min: 1, max: 8 }),
    seed: fc.integer({ min: 0, max: 999999 }),
    hydrogenN: fc.integer({ min: 1, max: 7 }),
    hydrogenL: fc.integer({ min: 0, max: 6 }),
    hydrogenM: fc.integer({ min: -6, max: 6 }),
    potentialType: fc.constantFrom(...POTENTIAL_TYPES),
    absorberEnabled: fc.boolean(),
    diagnosticsEnabled: fc.boolean(),
    observablesEnabled: fc.boolean(),
    imaginaryTimeEnabled: fc.boolean(),
  },
  { requiredKeys: ['dimension', 'objectType'] }
)

/** Arbitrary valid scene state. */
const arbSceneState: fc.Arbitrary<ShareableState> = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)
  .map((scene) => ({ scene }))

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('state-serializer property-based tests', () => {
  it('roundtrip preserves dimension and objectType for any valid object state', () => {
    fc.assert(
      fc.property(arbObjectState, (state) => {
        if ('scene' in state) return // skip scene states
        const serialized = serializeState(state)
        const deserialized = deserializeState(serialized)
        expect(deserialized.dimension).toBe(state.dimension)
        expect(deserialized.objectType).toBe(state.objectType)
      }),
      { numRuns: 200 }
    )
  })

  it('roundtrip preserves quantum mode (non-default modes)', () => {
    fc.assert(
      fc.property(arbObjectState, (state) => {
        if ('scene' in state) return
        const serialized = serializeState(state)
        const deserialized = deserializeState(serialized)
        if (state.quantumMode && state.quantumMode !== 'harmonicOscillator') {
          expect(deserialized.quantumMode).toBe(state.quantumMode)
        }
      }),
      { numRuns: 200 }
    )
  })

  it('roundtrip preserves boolean flags exactly', () => {
    fc.assert(
      fc.property(arbObjectState, (state) => {
        if ('scene' in state) return
        const serialized = serializeState(state)
        const deserialized = deserializeState(serialized)

        // Boolean fields should roundtrip exactly
        if (state.isoEnabled !== undefined) {
          expect(deserialized.isoEnabled).toBe(state.isoEnabled)
        }
        if (state.crossSectionEnabled !== undefined) {
          expect(deserialized.crossSectionEnabled).toBe(state.crossSectionEnabled)
        }
        if (state.absorberEnabled !== undefined) {
          expect(deserialized.absorberEnabled).toBe(state.absorberEnabled)
        }
        if (state.diagnosticsEnabled !== undefined) {
          expect(deserialized.diagnosticsEnabled).toBe(state.diagnosticsEnabled)
        }
        if (state.observablesEnabled !== undefined) {
          expect(deserialized.observablesEnabled).toBe(state.observablesEnabled)
        }
        if (state.imaginaryTimeEnabled !== undefined) {
          expect(deserialized.imaginaryTimeEnabled).toBe(state.imaginaryTimeEnabled)
        }
      }),
      { numRuns: 200 }
    )
  })

  it('roundtrip preserves integer params exactly', () => {
    fc.assert(
      fc.property(arbObjectState, (state) => {
        if ('scene' in state) return
        const serialized = serializeState(state)
        const deserialized = deserializeState(serialized)

        if (state.termCount !== undefined) {
          expect(deserialized.termCount).toBe(state.termCount)
        }
        if (state.seed !== undefined) {
          expect(deserialized.seed).toBe(state.seed)
        }
        if (state.hydrogenN !== undefined) {
          expect(deserialized.hydrogenN).toBe(state.hydrogenN)
        }
        if (state.hydrogenL !== undefined) {
          expect(deserialized.hydrogenL).toBe(state.hydrogenL)
        }
        if (state.hydrogenM !== undefined) {
          expect(deserialized.hydrogenM).toBe(state.hydrogenM)
        }
      }),
      { numRuns: 200 }
    )
  })

  it('roundtrip preserves float params within serialization precision', () => {
    fc.assert(
      fc.property(arbObjectState, (state) => {
        if ('scene' in state) return
        const serialized = serializeState(state)
        const deserialized = deserializeState(serialized)

        // Floats are serialized with .toFixed(2), so precision is 0.01
        if (state.isoThreshold !== undefined) {
          expect(deserialized.isoThreshold).toBeCloseTo(state.isoThreshold, 1)
        }
        if (state.densityGain !== undefined) {
          expect(deserialized.densityGain).toBeCloseTo(state.densityGain, 1)
        }
        if (state.scale !== undefined) {
          expect(deserialized.scale).toBeCloseTo(state.scale, 1)
        }
      }),
      { numRuns: 200 }
    )
  })

  it('scene state roundtrip preserves scene name', () => {
    fc.assert(
      fc.property(arbSceneState, (state) => {
        if (!('scene' in state)) return
        const serialized = serializeState(state)
        const deserialized = deserializeState(serialized)
        expect(deserialized.scene).toBe(state.scene.trim())
      }),
      { numRuns: 100 }
    )
  })

  it('deserializeState never throws on arbitrary input strings', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), (input) => {
        // Should never throw, even on garbage input
        const result = deserializeState(input)
        // Result must be a plain object (not null, not an array)
        expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
      }),
      { numRuns: 500 }
    )
  })

  it('serialized output contains no undefined or null tokens', () => {
    fc.assert(
      fc.property(arbObjectState, (state) => {
        const serialized = serializeState(state)
        expect(serialized).not.toContain('undefined')
        expect(serialized).not.toContain('null')
        expect(serialized).not.toContain('NaN')
      }),
      { numRuns: 200 }
    )
  })

  it('deserialized output contains only keys with defined values', () => {
    fc.assert(
      fc.property(arbObjectState, (state) => {
        const serialized = serializeState(state)
        const deserialized = deserializeState(serialized)
        for (const [key, value] of Object.entries(deserialized)) {
          expect(value, `key "${key}" should not be undefined`).not.toBeUndefined()
        }
      }),
      { numRuns: 200 }
    )
  })

  it('URL-encoded special characters in scene names survive roundtrip', () => {
    const tricky = [
      'test scene',
      'Schrödinger bloom',
      'mode=3&d=5',
      'a+b',
      '100%',
      'scene with "quotes"',
    ]
    for (const name of tricky) {
      const serialized = serializeState({ scene: name })
      const deserialized = deserializeState(serialized)
      expect(deserialized.scene).toBe(name)
    }
  })

  it('open quantum rates only appear when oq=1', () => {
    fc.assert(
      fc.property(arbObjectState, (state) => {
        if ('scene' in state) return
        const serialized = serializeState(state)
        if (!state.openQuantumEnabled) {
          expect(serialized).not.toContain('oq_dp=')
          expect(serialized).not.toContain('oq_rx=')
          expect(serialized).not.toContain('oq_th=')
        }
      }),
      { numRuns: 200 }
    )
  })
})
