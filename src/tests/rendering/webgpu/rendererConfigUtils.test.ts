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
import type { SchrodingerRendererConfig } from '@/rendering/webgpu/renderers/schrodingerRendererTypes'

const BASE_CONFIG: SchrodingerRendererConfig = {
  dimension: 4,
  isosurface: false,
  quantumMode: 'harmonicOscillator',
  temporal: false,
  nodalEnabled: true,
  phaseMaterialityEnabled: true,
  interferenceEnabled: true,
  uncertaintyBoundaryEnabled: true,
  analyticalGradientEnabled: true,
  fastEigenInterpolationEnabled: true,
}

describe('isComputeQuantumMode', () => {
  it('returns false for analytic modes', () => {
    expect(isComputeQuantumMode({ ...BASE_CONFIG, quantumMode: 'harmonicOscillator' })).toBe(false)
    expect(isComputeQuantumMode({ ...BASE_CONFIG, quantumMode: 'hydrogenND' })).toBe(false)
  })

  it('returns true for compute-grid modes', () => {
    expect(isComputeQuantumMode({ ...BASE_CONFIG, quantumMode: 'freeScalarField' })).toBe(true)
    expect(isComputeQuantumMode({ ...BASE_CONFIG, quantumMode: 'tdseDynamics' })).toBe(true)
    expect(isComputeQuantumMode({ ...BASE_CONFIG, quantumMode: 'becDynamics' })).toBe(true)
    expect(isComputeQuantumMode({ ...BASE_CONFIG, quantumMode: 'diracEquation' })).toBe(true)
  })

  it('returns true when isPauli flag is set', () => {
    expect(
      isComputeQuantumMode({ ...BASE_CONFIG, quantumMode: 'harmonicOscillator', isPauli: true })
    ).toBe(true)
  })
})

describe('isPipeline2D', () => {
  it('returns true for 2D non-compute mode', () => {
    expect(isPipeline2D({ ...BASE_CONFIG, dimension: 2 })).toBe(true)
  })

  it('returns true for wigner representation', () => {
    expect(isPipeline2D({ ...BASE_CONFIG, representation: 'wigner' })).toBe(true)
  })

  it('returns false for 3D+ non-wigner', () => {
    expect(isPipeline2D({ ...BASE_CONFIG, dimension: 3 })).toBe(false)
    expect(isPipeline2D({ ...BASE_CONFIG, dimension: 11 })).toBe(false)
  })

  it('returns false for compute modes even in 2D', () => {
    expect(isPipeline2D({ ...BASE_CONFIG, dimension: 2, quantumMode: 'tdseDynamics' })).toBe(false)
  })
})

describe('computeOpenQuantumGridSize', () => {
  it('preserves base size for small basis (K <= 6)', () => {
    expect(computeOpenQuantumGridSize(96, 4)).toBe(96)
    expect(computeOpenQuantumGridSize(96, 6)).toBe(96)
  })

  it('caps at 48 for medium basis (7 <= K <= 10)', () => {
    expect(computeOpenQuantumGridSize(96, 7)).toBe(48)
    expect(computeOpenQuantumGridSize(96, 10)).toBe(48)
    expect(computeOpenQuantumGridSize(32, 8)).toBe(32) // base already smaller
  })

  it('caps at 32 for large basis (K > 10)', () => {
    expect(computeOpenQuantumGridSize(96, 11)).toBe(32)
    expect(computeOpenQuantumGridSize(96, 14)).toBe(32)
  })
})

describe('applyModeOverrides', () => {
  it('disables temporal and cache for 2D pipeline', () => {
    const result = applyModeOverrides({
      ...BASE_CONFIG,
      dimension: 2,
      temporal: true,
      eigenfunctionCacheEnabled: true,
    })
    expect(result.temporal).toBe(false)
    expect(result.eigenfunctionCacheEnabled).toBe(false)
    expect(result.analyticalGradientEnabled).toBe(false)
  })

  it('disables temporal for compute modes', () => {
    const result = applyModeOverrides({
      ...BASE_CONFIG,
      quantumMode: 'tdseDynamics',
      temporal: true,
      isosurface: true,
    })
    expect(result.temporal).toBe(false)
    expect(result.isosurface).toBe(false)
  })

  it('preserves analytic 2D isosurface requests for isolines', () => {
    const result = applyModeOverrides({
      ...BASE_CONFIG,
      dimension: 2,
      isosurface: true,
    })
    expect(result.isosurface).toBe(true)
  })

  it('forces dimension >= 3 for BEC and Dirac', () => {
    const becResult = applyModeOverrides({
      ...BASE_CONFIG,
      quantumMode: 'becDynamics',
      dimension: 2,
    })
    expect(becResult.dimension).toBe(3)

    const diracResult = applyModeOverrides({
      ...BASE_CONFIG,
      quantumMode: 'diracEquation',
      dimension: 2,
    })
    expect(diracResult.dimension).toBe(3)
  })

  it('clamps dimension to 3 for TDSE and freeScalarField', () => {
    const tdseResult = applyModeOverrides({
      ...BASE_CONFIG,
      quantumMode: 'tdseDynamics',
      dimension: 2,
    })
    expect(tdseResult.dimension).toBe(3)

    const fsResult = applyModeOverrides({
      ...BASE_CONFIG,
      quantumMode: 'freeScalarField',
      dimension: 2,
    })
    expect(fsResult.dimension).toBe(3)
  })

  it('preserves config for standard 3D analytic mode', () => {
    const result = applyModeOverrides({
      ...BASE_CONFIG,
      temporal: true,
      eigenfunctionCacheEnabled: true,
    })
    expect(result.temporal).toBe(true)
    expect(result.eigenfunctionCacheEnabled).toBe(true)
    expect(result.analyticalGradientEnabled).toBe(true)
  })

  it('returns defaults when called with no config', () => {
    const result = applyModeOverrides()
    expect(result.dimension).toBe(3)
    expect(result.quantumMode).toBe('harmonicOscillator')
  })
})

