/**
 * Single-qubit and joint two-qubit projectors for arbitrary measurement axes.
 *
 * For a unit Bloch-sphere vector a = (a_x, a_y, a_z) the spin observable
 * a·σ = a_x σ_x + a_y σ_y + a_z σ_z has eigenvalues ±1 with projectors
 *
 *   P_a(+) = (I + a·σ) / 2,    P_a(−) = (I − a·σ) / 2.
 *
 * These are 2×2 Hermitian rank-1 projectors satisfying P_a(+)+P_a(−) = I.
 *
 * The joint projector for an (Alice = ±, Bob = ±) measurement is
 *
 *   P_a(s_A) ⊗ P_b(s_B)        (4×4, in the |00⟩,|01⟩,|10⟩,|11⟩ basis).
 *
 * Probabilities are extracted via Tr(ρ · P_joint), implemented in
 * {@link jointOutcomeProbabilities}.
 *
 * Conventions match `state.ts`: basis |00⟩, |01⟩, |10⟩, |11⟩; |0⟩ = |↑⟩
 * (σ_z = +1); Alice = first tensor factor, Bob = second.
 *
 * @module lib/physics/bell/projectors
 */

import { traceProduct4, zeroMat4 } from './state'
import type { BlochAngle, ComplexMat4, JointProbabilities, Vec3 } from './types'

// ── Single-qubit Pauli matrices (row-major 2×2 complex) ───────────────────

/** σ_x in (re, im) row-major form: ((0, 1), (1, 0)). */
const SIGMA_X_RE = Float64Array.of(0, 1, 1, 0)
const SIGMA_X_IM = Float64Array.of(0, 0, 0, 0)

/** σ_y: ((0, −i), (i, 0)). */
const SIGMA_Y_RE = Float64Array.of(0, 0, 0, 0)
const SIGMA_Y_IM = Float64Array.of(0, -1, 1, 0)

/** σ_z: diag(1, −1). */
const SIGMA_Z_RE = Float64Array.of(1, 0, 0, -1)
const SIGMA_Z_IM = Float64Array.of(0, 0, 0, 0)

/** I_2: diag(1, 1). */
const I2_RE = Float64Array.of(1, 0, 0, 1)
const I2_IM = Float64Array.of(0, 0, 0, 0)

/**
 * Convert a Bloch-sphere angle pair to a unit 3-vector.
 *
 * @param angle - (θ, φ) with θ ∈ [0, π], φ ∈ [0, 2π).
 * @returns Unit vector (sin θ cos φ, sin θ sin φ, cos θ).
 */
export function blochAngleToVec3(angle: BlochAngle): Vec3 {
  const [theta, phi] = angle
  const s = Math.sin(theta)
  return [s * Math.cos(phi), s * Math.sin(phi), Math.cos(theta)]
}

/**
 * Convenience: unit vector in the xy-plane at azimuthal angle `phi`.
 * The canonical CHSH setting choice (a = 0, a' = π/2, b = π/4, b' = 3π/4)
 * uses this constructor.
 *
 * @param phi - Azimuthal angle in radians.
 * @returns Unit vector (cos φ, sin φ, 0).
 */
export function azimuthalVec(phi: number): Vec3 {
  return [Math.cos(phi), Math.sin(phi), 0]
}

/**
 * Build the single-qubit projector P_a(±) = (I ± a·σ)/2 as a 2×2 complex
 * matrix in row-major (re, im) form.
 *
 * The vector `a` is assumed unit-norm. Out-of-norm inputs produce a
 * Hermitian but non-projection matrix (still useful as a weighted
 * observable); callers wanting a strict projector should normalize first.
 *
 * @param a - Bloch-sphere unit vector.
 * @param sign - +1 for spin-up along a, −1 for spin-down.
 * @returns 2×2 projector with separate `re` and `im` Float64Arrays.
 */
export function singleQubitProjector(
  a: Vec3,
  sign: 1 | -1
): { re: Float64Array; im: Float64Array } {
  const re = new Float64Array(4)
  const im = new Float64Array(4)
  const s = 0.5 * sign
  for (let i = 0; i < 4; i++) {
    re[i] =
      0.5 * (I2_RE[i] ?? 0) +
      s * (a[0] * (SIGMA_X_RE[i] ?? 0) + a[1] * (SIGMA_Y_RE[i] ?? 0) + a[2] * (SIGMA_Z_RE[i] ?? 0))
    im[i] =
      0.5 * (I2_IM[i] ?? 0) +
      s * (a[0] * (SIGMA_X_IM[i] ?? 0) + a[1] * (SIGMA_Y_IM[i] ?? 0) + a[2] * (SIGMA_Z_IM[i] ?? 0))
  }
  return { re, im }
}

