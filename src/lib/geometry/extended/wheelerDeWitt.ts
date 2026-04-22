/**
 * Wheeler–DeWitt (minisuperspace) configuration types.
 *
 * The Wheeler–DeWitt mode solves the canonical quantum-gravity wave equation
 * in a 3D minisuperspace consisting of the FRW scale factor `a` and two
 * massive inflaton scalars `φ₁`, `φ₂`. Three boundary-condition flavors are
 * supported:
 *
 *  - `noBoundary`  — Hartle–Hawking, real exponentially-damped initial data.
 *  - `tunneling`   — Vilenkin, complex oscillating initial data with a
 *                    φ-dependent phase gradient.
 *  - `deWitt`      — χ(a=0, φ) = 0, bootstrapped by a linear-in-a profile.
 *
 * All values are in G = ℏ = c = 1 simulation units.
 */

/**
 * Boundary condition selector for Wheeler–DeWitt integration.
 *
 *  - `noBoundary`  — Hartle–Hawking no-boundary proposal.
 *  - `tunneling`   — Vilenkin tunneling proposal.
 *  - `deWitt`      — DeWitt boundary condition χ(0,·)=0.
 */
export type WdwBoundaryCondition = 'noBoundary' | 'tunneling' | 'deWitt'

/**
 * SRMT (Superspace-Relational Modular Time) clock identifier — matches
 * {@link import('@/lib/physics/srmt/types').SrmtClock}. Selects which
 * minisuperspace axis the modular-time diagnostic partitions the `χ`
 * tensor along:
 *
 *  - `'a'`    — DeWitt-timelike scale factor (SRMT conjecture: best fit).
 *  - `'phi1'` — First inflaton axis (spacelike in the DeWitt supermetric).
 *  - `'phi2'` — Second inflaton axis (spacelike in the DeWitt supermetric).
 */
export type WdwSrmtClock = 'a' | 'phi1' | 'phi2'

/**
 * Wheeler–DeWitt minisuperspace configuration.
 *
 * Fields marked "(physics)" feed the solver. Fields marked "(display)" only
 * influence the rendered overlay. Fields marked "(render-only)" drive
 * visual-only animation and DO NOT trigger a solver re-run — they are
 * consumed by shaders or post-solve overlay builders.
 */
export interface WheelerDeWittConfig {
  /** Selected boundary condition proposal (physics) */
  boundaryCondition: WdwBoundaryCondition
  /** Inflaton mass m for V(φ) = ½m²φ₁² + ½(m·α)²φ₂² + Λ (physics) */
  inflatonMass: number
  /**
   * Per-axis effective-mass ratio `α` applied to the φ₂ component of
   * the potential (effective mass on the φ₂ axis = `m·α`, on the φ₁
   * axis = `m`). `α = 1` is the isotropic default that reproduces the
   * pre-asymmetry symmetric potential bit-identically. Anisotropic
   * values break the φ₁↔φ₂ exchange symmetry, allowing the SRMT
   * diagnostic to distinguish the three clocks `{a, phi1, phi2}`
   * instead of producing `q_phi1 == q_phi2` by construction. Clamped
   * to `[0.1, 10]` by the setter. (physics) */
  inflatonMassAsymmetry: number
  /** Cosmological constant Λ (physics) */
  cosmologicalConstant: number
  /** Minimum scale factor a_min at which boundary data is imposed (physics) */
  aMin: number
  /** Maximum scale factor a_max where integration stops (physics) */
  aMax: number
  /** Number of `a` steps in the leapfrog march (physics) */
  gridNa: number
  /** Number of φ grid points per inflaton axis (physics) */
  gridNphi: number
  /** Half-range of φ-grid: φ ∈ [-phiExtent, phiExtent] (physics) */
  phiExtent: number
  /** Whether WKB classical-cosmology streamlines are overlaid (display) */
  streamlinesEnabled: boolean
  /** Streamline seed density — number of seeds per axis (display) */
  streamlineDensity: number

  // Animation effects (render-only; no solver impact)
  /** Enable phase rotation (Option 1 — visual χ → χ·e^{iωt}) (render-only) */
  phaseRotationEnabled: boolean
  /** Angular-velocity multiplier for phase rotation, 0–5 rad/unit-time (render-only) */
  phaseRotationSpeed: number
  /** Enable semiclassical worldline traveling pulse (Option 3) (render-only) */
  worldlineEnabled: boolean
  /** Pulse cycles per unit time; 0.1–3.0 (render-only) */
  worldlineSpeed: number
  /** Gaussian pulse width in normalized trajectory-progress units (0.02–0.3) (render-only) */
  worldlinePulseWidth: number

