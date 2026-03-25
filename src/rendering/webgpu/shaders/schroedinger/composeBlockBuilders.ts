/**
 * Shader Block Builders for Schrödinger Composer
 *
 * Extracted from compose.ts to manage complexity. Builds the quantum math
 * and volume rendering block arrays used by composeSchroedingerShader.
 *
 * @module rendering/webgpu/shaders/schroedinger/composeBlockBuilders
 */

import { generateObjectBindGroup } from '../shared/compose-helpers'
import type { ColorAlgorithm } from '../types'
import { generateAnalyticalGradientBlock } from './quantum/analyticalGradient.wgsl'
import { complexMathBlock } from './quantum/complex.wgsl'
import { densityPostMapBlock, densityPreMapBlock, generateMapPosToND } from './quantum/density.wgsl'
import {
  eigenfunctionCacheBindingsBlock,
  eigenfunctionCacheLookupBlock,
} from './quantum/eigenfunctionCache.wgsl'
import { hermiteBlock } from './quantum/hermite.wgsl'
import { ho1dBlock } from './quantum/ho1d.wgsl'
import {
  generateHoNDCachedBlock,
  generateHoNDCachedDispatchBlock,
  generateHoNDDispatchBlock,
  hoND2dBlock,
  hoND3dBlock,
  hoND4dBlock,
  hoND5dBlock,
  hoND6dBlock,
  hoND7dBlock,
  hoND8dBlock,
  hoND9dBlock,
  hoND10dBlock,
  hoND11dBlock,
} from './quantum/hoNDVariants.wgsl'
import {
  generateHOCachedDispatchBlock,
  generateHODispatchBlock,
  getHOCachedUnrolledBlocks,
  getHOUnrolledBlocks,
} from './quantum/hoSuperpositionVariants.wgsl'
import { hydrogenFamilyFallbackBlock } from './quantum/hydrogenFallback.wgsl'
import { hydrogenNDCommonBlock } from './quantum/hydrogenNDCommon.wgsl'
import {
  generateHydrogenNDCachedBlock,
  generateHydrogenNDCachedDispatchBlock,
  generateHydrogenNDDispatchBlock,
  hydrogenNDGen2dBlock,
  hydrogenNDGen3dBlock,
  hydrogenNDGen4dBlock,
  hydrogenNDGen5dBlock,
  hydrogenNDGen6dBlock,
  hydrogenNDGen7dBlock,
  hydrogenNDGen8dBlock,
  hydrogenNDGen9dBlock,
  hydrogenNDGen10dBlock,
  hydrogenNDGen11dBlock,
} from './quantum/hydrogenNDVariants.wgsl'
import { hydrogenRadialBlock } from './quantum/hydrogenRadial.wgsl'
import {
  getHydrogenNDCoupledBlocks,
  hypersphericalCoordsBlock,
  hypersphericalNormBlock,
  LN_GAMMA_HALF_INT_LUT_WGSL,
} from './quantum/hypersphericalHarmonics.wgsl'
import { laguerreBlock } from './quantum/laguerre.wgsl'
import { legendreBlock } from './quantum/legendre.wgsl'
import {
  psiBlockDynamicHarmonic,
  psiBlockHarmonic,
  psiBlockHydrogenND,
  psiBlockHydrogenNDCoupled,
} from './quantum/psi.wgsl'
import { sphericalHarmonicsBlock } from './quantum/sphericalHarmonics.wgsl'
import { wignerHOBlock } from './quantum/wignerHO.wgsl'
import { wignerHydrogenBlock } from './quantum/wignerHydrogen.wgsl'
import { schroedingerUniformsBlock } from './uniforms.wgsl'
import { absorptionBlock } from './volume/absorption.wgsl'
import { classicalOverlayStubWGSL, classicalOverlayWGSL } from './volume/classicalOverlay.wgsl'
import { crossSectionBlock, crossSectionStubBlock } from './volume/crossSection.wgsl'
import {
  analysisTextureSamplingBlock,
  densityGridSamplingBlock,
  generateAnalysisTextureBindings,
  generateDensityGridFragmentBindings,
  generateNormalGridFragmentBinding,
} from './volume/densityGridSampling.wgsl'
import {
  emissionPostBlock,
  generateComputeBaseColor,
  generateEmissionPreBlock,
} from './volume/emission.wgsl'
import {
  generateVolumeRaymarchGridBlock,
  nodalSurfacesBlock,
  nodalSurfacesStubBlock,
  probabilityCurrentBlock,
  probabilityCurrentStubBlock,
  volumeGradientBlock,
  volumeIntegrationBlock,
  volumeRaymarchBlock,
} from './volume/integration.wgsl'
import { isolines2DBlock, isolines2DStubBlock } from './volume/isolines2D.wgsl'
import { nodalLines2DBlock, nodalLines2DStubBlock } from './volume/nodalLines2D.wgsl'
import { radialProbabilityBlock, radialProbabilityStubBlock } from './volume/radialProbability.wgsl'

