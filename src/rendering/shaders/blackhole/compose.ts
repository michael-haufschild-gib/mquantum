/**
 * Shader composition for Black Hole N-dimensional visualization
 *
 * Assembles shader blocks in dependency order:
 * 1. Core: precision, constants, uniforms
 * 2. Gravity: lensing, horizon, shell, manifold, doppler
 * 3. Effects: motion blur (optional)
 * 4. Main raymarching loop
 */

import { constantsBlock } from '../shared/core/constants.glsl'
import { precisionBlock } from '../shared/core/precision.glsl'
import { uniformsBlock } from '../shared/core/uniforms.glsl'
import { temporalBlock } from '../shared/features/temporal.glsl'
import { ShaderConfig } from '../shared/types'
import { GLSL_ALL_PALETTE_FUNCTIONS } from '../palette'

import { dopplerBlock } from './gravity/doppler.glsl'
import { horizonBlock } from './gravity/horizon.glsl'
import { lensingBlock } from './gravity/lensing.glsl'
import { manifoldBlock } from './gravity/manifold.glsl'
import { shellBlock } from './gravity/shell.glsl'
import { motionBlurBlock } from './effects/motion-blur.glsl'
import { diskSdfBlock } from './gravity/disk-sdf.glsl'
import { diskVolumetricBlock } from './gravity/disk-volumetric.glsl'
import { colorsBlock } from './gravity/colors.glsl'
import { mainBlock } from './main.glsl'
import { blackHoleUniformsBlock } from './uniforms.glsl'

export interface BlackHoleShaderConfig extends ShaderConfig {
  /** Enable temporal accumulation (Horizon-style 1/4 res reconstruction) */
  temporalAccumulation?: boolean
  /** Enable Doppler effect */
  doppler?: boolean
  /** Enable environment map sampling */
  envMap?: boolean
  /** Enable motion blur effect */
  motionBlur?: boolean
  /** Enable slice animation for higher dimensions */
  sliceAnimation?: boolean
  /** PERF (OPT-BH-1): Enable pre-baked noise texture for faster disk rendering */
  noiseTexture?: boolean
  /** PERF (OPT-BH-17): Enable pre-baked blackbody LUT for faster temperature coloring */
  blackbodyLUT?: boolean
}

/**
 * Compose Black Hole fragment shader with specified features.
 * @param config - Black hole shader configuration options
 * @returns Composed shader source code
 */
