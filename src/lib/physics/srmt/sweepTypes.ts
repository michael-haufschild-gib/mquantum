/**
 * Types for the SRMT parameter sweep.
 *
 * The sweep is an experiment driver that runs {@link computeSrmtDiagnostic}
 * across a range of one varying parameter (cut position, inflaton mass,
 * or boundary condition) and records the per-clock affine-match quality
 * at each point. The resulting `q_a(x)`, `q_{phi1}(x)`, `q_{phi2}(x)`
 * curves are the headline read: SRMT predicts `q_a ≪ q_phi` in the
 * classically-allowed region, and the sweep makes the "where does that
 * break?" question quantifiable.
 *
 * Pure data types only — no compute, no store access.
 *
 * @module lib/physics/srmt/sweepTypes
 */

import type { WdwBoundaryCondition } from '@/lib/geometry/extended/wheelerDeWitt'

import type { SrmtClock } from './types'

/**
 * Sweep kind — which parameter is varied across sweep points.
 *
 * Tier-1 physics sweeps (vary a physical parameter):
 *
 * - `'cut'`    — vary `srmtCutNormalized ∈ [sweepMin, sweepMax]` at fixed
 *   physics. Cheapest: the solver runs once; Schmidt runs once per
 *   clock (cut-independent); only the HJ operator is rebuilt per point.
 * - `'mass'`   — vary `inflatonMass ∈ [sweepMin, sweepMax]` at fixed
 *   `cutNormalized`. Requires a solver re-run per point (physics changes).
 * - `'lambda'` — vary `cosmologicalConstant ∈ [sweepMin, sweepMax]` at
 *   fixed `cutNormalized`. Also requires a solver re-run per point; the
 *   physics read is the de-Sitter / anti-de-Sitter / flat-vacuum regime
 *   transition and how the Lorentzian turning surface tracks it.
 * - `'bc'`     — iterate through `{noBoundary, tunneling, deWitt}` at
 *   fixed physics + cut. Three solver re-runs.
 *
 * Tier-3 sensitivity sweeps (vary a landmark / numerical / grid knob):
 *
 * - `'phiRef'`   — vary `phiRef ∈ [sweepMin, sweepMax]` at fixed cut,
 *   physics, and grid. `phiRef` does **not** enter the q-compute — it
 *   only sets the classical-turning-point landmark. So `q` is exactly
 *   flat across a phiRef sweep by construction, and the sweep's physics
 *   read is the *motion of the landmark* against the `q` curves from
 *   nearby `cut` sweeps, plus the empirical invariance of `q` itself.
 *   Landmarks are computed *per point* and attached to
 *   `SrmtSweepPoint.perPointLandmarks`.
 * - `'rankCap'`  — vary `rankCap ∈ [sweepMin, sweepMax]` at fixed
 *   physics, grid, and cut. Integer-valued; dedup'd. A claim that
 *   survives the rankCap sweep is not a numerical artifact of spectrum
 *   truncation. Cheapest of the sensitivity sweeps: the solver runs
 *   once, Schmidt runs once per clock, only the HJ top-k extraction +
 *   affine fit are repeated per point.
 * - `'phiExtent'` — vary `phiExtent ∈ [sweepMin, sweepMax]`. Changes the
 *   φ-grid spacing `dφ = 2·phiExtent / (Nφ−1)`, which changes both the
 *   WdW solve and the HJ operator. Expensive: full solver re-run per
 *   point. A claim that survives phiExtent is not an artifact of
 *   grid-resolution on the spacelike axes.
 */
export type SrmtSweepKind = 'cut' | 'mass' | 'lambda' | 'bc' | 'phiRef' | 'rankCap' | 'phiExtent'

/** Ordered list of boundary conditions for the `'bc'` sweep kind. */
export const SRMT_BC_SWEEP_ORDER: readonly WdwBoundaryCondition[] = [
  'noBoundary',
  'tunneling',
  'deWitt',
]

/** Configuration for a single sweep run. */
export interface SrmtSweepConfig {
  /** Which parameter to vary. */
  kind: SrmtSweepKind
  /**
   * Number of sweep points. Clamped per-kind:
   *  - `cut`:      [4, 64]
   *  - `mass`:     [3, 21]
   *  - `lambda`:   [3, 21]
   *  - `phiRef`:   [3, 21]
   *  - `rankCap`:  [3, 32]   (integer-valued; driver dedups post-round)
   *  - `phiExtent`:[3, 13]   (full solver re-run per point → expensive)
   *  - `bc`:       always {@link SRMT_BC_SWEEP_ORDER}.length (3); caller's
   *    `points` is ignored.
   */
  points: number
  /** Clocks to compute. Empty = all three. */
  clocks: readonly SrmtClock[]
  /** Max Schmidt rank kept. Clamped to [8, 256]. */
  rankCap: number
  /**
   * Anchor cut position for `mass` / `bc` sweeps. Ignored for `cut`
   * sweep (where the cut is the varying parameter). Normalised,
   * `[0.1, 0.9]` per the usual UI clamp.
   */
  cutNormalized: number
  /**
   * φ used to evaluate the classical-turning-point landmark. Must be
   * finite and lie in `[-phiExtent, +phiExtent]`. At `phi = 0` the
   * default potential `V(φ) = ½m²|φ|² + Λ` may vanish — callers should
   * pick a non-zero reference (UI default: `phiExtent / 2`).
   */
  phiRef: number
  /** Sweep range lower bound. Ignored for `bc`. */
  sweepMin: number
  /** Sweep range upper bound. Ignored for `bc`. */
  sweepMax: number
}

