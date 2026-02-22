/**
 * Open Quantum Systems — Split-step integrator
 *
 * Evolves the density matrix ρ under the Lindblad master equation:
 *   dρ/dt = −i[H, ρ] + Σ_j D[L_j](ρ)
 *
 * Split-step method:
 *   1. Unitary step: ρ'_{kl} = ρ_{kl} · exp(−i(E_k − E_l)·dt)
 *   2. Dissipative step: ρ'' = ρ' + dt · Σ_j D[L_j](ρ')
 *   3. Physicality guards: Hermitianize, trace-normalize, eigenvalue floor
 */

import type { DensityMatrix, LindbladChannel } from './types'
import { computeDissipator } from './lindblad'

// ---------------------------------------------------------------------------
// Preallocated scratch buffers (module-scoped, shared across calls)
// ---------------------------------------------------------------------------

/** Maximum K (14 supports hydrogen n_max=3: 1+4+9 = 14 states) */
export const MAX_K = 14

/** Scratch for dissipator accumulation — K_max × K_max × 2 */
const dRhoBuffer = new Float64Array(MAX_K * MAX_K * 2)

/** Scratch density matrix wrapper for dRho */
const dRhoMatrix: DensityMatrix = { K: MAX_K, elements: dRhoBuffer }

/** Scratch for eigenvalue computation — K_max eigenvalues */
const eigenvalues = new Float64Array(MAX_K)

/** Scratch for eigenvectors — K_max × K_max × 2 (column-major complex) */
const eigenvectors = new Float64Array(MAX_K * MAX_K * 2)

/** Scratch for matrix reconstruction */
const scratchMatrix = new Float64Array(MAX_K * MAX_K * 2)

// ---------------------------------------------------------------------------
// Density matrix factory
// ---------------------------------------------------------------------------

/**
 * Create a new K×K density matrix initialized to zero.
 *
 * @param K - Number of basis states
 * @returns Fresh density matrix
 */
export function createDensityMatrix(K: number): DensityMatrix {
  return { K, elements: new Float64Array(K * K * 2) }
}

/**
 * Initialize ρ from pure-state coefficients: ρ_{kl} = c_k · c_l*.
 *
 * @param coeffsRe - Real parts of wavefunction coefficients
 * @param coeffsIm - Imaginary parts of wavefunction coefficients
 * @param K - Number of terms
 * @returns Initialized density matrix
 */
export function densityMatrixFromCoefficients(
  coeffsRe: ArrayLike<number>,
  coeffsIm: ArrayLike<number>,
  K: number,
): DensityMatrix {
  const rho = createDensityMatrix(K)
  const el = rho.elements
  for (let k = 0; k < K; k++) {
    for (let l = 0; l < K; l++) {
      const idx = 2 * (k * K + l)
      // c_k · c_l* = (ck_re + i ck_im)(cl_re - i cl_im)
      el[idx] = coeffsRe[k]! * coeffsRe[l]! + coeffsIm[k]! * coeffsIm[l]!
      el[idx + 1] = coeffsIm[k]! * coeffsRe[l]! - coeffsRe[k]! * coeffsIm[l]!
    }
  }
  return rho
}

// ---------------------------------------------------------------------------
// Unitary step
// ---------------------------------------------------------------------------

/**
 * Apply unitary evolution in the energy eigenbasis (diagonal H).
 *
 * ρ'_{kl} = ρ_{kl} · exp(−i(E_k − E_l)·dt)
 *
 * @param rho - Density matrix (mutated in place)
 * @param energies - Energy eigenvalues E_k (length K)
 * @param dt - Timestep
 */
function unitaryStep(rho: DensityMatrix, energies: Float64Array, dt: number): void {
  const K = rho.K
  const el = rho.elements

  for (let k = 0; k < K; k++) {
    for (let l = 0; l < K; l++) {
      if (k === l) continue // Diagonal elements unchanged under unitary
      const idx = 2 * (k * K + l)
      const phase = -(energies[k]! - energies[l]!) * dt
      const cosP = Math.cos(phase)
      const sinP = Math.sin(phase)
      const re = el[idx]!
      const im = el[idx + 1]!
      // (re + i·im) · (cos + i·sin) = re·cos − im·sin + i(re·sin + im·cos)
      el[idx] = re * cosP - im * sinP
      el[idx + 1] = re * sinP + im * cosP
    }
  }
}

// ---------------------------------------------------------------------------
// Dissipative step
// ---------------------------------------------------------------------------

/**
 * Apply dissipative Lindblad evolution: ρ'' = ρ' + dt · Σ_j D[L_j](ρ')
 *
 * @param rho - Density matrix (mutated in place)
 * @param channels - Lindblad channels
 * @param dt - Timestep
 */
