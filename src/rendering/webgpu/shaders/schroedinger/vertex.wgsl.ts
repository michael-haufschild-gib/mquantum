/**
 * Schrödinger Vertex Shaders
 *
 * WGSL vertex shaders for 3D volume raymarching and 2D fullscreen rendering.
 *
 * @module rendering/webgpu/shaders/schroedinger/vertex.wgsl
 */

/**
 * Create vertex shader for 3D Schrödinger rendering.
 *
 * Transforms box vertices to world space for volume raymarching.
 * The fragment shader then uses the world-space position as the ray origin
 * for sphere/box intersection tests.
 *
 * @returns WGSL vertex shader source
 */
export function composeSchroedingerVertexShader(): string {
  return /* wgsl */ `
// Schrödinger Vertex Shader
// Transforms vertices for volume raymarching

struct CameraUniforms {
  viewMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  viewProjectionMatrix: mat4x4f,
  inverseViewMatrix: mat4x4f,
  inverseProjectionMatrix: mat4x4f,
  modelMatrix: mat4x4f,          // LOCAL → WORLD transform
  inverseModelMatrix: mat4x4f,   // WORLD → LOCAL transform
  cameraPosition: vec3f,
  cameraNear: f32,
  cameraFar: f32,
  fov: f32,
  resolution: vec2f,
  aspectRatio: f32,
  time: f32,
  deltaTime: f32,
  frameNumber: u32,
  bayerOffset: vec2f,            // Temporal accumulation Bayer pattern offset
  _padding: vec2f,
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

  // Transform local vertex position to WORLD space using modelMatrix
  // This matches WebGL: worldPosition = modelMatrix * vec4(position, 1.0)
  let worldPos = (camera.modelMatrix * vec4f(input.position, 1.0)).xyz;
  output.vPosition = worldPos;

  // Clip position
  output.clipPosition = camera.viewProjectionMatrix * vec4f(worldPos, 1.0);

  return output;
}
`
}

/**
 * Create 2D vertex shader for Schrödinger rendering.
 *
 * Fullscreen triangle using vertex_index — no vertex buffer needed.
 * Three vertices are generated procedurally to cover the entire viewport.
 *
 * @returns WGSL vertex shader code for 2D fullscreen triangle
 */
export function composeSchroedingerVertexShader2D(): string {
  return /* wgsl */ `
// Schrödinger 2D Vertex Shader
// Fullscreen triangle — no vertex buffer input

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
  bayerOffset: vec2f,
  _padding: vec2f,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var output: VertexOutput;

  // Fullscreen triangle: 3 vertices covering clip space [-1,1]
  // Vertex 0: (-1, -1) → uv (0, 1)
  // Vertex 1: ( 3, -1) → uv (2, 1)
  // Vertex 2: (-1,  3) → uv (0, -1)
  // The triangle extends beyond clip space; hardware clips to viewport.
  let x = f32(i32(vertexIndex & 1u)) * 4.0 - 1.0;
  let y = f32(i32(vertexIndex >> 1u)) * 4.0 - 1.0;

  output.clipPosition = vec4f(x, y, 0.0, 1.0);
  // UV: map clip [-1,1] to [0,1], Y-flipped for screen-space top-down
  output.uv = vec2f(x * 0.5 + 0.5, 1.0 - (y * 0.5 + 0.5));

  return output;
}
`
}