/**
 * Per-point sweep output. `quality` is indexed by clock; a missing key
 * means the clock was excluded from `SrmtSweepConfig.clocks`.
 *
 * `q` is stored as `number` (JS double = Float64) because the affine-fit
 * residual can span many decades and is re-normalised on-plot; single
 * precision degrades the log-y comparison in the low-q regime where
 * SRMT wins.
 */
export interface SrmtSweepPoint {
  /** 0-based index within `points[]`. */
  index: number
  /**
   * Sweep value for this point. Meaning depends on `SrmtSweepConfig.kind`:
   *  - `cut`:       `srmtCutNormalized ∈ [sweepMin, sweepMax]`.
   *  - `mass`:      inflaton mass `m`.
   *  - `lambda`:    cosmological constant `Λ`.
   *  - `phiRef`:    landmark-reference `φ_ref`.
   *  - `rankCap`:   integer `rankCap` used at this point.
   *  - `phiExtent`: φ-grid half-range.
   *  - `bc`:        numeric position `0, 1, 2` for the BC order in
   *    {@link SRMT_BC_SWEEP_ORDER}; the actual enum value is in
   *    `sweepValueBc`.
   */
  sweepValue: number
  /** Populated only for `bc` sweep kind. */
  sweepValueBc?: WdwBoundaryCondition
  /**
   * Resolved normalised cut used for this point. For `cut` sweep this is
   * the (dedup'd) cut value; for `mass`/`bc` it equals
   * `SrmtSweepConfig.cutNormalized`.
   */
  cutNormalized: number
  /** Per-clock affine-match quality. NaN = compute returned degenerate. */
  quality: Partial<Record<SrmtClock, number>>
  /**
   * Per-clock jackknife standard deviation of `quality[clock]`.
   *
   * Computed via leave-one-out drop of paired `(K_k, E_k)` modes under
   * the rank-cap window — see {@link jackknifeAffineFitStdev}. This
   * estimates how much `q` changes if a single Schmidt mode were
   * truncated, which is the dominant systematic of the spectrum-vs-spectrum
   * affine fit at fixed grid + cut.
   *
   * `undefined` when the clock was excluded from the sweep, when the
   * underlying full-data `quality` is non-finite, or when fewer than 3
   * spectral pairs were available (jackknife is undefined for n<3).
   *
   * Sweep results that print `quality[clock]` without `qStdev[clock]`
   * are *unfit for publication* — every reported `q` should be paired
   * with its σ.
   */
  qStdev?: Partial<Record<SrmtClock, number>>
  /**
   * Per-clock strict-α=1 match quality `q_rigid = Σ(K − E − β*)² / Σ K²`.
   * See `docs/physics/srmt-metric.md`: this is the direct test of the
   * SRMT conjecture `K_n = E_n + const`, complementing the affine-fit
   * `quality[clock]` which only tests the weaker `K ≈ α·E + β` claim.
   * `q_rigid ≥ q_affine` identically.
   */
  qRigid?: Partial<Record<SrmtClock, number>>
  /**
   * Per-clock jackknife standard deviation of `qRigid[clock]`. Same
   * semantics as {@link qStdev}: leave-one-out under the rigid-fit
   * functional.
   */
  qRigidStdev?: Partial<Record<SrmtClock, number>>
  /** K_n modular spectrum per clock, length `≤ rankCap`. */
  kSpectrumByClock: Partial<Record<SrmtClock, Float32Array>>
  /** E_n HJ spectrum per clock, length `≤ rankCap`. */
  hjSpectrumByClock: Partial<Record<SrmtClock, Float32Array>>
  /**
   * Per-point landmarks — populated only for `kind='phiRef'`, where the
   * landmark moves with the sweep value and a single top-level
   * `landmarks[]` on the store is not enough. One entry per requested
   * clock; entries with null `sweepValueAtLandmark` are still kept so
   * the plot can annotate absolute coordinates.
   *
   * For every other sweep kind this field is absent and the consumer
   * reads the store-level `landmarks[]` instead.
   */
  perPointLandmarks?: readonly SrmtSweepLandmark[]
  /** Wall-clock milliseconds spent on this point (sum across clocks). */
  computeMs: number
}

/**
 * Classical-turning-point landmark for the sweep plot.
 *
 * - `kind='a_turn'`: horizontal axis is cut position on the `a` axis
 *   (clock `'a'` sweep). Landmark is `a_TP(phiRef, m, Λ)` mapped to the
 *   normalised cut coordinate.
 * - `kind='phi_turn'`: horizontal axis is cut position on a φ axis
 *   (clock `'phi1'` or `'phi2'` sweep). Landmark is the φ value where
 *   `V(φ_TP) = 1 / (K · a_slice²)` — i.e. where the classical turning
 *   surface crosses the current `a` slice.
 *
 * Both are `null` when the current physics parameters admit no turning
 * point in the sweep range.
 */
export interface SrmtSweepLandmark {
  kind: 'a_turn' | 'phi_turn'
  clock: SrmtClock
  /** φ evaluated when computing the landmark. Carried for UI annotation. */
  phiRef: number
  /**
   * Normalised coordinate on the sweep axis, `[0, 1]`. `null` when no
   * turning point exists or when the landmark falls outside the swept
   * range.
   */
  sweepValueAtLandmark: number | null
  /** `a_TP` or `φ_TP` in natural units. `null` when undefined. */
  absoluteCoordinate: number | null
}
