/**
 * Tests for the pure metric evaluator and curvature scalars.
 *
 * Covers all 8 metric kinds: flat, morrisThorne, schwarzschild, deSitter,
 * antiDeSitter, sphere2D, torus, doubleThroat. Verifies:
 *   - point-wise g^μμ and √|g|
 *   - determinant sign
 *   - Ricci / Kretschmann scalars
 *   - asymptotic flatness
 *   - time dependence (de Sitter)
 *   - periodic & time-dependent metadata helpers
 *   - NaN/Inf robustness
 *
 * @module tests/lib/physics/tdse/metrics
 */

import { describe, expect, it } from 'vitest'

import {
  kretschmannScalar,
  morrisThorneRadius,
  ricciScalar,
  sampleMetric,
} from '@/lib/physics/tdse/metrics/evaluator'
import {
  describeMetric,
  hasPeriodicBoundary,
  isTimeDependentMetric,
  type MetricKind,
} from '@/lib/physics/tdse/metrics/types'

// ───────────────────────── Flat ─────────────────────────

describe('sampleMetric (flat)', () => {
  it('returns identity metric for any point in 3D', () => {
    const samples = [
      [0, 0, 0],
      [1.23, -4.56, 7.89],
      [-10, 10, -10],
    ]
    for (const coords of samples) {
      const s = sampleMetric({ kind: 'flat' }, coords, 3)
      expect(s.gInverseDiag).toEqual([1, 1, 1])
      expect(s.sqrtDet).toBe(1)
    }
  })

  it('returns identity metric for 2D and 1D lattices', () => {
    const s2 = sampleMetric({ kind: 'flat' }, [0.5, -0.5], 2)
    expect(s2.gInverseDiag).toEqual([1, 1])
    expect(s2.sqrtDet).toBe(1)
    const s1 = sampleMetric({ kind: 'flat' }, [3.14], 1)
    expect(s1.gInverseDiag).toEqual([1])
    expect(s1.sqrtDet).toBe(1)
  })
})

// ─────────────────────── Morris–Thorne ───────────────────

describe('sampleMetric (morrisThorne)', () => {
  it('at the throat (l=0) yields r=b₀, 1/r² transverse inverse, √|g|=b₀² in 3D', () => {
    const b0 = 0.5
    const s = sampleMetric({ kind: 'morrisThorne', throatRadius: b0 }, [0, 0, 0], 3)
    expect(s.gInverseDiag[0]).toBe(1)
    expect(s.gInverseDiag[1]).toBeCloseTo(1 / (b0 * b0), 12)
    expect(s.gInverseDiag[2]).toBeCloseTo(1 / (b0 * b0), 12)
    expect(s.sqrtDet).toBeCloseTo(b0 * b0, 12)
  })

  it('in the asymptotic region (|l| ≫ b₀) approaches flat angular scaling', () => {
    const b0 = 0.5
    const l = 100
    const s = sampleMetric({ kind: 'morrisThorne', throatRadius: b0 }, [l, 0, 0], 3)
    const rApprox = Math.abs(l)
    expect(s.gInverseDiag[0]).toBe(1)
    expect(s.gInverseDiag[1]).toBeCloseTo(1 / (rApprox * rApprox), 6)
    expect(s.sqrtDet / (rApprox * rApprox)).toBeCloseTo(1, 4)
  })

  it('sqrtDet scales as r^(latticeDim−1)', () => {
    const b0 = 0.7
    const l = 2.0
    const r = Math.sqrt(b0 * b0 + l * l)
    const s3 = sampleMetric({ kind: 'morrisThorne', throatRadius: b0 }, [l, 0, 0], 3)
    expect(s3.sqrtDet).toBeCloseTo(r * r, 10)
    const s2 = sampleMetric({ kind: 'morrisThorne', throatRadius: b0 }, [l, 0], 2)
    expect(s2.sqrtDet).toBeCloseTo(r, 10)
  })

  it('is degenerate in 1D (reduces to flat)', () => {
    const s = sampleMetric({ kind: 'morrisThorne', throatRadius: 0.5 }, [1.0], 1)
    expect(s.gInverseDiag).toEqual([1])
    expect(s.sqrtDet).toBe(1)
  })
})

