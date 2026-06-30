/**
 * Quantum Type UI Groups — collapse many related modes into one Types-tab card.
 *
 * This is a **presentation overlay only**. The renderer, stores, URL serializer,
 * and persistence all continue to key on the flat {@link QuantumTypeKey} /
 * `quantumMode` — a group never becomes a runtime mode. The Types-tab explorer
 * renders one card per group (instead of one per member), and the Geometry tab
 * shows a sub-mode toggle row so the user refines which member is active. This
 * mirrors how Quantum Walk exposes its coin variants: one entry, then a toggle.
 *
 * The Riemann-ζ / prime family had grown to fourteen analytic modes
 * (`riemannZeta`, `hilbertPolya`, `bifurcationHorizon`, `modularKnot` plus the
 * ten WDW ⊗ ζ suite modes), every one a separate card — a cluttered wall. They
 * collapse into a single "Zeta / Prime" entry here.
 *
 * @module lib/geometry/registry/quantumTypeGroups
 */

import type { QuantumTypeCategory, QuantumTypeKey } from './types'

/** A labelled sub-section of a group's members (rendered as one toggle band). */
export interface QuantumTypeGroupSection {
  /** Short heading shown above this band of sub-mode toggles. */
  readonly label: string
  /** Member keys in display order within this band. */
  readonly members: readonly QuantumTypeKey[]
}

/**
 * A UI grouping of several {@link QuantumTypeKey} modes under one Types-tab card.
 */
export interface QuantumTypeGroup {
  /** Stable group identifier (used as the synthetic card key / testid suffix). */
  readonly id: string
  /** Card title shown in the Types tab. */
  readonly name: string
  /** Card description shown in the Types tab. */
  readonly description: string
  /** Category band the card sorts into (all current members are analytic). */
  readonly category: QuantumTypeCategory
  /** All member keys, in display order (flattened across sections). */
  readonly members: readonly QuantumTypeKey[]
  /** Optional labelled sub-sections for the Geometry-tab selector. */
  readonly sections: readonly QuantumTypeGroupSection[]
  /**
   * The member selected when the group card is clicked while no member is
   * already active. Chosen to be the most robust, widest-dimension member.
   */
  readonly defaultMember: QuantumTypeKey
}

/** Spectral / horizon members (the earlier ζ modes, pre-suite). */
const ZETA_SPECTRAL_MEMBERS: readonly QuantumTypeKey[] = [
  'riemannZeta',
  'hilbertPolya',
  'bifurcationHorizon',
  'modularKnot',
]

/** The eleven WDW ⊗ ζ "Arithmetic Universe" suite members. */
const ZETA_SUITE_MEMBERS: readonly QuantumTypeKey[] = [
  'constraintSeam',
  'moebiusNoBoundary',
  'forcedCell',
  'turningSurface',
  'primonMultiverse',
  'frobeniusWheel',
  'dewittCone',
  'selbergSpectrum',
  'adelicWavefunction',
  'weilPositivity',
  'fieldOneElement',
]

/** The single Riemann-ζ / prime family group. */
export const ZETA_PRIME_GROUP: QuantumTypeGroup = {
  id: 'zetaPrime',
  name: 'Zeta / Prime',
  description:
    'The Riemann ζ-function as a quantum landscape: prime-shell spectral synthesis, the Hilbert–Pólya operator, the critical-strip bifurcation horizon, modular knots, and the ten-mode WDW ⊗ ζ suite. Pick a variant in the Geometry panel.',
  category: 'analytic',
  members: [...ZETA_SPECTRAL_MEMBERS, ...ZETA_SUITE_MEMBERS],
  sections: [
    { label: 'Spectral & Horizon', members: ZETA_SPECTRAL_MEMBERS },
    { label: 'WDW ⊗ ζ — Arithmetic Universe', members: ZETA_SUITE_MEMBERS },
  ],
  // Arithmetic Horizon is the family's anchor: robust, 3D–11D, the canonical
  // ζ-zero spectral synthesis. It is the landing mode when the card is clicked.
  defaultMember: 'riemannZeta',
}

/** All UI groups, in card-display order. */
export const QUANTUM_TYPE_GROUPS: readonly QuantumTypeGroup[] = [ZETA_PRIME_GROUP]

/** Reverse index: member key → owning group. */
const GROUP_BY_MEMBER: ReadonlyMap<QuantumTypeKey, QuantumTypeGroup> = (() => {
  const map = new Map<QuantumTypeKey, QuantumTypeGroup>()
  for (const group of QUANTUM_TYPE_GROUPS) {
    for (const key of group.members) {
      map.set(key, group)
    }
  }
  return map
})()

/**
 * Returns the UI group that owns `key`, or undefined if the mode is standalone.
 *
 * @param key - A flat quantum type key.
 * @returns The owning {@link QuantumTypeGroup}, or undefined.
 */
export function getQuantumTypeGroupForKey(
  key: QuantumTypeKey | undefined
): QuantumTypeGroup | undefined {
  return key === undefined ? undefined : GROUP_BY_MEMBER.get(key)
}

/**
 * True when `key` belongs to a collapsed UI group (so the Types tab shows the
 * group card, and the Geometry tab shows the sub-mode selector).
 *
 * @param key - A flat quantum type key.
 * @returns Whether the mode is a group member.
 */
export function isGroupedQuantumType(key: QuantumTypeKey | undefined): boolean {
  return getQuantumTypeGroupForKey(key) !== undefined
}
