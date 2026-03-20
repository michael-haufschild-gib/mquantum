/**
 * Gradient Normal Compute Shader
 *
 * Reads the density grid texture and computes normalized gradient normals
 * via central differences. Writes packed (nx, ny, nz, gradMag) to an
 * rgba8snorm storage texture.
 *
 * This replaces the per-pixel 6-fetch gradient computation in the fragment
 * shader with a single texture read, saving 0.4-1.6ms per frame at Retina.
 *
 * Dispatched once after the density grid is written, before the raymarch.
 *
 * @module rendering/webgpu/shaders/schroedinger/compute/gradientGrid.wgsl
 */

export const gradientGridComputeShader = /* wgsl */ `
@group(0) @binding(0) var densityGrid: texture_3d<f32>;
@group(0) @binding(1) var normalGrid: texture_storage_3d<rgba8snorm, write>;

override GRID_SIZE: u32 = 96u;

// 1 = density grid has logRho in G channel (rgba16float), 0 = r16float fallback
override HAS_LOG_DENSITY: u32 = 1u;

// 1 = dual-channel (Dirac/Pauli) with R=primary, G=secondary density
override IS_DUAL_CHANNEL_GRID: u32 = 0u;

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let size = GRID_SIZE;
  if (any(gid >= vec3u(size))) { return; }

  let coord = vec3i(gid);

  // Central differences with clamped boundary access
  let xp = textureLoad(densityGrid, clamp(coord + vec3i(1, 0, 0), vec3i(0), vec3i(i32(size) - 1)), 0);
  let xn = textureLoad(densityGrid, clamp(coord - vec3i(1, 0, 0), vec3i(0), vec3i(i32(size) - 1)), 0);
  let yp = textureLoad(densityGrid, clamp(coord + vec3i(0, 1, 0), vec3i(0), vec3i(i32(size) - 1)), 0);
  let yn = textureLoad(densityGrid, clamp(coord - vec3i(0, 1, 0), vec3i(0), vec3i(i32(size) - 1)), 0);
  let zp = textureLoad(densityGrid, clamp(coord + vec3i(0, 0, 1), vec3i(0), vec3i(i32(size) - 1)), 0);
  let zn = textureLoad(densityGrid, clamp(coord - vec3i(0, 0, 1), vec3i(0), vec3i(i32(size) - 1)), 0);

  var grad: vec3f;

  if (IS_DUAL_CHANNEL_GRID != 0u) {
    // Dual-channel: gradient of total density (R+G)
    let gx = (xp.r + xp.g) - (xn.r + xn.g);
    let gy = (yp.r + yp.g) - (yn.r + yn.g);
    let gz = (zp.r + zp.g) - (zn.r + zn.g);
    let gradRho = vec3f(gx, gy, gz);
    let center = textureLoad(densityGrid, coord, 0);
    let rhoTotal = center.r + center.g;
    // Convert ∇ρ → ∇log(ρ) = ∇ρ/(ρ+ε)
    grad = gradRho / max(rhoTotal + 1e-8, 1e-8);
  } else if (HAS_LOG_DENSITY != 0u) {
    // rgba16float: logRho in G channel — central difference directly on log-density
    grad = vec3f(
      xp.g - xn.g,
      yp.g - yn.g,
      zp.g - zn.g
    );
  } else {
    // r16float fallback: only rho available
    let gradRho = vec3f(
      xp.r - xn.r,
      yp.r - yn.r,
      zp.r - zn.r
    );
    let center = textureLoad(densityGrid, coord, 0);
    grad = gradRho / max(center.r + 1e-8, 1e-8);
  }

  // Normalize for lighting normal. Store magnitude in alpha for fallback detection.
  let gradLen = length(grad);
  var normal = vec3f(0.0, 1.0, 0.0); // fallback: up-normal at density peaks
  if (gradLen > 1e-4) {
    normal = grad / gradLen;
  }

  // Pack into rgba8snorm: xyz = normal direction [-1,1], w = clamped magnitude indicator
  // w > 0 signals valid gradient; w ≈ 0 signals peak/zero-gradient (use viewDir fallback)
  let magIndicator = clamp(gradLen * 10.0, 0.0, 1.0);
  textureStore(normalGrid, gid, vec4f(normal, magIndicator));
}
`