describe('morrisThorneRadius', () => {
  it('is strictly increasing in |l|', () => {
    const b0 = 0.5
    const samples: number[] = [0, 0.1, 0.3, 1.0, 3.0, 10.0]
    for (let i = 1; i < samples.length; i++) {
      const curr = samples[i] as number
      const prev = samples[i - 1] as number
      expect(morrisThorneRadius(curr, b0)).toBeGreaterThan(morrisThorneRadius(prev, b0))
      expect(morrisThorneRadius(-curr, b0)).toBe(morrisThorneRadius(curr, b0))
    }
  })

  it('equals b₀ at l=0', () => {
    expect(morrisThorneRadius(0, 0.5)).toBe(0.5)
  })
})

// ───────────────────── Schwarzschild ─────────────────────

describe('sampleMetric (schwarzschild)', () => {
  it('at r=2M yields ψ=1.25, g^ii=1/ψ⁴, √|g|=ψ⁶ in 3D', () => {
    const M = 1.0
    const r = 2 * M
    // Place on x-axis: x=2M, y=z=0. |x|=2M, so ψ = 1 + M/(2·2M) = 1.25.
    const s = sampleMetric({ kind: 'schwarzschild', schwarzschildMass: M }, [r, 0, 0], 3)
    const psi = 1 + M / (2 * r)
    const invPsi4 = 1 / (psi * psi * psi * psi)
    expect(s.gInverseDiag[0]).toBeCloseTo(invPsi4, 12)
    expect(s.gInverseDiag[1]).toBeCloseTo(invPsi4, 12)
    expect(s.gInverseDiag[2]).toBeCloseTo(invPsi4, 12)
    const expectedSqrtDet = psi * psi * psi * psi * psi * psi
    expect(s.sqrtDet).toBeCloseTo(expectedSqrtDet, 10)
  })

  it('at large r approaches flat within 1%', () => {
    const M = 0.1
    const s = sampleMetric({ kind: 'schwarzschild', schwarzschildMass: M }, [100, 0, 0], 3)
    for (const g of s.gInverseDiag) {
      expect(g).toBeGreaterThan(0.99)
      expect(g).toBeLessThanOrEqual(1)
    }
    expect(s.sqrtDet).toBeGreaterThan(0.99)
  })

  it('clamps near r=0 (no NaN/Inf)', () => {
    const s = sampleMetric({ kind: 'schwarzschild', schwarzschildMass: 1 }, [0, 0, 0], 3)
    for (const g of s.gInverseDiag) expect(Number.isFinite(g)).toBe(true)
    expect(Number.isFinite(s.sqrtDet)).toBe(true)
    expect(s.sqrtDet).toBeGreaterThan(0)
  })
})

// ────────────────────── de Sitter ────────────────────────

describe('sampleMetric (deSitter)', () => {
  it('at t=0 reduces to flat (a=1)', () => {
    const s = sampleMetric({ kind: 'deSitter', hubbleRate: 1 }, [0.5, 0.5, 0.5], 3, 0)
    expect(s.gInverseDiag).toEqual([1, 1, 1])
    expect(s.sqrtDet).toBe(1)
  })

  it('at t>0 gives g^ii = 1/a², √|g| = a^dim', () => {
    const H = 0.7
    const t = 1.3
    const a = Math.exp(H * t)
    const s = sampleMetric({ kind: 'deSitter', hubbleRate: H }, [0, 0, 0], 3, t)
    expect(s.gInverseDiag[0]).toBeCloseTo(1 / (a * a), 10)
    expect(s.gInverseDiag[2]).toBeCloseTo(1 / (a * a), 10)
    expect(s.sqrtDet).toBeCloseTo(a * a * a, 10)
  })

  it('smoothness in time: a(t+dt)/a(t) ≈ exp(H·dt) within 1%', () => {
    const H = 0.5
    const t = 2.0
    const dt = 0.01
    const s1 = sampleMetric({ kind: 'deSitter', hubbleRate: H }, [0, 0, 0], 3, t)
    const s2 = sampleMetric({ kind: 'deSitter', hubbleRate: H }, [0, 0, 0], 3, t + dt)
    const a1 = Math.cbrt(s1.sqrtDet)
    const a2 = Math.cbrt(s2.sqrtDet)
    expect(a2 / a1).toBeCloseTo(Math.exp(H * dt), 4)
  })

  it('default time=0 gives flat', () => {
    const s = sampleMetric({ kind: 'deSitter', hubbleRate: 2 }, [0, 0, 0], 3)
    expect(s.sqrtDet).toBe(1)
  })
})

