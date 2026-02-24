/**
 * Density Matrix Propagator
 *
 * Computes the propagator P = exp(dt · L) where L is the Liouvillian
 * superoperator, and applies it to evolve the density matrix:
 *   vec(ρ(t+dt)) = P · vec(ρ(t))
 *
 * The propagator is cached and only recomputed when the Liouvillian
 * changes (basis, rates, or temperature change).
 *
 * @module lib/physics/openQuantum/propagator
 */

import type { ComplexMatrix } from './complexMatrix'
import {
  complexMatScale,
  complexMatZero,
  matrixExponentialPade,
} from './complexMatrix'
import { eigenvalueFloor, MAX_K } from './integrator'
import type { DensityMatrix } from './types'

// Pre-allocated scratch arrays for applyPropagator (avoids per-frame allocation)
const MAX_N = MAX_K * MAX_K
const vecReScratch = new Float64Array(MAX_N)
const vecImScratch = new Float64Array(MAX_N)
const outReScratch = new Float64Array(MAX_N)
const outImScratch = new Float64Array(MAX_N)

/**
 * Compute the propagator P = exp(dt · L) for the given Liouvillian.
 *
 * @param liouvillian - K²×K² Liouvillian superoperator
 * @param dt - Total timestep (dt_substep × substeps)
 * @param K - Basis dimension
 * @returns K²×K² propagator matrix
 */
export function computePropagator(
  liouvillian: ComplexMatrix,
  dt: number,
  K: number,
): ComplexMatrix {
  const N = K * K

  // Scale Liouvillian: dt · L
  const scaled = complexMatZero(N)
  complexMatScale(liouvillian, dt, 0, scaled, N)

  // Matrix exponential
  return matrixExponentialPade(scaled, N)
}

/**
 * Apply the propagator to evolve the density matrix by one timestep.
 *
 * vec(ρ(t+dt)) = P · vec(ρ(t))
 *
 * The density matrix is modified in place.
 *
 * @param propagator - K²×K² propagator from computePropagator()
 * @param rho - Density matrix (mutated in place)
 */
export function applyPropagator(
  propagator: ComplexMatrix,
  rho: DensityMatrix,
): void {
  const K = rho.K
  const N = K * K
  const el = rho.elements

  // Convert ρ elements to separate real/imag scratch arrays (zero-alloc)
  for (let k = 0; k < K; k++) {
    for (let l = 0; l < K; l++) {
      const matIdx = 2 * (k * K + l)
      const vecIdx = k * K + l
      vecReScratch[vecIdx] = el[matIdx]!
      vecImScratch[vecIdx] = el[matIdx + 1]!
    }
  }

  // Matrix-vector multiply: P · vec(ρ)
  const Pr = propagator.real
  const Pi = propagator.imag

  for (let i = 0; i < N; i++) {
    let sumRe = 0
    let sumIm = 0
    const iN = i * N
    for (let j = 0; j < N; j++) {
      const pRe = Pr[iN + j]!
      const pIm = Pi[iN + j]!
      const vRe = vecReScratch[j]!
      const vIm = vecImScratch[j]!
      sumRe += pRe * vRe - pIm * vIm
      sumIm += pRe * vIm + pIm * vRe
    }
    outReScratch[i] = sumRe
    outImScratch[i] = sumIm
  }

  // Write back to density matrix
  for (let k = 0; k < K; k++) {
    for (let l = 0; l < K; l++) {
      const matIdx = 2 * (k * K + l)
      const vecIdx = k * K + l
      el[matIdx] = outReScratch[vecIdx]!
      el[matIdx + 1] = outImScratch[vecIdx]!
    }
  }
}

/**
 * Apply a simple propagation step: unitary + dissipative via propagator,
 * then enforce physicality guards (Hermitianize + trace normalize).
 *
 * @param propagator - Cached propagator
 * @param rho - Density matrix (mutated in place)
 */
export function evolvePropagatorStep(
  propagator: ComplexMatrix,
  rho: DensityMatrix,
): void {
  applyPropagator(propagator, rho)

  // Physicality guards (same as split-step integrator)
  const K = rho.K
  const el = rho.elements

  // Hermitianize
  for (let k = 0; k < K; k++) {
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

  // Trace normalize
  let trace = 0
  for (let k = 0; k < K; k++) {
    trace += el[2 * (k * K + k)]!
  }
  if (trace > 1e-15) {
    const invTrace = 1 / trace
    const size = K * K * 2
    for (let i = 0; i < size; i++) {
      el[i] = el[i]! * invTrace
    }
  }

  // Eigenvalue floor: clamp negative eigenvalues to ε and reconstruct.
  // A Hermitian matrix can have non-negative diagonals yet negative eigenvalues,
  // so a diagonal-only proxy is insufficient. This matches evolveStep behavior.
  eigenvalueFloor(rho)
}
