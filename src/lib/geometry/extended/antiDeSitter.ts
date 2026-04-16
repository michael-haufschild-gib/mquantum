/**
 * Anti-de Sitter bound-state configuration (Stage 1).
 *
 * The AdS mode renders bulk scalar eigenstates of the free Klein-Gordon
 * equation on global AdS_d (d ∈ [3, 7]) compactified to a unit Poincaré
 * ball (r = tan(ρ/2), ρ ∈ [0, π/2)). The state is labelled by integer
 * quantum numbers (n, ℓ, m) and a mass parameter mL that determines the
 * conformal dimension Δ_± = (d−1)/2 ± √((d−1)²/4 + m²L²).
 *
 * Two quantization branches are exposed:
 *   - `standard`  — Δ_+, always valid above the Breitenlohner-Freedman bound.
 *   - `alternate` — Δ_−, valid only in the Klebanov-Witten window
 *                   −(d−1)²/4 < m²L² < −(d−1)²/4 + 1. Outside this window
 *                   the renderer silently falls back to Δ_+.
 *
 * Below the BF bound (m²L² < −(d−1)²/4) the state becomes tachyonic: the
 * time factor changes from e^{−iEt} to a real exponential e^{|γ|·t}. The
 * UI flags this with a red chip. Stage 1 renders only the spatial envelope.
 *
 * All Stage-2 features (BTZ, HKLL, dS/CFT, backreaction, Chern-Simons) are
 * intentionally absent and marked with `TODO(Stage2):` comments at the
 * corresponding extension points.
 */

/**
 * Quantization branch selector. `standard` is the physical Δ_+ quantization
 * that always exists; `alternate` is the Klebanov-Witten Δ_− quantization
 * that only exists inside the KW window.
 */
export type AdsQuantizationBranch = 'standard' | 'alternate'

/**
 * Serializable AdS bound-state configuration. Values are stored on
 * `SchroedingerConfig.antiDeSitter` and routed to the strategy through the
 * schroedinger version counter.
 */
export interface AntiDeSitterConfig {
  /** Spacetime boundary dimension d (AdS_d). Integer in [3, 7]. */
  d: number
  /** Radial quantum number n ≥ 0. Integer in [0, 4]. */
  n: number
  /** Angular momentum ℓ ≥ 0. Integer in [0, 3]. */
  l: number
  /** Azimuthal / magnetic quantum number m. Integer in [-l, +l]. */
  m: number
  /** Mass parameter mL (bulk mass × AdS radius). Float in [-3, 3] with
   * soft lower bound −((d−1)/2 + 0.5) enforced by the setter clamp in the
   * UI — values below the BF bound are allowed and flagged as tachyonic. */
  mL: number
  /** Quantization branch (Δ_+ vs Δ_−). Silently falls back to standard
   * when the KW window constraint is violated. */
  branch: AdsQuantizationBranch
  /** Render the asymptotic boundary primary |O|² = |ψ|²·cos^{-2Δ}(ρ) on a
   * thin shell r ∈ [0.975, 0.995]. Off by default. */
  boundaryOverlay: boolean
  /** Preset identifier for UI dropdown. `custom` = user-edited state. */
  preset: AdsPresetName
  /** Runtime dirty flag — strategy re-packs the density texture on the next
   * frame when true. Cleared via `clearAdsNeedsReset`. */
  needsReset: boolean
}

/**
 * Named preset identifiers. Fifteen curated states covering the BF-bound
 * interior, the Klebanov-Witten window, higher-dimensional SUGRA-like
 * towers, and a tachyonic state for visual contrast.
 */
export type AdsPresetName =
  | 'adsFourGround'
  | 'adsFourConformal'
  | 'adsFourDipole'
  | 'adsFourQuadrupole'
  | 'adsFourRadialExcited'
  | 'adsFourMixed'
  | 'adsThreeGround'
  | 'adsThreeAlternate'
  | 'adsThreeTachyon'
  | 'adsFiveSUGRA'
  | 'adsFiveKKTower'
  | 'adsSixHigh'
  | 'adsSevenSUGRA'
  | 'adsFourHeavyPrimary'
  | 'adsFourCosineNode'
  | 'custom'

/**
 * Default AdS configuration — d=4 ground-state massless scalar (Δ=3, E=3).
 * Matches the `adsFourGround` preset so the first visit to the mode lines
 * up with the user-visible preset dropdown selection.
 */
export const DEFAULT_ANTI_DE_SITTER_CONFIG: AntiDeSitterConfig = {
  d: 4,
  n: 0,
  l: 0,
  m: 0,
  mL: 0,
  branch: 'standard',
  boundaryOverlay: false,
  preset: 'adsFourGround',
  needsReset: true,
}
