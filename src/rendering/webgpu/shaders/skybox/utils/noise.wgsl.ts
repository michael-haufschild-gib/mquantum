/**
 * Skybox noise utilities for WGSL
 * Port of: src/rendering/shaders/skybox/utils/noise.glsl.ts
 */
export const noiseBlock = `
// --- Noise Utilities ---

// High quality hash function
fn skyboxHash(p_in: vec3<f32>) -> f32 {
  var p = fract(p_in * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// 3D Value noise
fn skyboxNoise(x: vec3<f32>) -> f32 {
  let i = floor(x);
  let f = fract(x);
  let u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(
      mix(skyboxHash(i + vec3<f32>(0.0, 0.0, 0.0)),
          skyboxHash(i + vec3<f32>(1.0, 0.0, 0.0)), u.x),
      mix(skyboxHash(i + vec3<f32>(0.0, 1.0, 0.0)),
          skyboxHash(i + vec3<f32>(1.0, 1.0, 0.0)), u.x),
      u.y
    ),
    mix(
      mix(skyboxHash(i + vec3<f32>(0.0, 0.0, 1.0)),
          skyboxHash(i + vec3<f32>(1.0, 0.0, 1.0)), u.x),
      mix(skyboxHash(i + vec3<f32>(0.0, 1.0, 1.0)),
          skyboxHash(i + vec3<f32>(1.0, 1.0, 1.0)), u.x),
      u.y
    ),
    u.z
  );
}

// FBM (Fractal Brownian Motion) - unrolled for WGSL
// Note: WGSL requires explicit loop bounds, using manual unrolling for flexibility
fn skyboxFbm3(x_in: vec3<f32>) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var x = x_in;
  let shift = vec3<f32>(100.0);

  // 3 octaves
  v += a * skyboxNoise(x);
  x = x * 2.0 + shift;
  a *= 0.5;

  v += a * skyboxNoise(x);
  x = x * 2.0 + shift;
  a *= 0.5;

  v += a * skyboxNoise(x);

  return v;
}

fn skyboxFbm5(x_in: vec3<f32>) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var x = x_in;
  let shift = vec3<f32>(100.0);

  // 5 octaves
  for (var i = 0; i < 5; i++) {
    v += a * skyboxNoise(x);
    x = x * 2.0 + shift;
    a *= 0.5;
  }

  return v;
}
`
