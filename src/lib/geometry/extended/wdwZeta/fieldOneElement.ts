/**
 * Mode 11 — The Field With One Element 𝔽₁ (`fieldOneElement`).
 *
 * The counterpart to the Frobenius Wheel. Over a finite field 𝔽_q the Riemann
 * Hypothesis is a *theorem* (Deligne): Frobenius eigenvalues are forced onto
 * |α| = q^{w/2}. The dream of 𝔽₁ — the "field with one element" — is that ℤ is a
 * curve over 𝔽₁ and a Weil-style cohomological proof over 𝔽₁ would prove the
 * *classical* Riemann Hypothesis the same way. Over 𝔽₁ linear algebra collapses
 * to combinatorics: GL_n(𝔽₁) = S_n, ℙⁿ(𝔽₁) = n+1 points, and the algebraic
 * closure 𝔽̄₁ is the group μ_∞ of all roots of unity.
 *
 * The render is a CYCLOTOMIC SPIRE: a vertical tower of regular n-gons (n = 1..N)
 * stacked by order, each ring carrying the n-th roots of unity μ_n as glowing
 * vertices. The polygon gains sides as it climbs — point → segment → triangle →
 * … → a circle at the apex (the archimedean place ∞ that compactifies Spec ℤ
 * into a curve). Prime-order rings (the closed points of Spec ℤ) blaze. A q→1
 * deformation knob morphs the sharp 𝔽₁ polygons toward the rounded 𝔽_q Frobenius
 * circles — the degeneration that bridges this mode to the Frobenius Wheel.
 *
 * "It is a constraint, not a flow": GL_n(𝔽₁) = S_n leaves no linear freedom, only
 * permutations; xⁿ = 1 pins the roots of unity to the circle.
 *
 * @module lib/geometry/extended/wdwZeta/fieldOneElement
 */

import type { WdwZetaScenario } from './shared'

/** Named preset identifiers for the Field With One Element mode. */
export type FieldOneElementPresetName =
  | 'cyclotomicTower'
  | 'qDegeneration'
  | 'primeSpectrum'
  | 'spiralClosure'
  | 'cyclotomicHelix4D'
  | 'custom'

/**
 * Serializable 𝔽₁ config (stored on `SchroedingerConfig.fieldOneElement`).
 * Every field reshapes the cyclotomic spire; emission/glow is the shared
 * Advanced control and is NOT here.
 */
export interface FieldOneElementConfig {
  /** Highest cyclotomic ring order N ∈ [3, 28]; the tower stacks the n-gons n = 1..N. */
  maxOrder: number
  /** q → 1 deformation ∈ [1, 3]: q = 1 is pure 𝔽₁ (sharp regular n-gons), q > 1 rounds them toward the 𝔽_q Frobenius circles. */
  qDeform: number
  /** Golden-angle twist per ring ∈ [0, 1.5]; 0 = a straight stack, larger = a spiralling cyclotomic tower. */
  towerTwist: number
  /** Emphasis ∈ [0, 1] on the prime-order rings (the closed points of Spec ℤ) and the archimedean apex. */
  primeGlow: number
  /** Root-of-unity vertex bead radius ∈ [0.012, 0.06]. */
  vertexSize: number
  /** Preset identifier; `custom` = user-edited. */
  preset: FieldOneElementPresetName
}

/** Clamp ranges for every numeric FieldOneElementConfig scalar. */
export const FIELD_ONE_ELEMENT_RANGES = {
  maxOrder: { min: 3, max: 28 },
  qDeform: { min: 1, max: 3 },
  towerTwist: { min: 0, max: 1.5 },
  primeGlow: { min: 0, max: 1 },
  vertexSize: { min: 0.012, max: 0.06 },
} as const

/** Default config — matches the `cyclotomicTower` preset. */
export const DEFAULT_FIELD_ONE_ELEMENT_CONFIG: FieldOneElementConfig = {
  maxOrder: 16,
  qDeform: 1,
  towerTwist: 0.35,
  primeGlow: 0.6,
  vertexSize: 0.03,
  preset: 'cyclotomicTower',
}

/** One 𝔽₁ scenario (config minus the preset tag). */
export type FieldOneElementPresetValues = Omit<FieldOneElementConfig, 'preset'>

/** Scenario presets (≥ 2 required). */
export const FIELD_ONE_ELEMENT_PRESETS: Readonly<
  Record<Exclude<FieldOneElementPresetName, 'custom'>, FieldOneElementPresetValues>
