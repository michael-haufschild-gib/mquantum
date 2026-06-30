/**
 * Bifurcation Horizon configuration — the Riemann critical strip as the
 * maximally-extended (Kruskal) eternal black hole.
 *
 * The critical line Re s = ½ is the Einstein–Rosen-bridge / bifurcation
 * surface; the functional-equation involution s ↦ 1 − s̄ is the Tomita modular
 * conjugation J (the wedge reflection); and the ζ-zeros are the spectrum pinned
 * to the throat. The heavy ζ-zero / membrane math lives in
 * `src/lib/physics/bifurcationHorizon.ts`; this file is the serializable knob
 * set routed to the renderer via the schroedinger version counter and packed by
 * `packBifurcationHorizon`.
 *
 * @module lib/geometry/extended/bifurcationHorizon
 */

/** Named preset identifiers for the Bifurcation Horizon mode. */
export type BifurcationHorizonPresetName =
  | 'eternalThroat'
  | 'modularFlow'
  | 'nearExtremal'
  | 'wedgeMirror'
  | 'spectralRigidity'
  | 'custom'

/**
 * Spectral-dynamics mode for the living ζ-zero log-gas.
 *
 *  - `static`   — rings frozen at their γ_n heights (the legacy LUT; zero
 *                 per-frame work). The default, so opting out costs nothing.
 *  - `softMode`  — the rings breathe in the marginal soft mode of the
 *                 transverse-rigidity Laplacian M: ringOffsets[n] ∝ mode[n]·sin(ωt)
 *                 with ω set by √λ₁(M). λ₁ → 0 ~ N⁻¹ ⇒ the breathing is nearly
 *                 free — the type-II₁ no-margin gaplessness made visible.
 *  - `dyson`     — a damped Dyson Coulomb-gas relaxation: rings repel via the
 *                 1/r force and relax toward equilibrium without ever crossing
 *                 (level repulsion / reality-from-Hermiticity).
 */
export type BifurcationSpectralDynamics = 'static' | 'softMode' | 'dyson'

/**
 * Serializable Bifurcation Horizon configuration. Stored on
 * `SchroedingerConfig.bifurcationHorizon`.
 */
export interface BifurcationHorizonConfig {
  /** Neck radius factor r₀ ∈ [0.05, 0.6] (× R_bound): the bifurcation surface. */
  neckRadius: number
  /** Throat-membrane Gaussian half-width ∈ [0.05, 0.6] (bifurcation-surface glow). */
  throatWidth: number
  /** Cloud emission gain ∈ [0.2, 4]. */
  glow: number
  /** Modular dilation flow rate ∈ [0, 1.5] (render-only; cyclic shift in u). */
  flowRate: number
  /** Azimuthal swirl ∈ [0, 2] (render-only; rotates the wedge hue with time). */
  swirl: number
  /** Extremal redshift radius ∈ [0, 1] (× R_bound); 0 disables the dark core. */
  redshiftRadius: number
  /** Off-line ring displacement ∈ [0, 0.6] in u (reserved; 0 = RH on-line case). */
  offLine: number
  /** Phase winding along the throat ∈ [0, 4]. */
  winding: number
  /** KMS thermal-wedge haze gain ∈ [0, 2] (faint atmosphere filling the wedges). */
  thermalGain: number
  /** Living-log-gas dynamics mode (the ζ-zero rings as a breathing Coulomb gas). */
  spectralDynamics: BifurcationSpectralDynamics
  /** Breathing/relaxation amplitude ∈ [0, 1] (per-ring Δt scale in t-units). */
  dynamicsAmplitude: number
  /** Breathing/relaxation rate ∈ [0, 3] (×√λ₁(M) for softMode; ×force for dyson). */
  dynamicsRate: number
  /** Stiffness tint ∈ [0, 1]: mixes ring amplitude toward normalised K_i so
   *  transverse-stiffer rings glow brighter (0 = uniform, 1 = full tint). */
  stiffnessTint: number
  /** Preset identifier for the UI dropdown. `custom` = user-edited state. */
  preset: BifurcationHorizonPresetName
}

/** Clamp ranges for every numeric BifurcationHorizonConfig scalar (UI + URL + setters). */
export const BIFURCATION_HORIZON_RANGES = {
  neckRadius: { min: 0.05, max: 0.6 },
  throatWidth: { min: 0.05, max: 0.6 },
  glow: { min: 0.2, max: 4 },
  flowRate: { min: 0, max: 1.5 },
  swirl: { min: 0, max: 2 },
  redshiftRadius: { min: 0, max: 1 },
  offLine: { min: 0, max: 0.6 },
  winding: { min: 0, max: 4 },
  thermalGain: { min: 0, max: 2 },
  dynamicsAmplitude: { min: 0, max: 1 },
  dynamicsRate: { min: 0, max: 3 },
  stiffnessTint: { min: 0, max: 1 },
} as const

/**
 * Default Bifurcation Horizon configuration — matches the `eternalThroat`
 * preset: an on-line (RH-case) glowing ERB throat with sharp GUE-spaced
 * ζ-zero rings, two faint thermal wedges, no extremal core, no flow.
 */
export const DEFAULT_BIFURCATION_HORIZON_CONFIG: BifurcationHorizonConfig = {
  neckRadius: 0.22,
  throatWidth: 0.18,
  glow: 1.4,
  flowRate: 0,
  swirl: 0,
  redshiftRadius: 0,
  offLine: 0,
  winding: 0.5,
  thermalGain: 0.35,
  spectralDynamics: 'static',
  dynamicsAmplitude: 0.4,
  dynamicsRate: 1,
  stiffnessTint: 0.4,
  preset: 'eternalThroat',
}

