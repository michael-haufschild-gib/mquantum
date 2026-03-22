/**
 * Property-based tests for store setters.
 *
 * Verifies invariants that must hold for ANY input — not just hand-picked values.
 * Uses fast-check to generate thousands of arbitrary inputs and verify:
 * - Dimension is always in [MIN_DIMENSION, MAX_DIMENSION] and integer
 * - Scale is always in [0.1, 2.0]
 * - Quantum number cascade: l < n, |m| <= l
 * - NaN/Infinity never corrupts state
 * - Version counters are monotonically non-decreasing
 */

import fc from 'fast-check'
import { beforeEach, describe, expect, it } from 'vitest'

import { MAX_DIMENSION, MIN_DIMENSION } from '@/constants/dimension'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useRotationStore } from '@/stores/rotationStore'

describe('geometry store — property-based invariants', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useRotationStore.getState().setDimension(3)
  })

  it('setDimension always produces integer in [MIN, MAX] for any finite input', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 }),
        (input) => {
          useGeometryStore.getState().setDimension(input)
          const dim = useGeometryStore.getState().dimension
          expect(dim).toBeGreaterThanOrEqual(MIN_DIMENSION)
          expect(dim).toBeLessThanOrEqual(MAX_DIMENSION)
          expect(Number.isInteger(dim)).toBe(true)
        }
      ),
      { numRuns: 500 }
    )
  })

  it('setDimension is idempotent for non-finite inputs (NaN, ±Infinity)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          NaN,
          Infinity,
          -Infinity,
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY
        ),
        (poison) => {
          useGeometryStore.getState().setDimension(5) // set known good state
          const before = useGeometryStore.getState().dimension
          useGeometryStore.getState().setDimension(poison)
          expect(useGeometryStore.getState().dimension).toBe(before)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('rotation store dimension always matches geometry store dimension after setDimension', () => {
    fc.assert(
      fc.property(fc.integer({ min: MIN_DIMENSION, max: MAX_DIMENSION }), (dim) => {
        useGeometryStore.getState().setDimension(dim)
        expect(useRotationStore.getState().dimension).toBe(dim)
      }),
      { numRuns: 100 }
    )
  })
})

describe('extended object store — property-based invariants', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().reset()
  })

  it('setSchroedingerScale always produces value in [0.1, 2.0] for any finite input', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true, min: -100, max: 100 }),
        (input) => {
          useExtendedObjectStore.getState().setSchroedingerScale(input)
          const scale = useExtendedObjectStore.getState().schroedinger.scale
          expect(scale).toBeGreaterThanOrEqual(0.1)
          expect(scale).toBeLessThanOrEqual(2.0)
        }
      ),
      { numRuns: 500 }
    )
  })

  it('setSchroedingerScale ignores non-finite inputs', () => {
    fc.assert(
      fc.property(fc.constantFrom(NaN, Infinity, -Infinity), (poison) => {
        useExtendedObjectStore.getState().setSchroedingerScale(1.0)
        useExtendedObjectStore.getState().setSchroedingerScale(poison)
        expect(useExtendedObjectStore.getState().schroedinger.scale).toBe(1.0)
      }),
      { numRuns: 30 }
    )
  })

  it('setSchroedingerDensityGain always produces value in [0.01, 50] for any finite input', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true, min: -100, max: 200 }),
        (input) => {
          useExtendedObjectStore.getState().setSchroedingerDensityGain(input)
          const gain = useExtendedObjectStore.getState().schroedinger.densityGain
          expect(gain).toBeGreaterThanOrEqual(0.01)
          expect(gain).toBeLessThanOrEqual(50)
        }
      ),
      { numRuns: 300 }
    )
  })

  it('setSchroedingerTermCount always produces integer in [1, 8]', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true, min: -100, max: 100 }),
        (input) => {
          useExtendedObjectStore.getState().setSchroedingerTermCount(input)
          const tc = useExtendedObjectStore.getState().schroedinger.termCount
          expect(tc).toBeGreaterThanOrEqual(1)
          expect(tc).toBeLessThanOrEqual(8)
          expect(Number.isInteger(tc)).toBe(true)
        }
      ),
      { numRuns: 300 }
    )
  })
})

