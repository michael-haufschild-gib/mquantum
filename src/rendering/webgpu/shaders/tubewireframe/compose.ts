/**
 * WGSL Tube Wireframe Shader Composer
 *
 * Assembles complete tube wireframe vertex and fragment shaders.
 * Port of GLSL tubewireframe/compose.ts to WGSL.
 *
 * @module rendering/webgpu/shaders/tubewireframe/compose
 */

import { tubeWireframeUniformsBlock } from './uniforms.wgsl'
import { tubeVertexBlock } from './vertex.wgsl'
import { tubeMainBlock } from './main.wgsl'
import { constantsBlock } from '../shared/core/constants.wgsl'
import { uniformsBlock } from '../shared/core/uniforms.wgsl'
import { ggxBlock } from '../shared/lighting/ggx.wgsl'
import { multiLightBlock } from '../shared/lighting/multi-light.wgsl'

/**
 * Configuration for tube wireframe shader compilation.
 */
export interface TubeWireframeWGSLShaderConfig {
  /** Enable shadows */
  shadows?: boolean
  /** Enable PBR lighting */
  pbr?: boolean
}

/**
 * Compose tube wireframe vertex shader.
 */
export function composeTubeWireframeVertexShader(_config?: TubeWireframeWGSLShaderConfig): string {
  return /* wgsl */ `
// Tube Wireframe Vertex Shader

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

${tubeWireframeUniformsBlock}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(4) @binding(0) var<uniform> tube: TubeWireframeUniforms;

// Cylinder geometry input (instanced)
struct VertexInput {
  @location(0) position: vec3f,      // Cylinder local position
  @location(1) normal: vec3f,        // Cylinder local normal
  // Instance attributes for tube endpoints
  @location(2) instanceStart: vec3f,
  @location(3) instanceEnd: vec3f,
  @location(4) instanceStartExtraA: vec4f,  // W, Extra0-2
  @location(5) instanceStartExtraB: vec4f,  // Extra3-6
  @location(6) instanceEndExtraA: vec4f,
  @location(7) instanceEndExtraB: vec4f,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) normal: vec3f,
  @location(2) viewDir: vec3f,
}

${tubeVertexBlock}

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Pack extra rotation columns into array
  var extraRotCols: array<vec4f, 7>;
  extraRotCols[0] = tube.extraRotCol0;
  extraRotCols[1] = tube.extraRotCol1;
  extraRotCols[2] = tube.extraRotCol2;
  extraRotCols[3] = tube.extraRotCol3;
  extraRotCols[4] = tube.extraRotCol4;
  extraRotCols[5] = tube.extraRotCol5;
  extraRotCols[6] = tube.extraRotCol6;

  // Pack depth row sums into array
  var depthRowSums: array<f32, 11>;
  depthRowSums[0] = tube.depthRowSums0_3.x;
  depthRowSums[1] = tube.depthRowSums0_3.y;
  depthRowSums[2] = tube.depthRowSums0_3.z;
  depthRowSums[3] = tube.depthRowSums0_3.w;
  depthRowSums[4] = tube.depthRowSums4_7.x;
  depthRowSums[5] = tube.depthRowSums4_7.y;
  depthRowSums[6] = tube.depthRowSums4_7.z;
  depthRowSums[7] = tube.depthRowSums4_7.w;
  depthRowSums[8] = tube.depthRowSums8_10.x;
  depthRowSums[9] = tube.depthRowSums8_10.y;
  depthRowSums[10] = tube.depthRowSums8_10.z;

  // Transform tube endpoints through N-D pipeline
  let startPos = transformNDPoint(
    input.instanceStart,
    input.instanceStartExtraA,
    input.instanceStartExtraB,
    tube.rotationMatrix4D,
    tube.dimension,
    tube.uniformScale,
    tube.projectionDistance,
    tube.depthNormFactor,
    extraRotCols,
    depthRowSums
  );

  let endPos = transformNDPoint(
    input.instanceEnd,
    input.instanceEndExtraA,
    input.instanceEndExtraB,
    tube.rotationMatrix4D,
    tube.dimension,
    tube.uniformScale,
    tube.projectionDistance,
    tube.depthNormFactor,
    extraRotCols,
    depthRowSums
  );

  // Build tube geometry
  let tubeResult = buildTubeVertex(
    input.position,
    input.normal,
    startPos,
    endPos,
    tube.radius
  );

  // Output
  output.worldPosition = tubeResult.worldPos;
  output.normal = tubeResult.normal;
  output.viewDir = normalize(camera.cameraPosition - tubeResult.worldPos);
  output.clipPosition = camera.viewProjectionMatrix * vec4f(tubeResult.worldPos, 1.0);

  return output;
}
`
}

/**
 * Compose tube wireframe fragment shader.
 */
export function composeTubeWireframeFragmentShader(_config?: TubeWireframeWGSLShaderConfig): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const wgsl = /* wgsl */ `
// Tube Wireframe Fragment Shader - Full PBR

// Shared constants
${constantsBlock}

// Shared uniform structures
${uniformsBlock}

// Tube wireframe uniforms
${tubeWireframeUniformsBlock}

// PBR BRDF functions
${ggxBlock}

// Multi-light system
${multiLightBlock}

// Main shader logic
${tubeMainBlock}

// Bind group declarations
@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<uniform> lighting: LightingUniforms;
@group(4) @binding(0) var<uniform> tube: TubeWireframeUniforms;

struct FragmentInput {
  @location(0) worldPosition: vec3f,
  @location(1) normal: vec3f,
  @location(2) viewDir: vec3f,
}

struct FragmentOutput {
  @location(0) color: vec4f,
  @location(1) normal: vec4f,
  @location(2) position: vec4f,
}

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
  let N = normalize(input.normal);
  let V = normalize(input.viewDir);

  // Compute full PBR lighting
  let color = computeTubeLighting(N, V, input.worldPosition, tube, lighting);

  var output: FragmentOutput;

  // Output to MRT (Multiple Render Targets)
  // color: Color buffer (RGBA)
  // normal: Normal buffer (RGB = normal * 0.5 + 0.5, A = reflectivity/metallic)
  // position: World position for temporal reprojection
  output.color = vec4f(color, tube.opacity);
  output.normal = vec4f(N * 0.5 + 0.5, tube.metalness);
  output.position = vec4f(input.worldPosition, 1.0);

  return output;
}
`

  return {
    wgsl,
    modules: [
      'Constants',
      'Shared Uniforms',
      'Tube Wireframe Uniforms',
      'GGX PBR',
      'Multi-Light System',
      'Tube Main',
    ],
    features: ['Tube Wireframe', 'Full PBR Lighting', 'MRT Output'],
  }
}