describe('buildPipelineOutputs', () => {
  it('outputs only object-color for 2D pipeline', () => {
    const outputs = buildPipelineOutputs({ ...BASE_CONFIG, dimension: 2 })
    expect(outputs).toHaveLength(1)
    expect(outputs[0]?.resourceId).toBe('object-color')
  })

  it('outputs quarter-color + quarter-position for temporal 3D', () => {
    const outputs = buildPipelineOutputs({ ...BASE_CONFIG, temporal: true })
    expect(outputs).toHaveLength(2)
    expect(outputs[0]?.resourceId).toBe('quarter-color')
    expect(outputs[1]?.resourceId).toBe('quarter-position')
  })

  it('outputs object-color for standard 3D', () => {
    const outputs = buildPipelineOutputs(BASE_CONFIG)
    expect(outputs).toHaveLength(1)
    expect(outputs[0]?.resourceId).toBe('object-color')
  })
})

describe('buildShaderConfig', () => {
  it('disables analytic features for compute modes', () => {
    const config = buildShaderConfig({
      ...BASE_CONFIG,
      quantumMode: 'tdseDynamics',
      isosurface: true,
    })
    expect(config.isosurface).toBe(false)
    expect(config.nodal).toBe(false)
    expect(config.phaseMateriality).toBe(false)
    expect(config.interference).toBe(false)
    expect(config.uncertaintyBoundary).toBe(false)
    expect(config.temporalAccumulation).toBe(false)
    // `isFreeScalar` = compute-grid mode flag (all compute modes).
    // `isFreeScalarField` = strictly the FSF mode — must be false for TDSE.
    expect(config.isFreeScalar).toBe(true)
    expect(config.isFreeScalarField).toBe(false)
  })

  it('separates compute-grid flag from the true FSF semantic', () => {
    const fsf = buildShaderConfig({ ...BASE_CONFIG, quantumMode: 'freeScalarField' })
    expect(fsf.isFreeScalar).toBe(true)
    expect(fsf.isFreeScalarField).toBe(true)

    const wdw = buildShaderConfig({ ...BASE_CONFIG, quantumMode: 'wheelerDeWitt' })
    // WdW shares the compute-grid pipeline but writes continuous phase,
    // so it must NOT be classified as binary-sign (isFreeScalarField).
    expect(wdw.isFreeScalar).toBe(true)
    expect(wdw.isFreeScalarField).toBe(false)

    const ho = buildShaderConfig(BASE_CONFIG)
    expect(ho.isFreeScalar).toBe(false)
    expect(ho.isFreeScalarField).toBe(false)
  })

  it('enables analytic features for HO mode', () => {
    const config = buildShaderConfig(BASE_CONFIG)
    expect(config.nodal).toBe(true)
    expect(config.phaseMateriality).toBe(true)
    expect(config.interference).toBe(true)
    expect(config.uncertaintyBoundary).toBe(true)
  })

  it('sets isWigner for wigner representation', () => {
    const config = buildShaderConfig({ ...BASE_CONFIG, representation: 'wigner' })
    expect(config.isWigner).toBe(true)
    expect(config.useWignerCache).toBe(true)
  })

  it('keeps analytic 2D isosurface requests for isoline shaders', () => {
    const config = buildShaderConfig({ ...BASE_CONFIG, dimension: 2, isosurface: true })
    expect(config.isosurface).toBe(true)
  })
})

describe('computePipelineCacheKey', () => {
  it('produces identical keys for identical configs', () => {
    const config1 = buildShaderConfig(BASE_CONFIG)
    const config2 = buildShaderConfig(BASE_CONFIG)
    expect(computePipelineCacheKey(config1, BASE_CONFIG)).toBe(
      computePipelineCacheKey(config2, BASE_CONFIG)
    )
  })

  it('produces different keys when dimension changes', () => {
    const config3 = buildShaderConfig({ ...BASE_CONFIG, dimension: 3 })
    const config5 = buildShaderConfig({ ...BASE_CONFIG, dimension: 5 })
    expect(computePipelineCacheKey(config3, { ...BASE_CONFIG, dimension: 3 })).not.toBe(
      computePipelineCacheKey(config5, { ...BASE_CONFIG, dimension: 5 })
    )
  })

  it('produces different keys when quantum mode changes', () => {
    const configHO = buildShaderConfig(BASE_CONFIG)
    const configH = buildShaderConfig({ ...BASE_CONFIG, quantumMode: 'hydrogenND' })
    expect(computePipelineCacheKey(configHO, BASE_CONFIG)).not.toBe(
      computePipelineCacheKey(configH, { ...BASE_CONFIG, quantumMode: 'hydrogenND' })
    )
  })
})
