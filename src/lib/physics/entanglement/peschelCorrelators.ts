/**
 * Lattice correlator construction for the Peschel entanglement-entropy probe.
 *
 * Builds the full-lattice two-point functions `X_ij = ⟨φ_i φ_j⟩` and
 * `P_ij = ⟨π_i π_j⟩` for a free scalar vacuum on a 1D slice of an N-D
 * periodic lattice. These correlators are the input to the symplectic
 * eigenvalue decomposition that yields the reduced von Neumann entropy.
 *
 * @module lib/physics/entanglement/peschelCorrelators
 */

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
export const ENTROPY_IR_FLOOR = 1e-6

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
