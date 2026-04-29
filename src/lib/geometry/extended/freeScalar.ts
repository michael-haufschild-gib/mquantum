/**
 * Free scalar field (Klein-Gordon) type definitions.
 *
 * Config interface, k-space visualization types, and default constants
 * for the real scalar field lattice simulation.
 */

import type { KasnerExponents } from '@/lib/physics/cosmology/bianchiKasner'
import type { CosmologyPreset } from '@/lib/physics/cosmology/presets'

// ============================================================================
// Field View & Initial Conditions
// ============================================================================

/**
 * Which field quantity to visualize for the free scalar field mode
 * - phi: Field amplitude
 * - pi: Conjugate momentum (time derivative of phi)
 * - energyDensity: Local energy density (kinetic + gradient + mass)
 * - wallDensity: Self-interaction potential V(phi) — highlights domain walls (zero at vacua)
 * - freezeOutStrain: Bounded proxy for cosmological mode freeze-out / phase-space squeezing
 * - equationOfState: Local scalar-field pressure ratio w = p/rho from stress-energy trace
 */
export type FreeScalarFieldView =
  | 'phi'
  | 'pi'
  | 'energyDensity'
  | 'wallDensity'
  | 'freezeOutStrain'
  | 'equationOfState'

/**
 * Initial condition type for the free scalar field
 * - vacuumNoise: Hash-based pseudo-random Gaussian noise
 * - singleMode: Single plane-wave mode A*cos(k.x)
 * - gaussianPacket: Gaussian wave packet A*exp(-|x-x0|^2/(2*sigma^2))*cos(k.x)
 * - kinkProfile: Domain wall kink phi = v*tanh((x-x0)/w) for self-interaction potential
 */
export type FreeScalarInitialCondition =
  | 'vacuumNoise'
  | 'singleMode'
  | 'gaussianPacket'
  | 'kinkProfile'

// ============================================================================
// k-Space Visualization Config
// ============================================================================

/** How k-space data is projected to the 3D display volume. */
export type KSpaceDisplayMode = 'raw3d' | 'radial3d'

/** Exposure transfer function for k-space occupation mapping. */
export type KSpaceExposureMode = 'none' | 'linear' | 'log'

/**
 * Display-only transforms applied to k-space occupation data before GPU upload.
 * These do not affect the underlying physics — only how n_k values are visualized.
 */
export interface KSpaceVizConfig {
  /** Display projection mode */
  displayMode: KSpaceDisplayMode
  /** Whether to apply FFT shift (center low |k| in the volume) */
  fftShiftEnabled: boolean
  /** Exposure transfer function */
  exposureMode: KSpaceExposureMode
  /** Low percentile cutoff for exposure windowing [0, 99] */
  lowPercentile: number
  /** High percentile cutoff for exposure windowing [1, 100] */
  highPercentile: number
  /** Gamma correction exponent [0.1, 3.0] */
  gamma: number
  /** Whether to apply Gaussian broadening (display-only smoothing) */
  broadeningEnabled: boolean
  /** Half-width of broadening kernel in voxels [1, 5] */
  broadeningRadius: number
  /** Sigma of Gaussian broadening kernel [0.5, 3.0] */
  broadeningSigma: number
  /** Number of radial bins for radial3d mode [16, 128] */
  radialBinCount: number
}

/** Default k-space visualization config — log exposure + FFT shift + mild broadening. */
export const DEFAULT_KSPACE_VIZ: KSpaceVizConfig = {
  displayMode: 'raw3d',
  fftShiftEnabled: true,
  exposureMode: 'log',
  lowPercentile: 0,
  highPercentile: 99.5,
  gamma: 1.0,
  broadeningEnabled: true,
  broadeningRadius: 2,
  broadeningSigma: 1.0,
  radialBinCount: 32,
}

