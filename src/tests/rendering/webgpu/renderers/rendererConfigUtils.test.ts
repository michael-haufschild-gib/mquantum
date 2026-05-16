/**
 * Tests for the renderer-config helpers: pure logic that decides shader
 * features, pipeline outputs, density grid sizing, and the pipeline cache
 * key. A bug here flips a feature flag the wrong way and silently disables
 * a render path; the cache key is the dirty key that determines pipeline
 * reuse, so a hash collision would render mismatched shaders.
 */
import { describe, expect, it } from 'vitest'

import {
  applyModeOverrides,
  buildPipelineOutputs,
  buildShaderConfig,
  computeOpenQuantumGridSize,
  computePipelineCacheKey,
  isComputeQuantumMode,
  isPipeline2D,
} from '@/rendering/webgpu/renderers/rendererConfigUtils'
import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'
import { removeDefaultNodalSpecializationOverrides } from '@/rendering/webgpu/shaders/schroedinger/composeConfig'

describe('isComputeQuantumMode', () => {
  it('returns true for compute-mode quantum types (TDSE, BEC, Dirac, FSF, etc.)', () => {
    expect(isComputeQuantumMode({ quantumMode: 'tdseDynamics' } as never)).toBe(true)
    expect(isComputeQuantumMode({ quantumMode: 'becDynamics' } as never)).toBe(true)
    expect(isComputeQuantumMode({ quantumMode: 'diracEquation' } as never)).toBe(true)
    expect(isComputeQuantumMode({ quantumMode: 'freeScalarField' } as never)).toBe(true)
    expect(isComputeQuantumMode({ quantumMode: 'quantumWalk' } as never)).toBe(true)
  })

  it('returns true when isPauli is set, regardless of quantumMode', () => {
    expect(isComputeQuantumMode({ isPauli: true } as never)).toBe(true)
    expect(
      isComputeQuantumMode({ quantumMode: 'harmonicOscillator', isPauli: true } as never)
    ).toBe(true)
  })

  it('returns false for inline-analytic modes (HO, Hydrogen) without isPauli', () => {
    // Note: antiDeSitter is registered as a compute mode in the registry
    // because it owns a CPU/GPU density-grid path, so it goes through the
    // compute branch — not the inline analytic shader.
    expect(isComputeQuantumMode({ quantumMode: 'harmonicOscillator' } as never)).toBe(false)
    expect(isComputeQuantumMode({ quantumMode: 'hydrogenND' } as never)).toBe(false)
    expect(isComputeQuantumMode({ quantumMode: 'hydrogenNDCoupled' } as never)).toBe(false)
  })

  it('returns false when quantumMode is missing and isPauli is not set', () => {
    expect(isComputeQuantumMode({} as never)).toBe(false)
  })
})

describe('isPipeline2D', () => {
  it('returns true for non-compute 2D dimension', () => {
    expect(isPipeline2D({ dimension: 2, quantumMode: 'harmonicOscillator' } as never)).toBe(true)
  })

  it('returns true for non-compute Wigner representation regardless of dimension', () => {
    expect(
      isPipeline2D({
        dimension: 3,
        representation: 'wigner',
        quantumMode: 'harmonicOscillator',
      } as never)
    ).toBe(true)
  })

  it('returns false for 3D position-space analytic modes', () => {
    expect(isPipeline2D({ dimension: 3, quantumMode: 'harmonicOscillator' } as never)).toBe(false)
  })

  it('returns false in compute modes even at dimension 2 (no 2D compute path exists)', () => {
    expect(isPipeline2D({ dimension: 2, quantumMode: 'tdseDynamics' } as never)).toBe(false)
  })
})

