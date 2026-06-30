/**
 * Mode 8 — The Selberg Length Spectrum (`selbergSpectrum`).
 *
 * The Wheeler–DeWitt Laplacian on a hyperbolic surface ℍ/Γ has a genuine
 * Hilbert–Pólya spectrum: it is self-adjoint, so its eigenvalues are REAL by
 * fiat. The Selberg trace formula ties those Laplace eigenvalues to the LENGTHS
 * ℓ_γ of the closed geodesics of the surface — the "primes" of the geometry —
 * just as the explicit formula ties ζ's zeros to the rational primes.
 *
 * The render is a PSEUDOSPHERE (tractricoid: the tractrix x = sech u,
 * z = u − tanh u revolved about z), a funnel of constant negative curvature
 * drawn as a faint translucent scaffold shell, threaded with GLOWING CLOSED
 * GEODESICS — helical bands wrapping the funnel whose pitch and winding are set
 * by a length spectrum {ℓ_n} derived from the Riemann zeros. The geodesics are
 * the bright feature, colored by length (viridis); the surface is faint.
 *
 * "It is a constraint, not a flow": the length spectrum is the fixed,
 * self-adjoint set of geodesic lengths — no time argument, the forced spectrum
 * of the hyperbolic Laplacian.
 *
 * @module lib/geometry/extended/wdwZeta/selbergSpectrum
 */

import type { WdwZetaScenario } from './shared'

/** Named preset identifiers for the Selberg Spectrum mode. */
export type SelbergSpectrumPresetName =
  | 'lengthSpectrum'
  | 'adsDisk'
  | 'pairOfPants'
  | 'primitiveBands'
  | 'bareFunnel'
  | 'hyperFunnel4D'
  | 'custom'

/**
 * Serializable Selberg Spectrum config (stored on
 * `SchroedingerConfig.selbergSpectrum`). Every field reshapes the baked funnel
 * or its geodesics; emission/glow is the shared Advanced control and is NOT here.
 */
export interface SelbergSpectrumConfig {
  /** Number of closed geodesics (helical bands) threaded on the funnel ∈ [3, 24]. */
  geodesicCount: number
  /** Upper cutoff on geodesic length ℓ (longer geodesics dropped) ∈ [2, 12]. */
  lengthCutoff: number
  /** Pseudosphere shell brightness/opacity (0 = invisible scaffold) ∈ [0, 1]. */
  surfaceOpacity: number
  /** Hyperbolic surface ∈ {0,1,2}: 0 = pseudosphere funnel, 1 = AdS catenoid throat, 2 = pair-of-pants neck. */
  funnelMode: number
  /** Geodesic winding gain ∈ [0.5, 3]: density of the trace-formula oscillation winding the surface. */
  windingGain: number
  /** Preset identifier; `custom` = user-edited. */
  preset: SelbergSpectrumPresetName
}

/** Clamp ranges for every numeric SelbergSpectrumConfig scalar. */
export const SELBERG_SPECTRUM_RANGES = {
  geodesicCount: { min: 3, max: 24 },
  lengthCutoff: { min: 2, max: 12 },
  surfaceOpacity: { min: 0, max: 1 },
  funnelMode: { min: 0, max: 2 },
  windingGain: { min: 0.5, max: 3 },
} as const

/** Default config — matches the `lengthSpectrum` preset. */
export const DEFAULT_SELBERG_SPECTRUM_CONFIG: SelbergSpectrumConfig = {
  geodesicCount: 12,
  lengthCutoff: 8,
  surfaceOpacity: 0.22,
  funnelMode: 0,
  windingGain: 1.0,
  preset: 'lengthSpectrum',
}

/** One Selberg Spectrum scenario (config minus the preset tag). */
export type SelbergSpectrumPresetValues = Omit<SelbergSpectrumConfig, 'preset'>

/** Scenario presets (≥ 2 required). */
export const SELBERG_SPECTRUM_PRESETS: Readonly<
  Record<Exclude<SelbergSpectrumPresetName, 'custom'>, SelbergSpectrumPresetValues>
