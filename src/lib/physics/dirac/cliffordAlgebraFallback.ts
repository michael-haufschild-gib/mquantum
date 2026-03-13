/**
 * Pure JS fallback for Clifford algebra generation.
 * Used when WASM is unavailable. Same algorithm as clifford.rs, same output format.
 *
 * Produces matrices in standard Dirac form: β = diag(I_{S/2}, −I_{S/2}),
 * so components 0..S/2−1 are particle and S/2..S−1 are antiparticle.
 */

/**
 * Compute spinor dimension: S = 2^(⌊(N+1)/2⌋), minimum 2.
 */
export function spinorSize(spatialDim: number): number {
  return Math.max(2, 1 << Math.floor((spatialDim + 1) / 2))
}

// Complex S×S matrix as Float32Array, re/im interleaved, row-major.
// Length = S * S * 2.

function complexZeros(s: number): Float32Array {
  return new Float32Array(s * s * 2)
}

function complexIdentity(s: number): Float32Array {
  const m = complexZeros(s)
  for (let i = 0; i < s; i++) {
    m[(i * s + i) * 2] = 1.0
  }
  return m
}

function getEntry(m: Float32Array, s: number, row: number, col: number): [number, number] {
  const idx = (row * s + col) * 2
  return [m[idx]!, m[idx + 1]!]
}

function setEntry(m: Float32Array, s: number, row: number, col: number, re: number, im: number): void {
  const idx = (row * s + col) * 2
  m[idx] = re
  m[idx + 1] = im
}

function kroneckerProduct(a: Float32Array, aSize: number, b: Float32Array, bSize: number): Float32Array {
  const outSize = aSize * bSize
  const result = complexZeros(outSize)
  for (let ar = 0; ar < aSize; ar++) {
    for (let ac = 0; ac < aSize; ac++) {
      const [aRe, aIm] = getEntry(a, aSize, ar, ac)
      if (aRe === 0 && aIm === 0) continue
      for (let br = 0; br < bSize; br++) {
        for (let bc = 0; bc < bSize; bc++) {
          const [bRe, bIm] = getEntry(b, bSize, br, bc)
          const outRe = aRe * bRe - aIm * bIm
          const outIm = aRe * bIm + aIm * bRe
          setEntry(result, outSize, ar * bSize + br, ac * bSize + bc, outRe, outIm)
        }
      }
    }
  }
  return result
}

// Pauli matrices (2×2)
function sigma1(): Float32Array {
  const m = complexZeros(2)
  setEntry(m, 2, 0, 1, 1, 0)
  setEntry(m, 2, 1, 0, 1, 0)
  return m
}

function sigma2(): Float32Array {
  const m = complexZeros(2)
  setEntry(m, 2, 0, 1, 0, -1)
  setEntry(m, 2, 1, 0, 0, 1)
  return m
}

function sigma3(): Float32Array {
  const m = complexZeros(2)
  setEntry(m, 2, 0, 0, 1, 0)
  setEntry(m, 2, 1, 1, -1, 0)
  return m
}

/**
 * Count set bits (popcount) of a non-negative integer.
 */
function popcount(n: number): number {
  let count = 0
  let v = n
  while (v > 0) {
    count += v & 1
    v >>= 1
  }
  return count
}

/**
 * Compute the permutation that reorders the tensor-product basis into
 * standard Dirac form where β = diag(I_{S/2}, −I_{S/2}).
 *
 * In the tensor-product construction, β = σ₃^{⊗k} is diagonal with
 * eigenvalue (−1)^popcount(i) at index i. The permutation places all
 * even-popcount indices (β = +1, particle) first, then odd-popcount
 * (β = −1, antiparticle).
 *
 * Returns perm where perm[newIndex] = oldIndex.
 */
function standardFormPermutation(s: number): number[] {
  const evenPop: number[] = []
  const oddPop: number[] = []
  for (let i = 0; i < s; i++) {
    if (popcount(i) % 2 === 0) {
      evenPop.push(i)
    } else {
      oddPop.push(i)
    }
  }
  return evenPop.concat(oddPop)
}