describe('computeOpenQuantumGridSize', () => {
  it('returns the base size for K ≤ 6 (no reduction)', () => {
    expect(computeOpenQuantumGridSize(96, 1)).toBe(96)
    expect(computeOpenQuantumGridSize(96, 6)).toBe(96)
  })

  it('caps at 48 for 6 < K ≤ 10 (mid-basis)', () => {
    expect(computeOpenQuantumGridSize(96, 7)).toBe(48)
    expect(computeOpenQuantumGridSize(96, 10)).toBe(48)
  })

  it('caps at 32 for K > 10 (large basis)', () => {
    expect(computeOpenQuantumGridSize(96, 11)).toBe(32)
    expect(computeOpenQuantumGridSize(128, 50)).toBe(32)
  })

  it('never increases the base size — the cap is a min(), not a reset', () => {
    // Caller passes 32; we should not expand to 48 just because basisK is in
    // the mid range — the cap is "no larger than".
    expect(computeOpenQuantumGridSize(32, 7)).toBe(32)
    expect(computeOpenQuantumGridSize(24, 11)).toBe(24)
  })
})

describe('applyModeOverrides', () => {
  it('returns a defaults-filled config when called with undefined', () => {
    const cfg = applyModeOverrides(undefined)
    expect(cfg.dimension).toBe(3)
    expect(cfg.quantumMode).toBe('harmonicOscillator')
    expect(cfg.temporal).toBe(false)
    expect(cfg.nodalEnabled).toBe(true)
    expect(cfg.phaseMaterialityEnabled).toBe(true)
  })

  it('clears temporal and cache flags in 2D mode', () => {
    const cfg = applyModeOverrides({
      dimension: 2,
      temporal: true,
      eigenfunctionCacheEnabled: true,
      analyticalGradientEnabled: true,
      fastEigenInterpolationEnabled: true,
    } as never)
    expect(cfg.temporal).toBe(false)
    expect(cfg.eigenfunctionCacheEnabled).toBe(false)
    expect(cfg.analyticalGradientEnabled).toBe(false)
    expect(cfg.fastEigenInterpolationEnabled).toBe(false)
  })

  it('clears temporal and bumps dimension to mode minimum in compute modes', () => {
    const cfg = applyModeOverrides({
      dimension: 2,
      quantumMode: 'tdseDynamics',
      temporal: true,
      isosurface: true,
    } as never)
    expect(cfg.temporal).toBe(false)
    expect(cfg.isosurface).toBe(true)
    expect(cfg.dimension).toBeGreaterThanOrEqual(3)
  })

  it('preserves analytic 2D isosurface requests for isolines', () => {
    const cfg = applyModeOverrides({
      dimension: 2,
      quantumMode: 'harmonicOscillator',
      isosurface: true,
    } as never)
    expect(cfg.isosurface).toBe(true)
  })

  it('does not mutate the caller-supplied config', () => {
    const input = { dimension: 2, temporal: true } as never
    applyModeOverrides(input)
    // toEqual would still pass, this checks reference identity of nested
    // objects survives.
    expect(input).toEqual({ dimension: 2, temporal: true })
  })

  it('keeps 3D dimensions for compute modes (no upward bump beyond minimum)', () => {
    const cfg = applyModeOverrides({
      dimension: 5,
      quantumMode: 'tdseDynamics',
    } as never)
    expect(cfg.dimension).toBe(5)
  })

  it('preserves isosurface for Pauli spinor mode (density-grid isosurface path)', () => {
    const cfg = applyModeOverrides({
      dimension: 3,
      isPauli: true,
      isosurface: true,
    } as never)
    expect(cfg.isosurface).toBe(true)
  })
})

