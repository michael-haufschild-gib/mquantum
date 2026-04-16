/**
 * Metric type definitions for curved-space TDSE.
 *
 * Defines the supported metric kinds, the config object consumed by the
 * curved-kinetic path, and bounds used by downstream clamping.
 *
 * Physics references cited inline per kind. Conventions follow
 * Wald §2–3 (General Relativity) and Carroll §3 (Spacetime & Geometry).
 *
 * @module lib/physics/tdse/metrics/types
 */

/**
 * Supported spatial metric kinds for the TDSE kinetic operator.
 *
 * - `flat`: g_μν = δ_μν. Split-step FFT path applies.
 * - `morrisThorne`: Morris–Thorne wormhole throat in proper-distance coords,
 *   axis 0 = l, transverse axes share radius r(l) = √(b₀²+l²).
 *   (Morris & Thorne, Am. J. Phys. 56, 395 (1988).)
 * - `schwarzschild`: Schwarzschild vacuum in isotropic coordinates,
 *   conformally flat: g_ij = ψ⁴ δ_ij, ψ = 1 + M/(2r). (Wald §6.)
 * - `deSitter`: spatially flat FRW with exponential scale factor
 *   a(t)=exp(H·t). g_ij = a² δ_ij. Time-dependent. (Carroll §8.)
 * - `antiDeSitter`: Poincaré half-space chart, g_ij = (L/z)² δ_ij with
 *   z = axis 0 > 0. (Carroll §8.)
 * - `sphere2D`: 2-sphere metric on axes (θ,φ) = (1,2); requires latticeDim ≥ 3.
 *   (Carroll §3.7.)
 * - `torus`: flat metric, periodic boundaries handled by the integrator.
 * - `doubleThroat`: two Morris–Thorne-like throats separated along axis 0.
 */
export type MetricKind =
  | 'flat'
  | 'morrisThorne'
  | 'schwarzschild'
  | 'deSitter'
  | 'antiDeSitter'
  | 'sphere2D'
  | 'torus'
  | 'doubleThroat'

/**
 * Configuration object for the spatial metric consumed by the
 * Laplace–Beltrami kinetic path. All non-`kind` fields are optional and
 * only consulted when the corresponding `kind` is active.
 */
export interface MetricConfig {
  /** Metric variant — determines how the kinetic operator is discretized. */
  kind: MetricKind
  /** Morris–Thorne throat radius b₀ (>0). Used by `morrisThorne` and as fallback for `doubleThroat`. */
  throatRadius?: number
  /** Schwarzschild mass M (geometrized units, G=c=1); isotropic coords. */
  schwarzschildMass?: number
  /** de Sitter Hubble rate H; scale factor a(t) = exp(H·t). */
  hubbleRate?: number
  /** AdS radius L; g_ij = (L/z)² δ_ij on Poincaré half-space (axis 0 = z). */
  adsRadius?: number
  /** 2-sphere radius R on axes (θ,φ) = (1,2). */
  sphereRadius?: number
  /** Torus periodic lengths per axis (world-coord period). */
  torusPeriod?: [number, number, number]
  /** Double-throat: distance between the two throats along axis 0. */
  doubleThroatSeparation?: number
  /** Double-throat: shared throat radius (falls back to `throatRadius`). */
  doubleThroatRadius?: number
}

/**
 * A point-sampled metric: inverse metric diagonal and volume element.
 */
export interface MetricSample {
  /** g^μμ diagonal (inverse metric). Length equals latticeDim. */
  gInverseDiag: number[]
  /** √|g| at the point. */
  sqrtDet: number
}

/** Default metric — flat, used when no override is supplied. */
export const DEFAULT_METRIC_CONFIG: MetricConfig = { kind: 'flat' }

// ── Clamp bounds ─────────────────────────────────────────────────────────

/** Minimum allowed Morris–Thorne throat radius b₀. */
export const MIN_THROAT_RADIUS = 0.1
/** Maximum allowed Morris–Thorne throat radius b₀. */
export const MAX_THROAT_RADIUS = 5.0

/** Minimum Schwarzschild mass M (geometrized). */
export const MIN_SCHWARZSCHILD_MASS = 0.01
/** Maximum Schwarzschild mass M (geometrized). */
export const MAX_SCHWARZSCHILD_MASS = 10.0

/** Minimum Hubble rate H (H=0 ⇒ static flat space). */
export const MIN_HUBBLE_RATE = 0
/** Maximum Hubble rate H. */
export const MAX_HUBBLE_RATE = 5

/** Minimum AdS radius L. */
export const MIN_ADS_RADIUS = 0.1
/** Maximum AdS radius L. */
export const MAX_ADS_RADIUS = 10

/** Minimum 2-sphere radius R. */
export const MIN_SPHERE_RADIUS = 0.1
/** Maximum 2-sphere radius R. */
export const MAX_SPHERE_RADIUS = 10

/** Minimum torus period along any axis. */
export const MIN_TORUS_PERIOD = 0.5
/** Maximum torus period along any axis. */
export const MAX_TORUS_PERIOD = 20

/** Minimum double-throat separation (between the two throats). */
export const MIN_DOUBLE_THROAT_SEPARATION = 0.2
/** Maximum double-throat separation. */
export const MAX_DOUBLE_THROAT_SEPARATION = 20

/**
 * Returns true iff the metric kind has explicit time dependence.
 * Currently only `deSitter` (a(t) = exp(H·t)).
 */
export function isTimeDependentMetric(kind: MetricKind): boolean {
  return kind === 'deSitter'
}

/**
 * Returns true iff the metric kind imposes periodic boundary conditions on
 * the spatial lattice. Currently only `torus`.
 */
export function hasPeriodicBoundary(kind: MetricKind): boolean {
  return kind === 'torus'
}

/**
 * Human-readable label and compact line-element formula for UI/diagnostics.
 */
export function describeMetric(cfg: MetricConfig): { label: string; formula: string } {
  switch (cfg.kind) {
    case 'flat':
      return { label: 'Flat (Minkowski spatial slice)', formula: 'ds² = δ_ij dxⁱ dxʲ' }
    case 'morrisThorne':
      return {
        label: 'Morris–Thorne Wormhole',
        formula: 'ds² = dl² + r(l)² dΩ²,  r(l) = √(b₀² + l²)',
      }
    case 'schwarzschild':
      return {
        label: 'Schwarzschild (isotropic)',
        formula: 'ds² = ψ⁴ δ_ij dxⁱ dxʲ,  ψ = 1 + M/(2r)',
      }
    case 'deSitter':
      return {
        label: 'de Sitter (flat FRW)',
        formula: 'ds² = a(t)² δ_ij dxⁱ dxʲ,  a(t) = exp(H·t)',
      }
    case 'antiDeSitter':
      return {
        label: 'Anti-de Sitter (Poincaré)',
        formula: 'ds² = (L/z)² δ_ij dxⁱ dxʲ',
      }
    case 'sphere2D':
      return {
        label: '2-Sphere (θ,φ)',
        formula: 'ds² = R² (dθ² + sin²θ dφ²)',
      }
    case 'torus':
      return {
        label: 'Flat Torus',
        formula: 'ds² = δ_ij dxⁱ dxʲ,  xⁱ ≡ xⁱ + Lⁱ',
      }
    case 'doubleThroat':
      return {
        label: 'Double-Throat Wormhole',
        formula: 'ds² = dl² + r(l)² dΩ²,  two throats at ±s/2',
      }
  }
}
