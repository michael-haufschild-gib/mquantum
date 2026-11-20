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
import type { DensityMatrix, LindbladChannel } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of density matrix validation */
export interface ValidationResult {
  /** Whether all checks passed */
  valid: boolean
  /** Maximum |ρ_{kl} - ρ_{lk}*| across all elements */
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

  if (!Number.isInteger(K) || K < 1 || K > MAX_K || el.length < 2 * K * K) {
    violations.push('Invalid density matrix dimensions')
  } else if (!el.subarray(0, 2 * K * K).every(Number.isFinite)) {
    violations.push('Non-finite density matrix element')
  }
  if (!Number.isFinite(tolerance) || tolerance < 0) violations.push('Invalid tolerance')
  if (violations.length) {
    return { valid: false, hermitianResidual: NaN, traceDrift: NaN, minEigenvalue: NaN, violations }
  }

  // Check Hermiticity: ρ_{kl} = ρ_{lk}*
  let maxHermResidual = 0
  for (let k = 0; k < K; k++) {
    // Diagonal imaginary should be 0
    const diagIm = 2 * Math.abs(el[2 * (k * K + k) + 1]!)
    if (diagIm > maxHermResidual) maxHermResidual = diagIm

    for (let l = k + 1; l < K; l++) {
      const idxKL = 2 * (k * K + l)
      const idxLK = 2 * (l * K + k)
      const diffRe = Math.abs(el[idxKL]! - el[idxLK]!)
      const diffIm = Math.abs(el[idxKL + 1]! + el[idxLK + 1]!)
      const residual = Math.hypot(diffRe, diffIm)
      if (residual > maxHermResidual) maxHermResidual = residual
    }
  }
  if (maxHermResidual > tolerance) {
    violations.push(`Hermiticity violated: residual ${maxHermResidual.toExponential(2)}`)
  }

  // Check trace
  let trace = 0
  let traceIm = 0
  for (let k = 0; k < K; k++) {
    trace += el[2 * (k * K + k)]!
    traceIm += el[2 * (k * K + k) + 1]!
  }
  const traceDrift = Math.hypot(trace - 1, traceIm)
  if (traceDrift > tolerance) {
    violations.push(`Trace drift: ${traceDrift.toExponential(2)}`)
  }

  // Check positive semi-definiteness with the exact Hermitian spectrum.
  // Gershgorin lower bounds are too conservative here: a valid coherent
  // rank-1 pure state over K>=3 has diag=1/K and off-diagonal row sum
  // (K-1)/K, so a bound-only check falsely reports a negative eigenvalue.
  const minEigenvalue = minHermitianEigenvalue(rho)
  if (!Number.isFinite(minEigenvalue)) {
    violations.push('Non-finite eigenvalue')
  } else if (minEigenvalue < -tolerance) {
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
  if (
    !Number.isFinite(temperature) ||
    temperature < 0 ||
    !Number.isFinite(tolerance) ||
    tolerance < 0
  )
    return false
  for (const rate of rates) {
    if (
      !Number.isFinite(rate.gammaDown) ||
      rate.gammaDown < 0 ||
      !Number.isFinite(rate.gammaUp) ||
      rate.gammaUp < 0 ||
      !Number.isFinite(rate.omega) ||
      rate.omega <= 0
    )
      return false
    if (rate.gammaDown === 0) {
      if (rate.gammaUp !== 0) return false
      continue
    }
    if (temperature <= 0) {
      // At T=0, γ_up should be 0
      if (rate.gammaUp !== 0) return false
      continue
    }

    const expectedRatio = Math.exp(-rate.omega / (KB_ATOMIC * temperature))
    const expectedUp = rate.gammaDown * expectedRatio
    if (Math.abs(rate.gammaUp - expectedUp) > tolerance * expectedUp) return false
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
    const stateRow = basis[ch.row]
    const stateCol = basis[ch.col]
    if (!stateRow || !stateCol) return false
    if (ch.row === ch.col) continue

    if (!isAllowedE1(stateRow, stateCol)) return false
  }

  return true
}
