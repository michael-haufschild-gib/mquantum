/**
 * Wheeler–DeWitt boundary conditions (Hartle–Hawking / Vilenkin / DeWitt).
 *
 * Each proposal prescribes the reduced wavefunction χ(a_min, φ) on the
 * two-inflaton grid and its `a`-derivative. The solver consumes these
 * two Float32 buffers as interleaved (re, im) pairs indexed by
 * `i = i_phi1 * Nphi + i_phi2`.
 *
 * All quantities use G = ℏ = c = 1 units. Physics constants and the
 * potential helper live in {@link ./constants}; they are re-exported here
 * for backward compatibility with existing imports.
 */

export { WDW_G_PREFACTOR, wdwPotential } from './constants'
import { WDW_C_U, WDW_G_PREFACTOR, wdwPotential, wdwU } from './constants'

/** Shared inputs for the boundary-condition generators. */
export interface WdwBoundaryInputs {
  /** Number of φ grid points per inflaton axis (square φ grid) */
  Nphi: number
  /** Half-range: φ ∈ [-phiExtent, +phiExtent] on both axes */
  phiExtent: number
  /** Initial scale factor a_min where data is imposed */
  aMin: number
  /** Inflaton mass m */
  mass: number
  /** Cosmological constant Λ */
  lambda: number
  /**
   * Per-axis effective-mass ratio on the φ₂ axis. Optional; defaults to
   * `1` (isotropic — matches pre-asymmetry behaviour bit-identically).
   * Threaded into `wdwPotential` / `wdwU` so boundary data stays
   * consistent with the bulk evolution's anisotropic potential.
   */
  asymmetry?: number
}

/** Output buffers for the boundary condition: χ(a_min, φ) and ∂_a χ(a_min, φ). */
export interface WdwBoundaryField {
  /** χ(a_min,·) interleaved [re, im] × (Nphi*Nphi). */
  chi: Float32Array
  /** ∂_a χ(a_min,·) interleaved [re, im] × (Nphi*Nphi). */
  chiDeriv: Float32Array
}

/** Interleaved-index helper — (re, im) packed: 2 floats per grid point. */
function setPair(out: Float32Array, idx: number, re: number, im: number): void {
  out[2 * idx] = re
  out[2 * idx + 1] = im
}

/** Zero-allocate helper that produces a Float32Array of (Nphi²) complex entries. */
function allocComplexGrid(Nphi: number): Float32Array {
  return new Float32Array(2 * Nphi * Nphi)
}

/**
 * Map grid index `i ∈ [0, Nphi)` to the φ coordinate.
 * Grid points span a closed interval of width 2·phiExtent.
 */
function indexToPhi(i: number, Nphi: number, phiExtent: number): number {
  if (Nphi <= 1) return 0
  return -phiExtent + (2 * phiExtent * i) / (Nphi - 1)
}

/**
 * Hartle–Hawking no-boundary data.
 *
 * χ(a_min, φ) = exp(−|S_E|) with the WKB Euclidean action
 * S_E(φ, a) = (1/(3 V(φ))) · [(1 − a²·(8πG/3)·V(φ))^{3/2} − 1] when the
 * argument is non-negative, falling back to a Gaussian-in-φ envelope
 * when the expression is imaginary (V(φ) is too large for the bounce).
 *
 * The a-derivative selects the Euclidean decaying branch: inside the bounce
 * (V > 0 and 1 − K·V·a² > 0) we set ∂_a χ = −K·a·√(1 − K·V·a²)·χ, the WKB
 * relation χ' = −|dS_E/da|·χ. Setting χ' = 0 (classically symmetric between
 * growing and decaying branches) would let the non-physical growing branch
 * dominate the march and saturate the solver's overflow clamp at the cube
 * corners.
 *
 * Small-V limit (|V| ≤ WDW_HH_SMALL_V_THRESHOLD): the 1/V factor in S_E is
 * removable. The first-order Taylor expansion gives
 * `S_E(a, φ) → −K·a²/2 + O(V)`, so `|S_E| → K·a²/2` and
 * `dS_E/da → −K·a`. Using this continuous small-V form (instead of a
 * discrete amp = exp(−½|φ|²) / dChi = 0 fallback) eliminates the O(0.04)
 * amplitude discontinuity and O(0.8) derivative discontinuity that the
 * prior fallback introduced at V = 0 cells (origin for Λ = 0, m > 0 —
 * five out of six curated presets).
 *
 * Classically forbidden region (V > 0 and `1 − K·V·a² ≤ 0`, i.e.,
 * `a ≥ a_turn`): fall back to the exponentially damped tail — the WKB
 * relation is ill-defined past the turning surface and the `(arg)^{3/2}`
 * branch goes complex.
 *
 * @param input - Grid + physics inputs
 * @returns Real-valued (im = 0) boundary field
 */
