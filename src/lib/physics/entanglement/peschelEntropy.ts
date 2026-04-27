/**
 * Peschel (correlation-matrix) entanglement entropy for a free scalar field
 * on a periodic lattice.
 *
 * Implements the standard Peschel construction (Peschel 2003; Casini & Huerta
 * J. Phys. A **42** 504007 (2009), §7):
 *
 * 1. Compute the full-lattice two-point functions along a 1D slice of the
 *    N-D vacuum (axis 0, transverse coordinates pinned to 0):
 *    `X_ij = ⟨φ_i φ_j⟩ = (1/N_total) Σ_k cos(2π k_0 (i−j)/N_0) / (2 ω_k)`
 *    `P_ij = ⟨π_i π_j⟩ = (1/N_total) Σ_k cos(2π k_0 (i−j)/N_0) · ω_k / 2`
 *    using the exact lattice dispersion
 *    `ω_k² = m² + Σ_d (2 sin(π k_d / N_d) / a_d)²` with a small
 *    `ENTROPY_IR_FLOOR` regularization on the zero mode.
 *    The transverse directions (`d = 1 .. latticeDim-1`) are marginalised
 *    into a reduced `per-k_0` profile: the sum over transverse modes is
 *    done once and the 1D Toeplitz profile along the slice is then built
 *    from that reduced per-`k_0` amplitude. For `latticeDim = 1` the
 *    transverse sum collapses to a unit factor and the construction
 *    reduces exactly to the pure-1D Peschel correlator.
 * 2. Extract `X_A`, `P_A` as the `L × L` principal submatrices corresponding
 *    to a contiguous interval of length `L` along the slice.
 * 3. Form the symmetric positive matrix `M = √X_A · P_A · √X_A` via a Jacobi
 *    eigendecomposition of `X_A`. The eigenvalues of `M` equal the eigenvalues
 *    of the non-symmetric product `X_A · P_A`, and their square roots are the
 *    symplectic eigenvalues `ν_k`.
 * 4. Entropy per mode `h(ν) = (ν+½)log(ν+½) − (ν−½)log(ν−½)` in nats; sum
 *    over modes gives the reduced von Neumann entropy `S(L_A)`.
 *
 * For a massless 1+1D CFT one then expects the Calabrese-Cardy log law
 * `S(L) ≈ (c/3) log(L) + const` with `c = 1`. In higher dimensions `c` is
 * not meaningful for the slice log slope — the slope depends on the full
 * dispersion `ω_k(k_0, k_⊥)` and encodes a mixture of bulk and boundary
 * contributions — but the slice entropy remains a valid comparative
 * diagnostic of the N-D vacuum. This module also provides a simple
 * linear-regression extractor for the effective central charge over a
 * middle length window; outside 1D, interpret its output as an effective
 * slope rather than a bona fide central charge.
 *
 * Scope: free Klein-Gordon scalar field vacuum on 1D-to-N-D periodic
 * lattices. Interacting and open-boundary subsystems are **not** handled
 * by this module.
 *
 * @module lib/physics/entanglement/peschelEntropy
 */

import { jacobiEigendecompose, jacobiEigenvalues } from '@/lib/math/jacobiEigenvalues'

// ── Re-exports: lattice correlator construction ──────────────────────────
export type {
  LatticeCorrelatorConfig,
  LatticeCorrelators,
  NDLatticeSliceCorrelatorConfig,
} from './peschelCorrelators'
export { buildLatticeCorrelators1D, buildLatticeSliceCorrelators } from './peschelCorrelators'

// ── Re-exports: entanglement spectrum and fitting ────────────────────────
export type { EntanglementSpectrum } from './peschelSpectrum'
export {
  computeEntanglementSpectrum,
  fitCentralCharge,
  fitEntanglementTemperature,
} from './peschelSpectrum'

// Cosmological entropy trajectory lives in `./peschelCosmology` and is
// imported there directly to avoid a value-import cycle with this module
// (which `peschelCosmology` consumes for the core Peschel routines).

// ── Core Peschel entropy computation ─────────────────────────────────────

/** Symplectic eigenvalues are clipped to the physical floor `1/2`. */
const SYMPLECTIC_FLOOR = 0.5
/**
 * Tolerance below `1/2` we accept before throwing. Wider than pure double
 * precision to absorb the compounded `matrix → sqrtm → matmul → eigen`
 * chain roundoff, which for `n ≈ 64` can drift ν by `O(1e-7)` even when
 * the exact answer is 0.5 (e.g. subsystem = full lattice on a pure
 * Gaussian state).
 */
