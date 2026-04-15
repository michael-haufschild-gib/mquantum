/**
 * Tests for scenePassSetup — config extraction, normalization,
 * and mode transition logic.
 */

import { describe, expect, it } from 'vitest'

import { isComputeQuantumType } from '@/lib/geometry/registry/helpers'
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
    crossSectionEnabled: false,
    probabilityCurrentEnabled: false,
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

  it('end-to-end: extractSchrodingerConfig drops kSpaceOccupation under freeScalar+vacuumNoise', () => {
    // Integration regression for PR #38 round 3: the fullConfig → normalize
    // path must respect freeScalarInitialCondition. Before the fix, loading a
    // preset with `quantumMode: freeScalarField`, `freeScalar.initialCondition:
    // vacuumNoise`, `colorAlgorithm: kSpaceOccupation` would flow through
    // extractSchrodingerConfig unchanged (the normalizer hardcoded
    // freeScalarInitialCondition=undefined) and render as a blank map.
    const extracted = extractSchrodingerConfig(
      makePassConfig({
        quantumMode: 'freeScalarField',
        colorAlgorithm: 'kSpaceOccupation',
        freeScalarInitialCondition: 'vacuumNoise',
      })
    )
    expect(extracted.colorAlgorithm).not.toBe('kSpaceOccupation')
    expect(extracted.colorAlgorithm).toBe('phaseDensity')
  })

  it('end-to-end: extractSchrodingerConfig keeps kSpaceOccupation under freeScalar+gaussianPacket', () => {
    const extracted = extractSchrodingerConfig(
      makePassConfig({
        quantumMode: 'freeScalarField',
        colorAlgorithm: 'kSpaceOccupation',
        freeScalarInitialCondition: 'gaussianPacket',
      })
    )
    expect(extracted.colorAlgorithm).toBe('kSpaceOccupation')
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

  it('disables temporal reprojection for wheelerDeWitt (compute mode)', () => {
    // Regression: WebGPUScene's disable list had hard-coded compute-mode keys
    // that omitted wheelerDeWitt; extractSchrodingerConfig correctly derived
    // the compute-mode set from the registry, producing a mismatch with PP.
    // Both gates key off `isComputeQuantumType`, so if `wheelerDeWitt` ever
    // falls out of the `compute` category the WebGPUScene-level gate would
    // silently re-enable temporal reprojection — assert the registry
    // classification explicitly so the regression cannot sneak back in.
    expect(isComputeQuantumType('wheelerDeWitt')).toBe(true)
    const extracted = extractSchrodingerConfig(
      makePassConfig({ quantumMode: 'wheelerDeWitt', temporalReprojectionEnabled: true })
    )
    expect(extracted.temporalReprojectionEnabled).toBe(false)
    expect(extracted.eigenfunctionCacheEnabled).toBe(false)
    expect(extracted.analyticalGradientEnabled).toBe(false)
  })

  it('forces dimension >= 3 for BEC and Dirac at lower dimension', () => {
    const bec = extractSchrodingerConfig(
      makePassConfig({ quantumMode: 'becDynamics', dimension: 2 })
    )
    expect(bec.dimension).toBe(3)

    const dirac = extractSchrodingerConfig(
      makePassConfig({ quantumMode: 'diracEquation', dimension: 2 })
    )
    expect(dirac.dimension).toBe(3)
  })

  it('clamps dimension to 3 for TDSE and freeScalarField', () => {
    const tdse = extractSchrodingerConfig(
      makePassConfig({ quantumMode: 'tdseDynamics', dimension: 2 })
    )
    expect(tdse.dimension).toBe(3)

    const fs = extractSchrodingerConfig(
      makePassConfig({ quantumMode: 'freeScalarField', dimension: 2 })
    )
    expect(fs.dimension).toBe(3)
  })

  it('all compute modes force identical analytic feature overrides', () => {
    const computeModes = [
      'freeScalarField',
      'tdseDynamics',
      'becDynamics',
      'diracEquation',
      'quantumWalk',
      'wheelerDeWitt',
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

  it('all compute modes force identical gate overrides including gradient and cross-section', () => {
    const computeModes = [
      'freeScalarField',
      'tdseDynamics',
      'becDynamics',
      'diracEquation',
      'quantumWalk',
      'wheelerDeWitt',
    ] as const
    for (const mode of computeModes) {
      const extracted = extractSchrodingerConfig(
        makePassConfig({
          quantumMode: mode,
          analyticalGradientEnabled: true,
          fastEigenInterpolationEnabled: true,
          crossSectionEnabled: true,
          probabilityCurrentEnabled: true,
          openQuantumEnabled: true,
        })
      )
      expect(extracted.analyticalGradientEnabled, `${mode}: analyticalGradientEnabled`).toBe(false)
      expect(
        extracted.fastEigenInterpolationEnabled,
        `${mode}: fastEigenInterpolationEnabled`
      ).toBe(false)
      expect(extracted.crossSectionEnabled, `${mode}: crossSectionEnabled`).toBe(false)
      expect(extracted.probabilityCurrentEnabled, `${mode}: probabilityCurrentEnabled`).toBe(false)
      expect(extracted.openQuantumEnabled, `${mode}: openQuantumEnabled`).toBe(false)
    }
  })

  it('dimension=2 disables analytical features (eigenfunction cache, gradient, temporal, cross-section)', () => {
    const extracted = extractSchrodingerConfig(
      makePassConfig({
        quantumMode: 'harmonicOscillator',
        dimension: 2,
        eigenfunctionCacheEnabled: true,
        analyticalGradientEnabled: true,
        fastEigenInterpolationEnabled: true,
        temporalReprojectionEnabled: true,
        crossSectionEnabled: true,
        probabilityCurrentEnabled: true,
      })
    )
    expect(extracted.eigenfunctionCacheEnabled).toBe(false)
    expect(extracted.analyticalGradientEnabled).toBe(false)
    expect(extracted.fastEigenInterpolationEnabled).toBe(false)
    expect(extracted.temporalReprojectionEnabled).toBe(false)
    expect(extracted.crossSectionEnabled).toBe(false)
    expect(extracted.probabilityCurrentEnabled).toBe(false)
    // dimension itself stays at 2 (not clamped for analytic modes)
    expect(extracted.dimension).toBe(2)
  })

  it('representation=wigner disables analytical features same as dimension=2', () => {
    const extracted = extractSchrodingerConfig(
      makePassConfig({
        quantumMode: 'harmonicOscillator',
        dimension: 4,
        representation: 'wigner',
        eigenfunctionCacheEnabled: true,
        analyticalGradientEnabled: true,
        fastEigenInterpolationEnabled: true,
        temporalReprojectionEnabled: true,
        crossSectionEnabled: true,
        probabilityCurrentEnabled: true,
      })
    )
    expect(extracted.eigenfunctionCacheEnabled).toBe(false)
    expect(extracted.analyticalGradientEnabled).toBe(false)
    expect(extracted.fastEigenInterpolationEnabled).toBe(false)
    expect(extracted.temporalReprojectionEnabled).toBe(false)
    expect(extracted.crossSectionEnabled).toBe(false)
    expect(extracted.probabilityCurrentEnabled).toBe(false)
    // Wigner still preserves its representation
    expect(extracted.representation).toBe('wigner')
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

  it('falls back to phaseCyclicUniform for quantumWalk with unavailable algorithm', () => {
    const result = normalizeColorAlgorithmForQuantumMode('quantumWalk', 'radialDistance')
    expect(result).toBe('phaseCyclicUniform')
  })

  it('falls back to phaseCyclicUniform for quantumWalk with domainColoringPsi', () => {
    const result = normalizeColorAlgorithmForQuantumMode('quantumWalk', 'domainColoringPsi')
    expect(result).toBe('phaseCyclicUniform')
  })

  it('falls back to phaseCyclicUniform for quantumWalk with phaseDensity', () => {
    const result = normalizeColorAlgorithmForQuantumMode('quantumWalk', 'phaseDensity')
    expect(result).toBe('phaseCyclicUniform')
  })

  it('falls back to purityMap when openQuantum is enabled', () => {
    const result = normalizeColorAlgorithmForQuantumMode(
      'harmonicOscillator',
      'invalid-algo' as never,
      true
    )
    expect(result).toBe('purityMap')
  })

  it('falls back to pauliSpinDensity for pauliSpinor object type with no field view hint', () => {
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

  it('honors pauli fieldView when normalising a stale color algorithm', () => {
    // Regression: previously the function ignored pauliFieldView entirely
    // and always returned 'pauliSpinDensity' as the Pauli fallback. A
    // preset that set pauliFieldView='spinExpectation' under a stale
    // colorAlgorithm would silently downgrade to spinDensity even though
    // the density grid carries spin-expectation channels. The function
    // now mirrors the Dirac particleAntiparticleSplit handling.
    expect(
      normalizeColorAlgorithmForQuantumMode(
        'harmonicOscillator',
        'invalid-algo' as never,
        false,
        undefined,
        'spinExpectation',
        'pauliSpinor'
      )
    ).toBe('pauliSpinExpectation')
    expect(
      normalizeColorAlgorithmForQuantumMode(
        'harmonicOscillator',
        'invalid-algo' as never,
        false,
        undefined,
        'coherence',
        'pauliSpinor'
      )
    ).toBe('pauliCoherence')
    expect(
      normalizeColorAlgorithmForQuantumMode(
        'harmonicOscillator',
        'invalid-algo' as never,
        false,
        undefined,
        'totalDensity',
        'pauliSpinor'
      )
    ).toBe('blackbody')
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

  it('drops stale kSpaceOccupation for freeScalarField + vacuumNoise', () => {
    // Regression: exact vacuum has n_k = 0 for all modes, so `kSpaceOccupation`
    // produces an intentionally blank map. `getAvailableColorAlgorithms` hides
    // it for this combination, but the normalizer path previously hardcoded
    // `freeScalarInitialCondition: undefined` when calling it — letting a
    // preset-carried `kSpaceOccupation` survive normalization and render as
    // a blank panel at runtime. The fix threads the initial condition through
    // so the availability check runs on the real (initialCondition, algo)
    // pair and the stale algorithm falls back to `phaseDensity`.
    const result = normalizeColorAlgorithmForQuantumMode(
      'freeScalarField',
      'kSpaceOccupation',
      false,
      undefined,
      undefined,
      'schroedinger',
      undefined,
      'vacuumNoise'
    )
    expect(result).toBe('phaseDensity')
  })

  it('preserves kSpaceOccupation for freeScalarField + gaussianPacket', () => {
    // Non-vacuum initial conditions have nonzero mode occupation, so
    // kSpaceOccupation remains valid and must NOT be rewritten by the
    // normalizer even though the normalizer now knows about initialCondition.
    const result = normalizeColorAlgorithmForQuantumMode(
      'freeScalarField',
      'kSpaceOccupation',
      false,
      undefined,
      undefined,
      'schroedinger',
      undefined,
      'gaussianPacket'
    )
    expect(result).toBe('kSpaceOccupation')
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
