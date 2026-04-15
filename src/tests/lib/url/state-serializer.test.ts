/**
 * Tests for URL state serializer
 */

import { describe, expect, it } from 'vitest'

import {
  deserializeState,
  generateShareUrl,
  serializeState,
  type ShareableState,
} from '@/lib/url/state-serializer'

describe('state-serializer', () => {
  describe('serializeState', () => {
    it('should serialize dimension and objectType', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
      }
      const result = serializeState(state)
      expect(result).toContain('d=4')
      expect(result).toContain('t=schroedinger')
    })

    it('should serialize quantum mode when non-default', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        quantumMode: 'tdseDynamics',
      }
      const result = serializeState(state)
      expect(result).toContain('qm=tdseDynamics')
    })

    it('should omit harmonicOscillator quantum mode (default)', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        quantumMode: 'harmonicOscillator',
      }
      const result = serializeState(state)
      expect(result).not.toContain('qm=')
    })

    it('should serialize scene-only payloads and skip object params', () => {
      const state: ShareableState = {
        scene: 'schroedinger bloom',
      }

      const result = serializeState(state)
      expect(result).toBe('scene=schroedinger+bloom')
      expect(result).not.toContain('d=')
      expect(result).not.toContain('t=')
      expect(result).not.toContain('qm=')
    })
  })

  describe('deserializeState', () => {
    it('should deserialize dimension and objectType', () => {
      const result = deserializeState('d=5&t=schroedinger')
      expect(result.dimension).toBe(5)
      expect(result.objectType).toBe('schroedinger')
    })

    it('should deserialize valid quantum mode', () => {
      const result = deserializeState('qm=tdseDynamics')
      expect(result.quantumMode).toBe('tdseDynamics')
    })

    it('should ignore invalid quantum mode', () => {
      const result = deserializeState('qm=unknownMode')
      expect(result.quantumMode).toBeUndefined()
    })

    it('should ignore invalid objectType', () => {
      const result = deserializeState('t=invalid')
      expect(result.objectType).toBeUndefined()
    })

    it('should clamp dimension to valid range', () => {
      const tooLow = deserializeState('d=0')
      const tooHigh = deserializeState('d=99')
      expect(tooLow.dimension).toBe(2) // clamped to MIN_DIMENSION
      expect(tooHigh.dimension).toBe(11) // clamped to MAX_DIMENSION
    })

    it('should reject malformed dimension tokens', () => {
      const trailingText = deserializeState('d=4abc&t=schroedinger')
      const decimalNumber = deserializeState('d=3.9&t=schroedinger')

      expect(trailingText.dimension).toBeUndefined()
      expect(decimalNumber.dimension).toBeUndefined()
      expect(trailingText.objectType).toBe('schroedinger')
      expect(decimalNumber.objectType).toBe('schroedinger')
    })

    it('should return scene param and skip other params', () => {
      const result = deserializeState('scene=my%20scene&d=5&t=schroedinger')
      expect(result.scene).toBe('my scene')
      expect(result.dimension).toBeUndefined()
      expect(result.objectType).toBeUndefined()
    })

    it('should ignore empty scene param', () => {
      const result = deserializeState('scene=&d=5')
      expect(result.scene).toBeUndefined()
      expect(result.dimension).toBe(5)
    })

    it('should return empty object for no params', () => {
      const result = deserializeState('')
      expect(Object.keys(result)).toHaveLength(0)
    })
  })

  describe('roundtrip serialization', () => {
    it('should preserve dimension/objectType/quantumMode', () => {
      const original: ShareableState = {
        dimension: 7,
        objectType: 'schroedinger',
        quantumMode: 'hydrogenND',
      }

      const serialized = serializeState(original)
      const deserialized = deserializeState(serialized)

      expect(deserialized.dimension).toBe(7)
      expect(deserialized.objectType).toBe('schroedinger')
      expect(deserialized.quantumMode).toBe('hydrogenND')
    })

    it('should roundtrip all quantum modes', () => {
      const modes = [
        'hydrogenND',
        'hydrogenNDCoupled',
        'freeScalarField',
        'tdseDynamics',
        'becDynamics',
        'diracEquation',
        'quantumWalk',
      ] as const

      for (const mode of modes) {
        const serialized = serializeState({
          dimension: 3,
          objectType: 'schroedinger',
          quantumMode: mode,
        })
        const deserialized = deserializeState(serialized)
        expect(deserialized.quantumMode, `roundtrip failed for ${mode}`).toBe(mode)
      }
    })

    it('should roundtrip pauliSpinor object type', () => {
      const serialized = serializeState({
        dimension: 3,
        objectType: 'pauliSpinor',
      })
      const deserialized = deserializeState(serialized)
      expect(deserialized.objectType).toBe('pauliSpinor')
      expect(deserialized.dimension).toBe(3)
    })

    it('should roundtrip all valid dimensions (3-11)', () => {
      for (let d = 3; d <= 11; d++) {
        const serialized = serializeState({ dimension: d, objectType: 'schroedinger' })
        const deserialized = deserializeState(serialized)
        expect(deserialized.dimension, `roundtrip failed for d=${d}`).toBe(d)
      }
    })
  })

  describe('open quantum params', () => {
    it('serializes oq params when enabled', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        openQuantumEnabled: true,
        openQuantumDephasingRate: 1.5,
        openQuantumRelaxationRate: 0.3,
        openQuantumThermalUpRate: 0.0,
      }
      const result = serializeState(state)
      expect(result).toContain('oq=1')
      expect(result).toContain('oq_dp=1.50')
      expect(result).toContain('oq_rx=0.30')
      // thermalUpRate=0 should be omitted
      expect(result).not.toContain('oq_th')
    })

    it('omits all oq params when disabled', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        openQuantumEnabled: false,
        openQuantumDephasingRate: 2.0,
      }
      const result = serializeState(state)
      expect(result).not.toContain('oq')
      expect(result).not.toContain('oq_dp')
    })

    it('deserializes oq params', () => {
      const result = deserializeState('d=3&t=schroedinger&oq=1&oq_dp=1.50&oq_rx=0.30&oq_th=0.10')
      expect(result.openQuantumEnabled).toBe(true)
      expect(result.openQuantumDephasingRate).toBeCloseTo(1.5)
      expect(result.openQuantumRelaxationRate).toBeCloseTo(0.3)
      expect(result.openQuantumThermalUpRate).toBeCloseTo(0.1)
    })

    it('clamps oq rates to [0, 5]', () => {
      const result = deserializeState('oq=1&oq_dp=-1&oq_rx=99')
      expect(result.openQuantumDephasingRate).toBe(0)
      expect(result.openQuantumRelaxationRate).toBe(5)
    })

    it('ignores oq rate params when oq is not 1', () => {
      const result = deserializeState('oq_dp=2.0')
      expect(result.openQuantumEnabled).toBeUndefined()
      expect(result.openQuantumDephasingRate).toBeUndefined()
    })

    it('rejects non-finite oq rate values', () => {
      const result = deserializeState('oq=1&oq_dp=NaN&oq_rx=Infinity')
      expect(result.openQuantumDephasingRate).toBeUndefined()
      expect(result.openQuantumRelaxationRate).toBeUndefined()
    })

    it('roundtrips open quantum state', () => {
      const original: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
        openQuantumEnabled: true,
        openQuantumDephasingRate: 2.5,
        openQuantumRelaxationRate: 1.0,
        openQuantumThermalUpRate: 0.5,
      }
      const serialized = serializeState(original)
      const deserialized = deserializeState(serialized)

      expect(deserialized.openQuantumEnabled).toBe(true)
      expect(deserialized.openQuantumDephasingRate).toBeCloseTo(2.5)
      expect(deserialized.openQuantumRelaxationRate).toBeCloseTo(1.0)
      expect(deserialized.openQuantumThermalUpRate).toBeCloseTo(0.5)
    })
  })

  describe('extended params', () => {
    it('roundtrips representation mode', () => {
      for (const repr of ['position', 'momentum', 'wigner'] as const) {
        const s = serializeState({ dimension: 3, objectType: 'schroedinger', representation: repr })
        const d = deserializeState(s)
        expect(d.representation, `roundtrip failed for repr=${repr}`).toBe(repr)
      }
    })

    it('roundtrips boolean flags', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        isoEnabled: true,
        crossSectionEnabled: true,
        observablesEnabled: true,
        diagnosticsEnabled: true,
        absorberEnabled: false,
        imaginaryTimeEnabled: true,
      }
      const d = deserializeState(serializeState(state))
      expect(d.isoEnabled).toBe(true)
      expect(d.crossSectionEnabled).toBe(true)
      expect(d.observablesEnabled).toBe(true)
      expect(d.diagnosticsEnabled).toBe(true)
      expect(d.absorberEnabled).toBe(false)
      expect(d.imaginaryTimeEnabled).toBe(true)
    })

    it('roundtrips numeric params with clamping', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        isoThreshold: -3,
        densityGain: 5.0,
        scale: 1.5,
        termCount: 4,
        seed: 42,
        hydrogenN: 3,
        hydrogenL: 2,
        hydrogenM: -1,
      }
      const d = deserializeState(serializeState(state))
      expect(d.isoThreshold).toBeCloseTo(-3)
      expect(d.densityGain).toBeCloseTo(5.0)
      expect(d.scale).toBeCloseTo(1.5)
      expect(d.termCount).toBe(4)
      expect(d.seed).toBe(42)
      expect(d.hydrogenN).toBe(3)
      expect(d.hydrogenL).toBe(2)
      expect(d.hydrogenM).toBe(-1)
    })

    it('roundtrips TDSE potential type', () => {
      for (const pot of ['free', 'barrier', 'harmonicTrap', 'doubleSlit'] as const) {
        const s = serializeState({ dimension: 3, objectType: 'schroedinger', potentialType: pot })
        expect(deserializeState(s).potentialType, `roundtrip failed for pot=${pot}`).toBe(pot)
      }
    })

    it('clamps numeric params to valid ranges', () => {
      const d = deserializeState('tc=99&hyd_n=-5&hyd_l=99&hyd_m=-99&scale=100&dg=-1&iso_t=5')
      expect(d.termCount).toBe(8) // clamped to max
      expect(d.hydrogenN).toBe(1) // clamped to min
      expect(d.hydrogenL).toBe(6) // clamped to max
      expect(d.hydrogenM).toBe(-6) // clamped to min
      expect(d.scale).toBeCloseTo(2.0) // clamped to max
      expect(d.densityGain).toBeCloseTo(0.01) // clamped to min
      expect(d.isoThreshold).toBeCloseTo(0) // clamped to max
    })

    it('accepts leading-dot floats (.5) in URL params', () => {
      const d = deserializeState('scale=.75&dg=.5&iso_t=-.5')
      expect(d.scale).toBeCloseTo(0.75)
      expect(d.densityGain).toBeCloseTo(0.5)
      expect(d.isoThreshold).toBeCloseTo(-0.5)
    })

    it('ignores invalid enum values', () => {
      const d = deserializeState('repr=invalid&pot=unknown')
      expect(d.representation).toBeUndefined()
      expect(d.potentialType).toBeUndefined()
    })

    it('omits undefined extended params from serialized output', () => {
      const s = serializeState({ dimension: 3, objectType: 'schroedinger' })
      expect(s).not.toContain('repr=')
      expect(s).not.toContain('iso=')
      expect(s).not.toContain('tc=')
      expect(s).not.toContain('obs=')
    })

    it('strips undefined keys from deserialized output', () => {
      const d = deserializeState('d=3&t=schroedinger')
      expect(Object.keys(d)).toEqual(['dimension', 'objectType'])
    })

    it('full TDSE scene roundtrip with all extended params', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'tdseDynamics',
        potentialType: 'harmonicTrap',
        absorberEnabled: false,
        diagnosticsEnabled: true,
        observablesEnabled: true,
        imaginaryTimeEnabled: false,
      }
      const d = deserializeState(serializeState(state))
      expect(d.quantumMode).toBe('tdseDynamics')
      expect(d.potentialType).toBe('harmonicTrap')
      expect(d.absorberEnabled).toBe(false)
      expect(d.diagnosticsEnabled).toBe(true)
      expect(d.observablesEnabled).toBe(true)
      expect(d.imaginaryTimeEnabled).toBe(false)
    })

    it('roundtrips coupledAnharmonic with anharmonicLambda', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'tdseDynamics',
        potentialType: 'coupledAnharmonic',
        anharmonicLambda: 5.5,
      }
      const d = deserializeState(serializeState(state))
      expect(d.potentialType).toBe('coupledAnharmonic')
      expect(d.anharmonicLambda).toBeCloseTo(5.5, 1)
    })

    it('omits anharmonicLambda for non-coupledAnharmonic potentials', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        potentialType: 'harmonicTrap',
      }
      const s = serializeState(state)
      expect(s).not.toContain('anh_l')
    })

    it('roundtrips andersonDisorder with disorder params', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'tdseDynamics',
        potentialType: 'andersonDisorder',
        disorderStrength: 8.0,
        disorderSeed: 42,
        disorderDistribution: 'gaussian',
      }
      const d = deserializeState(serializeState(state))
      expect(d.potentialType).toBe('andersonDisorder')
      expect(d.disorderStrength).toBeCloseTo(8.0, 1)
      expect(d.disorderSeed).toBe(42)
      expect(d.disorderDistribution).toBe('gaussian')
    })
  })

  describe('stochastic decoherence params', () => {
    it('serializes stochastic params when enabled', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        stochasticEnabled: true,
        stochasticGamma: 2.0,
        stochasticSigma: 1.5,
        stochasticNumSites: 8,
      }
      const result = serializeState(state)
      expect(result).toContain('sloc=1')
      expect(result).toContain('sloc_g=2.00')
      expect(result).toContain('sloc_s=1.50')
      expect(result).toContain('sloc_n=8')
    })

    it('omits stochastic params when disabled', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        stochasticEnabled: false,
        stochasticGamma: 2.0,
      }
      const result = serializeState(state)
      expect(result).not.toContain('sloc')
    })

    it('roundtrips stochastic decoherence state', () => {
      const original: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        stochasticEnabled: true,
        stochasticGamma: 3.5,
        stochasticSigma: 2.0,
        stochasticNumSites: 12,
      }
      const deserialized = deserializeState(serializeState(original))
      expect(deserialized.stochasticEnabled).toBe(true)
      expect(deserialized.stochasticGamma).toBeCloseTo(3.5)
      expect(deserialized.stochasticSigma).toBeCloseTo(2.0)
      expect(deserialized.stochasticNumSites).toBe(12)
    })

    it('clamps stochastic params to valid ranges', () => {
      const d = deserializeState('sloc=1&sloc_g=-1&sloc_s=99&sloc_n=99')
      expect(d.stochasticGamma).toBe(0)
      expect(d.stochasticSigma).toBe(5)
      expect(d.stochasticNumSites).toBe(32)
    })
  })

  describe('branching visualization', () => {
    it('serializes branching state when enabled', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        branchingEnabled: true,
        branchPlanePosition: 0.5,
      }
      const result = serializeState(state)
      expect(result).toContain('brc=1')
      expect(result).toContain('brc_p=0.50')
    })

    it('omits branching params when disabled', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        branchingEnabled: false,
        branchPlanePosition: 0.5,
      }
      const result = serializeState(state)
      expect(result).not.toContain('brc')
    })

    it('omits brc_p when the position is exactly zero', () => {
      // Zero is the default; emitting `brc_p=0.00` just bloats the URL.
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        branchingEnabled: true,
        branchPlanePosition: 0,
      }
      const result = serializeState(state)
      expect(result).toContain('brc=1')
      expect(result).not.toContain('brc_p')
    })

    it('roundtrips branching state', () => {
      const original: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        branchingEnabled: true,
        branchPlanePosition: -0.75,
      }
      const deserialized = deserializeState(serializeState(original))
      expect(deserialized.branchingEnabled).toBe(true)
      expect(deserialized.branchPlanePosition).toBeCloseTo(-0.75, 2)
    })

    it('clamps branchPlanePosition to [-1, 1]', () => {
      const d = deserializeState('brc=1&brc_p=5')
      expect(d.branchingEnabled).toBe(true)
      expect(d.branchPlanePosition).toBe(1)

      const d2 = deserializeState('brc=1&brc_p=-9')
      expect(d2.branchPlanePosition).toBe(-1)
    })

    it('branching is independent from stochastic localization', () => {
      // Regression guard: branching must serialize on its own, since
      // partition-based diagnostics are meaningful even with CSL off.
      const d = deserializeState('brc=1&brc_p=0.3')
      expect(d.branchingEnabled).toBe(true)
      expect(d.stochasticEnabled).toBeUndefined()
    })
  })

  describe('custom potential expression', () => {
    it('roundtrips custom potential expression', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'tdseDynamics',
        potentialType: 'custom',
        customPotentialExpression: 'x*x + y*y',
      }
      const d = deserializeState(serializeState(state))
      expect(d.potentialType).toBe('custom')
      expect(d.customPotentialExpression).toBe('x*x + y*y')
    })

    it('omits custom expression for non-custom potentials', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        potentialType: 'harmonicTrap',
        customPotentialExpression: 'x*x',
      }
      const s = serializeState(state)
      expect(s).not.toContain('cpx')
    })

    it('rejects overly long custom expressions', () => {
      const longExpr = 'x'.repeat(201)
      const d = deserializeState(`pot=custom&cpx=${longExpr}`)
      expect(d.potentialType).toBe('custom')
      expect(d.customPotentialExpression).toBeUndefined()
    })
  })

  describe('generateShareUrl', () => {
    it('should generate URL with state params', () => {
      const originalWindow = globalThis.window
      globalThis.window = {
        location: {
          origin: 'https://example.com',
          pathname: '/app',
        },
      } as unknown as Window & typeof globalThis

      const state: ShareableState = {
        dimension: 4,
        objectType: 'schroedinger',
      }
      const url = generateShareUrl(state)

      expect(url).toContain('https://example.com/app')
      expect(url).toContain('d=4')
      expect(url).toContain('t=schroedinger')

      globalThis.window = originalWindow
    })
  })

  describe('cosmological background (Mukhanov-Sasaki bridge)', () => {
    it('round-trips an ekpyrotic preset with steepness and eta0', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'freeScalarField',
        cosmologyEnabled: true,
        cosmologyPreset: 'ekpyrotic',
        cosmologySteepness: 6,
        cosmologyEta0: -8,
      }
      const serialized = serializeState(state)
      expect(serialized).toContain('cos=1')
      expect(serialized).toContain('cos_bg=ekpyrotic')
      expect(serialized).toContain('cos_s=6.00')
      expect(serialized).toContain('cos_eta0=-8.00')

      const round = deserializeState(serialized)
      expect(round.cosmologyEnabled).toBe(true)
      expect(round.cosmologyPreset).toBe('ekpyrotic')
      expect(round.cosmologySteepness).toBeCloseTo(6, 6)
      expect(round.cosmologyEta0).toBeCloseTo(-8, 6)
    })

    it('round-trips a de Sitter preset with hubble', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'freeScalarField',
        cosmologyEnabled: true,
        cosmologyPreset: 'deSitter',
        cosmologyHubble: 2,
        cosmologyEta0: -5,
      }
      const serialized = serializeState(state)
      expect(serialized).toContain('cos_bg=deSitter')
      expect(serialized).toContain('cos_h=2.00')
      expect(serialized).not.toContain('cos_s=') // steepness not emitted for de Sitter

      const round = deserializeState(serialized)
      expect(round.cosmologyPreset).toBe('deSitter')
      expect(round.cosmologyHubble).toBeCloseTo(2, 6)
    })

    it('omits cosmology block entirely when disabled', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'freeScalarField',
        cosmologyEnabled: false,
        cosmologyPreset: 'ekpyrotic',
        cosmologySteepness: 6,
      }
      const serialized = serializeState(state)
      expect(serialized).not.toContain('cos=')
      expect(serialized).not.toContain('cos_bg=')
      expect(serialized).not.toContain('cos_s=')
    })

    it('rejects ekpyrotic steepness at or below s_c(n) during deserialize', () => {
      // For d=3 (spatial) → n=4 spacetime, s_c(4) = √12 ≈ 3.4641.
      // Set cos_s = 3.0 (sub-critical) — the whole cosmology block should
      // be silently dropped, not coerced.
      const raw =
        'd=3&t=schroedinger&qm=freeScalarField&cos=1&cos_bg=ekpyrotic&cos_s=3&cos_eta0=-10'
      const parsed = deserializeState(raw)
      expect(parsed.cosmologyEnabled).toBeUndefined()
      expect(parsed.cosmologyPreset).toBeUndefined()
      expect(parsed.cosmologySteepness).toBeUndefined()
    })

    it('accepts a valid ekpyrotic steepness strictly above s_c(n)', () => {
      // s_c(4) ≈ 3.4641. Set cos_s = 4 (admissible).
      const raw =
        'd=3&t=schroedinger&qm=freeScalarField&cos=1&cos_bg=ekpyrotic&cos_s=4&cos_eta0=-10'
      const parsed = deserializeState(raw)
      expect(parsed.cosmologyEnabled).toBe(true)
      expect(parsed.cosmologySteepness).toBeCloseTo(4, 6)
    })

    it('rejects unknown preset strings', () => {
      const raw = 'd=3&t=schroedinger&cos=1&cos_bg=bouncing&cos_eta0=-10'
      const parsed = deserializeState(raw)
      expect(parsed.cosmologyEnabled).toBeUndefined()
    })

    it('rejects cos_eta0 = 0', () => {
      const raw = 'd=3&t=schroedinger&cos=1&cos_bg=kasner&cos_eta0=0'
      const parsed = deserializeState(raw)
      expect(parsed.cosmologyEnabled).toBeUndefined()
    })

    it('drops cosmology when cos=0 even if sub-params are present', () => {
      const raw = 'd=3&t=schroedinger&cos=0&cos_bg=deSitter&cos_h=1&cos_eta0=-5'
      const parsed = deserializeState(raw)
      expect(parsed.cosmologyEnabled).toBeUndefined()
      expect(parsed.cosmologyPreset).toBeUndefined()
    })

    it('keeps app defaults when cos flag is absent entirely', () => {
      const raw = 'd=3&t=schroedinger&qm=freeScalarField'
      const parsed = deserializeState(raw)
      expect(parsed.cosmologyEnabled).toBeUndefined()
    })

    it('accepts minkowski preset without steepness or hubble', () => {
      const raw = 'd=3&t=schroedinger&cos=1&cos_bg=minkowski&cos_eta0=-5'
      const parsed = deserializeState(raw)
      expect(parsed.cosmologyEnabled).toBe(true)
      expect(parsed.cosmologyPreset).toBe('minkowski')
    })

    it('rejects de Sitter when cos_h is missing', () => {
      // Finding 5: shared URLs with cos=1&cos_bg=deSitter but no cos_h
      // must not activate cosmology — the runtime either falls back to
      // mass² (step path) or throws on reset (init path), both wrong.
      const raw = 'd=3&t=schroedinger&qm=freeScalarField&cos=1&cos_bg=deSitter&cos_eta0=-5'
      const parsed = deserializeState(raw)
      expect(parsed.cosmologyEnabled).toBeUndefined()
      expect(parsed.cosmologyPreset).toBeUndefined()
      expect(parsed.cosmologyHubble).toBeUndefined()
    })

    it('clamps cos_h and accepts de Sitter when cos_h is out of range', () => {
      const raw =
        'd=3&t=schroedinger&qm=freeScalarField&cos=1&cos_bg=deSitter&cos_h=999&cos_eta0=-5'
      const parsed = deserializeState(raw)
      // parseFloatParam clamps to [0.01, 100], so cos_h=999 becomes 100 and
      // deSitter is accepted. Rejection only fires when cos_h is absent or
      // non-numeric — see the "rejects de Sitter when cos_h is missing" test.
      expect(parsed.cosmologyEnabled).toBe(true)
      expect(parsed.cosmologyHubble).toBe(100)
    })

    it('round-trips ekpyrotic steepness just above s_c with 4-decimal precision', () => {
      // Finding 8: s_c(n=4) ≈ 3.4641, so a valid s = 3.4645 must survive
      // the round-trip. At 2-decimal precision (the default) 3.4645 →
      // 3.46 → rejected because 3.46 < 3.4641... Use 4-decimal precision.
      const state: ShareableState = {
        dimension: 3, // n = 4
        objectType: 'schroedinger',
        quantumMode: 'freeScalarField',
        cosmologyEnabled: true,
        cosmologyPreset: 'ekpyrotic',
        cosmologySteepness: 3.4645,
        cosmologyEta0: -10,
      }
      const serialized = serializeState(state)
      expect(serialized).toContain('cos_s=3.4645')
      const round = deserializeState(serialized)
      expect(round.cosmologyEnabled).toBe(true)
      expect(round.cosmologySteepness).toBeCloseTo(3.4645, 4)
    })
  })

  describe('Wheeler–DeWitt minisuperspace params', () => {
    it('round-trips streamline toggle + density alongside physics fields', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'wheelerDeWitt',
        wdwBoundaryCondition: 'tunneling',
        wdwInflatonMass: 0.42,
        wdwCosmologicalConstant: 0.11,
        wdwStreamlinesEnabled: true,
        wdwStreamlineDensity: 9,
      }
      const serialized = serializeState(state)
      expect(serialized).toContain('wdw_sl=1')
      expect(serialized).toContain('wdw_sld=9')
      const round = deserializeState(serialized)
      expect(round.wdwBoundaryCondition).toBe('tunneling')
      expect(round.wdwInflatonMass).toBeCloseTo(0.42, 4)
      expect(round.wdwCosmologicalConstant).toBeCloseTo(0.11, 4)
      expect(round.wdwStreamlinesEnabled).toBe(true)
      expect(round.wdwStreamlineDensity).toBe(9)
    })

    it('clamps streamline density to [2, 16]', () => {
      const tooLow = deserializeState('wdw_sld=1')
      const tooHigh = deserializeState('wdw_sld=42')
      expect(tooLow.wdwStreamlineDensity).toBe(2)
      expect(tooHigh.wdwStreamlineDensity).toBe(16)
    })
  })
})
