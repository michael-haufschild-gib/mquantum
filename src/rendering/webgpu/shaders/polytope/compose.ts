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
// Matches WebGL ND_TRANSFORM_GLSL uniforms
// ============================================

struct PolytopeUniforms {
  // N-D Transformation (matches TubeWireframe layout)
  rotationMatrix4D: mat4x4f,
  dimension: i32,
  uniformScale: f32,
  projectionDistance: f32,
  depthNormFactor: f32,

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

  // Extra rotation columns (7 * 4 = 28 floats for 5D-11D)
  // Stored as 7 vec4s for alignment
  extraRotCol0: vec4f,
  extraRotCol1: vec4f,
  extraRotCol2: vec4f,
  extraRotCol3: vec4f,
  extraRotCol4: vec4f,
  extraRotCol5: vec4f,
  extraRotCol6: vec4f,

  // Depth row sums (11 floats for projection)
  depthRowSums0_3: vec4f,
  depthRowSums4_7: vec4f,
  depthRowSums8_10: vec3f,
  _padDepth: f32,
}
`

/**
 * Compose face vertex shader.
 */
export function composeFaceVertexShader(_config: PolytopeWGSLShaderConfig): string {
  return /* wgsl */ `
// Polytope Face Vertex Shader
// Port of WebGL ND_TRANSFORM_GLSL

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

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(3) @binding(0) var<uniform> polytope: PolytopeUniforms;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) extraDims0_3: vec4f,  // Extra dimensions 4-7 (dim indices 3-6)
  @location(2) extraDims4_6: vec3f,  // Extra dimensions 8-10 (dim indices 7-9)
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) viewDir: vec3f,
}

${transformNDBlock}

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Build extra rotation columns array from uniforms
  var extraRotCols: array<vec4f, 7>;
  extraRotCols[0] = polytope.extraRotCol0;
  extraRotCols[1] = polytope.extraRotCol1;
  extraRotCols[2] = polytope.extraRotCol2;
  extraRotCols[3] = polytope.extraRotCol3;
  extraRotCols[4] = polytope.extraRotCol4;
  extraRotCols[5] = polytope.extraRotCol5;
  extraRotCols[6] = polytope.extraRotCol6;

  // Build depth row sums array from uniforms
  var depthRowSums: array<f32, 11>;
  depthRowSums[0] = polytope.depthRowSums0_3.x;
  depthRowSums[1] = polytope.depthRowSums0_3.y;
  depthRowSums[2] = polytope.depthRowSums0_3.z;
  depthRowSums[3] = polytope.depthRowSums0_3.w;
  depthRowSums[4] = polytope.depthRowSums4_7.x;
  depthRowSums[5] = polytope.depthRowSums4_7.y;
  depthRowSums[6] = polytope.depthRowSums4_7.z;
  depthRowSums[7] = polytope.depthRowSums4_7.w;
  depthRowSums[8] = polytope.depthRowSums8_10.x;
  depthRowSums[9] = polytope.depthRowSums8_10.y;
  depthRowSums[10] = polytope.depthRowSums8_10.z;

  // Transform from N-D to 3D using rotation + perspective projection
  let pos3d = transformND(
    input.position,
    input.extraDims0_3,
    input.extraDims4_6,
    polytope.rotationMatrix4D,
    polytope.dimension,
    polytope.uniformScale,
    polytope.projectionDistance,
    polytope.depthNormFactor,
    extraRotCols,
    depthRowSums
  );

  // World position
  output.worldPosition = pos3d;

  // Clip position
  output.clipPosition = camera.viewProjectionMatrix * vec4f(pos3d, 1.0);

  // View direction (normals computed in fragment shader using screen-space derivatives)
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
        generateObjectBindGroup(3, 'PolytopeUniforms', 'polytope'),
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
  @location(1) viewDir: vec3f,
}
`,
    },
    {
      name: 'Main',
      content: /* wgsl */ `
@fragment
fn fragmentMain(input: FragmentInput) -> @location(0) vec4f {
  // Compute screen-space normal using derivatives (matches WebGL dFdx/dFdy approach)
  let dPdx = dpdx(input.worldPosition);
  let dPdy = dpdy(input.worldPosition);
  let N = normalize(cross(dPdx, dPdy));

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
// Port of WebGL ND_TRANSFORM_GLSL

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

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(3) @binding(0) var<uniform> polytope: PolytopeUniforms;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) extraDims0_3: vec4f,
  @location(2) extraDims4_6: vec3f,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) worldPosition: vec3f,
}

${transformNDBlock}

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Build extra rotation columns array from uniforms
  var extraRotCols: array<vec4f, 7>;
  extraRotCols[0] = polytope.extraRotCol0;
  extraRotCols[1] = polytope.extraRotCol1;
  extraRotCols[2] = polytope.extraRotCol2;
  extraRotCols[3] = polytope.extraRotCol3;
  extraRotCols[4] = polytope.extraRotCol4;
  extraRotCols[5] = polytope.extraRotCol5;
  extraRotCols[6] = polytope.extraRotCol6;

  // Build depth row sums array from uniforms
  var depthRowSums: array<f32, 11>;
  depthRowSums[0] = polytope.depthRowSums0_3.x;
  depthRowSums[1] = polytope.depthRowSums0_3.y;
  depthRowSums[2] = polytope.depthRowSums0_3.z;
  depthRowSums[3] = polytope.depthRowSums0_3.w;
  depthRowSums[4] = polytope.depthRowSums4_7.x;
  depthRowSums[5] = polytope.depthRowSums4_7.y;
  depthRowSums[6] = polytope.depthRowSums4_7.z;
  depthRowSums[7] = polytope.depthRowSums4_7.w;
  depthRowSums[8] = polytope.depthRowSums8_10.x;
  depthRowSums[9] = polytope.depthRowSums8_10.y;
  depthRowSums[10] = polytope.depthRowSums8_10.z;

  // Transform from N-D to 3D using rotation + perspective projection
  let pos3d = transformND(
    input.position,
    input.extraDims0_3,
    input.extraDims4_6,
    polytope.rotationMatrix4D,
    polytope.dimension,
    polytope.uniformScale,
    polytope.projectionDistance,
    polytope.depthNormFactor,
    extraRotCols,
    depthRowSums
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

${polytopeUniformsBlock}

@group(3) @binding(0) var<uniform> polytope: PolytopeUniforms;

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
