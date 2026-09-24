/**
 * Open Quantum Systems — GPU state packing
 *
 * Packs the density matrix and scalar metrics into a GPU-uploadable Float32Array.
 *
 * Buffer layout (1600 bytes = 400 floats):
 *   [0..391]   : ρ matrix — K×K complex values packed into 14×14 grid (392 floats)
 *                index = k*14+l, stored as xy pairs in vec4f: rho[idx/2].xy or .zw
 *   [392]      : purity
 *   [393]      : linearEntropy
 *   [394]      : vonNeumannEntropy
 *   [395]      : coherenceMagnitude
 *   [396]      : groundPopulation
 *   [397]      : maxK (active basis size as float, cast to u32 in shader)
 *   [398..399] : padding (align to 16 bytes)
 *
 * The ρ matrix is stored for K_max=14 regardless of actual K; unused entries are zero.
 */

import { MAX_K } from './integrator'
import type { DensityMatrix, OpenQuantumMetrics } from './types'

/** Number of floats for the ρ matrix portion: MAX_K × MAX_K × 2 */
const RHO_FLOATS = MAX_K * MAX_K * 2

/** Total buffer size in floats */
export const OPEN_QUANTUM_BUFFER_FLOATS = RHO_FLOATS + 8 // 392 + 8 = 400

/** Total buffer size in bytes */
export const OPEN_QUANTUM_BUFFER_BYTES = OPEN_QUANTUM_BUFFER_FLOATS * 4

/** Validate basis size against the fixed GPU packing layout. */
function assertValidBasisSize(caller: string, K: number): void {
  if (!Number.isInteger(K) || K < 1) {
    throw new Error(`${caller}: K must be a positive integer, got ${K}`)
  }
  if (K > MAX_K) {
    throw new Error(`${caller}: K=${K} exceeds MAX_K=${MAX_K}`)
  }
}

/** Validate that a typed-array buffer can hold the full Open Quantum payload. */
function assertPackedBufferSize(caller: string, length: number, label = 'buffer'): void {
  if (length < OPEN_QUANTUM_BUFFER_FLOATS) {
    throw new Error(`${caller}: ${label} too small (expected >= ${OPEN_QUANTUM_BUFFER_FLOATS})`)
  }
}

/** Clamp optional shader loop basis size to the packed matrix domain. */
function normalizeActiveK(activeK: number | undefined, K: number): number {
  if (activeK === undefined || !Number.isFinite(activeK)) return K
  return Math.max(1, Math.min(K, Math.floor(activeK)))
}

/**
 * Create a preallocated GPU upload buffer.
 *
 * @returns Float32Array initialized to zero
 */
export function createPackedBuffer(): Float32Array {
  return new Float32Array(OPEN_QUANTUM_BUFFER_FLOATS)
}

/**
 * Pack density matrix and metrics into the GPU buffer.
 *
 * The density matrix is stored as K_max×K_max complex values in RHO_FLOATS floats.
 * Values are downcast from Float64 to Float32 for GPU upload.
 *
 * @param rho - Density matrix (K ≤ 14)
 * @param metrics - Current observable metrics
 * @param out - Preallocated output buffer (length ≥ OPEN_QUANTUM_BUFFER_FLOATS)
 * @param activeK - Active basis size (written to buffer for shader loop control)
 */
export function packForGPU(
  rho: DensityMatrix,
  metrics: OpenQuantumMetrics,
  out: Float32Array,
  activeK?: number
): void {
  const K = rho.K
  assertValidBasisSize('packForGPU', K)
  assertPackedBufferSize('packForGPU', out.length, 'output buffer')
  const expectedElements = K * K * 2
  if (rho.elements.length < expectedElements) {
    throw new Error(`packForGPU: rho.elements too small (expected >= ${expectedElements})`)
  }
  const el = rho.elements

  // Zero the matrix portion (handles K < MAX_K padding)
  for (let i = 0; i < RHO_FLOATS; i++) out[i] = 0

  // Pack ρ_{kl} into the MAX_K×MAX_K layout
  for (let k = 0; k < K; k++) {
    for (let l = 0; l < K; l++) {
      const srcIdx = 2 * (k * K + l)
      const dstIdx = 2 * (k * MAX_K + l)
      out[dstIdx] = el[srcIdx]!
      out[dstIdx + 1] = el[srcIdx + 1]!
    }
  }

  // Pack scalar metrics
  out[RHO_FLOATS] = metrics.purity
  out[RHO_FLOATS + 1] = metrics.linearEntropy
  out[RHO_FLOATS + 2] = metrics.vonNeumannEntropy
  out[RHO_FLOATS + 3] = metrics.coherenceMagnitude
  out[RHO_FLOATS + 4] = metrics.groundPopulation
  out[RHO_FLOATS + 5] = normalizeActiveK(activeK, K)
  out[RHO_FLOATS + 6] = 0
  out[RHO_FLOATS + 7] = 0
}

