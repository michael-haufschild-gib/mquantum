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
    // Vertex inputs (fullscreen quad - receives ray direction from vertex shader)
    {
      name: 'Vertex Inputs',
      content: /* wgsl */ `
struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) vRayDir: vec3f,
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
// BlackHole Vertex Shader (Fullscreen Quad)
// Computes ray direction from screen UV for raymarching

struct CameraUniforms {
  viewMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  viewProjectionMatrix: mat4x4f,
  inverseViewMatrix: mat4x4f,
  inverseProjectionMatrix: mat4x4f,
  modelMatrix: mat4x4f,
  inverseModelMatrix: mat4x4f,
  cameraPosition: vec3f,
  cameraNear: f32,
  cameraFar: f32,
  fov: f32,
  resolution: vec2f,
  aspectRatio: f32,
  time: f32,
  deltaTime: f32,
  frameNumber: u32,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

struct VertexInput {
  @location(0) position: vec2f,
  @location(1) uv: vec2f,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) vRayDir: vec3f,
}

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Direct clip position from fullscreen quad vertices
  output.clipPosition = vec4f(input.position, 0.0, 1.0);

  // Compute ray direction from UV
  // Convert UV (0-1) to NDC (-1 to 1)
  let ndc = input.position;

  // Reconstruct view-space direction using inverse projection
  let clipPos = vec4f(ndc.x, ndc.y, 1.0, 1.0);
  var viewPos = camera.inverseProjectionMatrix * clipPos;
  viewPos = viewPos / viewPos.w;

  // Transform view direction to world space
  let worldDir = (camera.inverseViewMatrix * vec4f(normalize(viewPos.xyz), 0.0)).xyz;
  output.vRayDir = normalize(worldDir);

  return output;
}
`
}
