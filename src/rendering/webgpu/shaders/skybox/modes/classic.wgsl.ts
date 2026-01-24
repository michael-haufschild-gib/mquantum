/**
 * Classic skybox mode for WGSL - KTX2 cube texture sampling
 * Port of: src/rendering/shaders/skybox/modes/classic.glsl.ts
 */
export const classicBlock = `
// --- Classic Mode: Texture-based skybox ---
// Samples from a pre-loaded KTX2 cube texture

fn getClassic(dir: vec3<f32>, time: f32) -> vec3<f32> {
  // Sample cube texture at full quality (LOD 0)
  var color = textureSampleLevel(skyboxTexture, skyboxSampler, dir, 0.0).rgb;

  // Apply intensity
  color *= uniforms.intensity;

  // Apply hue shift and saturation if needed
  if (uniforms.hue != 0.0 || uniforms.saturation != 1.0) {
    var hsv = rgb2hsv(color);
    hsv.x += uniforms.hue;
    hsv.y *= uniforms.saturation;
    color = hsv2rgb(hsv);
  }

  return color;
}
`
