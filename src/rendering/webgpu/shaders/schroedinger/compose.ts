/**
 * Schrödinger WGSL Shader Composer
 *
 * Assembles complete Schrödinger fragment shader from modular blocks.
 * Follows the WebGL compose.ts structure for proper block ordering.
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

import {
  assembleShaderBlocks,
  generateConsolidatedBindGroups,
  generateObjectBindGroup,
  mrtOutputBlock,
  type WGSLShaderConfig,
} from '../shared/compose-helpers'

// Core blocks
import { constantsBlock } from '../shared/core/constants.wgsl'
import { uniformsBlock } from '../shared/core/uniforms.wgsl'

// Color blocks
import { cosinePaletteBlock } from '../shared/color/cosine-palette.wgsl'
import { hslBlock } from '../shared/color/hsl.wgsl'
import { oklabBlock } from '../shared/color/oklab.wgsl'
import { selectorBlock } from '../shared/color/selector.wgsl'

// Lighting blocks (for isosurface mode)
import { ggxBlock } from '../shared/lighting/ggx.wgsl'
import { multiLightBlock } from '../shared/lighting/multi-light.wgsl'

// Raymarching blocks
import { sphereIntersectBlock } from '../shared/raymarch/sphere-intersect.wgsl'

// Feature blocks
import { temporalBlock } from '../shared/features/temporal.wgsl'

// Schroedinger-specific blocks
import { schroedingerUniformsBlock } from './uniforms.wgsl'
import {
  generateMainBlockVolumetric,
  generateMainBlockIsosurface,
  generateMainBlockTemporal,
  temporalMRTOutputBlock,
} from './main.wgsl'

// Quantum math blocks
import { complexMathBlock } from './quantum/complex.wgsl'
import { hermiteBlock } from './quantum/hermite.wgsl'
import { ho1dBlock } from './quantum/ho1d.wgsl'
import {
  hoND3dBlock,
  hoND4dBlock,
  hoND5dBlock,
  hoND6dBlock,
  hoND7dBlock,
  hoND8dBlock,
  hoND9dBlock,
  hoND10dBlock,
  hoND11dBlock,
  generateHoNDDispatchBlock,
} from './quantum/hoNDVariants.wgsl'
import {
  getHOUnrolledBlocks,
  generateHODispatchBlock,
} from './quantum/hoSuperpositionVariants.wgsl'
import {
  psiBlockDynamicHarmonic,
  psiBlockHarmonic,
  psiBlockHydrogenND,
} from './quantum/psi.wgsl'
import { densityPreMapBlock, generateMapPosToND, densityPostMapBlock } from './quantum/density.wgsl'

// Hydrogen blocks (conditional)
import { laguerreBlock } from './quantum/laguerre.wgsl'
import { legendreBlock } from './quantum/legendre.wgsl'
import { sphericalHarmonicsBlock } from './quantum/sphericalHarmonics.wgsl'
import { hydrogenRadialBlock } from './quantum/hydrogenRadial.wgsl'
import { hydrogenNDCommonBlock } from './quantum/hydrogenNDCommon.wgsl'
import { hydrogenFamilyFallbackBlock } from './quantum/hydrogenFallback.wgsl'
import {
  hydrogenNDGen3dBlock,
  hydrogenNDGen4dBlock,
  hydrogenNDGen5dBlock,
  hydrogenNDGen6dBlock,
  hydrogenNDGen7dBlock,
  hydrogenNDGen8dBlock,
  hydrogenNDGen9dBlock,
  hydrogenNDGen10dBlock,
  hydrogenNDGen11dBlock,
  generateHydrogenNDDispatchBlock,
} from './quantum/hydrogenNDVariants.wgsl'

// Volume blocks
import { absorptionBlock } from './volume/absorption.wgsl'
import { crossSectionBlock } from './volume/crossSection.wgsl'
import { emissionBlock } from './volume/emission.wgsl'
import { volumeGradientBlock, volumeIntegrationBlock } from './volume/integration.wgsl'

import type { ColorAlgorithm } from '../types'

/** Quantum physics mode for Schrödinger visualization */
export type QuantumModeForShader = 'harmonicOscillator' | 'hydrogenND'

/**
 * Schrödinger shader configuration options.
 */
