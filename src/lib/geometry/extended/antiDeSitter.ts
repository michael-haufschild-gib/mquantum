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
 * HKLL boundary-source mode (Stage 2B).
 *
 *   - `eigenstate`  — derive O(t, Ω) from the current (n, ℓ, m, mL, branch)
 *                     bulk eigenstate's boundary asymptotic. Reconstructing
 *                     via the smearing integral must reproduce the bulk.
 *   - `localized`   — Gaussian spot on the boundary S^{d-2}, width
 *                     `hkllSourceSigma`. Shows a bulk beam emerging from the
 *                     spot.
 *   - `planeWave`   — azimuthal standing wave cos(m_b · φ') on the boundary
 *                     with `hkllPlaneWaveM = m_b`. Shows a bulk m-dependent
 *                     pattern.
 */
export type AdsHkllSource = 'eigenstate' | 'localized' | 'planeWave'

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
   * frame when true. Cleared via `clearComputeNeedsReset('antiDeSitter')`. */
  needsReset: boolean

  // ── Stage 2A: BTZ black-hole thermal state ─────────────────────────────
  /** Activate the BTZ thermal-state code path. Only honoured when `d === 3`;
   * silently ignored at other dimensions so the UI can remember the toggle
   * across dimension changes. */
  btzEnabled: boolean
  /** Outer horizon radius r_+ in AdS-length units (L ≡ 1). Float [0.05, 2]. */
  btzHorizonRadius: number
  /** Scalar mode angular frequency ω in 1/L units. Float [0.1, 10]. */
  btzOmega: number
  /** Azimuthal BTZ m on the S¹. Integer [−5, +5]. */
  btzAngularM: number

  // ── Stage 2B: HKLL bulk-from-boundary reconstruction ────────────────────
  /** Activate the HKLL reconstruction code path. When true, the bulk density
   * is filled by convolving the selected boundary source against the HKLL
   * smearing kernel instead of evaluating the Stage-1 bound state. Mutually
   * exclusive with `btzEnabled` — the setters enforce the invariant. */
  hkllEnabled: boolean
  /** Boundary source profile used by the HKLL convolution. */
  hkllBoundarySource: AdsHkllSource
  /** Gaussian width σ (radians) of the boundary spot in `localized` mode.
   * Float in [0.05, 1.5]. Ignored in other source modes. */
  hkllSourceSigma: number
  /** Azimuthal quantum number m_b of the boundary standing wave in
   * `planeWave` mode. Integer in [0, 8]. Ignored in other source modes. */
  hkllPlaneWaveM: number
}

/**
 * Named preset identifiers. Twenty-two entries covering three stages:
 *
 *   - Stage 1 (bound-state eigenstates): fifteen `adsThree*` / `adsFour*`
 *     / `adsFive*` / `adsSix*` / `adsSeven*` presets spanning the
 *     BF-bound interior, the Klebanov-Witten window, higher-dimensional
 *     SUGRA-like towers, and a tachyonic state for visual contrast.
 *   - Stage 2A (BTZ thermal state): `btzHotSmall` / `btzWarmMedium` /
 *     `btzCoolLarge` — d=3 only, selects r₊, ω, m_A via preset.
 *   - Stage 2B (HKLL bulk-from-boundary reconstruction):
 *     `hkllEigenstateCheck` / `hkllBoundarySpot` / `hkllBoundaryPlaneWave`
 *     — exercises each of the three boundary-source modes.
 *
 * `'custom'` represents any user-edited state that doesn't match a
 * registered preset.
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
  | 'btzHotSmall'
  | 'btzWarmMedium'
  | 'btzCoolLarge'
  | 'hkllEigenstateCheck'
  | 'hkllBoundarySpot'
  | 'hkllBoundaryPlaneWave'
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
  btzEnabled: false,
  btzHorizonRadius: 0.3,
  btzOmega: 1.0,
  btzAngularM: 0,
  hkllEnabled: false,
  hkllBoundarySource: 'eigenstate',
  hkllSourceSigma: 0.3,
  hkllPlaneWaveM: 2,
}