describe('quantum number cascade — property-based invariant', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('l is always < n after setting any combination of n then l', () => {
    fc.assert(
      fc.property(fc.integer({ min: -10, max: 20 }), fc.integer({ min: -10, max: 20 }), (n, l) => {
        useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(n)
        useExtendedObjectStore.getState().setSchroedingerAzimuthalQuantumNumber(l)
        const state = useExtendedObjectStore.getState().schroedinger
        expect(state.azimuthalQuantumNumber).toBeLessThan(state.principalQuantumNumber)
        expect(state.azimuthalQuantumNumber).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 500 }
    )
  })

  it('|m| <= l after setting any combination of n, l, m', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10, max: 20 }),
        fc.integer({ min: -10, max: 20 }),
        fc.integer({ min: -20, max: 20 }),
        (n, l, m) => {
          useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(n)
          useExtendedObjectStore.getState().setSchroedingerAzimuthalQuantumNumber(l)
          useExtendedObjectStore.getState().setSchroedingerMagneticQuantumNumber(m)
          const state = useExtendedObjectStore.getState().schroedinger
          expect(Math.abs(state.magneticQuantumNumber)).toBeLessThanOrEqual(
            state.azimuthalQuantumNumber
          )
        }
      ),
      { numRuns: 500 }
    )
  })

  it('decreasing n cascades l and m correctly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 7 }), fc.integer({ min: 1, max: 3 }), (highN, lowN) => {
        // Set high n first, then set l and m to near-max
        useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(highN)
        useExtendedObjectStore.getState().setSchroedingerAzimuthalQuantumNumber(highN - 1)
        useExtendedObjectStore.getState().setSchroedingerMagneticQuantumNumber(highN - 1)

        // Now decrease n
        useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(lowN)
        const state = useExtendedObjectStore.getState().schroedinger

        // Invariants must still hold
        expect(state.principalQuantumNumber).toBeGreaterThanOrEqual(1)
        expect(state.principalQuantumNumber).toBeLessThanOrEqual(7)
        expect(state.azimuthalQuantumNumber).toBeLessThan(state.principalQuantumNumber)
        expect(state.azimuthalQuantumNumber).toBeGreaterThanOrEqual(0)
        expect(Math.abs(state.magneticQuantumNumber)).toBeLessThanOrEqual(
          state.azimuthalQuantumNumber
        )
      }),
      { numRuns: 300 }
    )
  })
})

describe('version counter monotonicity — property-based', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('schroedingerVersion never decreases across arbitrary setter calls', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.record({
              type: fc.constant('scale' as const),
              value: fc.double({ min: 0.1, max: 2.0, noNaN: true, noDefaultInfinity: true }),
            }),
            fc.record({
              type: fc.constant('densityGain' as const),
              value: fc.double({ min: 0.01, max: 50, noNaN: true, noDefaultInfinity: true }),
            }),
            fc.record({
              type: fc.constant('termCount' as const),
              value: fc.integer({ min: 1, max: 8 }),
            })
          ),
          { minLength: 1, maxLength: 20 }
        ),
        (operations) => {
          let prevVersion = useExtendedObjectStore.getState().schroedingerVersion
          for (const op of operations) {
            switch (op.type) {
              case 'scale':
                useExtendedObjectStore.getState().setSchroedingerScale(op.value)
                break
              case 'densityGain':
                useExtendedObjectStore.getState().setSchroedingerDensityGain(op.value)
                break
              case 'termCount':
                useExtendedObjectStore.getState().setSchroedingerTermCount(op.value)
                break
            }
            const newVersion = useExtendedObjectStore.getState().schroedingerVersion
            expect(newVersion).toBeGreaterThanOrEqual(prevVersion)
            prevVersion = newVersion
          }
        }
      ),
      { numRuns: 200 }
    )
  })
})