function dissipativeStep(
  rho: DensityMatrix,
  channels: readonly LindbladChannel[],
  dt: number,
): void {
  if (channels.length === 0) return

  const K = rho.K
  const size = K * K * 2

  // Zero the scratch buffer
  for (let i = 0; i < size; i++) dRhoBuffer[i] = 0

  // Temporarily adjust dRhoMatrix.K
  ;(dRhoMatrix as { K: number }).K = K

  // Accumulate all dissipator contributions
  computeDissipator(channels, rho, dRhoMatrix)

  // Euler step: ρ += dt · dRho
  const el = rho.elements
  for (let i = 0; i < size; i++) {
    el[i] += dt * dRhoBuffer[i]!
  }
}

// ---------------------------------------------------------------------------
// Physicality guards
// ---------------------------------------------------------------------------

/**
 * Enforce Hermiticity: ρ → (ρ + ρ†) / 2
 *
 * @param rho - Density matrix (mutated in place)
 */
function hermitianize(rho: DensityMatrix): void {
  const K = rho.K
  const el = rho.elements
  for (let k = 0; k < K; k++) {
    // Diagonal: force imaginary part to zero
    el[2 * (k * K + k) + 1] = 0
    for (let l = k + 1; l < K; l++) {
      const idxKL = 2 * (k * K + l)
      const idxLK = 2 * (l * K + k)
      const avgRe = 0.5 * (el[idxKL]! + el[idxLK]!)
      const avgIm = 0.5 * (el[idxKL + 1]! - el[idxLK + 1]!)
      el[idxKL] = avgRe
      el[idxKL + 1] = avgIm
      el[idxLK] = avgRe
      el[idxLK + 1] = -avgIm
    }
  }
}

/**
 * Trace-normalize: ρ → ρ / Tr(ρ)
 *
 * @param rho - Density matrix (mutated in place)
 */
function traceNormalize(rho: DensityMatrix): void {
  const K = rho.K
  const el = rho.elements
  let trace = 0
  for (let k = 0; k < K; k++) {
    trace += el[2 * (k * K + k)]!
  }
  if (trace > 1e-15) {
    const invTrace = 1 / trace
    const size = K * K * 2
    for (let i = 0; i < size; i++) {
      el[i] *= invTrace
    }
  }
}

/**
 * Jacobi eigendecomposition for a K×K Hermitian matrix.
 *
 * For K ≤ 8, this is O(K³) per sweep with typically 3-5 sweeps.
 * Uses preallocated scratch arrays (module-scoped).
 *
 * @param rho - Hermitian density matrix (read-only during decomposition)
 * @param outEigenvalues - Output eigenvalues (length ≥ K)
 * @param outEigenvectors - Output eigenvectors in column-major complex format (length ≥ K×K×2)
 */