/** Largest coherence |ρ_{kj}| (j ≠ k) in row k of a row-major K×K complex matrix. */
function maxRowCoherence(el: Float64Array, K: number, k: number): number {
  let maxSq = 0
  for (let j = 0; j < K; j++) {
    if (j === k) continue
    const re = el[2 * (k * K + j)]!
    const im = el[2 * (k * K + j) + 1]!
    maxSq = Math.max(maxSq, re * re + im * im)
  }
  return Math.sqrt(maxSq)
}

/**
 * Compute effective basis size by trimming trailing states that carry neither
 * population nor coherence.
 *
 * A state k is active while ρ_{kk} or any |ρ_{kj}| exceeds the threshold.
 * Returns lastActive + 1, clamped to [minK, K].
 *
 * Coherences are part of the test because |ρ_{jk}| can reach √(ρ_jj ρ_kk):
 * at ρ_kk = 0.01 beside a populated state that is ≈ 0.1, an interference term
 * worth up to ~20 % of the local density. A population-only test dropped it,
 * and the fringes vanished abruptly the frame relaxation pushed ρ_kk under the
 * threshold.
 *
 * This trims trailing (high-energy) states that are effectively unpopulated,
 * reducing the GPU's O(K²) contraction loop without reordering the density matrix.
 *
 * @param rho - Current density matrix
 * @param populationThreshold - Minimum diagonal population to consider active (default 0.01)
 * @param minK - Floor for the returned K to preserve coherence effects (default 2)
 * @returns Effective K ∈ [minK, rho.K]
 */
export function computeActiveK(rho: DensityMatrix, populationThreshold = 0.01, minK = 2): number {
  const K = rho.K
  assertValidBasisSize('computeActiveK', K)
  const expectedElements = K * K * 2
  if (rho.elements.length < expectedElements) {
    throw new Error(`computeActiveK: rho.elements too small (expected >= ${expectedElements})`)
  }
  const el = rho.elements
  const threshold = Number.isFinite(populationThreshold) ? populationThreshold : 0.01
  const minActiveK = Number.isFinite(minK) ? Math.max(2, Math.floor(minK)) : 2

  // Find the last index with significant population or coherence
  let lastActive = 0
  for (let k = 0; k < K; k++) {
    if (el[2 * (k * K + k)]! > threshold || maxRowCoherence(el, K, k) > threshold) {
      lastActive = k
    }
  }

  return Math.min(K, Math.max(minActiveK, lastActive + 1))
}

/**
 * Unpack a GPU buffer back to a DensityMatrix (for testing/debugging).
 *
 * @param buf - Packed Float32Array (length ≥ OPEN_QUANTUM_BUFFER_FLOATS)
 * @param K - Number of basis states
 * @returns Density matrix with Float64 precision
 */
export function unpackFromGPU(buf: Float32Array, K: number): DensityMatrix {
  assertValidBasisSize('unpackFromGPU', K)
  assertPackedBufferSize('unpackFromGPU', buf.length)
  const elements = new Float64Array(K * K * 2)
  for (let k = 0; k < K; k++) {
    for (let l = 0; l < K; l++) {
      const srcIdx = 2 * (k * MAX_K + l)
      const dstIdx = 2 * (k * K + l)
      elements[dstIdx] = buf[srcIdx]!
      elements[dstIdx + 1] = buf[srcIdx + 1]!
    }
  }
  return { K, elements }
}
