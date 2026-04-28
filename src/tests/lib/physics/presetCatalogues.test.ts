/**
 * Catalogue-level invariant tests for every quantum-mode preset list.
 *
 * Each mode defines a curated list of named scenario presets. Common
 * invariants must hold across all of them:
 *   - ids are unique within a catalogue
 *   - labels/descriptions are non-empty strings
 *   - finite numeric overrides
 *   - PML reflection coefficient is positive when present
 *   - dimension constraints (`minDim`) are sane
 *
 * These tests catch the class of bug where a copy-pasted preset entry
 * silently shadows another id, sets a NaN amplitude, or claims a
 * `minDim` that disqualifies the preset for every supported dimension.
 *
 * Why one test file instead of one per catalogue: the invariants are the
 * same. A single consolidated probe runs cheaply, makes the contract
 * obvious, and ensures any new catalogue can be added by appending one
 * import + one entry to the table.
 */

import { describe, expect, it } from 'vitest'

import { ADS_PRESETS } from '@/lib/physics/antiDeSitter/presets'
import { DIRAC_SCENARIO_PRESETS } from '@/lib/physics/dirac/presets'
import { FREE_SCALAR_PRESETS } from '@/lib/physics/freeScalar/presets'
import { HYDROGEN_COUPLED_PRESETS } from '@/lib/physics/hydrogenCoupled/presets'
import { QUANTUM_WALK_PRESETS } from '@/lib/physics/quantumWalk/presets'
import { CURVED_METRIC_TDSE_PRESETS } from '@/lib/physics/tdse/curvedMetricPresets'

// Each catalogue exposes a uniform `{ id, name?, label?, description? }`
// shape with `overrides`-style payload. AdS uses `label` instead of `name`,
// so accept both.
type AnyPreset = {
  id: string
  name?: string
  label?: string
  description: string
  overrides?: Record<string, unknown>
  minDim?: number
}

const CATALOGUES: ReadonlyArray<{ name: string; presets: readonly AnyPreset[] }> = [
  { name: 'AdS', presets: ADS_PRESETS as readonly AnyPreset[] },
  { name: 'Dirac', presets: DIRAC_SCENARIO_PRESETS as readonly AnyPreset[] },
  { name: 'FreeScalar', presets: FREE_SCALAR_PRESETS as readonly AnyPreset[] },
  { name: 'HydrogenCoupled', presets: HYDROGEN_COUPLED_PRESETS as readonly AnyPreset[] },
  { name: 'CurvedMetricTDSE', presets: CURVED_METRIC_TDSE_PRESETS as readonly AnyPreset[] },
  { name: 'QuantumWalk', presets: QUANTUM_WALK_PRESETS as readonly AnyPreset[] },
]

function* walkValues(obj: unknown): Generator<unknown> {
  if (obj === null || obj === undefined) return
  if (typeof obj !== 'object') {
    yield obj
    return
  }
  if (Array.isArray(obj)) {
    for (const v of obj) yield* walkValues(v)
    return
  }
  for (const v of Object.values(obj as Record<string, unknown>)) yield* walkValues(v)
}

