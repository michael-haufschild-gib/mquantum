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
  complexMatMul,
  complexMatScale,
  complexMatZero,
  matrixExponentialPade,
} from './complexMatrix'
import type { DensityMatrix } from './types'

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

  // Convert ρ elements to separate real/imag arrays
  const vecRe = new Float64Array(N)
  const vecIm = new Float64Array(N)
  for (let k = 0; k < K; k++) {
    for (let l = 0; l < K; l++) {
      const matIdx = 2 * (k * K + l)
      const vecIdx = k * K + l
      vecRe[vecIdx] = el[matIdx]!
      vecIm[vecIdx] = el[matIdx + 1]!
    }
  }

  // Matrix-vector multiply: P · vec(ρ)
  const outRe = new Float64Array(N)
  const outIm = new Float64Array(N)
  const Pr = propagator.real
  const Pi = propagator.imag

  for (let i = 0; i < N; i++) {
    let sumRe = 0
    let sumIm = 0
    const iN = i * N
    for (let j = 0; j < N; j++) {
      const pRe = Pr[iN + j]!
      const pIm = Pi[iN + j]!
      const vRe = vecRe[j]!
      const vIm = vecIm[j]!
      sumRe += pRe * vRe - pIm * vIm
      sumIm += pRe * vIm + pIm * vRe
    }
    outRe[i] = sumRe
    outIm[i] = sumIm
  }

  // Write back to density matrix
  for (let k = 0; k < K; k++) {
    for (let l = 0; l < K; l++) {
      const matIdx = 2 * (k * K + l)
      const vecIdx = k * K + l
      el[matIdx] = outRe[vecIdx]!
      el[matIdx + 1] = outIm[vecIdx]!
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
      el[i] *= invTrace
    }
  }
}