/** Shader block entry for assembleShaderBlocks. */
export interface ShaderBlockEntry {
  name: string
  content: string
  condition?: boolean
}

/** Build the bind group block with dynamic attachments. */
export function buildBindGroupBlock(opts: {
  useCache: boolean
  isWigner: boolean
  useWignerCache: boolean
  useDensityGrid: boolean
  usePrecomputedNormals: boolean
  freeScalarAnalysis: boolean
}): string {
  return (
    schroedingerUniformsBlock +
    '\n' +
    generateObjectBindGroup(2, 'SchroedingerUniforms', 'schroedinger', 0) +
    '\n' +
    generateObjectBindGroup(2, 'BasisVectors', 'basis', 1) +
    (opts.useCache ? '\n' + eigenfunctionCacheBindingsBlock : '') +
    (opts.isWigner && opts.useWignerCache
      ? '\n' +
        /* wgsl */ `
// Wigner cache texture + sampler (pre-computed W(x,p) grid)
@group(2) @binding(2) var wignerCacheTexture: texture_2d<f32>;
@group(2) @binding(3) var wignerCacheSampler: sampler;`
      : '') +
    (opts.useDensityGrid ? '\n' + generateDensityGridFragmentBindings(4) : '') +
    (opts.freeScalarAnalysis ? '\n' + generateAnalysisTextureBindings(6) : '') +
    (opts.usePrecomputedNormals ? '\n' + generateNormalGridFragmentBinding(7) : '')
  )
}

/** Build quantum math shader blocks (HO basis, hydrogen, Wigner, superposition). */
/** Build shader blocks for the coupled hydrogen ND mode (hyperspherical harmonics). */
function buildCoupledHydrogenBlocks(dim: number, isCoupled: boolean): ShaderBlockEntry[] {
  if (!isCoupled) return []
  // In 2D, hyperspherical harmonics don't exist (only one angular coordinate).
  // The coupled mode reduces to the uncoupled mode — blocks provided by the
  // standard hydrogen ND path, so return empty here.
  if (dim <= 2) return []
  const cb = getHydrogenNDCoupledBlocks(dim)
  return [
    { name: 'Gamma Half-Int LUT', content: LN_GAMMA_HALF_INT_LUT_WGSL },
    { name: 'Hyperspherical Coords', content: hypersphericalCoordsBlock },
    { name: `Hyperspherical Conversion ${dim}D`, content: cb.conversion },
    { name: 'Hyperspherical Norm', content: hypersphericalNormBlock },
    { name: `Hyperspherical Harmonic ${dim}D`, content: cb.harmonic },
    { name: `Hydrogen ND Coupled ${dim}D`, content: cb.coupled },
    { name: 'Hydrogen ND Coupled Dispatch', content: cb.dispatch },
  ]
}

