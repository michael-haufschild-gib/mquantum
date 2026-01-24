/**
 * Polytope WGSL Shader Composer
 *
 * Assembles complete Polytope vertex and fragment shaders.
 * Port of GLSL compose.ts to WGSL.
 *
 * @module rendering/webgpu/shaders/polytope/compose
 */

import {
  assembleShaderBlocks,
  generateStandardBindGroups,
  generateObjectBindGroup,
  type WGSLShaderConfig,
} from '../shared/compose-helpers'

// Core blocks
import { constantsBlock } from '../shared/core/constants.wgsl'
import { uniformsBlock } from '../shared/core/uniforms.wgsl'

// Color blocks
import { cosinePaletteBlock } from '../shared/color/cosine-palette.wgsl'
import { hslBlock } from '../shared/color/hsl.wgsl'
import { selectorBlock } from '../shared/color/selector.wgsl'

// Lighting blocks
import { ggxBlock } from '../shared/lighting/ggx.wgsl'
import { multiLightBlock } from '../shared/lighting/multi-light.wgsl'

// Polytope-specific blocks
import { transformNDBlock } from './transform-nd.wgsl'

/**
 * Polytope shader configuration.
 */
export interface PolytopeWGSLShaderConfig extends WGSLShaderConfig {
  /** Render mode: 'face' or 'edge' */
  mode?: 'face' | 'edge'
  /** Use flat shading */
  flatShading?: boolean
}

/**
 * Polytope uniforms block.
 */
export const polytopeUniformsBlock = /* wgsl */ `
// ============================================
// Polytope Uniforms
// ============================================

struct PolytopeUniforms {
  // Dimension
  dimension: i32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,

  // Material
  baseColor: vec3f,
  opacity: f32,

  edgeColor: vec3f,
  edgeWidth: f32,

  // Shading
  roughness: f32,
  metalness: f32,
  ambientIntensity: f32,
  emissiveIntensity: f32,
}
`

/**
 * Compose face vertex shader.
 */
export function composeFaceVertexShader(_config: PolytopeWGSLShaderConfig): string {
  return /* wgsl */ `
// Polytope Face Vertex Shader

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

${polytopeUniformsBlock}

struct BasisVectors {
  basisX: array<f32, 11>,
  basisY: array<f32, 11>,
  basisZ: array<f32, 11>,
  origin: array<f32, 11>,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(4) @binding(0) var<uniform> polytope: PolytopeUniforms;
@group(4) @binding(1) var<uniform> basis: BasisVectors;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) extraDims0_3: vec4f,  // Extra dimensions 0-3
  @location(3) extraDims4_7: vec4f,  // Extra dimensions 4-7
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) normal: vec3f,
  @location(2) viewDir: vec3f,
}

${transformNDBlock}

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Pack extra dims into array
  var extraDims: array<f32, 8>;
  extraDims[0] = input.extraDims0_3.x;
  extraDims[1] = input.extraDims0_3.y;
  extraDims[2] = input.extraDims0_3.z;
  extraDims[3] = input.extraDims0_3.w;
  extraDims[4] = input.extraDims4_7.x;
  extraDims[5] = input.extraDims4_7.y;
  extraDims[6] = input.extraDims4_7.z;
  extraDims[7] = input.extraDims4_7.w;

  // Transform from N-D to 3D
  let pos3d = transformND(
    input.position,
    extraDims,
    basis.basisX,
    basis.basisY,
    basis.basisZ,
    basis.origin,
    polytope.dimension
  );

  // World position
  output.worldPosition = pos3d;

  // Clip position
  output.clipPosition = camera.viewProjectionMatrix * vec4f(pos3d, 1.0);

  // Normal (simplified - in full implementation would transform normal too)
  output.normal = normalize(input.normal);

  // View direction
  output.viewDir = normalize(camera.cameraPosition - pos3d);

  return output;
}
`
}

/**
 * Compose face fragment shader.
 */
