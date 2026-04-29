/**
 * Color Palette Type Definitions
 *
 * Shared types for the unified color palette system.
 * Used by both shaders and UI components.
 *
 */

import type { DiracFieldView } from '@/lib/geometry/extended/dirac'
import type { FreeScalarInitialCondition } from '@/lib/geometry/extended/freeScalar'
import type { PauliFieldView } from '@/lib/geometry/extended/pauli'
import type { SchroedingerRepresentation } from '@/lib/geometry/extended/schroedinger'
import type { ObjectType } from '@/lib/geometry/types'

// ============================================================================
// Color Algorithm System
// ============================================================================

/**
 * Color algorithm selection.
 * Determines how the color palette is generated.
 *
 * - lch: Perceptually uniform LCH/Oklab color space
 * - multiSource: Blend multiple value sources for complex coloring
 * - radial: Color based on 3D distance from origin (spherical gradient)
 * - phaseCyclicUniform: Perceptually uniform cyclic phase map for arg(ψ)
 * - phaseDiverging: Signed diverging palette (Re(ψ) sign proxy)
 * - diverging: Zero-centered diverging map for Re(ψ) or Im(ψ)
 * - domainColoringPsi: Domain coloring for wavefunction phase + modulus
 * - relativePhase: Relative phase map hue=arg(conj(ψ_ref)*ψ), lightness≈|ψ|²
 */

/** Identifier for a color mapping algorithm applied to wavefunction density or phase. */
export type ColorAlgorithm =
  | 'lch'
  | 'multiSource'
  | 'radial'
  | 'phase'
  | 'mixed'
  | 'phaseCyclicUniform'
  | 'phaseDiverging'
  | 'diverging'
  | 'domainColoringPsi'
  | 'relativePhase'
  | 'blackbody'
  | 'radialDistance'
  | 'hamiltonianDecomposition'
  | 'modeCharacter'
  | 'energyFlux'
  | 'kSpaceOccupation'
  | 'purityMap'
  | 'entropyMap'
  | 'coherenceMap'
  | 'viridis'
  | 'inferno'
  | 'densityContours'
  | 'phaseDensity'
  | 'particleAntiparticle'
  | 'pauliSpinDensity'
  | 'pauliSpinExpectation'
  | 'pauliCoherence'
  | 'quantumPotential'
  | 'vortexDensity'

/**
 * Options for the Color Algorithm dropdown in the UI.
 */
export const COLOR_ALGORITHM_OPTIONS = [
  { value: 'lch' as const, label: 'LCH Perceptual' },
  { value: 'multiSource' as const, label: 'Multi-Source' },
  { value: 'radial' as const, label: 'Radial (from center)' },
  { value: 'phase' as const, label: 'Angular (XZ Rotation)' },
  { value: 'mixed' as const, label: 'Angular + Depth' },
  { value: 'phaseCyclicUniform' as const, label: 'Phase Cyclic Uniform' },
  { value: 'phaseDiverging' as const, label: 'Signed Phase Diverging' },
  { value: 'diverging' as const, label: 'Diverging (Re/Im)' },
  { value: 'domainColoringPsi' as const, label: 'Domain Coloring Psi' },
  { value: 'relativePhase' as const, label: 'Relative Phase (ref)' },
  { value: 'blackbody' as const, label: 'Blackbody (Heat)' },
  { value: 'radialDistance' as const, label: 'Radial Distance (Spectral)' },
  { value: 'hamiltonianDecomposition' as const, label: 'Hamiltonian Decomposition' },
  { value: 'modeCharacter' as const, label: 'Mode Character Map' },
  { value: 'energyFlux' as const, label: 'Energy Flux Map' },
  { value: 'kSpaceOccupation' as const, label: 'k-Space Occupation Map' },
  { value: 'purityMap' as const, label: 'Purity Map (Open Quantum)' },
  { value: 'entropyMap' as const, label: 'Entropy Map (Open Quantum)' },
  { value: 'coherenceMap' as const, label: 'Coherence Map (Open Quantum)' },
  { value: 'viridis' as const, label: 'Viridis' },
  { value: 'inferno' as const, label: 'Inferno' },
  { value: 'densityContours' as const, label: 'Density Contours' },
  { value: 'phaseDensity' as const, label: 'Phase-Density Composite' },
  { value: 'particleAntiparticle' as const, label: 'Upper / Lower Spinor' },
  { value: 'pauliSpinDensity' as const, label: 'Spin Density (↑ Cyan / ↓ Magenta)' },
  { value: 'pauliSpinExpectation' as const, label: 'Spin Expectation ⟨σ_z⟩' },
  { value: 'pauliCoherence' as const, label: 'Spinor Coherence' },
  { value: 'quantumPotential' as const, label: 'Quantum Potential Q(x) (Bohmian)' },
  { value: 'vortexDensity' as const, label: 'Vortex Density (topological charge)' },
] as const

