/**
 * Open Quantum Validation
 *
 * Runtime physics checks for density matrices, detailed balance,
 * and selection rule compliance. Used for diagnostics and testing.
 *
 * @module lib/physics/openQuantum/validation
 */

import type { HydrogenBasisState } from './hydrogenBasis'
import { KB_ATOMIC, type TransitionRate } from './hydrogenRates'
import { hermitianEigendecompose, MAX_K } from './integrator'
import { isAllowedE1 } from './selectionRules'
import type { LindbladChannel } from './types'
import type { DensityMatrix } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of density matrix validation */
export interface ValidationResult {
  /** Whether all checks passed */
  valid: boolean
  /** Maximum |ρ_{kl} - ρ_{lk}*| across all off-diagonal elements */
  hermitianResidual: number
  /** |Tr(ρ) - 1| */
  traceDrift: number
  /** Smallest eigenvalue (should be ≥ 0 for valid state) */
  minEigenvalue: number
  /** Specific violations found */
  violations: string[]
}

const validationEigenvalues = new Float64Array(MAX_K)
const validationEigenvectors = new Float64Array(MAX_K * MAX_K * 2)
const validationHermitianProjection: DensityMatrix = {
  K: MAX_K,
  elements: new Float64Array(MAX_K * MAX_K * 2),
}

function minHermitianEigenvalue(rho: DensityMatrix): number {
  const K = rho.K
  if (!Number.isInteger(K) || K < 1 || K > MAX_K) return Number.NEGATIVE_INFINITY

  const source = rho.elements
  const mutableProjection = validationHermitianProjection as { K: number; elements: Float64Array }
  const projected = mutableProjection.elements
  mutableProjection.K = K

  for (let k = 0; k < K; k++) {
    const diagIdx = 2 * (k * K + k)
    projected[diagIdx] = source[diagIdx]!
    projected[diagIdx + 1] = 0
    for (let l = k + 1; l < K; l++) {
      const idxKL = 2 * (k * K + l)
      const idxLK = 2 * (l * K + k)
      const avgRe = 0.5 * (source[idxKL]! + source[idxLK]!)
      const avgIm = 0.5 * (source[idxKL + 1]! - source[idxLK + 1]!)
      projected[idxKL] = avgRe
      projected[idxKL + 1] = avgIm
      projected[idxLK] = avgRe
      projected[idxLK + 1] = -avgIm
    }
  }

  hermitianEigendecompose(
    validationHermitianProjection,
    validationEigenvalues,
    validationEigenvectors
  )

  let minEigenvalue = Infinity
  for (let k = 0; k < K; k++) {
    minEigenvalue = Math.min(minEigenvalue, validationEigenvalues[k]!)
  }
  return minEigenvalue
}

// ---------------------------------------------------------------------------
// Density matrix validation
// ---------------------------------------------------------------------------

/**
 * Validate that a density matrix satisfies physicality constraints:
 *   1. Hermiticity: ρ = ρ†
 *   2. Unit trace: Tr(ρ) = 1
 *   3. Positive semi-definiteness: all eigenvalues ≥ 0
 *
 * @param rho - Density matrix to validate
 * @param tolerance - Acceptable tolerance for checks (default 1e-6)
 * @returns Validation result with diagnostics
 */
export function validateDensityMatrix(
  rho: DensityMatrix,
  tolerance: number = 1e-6
): ValidationResult {
  const K = rho.K
  const el = rho.elements
  const violations: string[] = []

  // Check Hermiticity: ρ_{kl} = ρ_{lk}*
  let maxHermResidual = 0
  for (let k = 0; k < K; k++) {
    // Diagonal imaginary should be 0
    const diagIm = Math.abs(el[2 * (k * K + k) + 1]!)
    if (diagIm > maxHermResidual) maxHermResidual = diagIm

    for (let l = k + 1; l < K; l++) {
      const idxKL = 2 * (k * K + l)
      const idxLK = 2 * (l * K + k)
      const diffRe = Math.abs(el[idxKL]! - el[idxLK]!)
      const diffIm = Math.abs(el[idxKL + 1]! + el[idxLK + 1]!)
      const residual = Math.max(diffRe, diffIm)
      if (residual > maxHermResidual) maxHermResidual = residual
    }
  }
  if (maxHermResidual > tolerance) {
    violations.push(`Hermiticity violated: residual ${maxHermResidual.toExponential(2)}`)
  }

  // Check trace
  let trace = 0
  for (let k = 0; k < K; k++) {
    trace += el[2 * (k * K + k)]!
  }
  const traceDrift = Math.abs(trace - 1)
  if (traceDrift > tolerance) {
    violations.push(`Trace drift: ${traceDrift.toExponential(2)}`)
  }

  // Check positive semi-definiteness with the exact Hermitian spectrum.
  // Gershgorin lower bounds are too conservative here: a valid coherent
  // rank-1 pure state over K>=3 has diag=1/K and off-diagonal row sum
  // (K-1)/K, so a bound-only check falsely reports a negative eigenvalue.
  const minEigenvalue = minHermitianEigenvalue(rho)
  if (minEigenvalue < -tolerance) {
    violations.push(`Negative eigenvalue: ${minEigenvalue.toExponential(2)}`)
  }

  return {
    valid: violations.length === 0,
    hermitianResidual: maxHermResidual,
    traceDrift,
    minEigenvalue,
    violations,
  }
}

// ---------------------------------------------------------------------------
// Detailed balance validation
// ---------------------------------------------------------------------------

/**
 * Check that transition rates satisfy detailed balance:
 *   γ_up / γ_down = exp(-ℏω / kT)
 *
 * @param rates - Transition rates
 * @param temperature - Temperature in Kelvin
 * @param tolerance - Relative tolerance (default 1e-4)
 * @returns true if all rates satisfy detailed balance within tolerance
 */
export function validateDetailedBalance(
  rates: readonly TransitionRate[],
  temperature: number,
  tolerance: number = 1e-4
): boolean {
  for (const rate of rates) {
    if (rate.gammaDown <= 0) continue
    if (temperature <= 0) {
      // At T=0, γ_up should be 0
      if (rate.gammaUp > tolerance) return false
      continue
    }

    const expectedRatio = Math.exp(-rate.omega / (KB_ATOMIC * temperature))
    const actualRatio = rate.gammaUp / rate.gammaDown
    const relError = Math.abs(actualRatio - expectedRatio) / Math.max(expectedRatio, 1e-30)
    if (relError > tolerance) return false
  }

  return true
}

// ---------------------------------------------------------------------------
// Selection rule validation
// ---------------------------------------------------------------------------

/**
 * Check that no Lindblad channels violate E1 selection rules.
 *
 * @param channels - Lindblad channels to check
 * @param basis - Hydrogen basis states
 * @returns true if all non-dephasing channels correspond to allowed E1 transitions
 */
export function validateSelectionRules(
  channels: readonly LindbladChannel[],
  basis: readonly HydrogenBasisState[]
): boolean {
  for (const ch of channels) {
    // Skip dephasing channels (row === col)
    if (ch.row === ch.col) continue

    const stateRow = basis[ch.row]
    const stateCol = basis[ch.col]
    if (!stateRow || !stateCol) return false

    if (!isAllowedE1(stateRow, stateCol)) return false
  }

  return true
}
