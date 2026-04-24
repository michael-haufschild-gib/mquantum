/**
 * Skybox noise utilities for WGSL
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

// FBM (Fractal Brownian Motion) - 3 octaves, fully unrolled with compile-time weights.
// The previous version threaded an 'a' running-weight variable through each iteration;
// baking the constants in (0.5, 0.25, 0.125) lets the compiler fold them directly into
// the multiply-adds and saves three running multiplications per pixel.
fn skyboxFbm3(x_in: vec3<f32>) -> f32 {
  let shift = vec3<f32>(100.0);
  var x = x_in;

  var v  = 0.5   * skyboxNoise(x);
  x = x * 2.0 + shift;
  v     += 0.25  * skyboxNoise(x);
  x = x * 2.0 + shift;
  v     += 0.125 * skyboxNoise(x);
  return v;
}
`