// ──────────────────── Anti-de Sitter ─────────────────────

describe('sampleMetric (antiDeSitter)', () => {
  it('at z=L gives g^ii = 1, √|g| = 1', () => {
    const L = 2.0
    const s = sampleMetric({ kind: 'antiDeSitter', adsRadius: L }, [L, 0, 0], 3)
    expect(s.gInverseDiag[0]).toBeCloseTo(1, 10)
    expect(s.gInverseDiag[1]).toBeCloseTo(1, 10)
    expect(s.sqrtDet).toBeCloseTo(1, 10)
  })

  it('at z=L/2 gives g^ii = 1/4, √|g| = 8', () => {
    const L = 1.0
    const z = 0.5
    const s = sampleMetric({ kind: 'antiDeSitter', adsRadius: L }, [z, 0, 0], 3)
    const expectedInv = (z / L) * (z / L)
    expect(s.gInverseDiag[0]).toBeCloseTo(expectedInv, 10)
    const expectedSqrt = (L / z) ** 3
    expect(s.sqrtDet).toBeCloseTo(expectedSqrt, 10)
  })

  it('clamps at z=0 (no divergence)', () => {
    const s = sampleMetric({ kind: 'antiDeSitter', adsRadius: 1 }, [0, 0, 0], 3)
    for (const g of s.gInverseDiag) expect(Number.isFinite(g)).toBe(true)
    expect(Number.isFinite(s.sqrtDet)).toBe(true)
    expect(s.sqrtDet).toBeGreaterThan(0)
  })
})

// ───────────────────── sphere2D ──────────────────────────

describe('sampleMetric (sphere2D)', () => {
  it('at θ=π/2, R=1, 3D gives g^11=1, g^22=1, √|g|=1', () => {
    const R = 1
    const s = sampleMetric({ kind: 'sphere2D', sphereRadius: R }, [0, Math.PI / 2, 0], 3)
    expect(s.gInverseDiag[0]).toBe(1)
    expect(s.gInverseDiag[1]).toBeCloseTo(1 / (R * R), 10)
    expect(s.gInverseDiag[2]).toBeCloseTo(1 / (R * R), 10)
    expect(s.sqrtDet).toBeCloseTo(R * R, 10)
  })

  it('at θ=π/4, R=2 gives expected sin-θ dependence', () => {
    const R = 2
    const theta = Math.PI / 4
    const s = sampleMetric({ kind: 'sphere2D', sphereRadius: R }, [0, theta, 0], 3)
    expect(s.gInverseDiag[1]).toBeCloseTo(1 / (R * R), 10)
    const sinT = Math.sin(theta)
    expect(s.gInverseDiag[2]).toBeCloseTo(1 / (R * R * sinT * sinT), 10)
    expect(s.sqrtDet).toBeCloseTo(R * R * sinT, 10)
  })

  it('clamps θ at the pole (no NaN/Inf)', () => {
    const s = sampleMetric({ kind: 'sphere2D', sphereRadius: 1 }, [0, 0, 0], 3)
    for (const g of s.gInverseDiag) expect(Number.isFinite(g)).toBe(true)
    expect(Number.isFinite(s.sqrtDet)).toBe(true)
    expect(s.sqrtDet).toBeGreaterThan(0)
    const s2 = sampleMetric({ kind: 'sphere2D', sphereRadius: 1 }, [0, Math.PI, 0], 3)
    for (const g of s2.gInverseDiag) expect(Number.isFinite(g)).toBe(true)
  })

  it('degenerates to flat in 2D', () => {
    const s = sampleMetric({ kind: 'sphere2D', sphereRadius: 1 }, [0, Math.PI / 2], 2)
    expect(s.gInverseDiag).toEqual([1, 1])
    expect(s.sqrtDet).toBe(1)
  })
})

// ────────────────────── Torus ────────────────────────────

