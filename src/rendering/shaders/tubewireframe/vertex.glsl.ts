// ============================================
// TubeWireframe Vertex Shader
// N-dimensional tube rendering with instanced cylinders
//
// IMPORTANT: Scale is applied AFTER projection to 3D (like camera zoom).
// This preserves N-D geometry and prevents extreme values during rotation.
// ============================================

export const vertexBlock = `
precision highp float;

// Instance attributes for tube endpoints
in vec3 instanceStart;
in vec3 instanceEnd;
// Packed extra dimensions: ExtraA = (W, Extra0, Extra1, Extra2)
// ExtraB = (Extra3, Extra4, Extra5, Extra6)
in vec4 instanceStartExtraA;
in vec4 instanceStartExtraB;
in vec4 instanceEndExtraA;
in vec4 instanceEndExtraB;

// N-D Transformation uniforms
uniform mat4 uRotationMatrix4D;
uniform int uDimension;
uniform float uUniformScale;  // Applied AFTER projection (like camera zoom)
#define MAX_EXTRA_DIMS 7
uniform float uProjectionDistance;
uniform float uExtraRotationCols[28]; // MAX_EXTRA_DIMS * 4
uniform float uDepthRowSums[11];

// Tube rendering uniform
uniform float uRadius;

// Outputs to fragment shader
out vec3 vNormal;
out vec3 vWorldPosition;
out vec3 vViewDirection;

// Transform an N-dimensional point through rotation and projection
// IMPORTANT: Scale is applied AFTER projection, not before rotation.
vec3 transformNDPoint(vec3 pos, vec4 extraA, vec4 extraB) {
  // Build input array from raw (unscaled) coordinates
  float inputs[11];
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
  vec4 pos4 = vec4(inputs[0], inputs[1], inputs[2], inputs[3]);
  vec4 rotated = uRotationMatrix4D * pos4;

  // Add contribution from extra dimensions (5D+)
  for (int i = 0; i < MAX_EXTRA_DIMS; i++) {
    if (i + 5 <= uDimension) {
      float extraDimValue = inputs[i + 4];
      rotated.x += uExtraRotationCols[i * 4 + 0] * extraDimValue;
      rotated.y += uExtraRotationCols[i * 4 + 1] * extraDimValue;
      rotated.z += uExtraRotationCols[i * 4 + 2] * extraDimValue;
      rotated.w += uExtraRotationCols[i * 4 + 3] * extraDimValue;
    }
  }

  // Perspective projection: compute effective depth from higher dimensions
  float effectiveDepth = rotated.w;
  for (int j = 0; j < 11; j++) {
    if (j < uDimension) {
      effectiveDepth += uDepthRowSums[j] * inputs[j];
    }
  }
  // Normalize depth by sqrt(dimension - 3) for consistent visual scale across dimensions.
  // Uses max(1.0, ...) to safely handle edge cases.
  // See src/rendering/shaders/transforms/ndTransform.ts for mathematical justification.
  float normFactor = uDimension > 4 ? sqrt(max(1.0, float(uDimension - 3))) : 1.0;
  effectiveDepth /= normFactor;

  // Guard against division by zero
  float denominator = uProjectionDistance - effectiveDepth;
  float factor = 1.0 / max(denominator, 0.0001);

  // Project to 3D, then apply uniform scale (like camera zoom)
  vec3 projected = rotated.xyz * factor * uUniformScale;

  return projected;
}

void main() {
  // Transform tube endpoints through N-D pipeline
  vec3 startPos = transformNDPoint(instanceStart, instanceStartExtraA, instanceStartExtraB);
  vec3 endPos = transformNDPoint(instanceEnd, instanceEndExtraA, instanceEndExtraB);

  // Calculate tube direction and length
  vec3 tubeDir = endPos - startPos;
  float tubeLength = length(tubeDir);

  // Handle degenerate tubes (zero length)
  if (tubeLength < 0.0001) {
    tubeDir = vec3(0.0, 1.0, 0.0);
    tubeLength = 0.0001;
  } else {
    tubeDir = tubeDir / tubeLength;
  }

  // Build orthonormal basis for tube orientation
  // Find a vector not parallel to tubeDir using robust selection
  // Check if tubeDir is nearly parallel to the default up vector (0,1,0)
  // If so, use (1,0,0) instead to ensure a valid cross product
  vec3 up = abs(tubeDir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = cross(up, tubeDir);
  // Guard against degenerate cross product (can happen if tubeDir is very close to up)
  float tangentLen = length(tangent);
  if (tangentLen < 0.0001) {
    // Fallback: use a different up vector
    up = vec3(0.0, 0.0, 1.0);
    tangent = cross(up, tubeDir);
    tangentLen = length(tangent);
  }
  tangent = tangent / max(tangentLen, 0.0001);
  vec3 bitangent = cross(tubeDir, tangent);

  // CylinderGeometry has Y as the axis, centered at origin, height 1
  // position.xz is the cross-section, position.y is along the length (-0.5 to 0.5)
  vec3 localPos = position;

  // Transform cylinder vertex to tube space
  // Scale the cross-section by radius, the length by tubeLength
  vec3 worldPos = startPos
    + tangent * localPos.x * uRadius
    + bitangent * localPos.z * uRadius
    + tubeDir * (localPos.y + 0.5) * tubeLength;

  // Transform normal from cylinder space to world space
  // Cylinder normals are in the XZ plane (perpendicular to Y axis)
  vec3 localNormal = normalize(normal);
  vNormal = normalize(tangent * localNormal.x + bitangent * localNormal.z + tubeDir * localNormal.y);

  // Pass world position to fragment shader
  vWorldPosition = (modelMatrix * vec4(worldPos, 1.0)).xyz;

  // Calculate view direction
  vViewDirection = normalize(cameraPosition - vWorldPosition);

  // Final position
  gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
}
`
