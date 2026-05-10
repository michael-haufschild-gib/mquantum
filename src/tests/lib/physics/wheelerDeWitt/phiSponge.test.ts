import { describe, expect, it } from 'vitest'

import {
  buildPhiSpongeDamping,
  effectiveSpongeWidth,
  isConstantInPhiSlab,
} from '@/lib/physics/wheelerDeWitt/phiSponge'
import { WDW_PHI_SPONGE_WIDTH } from '@/lib/physics/wheelerDeWitt/solverConstants'

function complexSlab(Nphi: number, re: number, im: number): Float32Array {
  const slab = new Float32Array(2 * Nphi * Nphi)
  for (let i = 0; i < Nphi * Nphi; i++) {
    slab[2 * i] = re
    slab[2 * i + 1] = im
  }
  return slab
}

describe('Wheeler-DeWitt phi sponge helpers', () => {
  it('scales sponge width with grid size and never exceeds the configured cap', () => {
    expect(effectiveSpongeWidth(5)).toBe(0)
    expect(effectiveSpongeWidth(12)).toBe(2)
    expect(effectiveSpongeWidth(18)).toBe(3)
    expect(effectiveSpongeWidth(128)).toBe(WDW_PHI_SPONGE_WIDTH)
  })

  it('treats a constant-in-phi complex slab as exactly constant across both components', () => {
    const slab = complexSlab(5, 2.5, -0.75)

    expect(isConstantInPhiSlab(slab, 5)).toBe(true)
  })

  it('allows Float32-scale boundary-condition noise but rejects physical phi variation', () => {
    const slab = complexSlab(5, 10, -4)
    slab[0] = 10 + 5e-6
    slab[1] = -4 - 5e-6

    expect(isConstantInPhiSlab(slab, 5)).toBe(true)

    slab[2 * (4 * 5 + 4)] = 10.01
    expect(isConstantInPhiSlab(slab, 5)).toBe(false)
  })

  it('returns unity damping for grids too small to fit a sponge layer', () => {
    const sponge = buildPhiSpongeDamping(5)

    expect([...sponge]).toEqual(Array(25).fill(1))
  })

  it('builds a symmetric quadratic sponge with strongest damping at corners', () => {
    const Nphi = 18
    const sponge = buildPhiSpongeDamping(Nphi)
    const at = (i1: number, i2: number) => sponge[i1 * Nphi + i2]!

    expect(at(0, 0)).toBeGreaterThan(0)
    expect(at(0, 0)).toBeLessThan(at(0, 1))
    expect(at(0, 1)).toBeLessThan(at(0, 2))
    expect(at(0, 2)).toBeLessThan(at(3, 3))
    expect(at(3, 3)).toBe(1)

    expect(at(0, 0)).toBeCloseTo(at(17, 17), 7)
    expect(at(0, 2)).toBeCloseTo(at(17, 15), 7)
    expect(at(8, 0)).toBeCloseTo(at(8, 17), 7)
  })
})
