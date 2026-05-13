import { describe, expect, it } from 'vitest'

import {
  parseTintMax,
  selectTintRecords,
  tintOptionsFromEnv,
} from '../../../scripts/playwright/wgslTintSelection'

describe('wgslTintSelection', () => {
  it('spreads the default cap across late shader surfaces', () => {
    const records = selectTintRecords({ maxRecords: 16 })
    const surfaces = new Set(records.map((record) => record.surface))

    expect(records).toHaveLength(16)
    expect([...surfaces]).toEqual(
      expect.arrayContaining(['schroedinger-compute', 'skybox', 'wigner', 'passes'])
    )
  })

  it('honors subset narrowing', () => {
    const records = selectTintRecords({ maxRecords: 5, subsets: ['skybox'] })

    expect(records.length).toBeGreaterThan(0)
    expect(records.every((record) => record.surface === 'skybox')).toBe(true)
  })

  it('rejects malformed Tint caps', () => {
    expect(() => parseTintMax('abc')).toThrow(/WGSL_TINT_MAX/)
    expect(() => parseTintMax('0')).toThrow(/WGSL_TINT_MAX/)
    expect(() => parseTintMax('0.5')).toThrow(/WGSL_TINT_MAX/)
  })

  it('combines Tint and enumerator env caps conservatively', () => {
    expect(
      tintOptionsFromEnv({
        WGSL_TINT_MAX: '50',
        WGSL_MAX: '12',
        WGSL_SUBSET: 'skybox,wigner',
      })
    ).toEqual({
      maxUnique: 12,
      maxRecords: 12,
      subsets: ['skybox', 'wigner'],
    })
  })
})