describe.each(CATALOGUES)('$name presets', ({ presets }) => {
  it('catalogue is non-empty', () => {
    expect(presets.length).toBeGreaterThan(0)
  })

  it('every preset id is unique', () => {
    const ids = presets.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every preset has a non-empty id', () => {
    for (const p of presets) {
      expect(p.id).toMatch(/.+/)
    }
  })

  it('every preset has a non-empty label or name', () => {
    for (const p of presets) {
      const label = p.label ?? p.name ?? ''
      expect(label.length).toBeGreaterThan(0)
    }
  })

  it('every preset has a non-empty description', () => {
    for (const p of presets) {
      expect(p.description).toMatch(/.+/)
    }
  })

  it('all numeric values in overrides are finite (no NaN, ±Infinity)', () => {
    for (const p of presets) {
      const target = (p.overrides ?? p) as Record<string, unknown>
      for (const v of walkValues(target)) {
        if (typeof v === 'number') {
          expect(Number.isFinite(v)).toBe(true)
        }
      }
    }
  })

  it('any pmlTargetReflection field is in (0, 1) (physically valid PML)', () => {
    for (const p of presets) {
      const target = (p.overrides ?? p) as Record<string, unknown> & {
        pmlTargetReflection?: number
      }
      if (target.pmlTargetReflection === undefined) continue
      expect(target.pmlTargetReflection).toBeGreaterThan(0)
      expect(target.pmlTargetReflection).toBeLessThan(1)
    }
  })

  it('any absorberWidth field is in (0, 1) (fraction-of-grid layer)', () => {
    for (const p of presets) {
      const target = (p.overrides ?? p) as Record<string, unknown> & {
        absorberWidth?: number
      }
      if (target.absorberWidth === undefined) continue
      expect(target.absorberWidth).toBeGreaterThan(0)
      expect(target.absorberWidth).toBeLessThan(1)
    }
  })

  it('any dt field is positive', () => {
    for (const p of presets) {
      const target = (p.overrides ?? p) as Record<string, unknown> & { dt?: number }
      if (target.dt === undefined) continue
      expect(target.dt).toBeGreaterThan(0)
    }
  })

  it('any stepsPerFrame field is a positive integer', () => {
    for (const p of presets) {
      const target = (p.overrides ?? p) as Record<string, unknown> & {
        stepsPerFrame?: number
      }
      if (target.stepsPerFrame === undefined) continue
      expect(Number.isInteger(target.stepsPerFrame)).toBe(true)
      expect(target.stepsPerFrame).toBeGreaterThan(0)
    }
  })

  it('any minDim is a positive integer when present', () => {
    for (const p of presets) {
      if (p.minDim === undefined) continue
      expect(Number.isInteger(p.minDim)).toBe(true)
      expect(p.minDim).toBeGreaterThanOrEqual(1)
      expect(p.minDim).toBeLessThanOrEqual(11) // codebase max dimension
    }
  })

  it('any gridSize array contains positive integers', () => {
    for (const p of presets) {
      const target = (p.overrides ?? p) as Record<string, unknown> & {
        gridSize?: readonly number[]
      }
      if (!Array.isArray(target.gridSize)) continue
      for (const g of target.gridSize) {
        expect(Number.isInteger(g)).toBe(true)
        expect(g).toBeGreaterThan(0)
      }
    }
  })

  it('any spacing array contains positive finite numbers', () => {
    for (const p of presets) {
      const target = (p.overrides ?? p) as Record<string, unknown> & {
        spacing?: readonly number[]
      }
      if (!Array.isArray(target.spacing)) continue
      for (const s of target.spacing) {
        expect(Number.isFinite(s)).toBe(true)
        expect(s).toBeGreaterThan(0)
      }
    }
  })
})

describe('FREE_SCALAR_PRESETS — cosmology sub-block invariants', () => {
  it('any cosmology sub-block has a finite hubble rate and finite eta0', () => {
    for (const p of FREE_SCALAR_PRESETS) {
      const cosmo = (
        p.overrides as Record<string, unknown> & {
          cosmology?: { enabled?: boolean; hubble?: number; eta0?: number }
        }
      ).cosmology
      if (!cosmo) continue
      expect([true, false]).toContain(cosmo.enabled)
      if (cosmo.hubble !== undefined) {
        expect(Number.isFinite(cosmo.hubble)).toBe(true)
        expect(cosmo.hubble).toBeGreaterThan(0)
      }
      if (cosmo.eta0 !== undefined) {
        expect(Number.isFinite(cosmo.eta0)).toBe(true)
      }
    }
  })

  it('Bianchi-I Kasner exponents satisfy Σp_i = 1 and Σp_i² = 1', () => {
    const bianchi = FREE_SCALAR_PRESETS.find((p) => p.id === 'bianchiKasnerCigar')
    expect(bianchi?.id).toBe('bianchiKasnerCigar')
    const expo = (
      bianchi!.overrides as Record<string, unknown> & {
        cosmology?: { kasnerExponents?: { p1: number; p2: number; p3: number } }
      }
    ).cosmology?.kasnerExponents
    expect(expo).toEqual(
      expect.objectContaining({
        p1: expect.any(Number),
        p2: expect.any(Number),
        p3: expect.any(Number),
      })
    )
    const sum = expo!.p1 + expo!.p2 + expo!.p3
    const sumSq = expo!.p1 ** 2 + expo!.p2 ** 2 + expo!.p3 ** 2
    expect(sum).toBeCloseTo(1, 12)
    expect(sumSq).toBeCloseTo(1, 12)
  })
})