  /**
   * Render-only dynamic-range headroom factor applied to
   * `computeWdwRenderMaxRho`. The R-channel normalisation cap is
   * `headroom · max_Lorentzian`, clamped to the physical global max.
   * Lowering it toward 1 reveals more Lorentzian interior structure
   * but saturates the Euclidean Airy-Bi corner sooner; raising it
   * toward 10 000 hides Lorentzian detail under a uniform dim
   * interior until only the extreme-corner Bi growth shows. 100 is
   * the legacy default that shipped with H2. Clamped to [1, 10 000]
   * by the setter. (render-only)
   */
  renderDynamicRange: number

  // ── SRMT (Superspace-Relational Modular Time) diagnostic (display-only) ──
  // Feeds the modular-vs-HJ spectrum overlay. All five fields participate in
  // the SRMT hash (see `computeWdwSrmtHash`) but NOT in the solver hash —
  // toggling SRMT never re-runs the Wheeler–DeWitt solve.
  /** Master toggle for the SRMT diagnostic + overlay (display-only) */
  srmtEnabled: boolean
  /** Clock axis the modular spectrum is computed along (display-only) */
  srmtClock: WdwSrmtClock
  /** Normalized cut position along the clock axis, in [0.1, 0.9] (display-only) */
  srmtCutNormalized: number
  /** Max Schmidt rank kept; range [8, 256] (display-only) */
  srmtRankCap: number
  /** Heatmap overlay brightness multiplier in [0, 1] (display-only) */
  srmtHeatmapIntensity: number

  /** Runtime flag: when true, strategy recomputes the solver on next frame */
  needsReset: boolean
}

/**
 * Baseline Wheeler–DeWitt configuration. Parameters are chosen so the
 * default Hartle–Hawking run stays numerically stable with the
 * second-order leapfrog march and produces a visible density distribution
 * at the middle of the (a, φ₁, φ₂) grid.
 *
 * `phiExtent = 3.5` ensures the physical wavefunction has decayed to
 * negligible amplitude (`exp(−0.5·3.5²) ≈ 0.2 %` of the Gaussian seed)
 * at the φ-grid boundary regardless of the ghost BC (Neumann). The solver
 * uses a Neumann zero-flux ghost for the φ-Laplacian to avoid artificial
 * sink artifacts at the grid edge; at `phiExtent ≥ 3.5` the boundary
 * amplitude is exponentially suppressed by the WKB Euclidean decay so
 * reflections are physically irrelevant.
 *
 * `gridNphi = 40` provides ~5.7 cells per Gaussian σ across the full
 * extent and ~23 cells in the physically interesting region `|φ| < 2`
 * where the Lorentzian oscillatory features live.
 *
 * `aMin = 0.1` (rather than the literature-minimal 0.05) keeps the explicit
 * leapfrog comfortably inside its CFL bound. The φ-Laplacian contribution
 * scales as `da² · (1/aMin²) · 8/dphi²`, which doubles when `aMin` halves;
 * `aMin = 0.1` cuts that term by 4× compared with `aMin = 0.05`. The CFL
 * guard in `solveWheelerDeWitt` warns (dev-only) if the chosen
 * `(aMin, aMax, gridNa, gridNphi, phiExtent)` combination crosses the
 * stability budget.
 */
export const DEFAULT_WHEELER_DEWITT_CONFIG: WheelerDeWittConfig = {
  boundaryCondition: 'noBoundary',
  inflatonMass: 0.3,
  inflatonMassAsymmetry: 1.0,
  cosmologicalConstant: 0.0,
  aMin: 0.1,
  aMax: 1.5,
  gridNa: 128,
  gridNphi: 40,
  phiExtent: 3.5,
  streamlinesEnabled: true,
  streamlineDensity: 6,
  phaseRotationEnabled: false,
  phaseRotationSpeed: 1.0,
  worldlineEnabled: false,
  worldlineSpeed: 0.5,
  worldlinePulseWidth: 0.08,
  renderDynamicRange: 100,
  srmtEnabled: false,
  srmtClock: 'a',
  srmtCutNormalized: 0.5,
  srmtRankCap: 64,
  srmtHeatmapIntensity: 0.6,
  needsReset: true,
}
