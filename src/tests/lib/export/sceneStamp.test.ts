import { describe, expect, it } from 'vitest'

import { buildSceneStamp } from '@/lib/export/sceneStamp'

describe('buildSceneStamp', () => {
  it('builds compact provenance from mode, dimension, and representation', () => {
    const stamp = buildSceneStamp({
      modeName: 'Hydrogen Orbitals',
      dimension: 4.2,
      representation: 'momentum',
    })

    expect(stamp).toBe('mquantum | Hydrogen Orbitals | 4D | Momentum')
  })

  it('omits optional fields and sanitizes empty mode names', () => {
    expect(buildSceneStamp({ modeName: ' ', dimension: Number.NaN })).toBe(
      'mquantum | Unknown mode | 1D'
    )
  })
})
