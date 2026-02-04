/**
 * Polytope Normal Compute Shader Modules
 *
 * Pre-computes face normals from transformed 3D positions using compute shader.
 * Replaces vertex shader normal computation (geometry mode) and fragment shader
 * screen-space normals (dFdx/dFdy mode) with a single efficient compute pass.
 *
 * Benefits:
 * - Computed once per frame, not per-pixel
 * - No screen-space artifacts at triangle edges
 * - Consistent quality across all dimensions (3D-11D)
 * - Reduces vertex shader complexity
 *
 * @module rendering/webgpu/shaders/polytope/compute/normals.wgsl
 */

/**
 * Compute parameters for normal calculation.
 *
 * Layout (must match TypeScript COMPUTE_PARAMS_SIZE = 16 bytes):
 * - triangleCount: Number of triangles to process
 * - vertexCount: Number of vertices in position buffer
 * - _pad0, _pad1: Padding for alignment
 */
export const normalComputeParamsBlock = /* wgsl */ `
struct NormalComputeParams {
  triangleCount: u32,    // Number of triangles to process
  vertexCount: u32,      // Number of vertices (for bounds checking)
  _pad0: u32,
  _pad1: u32,
}
`

/**
 * Transformed vertex structure (input from PolytopeTransformComputePass).
 *
 * Layout (must match OUTPUT_VERTEX_STRIDE = 16 bytes):
 * - position: vec3f (12 bytes) - Transformed 3D position
 * - depth: f32 (4 bytes) - N-D depth for color algorithms
 */
export const transformedVertexStructBlock = /* wgsl */ `
struct TransformedVertex {
  position: vec3f,
  depth: f32,
}
`

/**
 * Face normal structure (output).
 *
 * Layout (16 bytes for alignment):
 * - normal: vec3f (12 bytes) - Computed face normal
 * - _pad: f32 (4 bytes) - Padding for 16-byte alignment
 */
export const faceNormalStructBlock = /* wgsl */ `
struct FaceNormal {
  normal: vec3f,
  _pad: f32,
}
`

/**
 * Triangle indices structure.
 *
 * Layout (12 bytes, padded to 16):
 * - i0, i1, i2: Vertex indices for triangle corners
 * - _pad: Padding for alignment
 */
export const triangleIndicesStructBlock = /* wgsl */ `
struct TriangleIndices {
  i0: u32,
  i1: u32,
  i2: u32,
  _pad: u32,
}
`

/**
 * Bind group declarations for normal compute shader.
 *
 * Group 0:
 * - @binding(0): Compute parameters (uniform)
 * - @binding(1): Transformed vertices (storage, read-only)
 * - @binding(2): Triangle indices (storage, read-only)
 * - @binding(3): Output normals (storage, read-write)
 */
export const normalComputeBindingsBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: NormalComputeParams;
@group(0) @binding(1) var<storage, read> vertices: array<TransformedVertex>;
@group(0) @binding(2) var<storage, read> triangles: array<TriangleIndices>;
@group(0) @binding(3) var<storage, read_write> normals: array<FaceNormal>;
`

/**
 * Face normal computation function.
 *
 * Computes the normal of a triangle from its 3 vertex positions using the
 * cross product of two edges. Includes degenerate triangle handling with
 * fallback to (0, 0, 1) for near-zero area triangles.
 *
 * @param v0 First vertex position
 * @param v1 Second vertex position
 * @param v2 Third vertex position
 * @returns Normalized face normal (or fallback for degenerate triangles)
 */
export const computeFaceNormalBlock = /* wgsl */ `
const NORMAL_EPSILON: f32 = 0.0001;
const FALLBACK_NORMAL: vec3f = vec3f(0.0, 0.0, 1.0);

fn computeFaceNormal(v0: vec3f, v1: vec3f, v2: vec3f) -> vec3f {
  // Compute edges from vertex 0
  let edge1 = v1 - v0;
  let edge2 = v2 - v0;

  // Cross product gives normal direction
  let rawNormal = cross(edge1, edge2);
  let normalLen = length(rawNormal);

  // Guard against degenerate triangles (collinear vertices)
  // Use same epsilon as geometry-based WebGL implementation
  if (normalLen < NORMAL_EPSILON) {
    return FALLBACK_NORMAL;
  }

  return rawNormal / normalLen;
}
`

/**
 * Main compute shader entry point.
 *
 * Each invocation processes one triangle:
 * 1. Load triangle indices
 * 2. Load transformed vertex positions
 * 3. Compute face normal via cross product
 * 4. Store result in output buffer
 *
 * Workgroup size: 256x1x1 (optimal for linear triangle processing)
 */
export const normalComputeMainBlock = /* wgsl */ `
@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) globalId: vec3u) {
  let triangleIdx = globalId.x;

  // Bounds check
  if (triangleIdx >= params.triangleCount) {
    return;
  }

  // Load triangle indices
  let tri = triangles[triangleIdx];

  // Bounds check for vertex indices
  if (tri.i0 >= params.vertexCount ||
      tri.i1 >= params.vertexCount ||
      tri.i2 >= params.vertexCount) {
    // Invalid indices - store fallback normal
    normals[triangleIdx] = FaceNormal(FALLBACK_NORMAL, 0.0);
    return;
  }

  // Load transformed vertex positions
  let v0 = vertices[tri.i0].position;
  let v1 = vertices[tri.i1].position;
  let v2 = vertices[tri.i2].position;

  // Compute face normal
  let normal = computeFaceNormal(v0, v1, v2);

  // Store result
  normals[triangleIdx] = FaceNormal(normal, 0.0);
}
`

/**
 * Optional: Smooth normal accumulation compute shader.
 *
 * For per-vertex smooth normals, we need two passes:
 * 1. Accumulate face normals to each vertex (this shader)
 * 2. Normalize accumulated normals (separate pass or combined)
 *
 * This is optional for Phase 4 visual enhancements.
 */
export const smoothNormalAccumulateBlock = /* wgsl */ `
// Atomic accumulation requires manual float-to-uint encoding or separate pass
// For now, we use face normals (flat shading) which is sufficient for polytopes

// Future implementation for smooth normals would:
// 1. Use atomicAdd on integer buffers
// 2. Convert float normals to fixed-point integers
// 3. Accumulate per-vertex
// 4. Normalize in final pass
`

/**
 * Per-vertex normal structure (for smooth normals).
 *
 * Layout (16 bytes):
 * - normal: vec3f (12 bytes) - Accumulated/normalized normal
 * - weight: f32 (4 bytes) - Accumulation weight (face count)
 */
export const vertexNormalStructBlock = /* wgsl */ `
struct VertexNormal {
  normal: vec3f,
  weight: f32,
}
`
