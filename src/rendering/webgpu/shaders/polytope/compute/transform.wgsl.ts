/**
 * Polytope Transform Compute Shader
 *
 * Pre-computes N-dimensional vertex transformations on GPU.
 * This replaces per-vertex transforms in the vertex shader with
 * a compute pass that runs once per transform change.
 *
 * Architecture:
 * - Input: Storage buffer with raw N-D vertex positions
 * - Uniforms: Transform parameters (rotation matrix, extra cols, projection, etc.)
 * - Output: Storage buffer with transformed 3D positions and depth values
 *
 * Dispatch: 1D with workgroup size 256
 * Each thread processes one vertex.
 *
 * @module rendering/webgpu/shaders/polytope/compute/transform.wgsl
 */

/**
 * Compute parameters uniform struct
 */
export const computeParamsBlock = /* wgsl */ `
// ============================================
// Polytope Transform Compute Parameters
// ============================================

struct ComputeParams {
  vertexCount: u32,        // Number of vertices to process
  dimension: i32,          // N-D dimension (3-11)
  uniformScale: f32,       // Scale applied after projection
  projectionDistance: f32, // Perspective projection distance
  depthNormFactor: f32,    // Precomputed: dimension > 4 ? sqrt(dimension - 3) : 1.0
  _pad0: f32,              // Padding for 16-byte alignment
  _pad1: f32,
  _pad2: f32,
}
`

/**
 * Transform uniforms struct - matches PolytopeUniforms layout
 * but only includes the transform-related fields
 */
export const transformUniformsBlock = /* wgsl */ `
// ============================================
// Polytope Transform Uniforms
// ============================================

struct TransformUniforms {
  // N-D Rotation matrix (4x4 for first 4 dimensions)
  rotationMatrix4D: mat4x4f,

  // Extra rotation columns for dimensions 5-11 (7 * vec4f)
  extraRotCol0: vec4f,
  extraRotCol1: vec4f,
  extraRotCol2: vec4f,
  extraRotCol3: vec4f,
  extraRotCol4: vec4f,
  extraRotCol5: vec4f,
  extraRotCol6: vec4f,

  // Depth row sums for perspective projection
  depthRowSums0_3: vec4f,
  depthRowSums4_7: vec4f,
  depthRowSums8_10: vec3f,
  _padDepth: f32,
}
`

/**
 * Input vertex struct for raw N-D vertices
 * Matches the vertex buffer layout from buildNDGeometry
 */
export const ndVertexStructBlock = /* wgsl */ `
// ============================================
// Input/Output Vertex Structures
// ============================================

// Input: Raw N-dimensional vertex position
// Layout: position (3) + extraDims0_3 (4) + extraDims4_6 (3) = 10 floats
// Padded to 12 floats (48 bytes) for alignment
struct NDVertex {
  position: vec3f,
  _pad0: f32,
  extraDims0_3: vec4f,
  extraDims4_6: vec3f,
  _pad1: f32,
}

// Output: Transformed 3D position with depth for color algorithm
struct TransformedVertex {
  position: vec3f,
  depth: f32,  // Normalized depth value (0-1) for color algorithms
}
`

/**
 * Compute shader bind group layout block
 * Group 0:
 * - Binding 0: ComputeParams (uniform)
 * - Binding 1: TransformUniforms (uniform)
 * - Binding 2: Input vertices (storage, read-only)
 * - Binding 3: Output vertices (storage, read-write)
 */
export const transformBindingsBlock = /* wgsl */ `
// ============================================
// Compute Shader Bind Groups
// ============================================

// Uniform bindings (read-only)
@group(0) @binding(0) var<uniform> params: ComputeParams;
@group(0) @binding(1) var<uniform> transform: TransformUniforms;

// Storage bindings
@group(0) @binding(2) var<storage, read> inputVertices: array<NDVertex>;
@group(0) @binding(3) var<storage, read_write> outputVertices: array<TransformedVertex>;
`

/**
 * N-D transform function for compute shader
 * Adapted from transform-nd.wgsl.ts for storage buffer access
 */
