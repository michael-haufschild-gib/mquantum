import { describe, expect, it } from 'vitest'

import { DEFAULT_PAULI_CONFIG } from '@/lib/geometry/extended/pauli'
import {
  packPauliUniforms,
  PAULI_FIELD_VIEW_ENUM,
  PAULI_FIELD_VIEW_U32_OFFSET,
  PAULI_UNIFORM_SIZE,
} from '@/rendering/webgpu/passes/PauliComputePassBuffers'
import { pauliWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/pauliWriteGrid.wgsl'
import { generateMainBlockIsosurface } from '@/rendering/webgpu/shaders/schroedinger/mainIsosurface.wgsl'
import { generateMainBlockIsosurfaceTemporal } from '@/rendering/webgpu/shaders/schroedinger/mainIsosurfaceTemporal.wgsl'
import { densityGridSamplingBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/densityGridSampling.wgsl'
import {
  generateVolumeRaymarchGridBlock,
  generateVolumeRaymarchGridSimpleBlock,
} from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGrid.wgsl'

describe('Pauli spin helicity render view', () => {
  it('packs spinHelicity to its layout-mapped fieldView enum', () => {
    const uniformData = new ArrayBuffer(PAULI_UNIFORM_SIZE)
    const u32 = new Uint32Array(uniformData)
    const f32 = new Float32Array(uniformData)

    packPauliUniforms(u32, f32, {
      config: { ...DEFAULT_PAULI_CONFIG, fieldView: 'spinHelicity' },
      totalSites: 64 * 64 * 64,
      simTime: 0,
      maxDensity: 1,
      strides: [4096, 64, 1],
      boundingRadius: 5,
    })

    expect(u32[PAULI_FIELD_VIEW_U32_OFFSET]).toBe(PAULI_FIELD_VIEW_ENUM.spinHelicity)
  })

  it('packs berryCurvature to its layout-mapped fieldView enum', () => {
    const uniformData = new ArrayBuffer(PAULI_UNIFORM_SIZE)
    const u32 = new Uint32Array(uniformData)
    const f32 = new Float32Array(uniformData)

    packPauliUniforms(u32, f32, {
      config: { ...DEFAULT_PAULI_CONFIG, fieldView: 'berryCurvature' },
      totalSites: 64 * 64 * 64,
      simTime: 0,
      maxDensity: 1,
      strides: [4096, 64, 1],
      boundingRadius: 5,
    })

    expect(u32[PAULI_FIELD_VIEW_U32_OFFSET]).toBe(PAULI_FIELD_VIEW_ENUM.berryCurvature)
  })

  it('adds shader math for normalized spin curl helicity', () => {
    const branchStart = pauliWriteGridBlock.indexOf('params.fieldView == 4u')
    const branchEndRaw = pauliWriteGridBlock.indexOf(
      '} else if (params.fieldView == 5u)',
      branchStart
    )
    const branchEnd = branchEndRaw === -1 ? pauliWriteGridBlock.length : branchEndRaw
    const branch = pauliWriteGridBlock.slice(branchStart, branchEnd)

    expect(branchStart).toBeGreaterThanOrEqual(0)
    expect(branchEnd).toBeGreaterThan(branchStart)
    expect(pauliWriteGridBlock).toContain('fn spinUnitAt')
    expect(pauliWriteGridBlock).toContain('fn spinTextureNeighbor')
    expect(branch).toContain('let dSdx =')
    expect(branch).toContain('let dSdy =')
    expect(branch).toContain('let dSdz =')
    expect(branch).toContain('let curlS = vec3f(')
    expect(branch).toContain('let spinHelicity = dot(spin, curlS);')
    expect(branch).toContain('abs(tanh(0.15 * spinHelicity))')
    expect(branch).toContain('outA = totalNorm')
  })

  it('adds shader math for Berry-curvature two-form magnitude', () => {
    const branchStart = pauliWriteGridBlock.indexOf('params.fieldView == 5u')
    const branchEndRaw = pauliWriteGridBlock.indexOf('// Potential overlay', branchStart)
    const branchEnd = branchEndRaw === -1 ? pauliWriteGridBlock.length : branchEndRaw
    const branch = pauliWriteGridBlock.slice(branchStart, branchEnd)

    expect(branchStart).toBeGreaterThanOrEqual(0)
    expect(branchEnd).toBeGreaterThan(branchStart)
    expect(branch).toContain('var spinGrad: array<vec3f, 12>;')
    expect(branch).toContain('var minSpacing')
    expect(branch).toContain('var berryAbs')
    expect(branch).toContain('var berrySigned')
    expect(branch).toContain('let dSi = spinGrad[i];')
    expect(branch).toContain('let dSj = spinGrad[j];')
    expect(branch).toContain('0.5 * dot(spin, cross(dSi, dSj))')
    expect(branch).toContain('1.0 - exp(-curvatureArea)')
    expect(branch).toContain('outA = totalNorm')
  })

  it('uses alpha-channel total density for Pauli non-dual raymarch opacity', () => {
    for (const block of [
      generateVolumeRaymarchGridSimpleBlock(),
      generateVolumeRaymarchGridBlock(false),
    ]) {
      expect(block).toContain('fn gridOpacityDensity')
      expect(block).toContain('fn gridAdaptiveLogDensity')
      expect(block).toContain('IS_PAULI && !IS_DUAL_CHANNEL && DENSITY_GRID_HAS_PHASE')
      expect(block).toContain('var rho = gridOpacityDensity(gridSample) * adsAmplitudeSq;')
      expect(block).toContain('var colorRho: f32 = gridSample.r * adsAmplitudeSq;')
      expect(block).toContain('let midTotal = gridSkipDensity(probeMid);')
      expect(block).toContain('let logRhoForStep = gridAdaptiveLogDensity(rho, sCenter);')
    }
  })

  it('colors Pauli non-dual simple raymarching with the selected observable channel', () => {
    const block = generateVolumeRaymarchGridSimpleBlock()

    expect(block).toContain('let emissionRho = colorRho;')
    expect(block).toContain('let emissionS = colorS;')
  })

  it('uses alpha-channel density for Pauli non-dual isosurface hits', () => {
    for (const block of [
      generateMainBlockIsosurface({ useDensityGrid: true }),
      generateMainBlockIsosurfaceTemporal({ useDensityGrid: true }),
    ]) {
      expect(block).toContain('fn sampleIsosurfaceHitState(')
      expect(block).toContain('let gridSample = sampleDensityFromGrid(pos, uniforms);')
      expect(block).toContain('IS_PAULI && !IS_DUAL_CHANNEL && DENSITY_GRID_HAS_PHASE')
      expect(block).toContain(
        'rawRho = select(primaryRho, gridSample.r + gridSample.g, IS_DUAL_CHANNEL);'
      )
      expect(block).toContain('rho = isoDensityState.hitRho;')
      expect(block).toContain('var prevS = sFromRho(isoSeedState.hitRho);')
      expect(block).toContain('let midS = sFromRho(isoMidState.hitRho);')
      expect(block).toContain(
        'let primarySurfaceRho = select(gridColor.r, gridColor.a, IS_PAULI && !IS_DUAL_CHANNEL && DENSITY_GRID_HAS_PHASE);'
      )
      expect(block).toContain('rhoSurface = primarySurfaceRho * isoGain;')
      expect(block).toContain('colorRhoSurface = gridColor.r * isoGain;')
      expect(block).toContain(
        'var surfaceColor = computeBaseColor(colorRhoSurface, sSurface, phase, p, schroedinger);'
      )
      expect(block).not.toContain(
        'var surfaceColor = computeBaseColor(rhoSurface, sSurface, phase, p, schroedinger);'
      )
    }
  })

  it('uses alpha-channel density for Pauli non-dual grid normals', () => {
    expect(densityGridSamplingBlock).toContain('} else if (IS_PAULI && DENSITY_GRID_HAS_PHASE) {')
    expect(densityGridSamplingBlock).toContain('let gradX = sxp.a - sxn.a;')
    expect(densityGridSamplingBlock).toContain('return gradRho / (rhoCenter.a + 1e-8);')
  })
})