/** Build the quantum math shader blocks based on mode and dimension. */
export function buildQuantumMathBlocks(opts: {
  actualDim: number
  includeHarmonic: boolean
  includeHydrogen: boolean
  includeHydrogenND: boolean
  hydrogenNDDimension: number
  isHydrogenFamily: boolean
  isHydrogenCoupled: boolean
  useCache: boolean
  useUnrolledHO: boolean
  termCount: number | undefined
  isWigner: boolean
  /** When true, the density grid handles all wavefunction evaluation in a compute shader.
   *  The fragment shader only needs stubs for symbols referenced by dead branches. */
  gridOnly?: boolean
}): ShaderBlockEntry[] {
  // In grid-only mode, the fragment shader does NOT evaluate wavefunctions inline.
  // All quantum math (Hermite, ho1D, hoND, evalPsi, density sampling) lives in the
  // compute shader's DensityGridComputePass. The fragment shader only needs stubs
  // for symbols still referenced in dead WGSL branches (e.g. behind const false guards).
  if (opts.gridOnly) {
    return [
      {
        name: 'Quantum Math Stubs (grid-only)',
        content: [
          '// Grid-only mode: quantum math excluded from fragment shader.',
          '// The DensityGridComputePass evaluates wavefunctions on a 3D grid;',
          '// the fragment shader raymarches the pre-computed grid texture.',
          '// Stubs satisfy WGSL symbol resolution for dead branches.',
          'fn mapPosToND(pos: vec3f, uniforms: SchroedingerUniforms) -> array<f32, 11> { var a: array<f32, 11>; return a; }',
          'fn evalPsi(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f { return vec2f(0.0); }',
          'fn rhoFromPsi(psi: vec2f) -> f32 { return psi.x * psi.x + psi.y * psi.y; }',
          'fn sFromRho(rho: f32) -> f32 { return select(-20.0, log(rho), rho > 1e-9); }',
          'fn sampleDensity(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> f32 { return 0.0; }',
          'fn sampleDensityWithPhase(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> vec3f { return vec3f(0.0); }',
          'fn sampleDensityWithPhaseAndFlow(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> array<vec3f, 2> { return array<vec3f, 2>(vec3f(0.0), pos); }',
          'fn sampleDensityAtPos(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> f32 { return 0.0; }',
          'fn densityPair(psi: vec2f) -> vec2f { return vec2f(0.0); }',
          'fn applyUncertaintyBoundaryEmphasis(rho: f32, logRho: f32, uniforms: SchroedingerUniforms) -> f32 { return rho; }',
          'fn gradientNoise(p: vec3f) -> f32 { return 0.0; }',
          'fn hash33(p3: vec3f) -> vec3f { return vec3f(0.0); }',
          'fn cmul(a: vec2f, b: vec2f) -> vec2f { return vec2f(0.0); }',
          'fn cexp_i(theta: f32) -> vec2f { return vec2f(cos(theta), sin(theta)); }',
        ].join('\n'),
      },
    ]
  }
  const hoNDBlockMap: Record<number, string> = {
    2: hoND2dBlock,
    3: hoND3dBlock,
    4: hoND4dBlock,
    5: hoND5dBlock,
    6: hoND6dBlock,
    7: hoND7dBlock,
    8: hoND8dBlock,
    9: hoND9dBlock,
    10: hoND10dBlock,
    11: hoND11dBlock,
  }
  const hoNDBlock = hoNDBlockMap[opts.actualDim] || hoND3dBlock

  const hydrogenNDBlockMap: Record<number, string> = {
    2: hydrogenNDGen2dBlock,
    3: hydrogenNDGen3dBlock,
    4: hydrogenNDGen4dBlock,
    5: hydrogenNDGen5dBlock,
    6: hydrogenNDGen6dBlock,
    7: hydrogenNDGen7dBlock,
    8: hydrogenNDGen8dBlock,
    9: hydrogenNDGen9dBlock,
    10: hydrogenNDGen10dBlock,
    11: hydrogenNDGen11dBlock,
  }
  const hydrogenNDBlock = hydrogenNDBlockMap[opts.hydrogenNDDimension] || ''

  // In 2D, coupled hydrogen reduces to uncoupled (no hyperspherical harmonics)
  const selectedPsiBlock =
    opts.isHydrogenCoupled && opts.hydrogenNDDimension > 2
      ? psiBlockHydrogenNDCoupled
      : opts.isHydrogenFamily
        ? psiBlockHydrogenND
        : opts.useUnrolledHO
          ? psiBlockDynamicHarmonic
          : psiBlockHarmonic

  // Coupled hydrogen ND blocks (hyperspherical harmonics) — extracted for complexity
  const coupledEntries = buildCoupledHydrogenBlocks(
    opts.hydrogenNDDimension,
    opts.isHydrogenCoupled
  )

  const blocks: ShaderBlockEntry[] = [
    { name: 'Complex Math', content: complexMathBlock },
    { name: 'Hermite Polynomials', content: hermiteBlock },
    { name: 'HO 1D Eigenfunction', content: ho1dBlock },
    {
      name: 'Eigenfunction Cache Lookup',
      content: eigenfunctionCacheLookupBlock,
      condition: opts.useCache,
    },
    {
      name: `HO ND ${opts.actualDim}D`,
      content: opts.useCache ? generateHoNDCachedBlock(opts.actualDim) : hoNDBlock,
      condition: opts.includeHarmonic,
    },
    {
      name: 'HO ND Dispatch',
      content: opts.useCache
        ? generateHoNDCachedDispatchBlock(opts.actualDim)
        : generateHoNDDispatchBlock(opts.actualDim),
      condition: opts.includeHarmonic,
    },
    {
      name: 'Laguerre Polynomials',
      content: laguerreBlock,
      condition: opts.includeHydrogen || opts.isWigner,
    },
    { name: 'Legendre Polynomials', content: legendreBlock, condition: opts.includeHydrogen },
    {
      name: 'Spherical Harmonics',
      content: sphericalHarmonicsBlock,
      condition: opts.includeHydrogen,
    },
    { name: 'Hydrogen Radial', content: hydrogenRadialBlock, condition: opts.includeHydrogen },
    {
      name: 'Hydrogen Family Fallbacks',
      content: hydrogenFamilyFallbackBlock,
      condition: !opts.includeHydrogen,
    },
    { name: 'Wigner HO', content: wignerHOBlock, condition: opts.isWigner },
    {
      name: 'Wigner Hydrogen',
      content: wignerHydrogenBlock,
      condition: opts.isWigner && opts.includeHydrogen,
    },
    {
      name: 'Wigner Hydrogen Stub',
      content:
        '// Stub: hydrogen Wigner unavailable in HO mode\nfn wignerHydrogenRadial(r: f32, pr: f32, n: i32, l: i32, a0: f32, nPts: i32) -> f32 { return 0.0; }',
      condition: opts.isWigner && !opts.includeHydrogen,
    },
    {
      name: 'Hydrogen ND Common',
      content: hydrogenNDCommonBlock,
      condition: opts.includeHydrogenND,
    },
    {
      name: `Hydrogen ND ${opts.hydrogenNDDimension}D`,
      content: hydrogenNDBlock,
      // Include uncoupled block when: not coupled, OR coupled at dim=2 (where coupled=uncoupled)
      condition:
        opts.includeHydrogenND &&
        (!opts.isHydrogenCoupled || opts.hydrogenNDDimension <= 2) &&
        hydrogenNDBlock.length > 0,
    },
    {
      name: `Hydrogen ND ${opts.hydrogenNDDimension}D Cached`,
      content: opts.useCache ? generateHydrogenNDCachedBlock(opts.hydrogenNDDimension) : '',
      condition:
        opts.includeHydrogenND &&
        (!opts.isHydrogenCoupled || opts.hydrogenNDDimension <= 2) &&
        opts.useCache &&
        opts.hydrogenNDDimension > 3,
    },
    {
      name: 'Hydrogen ND Dispatch',
      content:
        opts.useCache && opts.hydrogenNDDimension > 3
          ? generateHydrogenNDCachedDispatchBlock(opts.hydrogenNDDimension)
          : generateHydrogenNDDispatchBlock(opts.hydrogenNDDimension),
      // Include dispatch when: not coupled, OR coupled at dim=2
      condition:
        opts.includeHydrogenND && (!opts.isHydrogenCoupled || opts.hydrogenNDDimension <= 2),
    },
    // --- Coupled Hydrogen ND blocks (hyperspherical harmonics) ---
    ...coupledEntries,
  ]

  // HO Superposition - unrolled variants when termCount is known
  if (opts.useUnrolledHO && opts.termCount) {
    const tc = opts.termCount
    const termLabel = `${tc} term${tc > 1 ? 's' : ''}`
    if (opts.useCache) {
      const cached = getHOCachedUnrolledBlocks(tc)
      blocks.push(
        { name: `HO Superposition Cached (${termLabel})`, content: cached.superposition },
        { name: `HO Spatial Cached (${termLabel})`, content: cached.spatial },
        { name: `HO Combined Cached (${termLabel})`, content: cached.combined },
        { name: 'HO Dispatch Cached (Unrolled)', content: generateHOCachedDispatchBlock(tc) }
      )
    } else {
      const unrolled = getHOUnrolledBlocks(tc)
      blocks.push(
        { name: `HO Superposition (${termLabel})`, content: unrolled.superposition },
        { name: `HO Spatial (${termLabel})`, content: unrolled.spatial },
        { name: `HO Combined (${termLabel})`, content: unrolled.combined },
        { name: 'HO Dispatch (Unrolled)', content: generateHODispatchBlock(tc) }
      )
    }
  }

  blocks.push(
    { name: 'Wavefunction (Psi)', content: selectedPsiBlock },
    { name: 'Density Pre-Map', content: densityPreMapBlock },
    {
      name: `Density mapPosToND (${opts.actualDim}D)`,
      content: generateMapPosToND(opts.actualDim, {
        coupledNodalOffset: opts.isHydrogenCoupled && opts.actualDim > 3,
      }),
    },
    { name: 'Density Post-Map', content: densityPostMapBlock }
  )

  return blocks
}