/** Passthrough config — no transforms, identical to pre-refactor behavior. */
export const PASSTHROUGH_KSPACE_VIZ: KSpaceVizConfig = {
  displayMode: 'raw3d',
  fftShiftEnabled: false,
  exposureMode: 'none',
  lowPercentile: 0,
  highPercentile: 100,
  gamma: 1.0,
  broadeningEnabled: false,
  broadeningRadius: 1,
  broadeningSigma: 1.0,
  radialBinCount: 32,
}

// ============================================================================
// Cosmological Background (canonical δφ integrator)
// ============================================================================

/**
 * Cosmological FLRW background sub-config for the Free Scalar Field pass.
 *
 * When `enabled = true`, the simulation remains in the canonical perturbation
 * variables already used by the Minkowski path: `(phi, pi)` store the scalar
 * field perturbation `δφ` and its conjugate momentum `π_δφ`. The integrator
 * picks up three time-dependent coefficients derived from the selected
 * `preset`:
 *
 *     drift: dδφ/dη = aKinetic · π_δφ                          (a^(−(n−2)))
 *     kick:  dπ_δφ/dη = aPotential · ∇²δφ − m²·aFull·δφ − aFull·V'(δφ)
 *
 * with `aKinetic = a^(−(n−2))`, `aPotential = a^(n−2)`, `aFull = a^n`. These
 * collapse to `(1, 1, 1)` under Minkowski, so the cosmology path is
 * bit-identical to the disabled path in the trivial regime.
 *
 * **No Mukhanov-Sasaki variable.** Earlier drafts re-expressed the state as
 * `v = a^((n−2)/2)·δφ` with an effective mass `M²_eff(η) = a²m² − z''/z`.
 * The shipped integrator does NOT do that — UI labels, analysis panels, and
 * tooling should treat `(phi, pi)` as the bare `(δφ, π_δφ)` variables under
 * every preset. See `docs/adr/010-fsf-cosmology-late-time-integrator.md` and
 * `src/lib/physics/cosmology/` for the derivation of the `(aKinetic,
 * aPotential, aFull)` coefficients.
 *
 * ## Invariants enforced by the store + UI
 *
 * 1. **Spacetime-dim window.** The background is physically defined only for
 *    `n_spacetime ∈ [3, 7]`, i.e. `latticeDim ∈ [2, 6]`. Going outside this
 *    window force-disables cosmology with a logger warning (see
 *    `reconcileCosmologyInvariants`).
 *
 * 2. **Mutual exclusion with self-interaction.** Cosmology is modelled only
 *    for the free-field path in v1. Enabling cosmology forces
 *    `selfInteractionEnabled = false`; enabling self-interaction forces
 *    `cosmology.enabled = false`. The mutex is lifted in v2 once the kink/
 *    φ⁴ nonlinearities have been re-validated under the δφ integrator.
 *
 * 3. **Non-zero `eta0`.** The power-law scale factor `a(η) = A·|η|^q`
 *    diverges at `η = 0` for every non-Minkowski preset, so `eta0 ≠ 0` is
 *    required. The store setter rejects zero silently; the runtime clamps
 *    `|simEta| ≥ COSMOLOGY_ETA_FLOOR` so the cosmological clock never
 *    crosses the singularity.
 *
 * 4. **Safe `eta0` heuristic.** `clampEta0` raises user-provided `|η₀|`
 *    above `DEFAULT_SAFE_ETA0` to stop the simulation from starting
 *    trivially close to the singularity. Under the δφ formulation the
 *    adiabatic vacuum is well-defined at any non-zero `η₀`, so this is a
 *    UX guardrail, not a physical constraint.
 *
 * 5. **Canonical variable contract.** The lattice always stores the bare
 *    `(δφ, π_δφ)` variables — there is no re-interpretation under
 *    cosmology. Field-view labels read `δφ`, `π`, and `ε` (proper energy
 *    density `ρ = H_canonical / a^n`) in both Minkowski and non-Minkowski
 *    regimes. The `reconcileCosmologyInvariants` helper will soft-disable
 *    cosmology if the preset parameters become invalid (`isValidPreset`
 *    false) or `clampEta0` throws.
 */