export function composeBlackHoleShader(config: BlackHoleShaderConfig) {
  const {
    dimension,
    // Note: shadows not implemented for black holes - no shader code exists
    // shadows: enableShadows,
    temporal: enableTemporal,
    overrides = [],
    temporalAccumulation = false,
    doppler: enableDoppler = true,
    envMap: enableEnvMap = false,
    motionBlur: enableMotionBlur = false,
    sliceAnimation: enableSliceAnimation = false,
    noiseTexture: enableNoiseTexture = true, // PERF (OPT-BH-1): Enable by default for faster rendering
    blackbodyLUT: enableBlackbodyLUT = true, // PERF (OPT-BH-17): Enable by default for faster rendering
  } = config

  const defines: string[] = []
  const features: string[] = []

  // Add dimension define
  defines.push(`#define DIMENSION ${dimension}`)
  features.push(`${dimension}D Black Hole`)

  // Temporal accumulation
  const useTemporalAccumulation =
    temporalAccumulation && !overrides.includes('Temporal Accumulation')

  if (useTemporalAccumulation) {
    defines.push('#define USE_TEMPORAL_ACCUMULATION')
    features.push('Temporal Accumulation (1/4 res)')
  }

  // Doppler
  if (enableDoppler && !overrides.includes('Doppler')) {
    defines.push('#define USE_DOPPLER')
    features.push('Doppler Effect')
  }

  // Environment map
  if (enableEnvMap && !overrides.includes('EnvMap')) {
    defines.push('#define USE_ENVMAP')
    features.push('Environment Map')
  }

  // Motion Blur
  if (enableMotionBlur && !overrides.includes('Motion Blur')) {
    defines.push('#define USE_MOTION_BLUR')
    features.push('Motion Blur')
  }

  // Volumetric Disk (always enabled)
  defines.push('#define USE_VOLUMETRIC_DISK')
  features.push('Volumetric Accretion Disk')

  // PERF (OPT-BH-1): Noise texture for faster volumetric disk rendering
  const useNoiseTexture = enableNoiseTexture && !overrides.includes('Noise Texture')
  if (useNoiseTexture) {
    defines.push('#define USE_NOISE_TEXTURE')
    features.push('Noise Texture LUT')
  }

  // PERF (OPT-BH-17): Blackbody LUT for faster temperature-based coloring
  const useBlackbodyLUT = enableBlackbodyLUT && !overrides.includes('Blackbody LUT')
  if (useBlackbodyLUT) {
    defines.push('#define USE_BLACKBODY_LUT')
    features.push('Blackbody LUT')
  }

  // Slice animation (for higher dimensions)
  const useSliceAnimation =
    enableSliceAnimation && dimension > 3 && !overrides.includes('Slice Animation')
  if (useSliceAnimation) {
    defines.push('#define USE_SLICE_ANIMATION')
    features.push('Slice Animation')
  }

  // Note: Shadows not implemented for black holes - shader code doesn't exist yet
  // Can be added later when proper volumetric shadow raymarching is implemented

  // Build parameter values uniform declaration for higher dimensions
  const paramValuesStr = `uniform float uParamValues[${Math.max(dimension - 3, 1)}];`

  // Build slice animation uniforms if enabled
  const sliceAnimationUniforms = useSliceAnimation
    ? `
// Slice animation uniforms
uniform float uSliceSpeed;
uniform float uSliceAmplitude;
`
    : ''

  const blocks = [
    // Defines first
    { name: 'Defines', content: defines.join('\n') },
    { name: 'Precision', content: precisionBlock },
    {
      name: 'Vertex Inputs',
      content: `\n// Inputs from vertex shader\nin vec3 vPosition;\nin vec2 vUv;\n`,
    },
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },
    { name: 'Param Values', content: paramValuesStr },
    { name: 'Slice Animation Uniforms', content: sliceAnimationUniforms, condition: useSliceAnimation },
    { name: 'Black Hole Uniforms', content: blackHoleUniformsBlock },
    { name: 'Environment Map', content: 'uniform samplerCube envMap;', condition: enableEnvMap },
    // PERF (OPT-BH-1): Pre-baked 3D noise texture for volumetric disk
    { name: 'Disk Noise Texture', content: 'uniform sampler3D tDiskNoise;', condition: useNoiseTexture },
    // PERF (OPT-BH-17): Pre-baked blackbody color LUT for temperature coloring
    { name: 'Blackbody LUT', content: 'uniform sampler2D tBlackbodyLUT;', condition: useBlackbodyLUT },
    
    // Core Libraries
    { name: 'Palette Lib', content: GLSL_ALL_PALETTE_FUNCTIONS },

    // Gravity modules
    { name: 'Lensing', content: lensingBlock },
    { name: 'Horizon', content: horizonBlock },
    { name: 'Photon Shell', content: shellBlock },
    { name: 'Manifold', content: manifoldBlock },
    { name: 'Doppler', content: dopplerBlock },
    { name: 'Colors', content: colorsBlock },
    
    // Disk implementations
    // Volumetric disk provides continuous density sampling (always enabled)
    { name: 'Disk Volumetric', content: diskVolumetricBlock },
    // SDF disk provides plane crossing detection for Einstein rings
    { name: 'Disk SDF', content: diskSdfBlock },

    // Effects
    { name: 'Motion Blur', content: motionBlurBlock, condition: enableMotionBlur },

    // Temporal (if needed)
    {
      name: 'Temporal',
      content: temporalBlock,
      condition: useTemporalAccumulation || enableTemporal,
    },

    // Main shader
    { name: 'Main', content: mainBlock },
  ]

  // Filter and join blocks
  const shaderSource = blocks
    .filter((block) => block.condition === undefined || block.condition)
    .map((block) => `// === ${block.name} ===\n${block.content}`)
    .join('\n\n')

  return {
    fragmentShader: shaderSource,
    features,
  }
}

/**
 * Generate vertex shader for black hole raymarching.
 * Uses standard MVP transform with BackSide rendering on box geometry.
 * @returns Vertex shader GLSL source
 */
export function generateBlackHoleVertexShader(): string {
  return /* glsl */ `
    precision highp float;

    out vec3 vPosition;
    out vec2 vUv;

    void main() {
      vUv = uv;
      // Transform to world space - required for raymarching
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vPosition = worldPosition.xyz;
      // Standard MVP transform
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `
}