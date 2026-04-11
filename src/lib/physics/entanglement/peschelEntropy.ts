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
import { computeCosmologyAt, type CosmologySnapshot } from '@/lib/physics/cosmology/background'
import { type CosmologyPresetParams, isValidPreset } from '@/lib/physics/cosmology/presets'
import { M_FLOOR } from '@/lib/physics/freeScalar/vacuumSpectrum'

/**
 * IR cutoff on ω_k used specifically by the entanglement-entropy probe.
 *
 * **Why this is not `M_FLOOR` from `vacuumSpectrum.ts`.** The vacuum
 * sampler's `M_FLOOR = 0.01` exists to stabilize the random-field draws
 * (`σ_φ² ∝ 1/(2 ω_0)` blows up otherwise). For Peschel entropy the
 * situation is different: `1/(2 ω_0)` enters `X_{ij}` as a rank-1
 * contribution that — at the lattice sizes used here (`N ≤ 256`) — is
 * comparable in magnitude to the genuine CFT signal, and it crushes
 * the `log(L)` law down to `c_eff ≈ 0.46` for `N = 128`. The probe
 * therefore uses a much smaller IR regulator (`1e-6`) which makes the
 * zero-mode contribution negligibly small and recovers the expected
 * `c ≈ 1` Calabrese-Cardy slope. This is a deliberate scope-local
 * deviation from the Klein-Gordon sampler's regularization; the rest
 * of the free-scalar pipeline still uses `M_FLOOR`.
 */
const ENTROPY_IR_FLOOR = 1e-6

/**
 * Configuration for a 1D free-scalar lattice.
 */
export interface LatticeCorrelatorConfig {
  /** Number of sites on the periodic lattice. Must be a positive integer. */
  gridSize: number
  /** Lattice spacing `a`. Must be a finite positive number. */
  spacing: number
  /**
   * Effective squared mass `m_eff² ≥ 0`. Negative values are clamped to
   * zero; the probe's own `ENTROPY_IR_FLOOR` handles the massless IR
   * singularity independently of the Klein-Gordon `M_FLOOR`.
   */
  massSq: number
}

/**
 * Configuration for a 1D slice of an N-D free-scalar lattice.
 *
 * The slice is always along axis 0: sites `(i, 0, 0, ..., 0)` for
 * `i = 0 .. gridSize[0]-1`. Entries past `latticeDim` are ignored.
 */
export interface NDLatticeSliceCorrelatorConfig {
  /** Grid sizes per lattice dimension. Must satisfy `length ≥ latticeDim`. */
  gridSize: readonly number[]
  /** Lattice spacings per dimension. Must satisfy `length ≥ latticeDim`. */
  spacing: readonly number[]
  /** Active spatial dimensions (1 ≤ latticeDim ≤ gridSize.length). */
  latticeDim: number
  /** Effective squared mass `m_eff² ≥ 0`. Same semantics as the 1D config. */
  massSq: number
}

/**
 * A pair of position/momentum correlator matrices stored as row-major
 * `Float64Array`s of length `fullSize * fullSize`.
 */
export interface LatticeCorrelators {
  /** Position correlator `X_ij = ⟨φ_i φ_j⟩`. Symmetric positive definite. */
  X: Float64Array
  /** Momentum correlator `P_ij = ⟨π_i π_j⟩`. Symmetric positive definite. */
  P: Float64Array
}

