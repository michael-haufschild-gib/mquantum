/**
 * Classic skybox mode for WGSL - KTX2 cube texture sampling
 * Port of: src/rendering/shaders/skybox/modes/classic.glsl.ts
 */
export const classicBlock = `
// --- Classic Mode: Texture-based skybox ---
// Samples from a pre-loaded KTX2 cube texture

fn getClassic(dir: vec3<f32>, time: f32) -> vec3<f32> {
  // Sample cube texture with automatic mip level selection
  var color = textureSample(skyboxTexture, skyboxSampler, dir).rgb;

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
