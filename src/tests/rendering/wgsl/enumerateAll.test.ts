import { describe, expect, it } from 'vitest'

import { optionsFromEnv } from './enumerateAll'

describe('optionsFromEnv', () => {
  it('parses explicit shader-validation env controls', () => {
    expect(
      optionsFromEnv({
        WGSL_SUBSET: 'skybox,wigner',
        WGSL_MODE: 'hydrogenND',
        WGSL_MAX: '12',
      })
    ).toEqual({
      subsets: ['skybox', 'wigner'],
      onlyMode: 'hydrogenND',
      maxUnique: 12,
    })
  })

  it('rejects fractional or malformed WGSL_MAX caps', () => {
    expect(() => optionsFromEnv({ WGSL_MAX: '12.5' })).toThrow(/WGSL_MAX/)
    expect(() => optionsFromEnv({ WGSL_MAX: 'abc' })).toThrow(/WGSL_MAX/)
    expect(() => optionsFromEnv({ WGSL_MAX: '0' })).toThrow(/WGSL_MAX/)
  })
})