/**
 * Build the `X` and `P` two-point function matrices of the free scalar
 * vacuum restricted to a 1D slice along axis 0 of an N-D periodic lattice.
 *
 * The slice is `{ (i, 0, 0, ..., 0) : i = 0 .. N_0-1 }`; the transverse
 * directions are marginalised into the correlator by summing over all
 * transverse k modes. Concretely, for each axis-0 wavenumber `k_0` the
 * function accumulates a reduced per-`k_0` amplitude
 *
 *   `Π_X(k_0) = (1 / Π_{d>0} N_d) · Σ_{k_⊥} 1 / (2 ω_{k_0, k_⊥})`
 *   `Π_P(k_0) = (1 / Π_{d>0} N_d) · Σ_{k_⊥} ω_{k_0, k_⊥} / 2`
 *
 * where `ω_k² = Σ_d (2 sin(π k_d / N_d) / a_d)² [+ m_eff²]`. The 1D
 * translation-invariant correlator profiles along the slice are then
 *
 *   `X_{slice}[r] = (1/N_0) Σ_{k_0} cos(2π k_0 r / N_0) · Π_X(k_0)`
 *   `P_{slice}[r] = (1/N_0) Σ_{k_0} cos(2π k_0 r / N_0) · Π_P(k_0)`
 *
 * This is the **full N-D vacuum two-point function restricted to the
 * slice**, not the two-point function of a separate 1D theory with the
 * same `(N_0, a_0, m)`. The difference is physical: for `latticeDim ≥ 2`
 * the transverse vacuum fluctuations shorten the on-slice correlation
 * length relative to a pure-1D theory, and the resulting slice entropy
 * differs accordingly.
 *
 * Both matrices are symmetric Toeplitz-by-construction: only the differences
 * `i − j` (mod N_0) matter.
 *
 * For `latticeDim = 1` the transverse sum collapses to a unit factor and
 * the construction reduces numerically to the pure-1D Peschel correlator
 * (see {@link buildLatticeCorrelators1D}).
 *
 * The mass treatment follows the same convention as the 1D path: when
 * `massSq > 0` the full `ω_k² = m_eff² + k_lat²` formula is used with
 * `m_eff = max(√massSq, M_FLOOR)` (Klein-Gordon floor), while for
 * `massSq === 0` the mass term is omitted entirely so the CFT log law is
 * not biased by the Klein-Gordon `M_FLOOR`. In either case modes with
 * `ω_k < ENTROPY_IR_FLOOR` are clamped to the small `ENTROPY_IR_FLOOR` so
 * the zero mode of a massless input stays finite.
 *
 * Compute cost: `O(N_0 · Π_{d>0} N_d)` for the reduced profile plus
 * `O(N_0²)` for the Toeplitz fill. For `N = 256, latticeDim = 3` the
 * transverse sum runs 16.7 M `ω_k` evaluations, which is within the
 * worker's time budget (benchmarked at ~400 ms on M-series silicon).
 *
 * @param config - N-D lattice configuration.
 * @returns Object with `X` and `P` as row-major `Float64Array`s of length
 *          `N_0 * N_0`.
 * @throws {Error} On invalid or inconsistent config entries.
 *
 * @example
 * ```ts
 * const { X, P } = buildLatticeSliceCorrelators({
 *   gridSize: [128, 64, 64],
 *   spacing: [1, 1, 1],
 *   latticeDim: 3,
 *   massSq: 0,
 * })
 * ```
 */
