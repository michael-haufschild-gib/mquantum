/**
 * Riemann Zeta configuration — "Arithmetic Horizon" mode.
 *
 * Renders an N-dimensional volumetric quantum density that demonstrates the
 * prime ⇄ ζ-zero duality (Hilbert–Pólya / explicit formula), driven by a
 * Hagedorn-temperature ignition and a Berry–Keating dilation horizon. The heavy
 * spectral math lives in `src/lib/physics/riemannZeta.ts`; this file is the
 * serializable knob set routed to the renderer via the schroedinger version
 * counter and packed by `packRiemannZeta`.
 */

/** Named preset identifiers for the Riemann Zeta mode. */
export type RiemannZetaPresetName =
  | 'hilbertPolyaShells'
  | 'primonGas'
  | 'hagedornIgnition'
  | 'berryKeatingHorizon'
  | 'arithmeticChaos'
  | 'custom'

/** Which dual construction sources the radial field. */
export type RiemannZetaSource = 'zeros' | 'primes'

/**
 * Serializable Riemann Zeta configuration. Stored on
 * `SchroedingerConfig.riemannZeta`.
 */
export interface RiemannZetaConfig {
  /** Source basis: `zeros` (spectral synthesis) or `primes` (primon gas). */
  source: RiemannZetaSource
  /** Number of ζ zeros Nz used in the spectral synthesis (8…100). */
  numZeros: number
  /** Primon-gas inverse temperature β ∈ [1.01, 3]; → 1⁺ is the Hagedorn point. */
  beta: number
  /** Normalised Berry–Keating horizon radius ∈ [0, 1] (× 0.6·R_bound in world units). */
  horizonRadius: number
  /** Angular momentum ℓ ∈ [0, 4] of the real spherical-harmonic lobe factor. */
  angularL: number
  /** Magnetic number m ∈ [−ℓ, ℓ] (clamped downstream). */
  angularM: number
  /** Self-similar dilation flow rate ∈ [0, 1.5] (render-only). */
  flowRate: number
  /** Cloud emission gain ∈ [0.2, 4]. */
  glow: number
  /** Cutaway wedge (render-only): removes the x₀>0 ∧ x₁>0 quarter so the
   * interior prime shells read as a clean bullseye instead of a veiled onion. */
  cutaway: boolean
  /** Preset identifier for the UI dropdown. `custom` = user-edited state. */
  preset: RiemannZetaPresetName
}

/** Clamp ranges for every numeric RiemannZetaConfig scalar (UI + URL + setters). */
export const RIEMANN_ZETA_RANGES = {
  numZeros: { min: 8, max: 100 },
  beta: { min: 1.01, max: 3 },
  horizonRadius: { min: 0, max: 1 },
  angularL: { min: 0, max: 4 },
  angularM: { min: -4, max: 4 },
  flowRate: { min: 0, max: 1.5 },
  glow: { min: 0.2, max: 4 },
} as const

/**
 * Default Riemann Zeta configuration — matches the `hilbertPolyaShells` preset:
 * prime shells reconstructed from 80 ζ zeros, warm gas, no horizon, ℓ=0.
 */
export const DEFAULT_RIEMANN_ZETA_CONFIG: RiemannZetaConfig = {
  source: 'zeros',
  numZeros: 80,
  beta: 1.4,
  horizonRadius: 0,
  angularL: 0,
  angularM: 0,
  flowRate: 0,
  glow: 1.4,
  cutaway: true,
  preset: 'hilbertPolyaShells',
}

/** One Riemann Zeta scenario preset (config minus the preset tag itself). */
export type RiemannZetaPresetValues = Omit<RiemannZetaConfig, 'preset'>

/**
 * Scenario presets. All are tuned to hold ≥45 fps: the per-sample shader cost is
 * a LUT lookup + an angular factor + a horizon term, independent of Nz (the
 * Σ-over-zeros runs once on the CPU when the LUT is regenerated).
 */
export const RIEMANN_ZETA_PRESETS: Readonly<
  Record<Exclude<RiemannZetaPresetName, 'custom'>, RiemannZetaPresetValues>
> = {
  /** Prime shells reconstructed purely from the ζ zeros — the headline proof. */
  hilbertPolyaShells: {
    source: 'zeros',
    numZeros: 80,
    beta: 1.4,
    horizonRadius: 0,
    angularL: 0,
    angularM: 0,
    flowRate: 0,
    glow: 1.4,
    cutaway: true,
  },
  /** The same shells built forward from the primes (primon / Riemann gas). */
  primonGas: {
    source: 'primes',
    numZeros: 80,
    beta: 1.3,
    horizonRadius: 0,
    angularL: 0,
    angularM: 0,
    flowRate: 0,
    glow: 1.4,
    cutaway: true,
  },
  /** β → Hagedorn: the partition function ignites — an "arithmetic Big Bang". */
  hagedornIgnition: {
    source: 'primes',
    numZeros: 80,
    beta: 1.03,
    horizonRadius: 0,
    angularL: 0,
    angularM: 0,
    flowRate: 0.2,
    glow: 1.6,
    cutaway: false,
  },
  /** Berry–Keating dilation horizon: dark xp core, redshifted streaming shells. */
  berryKeatingHorizon: {
    source: 'zeros',
    numZeros: 90,
    beta: 1.5,
    horizonRadius: 0.32,
    angularL: 0,
    angularM: 0,
    flowRate: 0.7,
    glow: 1.5,
    cutaway: false,
  },
  /** Arithmetic quantum chaos: lobed shells (ℓ=2,m=1) — pair with the GUE panel. */
  arithmeticChaos: {
    source: 'zeros',
    numZeros: 100,
    beta: 1.6,
    horizonRadius: 0.15,
    angularL: 2,
    angularM: 1,
    flowRate: 0.3,
    glow: 1.5,
    cutaway: true,
  },
}

/** Scenario metadata for the unified preset selector. */
export interface RiemannZetaScenario {
  id: Exclude<RiemannZetaPresetName, 'custom'>
  label: string
  description: string
}

/** Ordered scenario list shown in the Scenario dropdown. */
export const RIEMANN_ZETA_SCENARIOS: readonly RiemannZetaScenario[] = [
  {
    id: 'hilbertPolyaShells',
    label: 'Hilbert–Pólya Shells',
    description:
      'Concentric shells at exactly the prime radii (2,3,5,7,…) reconstructed purely from 80 Riemann ζ zeros via the explicit formula — the spectrum of arithmetic made visible.',
  },
  {
    id: 'primonGas',
    label: 'Primon Gas (Forward)',
    description:
      'The same shells built forward from the primes themselves (Julia–Spector primon gas, Z(β)=ζ(β)). Toggle Source against Hilbert–Pólya to see the duality.',
  },
  {
    id: 'hagedornIgnition',
    label: 'Hagedorn Ignition',
    description:
      'β→1⁺: the partition function ζ(β) diverges at the Hagedorn temperature — the gas ignites. The maximal-temperature limit shared by string-gas cosmology and the early universe.',
  },
  {
    id: 'berryKeatingHorizon',
    label: 'Berry–Keating Horizon',
    description:
      'The xp dilation Hamiltonian is the near-horizon Hamiltonian of a black hole: a dark core at r_h, √f redshift, and self-similar streaming of the prime shells across the horizon.',
  },
  {
    id: 'arithmeticChaos',
    label: 'Arithmetic Quantum Chaos',
    description:
      'Lobed shells (ℓ=2) — pair with the Analysis panel: the unfolded ζ zeros obey GUE (Montgomery–Odlyzko), the fingerprint of a chaotic quantum Hamiltonian with broken time-reversal.',
  },
]
