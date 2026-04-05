/**
 * Coordinate Entanglement — Reduced Density Matrix & Entropy
 *
 * Treats the N spatial dimensions of a single-particle wavefunction as N
 * quantum subsystems. Computes the reduced density matrix for each dimension
 * by tracing out all others, then extracts the von Neumann entropy.
 *
 * The tensor product structure L²(ℝ^N) ≅ ⊗_d L²(ℝ) defines a natural
 * bipartition: dimension d vs all others. For each dimension d with grid
 * size M_d, the RDM ρ_d is M_d × M_d Hermitian positive-semidefinite.
 *
 * Complexity per dimension: O(totalSites × M_d) for RDM + O(M_d³) for eigendecomp.
 *
 * @module lib/physics/coordinateEntanglement
 */

import { wignerNegativityFromRDM } from '@/lib/physics/wigner/wignerFromRDM'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum supported RDM size (grid points per dimension). */
export const MAX_RDM_SIZE = 64

/** Eigenvalue threshold: values below this are treated as zero in entropy. */
const EIGENVALUE_THRESHOLD = 1e-12

/** Maximum RDM size for bipartition eigendecomp (M^k ≤ this). */
const MAX_BIPARTITION_RDM = 1024

/** Maximum RDM size for pairwise MI (M₁·M₂ ≤ this). */
const MAX_PAIRWISE_RDM = 1024

// ─── Types ──────────────────────────────────────────────────────────────────

/** Result of computing coordinate entanglement for one diagnostic frame. */
export interface CoordinateEntanglementResult {
  /** Per-dimension entanglement entropy S_d (d vs rest). null if M_d > MAX_RDM_SIZE. */
  entropies: (number | null)[]
  /** Average entropy S̄ over computed dimensions only. */
  averageEntropy: number
  /** Maximum possible entropy log(M_d) for each dimension. null if skipped. */
  maxEntropies: (number | null)[]
  /** Normalized average S̄ / max(S̄) ∈ [0, 1]. */
  normalizedEntropy: number
  /** Bipartition entropies S_{k|N-k} for k=1,...,⌊N/2⌋ (null if too expensive). */
  bipartitionEntropies: (number | null)[]
  /** Pairwise mutual information I(d₁,d₂) — full symmetric N×N matrix (row-major), or null if skipped. */
  mutualInfo: Float64Array | null
  /** Eigenvalue spectrum of ρ₁ for the first dimension (diagnostic). */
  spectrum: number[]
  /** Per-dimension Wigner negativity from ρ_d. null if skipped or M_d > MAX_RDM_SIZE. */
  wignerNegativities: (number | null)[]
  /** Average Wigner negativity across computed dimensions. 0 if none computed. */
  averageWignerNegativity: number
}

/** Options controlling which observables to compute. */
export interface EntanglementOptions {
  /** Compute pairwise mutual information matrix (CPU-expensive for large M). */
  computePairwiseMI: boolean
  /** Compute k-dimensional bipartition entropies. */
  computeBipartitions: boolean
  /** Compute Wigner negativity from each per-dimension RDM ρ_d. */
  computeWignerNegativity: boolean
}

// ─── Index Arithmetic ───────────────────────────────────────────────────────

/**
 * Compute strides for row-major indexing into an N-dimensional grid.
 *
 * @param gridSize - Grid dimensions [M_0, M_1, ..., M_{N-1}]
 * @returns Strides array where stride[d] = Π_{k>d} M_k
 */
function computeStrides(gridSize: number[]): number[] {
  const N = gridSize.length
  const strides = new Array<number>(N)
  strides[N - 1] = 1
  for (let d = N - 2; d >= 0; d--) {
    strides[d] = strides[d + 1]! * gridSize[d + 1]!
  }
  return strides
}

// ─── Reduced Density Matrix ─────────────────────────────────────────────────

