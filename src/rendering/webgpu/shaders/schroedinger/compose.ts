/**
 * Schrödinger WGSL Shader Composer
 *
 * Assembles complete Schrödinger fragment shader from modular blocks.
 * Configuration, flag derivation, and define generation are in composeConfig.ts.
 *
 * Block assembly order:
 * 1. Core: constants, uniforms, bind groups
 * 2. Quantum math: complex, hermite, ho1d, psi, density
 * 3. Volume rendering: absorption, emission, integration
 * 4. Color and effects
 * 5. Main shader
 *
 * @module rendering/webgpu/shaders/schroedinger/compose
 */

import { cosinePaletteBlock } from '../shared/color/cosine-palette.wgsl'
import { hslBlock } from '../shared/color/hsl.wgsl'
import { oklabBlock } from '../shared/color/oklab.wgsl'
import {
  assembleShaderBlocks,
  generateConsolidatedBindGroups,
  sanitizeShaderBoolean,
  singleOutputBlock,
} from '../shared/compose-helpers'
import { constantsBlock } from '../shared/core/constants.wgsl'
import { uniformsBlock } from '../shared/core/uniforms.wgsl'
import { ggxBlock } from '../shared/lighting/ggx.wgsl'
import { multiLightBlock } from '../shared/lighting/multi-light.wgsl'
import { sphereIntersectBlock } from '../shared/raymarch/sphere-intersect.wgsl'
import {
  buildBindGroupBlock,
  buildQuantumMathBlocks,
  buildVolumeBlocks,
  type ShaderBlockEntry,
} from './composeBlockBuilders'
import {
  buildShaderDefinesAndFeatures,
  canUseGridOnly,
  derivedShaderFlags,
  removeDefaultNodalSpecializationOverrides,
  sanitizeQuantumModeForShader,
  sanitizeShaderColorAlgorithm,
  sanitizeShaderDensityGridSize,
  type SchroedingerWGSLShaderConfig,
  selectMainBlock,
} from './composeConfig'
import { temporalMRTOutputBlock } from './main.wgsl'
import { COLOR_ALG_NAMES } from './volume/emission.wgsl'

// Re-export types for consumers
export type { QuantumModeForShader, SchroedingerWGSLShaderConfig } from './composeConfig'

/**
 * Compose a complete Schrödinger fragment shader from modular WGSL blocks.
 *
 * Selects quantum mode blocks (HO/hydrogen), rendering pipeline (2D/volumetric/isosurface),
 * and optional features (eigenfunction cache, density grid, Wigner) based on the config.
 *
 * @param config - Shader composition configuration
 * @returns Assembled WGSL source, module names, and human-readable feature tags
 */
