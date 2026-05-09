import { describe, expect, it } from 'vitest'

import { sCritical } from '@/lib/physics/cosmology/presets'
import {
  type CosmologyDeserializableTarget,
  deserializeCosmology,
  serializeCosmology,
} from '@/lib/url/cosmologySerializer'

describe('cosmology URL serializer', () => {
  it('does not emit cosmology params when the feature is disabled', () => {
    const params = new URLSearchParams()

    serializeCosmology(params, {
      cosmologyEnabled: false,
      cosmologyPreset: 'deSitter',
      cosmologyHubble: 2,
      cosmologyEta0: -10,
    })

    expect(params.toString()).toBe('')
  })

  it('emits ekpyrotic steepness with enough precision to survive the critical bound', () => {
    const spacetimeDim = 4
    const steepness = sCritical(spacetimeDim) + 0.001
    const params = new URLSearchParams()

    serializeCosmology(params, {
      cosmologyEnabled: true,
      cosmologyPreset: 'ekpyrotic',
      cosmologySteepness: steepness,
      cosmologyEta0: -8,
    })

    expect(params.get('cos_s')).toMatch(/^\d+\.\d{4}$/)

    const parsed: CosmologyDeserializableTarget = { dimension: 3 }
    deserializeCosmology(params, parsed)
    expect(parsed.cosmologyEnabled).toBe(true)
    expect(parsed.cosmologyPreset).toBe('ekpyrotic')
    expect(parsed.cosmologySteepness).toBeGreaterThan(sCritical(spacetimeDim))
  })

  it('rejects de Sitter links that omit the required Hubble parameter', () => {
    const parsed: CosmologyDeserializableTarget = { dimension: 3 }

    deserializeCosmology(new URLSearchParams('cos=1&cos_bg=deSitter&cos_eta0=-5'), parsed)

    expect(parsed.cosmologyEnabled).toBeUndefined()
    expect(parsed.cosmologyPreset).toBeUndefined()
  })

  it('accepts de Sitter links after clamping out-of-range Hubble values', () => {
    const parsed: CosmologyDeserializableTarget = { dimension: 3 }

    deserializeCosmology(new URLSearchParams('cos=1&cos_bg=deSitter&cos_h=999&cos_eta0=-5'), parsed)

    expect(parsed.cosmologyEnabled).toBe(true)
    expect(parsed.cosmologyPreset).toBe('deSitter')
    expect(parsed.cosmologyHubble).toBe(100)
    expect(parsed.cosmologyEta0).toBe(-5)
  })

  it('requires LQC rho_c but defaults optional equation-of-state params', () => {
    const missingRequired: CosmologyDeserializableTarget = { dimension: 3 }
    deserializeCosmology(new URLSearchParams('cos=1&cos_bg=lqcBounce&cos_eta0=-2'), missingRequired)
    expect(missingRequired.cosmologyEnabled).toBeUndefined()

    const parsed: CosmologyDeserializableTarget = { dimension: 3 }
    deserializeCosmology(
      new URLSearchParams('cos=1&cos_bg=lqcBounce&cos_rhoc=2.5&cos_eta0=-2'),
      parsed
    )
    expect(parsed.cosmologyEnabled).toBe(true)
    expect(parsed.cosmologyPreset).toBe('lqcBounce')
    expect(parsed.cosmologyLqcRhoCritical).toBe(2.5)
    expect(parsed.cosmologyLqcEquationOfState).toBe(1)
    expect(parsed.cosmologyLqcInitialRhoRatio).toBe(0.01)
  })

  it('clamps LQC optional params before preset validation', () => {
    const parsed: CosmologyDeserializableTarget = { dimension: 3 }

    deserializeCosmology(
      new URLSearchParams(
        'cos=1&cos_bg=lqcBounce&cos_rhoc=999&cos_w=7&cos_rhostart=-1&cos_eta0=-2'
      ),
      parsed
    )

    expect(parsed.cosmologyLqcRhoCritical).toBe(10)
    expect(parsed.cosmologyLqcEquationOfState).toBe(1)
    expect(parsed.cosmologyLqcInitialRhoRatio).toBe(0.001)
  })

  it('drops the whole cosmology block when eta0 is zero or the preset is unknown', () => {
    const singular: CosmologyDeserializableTarget = { dimension: 3 }
    deserializeCosmology(new URLSearchParams('cos=1&cos_bg=minkowski&cos_eta0=0'), singular)

    const unknown: CosmologyDeserializableTarget = { dimension: 3 }
    deserializeCosmology(new URLSearchParams('cos=1&cos_bg=cyclic&cos_eta0=-4'), unknown)

    expect(singular.cosmologyEnabled).toBeUndefined()
    expect(unknown.cosmologyEnabled).toBeUndefined()
  })

  it('ignores stale cosmology params unless cos=1 activates the block', () => {
    const parsed: CosmologyDeserializableTarget = { dimension: 3 }

    deserializeCosmology(new URLSearchParams('cos=0&cos_bg=deSitter&cos_h=2&cos_eta0=-3'), parsed)

    expect(parsed).toEqual({ dimension: 3 })
  })
})
