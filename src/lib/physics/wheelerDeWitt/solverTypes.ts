/**
 * Public + internal type contracts for the Wheeler–DeWitt leapfrog solver.
 *
 * Extracted from `./solver.ts` so the orchestrator file is dominated by
 * physics rather than struct definitions, and so unit tests / downstream
 * callers can `import type` without pulling in the full solver
 * implementation graph.
 *
 * @module lib/physics/wheelerDeWitt/solverTypes
 */

import type { WdwBoundaryCondition } from '@/lib/geometry/extended/wheelerDeWitt'

import type { ColumnAiryInfo } from './airyConnection'
import type { WdwBoundaryField } from './boundaryConditions'

/** Solver inputs mirroring the WdW config fields. */
export interface WheelerDeWittSolverInput {
  boundaryCondition: WdwBoundaryCondition
  inflatonMass: number
  /**
   * Per-axis effective-mass ratio `α` applied to the φ₂ component of the
   * potential `V(φ) = ½m²·φ₁² + ½(m·α)²·φ₂² + Λ`. Optional; defaults
   * to `1` (isotropic) which reproduces the pre-asymmetry behaviour
   * bit-identically (multiplication by the exact IEEE-754 constant `1`
   * is a no-op). Values `α ≠ 1` break the φ₁↔φ₂ exchange symmetry of
   * `χ` so the SRMT diagnostic can distinguish clocks `phi1` and
   * `phi2`.
   */
  inflatonMassAsymmetry?: number
  cosmologicalConstant: number
  aMin: number
  aMax: number
  gridNa: number
  gridNphi: number
  phiExtent: number
  /**
   * Optional override for the initial slab `χ(a_min, φ)` and its
   * `a`-derivative. When supplied, the solver bypasses
   * `buildWdwBoundary(boundaryCondition, …)` and consumes these buffers
   * directly. Provided for analytic-fixture validation: tests need to
   * inject a constant-in-φ slab so the φ-Laplacian term contributes
   * exactly zero everywhere, isolating the 1D problem `−χ'' + U(a)·χ
   * = 0` for pointwise comparison against closed-form Bessel/Hankel
   * solutions (see `analyticFixtures.ts` and `solverAnalytic.test.ts`).
   *
   * Buffer layout MUST match the BC-generator output: each entry is an
   * interleaved `(re, im)` complex pair indexed by
   * `i = i_phi1 * Nphi + i_phi2`. Total length per buffer:
   * `2 · Nphi · Nphi`. Mismatched lengths throw.
   *
   * **Caveat**: Stage-3 Airy/Langer overwrite still consults
   * `boundaryCondition` for the per-BC c1/c2 branch selection rule
   * (`airyConnection.ts:applyBcWeighting`). If a custom boundary is
   * combined with a BC enum that disagrees with the physical BC the
   * boundary actually represents, the Stage-3 overwrite will pick the
   * wrong branch in dS columns. Pure-Lorentzian regimes (`Λ ≤ 0` at
   * `m = 0`) skip Stage-3 entirely — for those tests the BC enum is a
   * no-op label.
   */
  customBoundary?: WdwBoundaryField
  /**
   * When `true`, the absorbing sponge layer on the φ-boundary is
   * disabled. Used by the JS↔Rust cross-validation tests: the Rust
   * validator does not yet implement the sponge, so enabling it in the
   * JS solver would create a systematic mismatch that masks real bugs.
   * Production code should never set this.
   */
  disableSponge?: boolean
}

/** Dense output of the Wheeler–DeWitt solver. */
export interface WheelerDeWittSolverOutput {
  /**
   * `χ(a, φ₁, φ₂)` as interleaved `(re, im)` pairs. Strides in units of
   * complex entries: `stride_a = Nphi·Nphi`, `stride_phi1 = Nphi`,
   * `stride_phi2 = 1`. Total floats = `2·Na·Nphi·Nphi`.
   */
  chi: Float32Array
  /** Per-cell mask: 1 when `U(a, φ) < 0` (Lorentzian), 0 otherwise (Euclidean). */
  lorentzianMask: Uint8Array
  /**
   * Per-cell band classification:
   *   0 = Lorentzian (`U < 0`).
   *   1 = Euclidean transition band (numerical + absorber).
   *   2 = Euclidean deep band (analytic WKB propagator).
   * Exposed so tests can validate band structure directly.
   */
  bandKind: Uint8Array
  /** Grid dimensions `(Na, Nphi, Nphi)`. */
  gridSize: [number, number, number]
  /** Physical grid extents (consumers read for coordinate mapping). */
  aMin: number
  aMax: number
  phiExtent: number
  /** Maximum `|χ|²` observed on the grid — for consumer-side normalization. */
  maxDensity: number
  /**
   * Per-column Airy/Langer connection state. Length `Nphi · Nphi`,
   * indexed `i1 * Nphi + i2`. Cells where `hasOverwrite` is `true` had
   * their Euclidean values overwritten with the BC-correct Langer
   * uniform formula; `false` columns kept the legacy
   * absorber + match-cell propagator path. Consumed by
   * {@link ./bogoliubov} for per-column α/β extraction.
   */
  columnAiry: ColumnAiryInfo[]
}

/** Result of the per-cell φ-Laplacian stencil: `(Re, Im)` pair. */
export interface ComplexPair {
  re: number
  im: number
}

/**
 * Per-column Stage-2 state. One entry per `(i1, i2)` cell indexed as
 * `i1 * Nphi + i2`. Tracks the analytic turning surface, the Airy
 * prefactor `α`, and the match coefficient captured at the first
 * deep-band crossing along `a`.
 */
export interface ColumnWkbState {
  /** `a_turn(φ)` in physical units, or `null` when `V(φ) ≤ 0`. */
  aTurn: number | null
  /** `α = ∂_a U|_{a_turn} = 2·c_U·a_turn`, or `null` if `aTurn` is null. */
  alpha: number | null
  /** Set once the first deep-band slab is reached; frozen afterwards. */
  matched: boolean
  /** `S_Euc` at the match slab. */
  sEucAtMatch: number
  /** `|U|^{1/4}` at the match slab, cached for the prefactor ratio. */
  uPrefactorAtMatch: number
  /** `χ` at the match slab, captured from the numerical output. */
  chiReAtMatch: number
  chiImAtMatch: number
}

/** Band classification for a single cell. */
export enum BandKind {
  Lorentzian = 0,
  EuclideanTransition = 1,
  EuclideanDeep = 2,
}
