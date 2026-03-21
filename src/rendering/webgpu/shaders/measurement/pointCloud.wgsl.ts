/**
 * Measurement Point Cloud Shaders
 *
 * Renders accumulated measurement positions as glowing billboard quads.
 * Each measurement position is expanded to a screen-aligned quad in the
 * vertex shader, with a radial glow falloff in the fragment shader.
 *
 * @module rendering/webgpu/shaders/measurement/pointCloud
 */

export const measurementPointCloudVertex = /* wgsl */ `
struct Uniforms {
  viewProjection: mat4x4f,
  pointSize: f32,
  opacity: f32,
  pointCount: u32,
  _pad: u32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) age: f32,
}

@group(0) @binding(0) var<uniform> uni: Uniforms;
@group(0) @binding(1) var<storage, read> positions: array<vec4f>;

// 6 vertices per quad (2 triangles), indexed by vertex_index % 6
const QUAD_UVS = array<vec2f, 6>(
  vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1),
  vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1),
);

@vertex
fn main(@builtin(vertex_index) vid: u32) -> VertexOutput {
  let quadIdx = vid / 6u;
  let vertIdx = vid % 6u;

  var out: VertexOutput;
  if (quadIdx >= uni.pointCount) {
    out.position = vec4f(0, 0, -2, 1); // behind camera
    out.uv = vec2f(0);
    out.age = 0;
    return out;
  }

  let posData = positions[quadIdx];
  let worldPos = vec3f(posData.x, posData.y, posData.z);
  let age = posData.w; // 0=newest, 1=oldest

  // Project world position
  let clipPos = uni.viewProjection * vec4f(worldPos, 1.0);

  // Billboard offset in clip space
  let offset = QUAD_UVS[vertIdx] * uni.pointSize;
  out.position = vec4f(clipPos.xy + offset * clipPos.w * 0.01, clipPos.z, clipPos.w);
  out.uv = QUAD_UVS[vertIdx];
  out.age = age;
  return out;
}
`

export const measurementPointCloudFragment = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) age: f32,
}

struct Uniforms {
  viewProjection: mat4x4f,
  pointSize: f32,
  opacity: f32,
  pointCount: u32,
  _pad: u32,
}

@group(0) @binding(0) var<uniform> uni: Uniforms;

@fragment
fn main(in: VertexOutput) -> @location(0) vec4f {
  let dist = length(in.uv);
  if (dist > 1.0) { discard; }

  // Radial glow falloff
  let glow = exp(-dist * dist * 3.0);
  let fade = 1.0 - in.age * 0.7; // older measurements are dimmer

  let color = vec3f(0.4, 0.8, 1.0) * glow * fade;
  let alpha = glow * fade * uni.opacity;

  return vec4f(color * alpha, alpha);
}
`
