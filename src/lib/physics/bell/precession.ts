/**
 * Time evolution of a two-spin state under independent uniform magnetic
 * fields on each qubit.
 *
 * Hamiltonian (ℏ = 1 units):
 *   H = γ_A B_A · σ ⊗ I + γ_B I ⊗ σ · B_B
 *
 * Because the two terms commute on different tensor factors, the time
 * evolution factorizes:
 *
 *   U(t) = U_A(t) ⊗ U_B(t),    U_X(t) = exp(−i γ_X B_X · σ · t).
 *
 * For each single-qubit rotation:
 *
 *   U_X(t) = cos(|γ_X B_X| t) · I − i · sin(|γ_X B_X| t) · n̂_X · σ
 *
 * with n̂_X = γ_X B_X / |γ_X B_X|. We absorb the gyromagnetic γ into the
 * field strength (B_eff = γ B) at the API boundary, so the caller passes
 * the *effective* precession axis and the time t.
 *
 * Physics teaching point: when B_A = B_B (common field), the singlet
 * |Ψ⁻⟩ is invariant — it picks up only an irrelevant overall phase. The
 * optimal CHSH angle pattern is therefore static. When B_A ≠ B_B, the
 * state stays maximally entangled but rotates within the maximally
 * entangled manifold, and the optimal axis choice drifts with t. This
 * drift is observable in the S(t) sparkline once the angles are held
 * fixed — a small but real "time-evolving" payoff that distinguishes
 * Phase β/γ from a static-state CHSH demo.
 *
 * @module lib/physics/bell/precession
 */

import type { ComplexMat4, ComplexVec4, Vec3 } from './types'

/** Norm-squared of a 3-vector. */
function norm3sq(v: Vec3): number {
  return (v[0] ?? 0) ** 2 + (v[1] ?? 0) ** 2 + (v[2] ?? 0) ** 2
}

/**
 * Build the 2×2 single-qubit unitary U(t) = exp(−i b · σ · t) where b is
 * the effective precession axis (already including γ).
 *
 * @param b - Effective field vector (γ · B). Its magnitude sets the
 *   Larmor angular velocity, its direction the rotation axis.
 * @param t - Elapsed time (in units consistent with b).
 * @returns 2×2 complex unitary in row-major (re, im) form.
 */
export function singleQubitPrecession(b: Vec3, t: number): { re: Float64Array; im: Float64Array } {
  const re = new Float64Array(4)
  const im = new Float64Array(4)
  const mag = Math.sqrt(norm3sq(b))
  if (mag === 0 || t === 0) {
    re[0] = 1
    re[3] = 1
    return { re, im }
  }
  const phi = mag * t
  const c = Math.cos(phi)
  const s = Math.sin(phi)
  const inv = 1 / mag
  const nx = (b[0] ?? 0) * inv
  const ny = (b[1] ?? 0) * inv
  const nz = (b[2] ?? 0) * inv
  // U = c · I − i s (n_x σ_x + n_y σ_y + n_z σ_z)
  // Expand each entry in the (re, im) representation:
  //   U[0,0] = c − i s n_z         → re = c, im = −s n_z
  //   U[0,1] = −i s (n_x − i n_y)  = −s n_y − i s n_x   → re = −s n_y, im = −s n_x
  //   U[1,0] = −i s (n_x + i n_y)  =  s n_y − i s n_x   → re =  s n_y, im = −s n_x
  //   U[1,1] = c + i s n_z         → re = c, im =  s n_z
  re[0] = c
  im[0] = -s * nz
  re[1] = -s * ny
  im[1] = -s * nx
  re[2] = s * ny
  im[2] = -s * nx
  re[3] = c
  im[3] = s * nz
  return { re, im }
}

/**
 * Apply the two-qubit precession U_A ⊗ U_B to a pure-state vector,
 * returning a fresh state.
 *
 * @param psi - Input pure state (length 4 in the |00⟩,|01⟩,|10⟩,|11⟩
 *   basis).
 * @param bA - Alice's effective field vector.
 * @param bB - Bob's effective field vector.
 * @param t - Elapsed time.
 * @returns New ComplexVec4 holding U(t) · ψ.
 */