export interface CosmologyConfig {
  /** Master toggle. When false, the FSF pass runs in Minkowski mode. */
  enabled: boolean
  /** Which FLRW background regime to evolve on. */
  preset: CosmologyPreset
  /**
   * Paper's potential steepness `s`. Only consulted for the ekpyrotic preset;
   * must satisfy `s > s_c(n)` where `s_c(n) = √(8(n-1)/(n-2))`.
   */
  steepness: number
  /**
   * Hubble rate `H` for the de Sitter preset. Sets `a(η) = -1/(Hη)`.
   * Must be strictly positive.
   */
  hubble: number
  /**
   * Initial conformal time `η₀` at which the adiabatic Bunch-Davies vacuum
   * is sampled. Use `η < 0` (deep past) for the isotropic FLRW presets; the
   * Bianchi-I vacuum Kasner preset uses `η > 0` (conformal time grows
   * forward from the singularity). The only hard requirement is
   * `η₀ ≠ 0` — the power-law scale factor is singular there. Under the
   * canonical δφ integrator the adiabatic vacuum is well-defined at any
   * non-zero `η₀` since `m²·a²` is always non-negative for real `m`, so
   * the old Mukhanov-Sasaki `|η₀|² · k_min² ≥ safety · |z''/z|(η₀)`
   * super-horizon-tachyon guard is gone.
   *
   * The store still runs the user's value through `clampEta0` on every
   * cosmology/lattice edit, but `clampEta0` now just raises `|η₀|` above a
   * fixed `DEFAULT_SAFE_ETA0` UX floor — it does not encode any physical
   * rejection.
   */
  eta0: number
  /**
   * Bianchi-I Kasner exponent triple `(p₁, p₂, p₃)`. Only consulted when
   * `preset === 'bianchiKasner'`; ignored (but preserved through
   * serialization) for every other preset. Default to the canonical
   * symmetric vacuum `(−1/3, 2/3, 2/3)` on fresh scenes so the sliders
   * land on a physically well-defined starting point.
   */
  kasnerExponents?: KasnerExponents
  /**
   * LQC critical density `ρ_c > 0`. Only consulted when
   * `preset === 'lqcBounce'`; preserved through serialization for all
   * other presets. Defaults to `1.0` in sim units — the scale at which
   * the LQC bounce occurs in the default `n = 4`, stiff-fluid regime.
   */
  lqcRhoCritical?: number
  /**
   * LQC matter equation-of-state `w ∈ [0, 1]`. Only consulted when
   * `preset === 'lqcBounce'`; default `1.0` (stiff fluid, equivalent to
   * a massless scalar in its kinetic-dominated regime) admits the
   * closed-form analytic solution used as the test oracle.
   */
  lqcEquationOfState?: number
  /**
   * LQC starting `ρ/ρ_c` ratio at the pre-bounce window edge, `(0, 1)`.
   * Only consulted when `preset === 'lqcBounce'`. Small values (e.g.
   * `0.01`) mean the integration window extends deep into the Kasner
   * asymptote before turning around at the bounce.
   */
  lqcInitialRhoRatio?: number
}

/**
 * Default cosmology sub-config: disabled, with sensible defaults for each
 * preset so that flipping the toggle yields an immediately runnable state.
 */
export const DEFAULT_COSMOLOGY_CONFIG: CosmologyConfig = {
  enabled: false,
  preset: 'deSitter',
  steepness: 5, // > s_c(4) ≈ 3.464 — valid ekpyrotic default
  hubble: 1,
  eta0: -10,
  kasnerExponents: { p1: -1 / 3, p2: 2 / 3, p3: 2 / 3 },
  lqcRhoCritical: 1.0,
  lqcEquationOfState: 1.0,
  lqcInitialRhoRatio: 0.01,
}

// ============================================================================
// Parametric Resonance (Post-Inflation Preheating)
// ============================================================================

