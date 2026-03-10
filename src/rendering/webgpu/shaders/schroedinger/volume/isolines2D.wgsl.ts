/**
 * WGSL 2D Isolines Shader Block
 *
 * Anti-aliased contour lines at density thresholds for 2D rendering.
 * Uses gradient-based SDF for smooth anti-aliasing.
 *
 * 2D equivalent of 3D isosurface.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/isolines2D
 */

/**
 * Isoline rendering block for 2D mode.
 *
 * Draws anti-aliased contour lines at log-spaced density levels.
 * Returns vec4f(coverage, r, g, b).
 */
export const isolines2DBlock = /* wgsl */ `
// ============================================
// 2D Isolines (Anti-aliased contour lines)
// ============================================

// Evaluate isolines at a 2D position.
// Returns vec4f(coverage, r, g, b) where coverage is 0..1 contour alpha.
fn evaluateIsolines2D(pos: vec3f, rho: f32, s: f32, uniforms: SchroedingerUniforms) -> vec4f {
  // Skip if isosurface is not enabled
  if (uniforms.isoEnabled == 0u) {
    return vec4f(0.0);
  }

  // Pixel-space step for finite differences
  let pixelSize = 2.0 * uniforms.boundingRadius / max(camera.resolution.y, 1.0);
  let eps = max(pixelSize * 1.5, 0.002);

  // Sample density at neighbors for gradient
  let rho_r = sampleDensity(pos + vec3f(eps, 0.0, 0.0), uniforms.time * uniforms.timeScale, uniforms);
  let rho_u = sampleDensity(pos + vec3f(0.0, eps, 0.0), uniforms.time * uniforms.timeScale, uniforms);

  let s_r = sFromRho(rho_r);
  let s_u = sFromRho(rho_u);

  // Gradient of log-density (more uniform spacing than linear density)
  let grad = vec2f(
    (s_r - s) / eps,
    (s_u - s) / eps
  );
  let gradLen = length(grad);

  if (gradLen < 1e-8) {
    return vec4f(0.0);
  }

  // Generate multiple contour levels at log-spaced intervals.
  // isoThreshold is already in log-density space (range [-6, 0]),
  // matching the domain of s = sFromRho(rho) = log(rho + eps).
  let baseLevel = uniforms.isoThreshold;

  // Contour spacing in log-density space
  let spacing = 1.0;

  // Find distance to nearest contour in log-density space
  let levelIndex = (s - baseLevel) / spacing;
  let nearestLevel = round(levelIndex);
  let distToLevel = abs(s - (baseLevel + nearestLevel * spacing));

  // Convert to pixel distance via gradient
  let distPixels = (distToLevel / gradLen) / pixelSize;

  // Anti-aliased line rendering
  let lineWidth = 1.2;
  let coverage = 1.0 - smoothstep(0.0, lineWidth, distPixels);

  if (coverage < 0.01) {
    return vec4f(0.0);
  }

  // Contour color: bright white/gray lines for visibility
  // Dim the lines for lower density levels
  let levelBrightness = clamp(0.3 + 0.7 * clamp((s + 6.0) / 6.0, 0.0, 1.0), 0.2, 1.0);
  let lineColor = vec3f(levelBrightness);

  return vec4f(coverage * 0.7, lineColor);
}
`

/**
 * Stub for when 2D isolines are not needed.
 * Required because WGSL resolves all symbols even in dead branches.
 */
export const isolines2DStubBlock = /* wgsl */ `
// Stub: 2D isolines not available in this mode
fn evaluateIsolines2D(pos: vec3f, rho: f32, s: f32, uniforms: SchroedingerUniforms) -> vec4f {
  return vec4f(0.0);
}
`
