/**
 * Tests for TdseBecConfigBuilder pure config mapping functions.
 *
 * Verifies that BEC store parameters are correctly mapped to the
 * shared TDSE compute pass config format.
 */

import { describe, expect, it } from 'vitest'

import { type BecConfig, DEFAULT_BEC_CONFIG } from '@/lib/geometry/extended/bec'
import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import {
  buildBecConfig,
  computeWaterfallBackgroundDensity,
} from '@/rendering/webgpu/renderers/strategies/TdseBecConfigBuilder'

/** Minimal valid BecConfig for test use. */
function minimalBec(overrides: Partial<BecConfig> = {}): BecConfig {
  return {
    ...DEFAULT_BEC_CONFIG,
    latticeDim: 3,
    gridSize: [8, 8, 8],
    spacing: [0.15, 0.15, 0.15],
    mass: 1.0,
    hbar: 1.0,
    dt: 0.002,
    stepsPerFrame: 4,
    interactionStrength: 500,
    trapOmega: 1.0,
    trapAnisotropy: [1, 1, 1],
    initialCondition: 'thomasFermi',
    fieldView: 'density',
    autoScale: true,
    diagnosticsEnabled: true,
    diagnosticsInterval: 5,
    needsReset: false,
    observablesEnabled: false,
    ...overrides,
  }
}

describe('buildBecConfig — potentialType', () => {
  it('always sets potentialType to becTrap', () => {
    const { config } = buildBecConfig(minimalBec(), undefined)
    expect(config.potentialType).toBe('becTrap')
  })
})

describe('buildBecConfig — initial conditions', () => {
  it('maps thomasFermi → thomasFermi for positive g', () => {
    const { config } = buildBecConfig(minimalBec({ initialCondition: 'thomasFermi' }), undefined)
    expect(config.initialCondition).toBe('thomasFermi')
  })

  it('maps vortexLattice → vortexImprint', () => {
    const { config } = buildBecConfig(minimalBec({ initialCondition: 'vortexLattice' }), undefined)
    expect(config.initialCondition).toBe('vortexImprint')
  })

  it('maps vortexReconnection → ndVortexPair', () => {
    const { config } = buildBecConfig(
      minimalBec({ initialCondition: 'vortexReconnection' }),
      undefined
    )
    expect(config.initialCondition).toBe('ndVortexPair')
  })

  it('forces gaussianPacket for attractive BEC (g < 0) with thomasFermi', () => {
    const { config } = buildBecConfig(
      minimalBec({ interactionStrength: -100, initialCondition: 'thomasFermi' }),
      undefined
    )
    expect(config.initialCondition).toBe('gaussianPacket')
  })

  it('forces gaussianPacket for attractive BEC (g < 0) with vortexImprint', () => {
    const { config } = buildBecConfig(
      minimalBec({ interactionStrength: -100, initialCondition: 'vortexImprint' }),
      undefined
    )
    expect(config.initialCondition).toBe('gaussianPacket')
  })

  it('forces gaussianPacket for attractive BEC (g < 0) with darkSoliton', () => {
    const { config } = buildBecConfig(
      minimalBec({ interactionStrength: -100, initialCondition: 'darkSoliton' }),
      undefined
    )
    expect(config.initialCondition).toBe('gaussianPacket')
  })

  it('keeps gaussianPacket as-is for attractive BEC', () => {
    const { config } = buildBecConfig(
      minimalBec({ interactionStrength: -100, initialCondition: 'gaussianPacket' }),
      undefined
    )
    expect(config.initialCondition).toBe('gaussianPacket')
  })
})

