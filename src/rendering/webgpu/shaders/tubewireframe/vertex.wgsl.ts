/**
 * WGSL Tube Wireframe Vertex Shader Block
 *
 * Port of GLSL tubewireframe/vertex.glsl to WGSL.
 * Handles N-dimensional tube rendering with instanced cylinders.
 *
 * @module rendering/webgpu/shaders/tubewireframe/vertex.wgsl
 */

export const tubeVertexBlock = /* wgsl */ `
// ============================================
// Tube Wireframe Vertex Shader
// N-dimensional tube rendering with instanced cylinders
// ============================================

const MAX_EXTRA_DIMS: i32 = 7;

// Transform an N-dimensional point through rotation and projection
fn transformNDPoint(
  pos: vec3f,
  extraA: vec4f,
  extraB: vec4f,
  rotationMatrix4D: mat4x4f,
  dimension: i32,
  uniformScale: f32,
  projectionDistance: f32,
  depthNormFactor: f32,
  extraRotCols: array<vec4f, 7>,
  depthRowSums: array<f32, 11>
) -> vec3f {
  // Build input array from raw (unscaled) coordinates
  var inputs: array<f32, 11>;
  inputs[0] = pos.x;
  inputs[1] = pos.y;
  inputs[2] = pos.z;
  inputs[3] = extraA.x; // W
  inputs[4] = extraA.y; // Extra0
  inputs[5] = extraA.z; // Extra1
  inputs[6] = extraA.w; // Extra2
  inputs[7] = extraB.x; // Extra3
  inputs[8] = extraB.y; // Extra4
  inputs[9] = extraB.z; // Extra5
  inputs[10] = extraB.w; // Extra6

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
  effectiveDepth /= depthNormFactor;

  // Guard against division by zero
  let denominator = projectionDistance - effectiveDepth;
  let factor = 1.0 / max(denominator, 0.0001);

  // Project to 3D, then apply uniform scale (like camera zoom)
  return rotated.xyz * factor * uniformScale;
}

// Build tube geometry from transformed endpoints
fn buildTubeVertex(
  localPos: vec3f,
  localNormal: vec3f,
  startPos: vec3f,
  endPos: vec3f,
  radius: f32
) -> TubeVertexResult {
  var result: TubeVertexResult;

  // Calculate tube direction and length
  var tubeDir = endPos - startPos;
  var tubeLength = length(tubeDir);

  // Handle degenerate tubes (zero length)
  if (tubeLength < 0.0001) {
    tubeDir = vec3f(0.0, 1.0, 0.0);
    tubeLength = 0.0001;
  } else {
    tubeDir = tubeDir / tubeLength;
  }

  // Build orthonormal basis for tube orientation
  var up = vec3f(0.0, 1.0, 0.0);
  if (abs(tubeDir.y) > 0.99) {
    up = vec3f(1.0, 0.0, 0.0);
  }
  var tangent = cross(up, tubeDir);
  var tangentLen = length(tangent);
  if (tangentLen < 0.0001) {
    up = vec3f(0.0, 0.0, 1.0);
    tangent = cross(up, tubeDir);
    tangentLen = length(tangent);
  }
  tangent = tangent / max(tangentLen, 0.0001);
  let bitangent = cross(tubeDir, tangent);

  // Transform cylinder vertex to tube space
  // CylinderGeometry has Y as the axis, centered at origin, height 1
  // position.xz is the cross-section, position.y is along the length (-0.5 to 0.5)
  result.worldPos = startPos
    + tangent * localPos.x * radius
    + bitangent * localPos.z * radius
    + tubeDir * (localPos.y + 0.5) * tubeLength;

  // Transform normal from cylinder space to world space
  let normLocal = normalize(localNormal);
  result.normal = normalize(tangent * normLocal.x + bitangent * normLocal.z + tubeDir * normLocal.y);

  return result;
}

struct TubeVertexResult {
  worldPos: vec3f,
  normal: vec3f,
}
`
