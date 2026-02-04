/**
 * WGSL Julia Set Uniforms
 *
 * Port of GLSL julia/uniforms.glsl to WGSL.
 * Defines uniform structure for Julia set rendering.
 *
 * @module rendering/webgpu/shaders/julia/uniforms.wgsl
 */

export const juliaUniformsBlock = /* wgsl */ `
// ============================================
// Julia Set Uniforms
// ============================================

struct JuliaUniforms {
  // Julia constant (fixed c value, not derived from sample position)
  juliaConstant: vec4f,

  // Power parameters
  effectivePower: f32,
  effectiveBailout: f32,
  iterations: u32,

  // Power Animation
  powerAnimationEnabled: u32,
  animatedPower: f32,

  // Dimension Mixing
  dimensionMixEnabled: u32,
  mixIntensity: f32,
  mixTime: f32,

  // LOD
  lodEnabled: u32,
  lodDetail: f32,

  // Phase (for animation)
  phaseEnabled: u32,
  phaseTheta: f32,
  phasePhi: f32,

  // Scale
  scale: f32,

  // Padding for 16-byte alignment
  _padding: vec2f,
}

// ============================================
// N-Dimensional Basis Vectors
// ============================================

struct BasisVectors {
  // Each basis vector has up to 11 components (padded to 12)
  // Stored as 3 vec4f each
  basisX: array<vec4f, 3>,
  basisY: array<vec4f, 3>,
  basisZ: array<vec4f, 3>,
  origin: array<vec4f, 3>,
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get component i from a basis vector array.
 */
fn getBasisComponent(basis: array<vec4f, 3>, i: i32) -> f32 {
  let vecIdx = i / 4;
  let compIdx = i % 4;

  if (vecIdx == 0) {
    return basis[0][compIdx];
  } else if (vecIdx == 1) {
    return basis[1][compIdx];
  } else {
    return basis[2][compIdx];
  }
}

/**
 * Transform a 3D point to D-dimensional space using basis vectors.
 */
fn transformToND(
  p: vec3f,
  basisX: array<vec4f, 3>,
  basisY: array<vec4f, 3>,
  basisZ: array<vec4f, 3>,
  origin: array<vec4f, 3>,
  dimension: i32
) -> array<f32, 11> {
  var result: array<f32, 11>;

  for (var i = 0; i < dimension; i = i + 1) {
    result[i] = p.x * getBasisComponent(basisX, i) +
                p.y * getBasisComponent(basisY, i) +
                p.z * getBasisComponent(basisZ, i) +
                getBasisComponent(origin, i);
  }

  return result;
}
`

/**
 * Generate bind group layout entry for Julia uniforms.
 * @param bindingIndex
 */
export function generateJuliaBindGroupEntry(bindingIndex: number): string {
  return /* wgsl */ `
@group(3) @binding(${bindingIndex}) var<uniform> julia: JuliaUniforms;
`
}
