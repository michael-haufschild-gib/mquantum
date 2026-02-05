/**
 * BlackHole WGSL Shader Composer
 *
 * Assembles complete BlackHole fragment shader from modular blocks.
 * Port of GLSL compose.ts to WGSL.
 *
 * @module rendering/webgpu/shaders/blackhole/compose
 */

import {
  assembleShaderBlocks,
  generateConsolidatedBindGroups,
  generateObjectBindGroup,
  generateTextureBindings,
  type WGSLShaderConfig,
} from '../shared/compose-helpers'

// Core blocks
import { constantsBlock } from '../shared/core/constants.wgsl'
import { uniformsBlock } from '../shared/core/uniforms.wgsl'

// BlackHole-specific blocks
import { blackHoleUniformsBlock } from './uniforms.wgsl'
import { lensingBlock } from './lensing.wgsl'
import { horizonBlock } from './horizon.wgsl'
import { shellBlock } from './shell.wgsl'
import { colorsBlock } from './colors.wgsl'
import { diskVolumetricBlock } from './disk-volumetric.wgsl'
import { manifoldBlock } from './manifold.wgsl'
import { motionBlurBlock } from './motion-blur.wgsl'
import { dopplerBlock } from './doppler.wgsl'
import { mainHelpersBlock, mainBlock } from './main.wgsl'

/**
 * BlackHole shader configuration options.
 */
export interface BlackHoleWGSLShaderConfig extends WGSLShaderConfig {
  /** Enable Doppler effect */
  doppler?: boolean
  /** Enable environment map sampling */
  envMap?: boolean
  /** Enable motion blur effect */
  motionBlur?: boolean
}

/**
 * Compose complete BlackHole fragment shader.
 * @param config
 */
export function composeBlackHoleShader(config: BlackHoleWGSLShaderConfig): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const {
    dimension,
    doppler: enableDoppler = true,
    envMap: enableEnvMap = false,
    overrides = [],
  } = config

  const defines: string[] = []
  const features: string[] = []

  // Add dimension define
  defines.push(`const DIMENSION: i32 = ${dimension};`)
  features.push(`${dimension}D Black Hole`)

  // Doppler
  if (enableDoppler) {
    defines.push('const USE_DOPPLER: bool = true;')
    features.push('Doppler Effect')
  } else {
    defines.push('const USE_DOPPLER: bool = false;')
  }

  // Environment map
  if (enableEnvMap) {
    defines.push('const USE_ENVMAP: bool = true;')
    features.push('Environment Map')
  } else {
    defines.push('const USE_ENVMAP: bool = false;')
  }

  // Volumetric Disk (always enabled)
  defines.push('const USE_VOLUMETRIC_DISK: bool = true;')
  features.push('Volumetric Accretion Disk')

  // Build blocks array
  const blocks = [
    // Vertex inputs (fullscreen quad - receives NDC position for per-pixel ray computation)
    {
      name: 'Vertex Inputs',
      content: /* wgsl */ `
struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) vNDC: vec2f,
}
`,
    },

    // Defines
    { name: 'Defines', content: defines.join('\n') },

    // Core
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },

    // Bind groups - using consolidated layout to stay within 4-group limit
    // Group 0: Camera
    // Group 1: Lighting + Material + Quality
    // Group 2: Object (BlackHole + Basis)
    // Group 3: Environment Map (if enabled)
    { name: 'Standard Bind Groups', content: generateConsolidatedBindGroups() },
    {
      name: 'BlackHole Uniforms',
      content:
        blackHoleUniformsBlock +
        '\n' +
        generateObjectBindGroup(2, 'BlackHoleUniforms', 'blackhole', 0) +
        '\n' +
        generateObjectBindGroup(2, 'BasisVectors', 'basis', 1),
    },

    // Environment map textures
    {
      name: 'Environment Map',
      content: generateTextureBindings(3, [{ name: 'envMap', type: 'texture_cube<f32>' }]),
      condition: enableEnvMap,
    },

    // Gravity modules
    { name: 'Lensing', content: lensingBlock },
    { name: 'Horizon', content: horizonBlock },
    { name: 'Photon Shell', content: shellBlock },
    { name: 'Doppler', content: dopplerBlock },
    { name: 'Colors', content: colorsBlock },

    // Accretion disk modules (volumetric raymarching)
    { name: 'Disk Manifold', content: manifoldBlock },
    { name: 'Disk Volumetric', content: diskVolumetricBlock },
    { name: 'Motion Blur', content: motionBlurBlock },

    // Main shader (helpers + fragment function)
    { name: 'Main Helpers', content: mainHelpersBlock },
    { name: 'Main', content: mainBlock },
  ]

  // Assemble
  const { wgsl, modules } = assembleShaderBlocks(
    blocks,
    overrides.map((o) => ({ target: o.target, replacement: o.replacement }))
  )

  return { wgsl, modules, features }
}

/**
 * Create vertex shader for BlackHole rendering (fullscreen quad).
 * Computes ray direction from screen UV using camera matrices.
 */
export function composeBlackHoleVertexShader(): string {
  return /* wgsl */ `
// BlackHole Vertex Shader (Fullscreen Triangle)
// Passes NDC position to fragment shader for per-pixel ray direction computation.
// Ray direction MUST be computed per-pixel (not per-vertex) because the oversized
// triangle trick uses vertices at (-1,-1), (3,-1), (-1,3) and normalize() is
// non-linear — interpolating normalized vectors from oversized positions produces
// distorted ray directions that shift the black hole off-center.

struct VertexInput {
  @location(0) position: vec2f,
  @location(1) uv: vec2f,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) vNDC: vec2f,
}

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Direct clip position from fullscreen triangle vertices
  output.clipPosition = vec4f(input.position, 0.0, 1.0);

  // Pass NDC position (will be correctly interpolated since it's linear)
  output.vNDC = input.position;

  return output;
}
`
}