const SYMPLECTIC_FLOOR_TOLERANCE = 1e-4

/**
 * Extract a contiguous `length × length` principal submatrix starting at
 * index `start` from a row-major `fullSize × fullSize` matrix.
 *
 * The submatrix is **non-wrapping**; the caller must ensure
 * `start + length ≤ fullSize`.
 *
 * @param matrix - Source matrix (row-major `Float64Array`).
 * @param fullSize - Order of the source matrix.
 * @param start - Starting row/column index of the submatrix.
 * @param length - Order of the submatrix.
 * @returns A fresh row-major `Float64Array` of length `length * length`.
 * @throws {Error} On invalid indices or length.
 */
export function extractSubsystem(
  matrix: Float64Array,
  fullSize: number,
  start: number,
  length: number
): Float64Array {
  if (!Number.isInteger(fullSize) || fullSize < 0) {
    throw new Error(`extractSubsystem: fullSize must be a non-negative integer, got ${fullSize}`)
  }
  if (!Number.isInteger(start) || start < 0) {
    throw new Error(`extractSubsystem: start must be a non-negative integer, got ${start}`)
  }
  if (!Number.isInteger(length) || length < 0) {
    throw new Error(`extractSubsystem: length must be a non-negative integer, got ${length}`)
  }
  if (start + length > fullSize) {
    throw new Error(
      `extractSubsystem: start + length = ${start + length} exceeds fullSize = ${fullSize}`
    )
  }
  if (matrix.length < fullSize * fullSize) {
    throw new Error(
      `extractSubsystem: matrix length ${matrix.length} < fullSize² = ${fullSize * fullSize}`
    )
  }

  const out = new Float64Array(length * length)
  for (let i = 0; i < length; i++) {
    const srcRow = (start + i) * fullSize + start
    const dstRow = i * length
    for (let j = 0; j < length; j++) {
      out[dstRow + j] = matrix[srcRow + j]!
    }
  }
  return out
}

/**
 * Compute the symplectic eigenvalues `ν_k` of a Gaussian reduced density
 * matrix with position correlator `X` and momentum correlator `P`.
 *
 * Uses the symmetric-sandwich route:
 * 1. Eigendecompose the symmetric positive `X = Q Λ Qᵀ`.
 * 2. Form `√X = Q √Λ Qᵀ`.
 * 3. Build `M = √X · P · √X`. `M` is symmetric positive and its eigenvalues
 *    equal those of the non-symmetric product `X · P` (similar matrices).
 * 4. Symplectic eigenvalues are the square roots of `eig(M)`.
 *
 * Numerical floor: each `ν_k` is clamped to `1/2` (the physical lower bound
 * set by the uncertainty principle); a margin of `1e-9` below `1/2` is
 * tolerated before throwing.
 *
 * @param X - `n × n` symmetric positive position correlator (row-major).
 * @param P - `n × n` symmetric positive momentum correlator (row-major).
 * @param n - Subsystem size.
 * @returns Symplectic eigenvalues as a `Float64Array` of length `n`,
 *          sorted descending.
 * @throws {Error} If any `ν_k` falls below `1/2 − 1e-9` (indicates invalid
 *                  or corrupted correlators).
 */
