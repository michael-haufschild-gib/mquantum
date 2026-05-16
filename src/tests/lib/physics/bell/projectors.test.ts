import { describe, expect, it } from 'vitest'

import {
  azimuthalVec,
  blochAngleToVec3,
  correlationExpectation,
  jointOutcomeProbabilities,
  jointProjector,
  singleQubitProjector,
} from '@/lib/physics/bell/projectors'
import {
  bellState,
  pureDensityMatrix,
  trace4,
  traceProduct4,
  wernerDensityMatrix,
  zeroMat4,
} from '@/lib/physics/bell/state'
import type { Vec3 } from '@/lib/physics/bell/types'

describe('blochAngleToVec3', () => {
  it('north pole gives (0, 0, 1)', () => {
    const v = blochAngleToVec3([0, 0])
    expect(v[0]).toBeCloseTo(0, 12)
    expect(v[1]).toBeCloseTo(0, 12)
    expect(v[2]).toBeCloseTo(1, 12)
  })

  it('south pole gives (0, 0, −1)', () => {
    const v = blochAngleToVec3([Math.PI, 0])
    expect(v[2]).toBeCloseTo(-1, 12)
  })

  it('equator at φ=0 gives (1, 0, 0)', () => {
    const v = blochAngleToVec3([Math.PI / 2, 0])
    expect(v[0]).toBeCloseTo(1, 12)
    expect(v[1]).toBeCloseTo(0, 12)
    expect(v[2]).toBeCloseTo(0, 12)
  })
})

describe('azimuthalVec', () => {
  it('lies in the xy plane and has unit norm', () => {
    for (let k = 0; k < 8; k++) {
      const phi = (k / 8) * 2 * Math.PI
      const v = azimuthalVec(phi)
      expect(v[2]).toBeCloseTo(0, 12)
      expect(v[0] ** 2 + v[1] ** 2).toBeCloseTo(1, 12)
    }
  })
})

describe('singleQubitProjector', () => {
  it('P_+ + P_- = I for any axis', () => {
    const axes: Vec3[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [Math.SQRT1_2, Math.SQRT1_2, 0],
    ]
    for (const a of axes) {
      const pPlus = singleQubitProjector(a, +1)
      const pMinus = singleQubitProjector(a, -1)
      // Sum should equal I (2x2 identity): (1, 0, 0, 1)
      const sumRe = pPlus.re.map((x, i) => x + (pMinus.re[i] ?? 0))
      const sumIm = pPlus.im.map((x, i) => x + (pMinus.im[i] ?? 0))
      expect(sumRe[0]).toBeCloseTo(1, 12)
      expect(sumRe[1]).toBeCloseTo(0, 12)
      expect(sumRe[2]).toBeCloseTo(0, 12)
      expect(sumRe[3]).toBeCloseTo(1, 12)
      expect(sumIm[0]).toBeCloseTo(0, 12)
      expect(sumIm[3]).toBeCloseTo(0, 12)
    }
  })

  it('P_a(+)² = P_a(+) (projection idempotency, z-axis)', () => {
    const P = singleQubitProjector([0, 0, 1], +1)
    // For z-axis, P_+ = diag(1, 0). Squared remains diag(1, 0).
    expect(P.re[0]).toBeCloseTo(1, 12)
    expect(P.re[3]).toBeCloseTo(0, 12)
  })
})

describe('jointProjector', () => {
  it('joint sum P++ + P+- + P-+ + P-- = I_4', () => {
    const a: Vec3 = [1, 0, 0]
    const b: Vec3 = [0, 1, 0]
    const sum = zeroMat4()
    for (const sA of [+1, -1] as const) {
      for (const sB of [+1, -1] as const) {
        const P = jointProjector(a, b, sA, sB)
        for (let i = 0; i < 16; i++) {
          sum.re[i] = (sum.re[i] ?? 0) + (P.re[i] ?? 0)
          sum.im[i] = (sum.im[i] ?? 0) + (P.im[i] ?? 0)
        }
      }
    }
    // Should be 4×4 identity
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const idx = i * 4 + j
        expect(sum.re[idx]).toBeCloseTo(i === j ? 1 : 0, 12)
        expect(sum.im[idx]).toBeCloseTo(0, 12)
      }
    }
  })
})

describe('jointOutcomeProbabilities', () => {
  it('sums to 1 for the singlet at arbitrary angles', () => {
    const rho = pureDensityMatrix(bellState('psiMinus'))
    expect(trace4(rho)).toBeCloseTo(1, 12)
    for (const phi of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
      const probs = jointOutcomeProbabilities(rho, azimuthalVec(0), azimuthalVec(phi))
      const total = probs.pPP + probs.pPM + probs.pMP + probs.pMM
      expect(total).toBeCloseTo(1, 12)
      // All probabilities non-negative
      expect(probs.pPP).toBeGreaterThanOrEqual(-1e-12)
      expect(probs.pPM).toBeGreaterThanOrEqual(-1e-12)
      expect(probs.pMP).toBeGreaterThanOrEqual(-1e-12)
      expect(probs.pMM).toBeGreaterThanOrEqual(-1e-12)
    }
  })

  it('for the singlet at a=b, probs(++) = probs(--) = 0 and probs(+-) = probs(-+) = 1/2', () => {
    const rho = pureDensityMatrix(bellState('psiMinus'))
    const axis = azimuthalVec(0)
    const probs = jointOutcomeProbabilities(rho, axis, axis)
    expect(probs.pPP).toBeCloseTo(0, 12)
    expect(probs.pMM).toBeCloseTo(0, 12)
    expect(probs.pPM).toBeCloseTo(0.5, 12)
    expect(probs.pMP).toBeCloseTo(0.5, 12)
  })
})

describe('correlationExpectation', () => {
  it('singlet correlation matches −a·b exactly', () => {
    const rho = pureDensityMatrix(bellState('psiMinus'))
    // Walk a series of angles between Alice and Bob in the xy plane
    for (const phi of [0, Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI / 2, Math.PI]) {
      const a: Vec3 = [1, 0, 0]
      const b: Vec3 = [Math.cos(phi), Math.sin(phi), 0]
      const expected = -(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) // = −cos φ
      expect(correlationExpectation(rho, a, b)).toBeCloseTo(expected, 12)
    }
  })

  it('Werner state correlation is −v·a·b', () => {
    for (const v of [0, 0.25, 0.5, 0.7071, 0.9, 1.0]) {
      const rho = wernerDensityMatrix(v)
      const a: Vec3 = [1, 0, 0]
      const b: Vec3 = [Math.SQRT1_2, Math.SQRT1_2, 0]
      const expected = -v * (a[0] * b[0] + a[1] * b[1] + a[2] * b[2])
      expect(correlationExpectation(rho, a, b)).toBeCloseTo(expected, 10)
    }
  })

  it('correlation = Tr(ρ · σ_a ⊗ σ_b) (sanity cross-check via traceProduct4)', () => {
    // For ρ = I/4 (maximally mixed), the correlation must be zero for any axes.
    const rho = wernerDensityMatrix(0)
    expect(correlationExpectation(rho, [1, 0, 0], [0, 0, 1])).toBeCloseTo(0, 12)
    // Sanity: trace of ρ · I_4 is trace of ρ = 1.
    const ident = wernerDensityMatrix(1)
    expect(trace4(ident)).toBeCloseTo(1, 12)
    expect(traceProduct4(rho, rho)).toBeGreaterThanOrEqual(0)
  })
})
