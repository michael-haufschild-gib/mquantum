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
  generateObjectBindGroup,
  generateStandardBindGroups,
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
import { diskSdfBlock } from './disk-sdf.wgsl'
import { dopplerBlock } from './doppler.wgsl'
import { mainBlock, mainBlockWithEnvMap } from './main.wgsl'

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

    // Defines
    { name: 'Defines', content: defines.join('\n') },

    // Core
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },

    // Bind groups
    { name: 'Standard Bind Groups', content: generateStandardBindGroups() },
    {
      name: 'BlackHole Uniforms',
      content:
        blackHoleUniformsBlock +
        '\n' +
        generateObjectBindGroup(4, 'BlackHoleUniforms', 'blackhole') +
        '\n' +
        generateObjectBindGroup(4, 'BasisVectors', 'basis'),
    },

    // Environment map textures
    {
      name: 'Environment Map',
      content: generateTextureBindings(5, [{ name: 'envMap', type: 'cube' }]),
      condition: enableEnvMap,
    },

    // Gravity modules
    { name: 'Lensing', content: lensingBlock },
    { name: 'Horizon', content: horizonBlock },
    { name: 'Photon Shell', content: shellBlock },
    { name: 'Doppler', content: dopplerBlock },
    { name: 'Colors', content: colorsBlock },
    { name: 'Disk SDF', content: diskSdfBlock },

    // Main shader
    { name: 'Main', content: enableEnvMap ? mainBlockWithEnvMap : mainBlock },
  ]

  // Assemble
  const { wgsl, modules } = assembleShaderBlocks(
    blocks,
    overrides.map((o) => ({ target: o.target, replacement: o.replacement }))
  )

  return { wgsl, modules, features }
}

/**
 * Create vertex shader for BlackHole rendering.
 */
export function composeBlackHoleVertexShader(): string {
  return /* wgsl */ `
// BlackHole Vertex Shader
// Transforms vertices for raymarching

struct CameraUniforms {
  viewMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  viewProjectionMatrix: mat4x4f,
  inverseViewMatrix: mat4x4f,
  inverseProjectionMatrix: mat4x4f,
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
  @location(0) position: vec3f,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) vPosition: vec3f,
}

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // World position (model matrix assumed identity)
  let worldPos = input.position;
  output.vPosition = worldPos;

  // Clip position
  output.clipPosition = camera.viewProjectionMatrix * vec4f(worldPos, 1.0);

  return output;
}
`
}
