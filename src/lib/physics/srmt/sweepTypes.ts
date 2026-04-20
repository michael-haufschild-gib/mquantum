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
 * - `'gridNa'`     — vary `gridNa ∈ [sweepMin, sweepMax]` (integer; rounded
 *   + dedup'd). Changes the `a`-grid spacing `da = (aMax − aMin) / (Na−1)`
 *   and forces a full solver re-run per point. The convergence study used
 *   to certify the leapfrog's 2nd-order accuracy: `|q(N_a) − q(N_a^max)|`
 *   must shrink monotonically as `N_a` grows. A claim that fails this
 *   Cauchy property has unbounded `a`-discretisation error and must not
 *   be published.
 * - `'gridNphi'`   — vary `gridNphi ∈ [sweepMin, sweepMax]` (integer;
 *   rounded + dedup'd). Same role as `gridNa` but on the φ-axes. Tighter
 *   range because the explicit-leapfrog CFL term `da²·8/dφ²/aMin²` grows
 *   as `N_φ²` (with `dφ = 2·phiExtent/(N_φ−1)`); the upper bound 33 keeps
 *   the default config inside the warning budget.
 * - `'gridNphiCoupled'` — joint grid-convergence sweep that varies
 *   `gridNphi ∈ [sweepMin, sweepMax]` **and** co-scales `gridNa` per
 *   point to hold the CFL term approximately constant. Where
 *   {@link SrmtSweepKind.gridNphi} holds `gridNa` fixed and forces the
 *   CFL term to grow as `N_φ²` — pushing the solver past its warn budget
 *   at the upper end — this coupled kind bumps `gridNa` approximately
 *   linearly in `(N_φ − 1)` (see {@link coupledGridNaFor}) so the
 *   publication-grade sweep reports `q(N_φ)` without CFL-contaminated
 *   tails. Expensive: each per-point solve scales linearly with the
 *   auto-bumped `gridNa`, which therefore also grows roughly linearly
 *   across the sweep, so clamp `points ∈ [3, 7]` (4–8× per-point cost
 *   vs. uncoupled `gridNphi`). Emits `sweepValue = N_φ`; the per-point
 *   `gridNa` is derived, not reported as the swept axis.
 */
export type SrmtSweepKind =
  | 'cut'
  | 'mass'
  | 'lambda'
  | 'bc'
  | 'phiRef'
  | 'rankCap'
  | 'phiExtent'
  | 'gridNa'
  | 'gridNphi'
  | 'gridNphiCoupled'

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
   *  - `cut`:       [4, 64]
   *  - `mass`:      [3, 21]
   *  - `lambda`:    [3, 21]
   *  - `phiRef`:    [3, 21]
   *  - `rankCap`:   [3, 32]   (integer-valued; driver dedups post-round)
   *  - `phiExtent`: [3, 13]   (full solver re-run per point → expensive)
   *  - `gridNa`:    [3, 9]    (full re-solve per point; integer round + dedup)
   *  - `gridNphi`:  [3, 9]    (full re-solve per point; integer round + dedup)
   *  - `gridNphiCoupled`: [3, 7] (coupled kind; 4–8× solve cost per point
   *    vs. uncoupled `gridNphi` because the derived `gridNa` rises roughly
   *    linearly with `(N_φ − 1)`, not as `N_φ²`)
   *  - `bc`:        always {@link SRMT_BC_SWEEP_ORDER}.length (3); caller's
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
  /**
   * Seed for the Lanczos starting-vector PRNG used by
   * {@link hjSpectrumOnSliceTopK}. When `undefined`, the library's built-in
   * default (`0x5EED1AB1`, defined in `lanczos.ts`) is used. When set,
   * this value is threaded through every HJ top-k extraction the sweep
   * performs, making the sweep's byte-exact output a function of the
   * config alone — so two runs at the same git SHA with the same config
   * produce byte-identical CSVs, and a seed-sensitivity sweep (varying
   * this knob across runs) can separate Lanczos-starting-vector noise
   * from truncation sensitivity in `qStdev`.
   *
   * When set, this seed is also emitted in the `# srmt:` line of the
   * reproducibility manifest so the archived CSV pins it alongside git
   * SHA and solver versions.
   */
  seed?: number
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
   *  - `gridNa`:    integer `gridNa` (a-axis sample count) at this point.
   *  - `gridNphi`:  integer `gridNphi` (φ-axis sample count) at this point.
   *  - `gridNphiCoupled`: integer `gridNphi`; the per-point `gridNa` used
   *    by the solver is derived from the coupling formula and is NOT
   *    surfaced on the point.
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
  /**
   * Per-clock fitted slope `α` from the least-squares affine fit
   * `K ≈ α·E + β` that produces `quality[clock]`. Exposed so downstream
   * analysis can see the unit-conversion factor the scalar `q_affine`
   * would otherwise hide: when `q_rigid / q_affine` spans many decades
   * (see `docs/physics/srmt-metric.md`), `α` is carrying the orders of
   * magnitude. `undefined` when the clock was excluded or the affine
   * fit degenerated (zero-variance `E`, too few points).
   */
  alphaByClock?: Partial<Record<SrmtClock, number>>
  /**
   * Per-clock fitted intercept `β` from the least-squares affine fit
   * `K ≈ α·E + β` that produces `quality[clock]`. Reported alongside
   * {@link alphaByClock} so the full linear fit is machine-readable
   * from the CSV export. `undefined` under the same conditions as
   * `alphaByClock`.
   */
  betaByClock?: Partial<Record<SrmtClock, number>>
  /**
   * Per-clock effective Schmidt rank — count of modes with
   * `(s_n / s_0)² > 1e-6`. Surfaces degeneracy that would otherwise
   * silently collapse the affine fit: with too few non-trivial modes
   * the `K ≈ α·E + β` regression has almost no signal to bind, and
   * `quality` differences between clocks reflect floor-pinned K
   * vectors rather than physics.
   *
   * Publication guideline: reject champion-clock determination when
   * `rEff < 8` on any requested clock. The UI's
   * `computeChampionFlips` helper enforces this gate automatically.
   *
   * `undefined` per-clock when the clock was excluded from the sweep.
   */
  rEffByClock?: Partial<Record<SrmtClock, number>>
  /**
   * Per-clock fraction of `K_n` within `1.5` nats of the ε-floor
   * (`−log(ε)` where `ε = MODULAR_EPSILON · s_0²`), measured over the
   * top-`rankCap` modes kept for the affine fit. A value approaching
   * `1` means the modular spectrum has collapsed into its
   * regularisation floor — the `quality` score is then a property of
   * the floor, not of the SRMT conjecture. Per
   * `/tmp/srmt-tunneling-bc-analysis.md` this happened in the
   * tunneling-BC, `phi1`-clock slice: 53 % of `K_n` pinned, producing
   * the `q_phi1 < q_a` inversion that looked like physics but was a
   * metric artifact.
   *
   * Publication guideline: `floorFraction ≥ 0.25` is a warning flag;
   * `≥ 0.5` is disqualifying. `undefined` per-clock when the clock
   * was excluded from the sweep.
   */
  floorFractionByClock?: Partial<Record<SrmtClock, number>>
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
