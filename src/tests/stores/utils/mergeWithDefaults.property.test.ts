/**
 * Property-based fuzz tests for mergeExtendedObjectStateForType.
 *
 * Generates arbitrary JSON-like objects and verifies that the merge
 * function never throws and always produces a structurally valid result.
 * Catches bugs where unexpected input shapes (wrong types, missing keys,
 * deeply nested garbage) cause runtime crashes or corrupt the config.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/types'
import { mergeExtendedObjectStateForType } from '@/stores/utils/mergeWithDefaults'

/** Arbitrary that produces JSON-compatible values including objects, arrays, primitives, null. */
const arbJsonValue: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  value: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.constant(null),
    fc.boolean(),
    fc.double({ noNaN: true, noDefaultInfinity: true }),
    fc.integer(),
    fc.string({ maxLength: 20 }),
    fc.array(tie('value'), { maxLength: 5 }),
    fc.dictionary(fc.string({ maxLength: 10 }), tie('value'), { maxKeys: 8 })
  ),
})).value

/** Arbitrary object that resembles a partial schroedinger config (some real keys, some garbage). */
const arbPartialConfig = fc.dictionary(
  fc.oneof(
    // Mix real keys with garbage keys
    fc.constantFrom(
      'quantumMode',
      'scale',
      'densityGain',
      'termCount',
      'sampleCount',
      'cosineParams',
      'parameterValues',
      'isoEnabled',
      'isoThreshold'
    ),
    fc.string({ maxLength: 15 })
  ),
  arbJsonValue,
  { maxKeys: 12 }
)

describe('mergeExtendedObjectStateForType — fuzz testing', () => {
  it('never throws for arbitrary schroedinger config objects', () => {
    fc.assert(
      fc.property(arbPartialConfig, (partialConfig) => {
        // Should never throw, regardless of input shape
        const result = mergeExtendedObjectStateForType(
          { schroedinger: partialConfig },
          'schroedinger'
        )
        expect(result).toHaveProperty('schroedinger')
        expect(Object.keys(result.schroedinger as object).length).toBeGreaterThan(0)
      }),
      { numRuns: 500 }
    )
  })

  it('result always contains all default top-level keys', () => {
    const defaultKeys = Object.keys(DEFAULT_SCHROEDINGER_CONFIG)

    fc.assert(
      fc.property(arbPartialConfig, (partialConfig) => {
        const result = mergeExtendedObjectStateForType(
          { schroedinger: partialConfig },
          'schroedinger'
        )
        const resultKeys = Object.keys(result.schroedinger as object)

        for (const key of defaultKeys) {
          expect(resultKeys, `missing key: ${key}`).toContain(key)
        }
      }),
      { numRuns: 300 }
    )
  })

  it('cosineParams always has arrays of length 3 regardless of input', () => {
    fc.assert(
      fc.property(arbPartialConfig, (partialConfig) => {
        const result = mergeExtendedObjectStateForType(
          { schroedinger: partialConfig },
          'schroedinger'
        )
        const sch = result.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG
        // cosineParams must always be an object with a/b/c/d arrays
        expect(sch.cosineParams).toHaveProperty('a')
        expect(sch.cosineParams).toHaveProperty('b')
        expect(sch.cosineParams).toHaveProperty('c')
        expect(sch.cosineParams).toHaveProperty('d')
        expect(sch.cosineParams.a).toHaveLength(3)
        expect(sch.cosineParams.b).toHaveLength(3)
        expect(sch.cosineParams.c).toHaveLength(3)
        expect(sch.cosineParams.d).toHaveLength(3)
      }),
      { numRuns: 500 }
    )
  })

  it('never throws for null, undefined, or non-object schroedinger config', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.integer(),
          fc.string(),
          fc.boolean(),
          fc.array(fc.integer())
        ),
        (garbage) => {
          const result = mergeExtendedObjectStateForType({ schroedinger: garbage }, 'schroedinger')
          expect(result).toHaveProperty('schroedinger')
          const sch = result.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG
          // Should be full defaults
          expect(sch.sampleCount).toBe(DEFAULT_SCHROEDINGER_CONFIG.sampleCount)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('never throws when entire loaded state is garbage', () => {
    fc.assert(
      fc.property(arbJsonValue, (garbage) => {
        // Should never throw, even when the entire loaded object is garbage
        const result = mergeExtendedObjectStateForType(
          garbage as Record<string, unknown>,
          'schroedinger'
        )
        expect(result).toHaveProperty('schroedinger')
        const sch = result.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG
        // Should fall back to full defaults
        expect(sch.sampleCount).toBe(DEFAULT_SCHROEDINGER_CONFIG.sampleCount)
      }),
      { numRuns: 200 }
    )
  })
})