/**
 * Compute the reduced density matrix for dimension `targetDim` by tracing
 * out all other dimensions.
 *
 * Uses the fiber decomposition: for each "other index" (the linear index
 * with dimension `targetDim` removed), extract the M_d values of ψ along
 * that fiber and accumulate the M_d × M_d outer product into ρ.
 *
 * Complexity: O(totalSites × M_d) for the contraction.
 *
 * @param psiRe - Real part of wavefunction (f32 from GPU readback)
 * @param psiIm - Imaginary part of wavefunction (f32 from GPU readback)
 * @param gridSize - Grid dimensions [M_0, ..., M_{N-1}]
 * @param targetDim - Which dimension to keep (trace out all others)
 * @returns Hermitian RDM as {re, im} Float64Arrays (row-major M×M) and size M
 */
export function computeReducedDensityMatrix(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: number[],
  targetDim: number
): { re: Float64Array; im: Float64Array; M: number } {
  const N = gridSize.length
  const M = gridSize[targetDim]!
  const totalSites = psiRe.length

  const rhoRe = new Float64Array(M * M)
  const rhoIm = new Float64Array(M * M)

  // Strides for the full grid
  const strides = computeStrides(gridSize)
  const targetStride = strides[targetDim]!

  // Number of fibers = totalSites / M
  const numFibers = totalSites / M

  // Compute "other strides" — strides for the (N-1)-dimensional grid
  // with dimension targetDim removed. We iterate over fibers by
  // constructing the linear index for each fiber's start position.
  //
  // For each fiber f (0 to numFibers-1):
  //   Decompose f into coordinates in all dims except targetDim.
  //   Build the base linear index (with targetDim coord = 0).
  //   Then samples along the fiber are at base + i * targetStride.

  // Build reduced grid (all dims except targetDim)
  const reducedDims: number[] = []
  const reducedStrides: number[] = []
  for (let d = 0; d < N; d++) {
    if (d !== targetDim) {
      reducedDims.push(gridSize[d]!)
      reducedStrides.push(strides[d]!)
    }
  }

  // Strides within the reduced index space
  const redN = reducedDims.length
  const redStrides = new Array<number>(redN)
  if (redN > 0) {
    redStrides[redN - 1] = 1
    for (let d = redN - 2; d >= 0; d--) {
      redStrides[d] = redStrides[d + 1]! * reducedDims[d + 1]!
    }
  }

  // Temporary buffer for one fiber's psi values
  const fiberRe = new Float64Array(M)
  const fiberIm = new Float64Array(M)

  for (let f = 0; f < numFibers; f++) {
    // Decompose fiber index into reduced coordinates and compute base linear index
    let baseIdx = 0
    let remainder = f
    for (let rd = 0; rd < redN; rd++) {
      const coord = Math.floor(remainder / redStrides[rd]!)
      remainder -= coord * redStrides[rd]!
      baseIdx += coord * reducedStrides[rd]!
    }

    // Extract fiber values
    for (let i = 0; i < M; i++) {
      const idx = baseIdx + i * targetStride
      fiberRe[i] = psiRe[idx]!
      fiberIm[i] = psiIm[idx]!
    }

    // Accumulate outer product: ρ(i,j) += ψ(i) · ψ*(j)
    for (let i = 0; i < M; i++) {
      const ri = fiberRe[i]!
      const ii = fiberIm[i]!
      // Diagonal: |ψ_i|²
      rhoRe[i * M + i]! += ri * ri + ii * ii
      // Off-diagonal (upper triangle, then mirror)
      for (let j = i + 1; j < M; j++) {
        const rj = fiberRe[j]!
        const ij = fiberIm[j]!
        // ψ_i · ψ_j* = (ri + i·ii)(rj - i·ij) = ri·rj + ii·ij + i(ii·rj - ri·ij)
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

  return { re: rhoRe, im: rhoIm, M }
}

// ─── Multi-Dimension Reduced Density Matrix ─────────────────────────────────

/**
 * Compute the reduced density matrix for a set of dimensions (joint RDM).
 *
 * Used for bipartition entropy S_{k|N-k} and pairwise MI.
 * The joint RDM has size M_joint × M_joint where M_joint = Π_{d ∈ dims} M_d.
 *
 * @param psiRe - Real part of wavefunction
 * @param psiIm - Imaginary part of wavefunction
 * @param gridSize - Grid dimensions
 * @param dims - Set of dimensions to keep (sorted ascending)
 * @returns Joint RDM as {re, im, M} or null if M_joint > MAX_BIPARTITION_RDM
 */
export function computeJointReducedDensityMatrix(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: number[],
  dims: number[]
): { re: Float64Array; im: Float64Array; M: number } | null {
  // Compute joint dimension size
  let Mjoint = 1
  for (const d of dims) Mjoint *= gridSize[d]!
  if (Mjoint > MAX_BIPARTITION_RDM) return null

  const N = gridSize.length
  const totalSites = psiRe.length
  const strides = computeStrides(gridSize)

  const rhoRe = new Float64Array(Mjoint * Mjoint)
  const rhoIm = new Float64Array(Mjoint * Mjoint)

  // Build joint strides (strides within the kept-dimensions sub-grid)
  const jointStrides = new Array<number>(dims.length)
  jointStrides[dims.length - 1] = 1
  for (let k = dims.length - 2; k >= 0; k--) {
    jointStrides[k] = jointStrides[k + 1]! * gridSize[dims[k + 1]!]!
  }

  // For efficiency: build "traced" dimensions and their info
  const tracedDims: number[] = []
  const dimInKept = new Int8Array(N) // 1 if dim is in kept set
  for (const d of dims) dimInKept[d] = 1
  for (let d = 0; d < N; d++) {
    if (!dimInKept[d]) tracedDims.push(d)
  }

  const numFibers = totalSites / Mjoint

  // Build reduced strides for traced dimensions
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

  // Temporary buffer for one fiber's psi values
  const fiberRe = new Float64Array(Mjoint)
  const fiberIm = new Float64Array(Mjoint)

  // Iterate over all traced-dimension indices (fibers)
  for (let f = 0; f < numFibers; f++) {
    // Compute base index for this fiber (all kept-dim coords = 0)
    let baseIdx = 0
    let remainder = f
    for (let k = 0; k < tN; k++) {
      const coord = Math.floor(remainder / tracedRedStrides[k]!)
      remainder -= coord * tracedRedStrides[k]!
      baseIdx += coord * tracedFullStrides[k]!
    }

    // Extract fiber: iterate over all joint indices
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

    // Accumulate outer product
    for (let i = 0; i < Mjoint; i++) {
      const ri = fiberRe[i]!
      const ii = fiberIm[i]!
      rhoRe[i * Mjoint + i]! += ri * ri + ii * ii
      for (let j = i + 1; j < Mjoint; j++) {
        const rj = fiberRe[j]!
        const ij = fiberIm[j]!
        const reVal = ri * rj + ii * ij
        const imVal = ii * rj - ri * ij
        const uIdx = i * Mjoint + j
        const lIdx = j * Mjoint + i
        rhoRe[uIdx] = rhoRe[uIdx]! + reVal
        rhoIm[uIdx] = rhoIm[uIdx]! + imVal
        rhoRe[lIdx] = rhoRe[lIdx]! + reVal
        rhoIm[lIdx] = rhoIm[lIdx]! - imVal
      }
    }
  }

  return { re: rhoRe, im: rhoIm, M: Mjoint }
}

// ─── Jacobi Eigendecomposition ──────────────────────────────────────────────

/**
 * Jacobi eigendecomposition for an M×M Hermitian matrix stored as
 * separate re/im Float64Arrays (row-major).
 *
 * Uses the factored approach: for each off-diagonal element a_{pq},
 *   1. Phase rotation D to make a_{pq} real
 *   2. Real Jacobi rotation R to zero it out
 *   3. Combined as a similarity transform G†AG where G = D·R
 *
 * This zeroes the target element exactly in one step (unlike the
 * single-matrix complex rotation which requires multiple sweeps).
 *
 * Complexity: O(M³) per sweep, typically 3-10 sweeps for convergence.
 * For M ≤ 64, total time is < 1ms.
 *
 * @param re - Real part of Hermitian matrix (row-major, M×M)
 * @param im - Imaginary part of Hermitian matrix (row-major, M×M)
 * @param M - Matrix dimension
 * @returns Eigenvalues sorted descending
 */
export function hermitianEigenvalues(re: Float64Array, im: Float64Array, M: number): Float64Array {
  // Work on copies since we mutate during rotation
  const workRe = new Float64Array(re)
  const workIm = new Float64Array(im)

  const maxSweeps = 100
  const tolerance = 1e-14

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    // ── Cyclic Jacobi sweep: visit every upper-triangular pair (i,j) ──
    let sweepMaxOffDiag = 0

    for (let pi = 0; pi < M - 1; pi++) {
      for (let pj = pi + 1; pj < M; pj++) {
        const idx = pi * M + pj
        const aijRe = workRe[idx]!
        const aijIm = workIm[idx]!
        const aijMag = Math.sqrt(aijRe * aijRe + aijIm * aijIm)

        if (aijMag > sweepMaxOffDiag) sweepMaxOffDiag = aijMag
        if (aijMag < tolerance) continue

        // ── Step 1: Phase rotation ──────────────────────────────────
        // Make a_{pi,pj} real by multiplying column pj by e^{-iα}
        // and row pj by e^{iα}, where α = arg(a_{pi,pj}).
        if (Math.abs(aijIm) > 1e-30 * aijMag) {
          // e^{-iα} = conj(a_{pq}) / |a_{pq}|
          const eMinusAlphaRe = aijRe / aijMag
          const eMinusAlphaIm = -aijIm / aijMag
          // e^{iα} = a_{pq} / |a_{pq}|
          const eAlphaRe = aijRe / aijMag
          const eAlphaIm = aijIm / aijMag

          // Multiply column pj by e^{-iα}
          for (let k = 0; k < M; k++) {
            const cidx = k * M + pj
            const r = workRe[cidx]!
            const i = workIm[cidx]!
            workRe[cidx] = r * eMinusAlphaRe - i * eMinusAlphaIm
            workIm[cidx] = r * eMinusAlphaIm + i * eMinusAlphaRe
          }

          // Multiply row pj by e^{iα}
          for (let k = 0; k < M; k++) {
            const ridx = pj * M + k
            const r = workRe[ridx]!
            const i = workIm[ridx]!
            workRe[ridx] = r * eAlphaRe - i * eAlphaIm
            workIm[ridx] = r * eAlphaIm + i * eAlphaRe
          }
        }

        // After phase rotation the off-diagonal is real; use the signed value
        // so the Jacobi angle picks the correct rotation direction.
        const aijReal = workRe[pi * M + pj]!
        if (Math.abs(aijReal) < tolerance) continue

        // ── Step 2: Real Jacobi rotation ────────────────────────────
        const aii = workRe[pi * M + pi]!
        const ajj = workRe[pj * M + pj]!

        const tau = (aii - ajj) / (2 * aijReal)
        const t =
          tau >= 0 ? 1 / (tau + Math.sqrt(1 + tau * tau)) : -1 / (-tau + Math.sqrt(1 + tau * tau))
        const c = 1 / Math.sqrt(1 + t * t)
        const s = t * c

        // Apply real rotation R = [[c, -s], [s, c]] as similarity: R^T · A · R
        // Column rotation: B = A · R (columns pi and pj)
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

        // Row rotation: A' = R^T · B (rows pi and pj)
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

        // Force exact zero at (pi,pj) and (pj,pi) to prevent drift
        workRe[pi * M + pj] = 0
        workIm[pi * M + pj] = 0
        workRe[pj * M + pi] = 0
        workIm[pj * M + pi] = 0

        // Force diagonal to be real
        workIm[pi * M + pi] = 0
        workIm[pj * M + pj] = 0
      }
    }

    // Converged when largest off-diagonal element across the full sweep is below tolerance
    if (sweepMaxOffDiag < tolerance) break
  }

  // Extract eigenvalues from diagonal
  const eigenvalues = new Float64Array(M)
  for (let i = 0; i < M; i++) {
    eigenvalues[i] = workRe[i * M + i]!
  }

  // Sort descending
  eigenvalues.sort((a, b) => b - a)

  return eigenvalues
}

// ─── Von Neumann Entropy ────────────────────────────────────────────────────

/**
 * Compute von Neumann entropy S = -Σ λ_k log(λ_k) from eigenvalues.
 *
 * Eigenvalues below EIGENVALUE_THRESHOLD are treated as zero (contribute 0
 * to entropy since lim_{λ→0} λ·log(λ) = 0).
 *
 * @param eigenvalues - Eigenvalues of a density matrix (should sum to ~1)
 * @returns Von Neumann entropy (natural log, nats)
 */
export function vonNeumannEntropy(eigenvalues: Float64Array): number {
  let S = 0
  for (let k = 0; k < eigenvalues.length; k++) {
    const lam = eigenvalues[k]!
    if (lam > EIGENVALUE_THRESHOLD) {
      S -= lam * Math.log(lam)
    }
  }
  // Clamp to ≥ 0: f32 inputs can produce eigenvalues slightly > 1,
  // giving a small negative -λlog(λ) contribution. Entropy is non-negative
  // by definition, so clamp the final result.
  return Math.max(S, 0)
}

// ─── Full Coordinate Entanglement Pipeline ──────────────────────────────────

/**
 * Compute coordinate entanglement diagnostics for a wavefunction ψ on an
 * N-dimensional grid.
 *
 * For each dimension d:
 *   1. Compute reduced density matrix ρ_d (M_d × M_d)
 *   2. Eigendecompose ρ_d via Jacobi iteration
 *   3. Compute von Neumann entropy S_d
 *
 * Optionally computes pairwise mutual information and bipartition entropies.
 *
 * @param psiRe - Real part of wavefunction (Float32Array from GPU readback)
 * @param psiIm - Imaginary part of wavefunction (Float32Array from GPU readback)
 * @param gridSize - Grid dimensions [M_0, M_1, ..., M_{N-1}]
 * @param options - Which optional observables to compute
 * @returns Full entanglement diagnostic result
 */
export function computeCoordinateEntanglement(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: number[],
  options: EntanglementOptions
): CoordinateEntanglementResult {
  const N = gridSize.length

  // ── Normalize wavefunction ────────────────────────────────────────────
  // GPU wavefunctions are stored on a spatial grid without volume-element
  // normalization, so ‖ψ‖² ≠ 1. The RDM must have trace 1 for von Neumann
  // entropy to be physically meaningful.
  let norm2 = 0
  for (let i = 0; i < psiRe.length; i++) {
    norm2 += psiRe[i]! * psiRe[i]! + psiIm[i]! * psiIm[i]!
  }
  // Guard against near-zero norm (numerical noise from GPU readback) —
  // amplifying 1e-20 by invNorm ≈ 1e10 would produce nonsensical RDMs.
  if (norm2 > 1e-12 && Math.abs(norm2 - 1) > 1e-6) {
    const invNorm = 1 / Math.sqrt(norm2)
    const normRe = new Float32Array(psiRe.length)
    const normIm = new Float32Array(psiIm.length)
    for (let i = 0; i < psiRe.length; i++) {
      normRe[i] = psiRe[i]! * invNorm
      normIm[i] = psiIm[i]! * invNorm
    }
    psiRe = normRe
    psiIm = normIm
  }

  // ── Per-dimension entropies + Wigner negativity ───────────────────────
  const entropies = new Array<number | null>(N)
  const maxEntropies = new Array<number | null>(N)
  const wignerNegativities = new Array<number | null>(N)
  let firstSpectrum: number[] = []
  let computedSum = 0
  let computedMaxSum = 0
  let computedCount = 0
  let wignerSum = 0
  let wignerCount = 0

  for (let d = 0; d < N; d++) {
    const M = gridSize[d]!
    if (M > MAX_RDM_SIZE) {
      // Dimension too large for RDM — mark as not computed
      entropies[d] = null
      maxEntropies[d] = null
      wignerNegativities[d] = null
      continue
    }
    const rdm = computeReducedDensityMatrix(psiRe, psiIm, gridSize, d)
    const eigenvalues = hermitianEigenvalues(rdm.re, rdm.im, rdm.M)
    const S = vonNeumannEntropy(eigenvalues)
    const maxS = Math.log(rdm.M)
    entropies[d] = S
    maxEntropies[d] = maxS
    computedSum += S
    computedMaxSum += maxS
    computedCount++
    if (d === 0) {
      firstSpectrum = Array.from(eigenvalues)
    }

    // Wigner negativity from the same ρ_d (negligible cost vs RDM computation)
    if (options.computeWignerNegativity) {
      const neg = wignerNegativityFromRDM(rdm.re, rdm.im, rdm.M)
      wignerNegativities[d] = neg
      wignerSum += neg
      wignerCount++
    } else {
      wignerNegativities[d] = null
    }
  }

  const averageEntropy = computedCount > 0 ? computedSum / computedCount : 0
  const maxAvg = computedCount > 0 ? computedMaxSum / computedCount : 0
  const normalizedEntropy = maxAvg > 0 ? averageEntropy / maxAvg : 0

  // ── Bipartition entropies S_{k|N-k} for k=1,...,⌊N/2⌋ ────────────────
  const bipartitionEntropies: (number | null)[] = []
  if (options.computeBipartitions && N >= 2) {
    const halfN = Math.floor(N / 2)
    for (let k = 1; k <= halfN; k++) {
      // Use the first k dimensions as the kept subsystem
      const dims = Array.from({ length: k }, (_, i) => i)
      let Mjoint = 1
      for (const d of dims) Mjoint *= gridSize[d]!
      if (Mjoint > MAX_BIPARTITION_RDM) {
        bipartitionEntropies.push(null)
        continue
      }
      const rdm = computeJointReducedDensityMatrix(psiRe, psiIm, gridSize, dims)
      if (!rdm) {
        bipartitionEntropies.push(null)
        continue
      }
      const eigenvalues = hermitianEigenvalues(rdm.re, rdm.im, rdm.M)
      bipartitionEntropies.push(vonNeumannEntropy(eigenvalues))
    }
  }

  // ── Pairwise mutual information ───────────────────────────────────────
  let mutualInfo: Float64Array | null = null
  if (options.computePairwiseMI && N >= 2) {
    mutualInfo = new Float64Array(N * N).fill(NaN)
    // Set diagonal MI to 0 (self-information is not meaningful in this context)
    for (let d = 0; d < N; d++) mutualInfo[d * N + d] = 0
    for (let d1 = 0; d1 < N; d1++) {
      const s1 = entropies[d1]
      if (s1 === null || s1 === undefined) continue
      for (let d2 = d1 + 1; d2 < N; d2++) {
        const s2 = entropies[d2]
        if (s2 === null || s2 === undefined) continue
        const jointSize = gridSize[d1]! * gridSize[d2]!
        if (jointSize > MAX_PAIRWISE_RDM) continue

        const jointRdm = computeJointReducedDensityMatrix(psiRe, psiIm, gridSize, [d1, d2])
        if (!jointRdm) continue

        const jointEigs = hermitianEigenvalues(jointRdm.re, jointRdm.im, jointRdm.M)
        const jointEntropy = vonNeumannEntropy(jointEigs)
        // MI is non-negative by definition; clamp to 0 for float precision artifacts
        const mi = Math.max(s1 + s2 - jointEntropy, 0)
        mutualInfo[d1 * N + d2] = mi
        mutualInfo[d2 * N + d1] = mi
      }
    }
  }

  const averageWignerNegativity = wignerCount > 0 ? wignerSum / wignerCount : 0

  return {
    entropies,
    averageEntropy,
    maxEntropies,
    normalizedEntropy,
    bipartitionEntropies,
    mutualInfo,
    spectrum: firstSpectrum,
    wignerNegativities,
    averageWignerNegativity,
  }
}