export const transformNDComputeBlock = /* wgsl */ `
// ============================================
// N-Dimensional Transform (Compute Version)
// ============================================

const MAX_EXTRA_DIMS: i32 = 7;

// Transform an N-dimensional point through rotation and projection
// Returns vec4f(x, y, z, depth) where xyz is the projected 3D position
// and depth is the normalized depth value for color algorithms
fn transformNDCompute(
  vertex: NDVertex,
  rotationMatrix4D: mat4x4f,
  dimension: i32,
  uniformScale: f32,
  projectionDistance: f32,
  depthNormFactor: f32,
  extraRotCols: array<vec4f, 7>,
  depthRowSums: array<f32, 11>
) -> vec4f {
  // Build input array from raw coordinates
  var inputs: array<f32, 11>;
  inputs[0] = vertex.position.x;
  inputs[1] = vertex.position.y;
  inputs[2] = vertex.position.z;
  inputs[3] = vertex.extraDims0_3.x;
  inputs[4] = vertex.extraDims0_3.y;
  inputs[5] = vertex.extraDims0_3.z;
  inputs[6] = vertex.extraDims0_3.w;
  inputs[7] = vertex.extraDims4_6.x;
  inputs[8] = vertex.extraDims4_6.y;
  inputs[9] = vertex.extraDims4_6.z;
  inputs[10] = 0.0;

  // Apply rotation to first 4 dimensions
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
  // Normalize depth for consistent visual scale across dimensions
  effectiveDepth /= depthNormFactor;

  // Guard against division by zero
  var denom = projectionDistance - effectiveDepth;
  if (abs(denom) < 0.0001) {
    denom = select(-0.0001, 0.0001, denom >= 0.0);
  }
  let factor = 1.0 / denom;

  // Project to 3D, then apply uniform scale
  let projected = rotated.xyz * factor * uniformScale;

  // Compute normalized depth for color algorithms
  // Sum of extra dimensions mapped to 0-1 range (matches WebGL vFaceDepth)
  let extraSum = vertex.extraDims0_3.x + vertex.extraDims0_3.y +
                 vertex.extraDims0_3.z + vertex.extraDims0_3.w +
                 vertex.extraDims4_6.x + vertex.extraDims4_6.y +
                 vertex.extraDims4_6.z;
  let normalizedDepth = clamp(extraSum * 0.15 + 0.5, 0.0, 1.0);

  return vec4f(projected, normalizedDepth);
}
`

/**
 * Main compute shader entry point
 *
 * Each thread transforms one vertex from N-D to 3D.
 * Workgroup size 256 is efficient for vertex processing.
 */
export const transformComputeMainBlock = /* wgsl */ `
// ============================================
// Transform Compute Shader Entry Point
// ============================================

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  // Get vertex index
  let vertexIdx = gid.x;

  // Bounds check - skip threads beyond vertex count
  if (vertexIdx >= params.vertexCount) {
    return;
  }

  // Read input vertex
  let inputVertex = inputVertices[vertexIdx];

  // Build extra rotation columns array from uniforms
  var extraRotCols: array<vec4f, 7>;
  extraRotCols[0] = transform.extraRotCol0;
  extraRotCols[1] = transform.extraRotCol1;
  extraRotCols[2] = transform.extraRotCol2;
  extraRotCols[3] = transform.extraRotCol3;
  extraRotCols[4] = transform.extraRotCol4;
  extraRotCols[5] = transform.extraRotCol5;
  extraRotCols[6] = transform.extraRotCol6;

  // Build depth row sums array from uniforms
  var depthRowSums: array<f32, 11>;
  depthRowSums[0] = transform.depthRowSums0_3.x;
  depthRowSums[1] = transform.depthRowSums0_3.y;
  depthRowSums[2] = transform.depthRowSums0_3.z;
  depthRowSums[3] = transform.depthRowSums0_3.w;
  depthRowSums[4] = transform.depthRowSums4_7.x;
  depthRowSums[5] = transform.depthRowSums4_7.y;
  depthRowSums[6] = transform.depthRowSums4_7.z;
  depthRowSums[7] = transform.depthRowSums4_7.w;
  depthRowSums[8] = transform.depthRowSums8_10.x;
  depthRowSums[9] = transform.depthRowSums8_10.y;
  depthRowSums[10] = transform.depthRowSums8_10.z;

  // Transform vertex
  let result = transformNDCompute(
    inputVertex,
    transform.rotationMatrix4D,
    params.dimension,
    params.uniformScale,
    params.projectionDistance,
    params.depthNormFactor,
    extraRotCols,
    depthRowSums
  );

  // Write output
  var output: TransformedVertex;
  output.position = result.xyz;
  output.depth = result.w;
  outputVertices[vertexIdx] = output;
}
`
