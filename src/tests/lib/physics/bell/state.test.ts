import { describe, expect, it } from 'vitest'

import {
  bellState,
  pureDensityMatrix,
  scaledIdentity4,
  trace4,
  traceProduct4,
  wernerDensityMatrix,
} from '@/lib/physics/bell/state'

describe('bellState', () => {
  it('returns the singlet |Ψ⁻⟩ = (|01⟩ − |10⟩)/√2 for psiMinus', () => {
    const psi = bellState('psiMinus')
    expect(psi.re[0]).toBe(0)
    expect(psi.re[1]).toBeCloseTo(Math.SQRT1_2, 12)
    expect(psi.re[2]).toBeCloseTo(-Math.SQRT1_2, 12)
    expect(psi.re[3]).toBe(0)
    expect(Array.from(psi.im)).toEqual([0, 0, 0, 0])
  })

  it('is normalized: ⟨ψ|ψ⟩ = 1 for every Bell state', () => {
    for (const kind of ['psiPlus', 'psiMinus', 'phiPlus', 'phiMinus'] as const) {
      const psi = bellState(kind)
      let norm = 0
      for (let i = 0; i < 4; i++) {
        norm += (psi.re[i] ?? 0) ** 2 + (psi.im[i] ?? 0) ** 2
      }
      expect(norm).toBeCloseTo(1, 12)
    }
  })

  it('produces orthogonal Bell states', () => {
    const psiPlus = bellState('psiPlus')
    const psiMinus = bellState('psiMinus')
    let inner = 0
    for (let i = 0; i < 4; i++) {
      inner += (psiPlus.re[i] ?? 0) * (psiMinus.re[i] ?? 0)
    }
    expect(inner).toBeCloseTo(0, 12)
  })
})

describe('pureDensityMatrix', () => {
  it('produces a Hermitian trace-1 matrix for the singlet', () => {
    const rho = pureDensityMatrix(bellState('psiMinus'))
    expect(trace4(rho)).toBeCloseTo(1, 12)
    // Hermitian: rho_ij = rho_ji*
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const ij = i * 4 + j
        const ji = j * 4 + i
        expect(rho.re[ij]).toBeCloseTo(rho.re[ji] ?? 0, 12)
        expect(rho.im[ij]).toBeCloseTo(-(rho.im[ji] ?? 0), 12)
      }
    }
  })

  it('matches the explicit singlet density matrix', () => {
    const rho = pureDensityMatrix(bellState('psiMinus'))
    // Expected: ρ_{01,01} = 1/2, ρ_{10,10} = 1/2, ρ_{01,10} = ρ_{10,01}* = −1/2
    expect(rho.re[5]).toBeCloseTo(0.5, 12) // (01)(01)
    expect(rho.re[10]).toBeCloseTo(0.5, 12) // (10)(10)
    expect(rho.re[6]).toBeCloseTo(-0.5, 12) // (01)(10)
    expect(rho.re[9]).toBeCloseTo(-0.5, 12) // (10)(01)
  })
})

describe('wernerDensityMatrix', () => {
  it('equals the singlet at v=1', () => {
    const rho = wernerDensityMatrix(1)
    const pure = pureDensityMatrix(bellState('psiMinus'))
    for (let i = 0; i < 16; i++) {
      expect(rho.re[i]).toBeCloseTo(pure.re[i] ?? 0, 12)
      expect(rho.im[i]).toBeCloseTo(pure.im[i] ?? 0, 12)
    }
  })

  it('equals I/4 at v=0', () => {
    const rho = wernerDensityMatrix(0)
    const ident = scaledIdentity4(0.25)
    for (let i = 0; i < 16; i++) {
      expect(rho.re[i]).toBeCloseTo(ident.re[i] ?? 0, 12)
      expect(rho.im[i]).toBeCloseTo(ident.im[i] ?? 0, 12)
    }
  })

  it('has unit trace for all v ∈ [0, 1]', () => {
    for (const v of [0, 0.25, 0.5, 0.7071, 1.0]) {
      const rho = wernerDensityMatrix(v)
      expect(trace4(rho)).toBeCloseTo(1, 12)
    }
  })

  it('is Hermitian for all v ∈ [0, 1]', () => {
    for (const v of [0.1, 0.5, 0.9]) {
      const rho = wernerDensityMatrix(v)
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          const ij = i * 4 + j
          const ji = j * 4 + i
          expect(rho.re[ij]).toBeCloseTo(rho.re[ji] ?? 0, 12)
          expect(rho.im[ij]).toBeCloseTo(-(rho.im[ji] ?? 0), 12)
        }
      }
    }
  })

  it('clamps out-of-range visibility', () => {
    const negative = wernerDensityMatrix(-0.5)
    const zero = wernerDensityMatrix(0)
    const above = wernerDensityMatrix(1.5)
    const one = wernerDensityMatrix(1)
    for (let i = 0; i < 16; i++) {
      expect(negative.re[i]).toBeCloseTo(zero.re[i] ?? 0, 12)
      expect(above.re[i]).toBeCloseTo(one.re[i] ?? 0, 12)
    }
  })
})

describe('traceProduct4', () => {
  it('Tr(I · I) = 4 for the 4×4 identity', () => {
    const I = scaledIdentity4(1)
    expect(traceProduct4(I, I)).toBeCloseTo(4, 12)
  })

  it('Tr(ρ · I) = Tr(ρ) for any density matrix', () => {
    const I = scaledIdentity4(1)
    for (const v of [0.0, 0.5, 1.0]) {
      const rho = wernerDensityMatrix(v)
      expect(traceProduct4(rho, I)).toBeCloseTo(trace4(rho), 12)
    }
  })
})