export function hartleHawkingBoundary(input: WdwBoundaryInputs): WdwBoundaryField {
  const { Nphi, phiExtent, aMin, mass, lambda } = input
  const asymmetry = input.asymmetry ?? 1
  const chi = allocComplexGrid(Nphi)
  const chiDeriv = allocComplexGrid(Nphi)
  const a2 = aMin * aMin

  // Free case (V ≡ 0 across the grid): no potential defines an amplitude,
  // so we use a Gaussian-in-φ envelope as a conventional gauge choice and
  // let the solver's leapfrog + Neumann ghost evolve it. `mass = 0` with
  // `lambda = 0` is the only way V is identically zero at every cell.
  const isFreeCase = mass === 0 && lambda === 0

  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = indexToPhi(i1, Nphi, phiExtent)
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = indexToPhi(i2, Nphi, phiExtent)
      const V = wdwPotential(phi1, phi2, mass, lambda, asymmetry)
      const idx = i1 * Nphi + i2
      let amp: number
      let dChi = 0
      // Per-cell branch selection. The previous `isAdsCase = lambda < 0`
      // gate flipped every column to the Gaussian envelope as soon as
      // Λ < 0, even outer-φ columns where `V(φ) = 0.5·m²·(φ₁²+φ₂²) + Λ`
      // is positive and a genuine turning surface exists. Those outer
      // cells legitimately want the HH V-dependent seed; the global
      // gate suppressed their φ-structure. Pick per cell: V < 0 →
      // Gaussian gauge (AdS cell); V ≥ 0 → HH WKB seed (the existing
      // small-V branch already smoothly handles V = 0).
      const isAdsCell = V < 0
      if (isFreeCase || isAdsCell) {
        // Gauge-choice Gaussian envelope for cells with no classical
        // turning surface (V ≤ 0) and for the identically-free grid.
        amp = Math.exp(-0.5 * (phi1 * phi1 + phi2 * phi2))
      } else if (V <= WDW_HH_SMALL_V_THRESHOLD) {
        // Small-positive-V limit (and V = 0 columns inside a V > 0 grid):
        //   (arg^{3/2} − 1) / (3V)  →  −K·a²/2  as V → 0⁺,
        // with derivative `dS_E/da → −K·a`. Applying this continuous
        // small-V form removes the O(0.04) amp discontinuity and O(0.8)
        // dChi discontinuity the legacy V ≤ 1e-12 fallback introduced at
        // origin cells of Λ = 0 presets (noBoundaryBaseline, deWittOrigin,
        // inflationHighMass use HH-family BCs that hit this path at the
        // grid centre). Gated on `!isAdsCase && !isFreeCase` so truly-zero
        // V grids retain the Gaussian-envelope gauge choice.
        amp = Math.exp(-0.5 * WDW_G_PREFACTOR * a2)
        dChi = -WDW_G_PREFACTOR * aMin * amp
      } else {
        // V > WDW_HH_SMALL_V_THRESHOLD: full HH formula.
        const arg = 1.0 - a2 * WDW_G_PREFACTOR * V
        if (arg <= 0) {
          // a_min sits past the turning surface — damped tail.
          amp = Math.exp(-0.5 * (phi1 * phi1 + phi2 * phi2))
        } else {
          const Se = (1.0 / (3.0 * V)) * (Math.pow(arg, 1.5) - 1.0)
          // S_E is negative when arg<1 (expanding bounce), so |S_E| = -S_E.
          // exp(-|S_E|) is bounded in (0,1].
          amp = Math.exp(-Math.abs(Se))
          // Decaying-branch WKB derivative: χ' = −|dS_E/da|·χ with
          // |dS_E/da| = K·a·√(1 − K·V·a²).
          dChi = -WDW_G_PREFACTOR * aMin * Math.sqrt(arg) * amp
        }
      }
      setPair(chi, idx, amp, 0)
      setPair(chiDeriv, idx, dChi, 0)
    }
  }
  return { chi, chiDeriv }
}