/**
 * Time-periodic effective-mass drive for the Free Scalar Field, implementing
 * the canonical post-inflation preheating mechanism:
 *
 *     m²_eff(η) = m₀² · (1 + A · sin(Ω · (η − η_ref)))
 *
 * Under this drive each lattice mode evolves according to the Mathieu
 * equation  δφ̈_k + (k² + m₀²(1 + A sin Ωη))·δφ_k = 0, exhibiting exponential
 * parametric amplification inside the Floquet instability tongues. The first
 * tongue sits at `Ω = 2·ω_k` with growth exponent `μ_k ≈ A·m₀²/(4·ω_k)` —
 * the mechanism by which an inflaton condensate dumps its energy into light
 * matter fields after inflation ends.
 *
 * Mechanically the drive is a single `f32` multiplicative factor
 * (`massSquaredScale`) injected into the pi-update shader's `massCoef`
 * calculation: `massCoef = m² · aFull · massSquaredScale`. With
 * `massSquaredScale ≡ 1` this is a no-op, so the preheating path composes
 * multiplicatively with every other branch (cosmology on/off,
 * self-interaction, Minkowski) without a mutex.
 *
 * See `@/lib/physics/cosmology/preheating` for the CPU reference
 * implementation and the tests that anchor the first- and second-tongue
 * growth-rate measurements.
 */
export interface PreheatingConfig {
  /** Master toggle. When false, the pi-update uses the bare mass term. */
  enabled: boolean
  /**
   * Drive amplitude `A ∈ [0, 1]`. Larger values push the system further into
   * the non-linear regime of the first instability tongue and eventually
   * into backreaction-dominated resonance broadening.
   */
  amplitude: number
  /**
   * Drive angular frequency `Ω ∈ [0.1, 10]`. Resonance condition for the
   * first tongue at wavenumber `k` is `Ω = 2·√(k² + m₀²)`, i.e. `Ω = 2·m₀`
   * for the `k = 0` mode.
   */
  frequency: number
}

/**
 * Default preheating sub-config: disabled, with an amplitude and drive
 * frequency that land on the first instability tongue for the default
 * `mass = 1.0` so the user can flip the master toggle and immediately
 * observe parametric amplification of the zero mode.
 */
export const DEFAULT_PREHEATING_CONFIG: PreheatingConfig = {
  enabled: false,
  amplitude: 0.3,
  frequency: 2.0,
}

// ============================================================================
// Free Scalar Config
// ============================================================================

/**
 * Configuration for the free scalar field (Klein-Gordon) lattice simulation.
 * Controls lattice geometry, physics parameters, initial conditions, and visualization.
 */
export interface FreeScalarConfig {
  /** Spatial dimensionality of the lattice (3-6), enforced by the quantum type registry */
  latticeDim: number
  /** Lattice grid size per dimension — length equals latticeDim */
  gridSize: number[]
  /** Lattice spacing per dimension — length equals latticeDim */
  spacing: number[]
  /** Klein-Gordon mass parameter m */
  mass: number
  /** Leapfrog time step */
  dt: number
  /** Number of leapfrog steps per render frame (1-16) */
  stepsPerFrame: number

  /** Initial condition type */
  initialCondition: FreeScalarInitialCondition
  /** Gaussian packet center position — length equals latticeDim */
  packetCenter: number[]
  /** Gaussian packet width (sigma) */
  packetWidth: number
  /** Gaussian packet / single-mode amplitude */
  packetAmplitude: number
  /** Wave vector indices for single-mode / packet carrier — length equals latticeDim */
  modeK: number[]
  /** Seed for deterministic vacuum state sampling */
  vacuumSeed: number

  /** Which field quantity to render */
  fieldView: FreeScalarFieldView
  /** Auto-scale density normalization from field maximum */
  autoScale: boolean
  /** Runtime flag to trigger field re-initialization (not persisted) */
  needsReset: boolean

  /** Slice positions for extra dimensions (d>3) — length equals max(0, latticeDim - 3) */
  slicePositions: number[]

  /** Display-only transforms for k-space occupation visualization */
  kSpaceViz: KSpaceVizConfig