describe('buildShaderConfig', () => {
  it('disables analytic-only features but preserves isosurface in compute mode', () => {
    const cfg = buildShaderConfig({
      dimension: 3,
      quantumMode: 'tdseDynamics',
      nodalEnabled: true,
      phaseMaterialityEnabled: true,
      interferenceEnabled: true,
      uncertaintyBoundaryEnabled: true,
      analyticalGradientEnabled: true,
      fastEigenInterpolationEnabled: true,
      isosurface: true,
    } as never)
    expect(cfg.isosurface).toBe(true)
    expect(cfg.nodal).toBe(false)
    expect(cfg.phaseMateriality).toBe(false)
    expect(cfg.interference).toBe(false)
    expect(cfg.uncertaintyBoundary).toBe(false)
    expect(cfg.useEigenfunctionCache).toBe(false)
    expect(cfg.useAnalyticalGradient).toBe(false)
    expect(cfg.nodalSpecializationEnabled).toBe(false)
    expect(cfg.nodalDefinition).toBe('psiAbs')
    expect(cfg.nodalRenderMode).toBe('band')
    expect(cfg.nodalFamilyFilter).toBe('all')
    // Compute mode → quantumMode flagged as harmonicOscillator at the shader
    // level so the inline analytic path is unused.
    expect(cfg.quantumMode).toBe('harmonicOscillator')
    expect(cfg.termCount).toBe(1)
    expect(cfg.fastGridEmission).toBe(true)
  })

  it('allows isosurface with useDensityGrid for Pauli spinor mode', () => {
    const cfg = buildShaderConfig({
      dimension: 3,
      isPauli: true,
      isosurface: true,
    } as never)
    expect(cfg.isosurface).toBe(true)
    expect(cfg.useDensityGrid).toBe(true)
    expect(cfg.isPauli).toBe(true)
    expect(cfg.isFreeScalar).toBe(true)
    expect(cfg.fastGridEmission).toBe(true)
  })

  it('enables fast grid emission for every compute-grid shader and leaves analytic modes lit', () => {
    const ho = buildShaderConfig({ dimension: 3, quantumMode: 'harmonicOscillator' } as never)
    const hydrogen = buildShaderConfig({ dimension: 3, quantumMode: 'hydrogenND' } as never)
    const tdse = buildShaderConfig({ dimension: 3, quantumMode: 'tdseDynamics' } as never)
    const dirac = buildShaderConfig({ dimension: 3, quantumMode: 'diracEquation' } as never)
    const fsf = buildShaderConfig({ dimension: 3, quantumMode: 'freeScalarField' } as never)

    expect(ho.fastGridEmission).toBe(false)
    expect(hydrogen.fastGridEmission).toBe(false)
    expect(tdse.fastGridEmission).toBe(true)
    expect(dirac.fastGridEmission).toBe(true)
    expect(fsf.fastGridEmission).toBe(true)
  })

  it('threads spacetime lens toggles into shader compile flags', () => {
    const disabled = buildShaderConfig({
      dimension: 3,
      quantumMode: 'tdseDynamics',
      quantumBackreactionLensingEnabled: false,
      bilocalERBridgeEnabled: false,
      entropicTimeShearEnabled: false,
      spectralDimensionFlowEnabled: false,
      vacuumBubbleLensEnabled: false,
    } as never)
    expect(disabled.quantumBackreactionLensing).toBe(false)
    expect(disabled.bilocalERBridge).toBe(false)
    expect(disabled.entropicTimeShear).toBe(false)
    expect(disabled.spectralDimensionFlow).toBe(false)
    expect(disabled.vacuumBubbleLens).toBe(false)

    const enabled = buildShaderConfig({
      dimension: 3,
      quantumMode: 'tdseDynamics',
      quantumBackreactionLensingEnabled: true,
      bilocalERBridgeEnabled: true,
      entropicTimeShearEnabled: true,
      spectralDimensionFlowEnabled: true,
      vacuumBubbleLensEnabled: true,
    } as never)
    expect(enabled.quantumBackreactionLensing).toBe(true)
    expect(enabled.bilocalERBridge).toBe(true)
    expect(enabled.entropicTimeShear).toBe(true)
    expect(enabled.spectralDimensionFlow).toBe(true)
    expect(enabled.vacuumBubbleLens).toBe(true)
  })

  it('specializes compute-grid overlay branches by quantum mode', () => {
    const tdse = buildShaderConfig({ dimension: 3, quantumMode: 'tdseDynamics' } as never)
    const bec = buildShaderConfig({ dimension: 3, quantumMode: 'becDynamics' } as never)
    const dirac = buildShaderConfig({ dimension: 3, quantumMode: 'diracEquation' } as never)
    const wdw = buildShaderConfig({ dimension: 3, quantumMode: 'wheelerDeWitt' } as never)
    const ads = buildShaderConfig({ dimension: 3, quantumMode: 'antiDeSitter' } as never)

    expect(tdse.negativeAlphaPotentialOverlay).toBe(true)
    expect(tdse.tdseBranchColor).toBe(true)
    expect(bec.negativeAlphaPotentialOverlay).toBe(false)
    expect(bec.tdseBranchColor).toBe(false)
    expect(dirac.negativeAlphaPotentialOverlay).toBe(true)
    expect(dirac.tdseBranchColor).toBe(false)
    expect(wdw.wdwOverlay).toBe(true)
    expect(wdw.gridPhaseOffset).toBe(true)
    expect(ads.adsAmplitude).toBe(true)
    expect(ads.gridPhaseOffset).toBe(true)
  })

  it('enables eigenfunction cache + analytical gradient by default in 3D analytic modes', () => {
    const cfg = buildShaderConfig({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
    } as never)
    expect(cfg.useEigenfunctionCache).toBe(true)
    expect(cfg.useAnalyticalGradient).toBe(true)
  })

  it('keeps analytic 2D isosurface requests for isoline shaders', () => {
    const cfg = buildShaderConfig({
      dimension: 2,
      quantumMode: 'harmonicOscillator',
      isosurface: true,
    } as never)
    expect(cfg.isosurface).toBe(true)
  })

  it('flags isWigner true for analytic Wigner mode and false in compute modes', () => {
    const wigner = buildShaderConfig({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
      representation: 'wigner',
    } as never)
    expect(wigner.isWigner).toBe(true)
    expect(wigner.useWignerCache).toBe(true)

    const compute = buildShaderConfig({
      dimension: 3,
      quantumMode: 'tdseDynamics',
      representation: 'wigner',
    } as never)
    expect(compute.isWigner).toBe(false)
    expect(compute.useWignerCache).toBe(false)
  })

  it('classifies free scalar field with hasPrecomputedNormals (binary-sign vs continuous-phase)', () => {
    const fsf = buildShaderConfig({
      dimension: 3,
      quantumMode: 'freeScalarField',
    } as never)
    expect(fsf.isFreeScalarField).toBe(true)
    expect(fsf.hasPrecomputedNormals).toBe(true)
    expect(fsf.isFreeScalar).toBe(true) // legacy flag still set for compute path

    const wdw = buildShaderConfig({
      dimension: 3,
      quantumMode: 'wheelerDeWitt',
    } as never)
    expect(wdw.isFreeScalarField).toBe(false) // WdW writes continuous phase
    expect(wdw.hasPrecomputedNormals).toBe(false)
  })

  it('flags isQuantumWalk only for quantumWalk mode', () => {
    expect(
      buildShaderConfig({ dimension: 3, quantumMode: 'quantumWalk' } as never).isQuantumWalk
    ).toBe(true)
    expect(
      buildShaderConfig({ dimension: 3, quantumMode: 'harmonicOscillator' } as never).isQuantumWalk
    ).toBe(false)
  })

  it('flags isAds only for antiDeSitter mode and enables sampleSpaceRotation accordingly', () => {
    const ads = buildShaderConfig({ dimension: 3, quantumMode: 'antiDeSitter' } as never)
    expect(ads.isAds).toBe(true)
    expect(ads.sampleSpaceRotation).toBe(true)
    const ho = buildShaderConfig({ dimension: 3, quantumMode: 'harmonicOscillator' } as never)
    expect(ho.isAds).toBe(false)
    expect(ho.sampleSpaceRotation).toBe(false)
  })

  it('threads nodal specialization fields into shader config for analytic nodal mode', () => {
    const cfg = buildShaderConfig({
      dimension: 3,
      quantumMode: 'hydrogenND',
      nodalEnabled: true,
      nodalDefinition: 'imagPart',
      nodalRenderMode: 'surface',
      nodalFamilyFilter: 'angular',
    } as never)

    expect(cfg.nodal).toBe(true)
    expect(cfg.nodalSpecializationEnabled).toBe(true)
    expect(cfg.nodalDefinition).toBe('imagPart')
    expect(cfg.nodalRenderMode).toBe('surface')
    expect(cfg.nodalFamilyFilter).toBe('angular')
  })

  it('emits nodal specialization WGSL defines', () => {
    const cfg = buildShaderConfig({
      dimension: 3,
      quantumMode: 'hydrogenND',
      nodalEnabled: true,
      nodalDefinition: 'imagPart',
      nodalRenderMode: 'surface',
      nodalFamilyFilter: 'angular',
    } as never)
    const { wgsl } = composeSchroedingerShader(cfg)

    expect(wgsl).toContain('const NODAL_SPECIALIZATION_ENABLED: bool = true;')
    expect(wgsl).toContain('const NODAL_SPECIALIZED_DEFINITION: i32 = 2;')
    expect(wgsl).toContain('const NODAL_SPECIALIZED_RENDER_MODE: i32 = 1;')
    expect(wgsl).toContain('const NODAL_SPECIALIZED_FAMILY_FILTER: i32 = 2;')
    expect(wgsl).not.toContain('override NODAL_SPECIALIZATION_ENABLED')
  })

  it('emits compile-time spacetime lens feature defines', () => {
    const cfg = buildShaderConfig({
      dimension: 3,
      quantumMode: 'tdseDynamics',
      quantumBackreactionLensingEnabled: false,
      bilocalERBridgeEnabled: false,
      entropicTimeShearEnabled: false,
      spectralDimensionFlowEnabled: false,
      vacuumBubbleLensEnabled: false,
    } as never)
    const { wgsl } = composeSchroedingerShader(cfg)

    expect(wgsl).toContain('const FEATURE_QUANTUM_BACKREACTION_LENSING: bool = false;')
    expect(wgsl).toContain('const FEATURE_BILOCAL_ER_BRIDGE: bool = false;')
    expect(wgsl).toContain('const FEATURE_ENTROPIC_TIME_SHEAR: bool = false;')
    expect(wgsl).toContain('const FEATURE_SPECTRAL_DIMENSION_FLOW: bool = false;')
    expect(wgsl).toContain('const FEATURE_VACUUM_BUBBLE_LENS: bool = false;')
    expect(wgsl).toContain('const FEATURE_NEGATIVE_ALPHA_POTENTIAL_OVERLAY: bool = true;')
    expect(wgsl).toContain('const FEATURE_WDW_OVERLAY: bool = false;')
    expect(wgsl).toContain('const FEATURE_TDSE_BRANCH_COLOR: bool = true;')
    expect(wgsl).toContain('const FEATURE_ADS_AMPLITUDE: bool = false;')
    expect(wgsl).toContain('const FEATURE_GRID_PHASE_OFFSET: bool = false;')
    expect(wgsl).toContain('let backreactionActive = isQuantumBackreactionActive(uniforms)')
    expect(wgsl).toContain('&& FEATURE_QUANTUM_BACKREACTION_LENSING;')
  })

  it('removes fallback nodal specialization overrides by symbol', () => {
    const wgsl = removeDefaultNodalSpecializationOverrides(`
const NODAL_SPECIALIZATION_ENABLED: bool = true;
  override   NODAL_SPECIALIZATION_ENABLED : bool = false;
override NODAL_SPECIALIZED_DEFINITION: i32 = 0;
override NODAL_SPECIALIZED_RENDER_MODE: i32 = 1;
override NODAL_SPECIALIZED_FAMILY_FILTER: i32 = 2;
fn keep() -> bool { return NODAL_SPECIALIZATION_ENABLED; }
`)

    expect(wgsl).toContain('const NODAL_SPECIALIZATION_ENABLED: bool = true;')
    expect(wgsl).toContain('fn keep() -> bool')
    expect(wgsl).not.toContain('override NODAL_SPECIAL')
  })
})