/**
 * Threshold below which the HH boundary generator uses the small-V
 * Taylor expansion of `S_E` rather than the literal
 * `(arg^{3/2} − 1) / (3·V)` formula. The Taylor expansion gives
 * `S_E(a, φ) = −K·a²/2 − K²·a⁴·V/8 + O(V²)`; the next-order correction
 * is `O(V)`, so at V ~ 1e-6 the amp error is `|K²·a⁴·V/8| ~ 1e-10` at
 * `a = a_min = 0.1` — below f32 mantissa precision. Chosen larger than
 * 1/V's singular region (V ~ 1e-12) to also absorb IEEE-754 rounding
 * noise around V = 0 for the Λ = 0 presets' origin cell.
 *
 * Only the "small-positive-V" path uses this constant; columns with
 * V < 0 fall through the `isAdsCase` branch instead.
 */
const WDW_HH_SMALL_V_THRESHOLD = 1e-6

/**
 * Vilenkin tunneling boundary data.
 *
 * χ(a_min, φ) = A(φ) · exp(+i·a_min³·V(φ)/3) with Gaussian envelope
 * `A(φ) = exp(−½|φ|²)` and a small initial phase `a_min³·V(φ)/3`. The
 * phase value at `a_min` is a global gauge — only the *gradient* picks
 * the in/out branch. The Vilenkin tunneling proposal selects the
 * **outgoing** branch (wave moving in `+a` direction = expanding
 * universe), which corresponds to `χ ∝ e^{+iS} / |U|^{1/4}` in the
 * leading-WKB ansatz.
 *
 * Differentiating the WKB ansatz at `a = a_min` (Lorentzian region,
 * `U < 0`) gives
 *
 *     χ′(a_min) = [ +i · √|U(a_min)|  −  (1 / (4·|U(a_min)|)) · ∂_a|U(a_min)| ] · χ(a_min)
 *
 * Both terms are essential: the `+i·√|U|` term sets the phase
 * direction, and the real `−(∂_a|U|)/(4|U|)` term carries the
 * `|U|^{−1/4}` prefactor's logarithmic derivative. Dropping the
 * prefactor term superposes incoming and outgoing modes with
 * comparable amplitude — at `a_min = 0.05`, `V = 0.5` the prefactor
 * coefficient is `≈ 9.89` vs the phase coefficient `≈ 0.94`, so the
 * resulting standing wave has `|β/α| ≈ 1` instead of the physical
 * Vilenkin `β = 0`.
 *
 * Falls back to the legacy small-`a` expansion `∂_a S = a²·V` when
 * `U(a_min) ≥ 0` (a_min sits inside the Euclidean region — happens for
 * very large `V` columns). In that case there is no Lorentzian outgoing
 * wave to select and Stage-3 Airy connection skips the column anyway.
 *
 * @param input - Grid + physics inputs
 * @returns Complex boundary field with the WKB outgoing-wave gradient.
 */
