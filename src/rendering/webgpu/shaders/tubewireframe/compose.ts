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
// Tube Wireframe Fragment Shader

${tubeWireframeUniformsBlock}

@group(4) @binding(0) var<uniform> tube: TubeWireframeUniforms;

struct FragmentInput {
  @location(0) worldPosition: vec3f,
  @location(1) normal: vec3f,
  @location(2) viewDir: vec3f,
}

@fragment
fn fragmentMain(input: FragmentInput) -> @location(0) vec4f {
  let N = normalize(input.normal);
  let V = normalize(input.viewDir);

  // Simple lighting
  let lightDir = normalize(vec3f(1.0, 1.0, 1.0));
  let NdotL = max(dot(N, lightDir), 0.0);

  // Base color from uniforms
  let baseColor = tube.baseColor;

  // Diffuse
  let diffuse = baseColor * NdotL;

  // Ambient
  let ambient = baseColor * tube.ambientIntensity;

  // Specular (simplified PBR)
  let H = normalize(lightDir + V);
  let NdotH = max(dot(N, H), 0.0);
  let specular = pow(NdotH, (1.0 - tube.roughness) * 64.0) * 0.5;

  let finalColor = ambient + diffuse + vec3f(specular);

  return vec4f(finalColor, tube.opacity);
}
`

  return {
    wgsl,
    modules: ['Tube Wireframe Fragment'],
    features: ['Tube Wireframe', 'PBR Lighting'],
  }
}