> = {
  /** The full spectrum: a dozen geodesics over a faint translucent funnel. */
  lengthSpectrum: {
    geodesicCount: 12,
    lengthCutoff: 8,
    surfaceOpacity: 0.22,
    funnelMode: 0,
    windingGain: 1.0,
  },
  /** The AdS catenoid throat: a minimal-surface wormhole neck threaded with geodesics. */
  adsDisk: {
    geodesicCount: 14,
    lengthCutoff: 9,
    surfaceOpacity: 0.3,
    funnelMode: 1,
    windingGain: 1.4,
  },
  /** A pair-of-pants neck: the genus-2 building block, a hyperboloid of one sheet. */
  pairOfPants: {
    geodesicCount: 16,
    lengthCutoff: 9,
    surfaceOpacity: 0.28,
    funnelMode: 2,
    windingGain: 1.2,
  },
  /** A few short primitive geodesics — the shortest closed orbits, bright. */
  primitiveBands: {
    geodesicCount: 6,
    lengthCutoff: 4,
    surfaceOpacity: 0.16,
    funnelMode: 0,
    windingGain: 0.8,
  },
  /** A dense spectrum on a near-invisible shell: spiraling light, no scaffold. */
  bareFunnel: {
    geodesicCount: 22,
    lengthCutoff: 11,
    surfaceOpacity: 0.05,
    funnelMode: 0,
    windingGain: 2.2,
  },
  /** 4D hyper-funnel (dimension 4): the pseudosphere revolved through a 3-space. */
  hyperFunnel4D: {
    geodesicCount: 14,
    lengthCutoff: 9,
    surfaceOpacity: 0.26,
    funnelMode: 0,
    windingGain: 1.2,
  },
}

/** Ordered scenario list for the shared ScenarioSelector. */
export const SELBERG_SPECTRUM_SCENARIOS: readonly WdwZetaScenario<
  Exclude<SelbergSpectrumPresetName, 'custom'>
>[] = [
  {
    id: 'lengthSpectrum',
    label: 'Length Spectrum',
    description:
      'A dozen closed geodesics threaded on the pseudosphere — helical light-bands whose pitch is set by the Selberg length spectrum {ℓ_n} (read off the Riemann ordinates). The Wheeler–DeWitt Laplacian on this hyperbolic funnel is self-adjoint, so its eigenvalues are real by construction: a genuine Hilbert–Pólya operator, with the geodesic lengths playing the role of the primes.',
  },
  {
    id: 'adsDisk',
    label: 'AdS Catenoid',
    description:
      'The same self-adjoint length spectrum threaded on an AdS catenoid throat — a minimal surface of revolution R(y) = cosh(y), the hyperbolic wormhole neck of anti-de Sitter geometry. The geodesics wind the flaring throat instead of the funnel; the Hilbert–Pólya operator is the same, but its surface is the AdS-Rindler neck rather than the tractricoid.',
  },
  {
    id: 'pairOfPants',
    label: 'Pair of Pants',
    description:
      'The length spectrum on a pair-of-pants neck — a hyperboloid of one sheet, the genus-2 building block from which every hyperbolic surface is glued. Narrow at the waist, flaring at both ends; the closed geodesics wrap the neck as the primitive orbits that the Selberg trace formula sums into the Laplace spectrum.',
  },
  {
    id: 'primitiveBands',
    label: 'Primitive Bands',
    description:
      'Only the shortest closed geodesics — the primitive orbits, the "small primes" of the surface — wrap the funnel as a few bright bands. The length cutoff is low (ℓ ≤ 4), so the trace formula is dominated by these primitive lengths, exactly as the prime-counting sum is dominated by 2, 3, 5.',
  },
  {
    id: 'bareFunnel',
    label: 'Bare Funnel',
    description:
      'The pseudosphere shell faded almost to nothing, threaded with a dense spectrum of geodesics: spiraling light hanging in space in the constant-negative-curvature shape of the funnel. The eye reads the hyperbolic geometry purely from how the closed orbits wind — the length spectrum drawn without its surface.',
  },
  {
    id: 'hyperFunnel4D',
    label: 'Geodesic Torus-Knot (4D)',
    description:
      'The closed geodesics of ℍ/Γ lift to the unit tangent bundle — a 3-manifold — and in 4D the hyperbolic funnel curls into a horn torus threaded by a (2,3) torus-knot of glowing geodesic light. The Selberg length spectrum, drawn not as bands on a funnel but as a single knotted thread winding the torus the way a closed geodesic winds the surface. Rotate the Z–W plane to wind the knot. Opens at dimension 4.',
    dimension: 4,
    rotation: { ZW: 0.65 },
  },
]
