import { describe, expect, it } from 'vitest'

import {
  buildJointUnitary,
  precessDensityMatrix,
  precessPureState,
  singleQubitPrecession,
} from '@/lib/physics/bell/precession'
import { correlationExpectation } from '@/lib/physics/bell/projectors'
import {
  bellState,
  pureDensityMatrix,
  trace4,
  traceProduct4,
  wernerDensityMatrix,
} from '@/lib/physics/bell/state'
import type { Vec3 } from '@/lib/physics/bell/types'

describe('singleQubitPrecession', () => {
  it('returns identity when t = 0', () => {
    const U = singleQubitPrecession([1, 0, 0], 0)
    expect(U.re[0]).toBeCloseTo(1, 12)
    expect(U.re[1]).toBeCloseTo(0, 12)
    expect(U.re[2]).toBeCloseTo(0, 12)
    expect(U.re[3]).toBeCloseTo(1, 12)
    for (let i = 0; i < 4; i++) expect(U.im[i]).toBeCloseTo(0, 12)
  })

  it('returns identity when |b| = 0', () => {
    const U = singleQubitPrecession([0, 0, 0], 1)
    expect(U.re[0]).toBeCloseTo(1, 12)
    expect(U.re[3]).toBeCloseTo(1, 12)
  })

  it('rotation by 2π returns to identity (up to sign — SU(2) period is 4π)', () => {
    // U(b=ẑ, t=2π) = cos(2π) I − i sin(2π) σ_z = I.
    const U = singleQubitPrecession([0, 0, 1], 2 * Math.PI)
    expect(U.re[0]).toBeCloseTo(1, 8)
    expect(U.re[3]).toBeCloseTo(1, 8)
  })

  it('unitarity: U U† = I', () => {
    for (const t of [0.1, 0.5, 1.3]) {
      const U = singleQubitPrecession([0.6, -0.4, 0.5], t)
      // U U† row by row
      let sumDiag = 0
      let maxOffDiag = 0
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          let re = 0
          let im = 0
          for (let k = 0; k < 2; k++) {
            const aIdx = i * 2 + k
            const bIdx = j * 2 + k
            const ar = U.re[aIdx] ?? 0
            const ai = U.im[aIdx] ?? 0
            const br = U.re[bIdx] ?? 0
            const bi = -(U.im[bIdx] ?? 0)
            re += ar * br - ai * bi
            im += ar * bi + ai * br
          }
          if (i === j) sumDiag += re
          else maxOffDiag = Math.max(maxOffDiag, Math.abs(re), Math.abs(im))
        }
      }
      expect(sumDiag).toBeCloseTo(2, 10) // diag sum equals trace(I) = 2
      expect(maxOffDiag).toBeLessThan(1e-10)
    }
  })
})

describe('precessPureState', () => {
  it('common-field singlet evolution preserves the singlet up to global phase', () => {
    // With B_A = B_B, the singlet is invariant: U_A ⊗ U_B |Ψ⁻⟩ = |Ψ⁻⟩
    // up to an overall phase (= 1 for traceless H). Verify ⟨σ_x ⊗ σ_x⟩ and
    // ⟨σ_z ⊗ σ_z⟩ are unchanged after evolution.
    const psi0 = bellState('psiMinus')
    const evolved = precessPureState(psi0, [0, 0, 1], [0, 0, 1], 0.7)
    // Build density matrix from the evolved state
    const buildDensity = (psi: typeof psi0) => pureDensityMatrix(psi)
    const rho0 = buildDensity(psi0)
    const rhoT = buildDensity(evolved)
    expect(trace4(rhoT)).toBeCloseTo(1, 10)

    // For the singlet, ⟨σ_a ⊗ σ_a⟩ = −1 for any a. Verify across several axes.
    const axes: Vec3[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [Math.SQRT1_2, Math.SQRT1_2, 0],
    ]
    for (const a of axes) {
      const e0 = correlationExpectation(rho0, a, a)
      const eT = correlationExpectation(rhoT, a, a)
      expect(eT).toBeCloseTo(e0, 10)
    }
  })

  it('asymmetric-field evolution shifts the optimal CHSH-correlation axis', () => {
    // With B_A ≠ B_B, the singlet's correlation function rotates in axis-space.
    // Specifically, ⟨σ_a ⊗ σ_b⟩ measured along the z-axis at t=0 equals -1
    // (since a=b=ẑ); after asymmetric evolution it should be different.
    const psi0 = bellState('psiMinus')
    const evolved = precessPureState(psi0, [0, 0, 1], [0, 0, 0], 0.5)
    const rho = pureDensityMatrix(evolved)
    const e = correlationExpectation(rho, [0, 0, 1], [0, 0, 1])
    // After only Alice precessing, the singlet has rotated; expect non-trivial.
    expect(e).toBeCloseTo(-1, 10) // σ_z is unchanged by z-axis rotation
    // But for σ_x⊗σ_x: Alice's σ_x gets rotated about z by 2θ_A = 2 · 0.5 = 1 rad
    const eX = correlationExpectation(rho, [1, 0, 0], [1, 0, 0])
    // ⟨σ_x ⊗ σ_x⟩ for U_A=R_z(2·0.5) |Ψ⁻⟩: should equal −cos(1.0) ≈ −0.540
    // (rotation of one party's frame).
    expect(eX).toBeCloseTo(-Math.cos(1.0), 8)
  })
})

describe('precessDensityMatrix', () => {
  it('preserves trace and Hermiticity', () => {
    const rho0 = wernerDensityMatrix(0.85)
    const rhoT = precessDensityMatrix(rho0, [0.5, 0.2, 0.7], [-0.3, 0.4, 0.1], 0.4)
    expect(trace4(rhoT)).toBeCloseTo(1, 10)
    // Hermiticity: (rho_ij)* = rho_ji
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        expect(rhoT.re[i * 4 + j]).toBeCloseTo(rhoT.re[j * 4 + i] ?? 0, 10)
        expect(rhoT.im[i * 4 + j]).toBeCloseTo(-(rhoT.im[j * 4 + i] ?? 0), 10)
      }
    }
  })

  it('preserves Tr(ρ²) — purity is invariant under unitary evolution', () => {
    const rho0 = wernerDensityMatrix(0.6)
    const tr2_0 = traceProduct4(rho0, rho0)
    const rhoT = precessDensityMatrix(rho0, [1, 0, 0], [0, 1, 0], 1.0)
    const tr2_T = traceProduct4(rhoT, rhoT)
    expect(tr2_T).toBeCloseTo(tr2_0, 10)
  })
})

describe('buildJointUnitary', () => {
  it('matches the tensor product of single-qubit unitaries', () => {
    const bA: Vec3 = [0.5, -0.2, 0.7]
    const bB: Vec3 = [0.1, 0.6, -0.3]
    const t = 0.3
    const uA = singleQubitPrecession(bA, t)
    const uB = singleQubitPrecession(bB, t)
    const U = buildJointUnitary(bA, bB, t)
    // Spot-check the (i=0, j=0) block: should equal uA[0,0] · uB[0,0]
    // U[0, 0] = uA[0,0] · uB[0,0]
    const ar = uA.re[0] ?? 0
    const ai = uA.im[0] ?? 0
    const br = uB.re[0] ?? 0
    const bi = uB.im[0] ?? 0
    expect(U.re[0]).toBeCloseTo(ar * br - ai * bi, 12)
    expect(U.im[0]).toBeCloseTo(ar * bi + ai * br, 12)
  })
})