export function vilenkinBoundary(input: WdwBoundaryInputs): WdwBoundaryField {
  const { Nphi, phiExtent, aMin, mass, lambda } = input
  const asymmetry = input.asymmetry ?? 1
  const chi = allocComplexGrid(Nphi)
  const chiDeriv = allocComplexGrid(Nphi)
  const a3 = aMin * aMin * aMin
  const a2 = aMin * aMin

  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = indexToPhi(i1, Nphi, phiExtent)
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = indexToPhi(i2, Nphi, phiExtent)
      const V = wdwPotential(phi1, phi2, mass, lambda, asymmetry)
      const amp = Math.exp(-0.5 * (phi1 * phi1 + phi2 * phi2))
      const S_L = (a3 * V) / 3.0
      const cosS = Math.cos(S_L)
      const sinS = Math.sin(S_L)
      const idx = i1 * Nphi + i2
      const cre = amp * cosS
      const cim = amp * sinS
      setPair(chi, idx, cre, cim)

      const U0 = wdwU(aMin, phi1, phi2, mass, lambda, asymmetry)
      if (U0 < 0) {
        // Lorentzian: full WKB outgoing-wave derivative.
        //   ∂_a U = −2·c_U·a·(1 − 2·K·V·a²)
        //   ∂_a|U| = −∂_a U  (since U < 0).
        //   prefactor coefficient = −(1/(4·|U|))·∂_a|U|
        const dUda = -2 * WDW_C_U * aMin * (1 - 2 * WDW_G_PREFACTOR * V * a2)
        const absU = -U0
        const phaseRate = Math.sqrt(absU)
        const prefactorRate = -(-dUda) / (4 * absU)
        // χ' = (prefactorRate + i·phaseRate)·χ.
        const dRe = prefactorRate * cre - phaseRate * cim
        const dIm = prefactorRate * cim + phaseRate * cre
        setPair(chiDeriv, idx, dRe, dIm)
      } else {
        // Euclidean a_min: legacy small-a expansion ∂_a S_L = a²·V.
        const dSda = a2 * V
        setPair(chiDeriv, idx, -dSda * cim, dSda * cre)
      }
    }
  }
  return { chi, chiDeriv }
}

/**
 * DeWitt boundary: χ(0, φ) = 0 everywhere, bootstrapped at a_min by a
 * non-trivial Gaussian-in-φ profile scaled by a_min so the a=0 node is
 * explicit and the march has a finite derivative to integrate from.
 *
 * ∂_a χ ≈ χ(a_min)/a_min (linear ramp from 0).
 *
 * @param input - Grid + physics inputs
 * @returns Real boundary field with explicit node at a=0
 */
export function deWittBoundary(input: WdwBoundaryInputs): WdwBoundaryField {
  const { Nphi, phiExtent, aMin } = input
  const chi = allocComplexGrid(Nphi)
  const chiDeriv = allocComplexGrid(Nphi)
  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = indexToPhi(i1, Nphi, phiExtent)
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = indexToPhi(i2, Nphi, phiExtent)
      const idx = i1 * Nphi + i2
      const env = Math.exp(-0.5 * (phi1 * phi1 + phi2 * phi2))
      const amp = aMin * env
      setPair(chi, idx, amp, 0)
      // χ starts from the a=0 node linearly: χ'(a_min) ≈ env (= χ(a_min)/a_min).
      setPair(chiDeriv, idx, env, 0)
    }
  }
  return { chi, chiDeriv }
}

/**
 * Dispatch helper that produces boundary data for the chosen proposal.
 *
 * @param bc - Boundary-condition enum
 * @param input - Grid + physics inputs
 * @returns Initial χ + ∂_a χ on the a=a_min slice
 */
export function buildWdwBoundary(
  bc: 'noBoundary' | 'tunneling' | 'deWitt',
  input: WdwBoundaryInputs
): WdwBoundaryField {
  switch (bc) {
    case 'noBoundary':
      return hartleHawkingBoundary(input)
    case 'tunneling':
      return vilenkinBoundary(input)
    case 'deWitt':
      return deWittBoundary(input)
    default: {
      const exhaustive: never = bc
      throw new Error(`Unknown Wheeler-DeWitt boundary condition: ${String(exhaustive)}`)
    }
  }
}
