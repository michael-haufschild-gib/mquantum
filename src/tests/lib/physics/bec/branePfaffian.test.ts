import { describe, expect, it } from 'vitest'

import { computeBranePfaffianScalar } from '@/lib/physics/bec/branePfaffian'

function sparseWinding(
  dim: number,
  pairs: readonly (readonly [number, number, number])[]
): number[][] {
  const winding = Array.from({ length: dim }, () => [] as number[])
  for (const [i, j, value] of pairs) {
    winding[i]![j] = value
  }
  return winding
}

function antisymmetricWinding(
  dim: number,
  pairs: readonly (readonly [number, number, number])[]
): number[][] {
  const winding = Array.from({ length: dim }, () => Array.from({ length: dim }, () => 0))
  for (const [i, j, value] of pairs) {
    winding[i]![j] = value
    winding[j]![i] = -value
  }
  return winding
}

describe('computeBranePfaffianScalar', () => {
  it('returns a finite bounded scalar', () => {
    const scalar = computeBranePfaffianScalar(
      sparseWinding(4, [
        [0, 1, 1],
        [2, 3, 1],
      ])
    )

    expect(Number.isFinite(scalar)).toBe(true)
    expect(scalar).toBeGreaterThan(0)
    expect(scalar).toBeLessThanOrEqual(1)
  })

  it('stays zero below 4D and for a single winding plane', () => {
    expect(computeBranePfaffianScalar(sparseWinding(3, [[0, 1, 1]]), { latticeDim: 3 })).toBe(0)
    expect(computeBranePfaffianScalar(sparseWinding(4, [[0, 1, 1]]))).toBe(0)
  })

  it('lights complementary winding planes and honors density gating', () => {
    const scalar = computeBranePfaffianScalar(
      sparseWinding(4, [
        [0, 1, 1],
        [2, 3, 1],
      ]),
      {
        densityGate: 0.25,
      }
    )

    expect(scalar).toBeGreaterThan(0.24)
    expect(scalar).toBeLessThanOrEqual(0.25)
  })

  it('does not fake an intersection for repeated-axis pairings', () => {
    expect(
      computeBranePfaffianScalar(
        sparseWinding(4, [
          [0, 1, 1],
          [1, 2, 1],
        ])
      )
    ).toBe(0)
    expect(
      computeBranePfaffianScalar(
        sparseWinding(4, [
          [0, 2, 1],
          [2, 3, 1],
        ])
      )
    ).toBe(0)
  })

  it('is robust to expected antisymmetric storage and paired orientation flips', () => {
    const sparse = computeBranePfaffianScalar(
      sparseWinding(4, [
        [0, 1, 1],
        [2, 3, -1],
      ])
    )
    const full = computeBranePfaffianScalar(
      antisymmetricWinding(4, [
        [0, 1, 1],
        [2, 3, -1],
      ])
    )
    const flipped = computeBranePfaffianScalar(
      sparseWinding(4, [
        [0, 1, -1],
        [2, 3, 1],
      ])
    )

    expect(full).toBeCloseTo(sparse)
    expect(flipped).toBeCloseTo(sparse)
  })
})
