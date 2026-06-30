/**
 * Mode — The Möbius No-Boundary Sum (`moebiusNoBoundary`).
 *
 * Renders the Hartle–Hawking no-boundary wavefunction ψ_HH as a Möbius-weighted
 * sum over the modular images of the SL(2, ℤ) group, after Godet (2025). In the
 * three-dimensional gravity / JT setting the no-boundary path integral over the
 * Poincaré disk decomposes into a sum over the modular group, and the
 * arithmetic Möbius function μ(n) appears as the natural weight on the
 * tessellation — a number-theoretic signature inside the gravitational
 * amplitude.
 *
 * The Poincaré disk `|w| < 1` is tiled by the SL(2, ℤ) fundamental domain: each
 * disk point is mapped to the upper half-plane and reduced to the fundamental
 * domain by the generators `T: z ↦ z + 1` and `S: z ↦ −1/z`, counting the
 * reduction depth and accumulating an integer index `n`. Each tile is coloured
 * by μ(n) ∈ {−1, 0, +1}: warm for +1, a DARK VOID for the squarefree-failure
 * μ = 0, cool for −1 — the μ = 0 voids weave a striking lacework. Brightness
 * fades toward the ideal boundary `|w| → 1` (the no-boundary amplitude decays)
 * and the tiles shrink there (the tessellation accumulating at the cusp).
 *
 * @module lib/geometry/extended/wdwZeta/moebiusNoBoundary
 */

import type { WdwZetaScenario } from './shared'

/** Named preset identifiers for the Möbius No-Boundary mode. */
export type MoebiusNoBoundaryPresetName =
  | 'modularMandala'
  | 'tunnelingSpike'
  | 'deepCusp'
  | 'flatSlab'
  | 'modularBall4D'
  | 'custom'

/**
 * Serializable Möbius No-Boundary config (stored on
 * `SchroedingerConfig.moebiusNoBoundary`). Every field is bake-affecting (it
 * changes the tessellation, the Möbius weights, or the dome); emission/glow is
 * the shared Advanced control and is NOT here.
 */
export interface MoebiusNoBoundaryConfig {
  /** Max SL(2, ℤ) reduction iterations per disk point ∈ [8, 60]; deeper = more tiles resolved near the cusp. */
  maxDepth: number
  /** Möbius cutoff N — max accumulated index n that contributes (above N: void) ∈ [6, 120]. */
  moebiusCutoff: number
  /** Height of the shallow dome the disk is lifted into ∈ [0, 0.6]; 0 = flat slab. */
  domeHeight: number
  /** Hyperbolic curvature exponent ∈ [0.5, 3]: scales the tessellation ring density (tiles per hyperbolic radius). */
  curvature: number
  /** WDW boundary-condition morph ∈ [0, 1]: 0 = Hartle–Hawking no-boundary cap √(1−r²), 1 = Vilenkin tunneling spike e^{−6r²}. */
  tunnelMix: number
  /** Preset identifier; `custom` = user-edited. */
  preset: MoebiusNoBoundaryPresetName
}

/** Clamp ranges for every numeric MoebiusNoBoundaryConfig scalar. */
export const MOEBIUS_NO_BOUNDARY_RANGES = {
  maxDepth: { min: 8, max: 60 },
  moebiusCutoff: { min: 6, max: 120 },
  domeHeight: { min: 0, max: 0.6 },
  curvature: { min: 0.5, max: 3 },
  tunnelMix: { min: 0, max: 1 },
} as const

/** Default config — matches the `modularMandala` preset. */
export const DEFAULT_MOEBIUS_NO_BOUNDARY_CONFIG: MoebiusNoBoundaryConfig = {
  maxDepth: 40,
  moebiusCutoff: 60,
  domeHeight: 0.28,
  curvature: 1.0,
  tunnelMix: 0,
  preset: 'modularMandala',
}

/** One Möbius No-Boundary scenario (config minus the preset tag). */
export type MoebiusNoBoundaryPresetValues = Omit<MoebiusNoBoundaryConfig, 'preset'>

/** Scenario presets (≥ 2 required). */
export const MOEBIUS_NO_BOUNDARY_PRESETS: Readonly<
  Record<Exclude<MoebiusNoBoundaryPresetName, 'custom'>, MoebiusNoBoundaryPresetValues>
