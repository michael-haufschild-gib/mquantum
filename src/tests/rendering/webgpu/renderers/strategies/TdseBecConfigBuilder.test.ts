/**
 * Tests for TdseBecConfigBuilder pure config mapping functions.
 *
 * Verifies that BEC store parameters are correctly mapped to the
 * shared TDSE compute pass config format.
 */

import { describe, expect, it } from 'vitest'

import { type BecConfig, DEFAULT_BEC_CONFIG } from '@/lib/geometry/extended/bec'
import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import { computeWaterfallBackgroundDensity } from '@/lib/physics/bec/waterfallParams'
import { buildBecConfig } from '@/rendering/webgpu/renderers/strategies/TdseBecConfigBuilder'

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

  it('passes vorticity field view through to the TDSE compute config', () => {
    const { config } = buildBecConfig(minimalBec({ fieldView: 'vorticity' }), undefined)
    expect(config.fieldView).toBe('vorticity')
  })

  it('passes hawkingFlux field view through to the TDSE compute config', () => {
    const { config } = buildBecConfig(minimalBec({ fieldView: 'hawkingFlux' }), undefined)
    expect(config.fieldView).toBe('hawkingFlux')
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

describe('buildBecConfig — malformed BEC ingress', () => {
  it('falls back from non-finite lattice inputs without throwing or writing NaN config', () => {
    const { config } = buildBecConfig(
      minimalBec({
        latticeDim: Number.NaN,
        gridSize: [Number.NaN, -3, 7],
        spacing: [Number.NaN, 0, Number.POSITIVE_INFINITY],
        trapAnisotropy: [Number.NaN, 0, Number.POSITIVE_INFINITY],
      } as Partial<BecConfig>),
      undefined
    )

    expect(config.latticeDim).toBe(DEFAULT_BEC_CONFIG.latticeDim)
    expect(config.gridSize).toEqual([8, 2, 8])
    expect(config.spacing).toEqual([0.15, 0.01, 0.15])
    expect(config.trapAnisotropy).toEqual([1, 0.1, 1])
    expect(Number.isFinite(config.packetAmplitude)).toBe(true)
  })

  it('clamps out-of-range lattice dimensions and resizes dependent arrays', () => {
    const { config } = buildBecConfig(
      minimalBec({
        latticeDim: 99,
        gridSize: [16],
        spacing: [0.2],
        trapAnisotropy: [2],
        compactDims: [true],
        compactRadii: [0.5],
        slicePositions: [Number.NaN, 0.25],
      } as Partial<BecConfig>),
      undefined
    )

    expect(config.latticeDim).toBe(11)
    expect(config.gridSize).toHaveLength(11)
    expect(config.gridSize[0]).toBe(16)
    expect(config.gridSize[10]).toBe(8)
    expect(config.spacing).toHaveLength(11)
    expect(config.trapAnisotropy).toHaveLength(11)
    expect(config.compactDims).toHaveLength(11)
    expect(config.compactRadii).toHaveLength(11)
    expect(config.slicePositions).toHaveLength(8)
    expect(config.slicePositions[0]).toBe(0)
  })

  it('sanitizes malformed physics scalars and cross-mode overrides', () => {
    const { config } = buildBecConfig(
      minimalBec({
        interactionStrength: Number.NaN,
        trapOmega: Number.NaN,
        initTrapOmega: Number.POSITIVE_INFINITY,
        hbar: Number.NaN,
        mass: Number.NaN,
        dt: Number.POSITIVE_INFINITY,
        stepsPerFrame: Number.NaN,
        diagnosticsInterval: Number.NaN,
        disorderStrength: Number.NaN,
        disorderSeed: Number.NaN,
        disorderDistribution: 'bogus' as BecConfig['disorderDistribution'],
        initialCondition: 'bogus' as BecConfig['initialCondition'],
        fieldView: 'bogus' as BecConfig['fieldView'],
        vortexPlane1: [Number.NaN, Number.NaN],
        autoScale: 'yes' as unknown as boolean,
        diagnosticsEnabled: 'yes' as unknown as boolean,
        needsReset: 'yes' as unknown as boolean,
        observablesEnabled: 'yes' as unknown as boolean,
        hawkingPairInjection: 'yes' as unknown as boolean,
      } as Partial<BecConfig>),
      {
        absorberEnabled: 'yes' as unknown as boolean,
        absorberWidth: Number.NaN,
        pmlTargetReflection: Number.POSITIVE_INFINITY,
        autoScaleMaxGain: Number.NaN,
      }
    )

    expect(config.initialCondition).toBe(DEFAULT_BEC_CONFIG.initialCondition)
    expect(config.fieldView).toBe(DEFAULT_BEC_CONFIG.fieldView)
    expect(config.interactionStrength).toBe(DEFAULT_BEC_CONFIG.interactionStrength)
    expect(config.harmonicOmega).toBe(DEFAULT_BEC_CONFIG.trapOmega)
    expect(config.hbar).toBe(DEFAULT_TDSE_CONFIG.hbar)
    expect(config.mass).toBe(DEFAULT_TDSE_CONFIG.mass)
    expect(config.dt).toBe(DEFAULT_BEC_CONFIG.dt)
    expect(config.stepsPerFrame).toBe(DEFAULT_BEC_CONFIG.stepsPerFrame)
    expect(config.diagnosticsInterval).toBe(DEFAULT_BEC_CONFIG.diagnosticsInterval)
    expect(config.disorderStrength).toBe(0)
    expect(config.disorderSeed).toBe(DEFAULT_TDSE_CONFIG.disorderSeed)
    expect(config.disorderDistribution).toBe(DEFAULT_TDSE_CONFIG.disorderDistribution)
    expect(config.absorberWidth).toBe(0.2)
    expect(config.pmlTargetReflection).toBe(1e-6)
    expect(config.autoScaleMaxGain).toBe(20)
    expect(config.vortexPlane1).toEqual([0, 1])
    expect(config.absorberEnabled).toBe(false)
    expect(config.autoScale).toBe(true)
    expect(config.diagnosticsEnabled).toBe(true)
    expect(config.needsReset).toBe(false)
    expect(config.observablesEnabled).toBe(false)
    expect(config.hawkingPairInjection).toBe(false)
    expect(Number.isFinite(config.packetAmplitude)).toBe(true)
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
    // disorderStrength defaults to 0 but is now configurable (not hard-zero).
    // See the 'disorder overlay forwarding' block below.
    expect(config.disorderStrength).toBe(0)
  })

  it('inherits TDSE defaults for fields not explicitly overridden', () => {
    const { config } = buildBecConfig(minimalBec(), undefined)
    // mass and hbar come from bec config (same as TDSE default)
    expect(config.mass).toBe(DEFAULT_TDSE_CONFIG.mass)
    expect(config.hbar).toBe(DEFAULT_TDSE_CONFIG.hbar)
  })
})

describe('buildBecConfig — disorder overlay forwarding (cross-mode port)', () => {
  it('forwards disorderStrength from bec config to tdse config', () => {
    const { config } = buildBecConfig(minimalBec({ disorderStrength: 7.5 }), undefined)
    expect(config.disorderStrength).toBeCloseTo(7.5)
  })

  it('forwards disorderSeed from bec config to tdse config', () => {
    const { config } = buildBecConfig(minimalBec({ disorderSeed: 12345 }), undefined)
    expect(config.disorderSeed).toBe(12345)
  })

  it('forwards disorderDistribution from bec config to tdse config', () => {
    const { config } = buildBecConfig(minimalBec({ disorderDistribution: 'gaussian' }), undefined)
    expect(config.disorderDistribution).toBe('gaussian')
  })

  it('defaults disorder to zero-strength no-op when bec config has no override', () => {
    // Physical guarantee: the shared TDSE compute pipeline short-circuits the
    // disorder dispatch when strength <= 0, so a BEC run without disorder must
    // forward strength = 0 to keep the fast path.
    const { config } = buildBecConfig(minimalBec(), undefined)
    expect(config.disorderStrength).toBe(0)
  })
})

describe('buildBecConfig — blackHoleAnalog μ agrees with the shared helper', () => {
  it('writes μ = n₀·g into packetAmplitude', () => {
    // The standalone helper tests live in
    // src/tests/lib/physics/bec/waterfallParams.test.ts; this test guards the
    // builder → helper wire-up specifically so any drift between the two is
    // caught at the strategy layer.
    const g = 500
    const { config } = buildBecConfig(
      minimalBec({ initialCondition: 'blackHoleAnalog', interactionStrength: g }),
      undefined
    )
    const nBg = computeWaterfallBackgroundDensity({ interactionStrength: g })
    expect(config.packetAmplitude).toBeCloseTo(nBg * g, 12)
  })
})