/** One Bifurcation Horizon scenario preset (config minus the preset tag itself). */
export type BifurcationHorizonPresetValues = Omit<BifurcationHorizonConfig, 'preset'>

/**
 * Scenario presets. All are tuned to hold ≥45 fps: the per-sample shader cost is
 * a bilinear LUT lookup + a flow shift + an optional redshift, independent of
 * the ζ-zero count (the Σ-over-zeros runs once on the CPU when the LUT is built).
 */
export const BIFURCATION_HORIZON_PRESETS: Readonly<
  Record<Exclude<BifurcationHorizonPresetName, 'custom'>, BifurcationHorizonPresetValues>
> = {
  /** The eternal ERB throat at rest: on-line rings, faint wedges, no flow. */
  eternalThroat: {
    neckRadius: 0.22,
    throatWidth: 0.18,
    glow: 1.4,
    flowRate: 0,
    swirl: 0,
    redshiftRadius: 0,
    offLine: 0,
    winding: 0.5,
    thermalGain: 0.35,
    spectralDynamics: 'static',
    dynamicsAmplitude: 0.4,
    dynamicsRate: 1,
    stiffnessTint: 0.4,
  },
  /** Tomita modular flow: the wedge dilation streams the rings along the throat. */
  modularFlow: {
    neckRadius: 0.22,
    throatWidth: 0.16,
    glow: 1.5,
    flowRate: 0.6,
    swirl: 0.4,
    redshiftRadius: 0,
    offLine: 0,
    winding: 1.0,
    thermalGain: 0.45,
    spectralDynamics: 'static',
    dynamicsAmplitude: 0.4,
    dynamicsRate: 1,
    stiffnessTint: 0.4,
  },
  /** Near-extremal: a dark captured core at r_h with √f-redshifted wedges. */
  nearExtremal: {
    neckRadius: 0.2,
    throatWidth: 0.16,
    glow: 1.6,
    flowRate: 0.3,
    swirl: 0.2,
    redshiftRadius: 0.45,
    offLine: 0,
    winding: 0.8,
    thermalGain: 0.6,
    spectralDynamics: 'static',
    dynamicsAmplitude: 0.4,
    dynamicsRate: 1,
    stiffnessTint: 0.4,
  },
  /** Wedge mirror: rings displaced off the throat — the broken-symmetry (¬RH) view. */
  wedgeMirror: {
    neckRadius: 0.24,
    throatWidth: 0.2,
    glow: 1.4,
    flowRate: 0.15,
    swirl: 0.6,
    redshiftRadius: 0,
    offLine: 0.35,
    winding: 1.2,
    thermalGain: 0.5,
    spectralDynamics: 'static',
    dynamicsAmplitude: 0.4,
    dynamicsRate: 1,
    stiffnessTint: 0.4,
  },
  /**
   * Spectral rigidity: the rings come alive and breathe in the marginal soft
   * mode of the log-gas transverse-rigidity Laplacian M. Because λ₁(M) → 0 ~
   * N⁻¹, the breathing is slow and nearly free — the type-II₁ "no-margin"
   * gaplessness that Object X must carry, invisible in the naked list of zeros.
   */
  spectralRigidity: {
    neckRadius: 0.22,
    throatWidth: 0.18,
    glow: 1.5,
    flowRate: 0,
    swirl: 0,
    redshiftRadius: 0,
    offLine: 0,
    winding: 0.5,
    thermalGain: 0.35,
    spectralDynamics: 'softMode',
    dynamicsAmplitude: 0.5,
    dynamicsRate: 1,
    stiffnessTint: 0.6,
  },
}

/** Scenario metadata for the unified preset selector. */
export interface BifurcationHorizonScenario {
  id: Exclude<BifurcationHorizonPresetName, 'custom'>
  label: string
  description: string
}

/** Ordered scenario list shown in the Scenario dropdown. */
export const BIFURCATION_HORIZON_SCENARIOS: readonly BifurcationHorizonScenario[] = [
  {
    id: 'eternalThroat',
    label: 'Eternal Throat',
    description:
      'The Riemann critical strip as the two-sided eternal black hole: the critical line Re s = ½ is the Einstein–Rosen-bridge throat, and the ζ-zeros are GUE-spaced rings pinned to it. The two Kruskal wedges flare symmetrically (the RH on-line case).',
  },
  {
    id: 'modularFlow',
    label: 'Modular Flow (Tomita)',
    description:
      'Tomita–Takesaki modular flow: the wedge dilation that the modular Hamiltonian generates streams the ζ-zero rings along the throat. The boost is a translation in the wedge coordinate u = log(rPerp/r₀).',
  },
  {
    id: 'nearExtremal',
    label: 'Near-Extremal Core',
    description:
      'A dark captured core at the extremal radius r_h, with emission dimmed by the Tangherlini redshift √f = √(1 − (r_h/rPerp)^(d−2)) — the two funnels deepen into the throat as they cool.',
  },
  {
    id: 'wedgeMirror',
    label: 'Wedge Mirror (¬RH)',
    description:
      'The functional-equation involution s ↦ 1 − s̄ is the Tomita modular conjugation J — the wedge reflection u ↦ −u. Displacing the rings off the throat breaks the mirror symmetry: the off-line (Riemann-hypothesis-violating) view.',
  },
  {
    id: 'spectralRigidity',
    label: 'Spectral Rigidity (type-II₁)',
    description:
      'The static rings come alive as a Coulomb log-gas and breathe in the marginal soft mode of the transverse-rigidity Laplacian M. Its smallest nonzero eigenvalue λ₁(M) → 0 ~ N⁻¹ is the marginal 1/r² hydrodynamic mode — the type-II₁ "no-margin" gaplessness Object X must possess, a property invisible in the naked list of zeros.',
  },
]
