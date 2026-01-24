/**
 * Skybox vignette effect for WGSL
 * Port of: src/rendering/shaders/skybox/effects/vignette.glsl.ts
 */
export const vignetteBlock = `
// --- Vignette Effect ---
// Darkens the edges of the screen for a cinematic look

fn applyVignette(col: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
  var result = col;

  if (uniforms.vignette > 0.0) {
    let dist = distance(uv, vec2<f32>(0.5));
    let vig = smoothstep(0.4, 0.9, dist);
    result *= 1.0 - vig * uniforms.vignette;
  }

  return result;
}
`
