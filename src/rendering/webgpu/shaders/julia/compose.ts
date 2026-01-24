/**
 * Julia WGSL Shader Composer
 *
 * Assembles complete Julia fragment shader from modular blocks.
 * Port of GLSL compose.ts to WGSL.
 *
 * @module rendering/webgpu/shaders/julia/compose
 */

import {
  assembleShaderBlocks,
  generateObjectBindGroup,
  generateStandardBindGroups,
  generateTextureBindings,
  mrtOutputBlock,
  processFeatureFlags,
  raymarchVertexInputsBlock,
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

// Lighting blocks
import { ggxBlock } from '../shared/lighting/ggx.wgsl'
import { iblBlock, iblUniformsBlock, pmremSamplingBlock } from '../shared/lighting/ibl.wgsl'
import { multiLightBlock } from '../shared/lighting/multi-light.wgsl'
import { sssBlock } from '../shared/lighting/sss.wgsl'

// Raymarching blocks
import { raymarchCoreBlock } from '../shared/raymarch/core.wgsl'
import { normalBlock } from '../shared/raymarch/normal.wgsl'

// Feature blocks
import { aoBlock } from '../shared/features/ao.wgsl'
import { shadowsBlock } from '../shared/features/shadows.wgsl'
import { temporalBlock } from '../shared/features/temporal.wgsl'

// Julia-specific blocks
import { juliaUniformsBlock } from './uniforms.wgsl'
import { juliaPowerBlock } from './power.wgsl'
import { quaternionBlock } from './quaternion.wgsl'
import { sdf3dBlock } from './sdf3d.wgsl'
import { sdf4dBlock } from './sdf4d.wgsl'
import { sdf5dBlock } from './sdf5d.wgsl'
import { sdf6dBlock } from './sdf6d.wgsl'
import { sdf7dBlock } from './sdf7d.wgsl'
import { sdf8dBlock } from './sdf8d.wgsl'
import { sdf9dBlock } from './sdf9d.wgsl'
import { sdf10dBlock } from './sdf10d.wgsl'
import { sdf11dBlock } from './sdf11d.wgsl'
import { mainBlock, mainBlockWithIBL } from './main.wgsl'

/**
 * SDF blocks by dimension.
 */
const sdfBlocks: Record<number, { block: string; name: string }> = {
  3: { block: sdf3dBlock, name: 'SDF Julia 3D' },
  4: { block: sdf4dBlock, name: 'SDF Julia 4D' },
  5: { block: sdf5dBlock, name: 'SDF Julia 5D' },
  6: { block: sdf6dBlock, name: 'SDF Julia 6D' },
  7: { block: sdf7dBlock, name: 'SDF Julia 7D' },
  8: { block: sdf8dBlock, name: 'SDF Julia 8D' },
  9: { block: sdf9dBlock, name: 'SDF Julia 9D' },
  10: { block: sdf10dBlock, name: 'SDF Julia 10D' },
  11: { block: sdf11dBlock, name: 'SDF Julia 11D' },
}

/**
 * Generate the SDF dispatch function for the given dimension.
 */
function generateDispatch(dimension: number): string {
  // Generate dispatch for dimensions 3-11
  if (dimension >= 3 && dimension <= 11) {
    const funcSuffix =
      dimension === 3 || dimension === 4 ? `Julia${dimension}D` : `Julia${dimension}D`
    return /* wgsl */ `
// SDF Dispatch (Julia ${dimension}D)
fn GetDist(p: vec3f) -> f32 {
  return sdfJulia${dimension}D_simple(
    p * julia.scale,
    julia.effectivePower,
    julia.effectiveBailout,
    i32(julia.iterations)
  ) / julia.scale;
}

fn GetDistWithOrbital(p: vec3f) -> vec2f {
  let result = sdfJulia${dimension}D(
    p * julia.scale,
    julia.effectivePower,
    julia.effectiveBailout,
    i32(julia.iterations)
  );
  return vec2f(result.x / julia.scale, result.y);
}
`
  }

  // Default fallback (shouldn't reach here)
  return /* wgsl */ `
// SDF Dispatch (Julia - fallback to 4D)
fn GetDist(p: vec3f) -> f32 {
  return sdfJulia4D_simple(
    p * julia.scale,
    julia.effectivePower,
    julia.effectiveBailout,
    i32(julia.iterations)
  ) / julia.scale;
}

fn GetDistWithOrbital(p: vec3f) -> vec2f {
  let result = sdfJulia4D(
    p * julia.scale,
    julia.effectivePower,
    julia.effectiveBailout,
    i32(julia.iterations)
  );
  return vec2f(result.x / julia.scale, result.y);
}
`
}

/**
 * Compose complete Julia fragment shader.
 */
export function composeJuliaShader(config: WGSLShaderConfig): {
  wgsl: string
  modules: string[]
  features: ReturnType<typeof processFeatureFlags>['features']
} {
  const {
    dimension,
    shadows: enableShadows,
    temporal: enableTemporal,
    ambientOcclusion: enableAO,
    sss: enableSss,
    ibl: enableIBL = true,
    overrides = [],
  } = config

  // Process feature flags
  const flags = processFeatureFlags(config)

  // Select SDF block based on dimension
  const sdfInfo = sdfBlocks[dimension] ?? {
    block: sdf4dBlock,
    name: 'SDF Julia 4D (fallback)',
  }

  // Build blocks array
  const blocks = [
    // Vertex inputs and outputs
    { name: 'Vertex Inputs', content: raymarchVertexInputsBlock },
    { name: 'MRT Output', content: mrtOutputBlock },

    // Feature defines
    { name: 'Defines', content: flags.defines.join('\n') },

    // Core
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },

    // Bind groups
    { name: 'Standard Bind Groups', content: generateStandardBindGroups() },
    {
      name: 'Julia Uniforms',
      content:
        juliaUniformsBlock +
        '\n' +
        generateObjectBindGroup(4, 'JuliaUniforms', 'julia') +
        '\n' +
        generateObjectBindGroup(4, 'BasisVectors', 'basis'),
    },

    // IBL textures
    {
      name: 'IBL Textures',
      content:
        iblUniformsBlock +
        '\n' +
        generateObjectBindGroup(5, 'IBLUniforms', 'iblUniforms') +
        '\n' +
        generateTextureBindings(5, [{ name: 'envMap' }]),
      condition: enableIBL,
    },

    // Utility functions
    { name: 'Power Helpers', content: juliaPowerBlock },
    { name: 'Quaternion Math', content: quaternionBlock },

    // Color
    { name: 'Color (HSL)', content: hslBlock },
    { name: 'Color (Cosine)', content: cosinePaletteBlock },
    { name: 'Color (Oklab)', content: oklabBlock },
    { name: 'Color Selector', content: selectorBlock },

    // Lighting
    { name: 'Lighting (GGX)', content: ggxBlock },
    { name: 'PMREM Sampling', content: pmremSamplingBlock, condition: enableIBL },
    { name: 'IBL Functions', content: iblBlock, condition: enableIBL },
    { name: 'Multi-Light System', content: multiLightBlock },
    { name: 'Lighting (SSS)', content: sssBlock, condition: enableSss },

    // SDF
    { name: sdfInfo.name, content: sdfInfo.block },
    { name: 'SDF Dispatch', content: generateDispatch(dimension) },

    // Raymarching
    { name: 'Raymarching Core', content: raymarchCoreBlock },
    { name: 'Normal Calculation', content: normalBlock },

    // Features
    { name: 'Temporal Reprojection', content: temporalBlock, condition: enableTemporal },
    { name: 'Ambient Occlusion', content: aoBlock, condition: enableAO },
    { name: 'Shadows', content: shadowsBlock, condition: enableShadows },

    // Main shader
    { name: 'Main', content: enableIBL ? mainBlockWithIBL : mainBlock },
  ]

  // Assemble
  const { wgsl, modules } = assembleShaderBlocks(
    blocks,
    overrides.map((o) => ({ target: o.target, replacement: o.replacement }))
  )

  return { wgsl, modules, features: flags.features }
}

/**
 * Create vertex shader for Julia rendering.
 */
export function composeJuliaVertexShader(): string {
  return /* wgsl */ `
// Julia Vertex Shader
// Transforms vertices and computes ray direction for fragment shader

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
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) vPosition: vec3f,
  @location(1) vNormal: vec3f,
  @location(2) vUv: vec2f,
  @location(3) vRayOrigin: vec3f,
  @location(4) vRayDir: vec3f,
}

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // World position (assuming model matrix is identity for now)
  let worldPos = input.position;

  // Clip position
  output.clipPosition = camera.viewProjectionMatrix * vec4f(worldPos, 1.0);

  // Pass through
  output.vPosition = worldPos;
  output.vNormal = input.normal;
  output.vUv = input.uv;

  // Ray origin is camera position
  output.vRayOrigin = camera.cameraPosition;

  // Ray direction is from camera to vertex
  output.vRayDir = normalize(worldPos - camera.cameraPosition);

  return output;
}
`
}