/**
 * Apply a permutation P to a complex matrix: M_new = P · M · P^T.
 * perm[newIndex] = oldIndex.
 */
function permuteMatrix(m: Float32Array, s: number, perm: number[]): Float32Array {
  const result = complexZeros(s)
  for (let newRow = 0; newRow < s; newRow++) {
    const oldRow = perm[newRow]!
    for (let newCol = 0; newCol < s; newCol++) {
      const oldCol = perm[newCol]!
      const [re, im] = getEntry(m, s, oldRow, oldCol)
      setEntry(result, s, newRow, newCol, re, im)
    }
  }
  return result
}

function generateDiracMatricesInternal(spatialDim: number): { alphas: Float32Array[]; beta: Float32Array } {
  if (spatialDim === 1) {
    return { alphas: [sigma1()], beta: sigma3() }
  }
  if (spatialDim === 2) {
    return { alphas: [sigma1(), sigma2()], beta: sigma3() }
  }

  const targetS = spinorSize(spatialDim)
  const baseEven = 2 * Math.log2(targetS)

  // Start from 2D base
  let allAlphas: Float32Array[] = [sigma1(), sigma2()]
  let beta = sigma3()
  let currentS = 2
  let currentDim = 2

  while (currentDim < baseEven) {
    const oldS = currentS
    currentS *= 2
    const s3 = sigma3()
    const s1 = sigma1()
    const s2 = sigma2()
    const idOld = complexIdentity(oldS)

    // Extend existing alphas: αⱼ → αⱼ ⊗ σ₃
    allAlphas = allAlphas.map(alpha => kroneckerProduct(alpha, oldS, s3, 2))

    // New alpha for dimension 2k-1: I ⊗ σ₁
    allAlphas.push(kroneckerProduct(idOld, oldS, s1, 2))

    // New alpha for dimension 2k: I ⊗ σ₂
    allAlphas.push(kroneckerProduct(idOld, oldS, s2, 2))

    // Extend beta: β → β ⊗ σ₃
    beta = kroneckerProduct(beta, oldS, s3, 2)

    currentDim += 2
  }

  // Use first spatialDim alphas
  allAlphas.length = spatialDim

  // Permute to standard Dirac form: β = diag(I_{S/2}, −I_{S/2}).
  // The tensor-product construction produces β = σ₃^{⊗k} = diag((-1)^popcount(i)),
  // which interleaves +1 and -1 eigenvalues. The permutation groups all +1
  // eigenvalues (even popcount) into the first S/2 indices.
  const perm = standardFormPermutation(currentS)
  allAlphas = allAlphas.map(alpha => permuteMatrix(alpha, currentS, perm))
  beta = permuteMatrix(beta, currentS, perm)

  return { alphas: allAlphas, beta }
}

/**
 * Generate Dirac matrices for N spatial dimensions.
 * Returns packed Float32Array matching WASM output format:
 * [spinorSize_as_f32_bits, alpha_1..., alpha_N..., beta...]
 *
 * Matrices are in standard Dirac form: β = diag(I_{S/2}, −I_{S/2}).
 *
 * @param spatialDim - Number of spatial dimensions (1-11)
 * @returns Packed gamma matrix data and spinor size
 */
export function generateDiracMatricesFallback(spatialDim: number): {
  gammaData: Float32Array
  spinorSize: number
} {
  const s = spinorSize(spatialDim)
  const { alphas, beta } = generateDiracMatricesInternal(spatialDim)
  const matrixSize = s * s * 2

  // Pack: [spinor_size_bits, alpha_1..., alpha_N..., beta...]
  const total = 1 + spatialDim * matrixSize + matrixSize
  const result = new Float32Array(total)

  // Encode spinor size as u32 bits reinterpreted as f32
  const u32View = new Uint32Array(result.buffer, 0, 1)
  u32View[0] = s

  let offset = 1
  for (const alpha of alphas) {
    result.set(alpha, offset)
    offset += matrixSize
  }
  result.set(beta, offset)

  return { gammaData: result, spinorSize: s }
}
