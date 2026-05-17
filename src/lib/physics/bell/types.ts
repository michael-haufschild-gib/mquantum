/**
 * Shared types for the Bell-experiment physics core.
 *
 * The Bell pair lives in the 4-dimensional joint spin Hilbert space
 * ℂ² ⊗ ℂ² with basis ordering |00⟩, |01⟩, |10⟩, |11⟩ where |0⟩ = |↑⟩
 * (σ_z eigenvalue +1) and |1⟩ = |↓⟩ (σ_z eigenvalue −1). Pure states are
 * 4-component complex vectors; mixed states (Werner) are 4×4 Hermitian
 * positive-semidefinite density matrices with unit trace.
 *
 * Numerical layout: complex arrays are kept as paired Float64Array `re`
 * and `im` for parity with the rest of the codebase
 * (`coordinateEntanglement.ts:101-103`). Matrices are row-major.
 *
 * @module lib/physics/bell/types
 */

/** Length-4 complex vector with separate real and imaginary buffers. */
export interface ComplexVec4 {
  /** Real parts, length 4. */
  re: Float64Array
  /** Imaginary parts, length 4. */
  im: Float64Array
}

/** Row-major 4×4 complex matrix with separate real and imaginary buffers. */
export interface ComplexMat4 {
  /** Real parts, length 16 (row-major). */
  re: Float64Array
  /** Imaginary parts, length 16 (row-major). */
  im: Float64Array
}

/** Unit 3-vector on the Bloch sphere, conventionally (x, y, z). */
export type Vec3 = readonly [number, number, number]

/** Polar/azimuthal angle pair (θ ∈ [0, π], φ ∈ [0, 2π)) on the Bloch sphere. */
export type BlochAngle = readonly [theta: number, phi: number]

/** A single CHSH measurement outcome ∈ {+1, −1} or `null` for non-detection. */
export type Outcome = 1 | -1 | null

/** Joint (Alice, Bob) outcome pair. */
export type JointOutcome = readonly [Outcome, Outcome]

/**
 * Joint outcome probabilities for a single (a, b) setting pair.
 * `pPP = P(+, +)`, `pPM = P(+, −)`, etc. — exactly four values that
 * sum to one (within floating-point round-off).
 */
export interface JointProbabilities {
  /** P(Alice = +1, Bob = +1). */
  pPP: number
  /** P(Alice = +1, Bob = −1). */
  pPM: number
  /** P(Alice = −1, Bob = +1). */
  pMP: number
  /** P(Alice = −1, Bob = −1). */
  pMM: number
}

/** Setting index for one of the two CHSH settings per party (0 = unprimed, 1 = primed). */
export type SettingIndex = 0 | 1
