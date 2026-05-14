import { describe, expect, it } from 'vitest'

import { COLOR_ALGORITHM_INDICES } from '@/rendering/webgpu/shaders/schroedinger/volume/emissionConstants'

import { optionsFromEnv } from './enumerateAll'
import { enumerateSchroedingerAnalytic } from './enumerateSchroedingerAnalytic'

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

  it('walks every shader color algorithm for analytic validation', () => {
    const emittedAlgorithms = new Set<number>()

    for (const rec of enumerateSchroedingerAnalytic({
      onlyMode: 'harmonicOscillator',
      maxUnique: 400,
    })) {
      const match = /_alg(\d+)_/.exec(rec.label)
      if (match?.[1]) emittedAlgorithms.add(Number.parseInt(match[1], 10))
      if (emittedAlgorithms.size === COLOR_ALGORITHM_INDICES.length) break
    }

    expect([...emittedAlgorithms].sort((a, b) => a - b)).toEqual(COLOR_ALGORITHM_INDICES)
  })
})
