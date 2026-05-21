import { describe, expect, it } from 'vitest'

import { buildSceneStamp } from '@/lib/export/sceneStamp'

describe('buildSceneStamp', () => {
  it('builds compact provenance from mode, dimension, representation, and validation', () => {
    const stamp = buildSceneStamp({
      modeName: 'Hydrogen Orbitals',
      dimension: 4.2,
      representation: 'momentum',
      validation: {
        levels: ['R', 'A', 'P'],
        confidence: 'strong',
        summary: 'Reference-backed hydrogen checks.',
        testRefs: ['src/tests/lib/physics/hydrogenNistReferenceData.test.ts'],
        source: 'docs/physics/validation-status.md',
      },
    })

    expect(stamp).toBe('mquantum | Hydrogen Orbitals | 4D | Momentum | R+A+P strong evidence')
  })

  it('omits optional fields and sanitizes empty mode names', () => {
    expect(buildSceneStamp({ modeName: ' ', dimension: Number.NaN })).toBe(
      'mquantum | Unknown mode | 1D'
    )
  })
})
