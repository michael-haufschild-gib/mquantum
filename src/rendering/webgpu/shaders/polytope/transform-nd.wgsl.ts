/**
 * WGSL N-Dimensional Transform Block
 *
 * Port of GLSL polytope/transform-nd.glsl to WGSL.
 * Handles N-dimensional vertex transformations.
 *
 * @module rendering/webgpu/shaders/polytope/transform-nd.wgsl
 */

export const transformNDBlock = /* wgsl */ `
// ============================================
// N-Dimensional Transform
// ============================================

// Maximum extra dimensions supported (4-11)
const MAX_EXTRA_DIMS: i32 = 8;

// Transform a vertex from N-D space to 3D
fn transformND(
  pos3d: vec3f,
  extraDims: array<f32, 8>,
  basisX: array<f32, 11>,
  basisY: array<f32, 11>,
  basisZ: array<f32, 11>,
  origin: array<f32, 11>,
  dimension: i32
) -> vec3f {
  // Start with the 3D coordinates
  var result = pos3d;

  // Project higher dimensions down to 3D using basis vectors
  if (dimension > 3) {
    for (var i = 0; i < dimension - 3; i++) {
      let extraCoord = extraDims[i];

      // Add contribution from this extra dimension to each 3D axis
      result.x += extraCoord * basisX[i + 3];
      result.y += extraCoord * basisY[i + 3];
      result.z += extraCoord * basisZ[i + 3];
    }
  }

  return result;
}

// Compute face normal from 3 transformed vertices
fn computeFaceNormal(v0: vec3f, v1: vec3f, v2: vec3f) -> vec3f {
  let edge1 = v1 - v0;
  let edge2 = v2 - v0;
  return normalize(cross(edge1, edge2));
}
`