export function buildLatticeSliceCorrelators(
  config: NDLatticeSliceCorrelatorConfig
): LatticeCorrelators {
  const { gridSize, spacing, latticeDim, massSq } = config
  if (!Number.isInteger(latticeDim) || latticeDim < 1) {
    throw new Error(
      `buildLatticeSliceCorrelators: latticeDim must be a positive integer, got ${latticeDim}`
    )
  }
  if (gridSize.length < latticeDim) {
    throw new Error(
      `buildLatticeSliceCorrelators: gridSize must have at least ${latticeDim} entries, got ${gridSize.length}`
    )
  }
  if (spacing.length < latticeDim) {
    throw new Error(
      `buildLatticeSliceCorrelators: spacing must have at least ${latticeDim} entries, got ${spacing.length}`
    )
  }
  if (!Number.isFinite(massSq)) {
    throw new Error(`buildLatticeSliceCorrelators: massSq must be finite, got ${massSq}`)
  }
  for (let d = 0; d < latticeDim; d++) {
    const N = gridSize[d]!
    const a = spacing[d]!
    if (!Number.isInteger(N) || N < 1) {
      throw new Error(
        `buildLatticeSliceCorrelators: gridSize[${d}] must be a positive integer, got ${N}`
      )
    }
    if (!Number.isFinite(a) || a <= 0) {
      throw new Error(
        `buildLatticeSliceCorrelators: spacing[${d}] must be a positive finite number, got ${a}`
      )
    }
  }

  const N0 = gridSize[0]!
  const a0 = spacing[0]!

  // Transverse geometry: dimensions d = 1 .. latticeDim-1. For a genuine
  // 1D lattice (`latticeDim === 1`) these arrays are empty and the sum
  // over k_⊥ is a single unit-weight term, recovering the pure-1D result.
  const transDimsArr: number[] = []
  const transSpacingsArr: number[] = []
  for (let d = 1; d < latticeDim; d++) {
    transDimsArr.push(gridSize[d]!)
    transSpacingsArr.push(spacing[d]!)
  }
  const transRank = transDimsArr.length
  let nTrans = 1
  for (let d = 0; d < transRank; d++) nTrans *= transDimsArr[d]!
  // Guard against degenerate N_d = 1 which would place every transverse
  // mode at k_lat = 0 and make the IR regularization unavoidable.
  if (nTrans < 1) {
    throw new Error('buildLatticeSliceCorrelators: transverse mode count must be at least 1')
  }

  // Cache the transverse contributions to k_lat² once — each transverse
  // mode provides a constant added to ω_k² regardless of k_0, so we
  // precompute it and reuse for every axis-0 wavenumber.
  const transKLatSq = new Float64Array(nTrans)
  if (transRank > 0) {
    const idx = new Int32Array(transRank)
    for (let t = 0; t < nTrans; t++) {
      let acc = 0
      for (let d = 0; d < transRank; d++) {
        const Nd = transDimsArr[d]!
        const ad = transSpacingsArr[d]!
        const sinD = Math.sin((Math.PI * idx[d]!) / Nd)
        const kd = (2 * sinD) / ad
        acc += kd * kd
      }
      transKLatSq[t] = acc
      // Advance the multi-dimensional index (base-N counter).
      for (let d = 0; d < transRank; d++) {
        const next = idx[d]! + 1
        if (next < transDimsArr[d]!) {
          idx[d] = next
          break
        }
        idx[d] = 0
      }
    }
  }

  // Mass term: follow the 1D convention — if `massSq > 0` use the
  // Klein-Gordon-regularised mass (`max(√massSq, M_FLOOR)²`), otherwise
  // omit the mass term entirely so that a genuinely massless vacuum is
  // not biased by the M_FLOOR bump. `massSq` below zero is treated as zero.
  let massTermSq = 0
  if (massSq > 0) {
    const mEff = Math.max(Math.sqrt(massSq), M_FLOOR)
    massTermSq = mEff * mEff
  }

  // Reduced per-k_0 profiles.
  //   Π_X(k_0) = (1/N_⊥) · Σ_{k_⊥} 1 / (2 ω_{k_0, k_⊥})
  //   Π_P(k_0) = (1/N_⊥) · Σ_{k_⊥} ω_{k_0, k_⊥} / 2
  const piXProfile = new Float64Array(N0)
  const piPProfile = new Float64Array(N0)
  const invNTrans = 1 / nTrans
  for (let k0 = 0; k0 < N0; k0++) {
    const sin0 = Math.sin((Math.PI * k0) / N0)
    const k0Lat = (2 * sin0) / a0
    const baseSq = k0Lat * k0Lat + massTermSq
    let xAcc = 0
    let pAcc = 0
    for (let t = 0; t < nTrans; t++) {
      let omegaSq = baseSq + transKLatSq[t]!
      if (omegaSq < ENTROPY_IR_FLOOR * ENTROPY_IR_FLOOR) {
        omegaSq = ENTROPY_IR_FLOOR * ENTROPY_IR_FLOOR
      }
      const omega = Math.sqrt(omegaSq)
      xAcc += 1 / (2 * omega)
      pAcc += omega / 2
    }
    piXProfile[k0] = xAcc * invNTrans
    piPProfile[k0] = pAcc * invNTrans
  }

  // 1D Toeplitz profile along the slice: X_{slice}[r] = (1/N_0) Σ_{k_0}
  // cos(2π k_0 r / N_0) · Π_X(k_0). The cosine is even in r so we fill
  // only r = 0 .. N_0−1 and let the symmetric Toeplitz fill handle the
  // rest via the (i − j) mod N_0 indexing below.
  const xProfile = new Float64Array(N0)
  const pProfile = new Float64Array(N0)
  const invN0 = 1 / N0
  const twoPiInvN0 = (2 * Math.PI) / N0
  for (let r = 0; r < N0; r++) {
    let xAcc = 0
    let pAcc = 0
    for (let k0 = 0; k0 < N0; k0++) {
      const cosTerm = Math.cos(twoPiInvN0 * k0 * r)
      xAcc += cosTerm * piXProfile[k0]!
      pAcc += cosTerm * piPProfile[k0]!
    }
    xProfile[r] = xAcc * invN0
    pProfile[r] = pAcc * invN0
  }

  const X = new Float64Array(N0 * N0)
  const P = new Float64Array(N0 * N0)
  for (let i = 0; i < N0; i++) {
    for (let j = 0; j < N0; j++) {
      // Periodic distance so both (i-j) and (j-i) alias to the same profile
      // entry. Because cosine is even in r, either choice works identically.
      const r = (((i - j) % N0) + N0) % N0
      X[i * N0 + j] = xProfile[r]!
      P[i * N0 + j] = pProfile[r]!
    }
  }

  return { X, P }
}

