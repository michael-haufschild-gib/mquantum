/**
 * WGSL Mandelbulb Uniforms Block
 *
 * Uniform structures specific to Mandelbulb rendering.
 * Port of GLSL uniforms.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/mandelbulb/uniforms.wgsl
 */

export const mandelbulbUniformsBlock = /* wgsl */ `
// ============================================
// Mandelbulb-Specific Uniforms
// ============================================

struct MandelbulbUniforms {
  // Core parameters
  dimension: i32,                // 3-11 dimensional
  power: f32,                    // Mandelbulb power (typically 8)
  iterations: f32,               // Fractal iterations
  escapeRadius: f32,             // Escape radius (bailout)

  // Quality settings
  sdfMaxIterations: f32,         // Raymarching max iterations
  sdfSurfaceDistance: f32,       // Surface hit threshold

  // Pre-computed values
  effectivePower: f32,           // Animated/blended power
  effectiveBailout: f32,         // max(escapeRadius, 2.0)

  // Power animation
  powerAnimationEnabled: u32,
  animatedPower: f32,

  // Alternate power blending
  alternatePowerEnabled: u32,
  alternatePowerValue: f32,
  alternatePowerBlend: f32,

  // Phase shift
  phaseEnabled: u32,
  phaseTheta: f32,               // Phase offset for theta
  phasePhi: f32,                 // Phase offset for phi

  // Scale
  scale: f32,

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

  for (var i = 0; i < dimension && i < 11; i++) {
    let bx = getBasisComponent(basisX, i);
    let by = getBasisComponent(basisY, i);
    let bz = getBasisComponent(basisZ, i);
    let o = getBasisComponent(origin, i);

    result[i] = p.x * bx + p.y * by + p.z * bz + o;
  }

  return result;
}

/**
 * Compute squared length of an N-dimensional point.
 */
fn lengthSquaredND(p: array<f32, 11>, dimension: i32) -> f32 {
  var sum: f32 = 0.0;
  for (var i = 0; i < dimension && i < 11; i++) {
    sum += p[i] * p[i];
  }
  return sum;
}

/**
 * Compute length of an N-dimensional point.
 */
fn lengthND(p: array<f32, 11>, dimension: i32) -> f32 {
  return sqrt(lengthSquaredND(p, dimension));
}
`