export function precessPureState(psi: ComplexVec4, bA: Vec3, bB: Vec3, t: number): ComplexVec4 {
  const uA = singleQubitPrecession(bA, t)
  const uB = singleQubitPrecession(bB, t)
  const re = new Float64Array(4)
  const im = new Float64Array(4)
  // (U_A ⊗ U_B)[ij,kl] = U_A[i,k] · U_B[j,l] with i,j,k,l ∈ {0, 1}.
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const row = i * 2 + j
      let accRe = 0
      let accIm = 0
      for (let k = 0; k < 2; k++) {
        for (let l = 0; l < 2; l++) {
          const col = k * 2 + l
          const aIdx = i * 2 + k
          const bIdx = j * 2 + l
          // U entry: (uA[aIdx] · uB[bIdx]) complex-multiplied with psi[col]
          const ar = uA.re[aIdx] ?? 0
          const ai = uA.im[aIdx] ?? 0
          const br = uB.re[bIdx] ?? 0
          const bi = uB.im[bIdx] ?? 0
          const ur = ar * br - ai * bi
          const ui = ar * bi + ai * br
          const pr = psi.re[col] ?? 0
          const pi = psi.im[col] ?? 0
          accRe += ur * pr - ui * pi
          accIm += ur * pi + ui * pr
        }
      }
      re[row] = accRe
      im[row] = accIm
    }
  }
  return { re, im }
}

/**
 * Apply U · ρ · U† to a density matrix, where U = U_A(t) ⊗ U_B(t).
 *
 * Used to evolve Werner states (or any mixed state) under the same
 * Hamiltonian as pure states. The output is allocated fresh; the input
 * is not mutated.
 *
 * Implementation: build the 4×4 U from the two 2×2 factors via
 * {@link buildJointUnitary}, then perform U·ρ·U† in three full 4×4
 * multiplications. Bounded cost is fine — this runs once per UI frame,
 * not per trial.
 *
 * @param rho - Input density matrix (Hermitian, trace 1).
 * @param bA - Alice's effective field vector.
 * @param bB - Bob's effective field vector.
 * @param t - Elapsed time.
 * @returns Evolved density matrix as a fresh ComplexMat4.
 */
export function precessDensityMatrix(rho: ComplexMat4, bA: Vec3, bB: Vec3, t: number): ComplexMat4 {
  const U = buildJointUnitary(bA, bB, t)
  const Udag = adjoint4(U)
  return mat4Mul(mat4Mul(U, rho), Udag)
}

/**
 * Assemble the 4×4 joint unitary U_A(t) ⊗ U_B(t) explicitly.
 *
 * Convenience for the density-matrix path; pure-state evolution uses the
 * fused contraction in {@link precessPureState} instead to avoid the
 * intermediate 4×4 matrix.
 *
 * @param bA - Alice's effective field vector.
 * @param bB - Bob's effective field vector.
 * @param t - Elapsed time.
 * @returns 4×4 unitary in row-major (re, im) form.
 */
export function buildJointUnitary(bA: Vec3, bB: Vec3, t: number): ComplexMat4 {
  const uA = singleQubitPrecession(bA, t)
  const uB = singleQubitPrecession(bB, t)
  const re = new Float64Array(16)
  const im = new Float64Array(16)
  for (let iA = 0; iA < 2; iA++) {
    for (let jA = 0; jA < 2; jA++) {
      const aIdx = iA * 2 + jA
      const ar = uA.re[aIdx] ?? 0
      const ai = uA.im[aIdx] ?? 0
      for (let iB = 0; iB < 2; iB++) {
        for (let jB = 0; jB < 2; jB++) {
          const bIdx = iB * 2 + jB
          const br = uB.re[bIdx] ?? 0
          const bi = uB.im[bIdx] ?? 0
          const row = iA * 2 + iB
          const col = jA * 2 + jB
          const idx = row * 4 + col
          re[idx] = ar * br - ai * bi
          im[idx] = ar * bi + ai * br
        }
      }
    }
  }
  return { re, im }
}

/** Hermitian adjoint M† of a 4×4 complex matrix (transpose + conjugate). */
function adjoint4(M: ComplexMat4): ComplexMat4 {
  const re = new Float64Array(16)
  const im = new Float64Array(16)
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const src = j * 4 + i
      const dst = i * 4 + j
      re[dst] = M.re[src] ?? 0
      im[dst] = -(M.im[src] ?? 0)
    }
  }
  return { re, im }
}

/** Product A · B of two 4×4 complex matrices. */
function mat4Mul(A: ComplexMat4, B: ComplexMat4): ComplexMat4 {
  const re = new Float64Array(16)
  const im = new Float64Array(16)
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let accRe = 0
      let accIm = 0
      for (let k = 0; k < 4; k++) {
        const aIdx = i * 4 + k
        const bIdx = k * 4 + j
        const ar = A.re[aIdx] ?? 0
        const ai = A.im[aIdx] ?? 0
        const br = B.re[bIdx] ?? 0
        const bi = B.im[bIdx] ?? 0
        accRe += ar * br - ai * bi
        accIm += ar * bi + ai * br
      }
      re[i * 4 + j] = accRe
      im[i * 4 + j] = accIm
    }
  }
  return { re, im }
}
