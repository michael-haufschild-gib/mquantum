import { describe, expect, it } from 'vitest'

import { normalizeHydrogenCoupledAngularChain } from '@/lib/physics/hydrogenCoupled/presets'

describe('normalizeHydrogenCoupledAngularChain', () => {
  it('raises every active chain entry to |m| so l(D-2) remains valid', () => {
    expect(
      normalizeHydrogenCoupledAngularChain([0, 0], {
        l1: 3,
        magneticM: -2,
        length: 2,
      })
    ).toEqual([2, 2])
  })

  it('preserves descending valid chains within the l1 upper bound', () => {
    expect(
      normalizeHydrogenCoupledAngularChain([4, 2, 1], {
        l1: 5,
        magneticM: 1,
        length: 3,
      })
    ).toEqual([4, 2, 1])
  })

  it('cascades upper bounds after clamping an earlier layer', () => {
    expect(
      normalizeHydrogenCoupledAngularChain([5, 4, 3], {
        l1: 2,
        magneticM: 1,
        length: 3,
      })
    ).toEqual([2, 2, 2])
  })
})
