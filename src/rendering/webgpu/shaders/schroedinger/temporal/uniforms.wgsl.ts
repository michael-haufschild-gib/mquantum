/**
 * WGSL Uniform declarations for temporal cloud accumulation
 *
 * Defines the uniform structure used across the temporal accumulation system.
 *
 * Port of GLSL schroedinger/temporal/uniforms.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/temporal/uniforms.wgsl
 */

export const temporalCloudUniformsBlock = /* wgsl */ `
// ============================================
// Temporal Cloud Accumulation Uniforms
// ============================================

struct TemporalCloudUniforms {
  // Previous frame's view-projection matrix
  prevViewProjectionMatrix: mat4x4f,

  // Current view-projection matrix
  viewProjectionMatrix: mat4x4f,

  // Camera position
  cameraPosition: vec3f,
  _pad0: f32,

  // Current Bayer offset for this frame (0,0), (1,1), (1,0), or (0,1)
  bayerOffset: vec2f,

  // Current frame index (0-3)
  frameIndex: i32,

  // Whether temporal cloud accumulation is enabled
  temporalCloudEnabled: u32,

  // Resolution of the quarter-res cloud render target
  cloudResolution: vec2f,

  // Resolution of the full accumulation buffer
  accumulationResolution: vec2f,

  // History blend weight (0.0 = all new, 1.0 = all history)
  historyWeight: f32,

  // Disocclusion threshold for depth-based rejection
  disocclusionThreshold: f32,
}

@group(0) @binding(0) var<uniform> temporalUniforms: TemporalCloudUniforms;

// Textures - bindings depend on specific pass
// @group(0) @binding(1) var prevAccumulation: texture_2d<f32>;
// @group(0) @binding(2) var prevPositionBuffer: texture_2d<f32>;
// @group(0) @binding(3) var cloudRender: texture_2d<f32>;
// @group(0) @binding(4) var sceneDepth: texture_depth_2d;
// @group(0) @binding(5) var linearSampler: sampler;
`