/**
 * Map from ColorAlgorithm string to integer for shader uniform.
 */
export const COLOR_ALGORITHM_TO_INT: Record<ColorAlgorithm, number> = {
  lch: 0,
  multiSource: 1,
  radial: 2,
  phase: 3,
  mixed: 4,
  blackbody: 5,
  phaseCyclicUniform: 6,
  phaseDiverging: 7,
  domainColoringPsi: 8,
  diverging: 9,
  relativePhase: 10,
  radialDistance: 11,
  hamiltonianDecomposition: 12,
  modeCharacter: 13,
  energyFlux: 14,
  kSpaceOccupation: 15,
  purityMap: 16,
  entropyMap: 17,
  coherenceMap: 18,
  viridis: 19,
  inferno: 20,
  densityContours: 21,
  phaseDensity: 22,
  particleAntiparticle: 23,
  pauliSpinDensity: 24,
  pauliSpinExpectation: 25,
  pauliCoherence: 26,
  quantumPotential: 27,
  vortexDensity: 28,
}

/**
 * Cosine palette coefficients for the Inigo Quilez technique.
 * Formula: color = a + b * cos(2π * (c * t + d))
 *
 * Each array represents [R, G, B] components.
 */
export interface CosineCoefficients {
  /** Base offset - shifts the entire palette */
  a: [number, number, number]
  /** Amplitude - controls color intensity range */
  b: [number, number, number]
  /** Frequency - how many color cycles */
  c: [number, number, number]
  /** Phase - shifts colors along the gradient */
  d: [number, number, number]
}

/**
 * Distribution controls for remapping the input value (t).
 * Applied before palette lookup to shape color distribution.
 */
export interface DistributionSettings {
  /** Power curve exponent (0.25-4.0). <1 expands darks, >1 expands lights */
  power: number
  /** Number of palette cycles (0.5-5.0). >1 repeats the gradient */
  cycles: number
  /** Offset shift (0.0-1.0). Slides the gradient start point */
  offset: number
}

/** Modulus source for domain coloring: log of probability density or log of amplitude. */
export type DomainColoringModulusMode = 'logPsiAbsSquared' | 'logPsiAbs'

/** Configuration for domain coloring visualization with optional contour lines. */
export interface DomainColoringSettings {
  /** Log modulus source: log(|psi|^2) or log(|psi|) */
  modulusMode: DomainColoringModulusMode
  /** Toggle anti-aliased contour lines in log-modulus space */
  contoursEnabled: boolean
  /** Number of contour periods in the normalized log-modulus range */
  contourDensity: number
  /** Contour half-width in normalized line-distance space */
  contourWidth: number
  /** Blend strength for contour darkening */
  contourStrength: number
}

/** Three-color diverging palette driven by the sign of cos(phase). */
export interface PhaseDivergingSettings {
  /** Center color pinned at cos(phase) = 0 crossings. */
  neutralColor: string
  /** Positive wing color for cos(phase) > 0. */
  positiveColor: string
  /** Negative wing color for cos(phase) < 0. */
  negativeColor: string
}

/** Three-color diverging palette for signed real or imaginary wavefunction components. */
export interface DivergingPsiSettings {
  /** Center color pinned at zero crossing. */
  neutralColor: string
  /** Positive wing color for signed values > 0. */
  positiveColor: string
  /** Negative wing color for signed values < 0. */
  negativeColor: string
  /** Intensity floor applied before sign-strength modulation. */
  intensityFloor: number
  /** Which wavefunction component to extract: 'real' = Re(psi), 'imag' = Im(psi). */
  component: 'real' | 'imag'
}