export function hermitianEigendecompose(
  rho: DensityMatrix,
  outEigenvalues: Float64Array,
  outEigenvectors: Float64Array,
): void {
  const K = rho.K

  // Copy rho into work matrix (scratchMatrix)
  const size = K * K * 2
  for (let i = 0; i < size; i++) {
    scratchMatrix[i] = rho.elements[i]!
  }

  // Initialize eigenvectors as identity
  for (let i = 0; i < size; i++) outEigenvectors[i] = 0
  for (let k = 0; k < K; k++) {
    outEigenvectors[2 * (k * K + k)] = 1 // Real part of diagonal = 1
  }

  // Jacobi rotations on the Hermitian matrix
  // For small K this converges quickly
  const maxSweeps = 50
  const tolerance = 1e-14

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    // Find max off-diagonal |element|
    let maxOffDiag = 0
    let pi = 0
    let pj = 1

    for (let i = 0; i < K; i++) {
      for (let j = i + 1; j < K; j++) {
        const idx = 2 * (i * K + j)
        const mag = Math.sqrt(
          scratchMatrix[idx]! * scratchMatrix[idx]! +
            scratchMatrix[idx + 1]! * scratchMatrix[idx + 1]!,
        )
        if (mag > maxOffDiag) {
          maxOffDiag = mag
          pi = i
          pj = j
        }
      }
    }

    if (maxOffDiag < tolerance) break

    // Compute 2×2 rotation to zero out (pi, pj) element
    const aii = scratchMatrix[2 * (pi * K + pi)]! // Real diagonal
    const ajj = scratchMatrix[2 * (pj * K + pj)]! // Real diagonal
    const aijIdx = 2 * (pi * K + pj)
    const aijRe = scratchMatrix[aijIdx]!
    const aijIm = scratchMatrix[aijIdx + 1]!
    const aijMag = Math.sqrt(aijRe * aijRe + aijIm * aijIm)

    // Phase factor to make a_ij real: e^{iφ} where φ = -arg(a_ij)
    const phaseRe = aijMag > 1e-30 ? aijRe / aijMag : 1
    const phaseIm = aijMag > 1e-30 ? -aijIm / aijMag : 0

    // Now solve 2×2 real symmetric problem with diagonal (aii, ajj) and off-diag aijMag
    const tau = (ajj - aii) / (2 * aijMag)
    const t =
      tau >= 0
        ? 1 / (tau + Math.sqrt(1 + tau * tau))
        : -1 / (-tau + Math.sqrt(1 + tau * tau))
    const c = 1 / Math.sqrt(1 + t * t)
    const s = t * c

    // Apply Givens rotation: G = [[c, -s·e^{-iφ}], [s·e^{iφ}, c]]
    // Rotate columns of the work matrix and eigenvectors
    for (let k = 0; k < K; k++) {
      // Work matrix: row k, cols pi and pj
      const idxKI = 2 * (k * K + pi)
      const idxKJ = 2 * (k * K + pj)
      const akiRe = scratchMatrix[idxKI]!
      const akiIm = scratchMatrix[idxKI + 1]!
      const akjRe = scratchMatrix[idxKJ]!
      const akjIm = scratchMatrix[idxKJ + 1]!

      // s·e^{iφ} · a_{kj}
      const sPhRe = s * phaseRe
      const sPhIm = s * phaseIm
      const sPhAkjRe = sPhRe * akjRe - sPhIm * akjIm
      const sPhAkjIm = sPhRe * akjIm + sPhIm * akjRe

      // s·e^{-iφ} · a_{ki}
      const sPhCRe = s * phaseRe
      const sPhCIm = -s * phaseIm
      const sPhCAkiRe = sPhCRe * akiRe - sPhCIm * akiIm
      const sPhCAkiIm = sPhCRe * akiIm + sPhCIm * akiRe

      scratchMatrix[idxKI] = c * akiRe + sPhAkjRe
      scratchMatrix[idxKI + 1] = c * akiIm + sPhAkjIm
      scratchMatrix[idxKJ] = c * akjRe - sPhCAkiRe
      scratchMatrix[idxKJ + 1] = c * akjIm - sPhCAkiIm
    }

    // Now rotate rows (for Hermitian: apply G† from right on columns transposed)
    for (let l = 0; l < K; l++) {
      const idxIL = 2 * (pi * K + l)
      const idxJL = 2 * (pj * K + l)
      const ailRe = scratchMatrix[idxIL]!
      const ailIm = scratchMatrix[idxIL + 1]!
      const ajlRe = scratchMatrix[idxJL]!
      const ajlIm = scratchMatrix[idxJL + 1]!

      // s·e^{-iφ}
      const sPhCRe2 = s * phaseRe
      const sPhCIm2 = -s * phaseIm

      // s·e^{iφ}
      const sPh2Re = s * phaseRe
      const sPh2Im = s * phaseIm

      const sPhCAjlRe = sPhCRe2 * ajlRe - sPhCIm2 * ajlIm
      const sPhCAjlIm = sPhCRe2 * ajlIm + sPhCIm2 * ajlRe

      const sPh2AilRe = sPh2Re * ailRe - sPh2Im * ailIm
      const sPh2AilIm = sPh2Re * ailIm + sPh2Im * ailRe

      scratchMatrix[idxIL] = c * ailRe + sPhCAjlRe
      scratchMatrix[idxIL + 1] = c * ailIm + sPhCAjlIm
      scratchMatrix[idxJL] = c * ajlRe - sPh2AilRe
      scratchMatrix[idxJL + 1] = c * ajlIm - sPh2AilIm
    }

    // Accumulate eigenvector rotation
    for (let k = 0; k < K; k++) {
      const idxKI = 2 * (k * K + pi)
      const idxKJ = 2 * (k * K + pj)
      const vkiRe = outEigenvectors[idxKI]!
      const vkiIm = outEigenvectors[idxKI + 1]!
      const vkjRe = outEigenvectors[idxKJ]!
      const vkjIm = outEigenvectors[idxKJ + 1]!

      const sPhRe2 = s * phaseRe
      const sPhIm2 = s * phaseIm
      const sPhVkjRe = sPhRe2 * vkjRe - sPhIm2 * vkjIm
      const sPhVkjIm = sPhRe2 * vkjIm + sPhIm2 * vkjRe

      const sPhCRe3 = s * phaseRe
      const sPhCIm3 = -s * phaseIm
      const sPhCVkiRe = sPhCRe3 * vkiRe - sPhCIm3 * vkiIm
      const sPhCVkiIm = sPhCRe3 * vkiIm + sPhCIm3 * vkiRe

      outEigenvectors[idxKI] = c * vkiRe + sPhVkjRe
      outEigenvectors[idxKI + 1] = c * vkiIm + sPhVkjIm
      outEigenvectors[idxKJ] = c * vkjRe - sPhCVkiRe
      outEigenvectors[idxKJ + 1] = c * vkjIm - sPhCVkiIm
    }
  }

  // Extract eigenvalues from diagonal of work matrix
  for (let k = 0; k < K; k++) {
    outEigenvalues[k] = scratchMatrix[2 * (k * K + k)]!
  }
}