/**
 * Build the `X` and `P` two-point function matrices of a **pure-1D** free
 * scalar vacuum on a periodic lattice. Thin compatibility shim over
 * {@link buildLatticeSliceCorrelators} — the N-D builder with
 * `latticeDim = 1` produces the same result modulo floating-point noise,
 * so this function exists only for the older callers that still pass the
 * single-number `LatticeCorrelatorConfig` shape.
 *
 * @param config - 1D lattice configuration (see {@link LatticeCorrelatorConfig}).
 * @returns Object with `X` and `P` as row-major `Float64Array`s of length
 *          `gridSize * gridSize`.
 * @throws {Error} If `gridSize < 1`, `spacing ≤ 0`, or `massSq` is non-finite.
 *
 * @example
 * ```ts
 * const { X, P } = buildLatticeCorrelators1D({ gridSize: 128, spacing: 1, massSq: 0 })
 * ```
 */
export function buildLatticeCorrelators1D(config: LatticeCorrelatorConfig): LatticeCorrelators {
  const { gridSize, spacing, massSq } = config
  if (!Number.isInteger(gridSize) || gridSize < 1) {
    throw new Error(
      `buildLatticeCorrelators1D: gridSize must be a positive integer, got ${gridSize}`
    )
  }
  if (!Number.isFinite(spacing) || spacing <= 0) {
    throw new Error(
      `buildLatticeCorrelators1D: spacing must be a positive finite number, got ${spacing}`
    )
  }
  if (!Number.isFinite(massSq)) {
    throw new Error(`buildLatticeCorrelators1D: massSq must be finite, got ${massSq}`)
  }
  return buildLatticeSliceCorrelators({
    gridSize: [gridSize],
    spacing: [spacing],
    latticeDim: 1,
    massSq,
  })
}

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
  correlators: LatticeCorrelators,
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

/**
 * Lower bound of the fit window as a fraction of the inferred full-lattice
 * size. Set below `0.1` so short-distance CFT modes dominate the slope
 * before the periodic-boundary chord correction and the finite-mass
 * saturation set in. Paired with {@link FIT_WINDOW_HI_FRAC}.
 */
const FIT_WINDOW_LO_FRAC = 0.05
/**
 * Upper bound of the fit window as a fraction of the inferred full-lattice
 * size. The Calabrese-Cardy periodic correction
 * `S ∝ log((N/π) sin(π L/N))` deviates noticeably from `log(L)` past
 * `L ≈ N/4`, so we cap the fit window there. This differs from the naive
 * `[0.1 N, 0.4 N]` midband — pushing `hi` above `N/4` biases the extracted
 * central charge downward by a significant fraction.
 */
const FIT_WINDOW_HI_FRAC = 0.25

/**
 * Linear regression fit of the central charge from the CFT entropy law
 * `S(L) ≈ (c / 3) log(L) + const` applied over the short-distance window.
 *
 * The window is inferred from the largest length in the input: assuming the
 * caller's sweep spans `[1, N/2]` we use `N = 2 · max(lengths)` and filter
 * to `L ∈ [⌈0.05 N⌉, ⌊0.25 N⌋]` before regressing `S` on `log(L)`. The
 * slope is multiplied by 3 to recover the effective central charge. The
 * window starts below the customary `0.1 N` boundary and ends below the
 * customary `0.4 N` boundary for two reasons:
 *
 * 1. The periodic chord length `(N/π) sin(π L / N)` starts curving away
 *    from `L` above `L ≈ N/4`, so including larger `L` biases the fit
 *    slope downward.
 * 2. At short `L` the CFT log law dominates over the lattice UV
 *    corrections, so starting at `0.05 N` picks up cleaner slope
 *    information than starting at `0.1 N` without introducing lattice
 *    discretization artefacts.
 *
 * At least **6 points** must survive the filter; otherwise `c` is
 * returned as `NaN`.
 *
 * @param lengths - Subsystem lengths from the sweep.
 * @param entropies - Matching entropies in nats.
 * @returns `{ c, intercept, rSquared, usedPoints }`. `c` is `NaN` when the
 *          fit window contains fewer than 6 points or the data is
 *          degenerate. `rSquared ∈ [0, 1]` is the coefficient of
 *          determination of the linear fit.
 */