/**
 * Default cosine coefficients (Crimson Fade - smooth red to pink gradient).
 * Uses half-cycle frequency for smooth, non-rainbow gradients.
 */
export const DEFAULT_COSINE_COEFFICIENTS: CosineCoefficients = {
  a: [0.6, 0.2, 0.3],
  b: [0.4, 0.3, 0.3],
  c: [0.5, 0.5, 0.5],
  d: [0.0, 0.0, 0.0],
}

/**
 * Default distribution settings (no transformation).
 */
export const DEFAULT_DISTRIBUTION: DistributionSettings = {
  power: 1.0,
  cycles: 1.0,
  offset: 0.0,
}

/**
 * Default domain-coloring controls.
 */
export const DEFAULT_DOMAIN_COLORING_SETTINGS: DomainColoringSettings = {
  modulusMode: 'logPsiAbsSquared',
  contoursEnabled: true,
  contourDensity: 8.0,
  contourWidth: 0.08,
  contourStrength: 0.45,
}

export const DEFAULT_PHASE_DIVERGING_SETTINGS: PhaseDivergingSettings = {
  neutralColor: '#ebebeb',
  positiveColor: '#eb3d38',
  negativeColor: '#3866f2',
}

export const DEFAULT_DIVERGING_PSI_SETTINGS: DivergingPsiSettings = {
  neutralColor: '#d9d9d9',
  positiveColor: '#e83b3b',
  negativeColor: '#3166f5',
  intensityFloor: 0.2,
  component: 'real',
}

/** Map Pauli field view to matching color algorithm for synchronized rendering. */
export const PAULI_FIELD_VIEW_TO_COLOR_ALGO: Record<PauliFieldView, ColorAlgorithm> = {
  spinDensity: 'pauliSpinDensity',
  totalDensity: 'blackbody',
  spinExpectation: 'pauliSpinExpectation',
  coherence: 'pauliCoherence',
  spinHelicity: 'blackbody',
  berryCurvature: 'blackbody',
}

/** Map Dirac field view to matching color algorithm for synchronized rendering. */
export const DIRAC_FIELD_VIEW_TO_COLOR_ALGO: Record<DiracFieldView, ColorAlgorithm> = {
  totalDensity: 'blackbody',
  particleDensity: 'blackbody',
  antiparticleDensity: 'blackbody',
  particleAntiparticleSplit: 'particleAntiparticle',
  spinDensity: 'blackbody',
  currentDensity: 'blackbody',
  phase: 'phaseCyclicUniform',
  axialCharge: 'blackbody',
}

/**
 * Default color algorithm for new sessions.
 */
export const DEFAULT_COLOR_ALGORITHM: ColorAlgorithm = 'radialDistance'

/**
 * Pipeline-shape hints used by `getAvailableColorAlgorithms` to decide whether
 * density-grid-only color algorithms (e.g. Bohmian `quantumPotential` or
 * plaquette `vortexDensity`) can actually run. The fragment shader reads those
 * helpers from a bound density grid texture; the grid is only populated in 3D+
 * non-isosurface non-Wigner volumetric rendering for analytic HO / hydrogenND
 * modes. When `isosurface` is on, `representation === 'wigner'`, or dimension
 * is 2, the grid is absent and the helper returns 0 everywhere — so the
 * dropdown must hide those algorithms.
 *
 * Defaults match the common 3D volumetric path so existing call sites keep
 * their prior behaviour.
 */
export interface ColorAlgorithmAvailabilityOptions {
  /** Current dimension (2-11). Density grid requires dim >= 3. */
  dimension?: number
  /** Isosurface rendering toggle. Isosurface analytic modes skip the grid. */
  isosurface?: boolean
  /**
   * Current representation. 'wigner' uses a 2D phase-space path with no grid.
   * Narrowed from `string` so typos (e.g. `'Wigner'`) cannot silently bypass
   * the `analyticHasDensityGrid` check.
   */
  representation?: SchroedingerRepresentation
}

