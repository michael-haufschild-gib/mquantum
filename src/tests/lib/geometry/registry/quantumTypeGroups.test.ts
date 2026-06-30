import { describe, expect, it } from 'vitest'

import { getQuantumTypeEntry } from '@/lib/geometry/registry'
import {
  getQuantumTypeGroupForKey,
  isGroupedQuantumType,
  QUANTUM_TYPE_GROUPS,
  ZETA_PRIME_GROUP,
} from '@/lib/geometry/registry/quantumTypeGroups'
import type { QuantumTypeKey } from '@/lib/geometry/registry/types'

/** The exact set of modes the Zeta / Prime card must collapse. */
const EXPECTED_ZETA_MEMBERS: QuantumTypeKey[] = [
  'riemannZeta',
  'hilbertPolya',
  'bifurcationHorizon',
  'modularKnot',
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

describe('quantumTypeGroups — Zeta / Prime family', () => {
  it('collapses exactly the fifteen ζ-related modes', () => {
    expect([...ZETA_PRIME_GROUP.members].sort()).toEqual([...EXPECTED_ZETA_MEMBERS].sort())
  })

  it('every member resolves to a real registry entry', () => {
    for (const key of ZETA_PRIME_GROUP.members) {
      expect(getQuantumTypeEntry(key)?.key, `missing registry entry for ${key}`).toBe(key)
    }
  })

  it('every member is an analytic mode (the card lives in the Analytic band)', () => {
    for (const key of ZETA_PRIME_GROUP.members) {
      expect(getQuantumTypeEntry(key)?.category).toBe('analytic')
    }
  })

  it('the default member is itself a member and a real, 3D-capable mode', () => {
    expect(ZETA_PRIME_GROUP.members).toContain(ZETA_PRIME_GROUP.defaultMember)
    const entry = getQuantumTypeEntry(ZETA_PRIME_GROUP.defaultMember)
    expect(entry?.key).toBe(ZETA_PRIME_GROUP.defaultMember)
    expect(entry?.dimensions.min ?? Infinity).toBeLessThanOrEqual(3)
  })

  it('sections partition the members with no gaps or duplicates', () => {
    const fromSections = ZETA_PRIME_GROUP.sections.flatMap((s) => s.members)
    expect([...fromSections].sort()).toEqual([...ZETA_PRIME_GROUP.members].sort())
    expect(new Set(fromSections).size).toBe(fromSections.length)
  })

  it('maps every member back to its owning group', () => {
    for (const key of ZETA_PRIME_GROUP.members) {
      expect(getQuantumTypeGroupForKey(key)).toBe(ZETA_PRIME_GROUP)
      expect(isGroupedQuantumType(key)).toBe(true)
    }
  })

  it('does not group standalone modes', () => {
    for (const key of [
      'harmonicOscillator',
      'hydrogenND',
      'tdseDynamics',
      'pauliSpinor',
    ] as const) {
      expect(getQuantumTypeGroupForKey(key)).toBeUndefined()
      expect(isGroupedQuantumType(key)).toBe(false)
    }
    expect(isGroupedQuantumType(undefined)).toBe(false)
  })

  it('exposes the Zeta / Prime group as the only registered group', () => {
    expect(QUANTUM_TYPE_GROUPS).toContain(ZETA_PRIME_GROUP)
    // No member appears in more than one group (membership is a function).
    const counts = new Map<QuantumTypeKey, number>()
    for (const group of QUANTUM_TYPE_GROUPS) {
      for (const key of group.members) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    for (const [, n] of counts) expect(n).toBe(1)
  })
})
