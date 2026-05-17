/**
 * Bell-state generators and density-matrix utilities.
 *
 * The four maximally entangled two-qubit Bell states are
 *
 *   |Ψ⁺⟩ = (|01⟩ + |10⟩)/√2
 *   |Ψ⁻⟩ = (|01⟩ − |10⟩)/√2     ← singlet, used in canonical CHSH
 *   |Φ⁺⟩ = (|00⟩ + |11⟩)/√2
 *   |Φ⁻⟩ = (|00⟩ − |11⟩)/√2
 *
 * Basis ordering is |00⟩, |01⟩, |10⟩, |11⟩ throughout — first qubit = Alice,
 * second qubit = Bob, |0⟩ = |↑⟩ (σ_z = +1), |1⟩ = |↓⟩ (σ_z = −1).
 *
 * Werner state: ρ_W(v) = v |Ψ⁻⟩⟨Ψ⁻| + (1 − v) I/4.
 * For v ≤ 1/√2 ≈ 0.7071 no CHSH inequality can be violated regardless of
 * measurement angles — this threshold is a teaching feature of the
 * simulator and is verified in `werner.test.ts`.
 *
 * @module lib/physics/bell/state
 */

import type { ComplexMat4, ComplexVec4 } from './types'

const SQRT1_2 = Math.SQRT1_2

/** Identifier for the four Bell states. */
export type BellStateKind = 'psiPlus' | 'psiMinus' | 'phiPlus' | 'phiMinus'

/** Allocate a zero ComplexVec4. */
export function zeroVec4(): ComplexVec4 {
  return { re: new Float64Array(4), im: new Float64Array(4) }
}

/** Allocate a zero 4×4 complex matrix (row-major). */
export function zeroMat4(): ComplexMat4 {
  return { re: new Float64Array(16), im: new Float64Array(16) }
}

/**
 * Generate one of the four canonical Bell states as a pure-state vector.
 *
 * @param kind - Which Bell state to generate.
 * @returns Fresh ComplexVec4 in the |00⟩, |01⟩, |10⟩, |11⟩ basis.
 *
 * @example
 * const psiMinus = bellState('psiMinus')
 * // psiMinus.re = [0, +1/√2, −1/√2, 0]
 * // psiMinus.im = [0, 0, 0, 0]
 */
export function bellState(kind: BellStateKind): ComplexVec4 {
  const v = zeroVec4()
  switch (kind) {
    case 'psiPlus':
      v.re[1] = SQRT1_2
      v.re[2] = SQRT1_2
      break
    case 'psiMinus':
      v.re[1] = SQRT1_2
      v.re[2] = -SQRT1_2
      break
    case 'phiPlus':
      v.re[0] = SQRT1_2
      v.re[3] = SQRT1_2
      break
    case 'phiMinus':
      v.re[0] = SQRT1_2
      v.re[3] = -SQRT1_2
      break
  }
  return v
}

/**
 * Build the outer-product density matrix ρ = |ψ⟩⟨ψ| from a pure state.
 *
 * @param psi - Pure-state vector.
 * @returns Hermitian rank-1 density matrix (row-major 4×4).
 */
export function pureDensityMatrix(psi: ComplexVec4): ComplexMat4 {
  const rho = zeroMat4()
  for (let i = 0; i < 4; i++) {
    const ai = psi.re[i] ?? 0
    const bi = psi.im[i] ?? 0
    for (let j = 0; j < 4; j++) {
      const aj = psi.re[j] ?? 0
      const bj = psi.im[j] ?? 0
      // ρ_ij = ψ_i · ψ_j*
      const idx = i * 4 + j
      rho.re[idx] = ai * aj + bi * bj
      rho.im[idx] = bi * aj - ai * bj
    }
  }
  return rho
}

/** Identity matrix scaled by `s` (used for the I/4 component of Werner states). */
export function scaledIdentity4(s: number): ComplexMat4 {
  const m = zeroMat4()
  m.re[0] = s
  m.re[5] = s
  m.re[10] = s
  m.re[15] = s
  return m
}