describe('buildBecConfig — vortex momentum encoding', () => {
  it('encodes vortexCharge in mom[0] for vortexImprint', () => {
    const { config } = buildBecConfig(
      minimalBec({ initialCondition: 'vortexImprint', vortexCharge: 2 }),
      undefined
    )
    expect(config.packetMomentum[0]).toBe(2)
  })

  it('encodes vortexLatticeCount in mom[3] for vortexLattice', () => {
    const { config } = buildBecConfig(
      minimalBec({ initialCondition: 'vortexLattice', vortexLatticeCount: 6, vortexCharge: 1 }),
      undefined
    )
    expect(config.packetMomentum[3]).toBe(6)
  })

  it('encodes vortexAlternateCharge in mom[4] for vortexLattice', () => {
    const { config } = buildBecConfig(
      minimalBec({ initialCondition: 'vortexLattice', vortexAlternateCharge: true }),
      undefined
    )
    expect(config.packetMomentum[4]).toBe(1.0)
  })

  it('encodes soliton depth in mom[1] for darkSoliton', () => {
    const { config } = buildBecConfig(
      minimalBec({ initialCondition: 'darkSoliton', solitonDepth: 0.8, solitonVelocity: 0.1 }),
      undefined
    )
    expect(config.packetMomentum[1]).toBeCloseTo(0.8)
    expect(config.packetMomentum[2]).toBeCloseTo(0.1)
  })
})

describe('buildBecConfig — schroedinger overrides', () => {
  it('wires absorberEnabled from schroedinger overrides', () => {
    const { config } = buildBecConfig(minimalBec(), {
      absorberEnabled: true,
      absorberWidth: 0.3,
      pmlTargetReflection: 1e-4,
    })
    expect(config.absorberEnabled).toBe(true)
    expect(config.absorberWidth).toBeCloseTo(0.3)
    expect(config.pmlTargetReflection).toBeCloseTo(1e-4)
  })

  it('defaults absorberEnabled to false when schroedinger is undefined', () => {
    const { config } = buildBecConfig(minimalBec(), undefined)
    expect(config.absorberEnabled).toBe(false)
  })

  it('wires autoScaleMaxGain from schroedinger overrides', () => {
    const { config } = buildBecConfig(minimalBec(), { autoScaleMaxGain: 50 })
    expect(config.autoScaleMaxGain).toBe(50)
  })

  it('defaults autoScaleMaxGain to 20 when schroedinger is undefined', () => {
    const { config } = buildBecConfig(minimalBec(), undefined)
    expect(config.autoScaleMaxGain).toBe(20)
  })
})

describe('buildBecConfig — lattice passthrough', () => {
  it('passes latticeDim from bec config', () => {
    const { config } = buildBecConfig(minimalBec({ latticeDim: 2 }), undefined)
    expect(config.latticeDim).toBe(2)
  })

  it('passes gridSize from bec config', () => {
    const { config } = buildBecConfig(minimalBec({ gridSize: [16, 16, 16] }), undefined)
    expect(config.gridSize).toEqual([16, 16, 16])
  })

  it('passes trapAnisotropy from bec config', () => {
    const aniso = [1, 0.5, 2]
    const { config } = buildBecConfig(minimalBec({ trapAnisotropy: aniso }), undefined)
    expect(config.trapAnisotropy).toEqual(aniso)
  })

  it('sets harmonicOmega to trapOmega', () => {
    const { config } = buildBecConfig(minimalBec({ trapOmega: 2.5 }), undefined)
    expect(config.harmonicOmega).toBeCloseTo(2.5)
  })

  it('sets harmonicOmegaInit when initTrapOmega differs from trapOmega', () => {
    const { config } = buildBecConfig(minimalBec({ trapOmega: 1.0, initTrapOmega: 2.0 }), undefined)
    expect(config.harmonicOmegaInit).toBeCloseTo(2.0)
  })

  it('harmonicOmegaInit is undefined when initTrapOmega equals trapOmega', () => {
    const { config } = buildBecConfig(minimalBec({ trapOmega: 1.0, initTrapOmega: 1.0 }), undefined)
    expect(config.harmonicOmegaInit).toBeUndefined()
  })

  it('blackHoleAnalog forces harmonicOmega = 0 regardless of trapOmega', () => {
    // The init shader gates the TF envelope on `harmonicOmega`. Any non-zero
    // value confines the condensate to a TF ball instead of producing the
    // uniform background required by the Unruh analog-horizon construction.
    // The trapOmega=1.0 on the BEC config is still used by resizeBecArrays
    // to pick a sane spacing, but the evolution trap must be flat.
    const { config } = buildBecConfig(
      minimalBec({ trapOmega: 1.0, initialCondition: 'blackHoleAnalog' }),
      undefined
    )
    expect(config.harmonicOmega).toBe(0)
    expect(config.harmonicOmegaInit).toBeUndefined()
  })

  it('blackHoleAnalog forces harmonicOmega = 0 even with initTrapOmega ≠ trapOmega', () => {
    const { config } = buildBecConfig(
      minimalBec({
        trapOmega: 1.0,
        initTrapOmega: 2.0,
        initialCondition: 'blackHoleAnalog',
      }),
      undefined
    )
    expect(config.harmonicOmega).toBe(0)
    expect(config.harmonicOmegaInit).toBeUndefined()
  })
})

