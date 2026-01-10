/**
 * Shader composition for Schrödinger N-dimensional quantum volume visualizer
 *
 * Assembles shader blocks in dependency order:
 * 1. Core: precision, constants, uniforms
 * 2. Quantum math: complex, hermite, ho1d, psi, density
 * 3. Volume rendering: absorption, emission, integration
 * 4. Color and effects
 * 5. Main shader
 */

import { cosinePaletteBlock } from '../shared/color/cosine-palette.glsl'
import { hslBlock } from '../shared/color/hsl.glsl'
import { oklabBlock } from '../shared/color/oklab.glsl'
import { selectorBlock } from '../shared/color/selector.glsl'
import { constantsBlock } from '../shared/core/constants.glsl'
import { precisionBlock } from '../shared/core/precision.glsl'
import { uniformsBlock } from '../shared/core/uniforms.glsl'
import { temporalBlock } from '../shared/features/temporal.glsl'
import { ggxBlock } from '../shared/lighting/ggx.glsl'
import { iblBlock, iblUniformsBlock, pmremSamplingBlock } from '../shared/lighting/ibl.glsl'
import { multiLightBlock } from '../shared/lighting/multi-light.glsl'
import { sphereIntersectBlock } from '../shared/raymarch/sphere-intersect.glsl'

import { ShaderConfig } from '../shared/types'
import { mainBlock, mainBlockIsosurface } from './main.glsl'
import { complexMathBlock } from './quantum/complex.glsl'
import { densityPreMapBlock, generateMapPosToND, densityPostMapBlock } from './quantum/density.glsl'
import { hermiteBlock } from './quantum/hermite.glsl'
import { ho1dBlock } from './quantum/ho1d.glsl'
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
} from './quantum/hoNDVariants.glsl'
import {
  hydrogenND10dBlock,
  hydrogenND11dBlock,
  hydrogenND3dBlock,
  hydrogenND4dBlock,
  hydrogenND5dBlock,
  hydrogenND6dBlock,
  hydrogenND7dBlock,
  hydrogenND8dBlock,
  hydrogenND9dBlock,
  hydrogenNDCommonBlock,
} from './quantum/hydrogenND'
import { hydrogenPsiBlock } from './quantum/hydrogenPsi.glsl'
import { hydrogenRadialBlock } from './quantum/hydrogenRadial.glsl'
import { laguerreBlock } from './quantum/laguerre.glsl'
import { legendreBlock } from './quantum/legendre.glsl'
import { psiBlock } from './quantum/psi.glsl'
import { sphericalHarmonicsBlock } from './quantum/sphericalHarmonics.glsl'
import { schroedingerUniformsBlock } from './uniforms.glsl'
import { absorptionBlock } from './volume/absorption.glsl'
import { emissionBlock } from './volume/emission.glsl'
import { volumeIntegrationBlock } from './volume/integration.glsl'

/** Quantum physics mode for Schrödinger visualization */
export type QuantumModeForShader = 'harmonicOscillator' | 'hydrogenOrbital' | 'hydrogenND'

export interface SchroedingerShaderConfig extends ShaderConfig {
  /** Use isosurface mode instead of volumetric */
  isosurface?: boolean
  /** Use temporal accumulation (Horizon-style 1/4 res reconstruction) */
  temporalAccumulation?: boolean
  /**
   * Quantum mode - controls which modules are compiled into the shader.
   * - 'harmonicOscillator': Only HO basis functions (default, fastest compilation)
   * - 'hydrogenOrbital': Adds hydrogen orbital functions
   * - 'hydrogenND': Adds hydrogen ND functions for the specified dimension only
   * If undefined, all modules are included for runtime switching.
   */
  quantumMode?: QuantumModeForShader
}

/**
 * Compose Schroedinger fragment shader with specified features.
 * @param config - Schroedinger shader configuration options
 * @returns Composed shader source code
 */
