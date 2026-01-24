/**
 * Skybox sun effect for WGSL
 * Port of: src/rendering/shaders/skybox/effects/sun.glsl.ts
 */
export const sunBlock = `
// --- Sun Glow Effect ---
// Adds directional sun glow based on view direction
// PERF: Uses multiplications instead of pow(x, 8.0)

fn applySun(col: vec3<f32>, dir: vec3<f32>) -> vec3<f32> {
  var result = col;

  if (uniforms.sunIntensity > 0.0) {
    // Guard against zero-length sun position
    let sunLen = length(uniforms.sunPosition);
    let sunDir = select(
      vec3<f32>(0.0, 1.0, 0.0),
      uniforms.sunPosition / sunLen,
      sunLen > 0.0001
    );

    let sunDot = max(0.0, dot(dir, sunDir));
    // Sharp glow: sunDot^8 = ((sunDot^2)^2)^2
    let s2 = sunDot * sunDot;
    let s4 = s2 * s2;
    let sunGlow = s4 * s4;

    result += vec3<f32>(1.0, 0.9, 0.7) * sunGlow * uniforms.sunIntensity;
  }

  return result;
}
`
