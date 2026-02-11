/**
 * WGSL 2D Nodal Lines Shader Block
 *
 * Anti-aliased zero-crossing lines of Re(psi), Im(psi), or |psi| for 2D rendering.
 * Uses finite differences to compute gradients and SDF-based anti-aliasing.
 *
 * 2D equivalent of 3D nodal surfaces.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/nodalLines2D
 */

/**
 * 2D nodal lines evaluation block.
 *
 * Returns vec4f(alpha, r, g, b) where alpha is the line coverage
 * and rgb is the nodal line color.
 *
 * Uses the existing NODAL_DEFINITION_* constants from uniforms.wgsl.ts.
 */
export const nodalLines2DBlock = /* wgsl */ `
// ============================================
// 2D Nodal Lines (Anti-aliased zero crossings)
// ============================================

// Evaluate nodal lines at a 2D position.
// Returns vec4f(coverage, r, g, b) where coverage is 0..1 line alpha.
fn evaluateNodalLines2D(pos: vec3f, animTime: f32, uniforms: SchroedingerUniforms) -> vec4f {
  // Pixel-space step for finite differences
  let pixelSize = 2.0 * uniforms.boundingRadius / max(camera.resolution.y, 1.0);
  let eps = max(pixelSize * 1.5, 0.002);

  // Evaluate wavefunction at current point and neighbors
  let xND_c = mapPosToND(pos, uniforms);
  let psi_c = evalPsi(xND_c, animTime, uniforms);

  let xND_r = mapPosToND(pos + vec3f(eps, 0.0, 0.0), uniforms);
  let psi_r = evalPsi(xND_r, animTime, uniforms);

  let xND_u = mapPosToND(pos + vec3f(0.0, eps, 0.0), uniforms);
  let psi_u = evalPsi(xND_u, animTime, uniforms);

  // Choose which scalar field to find zero-crossings of
  // nodalDefinition: 0=|psi|, 1=Re(psi), 2=Im(psi), 3=Re*Im
  var f_c: f32;
  var f_r: f32;
  var f_u: f32;

  let def = uniforms.nodalDefinition;
  if (def == NODAL_DEFINITION_REAL) {
    f_c = psi_c.x;
    f_r = psi_r.x;
    f_u = psi_u.x;
  } else if (def == NODAL_DEFINITION_IMAG) {
    f_c = psi_c.y;
    f_r = psi_r.y;
    f_u = psi_u.y;
  } else if (def == NODAL_DEFINITION_COMPLEX_INTERSECTION) {
    // Re*Im — shows both real and imaginary nodes
    f_c = psi_c.x * psi_c.y;
    f_r = psi_r.x * psi_r.y;
    f_u = psi_u.x * psi_u.y;
  } else {
    // Default (NODAL_DEFINITION_PSI_ABS): |psi| (amplitude)
    f_c = length(psi_c);
    f_r = length(psi_r);
    f_u = length(psi_u);
  }

  // Gradient via finite differences
  let grad = vec2f(
    (f_r - f_c) / eps,
    (f_u - f_c) / eps
  );
  let gradLen = length(grad);

  // SDF distance to zero-crossing in pixel units
  if (gradLen < 1e-8) {
    return vec4f(0.0);
  }
  let distWorld = abs(f_c) / gradLen;
  let distPixels = distWorld / pixelSize;

  // Anti-aliased line (1.5 pixel feather)
  let lineWidth = max(uniforms.nodalTolerance * 20.0, 1.0);
  let coverage = 1.0 - smoothstep(0.0, lineWidth, distPixels);

  if (coverage < 0.01) {
    return vec4f(0.0);
  }

  // Determine nodal color based on lobe coloring and sign
  var nodalCol: vec3f;
  if (uniforms.nodalLobeColoringEnabled != 0u) {
    if (f_c > 0.0) {
      nodalCol = uniforms.nodalColorPositive;
    } else {
      nodalCol = uniforms.nodalColorNegative;
    }
  } else {
    nodalCol = uniforms.nodalColor;
  }

  return vec4f(coverage, nodalCol);
}
`

/**
 * Stub for when 2D nodal lines are not needed.
 * Required because WGSL resolves all symbols even in dead branches.
 */
export const nodalLines2DStubBlock = /* wgsl */ `
// Stub: 2D nodal lines not available in this mode
fn evaluateNodalLines2D(pos: vec3f, animTime: f32, uniforms: SchroedingerUniforms) -> vec4f {
  return vec4f(0.0);
}
`