export interface SchroedingerWGSLShaderConfig extends WGSLShaderConfig {
  /** Use isosurface mode instead of volumetric */
  isosurface?: boolean
  /** Use temporal accumulation */
  temporalAccumulation?: boolean
  /** Use density-grid sampling for volumetric raymarching */
  useDensityGrid?: boolean
  /** Quantum mode */
  quantumMode?: QuantumModeForShader
  /** Number of HO superposition terms (1-8) */
  termCount?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  /** Preferred color algorithm hint (Schrödinger currently evaluates color branches at runtime) */
  colorAlgorithm?: ColorAlgorithm
  /** Compile-time specialization for phase materiality branching. */
  phaseMateriality?: boolean
  /** Compile-time specialization for interference branching. */
  interference?: boolean
}

/**
 * Compose complete Schrödinger fragment shader.
 * @param config
 */
export function composeSchroedingerShader(config: SchroedingerWGSLShaderConfig): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const {
    dimension,
    isosurface = false,
    temporalAccumulation: enableTemporal = false,
    useDensityGrid = false,
    quantumMode = 'harmonicOscillator',
    termCount,
    nodal = true,
    dispersion = true,
    phaseMateriality = true,
    interference = true,
    overrides = [],
  } = config

  const defines: string[] = []
  const features: string[] = []

  // Compile-time dimension
  const actualDim = Math.min(Math.max(dimension, 3), 11)
  const isHydrogenFamily = quantumMode === 'hydrogenND'
  const includeHydrogen = isHydrogenFamily
  const includeHydrogenND = isHydrogenFamily
  const includeHarmonic = !isHydrogenFamily

  // For hydrogenND mode, include only the specific dimension block
  const hydrogenNDDimension = includeHydrogenND ? actualDim : 0

  // Determine if we should use unrolled HO superposition
  const useUnrolledHO = includeHarmonic && termCount !== undefined

  // Add dimension define
  defines.push(`const DIMENSION: i32 = ${dimension};`)
  defines.push(`const ACTUAL_DIM: i32 = ${actualDim};`)
  features.push(`${dimension}D Quantum`)

  // Add temporal define (for volumetric mode only)
  if (enableTemporal && !isosurface) {
    defines.push('const TEMPORAL_ENABLED: bool = true;')
    features.push('Temporal Accumulation')
  } else {
    defines.push('const TEMPORAL_ENABLED: bool = false;')
  }

  // Add quantum mode defines
  if (includeHydrogen) {
    defines.push('const HYDROGEN_MODE_ENABLED: bool = true;')
  } else {
    defines.push('const HYDROGEN_MODE_ENABLED: bool = false;')
  }
  if (includeHydrogenND) {
    defines.push('const HYDROGEN_ND_MODE_ENABLED: bool = true;')
    defines.push(`const HYDROGEN_ND_DIMENSION: i32 = ${hydrogenNDDimension};`)
  } else {
    defines.push('const HYDROGEN_ND_MODE_ENABLED: bool = false;')
  }

  // Add HO unrolled define when using compile-time term count
  if (useUnrolledHO && termCount) {
    defines.push('const HO_UNROLLED: bool = true;')
    defines.push(`const HO_TERM_COUNT: i32 = ${termCount};`)
  } else {
    defines.push('const HO_UNROLLED: bool = false;')
  }

  // Add quantum mode constant for runtime dispatch
  if (quantumMode === 'hydrogenND') {
    defines.push('const QUANTUM_MODE_DEFAULT: i32 = 1;')
    features.push('Hydrogen ND')
  } else {
    defines.push('const QUANTUM_MODE_DEFAULT: i32 = 0;')
    features.push('Harmonic Oscillator')
  }

  if (isosurface) {
    features.push('Isosurface Mode')
  } else {
    features.push('Volumetric Mode')
  }

  features.push('Beer-Lambert')

  defines.push(`const FEATURE_NODAL: bool = ${nodal};`)
  defines.push(`const FEATURE_DISPERSION: bool = ${dispersion};`)
  defines.push(`const FEATURE_PHASE_MATERIALITY: bool = ${phaseMateriality};`)
  defines.push(`const FEATURE_INTERFERENCE: bool = ${interference};`)

  // Select main block based on mode
  // Temporal volumetric mode outputs MRT (color + world position)
  const selectedMainBlock = isosurface
    ? generateMainBlockIsosurface()
    : enableTemporal
      ? generateMainBlockTemporal({ bayerJitter: true, useDensityGrid })
      : generateMainBlockVolumetric({ useDensityGrid })

  // Get dimension-specific blocks
  const hoNDBlockMap: Record<number, string> = {
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
  const hoNDBlock = hoNDBlockMap[actualDim] || hoND3dBlock

  const hydrogenNDBlockMap: Record<number, string> = {
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
  const hydrogenNDBlock = hydrogenNDBlockMap[hydrogenNDDimension] || ''

  const selectedPsiBlock = isHydrogenFamily
    ? psiBlockHydrogenND
    : useUnrolledHO
      ? psiBlockDynamicHarmonic
      : psiBlockHarmonic

  // Build blocks array in dependency order
  const blocks = [
    // Vertex inputs
    {
      name: 'Vertex Inputs',
      content: /* wgsl */ `
struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) vPosition: vec3f,
}
`,
    },

    // Defines - must come first so constants are available
    { name: 'Defines', content: defines.join('\n') },

    // Core
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },

    // Bind groups - using consolidated layout
    // Group 0: Camera
    // Group 1: Combined (Lighting + Material + Quality)
    // Group 2: Object (Schrödinger + Basis)
    { name: 'Standard Bind Groups', content: generateConsolidatedBindGroups() },
    {
      name: 'Schrödinger Uniforms',
      content:
        schroedingerUniformsBlock +
        '\n' +
        generateObjectBindGroup(2, 'SchroedingerUniforms', 'schroedinger', 0) +
        '\n' +
        generateObjectBindGroup(2, 'BasisVectors', 'basis', 1),
    },

    // ===== QUANTUM MATH MODULES (order matters!) =====

    // Complex math (required by all quantum modes)
    { name: 'Complex Math', content: complexMathBlock },

    // Harmonic oscillator basis functions
    { name: 'Hermite Polynomials', content: hermiteBlock },
    { name: 'HO 1D Eigenfunction', content: ho1dBlock },

    // HO ND dimension-specific variant (only ONE is included based on actualDim)
    { name: `HO ND ${actualDim}D`, content: hoNDBlock, condition: includeHarmonic },
    // Generated dispatch: directly calls hoND${actualDim}D
    { name: 'HO ND Dispatch', content: generateHoNDDispatchBlock(actualDim), condition: includeHarmonic },

    // Hydrogen orbital basis functions (conditionally included)
    { name: 'Laguerre Polynomials', content: laguerreBlock, condition: includeHydrogen },
    { name: 'Legendre Polynomials', content: legendreBlock, condition: includeHydrogen },
    { name: 'Spherical Harmonics', content: sphericalHarmonicsBlock, condition: includeHydrogen },
    { name: 'Hydrogen Radial', content: hydrogenRadialBlock, condition: includeHydrogen },
    {
      name: 'Hydrogen Family Fallbacks',
      content: hydrogenFamilyFallbackBlock,
      condition: !includeHydrogen,
    },

    // Hydrogen ND modules
    { name: 'Hydrogen ND Common', content: hydrogenNDCommonBlock, condition: includeHydrogenND },
    {
      name: `Hydrogen ND ${hydrogenNDDimension}D`,
      content: hydrogenNDBlock,
      condition: includeHydrogenND && hydrogenNDBlock.length > 0,
    },
    {
      name: 'Hydrogen ND Dispatch',
      content: generateHydrogenNDDispatchBlock(hydrogenNDDimension),
      condition: includeHydrogenND,
    },

    // HO Superposition - unrolled variants when termCount is known
    ...(useUnrolledHO && termCount
      ? [
          {
            name: `HO Superposition (${termCount} term${termCount > 1 ? 's' : ''})`,
            content: getHOUnrolledBlocks(termCount).superposition,
          },
          {
            name: `HO Spatial (${termCount} term${termCount > 1 ? 's' : ''})`,
            content: getHOUnrolledBlocks(termCount).spatial,
          },
          {
            name: `HO Combined (${termCount} term${termCount > 1 ? 's' : ''})`,
            content: getHOUnrolledBlocks(termCount).combined,
          },
          {
            name: 'HO Dispatch (Unrolled)',
            content: generateHODispatchBlock(termCount),
          },
        ]
      : []),

    // Unified wavefunction evaluation (mode-switching)
    { name: 'Wavefunction (Psi)', content: selectedPsiBlock },

    // Density field blocks - split for dimension-specific mapPosToND generation
    { name: 'Density Pre-Map', content: densityPreMapBlock },
    { name: `Density mapPosToND (${actualDim}D)`, content: generateMapPosToND(actualDim) },
    { name: 'Density Post-Map', content: densityPostMapBlock },

    // ===== COLOR SYSTEM =====
    // Always include the full color stack for Schrödinger emission.
    // computeBaseColor() in emission.wgsl dispatches at runtime and references HSL, cosine, and Oklab paths.
    { name: 'Color (HSL)', content: hslBlock },
    { name: 'Color (Cosine)', content: cosinePaletteBlock },
    { name: 'Color (Oklab)', content: oklabBlock },
    { name: 'Color Selector', content: selectorBlock },

    // ===== LIGHTING (GGX PBR only needed for isosurface — volumetric uses Lambertian diffuse) =====
    { name: 'GGX PBR', content: ggxBlock, condition: isosurface },
    { name: 'Multi-Light System', content: multiLightBlock, condition: isosurface },

    // ===== VOLUME RENDERING =====
    { name: 'Beer-Lambert Absorption', content: absorptionBlock },
    {
      name: 'Volume Emission',
      content: emissionBlock,
    },
    { name: 'Cross-Section Slice', content: crossSectionBlock },
    { name: 'Volume Gradient', content: volumeGradientBlock },
    { name: 'Volume Integration', content: volumeIntegrationBlock },

    // ===== GEOMETRY =====
    { name: 'Sphere Intersection', content: sphereIntersectBlock },

    // ===== FEATURES =====
    {
      name: 'Temporal Accumulation',
      content: temporalBlock,
      condition: enableTemporal && !isosurface,
    },

    // MRT output struct for isosurface mode (outputs color + normal for post-processing)
    {
      name: 'Fragment Output (Isosurface)',
      content: mrtOutputBlock,
      condition: isosurface,
    },

    // MRT output struct for temporal volumetric mode (outputs color + world position for reprojection)
    {
      name: 'Fragment Output (Temporal)',
      content: temporalMRTOutputBlock,
      condition: enableTemporal && !isosurface,
    },

    // ===== MAIN SHADER =====
    { name: 'Main', content: selectedMainBlock },
  ]

  // Assemble
  const { wgsl, modules } = assembleShaderBlocks(
    blocks,
    overrides.map((o) => ({ target: o.target, replacement: o.replacement }))
  )

  return { wgsl, modules, features }
}