describe('buildPipelineOutputs', () => {
  it('returns object-color only in 2D', () => {
    const out = buildPipelineOutputs({ dimension: 2, quantumMode: 'harmonicOscillator' } as never)
    expect(out).toEqual([{ resourceId: 'object-color', access: 'write', binding: 0 }])
  })

  it('returns quarter-color + quarter-position when temporal accumulation is on (3D analytic)', () => {
    const out = buildPipelineOutputs({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
      temporal: true,
    } as never)
    expect(out).toHaveLength(2)
    expect(out[0]?.resourceId).toBe('quarter-color')
    expect(out[1]?.resourceId).toBe('quarter-position')
  })

  it('returns object-color in 3D non-temporal mode', () => {
    const out = buildPipelineOutputs({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
      temporal: false,
    } as never)
    expect(out).toEqual([{ resourceId: 'object-color', access: 'write', binding: 0 }])
  })

  it('falls back to a single object-color output when called with undefined', () => {
    const out = buildPipelineOutputs(undefined)
    expect(out).toEqual([{ resourceId: 'object-color', access: 'write', binding: 0 }])
  })

  it('forces single object-color output for compute modes — no temporal split', () => {
    const out = buildPipelineOutputs({
      dimension: 3,
      quantumMode: 'tdseDynamics',
      temporal: true,
    } as never)
    expect(out).toEqual([{ resourceId: 'object-color', access: 'write', binding: 0 }])
  })
})

