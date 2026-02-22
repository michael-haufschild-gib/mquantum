/**
 * Open Quantum Systems — GPU state packing
 *
 * Packs the density matrix and scalar metrics into a GPU-uploadable Float32Array.
 *
 * Buffer layout (800 bytes = 200 floats):
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
  activeK?: number,
): void {
  const K = rho.K
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
  out[RHO_FLOATS + 5] = activeK ?? K
  out[RHO_FLOATS + 6] = 0
  out[RHO_FLOATS + 7] = 0
}

/**
 * Compute effective basis size by trimming trailing states with negligible population.
 *
 * Scans diagonal elements ρ_{kk} and finds the last index with population above
 * the threshold. Returns lastActive + 1, clamped to [minK, K].
 *
 * This trims trailing (high-energy) states that are effectively unpopulated,
 * reducing the GPU's O(K²) contraction loop without reordering the density matrix.
 *
 * @param rho - Current density matrix
 * @param populationThreshold - Minimum diagonal population to consider active (default 0.01)
 * @param minK - Floor for the returned K to preserve coherence effects (default 2)
 * @returns Effective K ∈ [minK, rho.K]
 */
export function computeActiveK(
  rho: DensityMatrix,
  populationThreshold = 0.01,
  minK = 2,
): number {
  const K = rho.K
  const el = rho.elements

  // Find the last index with significant population
  let lastActive = 0
  for (let k = 0; k < K; k++) {
    if (el[2 * (k * K + k)]! > populationThreshold) {
      lastActive = k
    }
  }

  return Math.max(minK, lastActive + 1)
}

/**
 * Unpack a GPU buffer back to a DensityMatrix (for testing/debugging).
 *
 * @param buf - Packed Float32Array (length ≥ OPEN_QUANTUM_BUFFER_FLOATS)
 * @param K - Number of basis states
 * @returns Density matrix with Float64 precision
 */
export function unpackFromGPU(buf: Float32Array, K: number): DensityMatrix {
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