/**
 * Returns the color algorithm options available for the given quantum mode.
 *
 * The 'relativePhase' algorithm requires a reference wavefunction
 * (arg(conj(psi_ref) * psi)), which does not exist for classical field modes.
 * All other algorithms work because sign-as-phase encoding provides meaningful
 * positive/negative coloring.
 *
 * @param quantumMode - Current quantum mode
 * @returns Filtered array of color algorithm options
 */
export function getAvailableColorAlgorithms(
  quantumMode: string,
  openQuantumEnabled: boolean = false,
  objectType: ObjectType = 'schroedinger',
  freeScalarInitialCondition?: FreeScalarInitialCondition,
  availabilityOptions?: ColorAlgorithmAvailabilityOptions
): readonly (typeof COLOR_ALGORITHM_OPTIONS)[number][] {
  // Pauli spinor: the density grid encodes spin-channel data differently per
  // field view. Expose the Pauli-specific algorithms (which match the grid layout)
  // plus standard density-only algorithms for the totalDensity field view.
  if (objectType === 'pauliSpinor') {
    const pauliValidAlgos = new Set<string>([
      'pauliSpinDensity',
      'pauliSpinExpectation',
      'pauliCoherence',
      'blackbody',
      'viridis',
      'inferno',
      'densityContours',
    ])
    return COLOR_ALGORITHM_OPTIONS.filter((opt) => pauliValidAlgos.has(opt.value))
  }

  // Educational analysis algorithms — only available for free scalar field
  const educationalAlgos = new Set<string>([
    'hamiltonianDecomposition',
    'modeCharacter',
    'energyFlux',
    'kSpaceOccupation',
  ])

  // Density-grid-only algorithms — require a bound/populated density grid
  // texture. The grid is provided by compute modes (tdseDynamics, becDynamics,
  // diracEquation, freeScalarField, quantumWalk) unconditionally, and by
  // AnalyticModeStrategy (harmonicOscillator, hydrogenND) whenever
  // `dim >= 3 && !isosurface && representation !== 'wigner'`. In any other
  // analytic configuration no texture is bound and the WGSL helper returns 0
  // everywhere, so the dropdown hides these algorithms via `analyticHasDensityGrid`
  // below.
  const densityGridOnlyAlgos = new Set<string>(['quantumPotential', 'vortexDensity'])

  // Open quantum algorithms — only available when density matrix mode is active
  const openQuantumAlgos = new Set<string>(['purityMap', 'entropyMap', 'coherenceMap'])

  // TDSE / BEC compute modes render into a density grid texture
  // (R=density, G=logDensity, B=phase, A=potOverlay). Only algorithms that read
  // from the grid's R/B channels produce meaningful coloring. Geometric algorithms
  // (lch, radial, multiSource, radialDistance, phase, mixed) color by world-space
  // position and silently fall back to blackbody — remove them from the dropdown.
  // Quantum walk: domainColoringPsi and phaseDensity produce black output
  // due to hsl2rgb rendering incorrectly in the QW grid-only pipeline.
  // Other HSL-free algorithms work correctly.
  if (quantumMode === 'quantumWalk') {
    const qwValidAlgos = new Set<string>([
      'blackbody', // R (density) → heat ramp
      'phaseCyclicUniform', // B (phase) → perceptual cyclic hue
      'phaseDiverging', // B (phase) → signed diverging
      'diverging', // B (phase) → zero-centered Re/Im
      'viridis', // R (density) → perceptually uniform scientific ramp
      'inferno', // R (density) → high-contrast scientific ramp
      'densityContours', // R (density) → viridis + isodensity contour lines
      'quantumPotential', // Bohmian Q(x) = -½·∇²R/R from density grid
      'vortexDensity', // Topological charge from plaquette phase winding
    ])
    return COLOR_ALGORITHM_OPTIONS.filter((opt) => qwValidAlgos.has(opt.value))
  }

  if (quantumMode === 'tdseDynamics' || quantumMode === 'becDynamics') {
    const computeValidAlgos = new Set<string>([
      'blackbody', // R (density) → heat ramp
      'phaseCyclicUniform', // B (phase) → perceptual cyclic hue
      'phaseDiverging', // B (phase) → signed diverging
      'diverging', // B (phase) → zero-centered Re/Im
      'domainColoringPsi', // R+B (density + phase) → domain coloring
      'viridis', // R (density) → perceptually uniform scientific ramp
      'inferno', // R (density) → high-contrast scientific ramp
      'densityContours', // R (density) → viridis + isodensity contour lines
      'phaseDensity', // R+B (density + phase) → hue=phase, brightness=density
      'quantumPotential', // Bohmian Q(x) = -½·∇²R/R from density grid
      'vortexDensity', // Topological charge from plaquette phase winding
    ])
    return COLOR_ALGORITHM_OPTIONS.filter((opt) => computeValidAlgos.has(opt.value))
  }

  // Dirac equation: same density grid channels as TDSE, plus particleAntiparticle
  // which reads R=upper spinor, G=lower spinor from the dual-channel field view.
  if (quantumMode === 'diracEquation') {
    const computeValidAlgos = new Set<string>([
      'blackbody',
      'phaseCyclicUniform',
      'phaseDiverging',
      'diverging',
      'domainColoringPsi',
      'viridis',
      'inferno',
      'densityContours',
      'phaseDensity',
      'particleAntiparticle',
      'quantumPotential', // Bohmian Q(x) = -½·∇²R/R from dual-channel density grid
      'vortexDensity', // Topological charge from dual-channel plaquette phase winding
    ])
    return COLOR_ALGORITHM_OPTIONS.filter((opt) => computeValidAlgos.has(opt.value))
  }

  if (quantumMode === 'freeScalarField') {
    // Free scalar has sign-proxy phase (0 or π) — exclude continuous-phase algorithms.
    // Also include educational analysis algorithms unique to this mode.
    //
    // Note: quantumPotential and vortexDensity are intentionally excluded here.
    // Free scalar field is a CLASSICAL field theory with no wavefunction ψ, so
    // the Bohmian quantum potential Q = -½·∇²√ρ/√ρ has no physical meaning in
    // this mode. The write-grid shader also populates the R channel from the
    // selected fieldView (phi, pi, energyDensity, wallDensity, freezeOutStrain, equationOfState) rather than a
    // density, and stores a sign-proxy (0 or π) in the phase channel, so the
    // plaquette vortex-winding helper cannot recover U(1) topological charges
    // even in principle. Availability for these algorithms is restricted to
    // genuine quantum modes (TDSE, BEC, Dirac, QW, analytic HO / hydrogen).
    const computeValidAlgos = new Set<string>([
      'blackbody',
      'phaseDiverging',
      'diverging',
      'viridis',
      'inferno',
      'densityContours',
      'hamiltonianDecomposition',
      'modeCharacter',
      'energyFlux',
      'kSpaceOccupation',
    ])
    // Exact vacuum has n_k = 0 for all modes (zero-point subtracted), so the
    // k-space occupation map is correctly but unhelpfully blank.
    if (freeScalarInitialCondition === 'vacuumNoise') {
      computeValidAlgos.delete('kSpaceOccupation')
    }
    return COLOR_ALGORITHM_OPTIONS.filter((opt) => computeValidAlgos.has(opt.value))
  }

  // Phase-dependent algorithms — meaningless in density matrix mode because the
  // grid's B channel stores coherenceFraction (0-1), not complex phase (0-2π).
  // Interpreting coherenceFraction as phase produces misleading colors.
  //
  // vortexDensity also belongs here: the plaquette phase-winding helper reads
  // the B channel expecting a continuous spatial phase. In the analytic open-
  // quantum path the B channel stores coherenceFraction, so the wrapped-phase
  // differences around each plaquette become coherence differences and the
  // resulting "topological charge" is physically meaningless.
  const phaseDependentAlgos = new Set<string>([
    'phase',
    'mixed',
    'phaseCyclicUniform',
    'phaseDiverging',
    'domainColoringPsi',
    'diverging',
    'relativePhase',
    'vortexDensity',
  ])

  // Wheeler–DeWitt: the density grid packs streamline overlay intensity into
  // the A channel, NOT a relative-phase observable. The shader's relativePhase
  // branch reads A, so selecting it would colorize the WKB overlay as if it
  // were arg(conj(ψ_ref)·ψ) and produce nonsense. Exclude here rather than
  // branching inside the shader.
  const wdwExcludedAlgos =
    quantumMode === 'wheelerDeWitt' ? new Set<string>(['relativePhase']) : new Set<string>()

  // Dirac-only algorithms — require spinor field data not present in other modes
  const diracOnlyAlgos = new Set<string>(['particleAntiparticle'])

  // Pauli-only algorithms — require spin-resolved density grid, only valid for pauliSpinor object type
  const pauliOnlyAlgos = new Set<string>([
    'pauliSpinDensity',
    'pauliSpinExpectation',
    'pauliCoherence',
  ])

  // Density-grid-only algos (quantumPotential, vortexDensity) need a bound
  // density grid texture. For analytic HO / hydrogenND the grid is populated
  // by DensityGridComputePass when dimension >= 3, isosurface is off, and the
  // representation is not Wigner (Wigner uses a 2D phase-space path). In that
  // configuration the shader helper reads real density values and the feature
  // is physically meaningful. Otherwise the dropdown hides them because the
  // fallback stub returns 0 everywhere.
  const dim = availabilityOptions?.dimension ?? 3
  const isosurface = availabilityOptions?.isosurface ?? false
  const representation = availabilityOptions?.representation
  const analyticHasDensityGrid = dim >= 3 && !isosurface && representation !== 'wigner'

  // Non-freeScalar modes: exclude educational analysis algorithms, Dirac-only,
  // density-grid-only (unless a density grid is actually bound), and conditionally
  // include/exclude open quantum and phase-dependent algorithms
  return COLOR_ALGORITHM_OPTIONS.filter(
    (opt) =>
      !educationalAlgos.has(opt.value) &&
      !diracOnlyAlgos.has(opt.value) &&
      !pauliOnlyAlgos.has(opt.value) &&
      !wdwExcludedAlgos.has(opt.value) &&
      (!densityGridOnlyAlgos.has(opt.value) || analyticHasDensityGrid) &&
      (!openQuantumAlgos.has(opt.value) || openQuantumEnabled) &&
      (!phaseDependentAlgos.has(opt.value) || !openQuantumEnabled)
  )
}

