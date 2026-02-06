/**
 * Custom Depth Material Shaders (WGSL)
 *
 * Depth packing, depth uniforms, and N-D transformation for depth rendering.
 *
 * ## Depth Normalization
 * All shaders use sqrt(dimension - 3) normalization for consistent visual scaling
 * across different dimensions.
 *
 * ## Scale Applied AFTER Projection
 * IMPORTANT: Scale is applied AFTER projection to 3D (like camera zoom).
 * This preserves N-D geometry and prevents extreme values during rotation.
 *
 * @module rendering/webgpu/shaders/shared/depth/customDepth.wgsl
 */

/**
 * Depth normalization base dimension constant
 * The normalization factor is sqrt(dimension - this value).
 */
const DEPTH_NORM_BASE = 3

/**
 * Pack depth to RGBA - matches Three.js packDepthToRGBA
 */
export const packDepthBlock = /* wgsl */ `
// ============================================
// Depth Packing Utilities
// ============================================

fn packDepthToRGBA(depth: f32) -> vec4f {
  var r = vec4f(depth, fract(depth * 255.0), fract(depth * 65025.0), fract(depth * 16581375.0));
  r = vec4f(r.x, r.y - r.x * (1.0 / 255.0), r.z - r.y * (1.0 / 255.0), r.w - r.z * (1.0 / 255.0));
  return r;
}

fn unpackRGBAToDepth(v: vec4f) -> f32 {
  return dot(v, vec4f(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0));
}
`

/**
 * Depth uniforms struct for depth rendering
 */
export const depthUniformsBlock = /* wgsl */ `
// ============================================
// Depth Uniforms
// ============================================

const MAX_EXTRA_DIMS: i32 = 7;

struct DepthUniforms {
  // N-D Transformation
  rotationMatrix4D: mat4x4f,
  dimension: i32,
  uniformScale: f32,  // Applied AFTER projection (like camera zoom)
  projectionDistance: f32,
  _pad0: f32,

  // Extra rotation columns (MAX_EXTRA_DIMS * 4 = 28 values, packed into vec4s)
  extraRotationCols0: vec4f,
  extraRotationCols1: vec4f,
  extraRotationCols2: vec4f,
  extraRotationCols3: vec4f,
  extraRotationCols4: vec4f,
  extraRotationCols5: vec4f,
  extraRotationCols6: vec4f,

  // Depth row sums (11 values, packed)
  depthRowSums0: vec4f,
  depthRowSums1: vec4f,
  depthRowSums2: vec4f, // .xyz used

  // Point light depth uniforms
  referencePosition: vec3f,
  isPointLight: f32,  // 0 = depth mode, 1 = distance mode
  nearDistance: f32,
  farDistance: f32,
  _pad1: vec2f,
}
`

/**
 * N-D transformation function for depth shaders
 */
export const ndTransformDepthBlock = /* wgsl */ `
// ============================================
// N-D Transformation for Depth Rendering
// ============================================

// Helper to get extra rotation column value
fn getExtraRotationCol(uniforms: DepthUniforms, colIndex: i32, rowIndex: i32) -> f32 {
  let idx = colIndex * 4 + rowIndex;
  let vec4Index = idx / 4;
  let componentIndex = idx % 4;

  var vec4Val: vec4f;
  if (vec4Index == 0) { vec4Val = uniforms.extraRotationCols0; }
  else if (vec4Index == 1) { vec4Val = uniforms.extraRotationCols1; }
  else if (vec4Index == 2) { vec4Val = uniforms.extraRotationCols2; }
  else if (vec4Index == 3) { vec4Val = uniforms.extraRotationCols3; }
  else if (vec4Index == 4) { vec4Val = uniforms.extraRotationCols4; }
  else if (vec4Index == 5) { vec4Val = uniforms.extraRotationCols5; }
  else { vec4Val = uniforms.extraRotationCols6; }

  if (componentIndex == 0) { return vec4Val.x; }
  else if (componentIndex == 1) { return vec4Val.y; }
  else if (componentIndex == 2) { return vec4Val.z; }
  return vec4Val.w;
}

// Helper to get depth row sum value
fn getDepthRowSum(uniforms: DepthUniforms, index: i32) -> f32 {
  if (index < 4) {
    if (index == 0) { return uniforms.depthRowSums0.x; }
    else if (index == 1) { return uniforms.depthRowSums0.y; }
    else if (index == 2) { return uniforms.depthRowSums0.z; }
    return uniforms.depthRowSums0.w;
  } else if (index < 8) {
    if (index == 4) { return uniforms.depthRowSums1.x; }
    else if (index == 5) { return uniforms.depthRowSums1.y; }
    else if (index == 6) { return uniforms.depthRowSums1.z; }
    return uniforms.depthRowSums1.w;
  } else {
    if (index == 8) { return uniforms.depthRowSums2.x; }
    else if (index == 9) { return uniforms.depthRowSums2.y; }
    return uniforms.depthRowSums2.z;
  }
}

// Transform N-D vertex to 3D for depth rendering
fn transformNDForDepth(
  position: vec3f,
  extraDims0_3: vec4f,  // dims 4-7
  extraDims4_6: vec3f,  // dims 8-10
  uniforms: DepthUniforms
) -> vec3f {
  // Build input array from raw (unscaled) coordinates
  var inputs: array<f32, 11>;
  inputs[0] = position.x;
  inputs[1] = position.y;
  inputs[2] = position.z;
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
  var rotated = uniforms.rotationMatrix4D * pos4;

  // Add contribution from extra dimensions (5D+)
  for (var i = 0; i < MAX_EXTRA_DIMS; i++) {
    if (i + 5 <= uniforms.dimension) {
      let extraDimValue = inputs[i + 4];
      rotated.x += getExtraRotationCol(uniforms, i, 0) * extraDimValue;
      rotated.y += getExtraRotationCol(uniforms, i, 1) * extraDimValue;
      rotated.z += getExtraRotationCol(uniforms, i, 2) * extraDimValue;
      rotated.w += getExtraRotationCol(uniforms, i, 3) * extraDimValue;
    }
  }

  // Perspective projection: compute effective depth from higher dimensions
  var effectiveDepth = rotated.w;
  for (var j = 0; j < 11; j++) {
    if (j < uniforms.dimension) {
      effectiveDepth += getDepthRowSum(uniforms, j) * inputs[j];
    }
  }

  // Normalize depth by sqrt(dimension - 3) for consistent visual scale
  let normFactor = select(1.0, sqrt(max(1.0, f32(uniforms.dimension - ${DEPTH_NORM_BASE}))), uniforms.dimension > 4);
  effectiveDepth /= normFactor;

  // Guard against division by zero
  var denom = uniforms.projectionDistance - effectiveDepth;
  denom = select(denom, select(0.0001, -0.0001, denom >= 0.0), abs(denom) < 0.0001);
  let factor = 1.0 / denom;

  // Project to 3D, then apply uniform scale (like camera zoom)
  return rotated.xyz * factor * uniforms.uniformScale;
}
`