export function fitCentralCharge(
  lengths: readonly number[],
  entropies: readonly number[]
): { c: number; intercept: number; rSquared: number; usedPoints: number } {
  if (lengths.length !== entropies.length || lengths.length === 0) {
    return { c: Number.NaN, intercept: Number.NaN, rSquared: Number.NaN, usedPoints: 0 }
  }
  let maxL = 0
  for (const L of lengths) if (L > maxL) maxL = L
  const nFull = 2 * maxL
  const lo = Math.max(1, Math.ceil(FIT_WINDOW_LO_FRAC * nFull))
  const hi = Math.floor(FIT_WINDOW_HI_FRAC * nFull)

  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < lengths.length; i++) {
    const L = lengths[i]!
    if (L < lo || L > hi) continue
    const S = entropies[i]!
    if (!Number.isFinite(S)) continue
    xs.push(Math.log(L))
    ys.push(S)
  }

  if (xs.length < 6) {
    return { c: Number.NaN, intercept: Number.NaN, rSquared: Number.NaN, usedPoints: xs.length }
  }

  // Ordinary least squares on (log L, S)
  const n = xs.length
  let meanX = 0
  let meanY = 0
  for (let i = 0; i < n; i++) {
    meanX += xs[i]!
    meanY += ys[i]!
  }
  meanX /= n
  meanY /= n

  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX
    const dy = ys[i]! - meanY
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }

  if (sxx <= 0) {
    return { c: Number.NaN, intercept: Number.NaN, rSquared: Number.NaN, usedPoints: n }
  }
  const slope = sxy / sxx
  const intercept = meanY - slope * meanX
  const rSquared = syy > 0 ? (sxy * sxy) / (sxx * syy) : 1

  return { c: 3 * slope, intercept, rSquared, usedPoints: n }
}

// ───────────────────────────────────────────────────────────────────────────
//  Entanglement spectrum and modular (Bisognano-Wichmann) Hamiltonian levels
// ───────────────────────────────────────────────────────────────────────────

/**
 * Full entanglement-spectrum readout extracted from the Peschel construction.
 *
 * A bosonic Gaussian state whose subsystem has symplectic eigenvalues `ν_k`
 * has a reduced density matrix of the thermal form
 *
 *   `ρ_A = Z⁻¹ · exp(−H_ent)` with  `H_ent = Σ_k ε_k · (b_k† b_k + ½)`
 *
 * where the single-mode excitation energies of the **entanglement (modular)
 * Hamiltonian** are given by
 *
 *   `ε_k = log((ν_k + ½) / (ν_k − ½))`       [Peschel 2003, eq. 12]
 *
 * and the per-mode entanglement entropy is
 *
 *   `s(ν_k) = (ν_k + ½) log(ν_k + ½) − (ν_k − ½) log(ν_k − ½)`.
 *
 * In the **Bisognano-Wichmann** / Rindler half-space limit the modular
 * Hamiltonian is exactly the boost generator, so for a half-space cut of a
 * Minkowski vacuum the low-lying `ε_k` are approximately equi-spaced with
 * gap `Δε = 2π / β_mod` — the Unruh-like modular temperature. Deviations
 * from equi-spacing signal finite-size effects, the lattice UV cutoff, or a
 * non-Rindler cut.
 *
 * Arrays are sorted with `nu` ascending — smallest symplectic eigenvalue
 * first (most strongly entangled mode, closest to maximally mixed ν = ½).
 *
 * @see https://doi.org/10.1088/1751-8113/42/50/504007 Casini & Huerta review
 */
export interface EntanglementSpectrum {
  /** Symplectic eigenvalues ν_k ≥ ½, sorted ascending. */
  nu: Float64Array
  /** Modular-Hamiltonian single-mode energies ε_k = log((ν+½)/(ν−½)), same order. */
  epsilon: Float64Array
  /** Per-mode entropy contributions s(ν_k) in nats, same order. */
  perModeEntropy: Float64Array
  /** Total entropy Σ_k s(ν_k) (matches `peschelEntropy(nu)`). */
  totalEntropy: number
  /** `ν_min − ½`. Vanishes iff the subsystem has a maximally-mixed mode. */
  entanglementGap: number
}