  // === Self-Interaction Potential (Mexican hat: V(phi) = lambda*(phi^2 - v^2)^2) ===
  /** Enable self-interaction potential V(phi) = lambda*(phi^2 - v^2)^2 */
  selfInteractionEnabled: boolean
  /** Self-interaction coupling constant lambda */
  selfInteractionLambda: number
  /** Vacuum expectation value v (field minima at phi = +/-v) */
  selfInteractionVev: number

  // === Absorber (PML) ===
  /** Enable absorbing boundary (PML) — prevents periodic wrap-around */
  absorberEnabled: boolean
  /** PML layer width (fraction of grid per side) */
  absorberWidth: number
  /** Target round-trip reflection coefficient for PML */
  pmlTargetReflection: number

  // === Diagnostics ===
  /** Enable diagnostic readback (norm, energy, field statistics) */
  diagnosticsEnabled: boolean
  /** Diagnostic computation interval in frames */
  diagnosticsInterval: number

  // === Cosmological Background (canonical δφ integrator on FLRW) ===
  /**
   * FLRW background sub-config. When `cosmology.enabled` is true, the
   * physical perturbation `δφ` is evolved directly via the canonical
   * Hamiltonian
   *
   *     H = ½ aKinetic · π² + ½ aPotential · |∇δφ|² + ½ m² · aFull · δφ²
   *
   * with time-dependent coefficients `(aKinetic, aPotential, aFull) =
   * (a^(-(n-2)), a^(n-2), a^n)` and the physical dispersion
   * `ω² = k² + m²·a²` (bounded as η → 0⁻ for any finite mass). The
   * abandoned Mukhanov-Sasaki bridge, which carried a coordinate pole
   * `z''/z = β(β−1)/η²` that drove the leapfrog CFL condition unstable
   * at late times, is no longer used — see
   * `@/lib/physics/cosmology/background` for the derivation.
   *
   * Mutually exclusive with `selfInteractionEnabled` in v1.
   */
  cosmology: CosmologyConfig

  // === Parametric Resonance (Post-Inflation Preheating) ===
  /**
   * Time-periodic effective-mass drive. When enabled the pi-update injects
   * a `massSquaredScale(η) = 1 + A·sin(Ω·(η−η_ref))` factor on the mass
   * term, turning each mode's equation into the Mathieu equation and
   * enabling exponential parametric amplification inside the Floquet
   * instability tongues. Composes multiplicatively with cosmology and
   * self-interaction — no mutex.
   */
  preheating: PreheatingConfig
}

/**
 * Default configuration for the free scalar field lattice simulation
 */
export const DEFAULT_FREE_SCALAR_CONFIG: FreeScalarConfig = {
  latticeDim: 3,
  gridSize: [32, 32, 32],
  spacing: [0.1, 0.1, 0.1],
  mass: 1.0,
  dt: 0.01,
  stepsPerFrame: 4,

  initialCondition: 'gaussianPacket',
  packetCenter: [0, 0, 0],
  packetWidth: 0.3,
  packetAmplitude: 1.0,
  modeK: [1, 0, 0],
  vacuumSeed: 42,

  fieldView: 'phi',
  autoScale: false,
  needsReset: false,
  slicePositions: [],
  kSpaceViz: { ...DEFAULT_KSPACE_VIZ },
  selfInteractionEnabled: false,
  selfInteractionLambda: 0.5,
  selfInteractionVev: 1.0,
  absorberEnabled: true,
  absorberWidth: 0.2,
  pmlTargetReflection: 1e-6,
  diagnosticsEnabled: false,
  diagnosticsInterval: 10,
  cosmology: {
    ...DEFAULT_COSMOLOGY_CONFIG,
    kasnerExponents: DEFAULT_COSMOLOGY_CONFIG.kasnerExponents
      ? { ...DEFAULT_COSMOLOGY_CONFIG.kasnerExponents }
      : undefined,
  },
  preheating: { ...DEFAULT_PREHEATING_CONFIG },
}