> = {
  /** The canonical cyclotomic spire of μ_∞ = 𝔽̄₁: sharp n-gons, gentle twist. */
  cyclotomicTower: {
    maxOrder: 16,
    qDeform: 1,
    towerTwist: 0.35,
    primeGlow: 0.6,
    vertexSize: 0.03,
  },
  /** q → 1 degeneration: the polygons round toward the 𝔽_q Frobenius circles. */
  qDegeneration: {
    maxOrder: 14,
    qDeform: 2.6,
    towerTwist: 0.2,
    primeGlow: 0.4,
    vertexSize: 0.028,
  },
  /** Spec ℤ point spectrum: a tall tower with the prime-order rings ablaze. */
  primeSpectrum: {
    maxOrder: 26,
    qDeform: 1,
    towerTwist: 0.25,
    primeGlow: 1,
    vertexSize: 0.022,
  },
  /** The spiral closure: a strong twist winding the tower toward the archimedean apex. */
  spiralClosure: {
    maxOrder: 20,
    qDeform: 1.2,
    towerTwist: 1.2,
    primeGlow: 0.7,
    vertexSize: 0.026,
  },
  /** 4D cyclotomic helix (dimension 4): the spire whose twist winds through the 4th axis. */
  cyclotomicHelix4D: {
    maxOrder: 18,
    qDeform: 1,
    towerTwist: 0.35,
    primeGlow: 0.6,
    vertexSize: 0.03,
  },
}

/** Ordered scenario list for the shared ScenarioSelector. */
export const FIELD_ONE_ELEMENT_SCENARIOS: readonly WdwZetaScenario<
  Exclude<FieldOneElementPresetName, 'custom'>
>[] = [
  {
    id: 'cyclotomicTower',
    label: 'Cyclotomic Tower',
    description:
      'The algebraic closure of the field with one element, 𝔽̄₁ = μ_∞, drawn as a spire of regular n-gons stacked by order: ring n carries the n-th roots of unity as glowing vertices, pinned to the circle by xⁿ = 1. The polygon gains a side at every step — point, segment, triangle, square — climbing toward the circle at the apex, the archimedean place ∞ that compactifies Spec ℤ. Over 𝔽₁ there is no linear algebra, only combinatorics: GL_n(𝔽₁) = S_n.',
  },
  {
    id: 'qDegeneration',
    label: 'q → 1 Degeneration',
    description:
      'The bridge to the Frobenius Wheel. Each cyclotomic ring is a q-integer [n]_q; as q is dialled up the sharp 𝔽₁ polygons round into the 𝔽_q Frobenius circles |α| = q^{w/2}, and as q → 1 they collapse back to the bare combinatorial n-gons. The proven Riemann Hypothesis over 𝔽_q degenerating to the dreamed-of proof over 𝔽₁.',
  },
  {
    id: 'primeSpectrum',
    label: 'Spec ℤ Spectrum',
    description:
      'ℤ as a curve over 𝔽₁: the closed points are the primes. A tall cyclotomic tower with the prime-order rings (the 2-gon, 3-gon, 5-gon, 7-gon, …) blazing as the points of Spec ℤ, the composite rings dim between them. The arithmetic curve seen as its spectrum of primes, climbing toward the archimedean place that closes it.',
  },
  {
    id: 'spiralClosure',
    label: 'Spiral Closure',
    description:
      'A golden-angle twist winds the cyclotomic tower into a spiral as it climbs toward the archimedean apex, where the high-order polygon becomes a smooth circle — the compactification point ∞. The roots of unity spiral up the curve like a strand of arithmetic DNA, μ_∞ wound into a single helix.',
  },
  {
    id: 'cyclotomicHelix4D',
    label: '4D Cyclotomic Helix',
    description:
      'The spire of roots of unity μ_∞ = 𝔽̄₁ wound through a fourth dimension. Each cyclotomic ring carries a per-height twist that, in 4D, winds with the W coordinate — so rotating the X–W plane spirals the whole tower of n-gons toward the archimedean apex ∞ that compactifies Spec ℤ. The closed points (the prime-order rings) climb the curve like a strand of arithmetic DNA lifted off its plane into the 4th axis. Opens at dimension 4.',
    dimension: 4,
    rotation: { XW: 0.6 },
  },
]