export function composeSchroedingerShader(config: SchroedingerWGSLShaderConfig): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const { dimension, overrides = [] } = config
  const isosurface = sanitizeShaderBoolean(config.isosurface, false)
  const enableTemporal = sanitizeShaderBoolean(config.temporalAccumulation, false)
  const useDensityGrid = sanitizeShaderBoolean(config.useDensityGrid, false)
  const densityGridHasPhase = sanitizeShaderBoolean(config.densityGridHasPhase, false)
  const densityGridSize = sanitizeShaderDensityGridSize(config.densityGridSize)
  const quantumMode = sanitizeQuantumModeForShader(config.quantumMode)
  const nodal = sanitizeShaderBoolean(config.nodal, true)
  const phaseMateriality = sanitizeShaderBoolean(config.phaseMateriality, true)
  const interference = sanitizeShaderBoolean(config.interference, true)
  const uncertaintyBoundary = sanitizeShaderBoolean(config.uncertaintyBoundary, true)
  const colorAlgorithm = sanitizeShaderColorAlgorithm(config.colorAlgorithm)
  const isWigner = sanitizeShaderBoolean(config.isWigner, false)
  const useWignerCache = sanitizeShaderBoolean(config.useWignerCache, false)
  const isFreeScalar = sanitizeShaderBoolean(config.isFreeScalar, false)
  const isFreeScalarField = sanitizeShaderBoolean(config.isFreeScalarField, false)
  const isQuantumWalk = sanitizeShaderBoolean(config.isQuantumWalk, false)
  const isPauli = sanitizeShaderBoolean(config.isPauli, false)
  const isAds = sanitizeShaderBoolean(config.isAds, false)
  const freeScalarAnalysis = sanitizeShaderBoolean(config.freeScalarAnalysis, false)
  const useDensityMatrix = sanitizeShaderBoolean(config.useDensityMatrix, false)
  const crossSectionEnabled = sanitizeShaderBoolean(config.crossSectionEnabled, true)
  const probabilityCurrentEnabled = sanitizeShaderBoolean(config.probabilityCurrentEnabled, true)

  // Derived shader flags (extracted to reduce function complexity)
  const derived = derivedShaderFlags(config)
  const {
    is2D,
    isHydrogenFamily,
    isHydrogenCoupled,
    actualDim,
    includeHydrogen,
    includeHydrogenND,
    includeHarmonic,
    hydrogenNDDimension,
    useUnrolledHO,
    termCount: shaderTermCount,
    useCache,
    useAnalyticalGradient,
    useRobustEigenInterpolation,
    isDualChannel,
    needsCosine,
    needsOklab,
    usePrecomputedNormals,
  } = derived

  // Build compile-time defines and feature tags
  const { defines, features } = buildShaderDefinesAndFeatures({
    dimension,
    actualDim,
    is2D,
    isWigner,
    enableTemporal,
    includeHydrogen,
    includeHydrogenND,
    hydrogenNDDimension,
    useUnrolledHO,
    termCount: shaderTermCount,
    useCache,
    useAnalyticalGradient,
    useRobustEigenInterpolation,
    quantumMode,
    isosurface,
    nodal,
    nodalSpecializationEnabled: config.nodalSpecializationEnabled,
    nodalDefinition: config.nodalDefinition,
    nodalRenderMode: config.nodalRenderMode,
    nodalFamilyFilter: config.nodalFamilyFilter,
    phaseMateriality,
    interference,
    uncertaintyBoundary,
    colorAlgorithm,
    isDualChannel,
    useDensityGrid,
    densityGridHasPhase,
    densityGridSize,
    isFreeScalar,
    isFreeScalarField,
    usePrecomputedNormals,
    isQuantumWalk,
    isPauli,
    isAds,
    useWignerCache,
    crossSectionEnabled,
    probabilityCurrentEnabled,
    fastGridEmission: config.fastGridEmission,
    quantumBackreactionLensing: config.quantumBackreactionLensing,
    bilocalERBridge: config.bilocalERBridge,
    entropicTimeShear: config.entropicTimeShear,
    spectralDimensionFlow: config.spectralDimensionFlow,
    vacuumBubbleLens: config.vacuumBubbleLens,
    negativeAlphaPotentialOverlay: config.negativeAlphaPotentialOverlay,
    wdwOverlay: config.wdwOverlay,
    tdseBranchColor: config.tdseBranchColor,
    adsAmplitude: config.adsAmplitude,
    gridPhaseOffset: config.gridPhaseOffset,
    sampleSpaceRotation: config.sampleSpaceRotation,
    profilingStrip: config.profilingStrip,
  })
  features.push(`Color: ${COLOR_ALG_NAMES[colorAlgorithm] ?? colorAlgorithm}`)

  // Grid-only mode: excludes inline raymarch + entire quantum math chain
  const gridOnly = canUseGridOnly(config, is2D)

  if (gridOnly) {
    features.push('Grid-Only (inline raymarch excluded)')
  }

  const selectedMainBlock = selectMainBlock(
    isWigner,
    is2D,
    isosurface,
    enableTemporal,
    useDensityGrid,
    useDensityMatrix,
    useWignerCache,
    gridOnly
  )

  // Build blocks array in dependency order
  const blocks: ShaderBlockEntry[] = [
    {
      name: 'Vertex Inputs',
      content: is2D
        ? /* wgsl */ `
struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) uv: vec2f,
}
`
        : /* wgsl */ `
struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) vPosition: vec3f,
}
`,
    },
    { name: 'Defines', content: defines.join('\n') },
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },
    { name: 'Standard Bind Groups', content: generateConsolidatedBindGroups() },
    {
      name: 'Schrödinger Uniforms',
      content: buildBindGroupBlock({
        useCache,
        isWigner,
        useWignerCache,
        useDensityGrid,
        usePrecomputedNormals,
        freeScalarAnalysis,
      }),
    },

    // Quantum math modules (excluded in grid-only mode — compute shader handles wavefunction evaluation)
    ...buildQuantumMathBlocks({
      actualDim,
      includeHarmonic,
      includeHydrogen,
      includeHydrogenND,
      hydrogenNDDimension,
      isHydrogenFamily,
      isHydrogenCoupled,
      useCache,
      useUnrolledHO,
      termCount: shaderTermCount,
      isWigner,
      gridOnly,
    }),

    // Color system
    { name: 'Color (HSL)', content: hslBlock },
    { name: 'Color (Cosine)', content: cosinePaletteBlock, condition: needsCosine },
    { name: 'Color (Oklab)', content: oklabBlock, condition: needsOklab },

    // Lighting (GGX PBR for isosurface only)
    { name: 'GGX PBR', content: ggxBlock, condition: isosurface && !is2D },
    { name: 'Multi-Light System', content: multiLightBlock, condition: isosurface && !is2D },

    // Volume rendering (inline raymarch excluded in grid-only mode)
    ...buildVolumeBlocks({
      is2D,
      colorAlgorithm,
      includeHydrogen,
      useCache,
      actualDim,
      termCount: shaderTermCount,
      useDensityGrid,
      usePrecomputedNormals,
      freeScalarAnalysis,
      nodal,
      crossSectionEnabled,
      probabilityCurrentEnabled,
      gridOnly,
    }),

    // Geometry
    { name: 'Sphere Intersection', content: sphereIntersectBlock, condition: !is2D },

    // Features + output
    {
      name: 'Fragment Output (Isosurface)',
      content: singleOutputBlock,
      condition: isosurface && !enableTemporal && !is2D,
    },
    {
      name: 'Fragment Output (Temporal)',
      content: temporalMRTOutputBlock,
      condition: enableTemporal && !is2D,
    },

    // Main shader
    { name: 'Main', content: selectedMainBlock },
  ]

  // Assemble
  const { wgsl, modules } = assembleShaderBlocks(
    blocks,
    overrides.map((o) => ({ target: o.target, replacement: o.replacement }))
  )

  return { wgsl: removeDefaultNodalSpecializationOverrides(wgsl), modules, features }
}

// Re-export vertex shaders from dedicated module
export { composeSchroedingerVertexShader, composeSchroedingerVertexShader2D } from './vertex.wgsl'
