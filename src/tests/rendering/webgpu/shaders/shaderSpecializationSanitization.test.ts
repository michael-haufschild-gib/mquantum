import { describe, expect, it } from 'vitest'

import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'
import { composeDensityGridComputeShader } from '@/rendering/webgpu/shaders/schroedinger/compute/compose'
import { composeWignerCacheComputeShader } from '@/rendering/webgpu/shaders/schroedinger/compute/composeWignerCache'
import { composeWignerSpatialComputeShader } from '@/rendering/webgpu/shaders/schroedinger/compute/composeWignerSpatial'
import {
  generateHydrogenNDCachedBlock,
  getHydrogenNDGeneratedBlock,
} from '@/rendering/webgpu/shaders/schroedinger/quantum/hydrogenNDVariants.wgsl'

const expectNoInvalidWgslLiterals = (wgsl: string): void => {
  expect(wgsl).not.toMatch(/=\s*(NaN|Infinity|undefined)\b/)
  expect(wgsl).not.toMatch(/\b(?:NaN|Infinity|undefined)\s*[;,)<>]/)
  expect(wgsl).not.toContain('NaND')
}

describe('shader specialization sanitization', () => {
  it('sanitizes density-grid compute dimensions before emitting WGSL constants', () => {
    const { wgsl: nanWgsl, features } = composeDensityGridComputeShader({
      dimension: Number.NaN,
      quantumMode: 'harmonicOscillator',
    })
    expect(nanWgsl).toContain('const ACTUAL_DIM: i32 = 3;')
    expect(features).toContain('3D Quantum')
    expectNoInvalidWgslLiterals(nanWgsl)

    const { wgsl: fractionalWgsl } = composeDensityGridComputeShader({
      dimension: 4.9,
      quantumMode: 'hydrogenND',
    })
    expect(fractionalWgsl).toContain('const ACTUAL_DIM: i32 = 4;')
    expect(fractionalWgsl).toContain('const HYDROGEN_ND_DIMENSION: i32 = 4;')
    expectNoInvalidWgslLiterals(fractionalWgsl)
  })

  it('sanitizes Wigner compute dimensions before emitting WGSL constants', () => {
    const { wgsl: cacheWgsl } = composeWignerCacheComputeShader({
      dimension: Number.POSITIVE_INFINITY,
      quantumMode: 'hydrogenND',
    })
    expect(cacheWgsl).toContain('const ACTUAL_DIM: i32 = 3;')
    expect(cacheWgsl).toContain('const HYDROGEN_ND_DIMENSION: i32 = 3;')
    expectNoInvalidWgslLiterals(cacheWgsl)

    const { wgsl: spatialWgsl } = composeWignerSpatialComputeShader({
      dimension: 11.8,
      quantumMode: 'harmonicOscillator',
    })
    expect(spatialWgsl).toContain('const ACTUAL_DIM: i32 = 11;')
    expectNoInvalidWgslLiterals(spatialWgsl)
  })

  it('sanitizes fragment shader dimensions before building shader blocks', () => {
    const { wgsl, features } = composeSchroedingerShader({
      dimension: Number.NaN,
      quantumMode: 'hydrogenND',
      useDensityGrid: false,
    })

    expect(wgsl).toContain('const ACTUAL_DIM: i32 = 3;')
    expect(features).toContain('3D Quantum')
    expectNoInvalidWgslLiterals(wgsl)
  })

  it('sanitizes invalid HO term-count specializations', () => {
    const { wgsl: disabledWgsl } = composeDensityGridComputeShader({
      dimension: 4,
      quantumMode: 'harmonicOscillator',
      termCount: Number.NaN as never,
    })
    expect(disabledWgsl).toContain('const HO_UNROLLED: bool = false;')
    expectNoInvalidWgslLiterals(disabledWgsl)

    const { wgsl: clampedWgsl, features } = composeDensityGridComputeShader({
      dimension: 4,
      quantumMode: 'harmonicOscillator',
      termCount: 99 as never,
    })
    expect(clampedWgsl).toContain('const HO_TERM_COUNT: i32 = 8;')
    expect(clampedWgsl).toContain('fn evalHOSuperposition8(')
    expect(features).toContain('HO 8-term unrolled')
    expectNoInvalidWgslLiterals(clampedWgsl)
  })

  it('sanitizes density-grid storage format before emitting storage texture bindings', () => {
    const { wgsl } = composeDensityGridComputeShader({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
      storageFormat: 'bad-format' as never,
    })

    expect(wgsl).toContain('texture_storage_3d<r16float, write>')
    expect(wgsl).not.toContain('bad-format')
    expectNoInvalidWgslLiterals(wgsl)
  })

  it('sanitizes density-grid density-matrix mode to strict booleans', () => {
    const { wgsl, features } = composeDensityGridComputeShader({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
      useDensityMatrix: 'false' as never,
    })

    expect(wgsl).toContain('const USE_DENSITY_MATRIX: bool = false;')
    expect(wgsl).not.toContain('OpenQuantumUniforms')
    expect(wgsl).not.toContain('@binding(4)')
    expect(features).not.toContain('Density Matrix (Open Quantum)')
    expectNoInvalidWgslLiterals(wgsl)
  })

  it('sanitizes fragment shader feature booleans and finite numeric defines', () => {
    const { wgsl, features } = composeSchroedingerShader({
      dimension: 3,
      temporalAccumulation: 'false' as never,
      useDensityGrid: 'false' as never,
      densityGridHasPhase: 'false' as never,
      densityGridSize: Number.NaN,
      colorAlgorithm: Number.NaN,
      isWigner: 'false' as never,
      isFreeScalar: 'false' as never,
      crossSectionEnabled: 'off' as never,
      probabilityCurrentEnabled: 'on' as never,
      fastGridEmission: 'false' as never,
      sampleSpaceRotation: 'false' as never,
    })

    expect(wgsl).toContain('const TEMPORAL_ENABLED: bool = false;')
    expect(wgsl).toContain('const USE_DENSITY_GRID: bool = false;')
    expect(wgsl).toContain('const DENSITY_GRID_HAS_PHASE: bool = false;')
    expect(wgsl).toContain('const DENSITY_GRID_SIZE: f32 = 64.0;')
    expect(wgsl).toContain('const COLOR_ALGORITHM: i32 = 4;')
    expect(wgsl).toContain('const IS_WIGNER: bool = false;')
    expect(wgsl).toContain('const IS_FREE_SCALAR: bool = false;')
    expect(wgsl).toContain('const FEATURE_CROSS_SECTION: bool = true;')
    expect(wgsl).toContain('const FEATURE_PROBABILITY_CURRENT: bool = true;')
    expect(wgsl).toContain('const FAST_GRID_EMISSION: bool = false;')
    expect(wgsl).toContain('const SAMPLE_SPACE_ROTATION: bool = false;')
    expect(features).toContain('Color: Mixed')
    expectNoInvalidWgslLiterals(wgsl)
  })

  it('sanitizes direct hydrogen ND generated-block selection', () => {
    const fallbackWgsl = getHydrogenNDGeneratedBlock(Number.NaN)
    expect(fallbackWgsl).toContain('fn evalHydrogenNDPsi3D(')
    expectNoInvalidWgslLiterals(fallbackWgsl)

    const twoDimWgsl = getHydrogenNDGeneratedBlock(2)
    expect(twoDimWgsl).toContain('fn evalHydrogenNDPsi2D(')
    expect(twoDimWgsl).not.toContain('x2*x2')
    expectNoInvalidWgslLiterals(twoDimWgsl)

    const clampedWgsl = getHydrogenNDGeneratedBlock(99)
    expect(clampedWgsl).toContain('fn evalHydrogenNDPsi11D(')
    expectNoInvalidWgslLiterals(clampedWgsl)
  })

  it('sanitizes cached hydrogen ND block generation and avoids invalid cached 2D WGSL', () => {
    const fallbackWgsl = generateHydrogenNDCachedBlock(Number.POSITIVE_INFINITY)
    expect(fallbackWgsl).toContain('fn evalHydrogenNDPsi3D(')
    expect(fallbackWgsl).not.toContain('Cached')
    expectNoInvalidWgslLiterals(fallbackWgsl)

    const twoDimWgsl = generateHydrogenNDCachedBlock(2)
    expect(twoDimWgsl).toContain('fn evalHydrogenNDPsi2D(')
    expect(twoDimWgsl).not.toContain('x2*x2')
    expectNoInvalidWgslLiterals(twoDimWgsl)

    const cachedWgsl = generateHydrogenNDCachedBlock(11.9)
    expect(cachedWgsl).toContain('fn evalHydrogenNDPsi11DCached(')
    expectNoInvalidWgslLiterals(cachedWgsl)
  })
})