/** Build volume rendering shader blocks (absorption, emission, integration, grid). */
export function buildVolumeBlocks(opts: {
  is2D: boolean
  colorAlgorithm: ColorAlgorithm
  includeHydrogen: boolean
  useCache: boolean
  actualDim: number
  termCount: number | undefined
  useDensityGrid: boolean
  usePrecomputedNormals: boolean
  freeScalarAnalysis: boolean
  nodal: boolean
  crossSectionEnabled: boolean
  classicalOverlayEnabled: boolean
  probabilityCurrentEnabled: boolean
  /** When true, inline raymarch functions are excluded — grid path handles everything. */
  gridOnly?: boolean
}): ShaderBlockEntry[] {
  return [
    { name: 'Beer-Lambert Absorption', content: absorptionBlock, condition: !opts.is2D },
    {
      name: 'Volume Emission (Pre)',
      content: generateEmissionPreBlock(opts.colorAlgorithm, opts.is2D),
    },
    {
      name: 'Volume Emission (Color)',
      content: generateComputeBaseColor(opts.colorAlgorithm),
    },
    { name: 'Volume Emission (Post)', content: emissionPostBlock, condition: !opts.is2D },
    {
      name: 'Cross-Section Slice',
      content: !opts.is2D && opts.crossSectionEnabled ? crossSectionBlock : crossSectionStubBlock,
      condition: !opts.is2D,
    },
    {
      name: 'Classical Trajectory Overlay',
      content:
        !opts.is2D && opts.classicalOverlayEnabled
          ? classicalOverlayWGSL
          : classicalOverlayStubWGSL,
      condition: !opts.is2D,
    },
    {
      name: 'Radial Probability Overlay',
      content:
        opts.includeHydrogen && !opts.is2D && !opts.gridOnly
          ? radialProbabilityBlock
          : radialProbabilityStubBlock,
      condition: !opts.is2D,
    },
    {
      name: 'Volume Gradient',
      content: opts.gridOnly
        ? [
            '// Stubs: tetrahedral gradient excluded in grid-only mode (grid uses fetchGradient).',
            'struct TetraSample { rho: f32, s: f32, phase: f32, gradient: vec3f }',
            'const TETRA_V0: vec3f = vec3f(0.5773503, 0.5773503, -0.5773503);',
            'const TETRA_V1: vec3f = vec3f(0.5773503, -0.5773503, 0.5773503);',
            'const TETRA_V2: vec3f = vec3f(-0.5773503, 0.5773503, 0.5773503);',
            'const TETRA_V3: vec3f = vec3f(-0.5773503, -0.5773503, -0.5773503);',
            'fn sampleWithTetrahedralGradient(pos: vec3f, t: f32, delta: f32, uniforms: SchroedingerUniforms) -> TetraSample { return TetraSample(0.0, 0.0, 0.0, vec3f(0.0)); }',
            'fn computeGradientTetrahedral(pos: vec3f, t: f32, delta: f32, uniforms: SchroedingerUniforms) -> vec3f { return vec3f(0.0); }',
            'fn computeGradientTetrahedralAtPos(pos: vec3f, t: f32, delta: f32, uniforms: SchroedingerUniforms) -> vec3f { return vec3f(0.0); }',
          ].join('\n')
        : volumeGradientBlock,
      condition: !opts.is2D,
    },
    {
      name: 'Analytical Gradient',
      condition: !opts.is2D,
      content:
        opts.gridOnly || !opts.useCache
          ? [
              '// Stubs: analytical gradient excluded (grid-only or no eigenfunction cache).',
              'fn sampleDensityWithAnalyticalGradient(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> TetraSample { return TetraSample(0.0, 0.0, 0.0, vec3f(0.0)); }',
              'fn computeAnalyticalGradient(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> vec3f { return vec3f(0.0); }',
            ].join('\n')
          : generateAnalyticalGradientBlock(opts.actualDim, opts.termCount),
    },
    {
      name: 'Density Grid Sampling',
      condition: !opts.is2D,
      content: opts.useDensityGrid
        ? densityGridSamplingBlock
        : [
            '// Stubs: density grid sampling unavailable (inline wavefunction evaluation used)',
            '// WGSL requires symbol resolution in dead branches even behind if (USE_DENSITY_GRID) guards.',
            'fn sampleDensityFromGrid(pos: vec3f, uniforms: SchroedingerUniforms) -> vec4f { return vec4f(0.0); }',
            'fn computeGradientFromGrid(pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f { return vec3f(0.0); }',
          ].join('\n'),
    },
    {
      name: 'Analysis Texture Sampling',
      content: opts.freeScalarAnalysis
        ? analysisTextureSamplingBlock
        : '// Stub: analysis texture unavailable\nfn sampleAnalysisFromGrid(pos: vec3f, uniforms: SchroedingerUniforms) -> vec4f { return vec4f(0.0); }',
    },
    { name: 'Volume Integration', content: volumeIntegrationBlock, condition: !opts.is2D },
    {
      name: 'Nodal Surfaces',
      content: opts.nodal ? nodalSurfacesBlock : nodalSurfacesStubBlock,
      condition: !opts.is2D,
    },
    {
      name: 'Probability Current',
      content: opts.probabilityCurrentEnabled
        ? probabilityCurrentBlock
        : probabilityCurrentStubBlock,
      condition: !opts.is2D,
    },
    {
      name: 'Volume Raymarch',
      condition: !opts.is2D,
      content: opts.gridOnly
        ? [
            '// Stubs: inline raymarch excluded in grid-only mode.',
            '// The grid-based volumeRaymarchGrid handles all rendering.',
            'fn volumeRaymarch(ro: vec3f, rd: vec3f, tNear: f32, tFar: f32, uniforms: SchroedingerUniforms) -> VolumeResult { return VolumeResult(vec3f(0.0), 0.0, 0, 0.0); }',
            'fn volumeRaymarchHQ(ro: vec3f, rd: vec3f, tNear: f32, tFar: f32, uniforms: SchroedingerUniforms) -> VolumeResult { return VolumeResult(vec3f(0.0), 0.0, 0, 0.0); }',
          ].join('\n')
        : volumeRaymarchBlock,
    },
    {
      name: 'Volume Raymarch Grid',
      condition: !opts.is2D,
      content: opts.useDensityGrid
        ? generateVolumeRaymarchGridBlock(opts.usePrecomputedNormals)
        : [
            '// Stub: grid raymarching unavailable',
            'fn volumeRaymarchGrid(ro: vec3f, rd: vec3f, tNear: f32, tFar: f32, uniforms: SchroedingerUniforms) -> VolumeResult { return VolumeResult(vec3f(0.0), 0.0, 0, 0.0); }',
          ].join('\n'),
    },
    {
      name: '2D Nodal Lines',
      content: opts.is2D ? nodalLines2DBlock : nodalLines2DStubBlock,
      condition: opts.is2D || opts.nodal,
    },
    {
      name: '2D Isolines',
      content: opts.is2D ? isolines2DBlock : isolines2DStubBlock,
      condition: opts.is2D,
    },
  ]
}
