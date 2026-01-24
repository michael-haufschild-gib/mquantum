/**
 * Skybox rotation utilities for WGSL
 * Port of: src/rendering/shaders/skybox/utils/rotation.glsl.ts
 */
export const rotationBlock = `
// --- Rotation Utilities ---

// 3D Rotation Matrix around Y axis
fn rotateY(theta: f32) -> mat3x3<f32> {
  let c = cos(theta);
  let s = sin(theta);
  return mat3x3<f32>(
    vec3<f32>(c, 0.0, s),
    vec3<f32>(0.0, 1.0, 0.0),
    vec3<f32>(-s, 0.0, c)
  );
}

// 3D Rotation Matrix around X axis
fn rotateX(theta: f32) -> mat3x3<f32> {
  let c = cos(theta);
  let s = sin(theta);
  return mat3x3<f32>(
    vec3<f32>(1.0, 0.0, 0.0),
    vec3<f32>(0.0, c, -s),
    vec3<f32>(0.0, s, c)
  );
}

// 3D Rotation Matrix around Z axis
fn rotateZ(theta: f32) -> mat3x3<f32> {
  let c = cos(theta);
  let s = sin(theta);
  return mat3x3<f32>(
    vec3<f32>(c, -s, 0.0),
    vec3<f32>(s, c, 0.0),
    vec3<f32>(0.0, 0.0, 1.0)
  );
}
`
