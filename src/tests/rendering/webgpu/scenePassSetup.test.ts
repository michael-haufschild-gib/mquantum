/**
 * Tests for scenePassSetup — config extraction, normalization,
 * and mode transition logic.
 */

import { describe, expect, it } from 'vitest'

import {
  computeCasSharpnessFromRenderScale,
  extractPPConfig,
  extractSchrodingerConfig,
  normalizeColorAlgorithmForQuantumMode,
  type PassConfig,
  pauliFieldViewForColorAlgorithm,
  shallowEqual,
  shouldForceFullRebuildForQuantumModeTransition,
} from '@/rendering/webgpu/scenePassConfig'

function makePassConfig(overrides: Partial<PassConfig> = {}): PassConfig {
  return {
    objectType: 'schroedinger',
    dimension: 4,
    bloomEnabled: false,
    antiAliasingMethod: 'none',
    paperEnabled: false,
    frameBlendingEnabled: false,
    isosurface: false,
    quantumMode: 'harmonicOscillator',
    termCount: 1,
    nodalEnabled: false,
    phaseMaterialityEnabled: false,
    interferenceEnabled: false,
    uncertaintyBoundaryEnabled: true,
    temporalReprojectionEnabled: true,
    eigenfunctionCacheEnabled: true,
    analyticalGradientEnabled: true,
    fastEigenInterpolationEnabled: true,
    colorAlgorithm: 'radialDistance',
    representation: 'position',
    openQuantumEnabled: false,
    skyboxEnabled: false,
    skyboxMode: 'classic',
    backgroundColor: '#232323',
    ...overrides,
  }
}

describe('extractSchrodingerConfig', () => {
  it('passes through analytic mode settings unchanged', () => {
    const config = makePassConfig({
      quantumMode: 'harmonicOscillator',
      dimension: 5,
      termCount: 4,
      nodalEnabled: true,
      uncertaintyBoundaryEnabled: true,
      eigenfunctionCacheEnabled: true,
      temporalReprojectionEnabled: true,
      representation: 'momentum',
    })

    const extracted = extractSchrodingerConfig(config)

    expect(extracted.dimension).toBe(5)
    expect(extracted.termCount).toBe(4)
    expect(extracted.nodalEnabled).toBe(true)
    expect(extracted.uncertaintyBoundaryEnabled).toBe(true)
    expect(extracted.eigenfunctionCacheEnabled).toBe(true)
    expect(extracted.temporalReprojectionEnabled).toBe(true)
    expect(extracted.representation).toBe('momentum')
  })

  it('forces compute mode overrides for freeScalarField', () => {
    const config = makePassConfig({
      quantumMode: 'freeScalarField',
      dimension: 3,
      termCount: 4,
      nodalEnabled: true,
      phaseMaterialityEnabled: true,
      interferenceEnabled: true,
      uncertaintyBoundaryEnabled: true,
      eigenfunctionCacheEnabled: true,
      temporalReprojectionEnabled: true,
      representation: 'momentum',
    })

    const extracted = extractSchrodingerConfig(config)

    expect(extracted.dimension).toBe(3) // already >= 3
    expect(extracted.termCount).toBe(1) // forced to 1
    expect(extracted.nodalEnabled).toBe(false) // forced off
    expect(extracted.phaseMaterialityEnabled).toBe(false) // forced off
    expect(extracted.interferenceEnabled).toBe(false) // forced off
    expect(extracted.uncertaintyBoundaryEnabled).toBe(false) // forced off
    expect(extracted.eigenfunctionCacheEnabled).toBe(false) // forced off
    expect(extracted.temporalReprojectionEnabled).toBe(false) // forced off
    expect(extracted.representation).toBe('position') // forced
    expect(extracted.openQuantumEnabled).toBe(false) // forced off
  })

  it('forces compute mode overrides for tdseDynamics', () => {
    const extracted = extractSchrodingerConfig(
      makePassConfig({ quantumMode: 'tdseDynamics', nodalEnabled: true })
    )
    expect(extracted.nodalEnabled).toBe(false)
    expect(extracted.termCount).toBe(1)
  })

  it('forces compute mode overrides for becDynamics', () => {
    const extracted = extractSchrodingerConfig(
      makePassConfig({ quantumMode: 'becDynamics', eigenfunctionCacheEnabled: true })
    )
    expect(extracted.eigenfunctionCacheEnabled).toBe(false)
    expect(extracted.representation).toBe('position')
  })

  it('forces compute mode overrides for diracEquation', () => {
    const extracted = extractSchrodingerConfig(
      makePassConfig({ quantumMode: 'diracEquation', temporalReprojectionEnabled: true })
    )
    expect(extracted.temporalReprojectionEnabled).toBe(false)
  })

  it('forces dimension >= 3 for compute modes with lower dimension', () => {
    const extracted = extractSchrodingerConfig(
      makePassConfig({ quantumMode: 'freeScalarField', dimension: 2 })
    )
    expect(extracted.dimension).toBe(3)
  })

  it('all compute modes force identical analytic feature overrides', () => {
    const computeModes = [
      'freeScalarField',
      'tdseDynamics',
      'becDynamics',
      'diracEquation',
    ] as const
    for (const mode of computeModes) {
      const extracted = extractSchrodingerConfig(
        makePassConfig({
          quantumMode: mode,
          nodalEnabled: true,
          phaseMaterialityEnabled: true,
          interferenceEnabled: true,
          uncertaintyBoundaryEnabled: true,
          eigenfunctionCacheEnabled: true,
          temporalReprojectionEnabled: true,
          representation: 'momentum',
        })
      )
      expect(extracted.nodalEnabled, `${mode}: nodalEnabled`).toBe(false)
      expect(extracted.phaseMaterialityEnabled, `${mode}: phaseMaterialityEnabled`).toBe(false)
      expect(extracted.interferenceEnabled, `${mode}: interferenceEnabled`).toBe(false)
      expect(extracted.uncertaintyBoundaryEnabled, `${mode}: uncertaintyBoundaryEnabled`).toBe(
        false
      )
      expect(extracted.eigenfunctionCacheEnabled, `${mode}: eigenfunctionCacheEnabled`).toBe(false)
      expect(extracted.temporalReprojectionEnabled, `${mode}: temporalReprojectionEnabled`).toBe(
        false
      )
      expect(extracted.representation, `${mode}: representation`).toBe('position')
      expect(extracted.termCount, `${mode}: termCount`).toBe(1)
    }
  })

  it('disables nodal and phase when openQuantumEnabled', () => {
    const extracted = extractSchrodingerConfig(
      makePassConfig({
        quantumMode: 'harmonicOscillator',
        openQuantumEnabled: true,
        nodalEnabled: true,
        phaseMaterialityEnabled: true,
        interferenceEnabled: true,
      })
    )
    expect(extracted.nodalEnabled).toBe(false)
    expect(extracted.phaseMaterialityEnabled).toBe(false)
    expect(extracted.interferenceEnabled).toBe(false)
  })
})

