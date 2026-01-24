/**
 * Ground Plane Vertex Shader (WGSL)
 * Port of: src/rendering/shaders/groundplane/vertex.glsl.ts
 *
 * Standard mesh vertex shader for ground plane surfaces.
 * Outputs world position, normal, and view direction for PBR lighting.
 */

export const vertexInputStruct = `
// --- Vertex Input ---
struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
}
`

export const vertexOutputStruct = `
// --- Vertex Output / Fragment Input ---
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) localPosition: vec3<f32>,  // Local position before transformation (for grid)
  @location(2) normal: vec3<f32>,
  @location(3) viewDirection: vec3<f32>,
}
`

export const vertexUniformsBlock = `
// --- Vertex Uniforms ---
struct VertexUniforms {
  modelMatrix: mat4x4<f32>,
  viewMatrix: mat4x4<f32>,
  projectionMatrix: mat4x4<f32>,
  normalMatrix: mat3x3<f32>,
  cameraPosition: vec3<f32>,
  _pad: f32,
}

@group(0) @binding(0) var<uniform> vertexUniforms: VertexUniforms;
`

export const vertexMainBlock = `
// --- Vertex Main ---
@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Store local position before transformation (for grid calculation)
  // PlaneGeometry is always created in XY plane, so we use XY for grid
  output.localPosition = input.position;

  // Transform to world space
  let worldPos = vertexUniforms.modelMatrix * vec4<f32>(input.position, 1.0);
  output.worldPosition = worldPos.xyz;

  // Transform normal to world space
  output.normal = normalize(vertexUniforms.normalMatrix * input.normal);

  // View direction (from fragment to camera)
  output.viewDirection = normalize(vertexUniforms.cameraPosition - worldPos.xyz);

  // Final clip space position
  output.position = vertexUniforms.projectionMatrix * vertexUniforms.viewMatrix * worldPos;

  return output;
}
`

export const vertexBlock = `
${vertexInputStruct}
${vertexOutputStruct}
${vertexUniformsBlock}
${vertexMainBlock}
`