/**
 * Eigenvalue floor: clamp negative eigenvalues to ε and reconstruct ρ.
 *
 * @param rho - Density matrix (mutated in place)
 */
export function eigenvalueFloor(rho: DensityMatrix): void {
  const K = rho.K
  const EPS = 1e-12

  // Gershgorin pre-check: if min_k(ρ_{kk} - Σ_{l≠k}|ρ_{kl}|) > EPS,
  // all eigenvalues are positive and we can skip the expensive decomposition.
  {
    const elG = rho.elements
    let gershgorinSafe = true
    for (let k = 0; k < K; k++) {
      const diag = elG[2 * (k * K + k)]!
      let offDiagSum = 0
      for (let l = 0; l < K; l++) {
        if (l === k) continue
        const idx = 2 * (k * K + l)
        const re = elG[idx]!
        const im = elG[idx + 1]!
        offDiagSum += Math.sqrt(re * re + im * im)
      }
      if (diag - offDiagSum < EPS) {
        gershgorinSafe = false
        break
      }
    }
    if (gershgorinSafe) return
  }

  hermitianEigendecompose(rho, eigenvalues, eigenvectors)

  // Check if any eigenvalues are negative
  let needsReconstruction = false
  for (let k = 0; k < K; k++) {
    if (eigenvalues[k]! < EPS) {
      eigenvalues[k] = EPS
      needsReconstruction = true
    }
  }

  if (!needsReconstruction) return

  // Renormalize eigenvalues to sum to 1
  let sum = 0
  for (let k = 0; k < K; k++) sum += eigenvalues[k]!
  const invSum = 1 / sum
  for (let k = 0; k < K; k++) eigenvalues[k]! *= invSum

  // Reconstruct: ρ = Σ_k λ_k |v_k⟩⟨v_k|
  const el = rho.elements
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      let sumRe = 0
      let sumIm = 0
      for (let k = 0; k < K; k++) {
        const lambda = eigenvalues[k]!
        // v_k[i] (column k, row i)
        const viIdx = 2 * (i * K + k)
        const viRe = eigenvectors[viIdx]!
        const viIm = eigenvectors[viIdx + 1]!
        // v_k[j]* (conjugate)
        const vjIdx = 2 * (j * K + k)
        const vjRe = eigenvectors[vjIdx]!
        const vjIm = -eigenvectors[vjIdx + 1]!
        // λ_k · v_k[i] · v_k[j]*
        sumRe += lambda * (viRe * vjRe - viIm * vjIm)
        sumIm += lambda * (viRe * vjIm + viIm * vjRe)
      }
      const idx = 2 * (i * K + j)
      el[idx] = sumRe
      el[idx + 1] = sumIm
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evolve the density matrix by one integration step.
 *
 * Split-step method:
 *   1. Unitary: phase rotation in energy eigenbasis
 *   2. Dissipative: Euler step with Lindblad dissipator
 *   3. Physicality: Hermitianize + trace-normalize + eigenvalue floor
 *
 * @param rho - Density matrix (mutated in place)
 * @param energies - Energy eigenvalues for each basis state (length K)
 * @param channels - Lindblad operators
 * @param dt - Integration timestep
 */
export function evolveStep(
  rho: DensityMatrix,
  energies: Float64Array,
  channels: readonly LindbladChannel[],
  dt: number,
): void {
  // 1. Unitary step
  unitaryStep(rho, energies, dt)

  // 2. Dissipative step
  dissipativeStep(rho, channels, dt)

  // 3. Physicality guards
  hermitianize(rho)
  traceNormalize(rho)

  // Eigenvalue floor: always run to guarantee positive semi-definiteness.
  // A Hermitian matrix can have non-negative diagonals yet negative eigenvalues,
  // so a diagonal-only proxy is insufficient.
  eigenvalueFloor(rho)
}

/**
 * Evolve the density matrix by multiple substeps.
 *
 * @param rho - Density matrix (mutated in place)
 * @param energies - Energy eigenvalues
 * @param channels - Lindblad operators
 * @param dt - Timestep per substep
 * @param substeps - Number of substeps
 */
export function evolveMultiStep(
  rho: DensityMatrix,
  energies: Float64Array,
  channels: readonly LindbladChannel[],
  dt: number,
  substeps: number,
): void {
  for (let s = 0; s < substeps; s++) {
    evolveStep(rho, energies, channels, dt)
  }
}
