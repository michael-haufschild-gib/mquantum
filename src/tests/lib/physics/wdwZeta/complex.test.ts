import { describe, expect, it } from 'vitest'

import { cabs, cgamma, cxi, czeta, hardyZ } from '@/lib/physics/wdwZeta/complex'

describe('cgamma', () => {
  it('matches Γ(1/2) = √π', () => {
    const g = cgamma([0.5, 0])
    expect(g[0]).toBeCloseTo(Math.sqrt(Math.PI), 4)
    expect(g[1]).toBeCloseTo(0, 5)
  })

  it('matches Γ(5) = 24', () => {
    const g = cgamma([5, 0])
    expect(g[0]).toBeCloseTo(24, 3)
  })
})

describe('czeta', () => {
  it('matches ζ(2) = π²/6', () => {
    const z = czeta([2, 0])
    expect(z[0]).toBeCloseTo((Math.PI * Math.PI) / 6, 5)
    expect(z[1]).toBeCloseTo(0, 6)
  })

  it('matches ζ(4) = π⁴/90', () => {
    const z = czeta([4, 0])
    expect(z[0]).toBeCloseTo(Math.pow(Math.PI, 4) / 90, 5)
  })

  it('matches ζ(0) = −1/2 via Euler–Maclaurin continuation', () => {
    const z = czeta([0, 0])
    expect(z[0]).toBeCloseTo(-0.5, 3)
  })

  it('matches ζ(−1) = −1/12', () => {
    const z = czeta([-1, 0])
    expect(z[0]).toBeCloseTo(-1 / 12, 3)
  })

  it('is small in modulus at the first critical zero ½ + 14.1347i', () => {
    const z = czeta([0.5, 14.134725])
    expect(cabs(z)).toBeLessThan(0.02)
  })
})

describe('cxi (completed xi)', () => {
  it('is real on the critical line', () => {
    for (const t of [3, 8, 14.1347, 25]) {
      const x = cxi([0.5, t])
      expect(Math.abs(x[1])).toBeLessThan(1e-3)
    }
  })

  it('satisfies the functional equation ξ(s) = ξ(1−s)', () => {
    const a = cxi([0.3, 5])
    const b = cxi([0.7, -5])
    expect(a[0]).toBeCloseTo(b[0], 4)
    expect(a[1]).toBeCloseTo(b[1], 4)
  })

  it('vanishes (in modulus) at the first non-trivial zero', () => {
    const x = cxi([0.5, 14.134725])
    expect(cabs(x)).toBeLessThan(0.02)
  })

  it('pins the zero to the seam: on-line |ξ| is a deep local min vs off-line at the same height', () => {
    // |ξ| decays exponentially in t (the Γ(¼+it/2) factor), so an absolute
    // threshold is meaningless — but at fixed height t the seam (σ=½) is where
    // the zero lives, so |ξ(½+it)| must be far smaller than |ξ(0.7+it)|.
    const t = 14.134725
    const onSeam = cabs(cxi([0.5, t]))
    const offSeam = cabs(cxi([0.7, t]))
    expect(onSeam / offSeam).toBeLessThan(0.1)
  })
})

describe('hardyZ', () => {
  it('changes sign across the first three ζ zeros', () => {
    const zeros = [14.134725, 21.02204, 25.010858]
    for (const t of zeros) {
      const before = hardyZ(t - 0.4)
      const after = hardyZ(t + 0.4)
      expect(before * after).toBeLessThan(0)
    }
  })
})
