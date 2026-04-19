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
 * @param K - Basis dimension (must be ≤ {@link MAX_K})
 * @returns K²×K² propagator matrix
 * @throws {Error} If `K` exceeds {@link MAX_K} — the downstream matvec reuses
 *   a `MAX_K²`-sized scratch buffer, so an unchecked oversize `K` would
 *   silently corrupt the density matrix in {@link applyPropagator}.
 */
export function computePropagator(
  liouvillian: ComplexMatrix,
  dt: number,
  K: number
): ComplexMatrix {
  if (!Number.isInteger(K) || K < 1) {
    throw new Error(`computePropagator: K must be a positive integer, got ${K}`)
  }
  if (K > MAX_K) {
    throw new Error(`computePropagator: K=${K} exceeds MAX_K=${MAX_K}`)
  }
  if (!Number.isFinite(dt)) {
    throw new Error(`computePropagator: dt must be finite, got ${dt}`)
  }
  const N = K * K
  const expected = N * N
  if (liouvillian.real.length < expected || liouvillian.imag.length < expected) {
    throw new Error(`computePropagator: liouvillian buffer too small (expected >= ${expected})`)
  }

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
 * ## Scratch sharing
 * Uses module-scoped `Float64Array` scratch buffers sized for `MAX_K² =
 * 196` complex entries — no per-call allocation. Because the scratch is
 * module-level, **do not call `applyPropagator` from interleaved execution
 * contexts** (two Web Workers, or cooperative async tasks that yield
 * mid-evaluation). Sequential same-thread calls are safe; the scratch is
 * fully overwritten inside each call.
 *
 * @param propagator - K²×K² propagator from computePropagator()
 * @param rho - Density matrix (mutated in place)
 * @throws {Error} If `rho.K` exceeds {@link MAX_K} — oversize K would write
 *   past the scratch buffer length and silently corrupt the output.
 */
export function applyPropagator(propagator: ComplexMatrix, rho: DensityMatrix): void {
  const K = rho.K
  if (!Number.isInteger(K) || K < 1) {
    throw new Error(`applyPropagator: K must be a positive integer, got ${K}`)
  }
  if (K > MAX_K) {
    throw new Error(`applyPropagator: K=${K} exceeds MAX_K=${MAX_K}`)
  }
  const N = K * K
  const el = rho.elements
  const expectedVec = 2 * N
  const expectedMat = N * N
  if (el.length < expectedVec) {
    throw new Error(`applyPropagator: rho.elements too small (expected >= ${expectedVec})`)
  }
  if (propagator.real.length < expectedMat || propagator.imag.length < expectedMat) {
    throw new Error(`applyPropagator: propagator buffer too small (expected >= ${expectedMat})`)
  }

  // Convert ρ elements (interleaved complex) to separate real/imag scratch
  // arrays. `vecIdx = k*K + l` and `matIdx = 2*vecIdx` for row-major storage,
  // so the two nested loops collapse into a single linear walk.
  for (let v = 0; v < N; v++) {
    vecReScratch[v] = el[2 * v]!
    vecImScratch[v] = el[2 * v + 1]!
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

  // Write back to density matrix — same linear walk as the read above.
  for (let v = 0; v < N; v++) {
    el[2 * v] = outReScratch[v]!
    el[2 * v + 1] = outImScratch[v]!
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
