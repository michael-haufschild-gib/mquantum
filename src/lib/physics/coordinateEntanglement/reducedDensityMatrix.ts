/**
 * Reduced-density-matrix construction for coordinate entanglement diagnostics.
 *
 * This module owns the contraction kernels and WASM fallbacks. The public
 * facade in `coordinateEntanglement.ts` keeps existing imports stable.
 */

import { computeStrides } from '@/lib/math/ndArray'
import { computeJointRdmWasm, computeRdmWasm, isAnimationWasmReady } from '@/lib/wasm'

import { MAX_BIPARTITION_RDM } from './constants'

/** Row-major Hermitian reduced density matrix. */
export interface ReducedDensityMatrix {
  re: Float64Array
  im: Float64Array
  M: number
}

/**
 * Compute the reduced density matrix for dimension `targetDim` by tracing
 * out all other dimensions.
 *
 * Uses fiber decomposition: for each linear index with `targetDim` removed,
 * extract the values along that fiber and accumulate the outer product.
 */
export function computeReducedDensityMatrix(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: number[],
  targetDim: number
): ReducedDensityMatrix {
  const N = gridSize.length
  const M = gridSize[targetDim]!

  if (isAnimationWasmReady()) {
    const gridU32 = new Uint32Array(gridSize)
    const packed = computeRdmWasm(psiRe, psiIm, gridU32, targetDim)
    if (packed && packed.length === 2 * M * M) {
      return {
        re: packed.slice(0, M * M),
        im: packed.slice(M * M),
        M,
      }
    }
  }

  const totalSites = psiRe.length
  const rhoRe = new Float64Array(M * M)
  const rhoIm = new Float64Array(M * M)
  const strides = computeStrides(gridSize)
  const targetStride = strides[targetDim]!
  const numFibers = totalSites / M

  const reducedDims: number[] = []
  const reducedStrides: number[] = []
  for (let d = 0; d < N; d++) {
    if (d !== targetDim) {
      reducedDims.push(gridSize[d]!)
      reducedStrides.push(strides[d]!)
    }
  }

  const redN = reducedDims.length
  const redStrides = new Array<number>(redN)
  if (redN > 0) {
    redStrides[redN - 1] = 1
    for (let d = redN - 2; d >= 0; d--) {
      redStrides[d] = redStrides[d + 1]! * reducedDims[d + 1]!
    }
  }

  const fiberRe = new Float64Array(M)
  const fiberIm = new Float64Array(M)

  for (let f = 0; f < numFibers; f++) {
    let baseIdx = 0
    let remainder = f
    for (let rd = 0; rd < redN; rd++) {
      const coord = Math.floor(remainder / redStrides[rd]!)
      remainder -= coord * redStrides[rd]!
      baseIdx += coord * reducedStrides[rd]!
    }

    for (let i = 0; i < M; i++) {
      const idx = baseIdx + i * targetStride
      fiberRe[i] = psiRe[idx]!
      fiberIm[i] = psiIm[idx]!
    }

    accumulateHermitianOuterProduct(rhoRe, rhoIm, fiberRe, fiberIm, M)
  }

  return { re: rhoRe, im: rhoIm, M }
}

/**
 * Compute the reduced density matrix for a set of kept dimensions.
 *
 * Used for bipartition entropy and pairwise mutual information. Returns null
 * when the joint subsystem would exceed the configured RDM cap.
 */
export function computeJointReducedDensityMatrix(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: number[],
  dims: number[]
): ReducedDensityMatrix | null {
  let Mjoint = 1
  for (const d of dims) Mjoint *= gridSize[d]!
  if (Mjoint > MAX_BIPARTITION_RDM) return null

  if (isAnimationWasmReady()) {
    const gridU32 = new Uint32Array(gridSize)
    const keptDimsU32 = new Uint32Array(dims)
    const packed = computeJointRdmWasm(psiRe, psiIm, gridU32, keptDimsU32)
    if (packed && packed.length === 2 * Mjoint * Mjoint) {
      return {
        re: packed.slice(0, Mjoint * Mjoint),
        im: packed.slice(Mjoint * Mjoint),
        M: Mjoint,
      }
    }
    if (packed && packed.length === 0) return null
  }

  const N = gridSize.length
  const totalSites = psiRe.length
  const strides = computeStrides(gridSize)
  const rhoRe = new Float64Array(Mjoint * Mjoint)
  const rhoIm = new Float64Array(Mjoint * Mjoint)

  const jointStrides = new Array<number>(dims.length)
  jointStrides[dims.length - 1] = 1
  for (let k = dims.length - 2; k >= 0; k--) {
    jointStrides[k] = jointStrides[k + 1]! * gridSize[dims[k + 1]!]!
  }

  const tracedDims: number[] = []
  const dimInKept = new Int8Array(N)
  for (const d of dims) dimInKept[d] = 1
  for (let d = 0; d < N; d++) {
    if (!dimInKept[d]) tracedDims.push(d)
  }

  const numFibers = totalSites / Mjoint
  const tracedGridSizes = tracedDims.map((d) => gridSize[d]!)
  const tracedFullStrides = tracedDims.map((d) => strides[d]!)
  const tN = tracedDims.length
  const tracedRedStrides = new Array<number>(tN)
  if (tN > 0) {
    tracedRedStrides[tN - 1] = 1
    for (let k = tN - 2; k >= 0; k--) {
      tracedRedStrides[k] = tracedRedStrides[k + 1]! * tracedGridSizes[k + 1]!
    }
  }

  const fiberRe = new Float64Array(Mjoint)
  const fiberIm = new Float64Array(Mjoint)

  for (let f = 0; f < numFibers; f++) {
    let baseIdx = 0
    let remainder = f
    for (let k = 0; k < tN; k++) {
      const coord = Math.floor(remainder / tracedRedStrides[k]!)
      remainder -= coord * tracedRedStrides[k]!
      baseIdx += coord * tracedFullStrides[k]!
    }

    for (let ji = 0; ji < Mjoint; ji++) {
      let idx = baseIdx
      let rem = ji
      for (let k = 0; k < dims.length; k++) {
        const coord = Math.floor(rem / jointStrides[k]!)
        rem -= coord * jointStrides[k]!
        idx += coord * strides[dims[k]!]!
      }
      fiberRe[ji] = psiRe[idx]!
      fiberIm[ji] = psiIm[idx]!
    }

    accumulateHermitianOuterProduct(rhoRe, rhoIm, fiberRe, fiberIm, Mjoint)
  }

  return { re: rhoRe, im: rhoIm, M: Mjoint }
}

function accumulateHermitianOuterProduct(
  rhoRe: Float64Array,
  rhoIm: Float64Array,
  fiberRe: Float64Array,
  fiberIm: Float64Array,
  M: number
): void {
  for (let i = 0; i < M; i++) {
    const ri = fiberRe[i]!
    const ii = fiberIm[i]!
    rhoRe[i * M + i]! += ri * ri + ii * ii
    for (let j = i + 1; j < M; j++) {
      const rj = fiberRe[j]!
      const ij = fiberIm[j]!
      const reVal = ri * rj + ii * ij
      const imVal = ii * rj - ri * ij
      const uIdx = i * M + j
      const lIdx = j * M + i
      rhoRe[uIdx] = rhoRe[uIdx]! + reVal
      rhoIm[uIdx] = rhoIm[uIdx]! + imVal
      rhoRe[lIdx] = rhoRe[lIdx]! + reVal
      rhoIm[lIdx] = rhoIm[lIdx]! - imVal
    }
  }
}