describe('normalizeColorAlgorithmForQuantumMode', () => {
  it('returns radialDistance for harmonicOscillator when available', () => {
    const result = normalizeColorAlgorithmForQuantumMode('harmonicOscillator', 'radialDistance')
    expect(result).toBe('radialDistance')
  })

  it('falls back to phaseDensity for compute modes with unavailable algorithm', () => {
    const result = normalizeColorAlgorithmForQuantumMode('tdseDynamics', 'radialDistance')
    expect(result).toBe('phaseDensity')
  })

  it('falls back to purityMap when openQuantum is enabled', () => {
    const result = normalizeColorAlgorithmForQuantumMode(
      'harmonicOscillator',
      'invalid-algo' as never,
      true
    )
    expect(result).toBe('purityMap')
  })

  it('falls back to pauliSpinDensity for pauliSpinor object type', () => {
    const result = normalizeColorAlgorithmForQuantumMode(
      'harmonicOscillator',
      'invalid-algo' as never,
      false,
      undefined,
      undefined,
      'pauliSpinor'
    )
    expect(result).toBe('pauliSpinDensity')
  })

  it('returns particleAntiparticle for dirac with split field view', () => {
    const result = normalizeColorAlgorithmForQuantumMode(
      'diracEquation',
      'phaseDensity',
      false,
      'particleAntiparticleSplit'
    )
    expect(result).toBe('particleAntiparticle')
  })
})

describe('pauliFieldViewForColorAlgorithm', () => {
  it('maps known pauli algorithms to field views', () => {
    expect(pauliFieldViewForColorAlgorithm('pauliSpinDensity')).toBe('spinDensity')
    expect(pauliFieldViewForColorAlgorithm('pauliSpinExpectation')).toBe('spinExpectation')
    expect(pauliFieldViewForColorAlgorithm('pauliCoherence')).toBe('coherence')
  })

  it('defaults to totalDensity for unknown algorithms', () => {
    expect(pauliFieldViewForColorAlgorithm('radialDistance')).toBe('totalDensity')
    expect(pauliFieldViewForColorAlgorithm('')).toBe('totalDensity')
  })
})