describe('sampleMetric (torus)', () => {
  it('returns flat regardless of coords', () => {
    const cfg = {
      kind: 'torus' as const,
      torusPeriod: [2, 2, 2] as [number, number, number],
    }
    const points = [
      [0, 0, 0],
      [10, -5, 3.14],
      [-100, 100, 0],
    ]
    for (const coords of points) {
      const s = sampleMetric(cfg, coords, 3)
      expect(s.gInverseDiag).toEqual([1, 1, 1])
      expect(s.sqrtDet).toBe(1)
    }
  })
})

// ──────────────────── doubleThroat ───────────────────────

describe('sampleMetric (doubleThroat)', () => {
  it('r(l) ≥ throatRadius everywhere and g^00=1', () => {
    const b0 = 0.3
    const s = 1.0
    const ls = [-5, -1, -0.5, 0, 0.5, 1, 5]
    for (const l of ls) {
      const sample = sampleMetric(
        { kind: 'doubleThroat', doubleThroatRadius: b0, doubleThroatSeparation: s },
        [l, 0, 0],
        3
      )
      expect(sample.gInverseDiag[0]).toBe(1)
      // g^11 = 1/r² ≤ 1/b0² ⇒ r² ≥ b0² ⇒ r ≥ b0.
      expect(sample.gInverseDiag[1]).toBeLessThanOrEqual(1 / (b0 * b0) + 1e-9)
      expect(sample.sqrtDet).toBeGreaterThan(0)
    }
  })

  it('asymptotic flatness: √|g| → l² at large |l| in 3D', () => {
    const b0 = 0.3
    const s = 1.0
    const l = 200
    const sample = sampleMetric(
      { kind: 'doubleThroat', doubleThroatRadius: b0, doubleThroatSeparation: s },
      [l, 0, 0],
      3
    )
    expect(sample.sqrtDet / (l * l)).toBeCloseTo(1, 2)
  })

  it('falls back to throatRadius when doubleThroatRadius omitted', () => {
    const sA = sampleMetric(
      { kind: 'doubleThroat', throatRadius: 0.4, doubleThroatSeparation: 1 },
      [0, 0, 0],
      3
    )
    const sB = sampleMetric(
      { kind: 'doubleThroat', doubleThroatRadius: 0.4, doubleThroatSeparation: 1 },
      [0, 0, 0],
      3
    )
    expect(sA.sqrtDet).toBeCloseTo(sB.sqrtDet, 12)
  })
})

// ──────────────────── Determinant sign ───────────────────

describe('sampleMetric determinant sign', () => {
  const kinds: MetricKind[] = [
    'flat',
    'morrisThorne',
    'schwarzschild',
    'deSitter',
    'antiDeSitter',
    'sphere2D',
    'torus',
    'doubleThroat',
  ]
  const coordSets = [
    [0, 0, 0],
    [1, 0.5, -0.25],
    [5, -3, 2],
    [-4, 1, 1],
  ]

  for (const kind of kinds) {
    it(`${kind}: √|g| > 0 and every g^μμ > 0 across sample points`, () => {
      const cfg = {
        kind,
        throatRadius: 0.4,
        schwarzschildMass: 0.5,
        hubbleRate: 0.3,
        adsRadius: 1.5,
        sphereRadius: 1.5,
        torusPeriod: [3, 3, 3] as [number, number, number],
        doubleThroatSeparation: 1.2,
        doubleThroatRadius: 0.4,
      }
      for (const coords of coordSets) {
        const s = sampleMetric(cfg, coords, 3, 0.5)
        expect(s.sqrtDet).toBeGreaterThan(0)
        expect(Number.isFinite(s.sqrtDet)).toBe(true)
        for (const g of s.gInverseDiag) {
          expect(g).toBeGreaterThan(0)
          expect(Number.isFinite(g)).toBe(true)
        }
      }
    })
  }
})

// ─────────────────────── Ricci / Kretschmann ──────────────────────

