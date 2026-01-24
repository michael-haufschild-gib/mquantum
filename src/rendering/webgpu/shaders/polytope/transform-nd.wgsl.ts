/**
 * WGSL N-Dimensional Transform Block
 *
 * Port of GLSL polytope/transform-nd.glsl to WGSL.
 * Handles N-dimensional vertex transformations.
 *
 * Uses packed vec4f arrays for uniform buffer alignment (16-byte alignment required).
 *
 * @module rendering/webgpu/shaders/polytope/transform-nd.wgsl
 */

export const transformNDBlock = /* wgsl */ `
// ============================================
// N-Dimensional Transform
// Port of WebGL ndTransformVertex to WGSL
// ============================================

const MAX_EXTRA_DIMS: i32 = 7;

// Transform an N-dimensional point through rotation and projection
// Matches WebGL ND_TRANSFORM_GLSL exactly
fn transformND(
  pos: vec3f,
  extraDims0_3: vec4f,
  extraDims4_6: vec3f,
  rotationMatrix4D: mat4x4f,
  dimension: i32,
  uniformScale: f32,
  projectionDistance: f32,
  depthNormFactor: f32,
  extraRotCols: array<vec4f, 7>,
  depthRowSums: array<f32, 11>
) -> vec3f {
  // Build input array from raw (unscaled) coordinates
  // Matches WebGL: inputs[0-2] = pos, inputs[3-6] = extraDims0_3, inputs[7-9] = extraDims4_6
  var inputs: array<f32, 11>;
  inputs[0] = pos.x;
  inputs[1] = pos.y;
  inputs[2] = pos.z;
  inputs[3] = extraDims0_3.x;
  inputs[4] = extraDims0_3.y;
  inputs[5] = extraDims0_3.z;
  inputs[6] = extraDims0_3.w;
  inputs[7] = extraDims4_6.x;
  inputs[8] = extraDims4_6.y;
  inputs[9] = extraDims4_6.z;
  inputs[10] = 0.0;

  // Apply rotation to first 4 dimensions (unscaled)
  let pos4 = vec4f(inputs[0], inputs[1], inputs[2], inputs[3]);
  var rotated = rotationMatrix4D * pos4;

  // Add contribution from extra dimensions (5D+)
  for (var i = 0; i < MAX_EXTRA_DIMS; i++) {
    if (i + 5 <= dimension) {
      let extraDimValue = inputs[i + 4];
      rotated.x += extraRotCols[i].x * extraDimValue;
      rotated.y += extraRotCols[i].y * extraDimValue;
      rotated.z += extraRotCols[i].z * extraDimValue;
      rotated.w += extraRotCols[i].w * extraDimValue;
    }
  }

  // Perspective projection: compute effective depth from higher dimensions
  var effectiveDepth = rotated.w;
  for (var j = 0; j < 11; j++) {
    if (j < dimension) {
      effectiveDepth += depthRowSums[j] * inputs[j];
    }
  }
  // Normalize depth for consistent visual scale across dimensions.
  // depthNormFactor is precomputed on CPU: dimension > 4 ? sqrt(dimension - 3) : 1.0
  effectiveDepth /= depthNormFactor;

  // Guard against division by zero
  var denom = projectionDistance - effectiveDepth;
  if (abs(denom) < 0.0001) {
    denom = select(-0.0001, 0.0001, denom >= 0.0);
  }
  let factor = 1.0 / denom;

  // Project to 3D, then apply uniform scale (like camera zoom)
  return rotated.xyz * factor * uniformScale;
}

// Compute face normal from 3 transformed vertices
fn computeFaceNormal(v0: vec3f, v1: vec3f, v2: vec3f) -> vec3f {
  let edge1 = v1 - v0;
  let edge2 = v2 - v0;
  return normalize(cross(edge1, edge2));
}
`