describe('shouldForceFullRebuildForQuantumModeTransition', () => {
  it('returns false when previous is null (first build)', () => {
    expect(
      shouldForceFullRebuildForQuantumModeTransition(null, {
        quantumMode: 'harmonicOscillator',
        objectType: 'schroedinger',
      })
    ).toBe(false)
  })

  it('returns false when mode stays the same', () => {
    const config = {
      quantumMode: 'harmonicOscillator' as const,
      objectType: 'schroedinger' as const,
    }
    expect(shouldForceFullRebuildForQuantumModeTransition(config, config)).toBe(false)
  })

  it('returns true for object type change', () => {
    expect(
      shouldForceFullRebuildForQuantumModeTransition(
        { quantumMode: 'harmonicOscillator', objectType: 'schroedinger' },
        { quantumMode: 'harmonicOscillator', objectType: 'pauliSpinor' }
      )
    ).toBe(true)
  })

  it('returns true when transitioning to a compute mode', () => {
    expect(
      shouldForceFullRebuildForQuantumModeTransition(
        { quantumMode: 'harmonicOscillator', objectType: 'schroedinger' },
        { quantumMode: 'freeScalarField', objectType: 'schroedinger' }
      )
    ).toBe(true)
  })

  it('returns true when transitioning from a compute mode', () => {
    expect(
      shouldForceFullRebuildForQuantumModeTransition(
        { quantumMode: 'tdseDynamics', objectType: 'schroedinger' },
        { quantumMode: 'harmonicOscillator', objectType: 'schroedinger' }
      )
    ).toBe(true)
  })

  it('returns true for compute-to-compute transitions', () => {
    expect(
      shouldForceFullRebuildForQuantumModeTransition(
        { quantumMode: 'freeScalarField', objectType: 'schroedinger' },
        { quantumMode: 'tdseDynamics', objectType: 'schroedinger' }
      )
    ).toBe(true)
  })

  it('returns false for analytic-to-analytic transitions', () => {
    expect(
      shouldForceFullRebuildForQuantumModeTransition(
        { quantumMode: 'harmonicOscillator', objectType: 'schroedinger' },
        { quantumMode: 'hydrogenND', objectType: 'schroedinger' }
      )
    ).toBe(false)
  })
})

describe('shallowEqual', () => {
  it('returns false when first arg is null', () => {
    expect(shallowEqual(null, { a: 1 })).toBe(false)
  })

  it('returns true when all keys match', () => {
    expect(shallowEqual({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true)
  })

  it('returns false when any key differs', () => {
    expect(shallowEqual({ a: 1, b: 'x' }, { a: 1, b: 'y' })).toBe(false)
  })

  it('only compares keys from second argument', () => {
    // First arg has extra keys — those are ignored
    expect(shallowEqual({ a: 1, b: 'x', c: true }, { a: 1 })).toBe(true)
  })
})

describe('extractPPConfig', () => {
  it('extracts only post-processing fields', () => {
    const config = makePassConfig({
      bloomEnabled: true,
      antiAliasingMethod: 'smaa',
      paperEnabled: true,
      frameBlendingEnabled: true,
      skyboxEnabled: true,
      skyboxMode: 'procedural_aurora',
      temporalReprojectionEnabled: false,
    })

    const pp = extractPPConfig(config)

    expect(pp).toEqual({
      bloomEnabled: true,
      antiAliasingMethod: 'smaa',
      paperEnabled: true,
      frameBlendingEnabled: true,
      skyboxEnabled: true,
      skyboxMode: 'procedural_aurora',
      temporalReprojectionEnabled: false,
    })

    // Should not contain Schroedinger fields
    expect(Object.keys(pp)).not.toContain('dimension')
    expect(Object.keys(pp)).not.toContain('quantumMode')
  })
})

describe('computeCasSharpnessFromRenderScale', () => {
  it('returns 0 at full resolution (no upscaling needed)', () => {
    expect(computeCasSharpnessFromRenderScale(1.0)).toBe(0)
  })

  it('returns positive sharpness for downscaled rendering', () => {
    const sharpness = computeCasSharpnessFromRenderScale(0.5)
    expect(sharpness).toBeGreaterThan(0)
    expect(sharpness).toBeLessThanOrEqual(1)
  })

  it('returns higher sharpness for lower resolution scales', () => {
    const s1 = computeCasSharpnessFromRenderScale(0.75)
    const s2 = computeCasSharpnessFromRenderScale(0.5)
    expect(s2).toBeGreaterThan(s1)
  })

  it('clamps output to [0, 1] range', () => {
    expect(computeCasSharpnessFromRenderScale(0.1)).toBeLessThanOrEqual(1)
    expect(computeCasSharpnessFromRenderScale(2.0)).toBe(0)
  })
})