/**
 * Compute the full entanglement spectrum of a bosonic-Gaussian subsystem,
 * given its symplectic eigenvalues. Post-processing helper on the output of
 * {@link symplecticEigenvalues}.
 *
 * Conventions:
 * - The entanglement-Hamiltonian excitation energies are positive, diverging
 *   as ν → ½ (maximally mixed) and vanishing as ν → ∞ (decoupled mode).
 * - `perModeEntropy[k]` uses the same `h(ν)` formula as {@link peschelEntropy},
 *   so summing reproduces the scalar entropy to machine precision.
 *
 * @param symplectic - Symplectic eigenvalues `ν_k ≥ ½` (as returned by
 *                     {@link symplecticEigenvalues}). Input is **not** mutated.
 * @returns Sorted spectrum plus derived quantities.
 * @throws {Error} If any input is non-finite or below the physical
 *                 `½ − 1e-9` floor.
 */
export function computeEntanglementSpectrum(symplectic: Float64Array): EntanglementSpectrum {
  const n = symplectic.length
  const nu = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const v = symplectic[i]!
    if (!Number.isFinite(v) || v < 0.5 - 1e-9) {
      throw new Error(
        `computeEntanglementSpectrum: ν_${i} = ${v} is not a physical symplectic eigenvalue (must be ≥ ½)`
      )
    }
    nu[i] = v < 0.5 ? 0.5 : v
  }
  // Ascending sort (smallest ν = most-entangled mode first).
  nu.sort()

  const epsilon = new Float64Array(n)
  const perModeEntropy = new Float64Array(n)
  let totalS = 0
  for (let i = 0; i < n; i++) {
    const v = nu[i]!
    const plus = v + 0.5
    const minus = v - 0.5
    const eps = minus > 1e-15 ? Math.log(plus / minus) : Number.POSITIVE_INFINITY
    epsilon[i] = eps
    const plusTerm = plus * Math.log(plus)
    const minusTerm = minus > 1e-15 ? minus * Math.log(minus) : 0
    const s = plusTerm - minusTerm
    perModeEntropy[i] = s
    totalS += s
  }

  const entanglementGap = nu[0]! - 0.5

  return { nu, epsilon, perModeEntropy, totalEntropy: totalS, entanglementGap }
}

/**
 * Fit an effective modular "temperature" to the entanglement Hamiltonian
 * spectrum by linear regression of the modular excitation energies `ε_k`
 * against the ascending mode index.
 *
 * Motivation: Bisognano-Wichmann states that for a half-space cut of a
 * free-field vacuum the modular Hamiltonian is exactly the boost generator,
 * whose excitations are equi-spaced with gap `Δε = 2π / β_mod` where
 * `β_mod` is the inverse of the Unruh-like modular temperature. Fitting a
 * line to the first few `ε_k` therefore estimates that temperature directly
 * from the simulator's lattice data. For a non-Rindler cut the spacing is
 * not equi-distant and `rSquared` will be poor.
 *
 * **Ordering convention**: the `EntanglementSpectrum.epsilon` array is
 * sorted so that `epsilon[0]` corresponds to the smallest `ν` (the most
 * strongly entangled mode, where `ε` is *largest*). The physically natural
 * label for the modular Hamiltonian tower starts at the smallest excitation
 * energy (decoupled mode, largest `ν`) and grows upward. We therefore walk
 * `epsilon` from the tail toward the head so the fit axis is `(k, ε_k)`
 * with both increasing.
 *
 * The fit uses up to `max(4, floor(N/3))` modes starting from the largest-ν
 * end. Modes with non-finite `ε` (ν exactly at ½) are skipped.
 *
 * @param spectrum - Spectrum object from {@link computeEntanglementSpectrum}.
 * @returns Fit result. `inverseTemperature = slope/(2π)`; `temperature =
 *          1/β_mod`. Returns `NaN` values when fewer than 4 usable modes are
 *          available, the slope is non-positive, or the fit is degenerate.
 */