describe('buildBecConfig — fixed BEC overrides', () => {
  it('disables stochastic decoherence', () => {
    const { config } = buildBecConfig(minimalBec(), undefined)
    expect(config.stochasticEnabled).toBe(false)
    expect(config.stochasticGamma).toBe(0)
  })

  it('disables imaginary time propagation', () => {
    const { config } = buildBecConfig(minimalBec(), undefined)
    expect(config.imaginaryTimeEnabled).toBe(false)
  })

  it('disables showPotential', () => {
    const { config } = buildBecConfig(minimalBec(), undefined)
    expect(config.showPotential).toBe(false)
  })

  it('zeros all non-BEC potential parameters', () => {
    const { config } = buildBecConfig(minimalBec(), undefined)
    expect(config.barrierHeight).toBe(0)
    expect(config.barrierWidth).toBe(0)
    expect(config.wellDepth).toBe(0)
    expect(config.wellWidth).toBe(0)
    expect(config.stepHeight).toBe(0)
    expect(config.latticeDepth).toBe(0)
    expect(config.disorderStrength).toBe(0)
  })

  it('inherits TDSE defaults for fields not explicitly overridden', () => {
    const { config } = buildBecConfig(minimalBec(), undefined)
    // mass and hbar come from bec config (same as TDSE default)
    expect(config.mass).toBe(DEFAULT_TDSE_CONFIG.mass)
    expect(config.hbar).toBe(DEFAULT_TDSE_CONFIG.hbar)
  })
})

describe('computeWaterfallBackgroundDensity', () => {
  it('matches the builder μ override: n₀ = max(g·0.01, 1)/g for the preset g=500', () => {
    // Builder path: mu = max(500*0.01, 1.0) = 5  ⇒  n₀ = mu / g = 0.01
    expect(computeWaterfallBackgroundDensity({ interactionStrength: 500 })).toBeCloseTo(0.01, 12)
  })

  it('saturates to the floor μ=1 at small g: n₀ = 1/g for g·0.01 < 1', () => {
    // g=50: max(0.5, 1) = 1  ⇒  n₀ = 1/50
    expect(computeWaterfallBackgroundDensity({ interactionStrength: 50 })).toBeCloseTo(1 / 50, 12)
  })

  it('returns 1.0 for non-positive g (safe fallback; builder branch is skipped anyway)', () => {
    expect(computeWaterfallBackgroundDensity({ interactionStrength: 0 })).toBe(1.0)
    expect(computeWaterfallBackgroundDensity({ interactionStrength: -10 })).toBe(1.0)
  })

  it('matches the μ the builder actually writes into packetAmplitude', () => {
    const g = 500
    const { config } = buildBecConfig(
      minimalBec({
        initialCondition: 'blackHoleAnalog',
        interactionStrength: g,
      }),
      undefined
    )
    // buildBecConfig writes mu into packetAmplitude; the helper must agree.
    const nBg = computeWaterfallBackgroundDensity({ interactionStrength: g })
    expect(config.packetAmplitude).toBeCloseTo(nBg * g, 12)
  })
})
