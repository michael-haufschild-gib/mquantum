/**
 * Spectral helpers for coordinate entanglement diagnostics.
 *
 * Keeps eigensolver and entropy math separate from RDM construction and from
 * the top-level orchestration code.
 */

import { hermitianEigenvaluesWasm, isAnimationWasmReady } from '@/lib/wasm'

import { EIGENVALUE_THRESHOLD } from './constants'

/** Default sweep cap on the Jacobi iteration. Typical convergence is 3-10 sweeps. */
const HERMITIAN_JACOBI_MAX_SWEEPS = 100

/** Off-diagonal magnitude tolerance for convergence. */
const HERMITIAN_JACOBI_TOLERANCE = 1e-14

/**
 * Jacobi eigendecomposition for an M x M Hermitian matrix stored as separate
 * real and imaginary row-major Float64Arrays.
 *
 * Throws if the solver fails to converge; a non-converged diagonal is not a
 * valid spectrum and would feed plausible-looking bad entropy downstream.
 */
export function hermitianEigenvalues(
  re: Float64Array,
  im: Float64Array,
  M: number,
  maxSweeps: number = HERMITIAN_JACOBI_MAX_SWEEPS
): Float64Array {
  if (maxSweeps === HERMITIAN_JACOBI_MAX_SWEEPS && isAnimationWasmReady()) {
    const wasmResult = hermitianEigenvaluesWasm(re, im, M)
    if (wasmResult && wasmResult.length === M) {
      return wasmResult
    }
  }

  const workRe = new Float64Array(re)
  const workIm = new Float64Array(im)
  const tolerance = HERMITIAN_JACOBI_TOLERANCE
  let converged = false

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let sweepMaxOffDiag = 0

    for (let pi = 0; pi < M - 1; pi++) {
      for (let pj = pi + 1; pj < M; pj++) {
        const idx = pi * M + pj
        const aijRe = workRe[idx]!
        const aijIm = workIm[idx]!
        const aijMag = Math.sqrt(aijRe * aijRe + aijIm * aijIm)

        if (aijMag > sweepMaxOffDiag) sweepMaxOffDiag = aijMag
        if (aijMag < tolerance) continue

        if (Math.abs(aijIm) > 1e-30 * aijMag) {
          const eMinusAlphaRe = aijRe / aijMag
          const eMinusAlphaIm = -aijIm / aijMag
          const eAlphaRe = aijRe / aijMag
          const eAlphaIm = aijIm / aijMag

          for (let k = 0; k < M; k++) {
            const cidx = k * M + pj
            const r = workRe[cidx]!
            const i = workIm[cidx]!
            workRe[cidx] = r * eMinusAlphaRe - i * eMinusAlphaIm
            workIm[cidx] = r * eMinusAlphaIm + i * eMinusAlphaRe
          }

          for (let k = 0; k < M; k++) {
            const ridx = pj * M + k
            const r = workRe[ridx]!
            const i = workIm[ridx]!
            workRe[ridx] = r * eAlphaRe - i * eAlphaIm
            workIm[ridx] = r * eAlphaIm + i * eAlphaRe
          }
        }

        const aijReal = workRe[pi * M + pj]!
        if (Math.abs(aijReal) < tolerance) continue

        const aii = workRe[pi * M + pi]!
        const ajj = workRe[pj * M + pj]!
        const tau = (aii - ajj) / (2 * aijReal)
        const t =
          tau >= 0 ? 1 / (tau + Math.sqrt(1 + tau * tau)) : -1 / (-tau + Math.sqrt(1 + tau * tau))
        const c = 1 / Math.sqrt(1 + t * t)
        const s = t * c

        for (let k = 0; k < M; k++) {
          const idxKI = k * M + pi
          const idxKJ = k * M + pj
          const akiRe = workRe[idxKI]!
          const akiIm = workIm[idxKI]!
          const akjRe = workRe[idxKJ]!
          const akjIm = workIm[idxKJ]!

          workRe[idxKI] = c * akiRe + s * akjRe
          workIm[idxKI] = c * akiIm + s * akjIm
          workRe[idxKJ] = -s * akiRe + c * akjRe
          workIm[idxKJ] = -s * akiIm + c * akjIm
        }

        for (let k = 0; k < M; k++) {
          const idxIK = pi * M + k
          const idxJK = pj * M + k
          const aikRe = workRe[idxIK]!
          const aikIm = workIm[idxIK]!
          const ajkRe = workRe[idxJK]!
          const ajkIm = workIm[idxJK]!

          workRe[idxIK] = c * aikRe + s * ajkRe
          workIm[idxIK] = c * aikIm + s * ajkIm
          workRe[idxJK] = -s * aikRe + c * ajkRe
          workIm[idxJK] = -s * aikIm + c * ajkIm
        }

        workRe[pi * M + pj] = 0
        workIm[pi * M + pj] = 0
        workRe[pj * M + pi] = 0
        workIm[pj * M + pi] = 0
        workIm[pi * M + pi] = 0
        workIm[pj * M + pj] = 0
      }
    }

    if (sweepMaxOffDiag < tolerance) {
      converged = true
      break
    }
  }

  if (!converged) {
    let residual = 0
    for (let i = 0; i < M - 1; i++) {
      for (let j = i + 1; j < M; j++) {
        const r = workRe[i * M + j]!
        const im2 = workIm[i * M + j]!
        const mag = Math.sqrt(r * r + im2 * im2)
        if (mag > residual) residual = mag
      }
    }
    if (residual >= tolerance) {
      throw new Error(
        `hermitianEigenvalues: failed to converge within ${maxSweeps} sweeps ` +
          `(M=${M}, residual=${residual.toExponential(3)}, tolerance=${tolerance.toExponential(3)})`
      )
    }
  }

  const eigenvalues = new Float64Array(M)
  for (let i = 0; i < M; i++) {
    eigenvalues[i] = workRe[i * M + i]!
  }
  eigenvalues.sort((a, b) => b - a)
  return eigenvalues
}

/**
 * Compute von Neumann entropy from density-matrix eigenvalues.
 *
 * Eigenvalues below the threshold contribute zero, matching the limiting
 * value of -lambda log(lambda) as lambda approaches zero.
 */
export function vonNeumannEntropy(eigenvalues: Float64Array): number {
  let S = 0
  for (let k = 0; k < eigenvalues.length; k++) {
    const lam = eigenvalues[k]!
    if (lam > EIGENVALUE_THRESHOLD) {
      S -= lam * Math.log(lam)
    }
  }
  return Math.max(S, 0)
}