export function composeSchroedingerShader(config: SchroedingerShaderConfig) {
  const {
    dimension,
    shadows: enableShadows,
    temporal: enableTemporal,
    ambientOcclusion: enableAO,
    overrides = [],
    isosurface = false,
    temporalAccumulation = false,
    quantumMode,
    sss: enableSss,
    fresnel: enableFresnel,
    curl: enableCurl,
    dispersion: enableDispersion,
    nodal: enableNodal,
    energyColor: enableEnergyColor,
    shimmer: enableShimmer,
    erosion: enableErosion,
    erosionNoiseType,
    erosionHQ,
  } = config

  // Determine which quantum modules to include
  // If quantumMode is undefined, include all modules for runtime switching
  const includeHydrogen =
    !quantumMode || quantumMode === 'hydrogenOrbital' || quantumMode === 'hydrogenND'
  const includeHydrogenND = !quantumMode || quantumMode === 'hydrogenND'

  // For hydrogenND mode, we only need to include the specific dimension block
  // This dramatically reduces shader size and compilation time
  const hydrogenNDDimension = includeHydrogenND ? Math.min(Math.max(dimension, 3), 11) : 0

  const defines: string[] = []
  const features: string[] = []

  // Add quantum mode defines for conditional compilation in psi.glsl.ts
  if (includeHydrogen) {
    defines.push('#define HYDROGEN_MODE_ENABLED')
  }
  if (includeHydrogenND) {
    defines.push('#define HYDROGEN_ND_MODE_ENABLED')
    // Add dimension-specific define to eliminate runtime dispatch
    defines.push(`#define HYDROGEN_ND_DIMENSION ${hydrogenNDDimension}`)
  }

  // Add compile-time dimension define for loop unrolling in hoND and density mapping
  // This eliminates runtime branching in hot loops (GPU can't branch-predict early exit)
  const actualDim = Math.min(Math.max(dimension, 3), 11)
  defines.push(`#define ACTUAL_DIM ${actualDim}`)

  features.push('Quantum Volume')
  features.push('Beer-Lambert')

  // Shadows and AO are now enabled for both volumetric and isosurface modes
  // Volumetric mode uses cone-traced self-shadowing and hemisphere-sampled AO
  const useShadows = enableShadows && !overrides.includes('Shadows')
  const useAO = enableAO && !overrides.includes('Ambient Occlusion')

  // Temporal modes are mutually exclusive:
  // - temporalAccumulation: Horizon-style 1/4 res with reconstruction (recommended for volumetric)
  // - temporal: Conservative depth-skip optimization (legacy, may have artifacts)
  const useTemporalAccumulation =
    temporalAccumulation && !isosurface && !overrides.includes('Temporal Accumulation')
  const useTemporal =
    enableTemporal && !useTemporalAccumulation && !overrides.includes('Temporal Reprojection')

  if (useShadows) {
    defines.push('#define USE_SHADOWS')
    features.push('Shadows')
  }
  if (useTemporalAccumulation) {
    defines.push('#define USE_TEMPORAL_ACCUMULATION')
    features.push('Temporal Accumulation (1/4 res)')
  } else if (useTemporal) {
    defines.push('#define USE_TEMPORAL')
    features.push('Temporal Reprojection')
  }
  if (useAO) {
    defines.push('#define USE_AO')
    features.push('Ambient Occlusion')
  }

  const useSss = enableSss && !overrides.includes('SSS')
  const useFresnel = enableFresnel && !overrides.includes('Fresnel')

  if (useSss) {
    defines.push('#define USE_SSS')
    features.push('SSS')
  }
  if (useFresnel) {
    defines.push('#define USE_FRESNEL')
    features.push('Fresnel')
  }

  // Quantum volume effects (compile-time optimization)
  const useCurl = enableCurl && !overrides.includes('Curl')
  const useDispersion = enableDispersion && !overrides.includes('Dispersion')
  const useNodal = enableNodal && !overrides.includes('Nodal')
  const useEnergyColor = enableEnergyColor && !overrides.includes('Energy Color')
  const useShimmer = enableShimmer && !overrides.includes('Shimmer')
  const useErosion = enableErosion && !overrides.includes('Erosion')

  if (useCurl) {
    defines.push('#define USE_CURL')
    features.push('Curl Flow')
  }
  if (useDispersion) {
    defines.push('#define USE_DISPERSION')
    features.push('Chromatic Dispersion')
  }
  if (useNodal) {
    defines.push('#define USE_NODAL')
    features.push('Nodal Surfaces')
  }
  if (useEnergyColor) {
    defines.push('#define USE_ENERGY_COLOR')
    features.push('Energy Coloring')
  }
  if (useShimmer) {
    defines.push('#define USE_SHIMMER')
    features.push('Uncertainty Shimmer')
  }
  if (useErosion) {
    defines.push('#define USE_EROSION')
    features.push('Edge Erosion')
    // D4: Compile-time noise type selection for eliminating runtime branches
    if (erosionNoiseType !== undefined) {
      defines.push(`#define EROSION_NOISE_TYPE ${erosionNoiseType}`)
      const noiseNames = ['Worley', 'Perlin', 'Hybrid']
      features.push(`Erosion Noise: ${noiseNames[erosionNoiseType]} (compile-time)`)
    }
    // HQ mode: use original 3×3×3 Worley and 4-sample curl (slower but higher quality)
    // Fast mode (default): uses optimized 2×2×2 Worley and 2-sample pseudo-curl
    if (erosionHQ) {
      defines.push('#define EROSION_HQ')
      features.push('Erosion HQ (3×3×3 Worley, 4-sample curl)')
    }
  }

  if (isosurface) {
    features.push('Isosurface Mode')
  } else {
    features.push('Volumetric Mode')
  }

  // Select main block based on mode
  const selectedMainBlock = isosurface ? mainBlockIsosurface : mainBlock

  const blocks = [
    // IMPORTANT: Defines must come FIRST so USE_TEMPORAL_ACCUMULATION is available
    // when precision block conditionally declares MRT outputs
    { name: 'Defines', content: defines.join('\n') },
    { name: 'Precision', content: precisionBlock },
    // Vertex Inputs: Only declare vPosition when NOT using temporal accumulation.
    // When temporal accumulation is enabled, the fragment shader computes ray direction
    // from screen coordinates (uInverseViewProjectionMatrix) instead of using vPosition.
    // Declaring unused vertex outputs causes Firefox warning:
    // "Output of vertex shader not read by fragment shader"
    {
      name: 'Vertex Inputs',
      content: `\n// Inputs from vertex shader\nin vec3 vPosition;\n`,
      condition: !useTemporalAccumulation,
    },
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },
    { name: 'Schrödinger Uniforms', content: schroedingerUniformsBlock },

    // Quantum math modules (order matters!)
    // Harmonic oscillator basis functions
    { name: 'Complex Math', content: complexMathBlock },
    { name: 'Hermite Polynomials', content: hermiteBlock },
    { name: 'HO 1D Eigenfunction', content: ho1dBlock },

    // HO ND dimension-specific variants (unrolled for performance)
    // Only include the specific dimension block needed to reduce shader size
    // HO ND dimension-specific variant (only ONE is included based on actualDim)
    // Pattern follows mandelbulb: pick exact block, dispatch directly calls it
    { name: 'HO ND 3D', content: hoND3dBlock, condition: actualDim === 3 },
    { name: 'HO ND 4D', content: hoND4dBlock, condition: actualDim === 4 },
    { name: 'HO ND 5D', content: hoND5dBlock, condition: actualDim === 5 },
    { name: 'HO ND 6D', content: hoND6dBlock, condition: actualDim === 6 },
    { name: 'HO ND 7D', content: hoND7dBlock, condition: actualDim === 7 },
    { name: 'HO ND 8D', content: hoND8dBlock, condition: actualDim === 8 },
    { name: 'HO ND 9D', content: hoND9dBlock, condition: actualDim === 9 },
    { name: 'HO ND 10D', content: hoND10dBlock, condition: actualDim === 10 },
    { name: 'HO ND 11D', content: hoND11dBlock, condition: actualDim === 11 },
    // Generated dispatch: directly calls hoND${actualDim}D without preprocessor conditionals
    { name: 'HO ND Dispatch', content: generateHoNDDispatchBlock(actualDim) },

    // Hydrogen orbital basis functions (conditionally included)
    { name: 'Laguerre Polynomials', content: laguerreBlock, condition: includeHydrogen },
    { name: 'Legendre Polynomials', content: legendreBlock, condition: includeHydrogen },
    { name: 'Spherical Harmonics', content: sphericalHarmonicsBlock, condition: includeHydrogen },
    { name: 'Hydrogen Radial', content: hydrogenRadialBlock, condition: includeHydrogen },
    { name: 'Hydrogen Psi', content: hydrogenPsiBlock, condition: includeHydrogen },

    // Hydrogen ND modules - only include the specific dimension block needed
    // This reduces shader size by ~400 lines and dramatically speeds up compilation
    { name: 'Hydrogen ND Common', content: hydrogenNDCommonBlock, condition: includeHydrogenND },
    {
      name: 'Hydrogen ND 3D',
      content: hydrogenND3dBlock,
      condition: includeHydrogenND && hydrogenNDDimension === 3,
    },
    {
      name: 'Hydrogen ND 4D',
      content: hydrogenND4dBlock,
      condition: includeHydrogenND && hydrogenNDDimension === 4,
    },
    {
      name: 'Hydrogen ND 5D',
      content: hydrogenND5dBlock,
      condition: includeHydrogenND && hydrogenNDDimension === 5,
    },
    {
      name: 'Hydrogen ND 6D',
      content: hydrogenND6dBlock,
      condition: includeHydrogenND && hydrogenNDDimension === 6,
    },
    {
      name: 'Hydrogen ND 7D',
      content: hydrogenND7dBlock,
      condition: includeHydrogenND && hydrogenNDDimension === 7,
    },
    {
      name: 'Hydrogen ND 8D',
      content: hydrogenND8dBlock,
      condition: includeHydrogenND && hydrogenNDDimension === 8,
    },
    {
      name: 'Hydrogen ND 9D',
      content: hydrogenND9dBlock,
      condition: includeHydrogenND && hydrogenNDDimension === 9,
    },
    {
      name: 'Hydrogen ND 10D',
      content: hydrogenND10dBlock,
      condition: includeHydrogenND && hydrogenNDDimension === 10,
    },
    {
      name: 'Hydrogen ND 11D',
      content: hydrogenND11dBlock,
      condition: includeHydrogenND && hydrogenNDDimension === 11,
    },

    // Unified wavefunction evaluation (mode-switching)
    { name: 'Wavefunction (Psi)', content: psiBlock },
    
    // Density field blocks - split for dimension-specific mapPosToND generation
    // Following mandelbulb pattern: generate exact code at JS level, no preprocessor conditionals
    { name: 'Density Pre-Map', content: densityPreMapBlock },
    { name: `Density mapPosToND (${actualDim}D)`, content: generateMapPosToND(actualDim) },
    { name: 'Density Post-Map', content: densityPostMapBlock },

    // Color system
    { name: 'Color (HSL)', content: hslBlock },
    { name: 'Color (Cosine)', content: cosinePaletteBlock },
    { name: 'Color (Oklab)', content: oklabBlock },
    { name: 'Color Selector', content: selectorBlock },

    // Lighting (must come before emission which uses light functions)
    { name: 'GGX PBR', content: ggxBlock },
    { name: 'Multi-Light System', content: multiLightBlock },
    { name: 'IBL Uniforms', content: iblUniformsBlock },
    { name: 'PMREM Sampling', content: pmremSamplingBlock },
    { name: 'IBL Functions', content: iblBlock },

    // Volumetric rendering
    { name: 'Beer-Lambert Absorption', content: absorptionBlock },
    { name: 'Volume Emission', content: emissionBlock },
    { name: 'Volume Integration', content: volumeIntegrationBlock },

    // Geometry
    { name: 'Sphere Intersection', content: sphereIntersectBlock },

    // Features
    { name: 'Temporal Features', content: temporalBlock, condition: useTemporal },

    // Main
    { name: 'Main', content: selectedMainBlock },
  ]

  const modules: string[] = []
  const glslParts: string[] = []

  blocks.forEach((b) => {
    if (b.condition === false) return // Disabled in config

    modules.push(b.name)

    if (overrides.includes(b.name)) {
      // Overridden: Don't add content
    } else {
      glslParts.push(b.content)
    }
  })

  return { glsl: glslParts.join('\n'), modules, features }
}

/**
 * Generate vertex shader for Schrödinger raymarching.
 *
 * When temporal accumulation is enabled, the fragment shader computes ray direction
 * from screen coordinates using uInverseViewProjectionMatrix, so vPosition is not needed.
 * When temporal accumulation is disabled, vPosition is used for ray direction calculation.
 *
 * @param temporalAccumulation - Whether temporal accumulation is enabled
 * @returns Vertex shader GLSL source
 */
export function generateSchroedingerVertexShader(temporalAccumulation: boolean): string {
  if (temporalAccumulation) {
    // Temporal accumulation mode: no vertex outputs needed
    // Fragment shader computes ray direction from screen coordinates
    return /* glsl */ `
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `
  } else {
    // Standard mode: output vPosition for fragment shader ray calculation
    return /* glsl */ `
      out vec3 vPosition;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `
  }
}