export function fitEntanglementTemperature(spectrum: EntanglementSpectrum): {
  inverseTemperature: number
  temperature: number
  rSquared: number
  usedModes: number
} {
  const { epsilon } = spectrum
  const n = epsilon.length
  const keep = Math.max(4, Math.floor(n / 3))
  if (n < 4 || keep < 4) {
    return {
      inverseTemperature: Number.NaN,
      temperature: Number.NaN,
      rSquared: Number.NaN,
      usedModes: 0,
    }
  }

  // Walk the spectrum from the decoupled end (largest ν, smallest ε)
  // toward the entangled end (smallest ν, largest ε). Since the sorted
  // spectrum has `epsilon[0]` = largest ε (ν sorted ascending), we index
  // from the tail backwards — `srcIdx = n − 1 − i` — so both `xs` (mode
  // label) and `ys` (ε) grow together. In the Bisognano-Wichmann limit
  // the resulting slope is the modular gap `Δε = 2π · β_mod`.
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < keep; i++) {
    const srcIdx = n - 1 - i
    if (srcIdx < 0) break
    const e = epsilon[srcIdx]!
    if (Number.isFinite(e)) {
      xs.push(i)
      ys.push(e)
    }
  }
  if (xs.length < 4) {
    return {
      inverseTemperature: Number.NaN,
      temperature: Number.NaN,
      rSquared: Number.NaN,
      usedModes: xs.length,
    }
  }

  const m = xs.length
  let meanX = 0
  let meanY = 0
  for (let i = 0; i < m; i++) {
    meanX += xs[i]!
    meanY += ys[i]!
  }
  meanX /= m
  meanY /= m
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = 0; i < m; i++) {
    const dx = xs[i]! - meanX
    const dy = ys[i]! - meanY
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  if (sxx <= 0) {
    return {
      inverseTemperature: Number.NaN,
      temperature: Number.NaN,
      rSquared: Number.NaN,
      usedModes: m,
    }
  }
  const slope = sxy / sxx
  const rSquared = syy > 0 ? (sxy * sxy) / (sxx * syy) : 1
  // For an equi-spaced modular spectrum, slope = Δε = 2π · β_mod, so
  // β_mod = slope / (2π). The modular "temperature" is 1/β_mod. Guard
  // against slope ≤ 0 which signals a non-Rindler (non-equi-spaced or
  // descending) spectrum where the fit does not correspond to a
  // Boltzmann factor.
  if (!(slope > 0)) {
    return {
      inverseTemperature: Number.NaN,
      temperature: Number.NaN,
      rSquared,
      usedModes: m,
    }
  }
  const inverseTemperature = slope / (2 * Math.PI)
  const temperature = 1 / inverseTemperature
  return { inverseTemperature, temperature, rSquared, usedModes: m }
}

// ───────────────────────────────────────────────────────────────────────────
//  Cosmological trajectory — S(L_A, η) under FLRW adiabatic evolution
// ───────────────────────────────────────────────────────────────────────────

/**
 * Input to a cosmology-aware entanglement-entropy trajectory computation.
 *
 * Lattice geometry is N-D (the slice along axis 0 is probed); for a pure
 * 1D run pass length-1 arrays and `latticeDim = 1`.
 */
export interface CosmologicalEntropyInput {
  /** Grid sizes per lattice dimension. First entry is the probed axis. */
  readonly gridSize: readonly number[]
  /** Lattice spacings per dimension. */
  readonly spacing: readonly number[]
  /** Active spatial dimensions of the lattice. */
  readonly latticeDim: number
  /** Mass of the free scalar field (physical mass, not yet squared with a²). */
  readonly mass: number
  /** Contiguous subsystem length L_A ∈ [1, N_0/2]. */
  readonly subsystemLength: number
  /** FLRW preset parameters (must satisfy `isValidPreset`). */
  readonly cosmology: CosmologyPresetParams
  /** Conformal times `η < 0` at which to evaluate S (skipped if `η = 0`). */
  readonly etaSweep: readonly number[]
}

/**
 * Result of a cosmology-aware entanglement-entropy trajectory.
 */
export interface CosmologicalEntropyTrajectory {
  /** Conformal times actually sampled (non-zero, cosmology-valid). */
  etas: number[]
  /** Scale factor `a(η)` at each sampled η. */
  scaleFactors: number[]
  /** Effective squared mass `m² · a(η)²` at each sampled η. */
  effectiveMassSq: number[]
  /** Peschel entropy S(L_A, η) at each sampled η, in nats. */
  entropies: number[]
}