> = {
  /** The full hyperbolic mandala: a gentle dome, deep cutoff, μ-lacework everywhere. */
  modularMandala: {
    maxDepth: 40,
    moebiusCutoff: 60,
    domeHeight: 0.28,
    curvature: 1.0,
    tunnelMix: 0,
  },
  /** Vilenkin tunneling: the no-boundary cap collapses to a tall central spike of amplitude. */
  tunnelingSpike: {
    maxDepth: 44,
    moebiusCutoff: 72,
    domeHeight: 0.52,
    curvature: 1.3,
    tunnelMix: 1.0,
  },
  /** Push deep into the cusp: high depth + cutoff resolve the finest tiles near |w| = 1. */
  deepCusp: {
    maxDepth: 58,
    moebiusCutoff: 110,
    domeHeight: 0.22,
    curvature: 2.2,
    tunnelMix: 0,
  },
  /** A flat disk slab (no dome): the tessellation read straight-on as a flat lacework. */
  flatSlab: {
    maxDepth: 32,
    moebiusCutoff: 48,
    domeHeight: 0.0,
    curvature: 0.8,
    tunnelMix: 0,
  },
  /**
   * 4D Poincaré ball (dimension 4). A gentle dome and deep cutoff so, as the
   * slice tilts into W, the disk is seen to be the equator of a hyperbolic
   * 3-ball filled with the modular tiling.
   */
  modularBall4D: {
    maxDepth: 48,
    moebiusCutoff: 80,
    domeHeight: 0.3,
    curvature: 1.2,
    tunnelMix: 0,
  },
}

/** Ordered scenario list for the shared ScenarioSelector. */
export const MOEBIUS_NO_BOUNDARY_SCENARIOS: readonly WdwZetaScenario<
  Exclude<MoebiusNoBoundaryPresetName, 'custom'>
>[] = [
  {
    id: 'modularMandala',
    label: 'Modular Mandala',
    description:
      'The Hartle–Hawking no-boundary amplitude as a Möbius-weighted sum over SL(2, ℤ) modular images (Godet 2025). The Poincaré disk is tiled by the modular group; each tile is coloured by the arithmetic Möbius function μ(n) — warm for +1, a dark void for the squarefree-failure μ = 0, cool for −1. The μ = 0 voids weave a lacework; brightness fades toward the ideal boundary as the no-boundary amplitude decays.',
  },
  {
    id: 'tunnelingSpike',
    label: 'Tunneling Spike',
    description:
      'The same Möbius-weighted modular sum, but the Wheeler–DeWitt boundary condition is morphed from Hartle–Hawking to Vilenkin: the smooth no-boundary cap √(1−r²) collapses into a tall central tunneling spike e^{−6r²}. The amplitude is concentrated at the origin — the universe tunnels from nothing rather than rounding off — while the SL(2, ℤ) μ-lacework still tiles the disk beneath it.',
  },
  {
    id: 'deepCusp',
    label: 'Deep Cusp',
    description:
      'A deep reduction (60 iterations, cutoff N = 110) resolves the finest tiles where the tessellation accumulates at the cusp |w| → 1. The tiles shrink without bound toward the ideal boundary — the modular group has infinitely many images crowding the edge, and the Möbius lacework grows ever finer as the amplitude vanishes.',
  },
  {
    id: 'flatSlab',
    label: 'Flat Slab',
    description:
      'The disk rendered as a thin flat slab with no dome lift — the modular tessellation read straight-on as a planar Möbius lacework. The fundamental-domain tiles and their μ(n) colours are seen without perspective, the dark squarefree voids punching clean holes in the warm/cool weave.',
  },
  {
    id: 'modularBall4D',
    label: '4D Poincaré Ball',
    description:
      'The Poincaré disk opened into a fourth dimension. The Hartle–Hawking no-boundary amplitude tiles not a disk but a hyperbolic 3-ball, its radius measured as length(x, z, W); the visible disk is the equatorial slice. Rotating the Z–W plane sweeps the slice through the ball, revealing the SL(2,ℤ) modular tiling and its μ(n) lacework filling a solid hyperbolic volume. Opens at dimension 4.',
    dimension: 4,
    rotation: { ZW: 0.7 },
  },
]