/**
 * Full color preset including algorithm and distribution settings.
 *
 * Lives in this types module (rather than presets.ts) so `builtInPresets.ts`
 * can reference the shape without importing presets.ts — that hub imports
 * builtInPresets.ts back, which would form a structural cycle.
 */
export interface ColorPreset {
  id: string
  name: string
  algorithm: ColorAlgorithm
  coefficients: CosineCoefficients
  distribution: DistributionSettings
  isBuiltIn: boolean
}

/**
 * Multi-source weight configuration for blending different value sources.
 */
export interface MultiSourceWeights {
  /** Weight for depth/iteration value */
  depth: number
  /** Weight for orbit trap / secondary color source value */
  orbitTrap: number
  /** Weight for normal direction */
  normal: number
}

/**
 * Default multi-source weights.
 */
export const DEFAULT_MULTI_SOURCE_WEIGHTS: MultiSourceWeights = {
  depth: 0.5,
  orbitTrap: 0.3,
  normal: 0.2,
}

// ============================================================================
// LCH Preset System
// ============================================================================

/**
 * LCH preset configuration with lightness and chroma values.
 */
export interface LchPreset {
  value: string
  label: string
  lightness: number
  chroma: number
}

/**
 * Built-in LCH presets for perceptually uniform coloring.
 */
export const LCH_PRESET_OPTIONS: LchPreset[] = [
  { value: 'vibrant', label: 'Vibrant', lightness: 0.7, chroma: 0.15 },
  { value: 'pastel', label: 'Pastel', lightness: 0.85, chroma: 0.08 },
  { value: 'deep', label: 'Deep', lightness: 0.5, chroma: 0.2 },
  { value: 'muted', label: 'Muted', lightness: 0.65, chroma: 0.06 },
  { value: 'neon', label: 'Neon', lightness: 0.75, chroma: 0.25 },
  { value: 'earth', label: 'Earth Tones', lightness: 0.55, chroma: 0.1 },
  { value: 'candy', label: 'Candy', lightness: 0.8, chroma: 0.18 },
  { value: 'jewel', label: 'Jewel Tones', lightness: 0.45, chroma: 0.22 },
]