describe('ricciScalar', () => {
  it('flat → 0 exactly', () => {
    expect(ricciScalar({ kind: 'flat' }, [1, 2, 3], 3)).toBe(0)
  })

  it('torus → 0 exactly', () => {
    expect(ricciScalar({ kind: 'torus', torusPeriod: [1, 1, 1] }, [0.1, 0.2, 0.3], 3)).toBe(0)
  })

  it('sphere2D → 2/R² exact', () => {
    const R = 1.7
    expect(ricciScalar({ kind: 'sphere2D', sphereRadius: R }, [0, 1, 0], 3)).toBeCloseTo(
      2 / (R * R),
      10
    )
  })

  it('AdS 3D → −6/L²', () => {
    const L = 2.0
    expect(ricciScalar({ kind: 'antiDeSitter', adsRadius: L }, [1, 0, 0], 3)).toBeCloseTo(
      -6 / (L * L),
      10
    )
  })

  it('de Sitter 3D → 0 (conformally flat spatial slice)', () => {
    expect(ricciScalar({ kind: 'deSitter', hubbleRate: 0.5 }, [0, 0, 0], 3)).toBe(0)
  })

  it('Schwarzschild (vacuum) → 0', () => {
    expect(ricciScalar({ kind: 'schwarzschild', schwarzschildMass: 1 }, [3, 0, 0], 3)).toBeCloseTo(
      0,
      10
    )
  })

  it('MT at l=0, d=3: R = −2/b² (maximum negative curvature at throat)', () => {
    const b = 0.5
    const expected = -2 / (b * b)
    expect(ricciScalar({ kind: 'morrisThorne', throatRadius: b }, [0, 0, 0], 3)).toBeCloseTo(
      expected,
      10
    )
  })

  it('MT at l=b, d=3: R = closed form with dim-dependent coefficients', () => {
    const b = 0.5
    const dim = 3
    const l = b
    const r = Math.sqrt(b * b + l * l)
    const rP = l / r
    const rPP = (b * b) / (r * r * r)
    const d1 = dim - 1
    const expected = (d1 * (dim - 2) * (1 - rP * rP)) / (r * r) - (2 * d1 * rPP) / r
    expect(ricciScalar({ kind: 'morrisThorne', throatRadius: b }, [l, 0, 0], dim)).toBeCloseTo(
      expected,
      10
    )
  })

  it('MT at l=0, d=5: R = (d-1)(d-4)/b² = 4/b²', () => {
    const b = 0.5
    const dim = 5
    const expected = ((dim - 1) * (dim - 4)) / (b * b)
    expect(
      ricciScalar({ kind: 'morrisThorne', throatRadius: b }, [0, 0, 0, 0, 0], dim)
    ).toBeCloseTo(expected, 10)
  })

  it('doubleThroat Ricci is sum of two shifted MT contributions', () => {
    const b = 0.4
    const s = 1.0
    const l = 0.2
    const expected =
      ricciScalar({ kind: 'morrisThorne', throatRadius: b }, [l - s / 2, 0, 0], 3) +
      ricciScalar({ kind: 'morrisThorne', throatRadius: b }, [l + s / 2, 0, 0], 3)
    expect(
      ricciScalar(
        { kind: 'doubleThroat', doubleThroatRadius: b, doubleThroatSeparation: s },
        [l, 0, 0],
        3
      )
    ).toBeCloseTo(expected, 10)
  })
})

describe('kretschmannScalar', () => {
  it('Schwarzschild → 48 M²/R⁶ (areal radius)', () => {
    const M = 0.5
    const rho = 3
    const psi = 1 + M / (2 * rho)
    const arealR = rho * psi * psi
    const K = kretschmannScalar({ kind: 'schwarzschild', schwarzschildMass: M }, [rho, 0, 0], 3)
    expect(K).toBeCloseTo((48 * M * M) / arealR ** 6, 10)
  })

  it('returns 0 for non-Schwarzschild kinds', () => {
    expect(kretschmannScalar({ kind: 'flat' }, [1, 2, 3], 3)).toBe(0)
    expect(kretschmannScalar({ kind: 'sphere2D', sphereRadius: 1 }, [0, 1, 0], 3)).toBe(0)
    expect(kretschmannScalar({ kind: 'torus' }, [0, 0, 0], 3)).toBe(0)
  })
})

// ─────────────────── Metadata helpers ────────────────────

describe('isTimeDependentMetric', () => {
  it('returns true only for deSitter', () => {
    const table: Array<[MetricKind, boolean]> = [
      ['flat', false],
      ['morrisThorne', false],
      ['schwarzschild', false],
      ['deSitter', true],
      ['antiDeSitter', false],
      ['sphere2D', false],
      ['torus', false],
      ['doubleThroat', false],
    ]
    for (const [kind, expected] of table) {
      expect(isTimeDependentMetric(kind)).toBe(expected)
    }
  })
})

