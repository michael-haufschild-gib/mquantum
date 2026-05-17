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

    it('round-trips LQC dust equation of state w=0 instead of restoring stiff-fluid default', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'freeScalarField',
        cosmologyEnabled: true,
        cosmologyPreset: 'lqcBounce',
        cosmologyLqcRhoCritical: 2.5,
        cosmologyLqcEquationOfState: 0,
        cosmologyLqcInitialRhoRatio: 0.25,
        cosmologyEta0: 5,
      }
      const serialized = serializeState(state)
      expect(serialized).toContain('cos_w=0.0000')
      const round = deserializeState(serialized)
      expect(round.cosmologyEnabled).toBe(true)
      expect(round.cosmologyPreset).toBe('lqcBounce')
      expect(round.cosmologyLqcEquationOfState).toBe(0)
    })

    it('round-trips valid Bianchi-Kasner exponent triples containing zero', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'freeScalarField',
        cosmologyEnabled: true,
        cosmologyPreset: 'bianchiKasner',
        cosmologyKasnerP1: 0,
        cosmologyKasnerP2: 0,
        cosmologyKasnerP3: 0,
        cosmologyEta0: 2,
      }
      const serialized = serializeState(state)
      expect(serialized).toContain('cos_p1=0.0000')
      expect(serialized).toContain('cos_p2=0.0000')
      expect(serialized).toContain('cos_p3=0.0000')
      const round = deserializeState(serialized)
      expect(round.cosmologyEnabled).toBe(true)
      expect(round.cosmologyPreset).toBe('bianchiKasner')
      expect(round.cosmologyKasnerP1).toBe(0)
      expect(round.cosmologyKasnerP2).toBe(0)
      expect(round.cosmologyKasnerP3).toBe(0)
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

    it('round-trips render-only animation-effect params (phase rotation + worldline)', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'wheelerDeWitt',
        wdwPhaseRotationEnabled: true,
        wdwPhaseRotationSpeed: 2.5,
        wdwWorldlineEnabled: true,
        wdwWorldlineSpeed: 1.2,
        wdwWorldlinePulseWidth: 0.12,
      }
      const serialized = serializeState(state)
      expect(serialized).toContain('wdw_pr=1')
      expect(serialized).toContain('wdw_wl=1')
      expect(serialized).toContain('wdw_prs=2.50')
      expect(serialized).toContain('wdw_wls=1.20')
      expect(serialized).toContain('wdw_wlw=0.1200')

      const round = deserializeState(serialized)
      expect(round.wdwPhaseRotationEnabled).toBe(true)
      expect(round.wdwPhaseRotationSpeed).toBeCloseTo(2.5, 4)
      expect(round.wdwWorldlineEnabled).toBe(true)
      expect(round.wdwWorldlineSpeed).toBeCloseTo(1.2, 4)
      expect(round.wdwWorldlinePulseWidth).toBeCloseTo(0.12, 4)
    })

    it('clamps animation-effect floats to their declared ranges', () => {
      const outOfRange = deserializeState('wdw_prs=99&wdw_wls=99&wdw_wlw=99')
      expect(outOfRange.wdwPhaseRotationSpeed).toBe(5)
      expect(outOfRange.wdwWorldlineSpeed).toBe(3)
      expect(outOfRange.wdwWorldlinePulseWidth).toBe(0.3)

      const negative = deserializeState('wdw_prs=-10&wdw_wls=-10&wdw_wlw=-10')
      expect(negative.wdwPhaseRotationSpeed).toBe(0)
      expect(negative.wdwWorldlineSpeed).toBe(0.1)
      expect(negative.wdwWorldlinePulseWidth).toBe(0.02)
    })

    it('round-trips wdw_dr (renderDynamicRange) and elides the default 100', () => {
      // Non-default value round-trips through the URL.
      const custom: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'wheelerDeWitt',
        wdwRenderDynamicRange: 500,
      }
      const serialized = serializeState(custom)
      expect(serialized).toContain('wdw_dr=500')
      const round = deserializeState(serialized)
      expect(round.wdwRenderDynamicRange).toBeCloseTo(500, 3)

      // Default 100 is elided from the URL so share links stay short.
      const atDefault: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'wheelerDeWitt',
        wdwRenderDynamicRange: 100,
      }
      expect(serializeState(atDefault)).not.toContain('wdw_dr')

      // Unset field also omits the param entirely.
      const unset: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'wheelerDeWitt',
      }
      expect(serializeState(unset)).not.toContain('wdw_dr')

      // Clamp on parse: below floor / above ceiling land inside [1, 10 000].
      expect(deserializeState('wdw_dr=0.1').wdwRenderDynamicRange).toBe(1)
      expect(deserializeState('wdw_dr=999999').wdwRenderDynamicRange).toBe(10_000)
    })

    it('round-trips wdw_ma (inflaton mass asymmetry) when != 1', () => {
      // Anisotropic value must round-trip exactly (within 4-decimal
      // serialization precision). This is the canonical URL the
      // thesis experiment uses to enable the SRMT three-clock test.
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'wheelerDeWitt',
        wdwInflatonMassAsymmetry: 2.5,
      }
      const serialized = serializeState(state)
      expect(serialized).toContain('wdw_ma=2.5000')
      const round = deserializeState(serialized)
      expect(round.wdwInflatonMassAsymmetry).toBeCloseTo(2.5, 4)
    })

    it('elides wdw_ma when value equals the isotropic default (1)', () => {
      // Default elision policy: baseline share links for the symmetric
      // potential must stay free of `wdw_ma=1` noise. An explicit
      // `wdwInflatonMassAsymmetry: 1` on the state should NOT appear
      // in the serialized URL.
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'wheelerDeWitt',
        wdwInflatonMassAsymmetry: 1,
      }
      const serialized = serializeState(state)
      expect(serialized).not.toContain('wdw_ma=')
    })

    it('omits wdw_ma when quantumMode is NOT wheelerDeWitt', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'tdseDynamics',
        wdwInflatonMassAsymmetry: 2.5,
      }
      const serialized = serializeState(state)
      expect(serialized).not.toContain('wdw_ma=')
    })

    it('clamps wdw_ma to [0.1, 10] on deserialize', () => {
      const tooLow = deserializeState('wdw_ma=0.01')
      const tooHigh = deserializeState('wdw_ma=999')
      expect(tooLow.wdwInflatonMassAsymmetry).toBe(0.1)
      expect(tooHigh.wdwInflatonMassAsymmetry).toBe(10)
    })

    it('emits wdw_m=0 (free-kinetic regime is physically distinct from default)', () => {
      // m = 0 is the free massless inflaton case — it's a valid physics
      // configuration, not "unset". The previous `omitZero: true` elided
      // this value so shared URLs silently restored recipients to the
      // default m = 0.3, which produces a completely different PDE.
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'wheelerDeWitt',
        wdwInflatonMass: 0,
      }
      const serialized = serializeState(state)
      expect(serialized).toContain('wdw_m=0.00')
      const round = deserializeState(serialized)
      expect(round.wdwInflatonMass).toBe(0)
    })

    it('emits wdw_prs=0 (rotation disabled is distinct from default 1.0)', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'wheelerDeWitt',
        wdwPhaseRotationSpeed: 0,
      }
      const serialized = serializeState(state)
      expect(serialized).toContain('wdw_prs=0.00')
      const round = deserializeState(serialized)
      expect(round.wdwPhaseRotationSpeed).toBe(0)
    })

    it('round-trips wdw_gn_a / wdw_gn_p grid dimensions', () => {
      // Share links must reproduce the sender's solver resolution — two
      // recipients running different (Na, Nphi) will see numerically
      // different χ for the same nominal physics.
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'wheelerDeWitt',
        wdwGridNa: 192,
        wdwGridNphi: 48,
      }
      const serialized = serializeState(state)
      expect(serialized).toContain('wdw_gn_a=192')
      expect(serialized).toContain('wdw_gn_p=48')
      const round = deserializeState(serialized)
      expect(round.wdwGridNa).toBe(192)
      expect(round.wdwGridNphi).toBe(48)
    })

    it('clamps wdw_gn_a / wdw_gn_p on deserialize to solver-safe ranges', () => {
      const lo = deserializeState('wdw_gn_a=4&wdw_gn_p=2')
      const hi = deserializeState('wdw_gn_a=99999&wdw_gn_p=99999')
      expect(lo.wdwGridNa).toBe(16)
      expect(lo.wdwGridNphi).toBe(8)
      expect(hi.wdwGridNa).toBe(1024)
      expect(hi.wdwGridNphi).toBe(128)
    })

    it('round-trips all six curated scenario presets without information loss', () => {
      // Each curated preset pushes the WDW parameter space to a
      // different corner (tunneling + positive Λ, AdS-like negative Λ,
      // heavy inflaton, etc.). A URL share of a preset must resurrect
      // the same physics triple on the receiving side, or the sender
      // and receiver will see different Wheeler–DeWitt solutions for
      // the same link.
      const curatedPresets: Array<{
        id: string
        wdwBoundaryCondition: 'noBoundary' | 'tunneling' | 'deWitt'
        wdwInflatonMass: number
        wdwCosmologicalConstant: number
      }> = [
        {
          id: 'noBoundaryBaseline',
          wdwBoundaryCondition: 'noBoundary',
          wdwInflatonMass: 0.3,
          wdwCosmologicalConstant: 0,
        },
        {
          id: 'vilenkinTunneling',
          wdwBoundaryCondition: 'tunneling',
          wdwInflatonMass: 0.3,
          wdwCosmologicalConstant: 0.3,
        },
        {
          id: 'deWittOrigin',
          wdwBoundaryCondition: 'deWitt',
          wdwInflatonMass: 0.3,
          wdwCosmologicalConstant: 0,
        },
        {
          id: 'inflationHighMass',
          wdwBoundaryCondition: 'noBoundary',
          wdwInflatonMass: 0.8,
          wdwCosmologicalConstant: 0,
        },
        {
          id: 'deSitterLargeLambda',
          wdwBoundaryCondition: 'noBoundary',
          wdwInflatonMass: 0.3,
          wdwCosmologicalConstant: 0.8,
        },
        {
          id: 'antiDeSitterContracting',
          wdwBoundaryCondition: 'noBoundary',
          wdwInflatonMass: 0.5,
          wdwCosmologicalConstant: -0.5,
        },
      ]
      for (const p of curatedPresets) {
        const state: ShareableState = {
          dimension: 3,
          objectType: 'schroedinger',
          quantumMode: 'wheelerDeWitt',
          wdwBoundaryCondition: p.wdwBoundaryCondition,
          wdwInflatonMass: p.wdwInflatonMass,
          wdwCosmologicalConstant: p.wdwCosmologicalConstant,
        }
        const round = deserializeState(serializeState(state))
        expect(round.wdwBoundaryCondition).toBe(p.wdwBoundaryCondition)
        expect(round.wdwInflatonMass).toBeCloseTo(p.wdwInflatonMass, 4)
        // The URL serializer elides Λ = 0 (default-value compression)
        // so a share link for a Λ = 0 preset deserializes with
        // `wdwCosmologicalConstant = undefined`. Downstream the
        // applier leaves the store's current (default-0) value,
        // which is physically-equivalent. Non-zero Λ must round-trip
        // exactly to the 4-decimal precision the serializer emits.
        if (p.wdwCosmologicalConstant === 0) {
          expect(round.wdwCosmologicalConstant).toBeUndefined()
        } else {
          expect(round.wdwCosmologicalConstant).toBeCloseTo(p.wdwCosmologicalConstant, 4)
        }
      }
    })
  })

  describe('Wheeler–DeWitt SRMT diagnostic params', () => {
    it('serializes all five SRMT params when qm=wheelerDeWitt', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'wheelerDeWitt',
        wdwSrmtEnabled: true,
        wdwSrmtClock: 'phi1',
        wdwSrmtCutNormalized: 0.6,
        wdwSrmtRankCap: 96,
        wdwSrmtHeatmapIntensity: 0.75,
      }
      const serialized = serializeState(state)
      expect(serialized).toContain('srmt=1')
      expect(serialized).toContain('srmt_c=phi1')
      expect(serialized).toContain('srmt_x=0.60')
      expect(serialized).toContain('srmt_r=96')
      expect(serialized).toContain('srmt_h=0.75')
    })

    it('omits all SRMT params when quantumMode is NOT wheelerDeWitt', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'tdseDynamics',
        wdwSrmtEnabled: true,
        wdwSrmtClock: 'a',
        wdwSrmtCutNormalized: 0.5,
        wdwSrmtRankCap: 64,
        wdwSrmtHeatmapIntensity: 0.5,
      }
      const serialized = serializeState(state)
      expect(serialized).not.toContain('srmt=')
      expect(serialized).not.toContain('srmt_c=')
      expect(serialized).not.toContain('srmt_x=')
      expect(serialized).not.toContain('srmt_r=')
      expect(serialized).not.toContain('srmt_h=')
    })

    it('round-trips srmt=0 toggle', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'wheelerDeWitt',
        wdwSrmtEnabled: false,
      }
      const serialized = serializeState(state)
      expect(serialized).toContain('srmt=0')
      const round = deserializeState(serialized)
      expect(round.wdwSrmtEnabled).toBe(false)
    })

    it('round-trips each clock option', () => {
      for (const clock of ['a', 'phi1', 'phi2'] as const) {
        const serialized = serializeState({
          dimension: 3,
          objectType: 'schroedinger',
          quantumMode: 'wheelerDeWitt',
          wdwSrmtClock: clock,
        })
        const round = deserializeState(serialized)
        expect(round.wdwSrmtClock, `roundtrip failed for clock=${clock}`).toBe(clock)
      }
    })

    it('rejects invalid clock values', () => {
      const round = deserializeState('d=3&t=schroedinger&qm=wheelerDeWitt&srmt_c=bogus')
      expect(round.wdwSrmtClock).toBeUndefined()
    })

    it('clamps srmt_x to [0.1, 0.9]', () => {
      const tooLow = deserializeState('srmt_x=-1')
      const tooHigh = deserializeState('srmt_x=5')
      expect(tooLow.wdwSrmtCutNormalized).toBe(0.1)
      expect(tooHigh.wdwSrmtCutNormalized).toBe(0.9)
    })

    it('clamps srmt_r to [8, 256]', () => {
      const tooLow = deserializeState('srmt_r=1')
      const tooHigh = deserializeState('srmt_r=9999')
      expect(tooLow.wdwSrmtRankCap).toBe(8)
      expect(tooHigh.wdwSrmtRankCap).toBe(256)
    })

    it('clamps srmt_h to [0, 1]', () => {
      const negative = deserializeState('srmt_h=-1')
      const tooHigh = deserializeState('srmt_h=9')
      expect(negative.wdwSrmtHeatmapIntensity).toBe(0)
      expect(tooHigh.wdwSrmtHeatmapIntensity).toBe(1)
    })

    it('round-trips the full SRMT block combined', () => {
      const state: ShareableState = {
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'wheelerDeWitt',
        wdwSrmtEnabled: true,
        wdwSrmtClock: 'phi2',
        wdwSrmtCutNormalized: 0.33,
        wdwSrmtRankCap: 128,
        wdwSrmtHeatmapIntensity: 0.4,
      }
      const round = deserializeState(serializeState(state))
      expect(round.wdwSrmtEnabled).toBe(true)
      expect(round.wdwSrmtClock).toBe('phi2')
      expect(round.wdwSrmtCutNormalized).toBeCloseTo(0.33, 2)
      expect(round.wdwSrmtRankCap).toBe(128)
      expect(round.wdwSrmtHeatmapIntensity).toBeCloseTo(0.4, 2)
    })
  })

  describe('Curved-space TDSE metric params', () => {
    it('round-trips tdse_metric=morrisThorne with tdse_b0 and omits b0 for flat', () => {
      // morrisThorne: both keys must survive a deserialize → serialize round trip.
      const curved = deserializeState('d=3&t=schroedinger&tdse_metric=morrisThorne&tdse_b0=0.5000')
      expect(curved.tdseMetricKind).toBe('morrisThorne')
      expect(curved.tdseMetricThroatRadius).toBeCloseTo(0.5, 4)

      const reCurved = serializeState(curved as ShareableState)
      expect(reCurved).toContain('tdse_metric=morrisThorne')
      expect(reCurved).toContain('tdse_b0=0.5000')

      // flat: tdse_metric=flat is preserved but tdse_b0 must NOT be emitted.
      const flat = deserializeState('d=3&t=schroedinger&tdse_metric=flat&tdse_b0=0.5000')
      expect(flat.tdseMetricKind).toBe('flat')
      expect(flat.tdseMetricThroatRadius).toBeUndefined()

      const reFlat = serializeState(flat as ShareableState)
      expect(reFlat).toContain('tdse_metric=flat')
      expect(reFlat).not.toContain('tdse_b0')
    })

    it('silently ignores unknown metric kinds (e.g. foobar)', () => {
      expect(() => deserializeState('d=3&t=schroedinger&tdse_metric=foobar')).not.toThrow()
      const parsed = deserializeState('d=3&t=schroedinger&tdse_metric=foobar&tdse_b0=1.0')
      expect(parsed.tdseMetricKind).toBeUndefined()
      expect(parsed.tdseMetricThroatRadius).toBeUndefined()
    })

    it('clamps tdse_b0 to [MIN_THROAT_RADIUS, MAX_THROAT_RADIUS]', () => {
      // Below-range clamps up to the floor (0.1).
      const low = deserializeState('d=3&t=schroedinger&tdse_metric=morrisThorne&tdse_b0=-5')
      expect(low.tdseMetricThroatRadius).toBe(0.1)

      // Above-range clamps down to the ceiling (5.0).
      const high = deserializeState('d=3&t=schroedinger&tdse_metric=morrisThorne&tdse_b0=100')
      expect(high.tdseMetricThroatRadius).toBe(5.0)
    })

    it('round-trips tdse_metric=schwarzschild with tdse_sm', () => {
      const parsed = deserializeState('d=3&t=schroedinger&tdse_metric=schwarzschild&tdse_sm=1.5')
      expect(parsed.tdseMetricKind).toBe('schwarzschild')
      expect(parsed.tdseSchwarzschildMass).toBeCloseTo(1.5, 4)
      const re = serializeState(parsed as ShareableState)
      expect(re).toContain('tdse_metric=schwarzschild')
      expect(re).toContain('tdse_sm=1.5000')
      expect(re).not.toContain('tdse_b0')
    })

    it('round-trips tdse_metric=deSitter with tdse_h and clamps to [0, 5]', () => {
      const parsed = deserializeState('d=3&t=schroedinger&tdse_metric=deSitter&tdse_h=0.7')
      expect(parsed.tdseMetricKind).toBe('deSitter')
      expect(parsed.tdseHubbleRate).toBeCloseTo(0.7, 4)
      const re = serializeState(parsed as ShareableState)
      expect(re).toContain('tdse_metric=deSitter')
      expect(re).toContain('tdse_h=0.7000')

      const high = deserializeState('d=3&t=schroedinger&tdse_metric=deSitter&tdse_h=99')
      expect(high.tdseHubbleRate).toBe(5)
      const low = deserializeState('d=3&t=schroedinger&tdse_metric=deSitter&tdse_h=-1')
      expect(low.tdseHubbleRate).toBe(0)
    })

    it('round-trips tdse_metric=antiDeSitter with tdse_ads', () => {
      const parsed = deserializeState('d=3&t=schroedinger&tdse_metric=antiDeSitter&tdse_ads=2.5')
      expect(parsed.tdseMetricKind).toBe('antiDeSitter')
      expect(parsed.tdseAdsRadius).toBeCloseTo(2.5, 4)
      const re = serializeState(parsed as ShareableState)
      expect(re).toContain('tdse_ads=2.5000')
    })

    it('round-trips tdse_metric=sphere2D with tdse_sr', () => {
      const parsed = deserializeState('d=3&t=schroedinger&tdse_metric=sphere2D&tdse_sr=1.75')
      expect(parsed.tdseMetricKind).toBe('sphere2D')
      expect(parsed.tdseSphereRadius).toBeCloseTo(1.75, 4)
      const re = serializeState(parsed as ShareableState)
      expect(re).toContain('tdse_sr=1.7500')
    })

    it('round-trips tdse_metric=torus with tdse_tp{0,1,2}', () => {
      const parsed = deserializeState(
        'd=3&t=schroedinger&tdse_metric=torus&tdse_tp0=1.5&tdse_tp1=2.0&tdse_tp2=3.0'
      )
      expect(parsed.tdseMetricKind).toBe('torus')
      expect(parsed.tdseTorusPeriod0).toBeCloseTo(1.5, 4)
      expect(parsed.tdseTorusPeriod1).toBeCloseTo(2.0, 4)
      expect(parsed.tdseTorusPeriod2).toBeCloseTo(3.0, 4)
      const re = serializeState(parsed as ShareableState)
      expect(re).toContain('tdse_tp0=1.5000')
      expect(re).toContain('tdse_tp1=2.0000')
      expect(re).toContain('tdse_tp2=3.0000')
    })

    it('round-trips tdse_metric=doubleThroat with tdse_dts and tdse_dtb', () => {
      const parsed = deserializeState(
        'd=3&t=schroedinger&tdse_metric=doubleThroat&tdse_dts=4.5&tdse_dtb=0.6'
      )
      expect(parsed.tdseMetricKind).toBe('doubleThroat')
      expect(parsed.tdseDoubleThroatSeparation).toBeCloseTo(4.5, 4)
      expect(parsed.tdseDoubleThroatRadius).toBeCloseTo(0.6, 4)
      const re = serializeState(parsed as ShareableState)
      expect(re).toContain('tdse_dts=4.5000')
      expect(re).toContain('tdse_dtb=0.6000')
    })

    it('clamps each new metric param to its physical bounds', () => {
      // Schwarzschild mass ∈ [0.01, 10].
      const sm = deserializeState('d=3&t=schroedinger&tdse_metric=schwarzschild&tdse_sm=99')
      expect(sm.tdseSchwarzschildMass).toBe(10)
      // AdS radius ∈ [0.1, 10].
      const ads = deserializeState('d=3&t=schroedinger&tdse_metric=antiDeSitter&tdse_ads=99')
      expect(ads.tdseAdsRadius).toBe(10)
      // Sphere radius ∈ [0.1, 10].
      const sr = deserializeState('d=3&t=schroedinger&tdse_metric=sphere2D&tdse_sr=-1')
      expect(sr.tdseSphereRadius).toBe(0.1)
      // Torus period ∈ [0.5, 20].
      const tp = deserializeState('d=3&t=schroedinger&tdse_metric=torus&tdse_tp0=99&tdse_tp1=0.01')
      expect(tp.tdseTorusPeriod0).toBe(20)
      expect(tp.tdseTorusPeriod1).toBe(0.5)
      // Double-throat separation ∈ [0.2, 20], throat ∈ [0.1, 5].
      const dt = deserializeState(
        'd=3&t=schroedinger&tdse_metric=doubleThroat&tdse_dts=99&tdse_dtb=99'
      )
      expect(dt.tdseDoubleThroatSeparation).toBe(20)
      expect(dt.tdseDoubleThroatRadius).toBe(5)
    })

    it('keeps app defaults when sub-params are missing', () => {
      // Each kind: missing sub-params leave the corresponding fields undefined.
      const sm = deserializeState('d=3&t=schroedinger&tdse_metric=schwarzschild')
      expect(sm.tdseMetricKind).toBe('schwarzschild')
      expect(sm.tdseSchwarzschildMass).toBeUndefined()

      const tp = deserializeState('d=3&t=schroedinger&tdse_metric=torus&tdse_tp0=2')
      expect(tp.tdseTorusPeriod0).toBe(2)
      expect(tp.tdseTorusPeriod1).toBeUndefined()
      expect(tp.tdseTorusPeriod2).toBeUndefined()
    })
  })
})