describe('computePipelineCacheKey', () => {
  function makeShaderConfig(): import('@/rendering/webgpu/shaders/schroedinger/compose').SchroedingerWGSLShaderConfig {
    return {
      dimension: 3,
      isosurface: false,
      quantumMode: 'harmonicOscillator',
      termCount: 4,
      nodal: true,
      nodalSpecializationEnabled: true,
      nodalDefinition: 'psiAbs',
      nodalRenderMode: 'band',
      nodalFamilyFilter: 'all',
      colorAlgorithm: 0,
      temporalAccumulation: false,
      phaseMateriality: true,
      interference: true,
      uncertaintyBoundary: true,
      useEigenfunctionCache: true,
      useAnalyticalGradient: true,
      useRobustEigenInterpolation: false,
      useDensityGrid: true,
      densityGridSize: 96,
      isWigner: false,
      useWignerCache: false,
      isFreeScalar: false,
      isFreeScalarField: false,
      hasPrecomputedNormals: false,
      isQuantumWalk: false,
      isPauli: false,
      isAds: false,
      freeScalarAnalysis: false,
      useDensityMatrix: false,
      crossSectionEnabled: true,
      probabilityCurrentEnabled: true,
      sampleSpaceRotation: false,
    } as never
  }

  it('produces identical keys for identical inputs', () => {
    const a = makeShaderConfig()
    const b = makeShaderConfig()
    expect(computePipelineCacheKey(a, { dimension: 3 } as never)).toBe(
      computePipelineCacheKey(b, { dimension: 3 } as never)
    )
  })

  it('changes when isosurface flips', () => {
    const cfg = makeShaderConfig()
    const k1 = computePipelineCacheKey(cfg, { dimension: 3 } as never)
    const k2 = computePipelineCacheKey({ ...cfg, isosurface: true }, { dimension: 3 } as never)
    expect(k1).not.toBe(k2)
  })

  it('changes when temporal accumulation flips', () => {
    const cfg = makeShaderConfig()
    const k1 = computePipelineCacheKey(cfg, { dimension: 3 } as never)
    const k2 = computePipelineCacheKey({ ...cfg, temporalAccumulation: true }, {
      dimension: 3,
    } as never)
    expect(k1).not.toBe(k2)
  })

  it('changes when density grid size changes', () => {
    const cfg = makeShaderConfig()
    const k1 = computePipelineCacheKey(cfg, { dimension: 3 } as never)
    const k2 = computePipelineCacheKey({ ...cfg, densityGridSize: 64 }, { dimension: 3 } as never)
    expect(k1).not.toBe(k2)
  })

  it('changes when representation flips between position and wigner', () => {
    const cfg = makeShaderConfig()
    const k1 = computePipelineCacheKey(cfg, { dimension: 3, representation: 'position' } as never)
    const k2 = computePipelineCacheKey(cfg, { dimension: 3, representation: 'wigner' } as never)
    expect(k1).not.toBe(k2)
  })

  it('changes when nodal specialization fields change', () => {
    const cfg = makeShaderConfig()
    const k1 = computePipelineCacheKey(cfg, { dimension: 3 } as never)
    const k2 = computePipelineCacheKey(
      {
        ...cfg,
        nodalDefinition: 'imagPart',
        nodalRenderMode: 'surface',
        nodalFamilyFilter: 'angular',
      },
      { dimension: 3 } as never
    )

    expect(k1).not.toBe(k2)
  })
})
