/**
 * Mandelbulb WGSL Shader Composer
 *
 * Assembles complete Mandelbulb fragment shader from modular blocks.
 * Port of GLSL compose.ts to WGSL.
 *
 * @module rendering/webgpu/shaders/mandelbulb/compose
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

// Mandelbulb-specific blocks
import { mandelbulbUniformsBlock } from './uniforms.wgsl'
import { sdf3dBlock } from './sdf3d.wgsl'
import { sdf4dBlock } from './sdf4d.wgsl'
import { mainBlock, mainBlockWithIBL } from './main.wgsl'

/**
 * SDF blocks by dimension.
 */
const sdfBlocks: Record<number, { block: string; name: string }> = {
  3: { block: sdf3dBlock, name: 'SDF 3D' },
  4: { block: sdf4dBlock, name: 'SDF 4D' },
  // Higher dimensions would be added here
}

/**
 * Generate the SDF dispatch function for the given dimension.
 */
function generateDispatch(dimension: number): string {
  if (dimension === 3) {
    return /* wgsl */ `
// SDF Dispatch (3D)
fn GetDist(p: vec3f) -> f32 {
  return mandelbulbSDF3D(
    p * mandelbulb.scale,
    mandelbulb.effectivePower,
    i32(mandelbulb.iterations),
    mandelbulb.effectiveBailout,
    select(0.0, mandelbulb.phaseTheta, mandelbulb.phaseEnabled != 0u),
    select(0.0, mandelbulb.phasePhi, mandelbulb.phaseEnabled != 0u)
  ) / mandelbulb.scale;
}

fn GetDistWithOrbital(p: vec3f) -> vec2f {
  let result = mandelbulbSDF3DWithOrbital(
    p * mandelbulb.scale,
    mandelbulb.effectivePower,
    i32(mandelbulb.iterations),
    mandelbulb.effectiveBailout,
    select(0.0, mandelbulb.phaseTheta, mandelbulb.phaseEnabled != 0u),
    select(0.0, mandelbulb.phasePhi, mandelbulb.phaseEnabled != 0u)
  );
  return vec2f(result.x / mandelbulb.scale, result.y);
}
`
  }

  if (dimension === 4) {
    return /* wgsl */ `
// SDF Dispatch (4D)
fn GetDist(p: vec3f) -> f32 {
  return mandelbulbSDF4DFromBasis(p, basis, mandelbulb);
}

fn GetDistWithOrbital(p: vec3f) -> vec2f {
  // Transform to 4D
  let p4d = vec4f(
    p.x * getBasisComponent(basis.basisX, 0) +
    p.y * getBasisComponent(basis.basisY, 0) +
    p.z * getBasisComponent(basis.basisZ, 0) +
    getBasisComponent(basis.origin, 0),
    p.x * getBasisComponent(basis.basisX, 1) +
    p.y * getBasisComponent(basis.basisY, 1) +
    p.z * getBasisComponent(basis.basisZ, 1) +
    getBasisComponent(basis.origin, 1),
    p.x * getBasisComponent(basis.basisX, 2) +
    p.y * getBasisComponent(basis.basisY, 2) +
    p.z * getBasisComponent(basis.basisZ, 2) +
    getBasisComponent(basis.origin, 2),
    p.x * getBasisComponent(basis.basisX, 3) +
    p.y * getBasisComponent(basis.basisY, 3) +
    p.z * getBasisComponent(basis.basisZ, 3) +
    getBasisComponent(basis.origin, 3)
  ) * mandelbulb.scale;

  let phase = select(0.0, mandelbulb.phaseTheta, mandelbulb.phaseEnabled != 0u);
  let result = mandelbulbSDF4DWithOrbital(
    p4d,
    mandelbulb.effectivePower,
    i32(mandelbulb.iterations),
    mandelbulb.effectiveBailout,
    phase
  );
  return vec2f(result.x / mandelbulb.scale, result.y);
}
`
  }

  // Default for higher dimensions (would need array-based SDF)
  return /* wgsl */ `
// SDF Dispatch (${dimension}D - array based)
fn GetDist(p: vec3f) -> f32 {
  // Higher dimensional SDF would be implemented here
  return length(p) - 1.0;  // Placeholder sphere
}

fn GetDistWithOrbital(p: vec3f) -> vec2f {
  return vec2f(GetDist(p), length(p));
}
`
}

/**
 * Compose complete Mandelbulb fragment shader.
 */
export function composeMandelbulbShader(config: WGSLShaderConfig): {
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
    block: sdf3dBlock,
    name: 'SDF 3D (fallback)',
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
      name: 'Mandelbulb Uniforms',
      content:
        mandelbulbUniformsBlock +
        '\n' +
        generateObjectBindGroup(4, 'MandelbulbUniforms', 'mandelbulb') +
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
 * Create vertex shader for Mandelbulb rendering.
 */
export function composeMandelbulbVertexShader(): string {
  return /* wgsl */ `
// Mandelbulb Vertex Shader
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