/**
 * Kronecker product (A ⊗ B) of two 2×2 complex matrices, returning a 4×4
 * row-major complex matrix in the |00⟩,|01⟩,|10⟩,|11⟩ basis.
 *
 * The 4×4 index (i, j) decomposes as i = 2·i_A + i_B and j = 2·j_A + j_B,
 * so M[i, j] = A[i_A, j_A] · B[i_B, j_B] with complex multiplication.
 *
 * @param A - First factor (2×2 in flat row-major form).
 * @param B - Second factor (same form).
 * @returns Their tensor product as a fresh ComplexMat4.
 */
export function kron2x2(
  A: { re: Float64Array; im: Float64Array },
  B: { re: Float64Array; im: Float64Array }
): ComplexMat4 {
  const out = zeroMat4()
  for (let iA = 0; iA < 2; iA++) {
    for (let jA = 0; jA < 2; jA++) {
      const aIdx = iA * 2 + jA
      const ar = A.re[aIdx] ?? 0
      const ai = A.im[aIdx] ?? 0
      for (let iB = 0; iB < 2; iB++) {
        for (let jB = 0; jB < 2; jB++) {
          const bIdx = iB * 2 + jB
          const br = B.re[bIdx] ?? 0
          const bi = B.im[bIdx] ?? 0
          const row = iA * 2 + iB
          const col = jA * 2 + jB
          const idx = row * 4 + col
          out.re[idx] = ar * br - ai * bi
          out.im[idx] = ar * bi + ai * br
        }
      }
    }
  }
  return out
}

/**
 * Build the joint 4×4 projector P_a(s_A) ⊗ P_b(s_B).
 *
 * @param a - Alice's Bloch vector (unit-norm assumed).
 * @param b - Bob's Bloch vector (unit-norm assumed).
 * @param sA - Alice's outcome sign.
 * @param sB - Bob's outcome sign.
 * @returns Hermitian 4×4 projector.
 */
export function jointProjector(a: Vec3, b: Vec3, sA: 1 | -1, sB: 1 | -1): ComplexMat4 {
  return kron2x2(singleQubitProjector(a, sA), singleQubitProjector(b, sB))
}

/**
 * Compute the four joint outcome probabilities for the (a, b) setting
 * acting on density matrix ρ:
 *
 *   P(±, ±) = Tr(ρ · (P_a(±) ⊗ P_b(±))).
 *
 * The four returned values sum to 1 to within round-off.
 *
 * @param rho - State density matrix (Hermitian, trace 1).
 * @param a - Alice's Bloch vector.
 * @param b - Bob's Bloch vector.
 * @returns Joint outcome probabilities `{ pPP, pPM, pMP, pMM }`.
 */
export function jointOutcomeProbabilities(rho: ComplexMat4, a: Vec3, b: Vec3): JointProbabilities {
  const pAplus = singleQubitProjector(a, +1)
  const pAminus = singleQubitProjector(a, -1)
  const pBplus = singleQubitProjector(b, +1)
  const pBminus = singleQubitProjector(b, -1)

  return {
    pPP: traceProduct4(rho, kron2x2(pAplus, pBplus)),
    pPM: traceProduct4(rho, kron2x2(pAplus, pBminus)),
    pMP: traceProduct4(rho, kron2x2(pAminus, pBplus)),
    pMM: traceProduct4(rho, kron2x2(pAminus, pBminus)),
  }
}

/**
 * Compute the correlation ⟨σ_a ⊗ σ_b⟩ = Tr(ρ · (a·σ) ⊗ (b·σ)).
 *
 * For the singlet |Ψ⁻⟩ this equals −a·b exactly. For Werner state at
 * visibility v it equals −v · a·b. Used both as an analytical cross-check
 * and as the population mean against which the Monte Carlo estimator is
 * compared.
 *
 * @param rho - Density matrix.
 * @param a - Alice's Bloch vector.
 * @param b - Bob's Bloch vector.
 * @returns Real scalar ⟨σ_a ⊗ σ_b⟩.
 */
export function correlationExpectation(rho: ComplexMat4, a: Vec3, b: Vec3): number {
  const p = jointOutcomeProbabilities(rho, a, b)
  return p.pPP - p.pPM - p.pMP + p.pMM
}