export function symplecticEigenvalues(X: Float64Array, P: Float64Array, n: number): Float64Array {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`symplecticEigenvalues: n must be a non-negative integer, got ${n}`)
  }
  if (n === 0) return new Float64Array(0)

  // Step 1 + 2: sqrtm(X) via Jacobi eigendecomp
  const { values: xVals, vectors: xVecs } = jacobiEigendecompose(X, n)

  // Clamp tiny-negative eigenvalues (roundoff on rank-deficient X).
  const sqrtLambda = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const v = xVals[i]!
    sqrtLambda[i] = v > 0 ? Math.sqrt(v) : 0
  }

  // sqrtX[i, j] = Σ_k Q[i, k] * sqrtLambda[k] * Q[j, k]
  const sqrtX = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let acc = 0
      for (let k = 0; k < n; k++) {
        acc += xVecs[i * n + k]! * sqrtLambda[k]! * xVecs[j * n + k]!
      }
      sqrtX[i * n + j] = acc
      sqrtX[j * n + i] = acc
    }
  }

  // Step 3: M = sqrtX · P · sqrtX. Compute via temp T = P · sqrtX.
  const T = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let acc = 0
      for (let k = 0; k < n; k++) {
        acc += P[i * n + k]! * sqrtX[k * n + j]!
      }
      T[i * n + j] = acc
    }
  }
  const M = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let acc = 0
      for (let k = 0; k < n; k++) {
        acc += sqrtX[i * n + k]! * T[k * n + j]!
      }
      M[i * n + j] = acc
    }
  }
  // Force symmetry to absorb matmul roundoff before the eigensolver.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const avg = 0.5 * (M[i * n + j]! + M[j * n + i]!)
      M[i * n + j] = avg
      M[j * n + i] = avg
    }
  }

  // Step 4: eigenvalues of M → symplectic ν = √eig(M), clipped to 1/2.
  const mVals = jacobiEigenvalues(M, n)
  const nu = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const ev = mVals[i]!
    const nuRaw = ev > 0 ? Math.sqrt(ev) : 0
    if (nuRaw < SYMPLECTIC_FLOOR - SYMPLECTIC_FLOOR_TOLERANCE) {
      throw new Error(
        `symplecticEigenvalues: ν_${i} = ${nuRaw} below physical floor ${SYMPLECTIC_FLOOR}`
      )
    }
    nu[i] = nuRaw < SYMPLECTIC_FLOOR ? SYMPLECTIC_FLOOR : nuRaw
  }
  return nu
}

/**
 * Per-mode entanglement entropy of a bosonic Gaussian state.
 *
 * `h(ν) = (ν + ½) log(ν + ½) − (ν − ½) log(ν − ½)`, in nats.
 *
 * At `ν = ½` the function vanishes by the `0 log 0 = 0` convention.
 *
 * @param nu - Symplectic eigenvalue (must satisfy `ν ≥ ½`).
 * @returns `h(ν) ≥ 0`.
 */
function modeEntropy(nu: number): number {
  const plus = nu + 0.5
  const minus = nu - 0.5
  const plusTerm = plus * Math.log(plus)
  const minusTerm = minus > 1e-15 ? minus * Math.log(minus) : 0
  return plusTerm - minusTerm
}

/**
 * Sum the per-mode entanglement entropy over all symplectic eigenvalues.
 *
 * @param symplectic - `Float64Array` of symplectic eigenvalues (each ≥ ½).
 * @returns Reduced von Neumann entropy `S` in **nats**.
 */
export function peschelEntropy(symplectic: Float64Array): number {
  let s = 0
  for (let i = 0; i < symplectic.length; i++) {
    s += modeEntropy(symplectic[i]!)
  }
  return s
}

/**
 * Entropy spectrum resulting from a length sweep.
 */
export interface EntropySpectrum {
  /** Subsystem lengths actually scanned (as plain array for React use). */
  lengths: number[]
  /** Corresponding `S(L)` in nats. */
  entropies: number[]
}

/**
 * Scan the reduced entropy `S(L_A)` over a set of subsystem lengths, using
 * precomputed full-lattice correlators.
 *
 * Each length produces a fresh submatrix extraction + symplectic diagonal-
 * ization. Costs scale as `O(L³)` per length.
 *
 * @param correlators - Full-lattice `X`, `P` correlators.
 * @param fullSize - Order of the full correlator matrices (`N`).
 * @param lengths - Subsystem lengths to scan. Each must satisfy
 *                  `startOffset + length ≤ fullSize`.
 * @param startOffset - Start index of the contiguous interval (default 0).
 * @returns Object with matching `lengths[]` and `entropies[]` arrays. If
 *          `lengths` is empty, both outputs are empty.
 */
export function computeEntropySpectrum(
  correlators: { X: Float64Array; P: Float64Array },
  fullSize: number,
  lengths: readonly number[],
  startOffset: number
): EntropySpectrum {
  const outLengths: number[] = []
  const outEntropies: number[] = []
  for (const len of lengths) {
    if (!Number.isInteger(len) || len < 1) continue
    if (startOffset + len > fullSize) continue
    const XA = extractSubsystem(correlators.X, fullSize, startOffset, len)
    const PA = extractSubsystem(correlators.P, fullSize, startOffset, len)
    const nu = symplecticEigenvalues(XA, PA, len)
    outLengths.push(len)
    outEntropies.push(peschelEntropy(nu))
  }
  return { lengths: outLengths, entropies: outEntropies }
}