/**
 * Construct the Werner state ρ_W(v) = v |Ψ⁻⟩⟨Ψ⁻| + (1 − v) I/4.
 *
 * Werner introduced this family in Werner, R. F. (1989), "Quantum states
 * with Einstein-Podolsky-Rosen correlations admitting a hidden-variable
 * model." The singlet appears at v = 1; below v = 1/√2 ≈ 0.7071 no CHSH
 * inequality is violable regardless of the measurement settings.
 *
 * @param visibility - Mixing parameter v in [0, 1]. Out-of-range values
 *   are clamped.
 * @returns Werner density matrix (row-major 4×4).
 */
export function wernerDensityMatrix(visibility: number): ComplexMat4 {
  const v = visibility <= 0 ? 0 : visibility >= 1 ? 1 : visibility
  const rho = pureDensityMatrix(bellState('psiMinus'))
  const noiseWeight = (1 - v) * 0.25
  // Scale singlet component by v and add (1-v)/4 on the diagonal.
  for (let i = 0; i < 16; i++) {
    rho.re[i] = (rho.re[i] ?? 0) * v
    rho.im[i] = (rho.im[i] ?? 0) * v
  }
  rho.re[0] = (rho.re[0] ?? 0) + noiseWeight
  rho.re[5] = (rho.re[5] ?? 0) + noiseWeight
  rho.re[10] = (rho.re[10] ?? 0) + noiseWeight
  rho.re[15] = (rho.re[15] ?? 0) + noiseWeight
  return rho
}

/**
 * Compute Tr(ρ) — should equal 1 to within round-off for any valid density
 * matrix. Exposed for diagnostic / debug assertions.
 *
 * @param rho - Density matrix.
 * @returns The real part of the trace (the imaginary part is exactly zero
 *   for Hermitian inputs and is silently dropped).
 */
export function trace4(rho: ComplexMat4): number {
  return (rho.re[0] ?? 0) + (rho.re[5] ?? 0) + (rho.re[10] ?? 0) + (rho.re[15] ?? 0)
}

/**
 * Compute Tr(A · B) for two 4×4 complex matrices.
 *
 * Used to evaluate ⟨P⟩ = Tr(ρ · P) for projectors P. For Hermitian ρ and
 * Hermitian P, the trace is guaranteed real; the imaginary part is
 * accumulated and silently dropped (small round-off only).
 *
 * @param A - Left operand (row-major 4×4).
 * @param B - Right operand (row-major 4×4).
 * @returns Re(Tr(A · B)).
 */
export function traceProduct4(A: ComplexMat4, B: ComplexMat4): number {
  // Tr(AB) = Σ_ij A_ij B_ji
  let acc = 0
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const aIdx = i * 4 + j
      const bIdx = j * 4 + i
      const ar = A.re[aIdx] ?? 0
      const ai = A.im[aIdx] ?? 0
      const br = B.re[bIdx] ?? 0
      const bi = B.im[bIdx] ?? 0
      // (ar + i·ai)(br + i·bi) → real part: ar·br − ai·bi
      acc += ar * br - ai * bi
    }
  }
  return acc
}

/**
 * Add a Hermitian 4×4 matrix `B` into `A` in place: A ← A + B.
 *
 * @param A - Target matrix (mutated).
 * @param B - Matrix to accumulate.
 */
export function addMat4InPlace(A: ComplexMat4, B: ComplexMat4): void {
  for (let i = 0; i < 16; i++) {
    A.re[i] = (A.re[i] ?? 0) + (B.re[i] ?? 0)
    A.im[i] = (A.im[i] ?? 0) + (B.im[i] ?? 0)
  }
}

/**
 * Multiply 4×4 complex matrix `M` by scalar `s` in place: M ← s·M.
 *
 * @param M - Target matrix (mutated).
 * @param s - Real scalar.
 */
export function scaleMat4InPlace(M: ComplexMat4, s: number): void {
  for (let i = 0; i < 16; i++) {
    M.re[i] = (M.re[i] ?? 0) * s
    M.im[i] = (M.im[i] ?? 0) * s
  }
}