export function composeFaceFragmentShader(config: PolytopeWGSLShaderConfig): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const defines: string[] = []
  const features: string[] = []

  defines.push(`const DIMENSION: i32 = ${config.dimension};`)
  features.push('Polytope Faces')
  features.push('PBR Lighting')

  const blocks = [
    { name: 'Defines', content: defines.join('\n') },
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },
    { name: 'Standard Bind Groups', content: generateStandardBindGroups() },
    {
      name: 'Polytope Uniforms',
      content:
        polytopeUniformsBlock +
        '\n' +
        generateObjectBindGroup(4, 'PolytopeUniforms', 'polytope') +
        '\n' +
        generateObjectBindGroup(4, 'BasisVectors', 'basis'),
    },
    { name: 'Color (HSL)', content: hslBlock },
    { name: 'Color (Cosine)', content: cosinePaletteBlock },
    { name: 'Color Selector', content: selectorBlock },
    { name: 'GGX PBR', content: ggxBlock },
    { name: 'Multi-Light', content: multiLightBlock },
    {
      name: 'Fragment Input',
      content: /* wgsl */ `
struct FragmentInput {
  @location(0) worldPosition: vec3f,
  @location(1) normal: vec3f,
  @location(2) viewDir: vec3f,
}
`,
    },
    {
      name: 'Main',
      content: /* wgsl */ `
@fragment
fn fragmentMain(input: FragmentInput) -> @location(0) vec4f {
  let N = normalize(input.normal);
  let V = normalize(input.viewDir);

  // Simple lighting
  let lightDir = normalize(vec3f(1.0, 1.0, 1.0));
  let NdotL = max(dot(N, lightDir), 0.0);

  // Base color from uniforms
  let baseColor = polytope.baseColor;

  // Diffuse
  let diffuse = baseColor * NdotL;

  // Ambient
  let ambient = baseColor * polytope.ambientIntensity;

  // Specular (GGX simplified)
  let H = normalize(lightDir + V);
  let NdotH = max(dot(N, H), 0.0);
  let specular = pow(NdotH, (1.0 - polytope.roughness) * 64.0) * 0.5;

  let finalColor = ambient + diffuse + vec3f(specular);

  return vec4f(finalColor, polytope.opacity);
}
`,
    },
  ]

  const { wgsl, modules } = assembleShaderBlocks(blocks, [])

  return { wgsl, modules, features }
}

/**
 * Compose edge vertex shader.
 */
export function composeEdgeVertexShader(_config: PolytopeWGSLShaderConfig): string {
  return /* wgsl */ `
// Polytope Edge Vertex Shader

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

${polytopeUniformsBlock}

struct BasisVectors {
  basisX: array<f32, 11>,
  basisY: array<f32, 11>,
  basisZ: array<f32, 11>,
  origin: array<f32, 11>,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(4) @binding(0) var<uniform> polytope: PolytopeUniforms;
@group(4) @binding(1) var<uniform> basis: BasisVectors;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) extraDims0_3: vec4f,
  @location(2) extraDims4_7: vec4f,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) worldPosition: vec3f,
}

${transformNDBlock}

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  var extraDims: array<f32, 8>;
  extraDims[0] = input.extraDims0_3.x;
  extraDims[1] = input.extraDims0_3.y;
  extraDims[2] = input.extraDims0_3.z;
  extraDims[3] = input.extraDims0_3.w;
  extraDims[4] = input.extraDims4_7.x;
  extraDims[5] = input.extraDims4_7.y;
  extraDims[6] = input.extraDims4_7.z;
  extraDims[7] = input.extraDims4_7.w;

  let pos3d = transformND(
    input.position,
    extraDims,
    basis.basisX,
    basis.basisY,
    basis.basisZ,
    basis.origin,
    polytope.dimension
  );

  output.worldPosition = pos3d;
  output.clipPosition = camera.viewProjectionMatrix * vec4f(pos3d, 1.0);

  return output;
}
`
}

/**
 * Compose edge fragment shader.
 */
export function composeEdgeFragmentShader(_config: PolytopeWGSLShaderConfig): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const wgsl = /* wgsl */ `
// Polytope Edge Fragment Shader

struct PolytopeUniforms {
  dimension: i32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
  baseColor: vec3f,
  opacity: f32,
  edgeColor: vec3f,
  edgeWidth: f32,
  roughness: f32,
  metalness: f32,
  ambientIntensity: f32,
  emissiveIntensity: f32,
}

@group(4) @binding(0) var<uniform> polytope: PolytopeUniforms;

struct FragmentInput {
  @location(0) worldPosition: vec3f,
}

@fragment
fn fragmentMain(input: FragmentInput) -> @location(0) vec4f {
  return vec4f(polytope.edgeColor, 1.0);
}
`

  return { wgsl, modules: ['Edge Fragment'], features: ['Polytope Edges'] }
}