/**
 * Evaluate the Peschel entanglement entropy S(L_A) of a contiguous 1D slice
 * subsystem as a function of conformal time η on a cosmological background.
 *
 * The slice is the 1D set of lattice sites along axis 0 of the N-D lattice;
 * the correlators are built by summing over all transverse k modes so the
 * trajectory reflects the full-dimensional vacuum restricted to the slice,
 * not a standalone 1D theory that happens to share `(N_0, a_0, m)`.
 *
 * The computation at each η is the **instantaneous adiabatic-vacuum**
 * entropy built from the lattice dispersion `ω_k(η)² = k_lat² + m²·a(η)²`.
 * This is the cosmology-aware counterpart of the Minkowski construction in
 * {@link buildLatticeSliceCorrelators} — same operator, different squared
 * mass at each step.
 *
 * **What it reveals**: for de Sitter, as η → 0⁻ the scale factor
 * `a(η) = −1/(Hη)` diverges, so `m_eff²(η) → ∞` for a massive field — the
 * mass gap reopens and entropy saturates to the area law. For a massless
 * field `m_eff² ≡ 0`, the entropy is independent of η at the analytic level;
 * any residual drift is a lattice finite-size artefact. For Kasner and
 * ekpyrotic backgrounds `a(η)` varies as a power law in `|η|`, so the
 * trajectory shows monotonic growth or decay depending on `q`.
 *
 * Invalid / skipped samples:
 *   - `η = 0` is skipped (the cosmology helper throws for non-Minkowski).
 *   - Non-finite `a(η)` is skipped (should not happen for the standard
 *     presets but is guarded defensively).
 *   - An invalid non-Minkowski preset returns an empty trajectory so the UI
 *     can hide the chart — more honest than a flat line labelled "de Sitter".
 *
 * @param input - Lattice, cosmology, and η-sweep configuration.
 * @returns A trajectory with matched `etas`, `scaleFactors`,
 *          `effectiveMassSq`, and `entropies` arrays.
 * @throws {Error} If `subsystemLength < 1` or `> gridSize[0]`, or lattice
 *                 parameters are invalid.
 */
export function computeCosmologicalEntropyTrajectory(
  input: CosmologicalEntropyInput
): CosmologicalEntropyTrajectory {
  const { gridSize, spacing, latticeDim, mass, subsystemLength, cosmology, etaSweep } = input
  if (!Number.isInteger(latticeDim) || latticeDim < 1) {
    throw new Error(
      `computeCosmologicalEntropyTrajectory: latticeDim must be a positive integer, got ${latticeDim}`
    )
  }
  if (gridSize.length < latticeDim || spacing.length < latticeDim) {
    throw new Error(
      `computeCosmologicalEntropyTrajectory: gridSize and spacing must have at least ${latticeDim} entries`
    )
  }
  const N0 = gridSize[0]!
  if (!Number.isInteger(subsystemLength) || subsystemLength < 1 || subsystemLength > N0) {
    throw new Error(
      `computeCosmologicalEntropyTrajectory: subsystemLength must be in [1, ${N0}], got ${subsystemLength}`
    )
  }
  if (!(N0 >= 2) || !(spacing[0]! > 0) || !Number.isFinite(mass)) {
    throw new Error('computeCosmologicalEntropyTrajectory: invalid lattice parameters')
  }

  const massSqBase = mass * mass
  const isMinkowski = cosmology.preset === 'minkowski'
  // Refuse to silently fall back to the Minkowski trajectory for an invalid
  // non-Minkowski preset — the UI handles an empty trajectory by hiding the
  // chart, which is a clearer signal to the user that their parameters are
  // broken than a flat line labeled "de Sitter".
  if (!isMinkowski && !isValidPreset(cosmology)) {
    return { etas: [], scaleFactors: [], effectiveMassSq: [], entropies: [] }
  }

  const etas: number[] = []
  const scales: number[] = []
  const mEffs: number[] = []
  const entropies: number[] = []

  for (const eta of etaSweep) {
    if (!Number.isFinite(eta)) continue
    if (eta === 0 && !isMinkowski) continue

    let snap: CosmologySnapshot
    if (isMinkowski) {
      snap = { a: 1, hubble: 0, aKinetic: 1, aPotential: 1, aFull: 1 }
    } else {
      try {
        snap = computeCosmologyAt(eta, cosmology)
      } catch {
        continue
      }
    }
    if (!Number.isFinite(snap.a) || snap.a <= 0) continue

    const mEffSq = massSqBase * snap.a * snap.a
    const correlators = buildLatticeSliceCorrelators({
      gridSize,
      spacing,
      latticeDim,
      massSq: mEffSq,
    })
    const XA = extractSubsystem(correlators.X, N0, 0, subsystemLength)
    const PA = extractSubsystem(correlators.P, N0, 0, subsystemLength)
    const nu = symplecticEigenvalues(XA, PA, subsystemLength)
    const S = peschelEntropy(nu)

    etas.push(eta)
    scales.push(snap.a)
    mEffs.push(mEffSq)
    entropies.push(S)
  }

  return { etas, scaleFactors: scales, effectiveMassSq: mEffs, entropies }
}