/**
 * Create vertex shader for Schrödinger rendering.
 */
export function composeSchroedingerVertexShader(): string {
  return /* wgsl */ `
// Schrödinger Vertex Shader
// Transforms vertices for volume raymarching

struct CameraUniforms {
  viewMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  viewProjectionMatrix: mat4x4f,
  inverseViewMatrix: mat4x4f,
  inverseProjectionMatrix: mat4x4f,
  modelMatrix: mat4x4f,          // LOCAL → WORLD transform
  inverseModelMatrix: mat4x4f,   // WORLD → LOCAL transform
  cameraPosition: vec3f,
  cameraNear: f32,
  cameraFar: f32,
  fov: f32,
  resolution: vec2f,
  aspectRatio: f32,
  time: f32,
  deltaTime: f32,
  frameNumber: u32,
  bayerOffset: vec2f,            // Temporal accumulation Bayer pattern offset
  _padding: vec2f,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

struct VertexInput {
  @location(0) position: vec3f,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) vPosition: vec3f,
}

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Transform local vertex position to WORLD space using modelMatrix
  // This matches WebGL: worldPosition = modelMatrix * vec4(position, 1.0)
  let worldPos = (camera.modelMatrix * vec4f(input.position, 1.0)).xyz;
  output.vPosition = worldPos;

  // Clip position
  output.clipPosition = camera.viewProjectionMatrix * vec4f(worldPos, 1.0);

  return output;
}
`
}
