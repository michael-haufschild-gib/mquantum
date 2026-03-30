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
import { complexMatScale, complexMatZero, matrixExponentialPade } from './complexMatrix'
import { eigenvalueFloor, hermitianize, MAX_K, traceNormalize } from './integrator'
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
  K: number
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
export function applyPropagator(propagator: ComplexMatrix, rho: DensityMatrix): void {
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
  // Row-major traversal: P is stored row-major, so P[i*N..i*N+N-1] is contiguous.
  // vec is small enough to fit in L1 cache (~1.5KB for N=196).
  const Pr = propagator.real
  const Pi = propagator.imag

  for (let i = 0; i < N; i++) {
    let sumRe = 0
    let sumIm = 0
    const base = i * N
    for (let j = 0; j < N; j++) {
      const pRe = Pr[base + j]!
      const pIm = Pi[base + j]!
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
export function evolvePropagatorStep(propagator: ComplexMatrix, rho: DensityMatrix): void {
  applyPropagator(propagator, rho)

  // Physicality guards (shared with split-step integrator)
  hermitianize(rho)
  traceNormalize(rho)
  eigenvalueFloor(rho)
}