describe('hasPeriodicBoundary', () => {
  it('returns true only for torus', () => {
    const table: Array<[MetricKind, boolean]> = [
      ['flat', false],
      ['morrisThorne', false],
      ['schwarzschild', false],
      ['deSitter', false],
      ['antiDeSitter', false],
      ['sphere2D', false],
      ['torus', true],
      ['doubleThroat', false],
    ]
    for (const [kind, expected] of table) {
      expect(hasPeriodicBoundary(kind)).toBe(expected)
    }
  })
})

describe('describeMetric', () => {
  it('returns a label and formula for every kind', () => {
    const kinds: MetricKind[] = [
      'flat',
      'morrisThorne',
      'schwarzschild',
      'deSitter',
      'antiDeSitter',
      'sphere2D',
      'torus',
      'doubleThroat',
    ]
    for (const kind of kinds) {
      const d = describeMetric({ kind })
      expect(d.label.length).toBeGreaterThan(0)
      expect(d.formula.length).toBeGreaterThan(0)
    }
  })
})

// ────────────── Asymptotic flatness (large |x|) ──────────

describe('asymptotic flatness', () => {
  it('Morris–Thorne at |l|=50 approaches r=|l|', () => {
    const b = 0.3
    const l = 50
    const s = sampleMetric({ kind: 'morrisThorne', throatRadius: b }, [l, 0, 0], 3)
    expect((s.gInverseDiag[1] as number) * l * l).toBeCloseTo(1, 4)
    expect(s.sqrtDet / (l * l)).toBeCloseTo(1, 4)
  })

  it('Schwarzschild at r=500 (M=0.1) gives g^ii within 1% of 1', () => {
    const M = 0.1
    const s = sampleMetric({ kind: 'schwarzschild', schwarzschildMass: M }, [500, 0, 0], 3)
    for (const g of s.gInverseDiag) {
      expect(Math.abs(g - 1)).toBeLessThan(0.01)
    }
  })

  it('doubleThroat at |l|=500 approaches r≈|l| within 1%', () => {
    const b = 0.3
    const sep = 1.0
    const l = 500
    const s = sampleMetric(
      { kind: 'doubleThroat', doubleThroatRadius: b, doubleThroatSeparation: sep },
      [l, 0, 0],
      3
    )
    expect(Math.abs(s.sqrtDet / (l * l) - 1)).toBeLessThan(0.01)
  })
})

// ────────────── Robustness (NaN/Inf-free) ───────────────

describe('metric robustness', () => {
  it('produces no NaNs or Infs across a lattice for every kind', () => {
    const kinds: MetricKind[] = [
      'flat',
      'morrisThorne',
      'schwarzschild',
      'deSitter',
      'antiDeSitter',
      'sphere2D',
      'torus',
      'doubleThroat',
    ]
    const cfgBase = {
      throatRadius: 0.3,
      schwarzschildMass: 0.5,
      hubbleRate: 0.5,
      adsRadius: 1,
      sphereRadius: 1,
      torusPeriod: [2, 2, 2] as [number, number, number],
      doubleThroatSeparation: 1,
      doubleThroatRadius: 0.3,
    }
    const N = 16
    const dx = 0.25
    for (const kind of kinds) {
      for (let i = 0; i < N; i++) {
        const x = (i - (N - 1) / 2) * dx
        const coords = kind === 'antiDeSitter' ? [Math.max(x, 0.05), x, x] : [x, x, x]
        const cfg = { kind, ...cfgBase }
        const s = sampleMetric(cfg, coords, 3, 0.3)
        for (const g of s.gInverseDiag) expect(Number.isFinite(g)).toBe(true)
        expect(Number.isFinite(s.sqrtDet)).toBe(true)
      }
    }
  })

  it('original MT lattice scan stays finite', () => {
    const b0 = 0.2
    const N = 32
    const dx = 0.1
    for (let i = 0; i < N; i++) {
      const l = (i - (N - 1) / 2) * dx
      const s = sampleMetric({ kind: 'morrisThorne', throatRadius: b0 }, [l, 0, 0], 3)
      for (const g of s.gInverseDiag) expect(Number.isFinite(g)).toBe(true)
      expect(Number.isFinite(s.sqrtDet)).toBe(true)
    }
  })
})
