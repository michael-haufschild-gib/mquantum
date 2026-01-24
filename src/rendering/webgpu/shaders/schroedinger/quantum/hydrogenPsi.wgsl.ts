/**
 * WGSL Full Hydrogen Atom Wavefunction ψ_nlm(r, θ, φ)
 *
 * The complete hydrogen wavefunction is the product of radial
 * and angular parts:
 *   ψ_nlm(r, θ, φ) = R_nl(r) · Y_lm(θ, φ)
 *
 * Port of GLSL quantum/hydrogenPsi.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/hydrogenPsi.wgsl
 */

export const hydrogenPsiBlock = /* wgsl */ `
// ============================================
// Full Hydrogen Wavefunction ψ_nlm
// ============================================

/**
 * Convert Cartesian coordinates to spherical coordinates
 *
 * @param pos - Cartesian position (x, y, z)
 * @return vec3f(r, theta, phi) where:
 *   r = radial distance from origin
 *   theta = polar angle from +z axis [0, π]
 *   phi = azimuthal angle from +x axis [0, 2π]
 */
fn cartesianToSpherical(pos: vec3f) -> vec3f {
  // Compute squares once, reuse for both r and rho_xy
  let x2 = pos.x * pos.x;
  let y2 = pos.y * pos.y;
  let z2 = pos.z * pos.z;

  let rho_xy_sq = x2 + y2;
  let r = sqrt(rho_xy_sq + z2);

  // Handle origin (avoid division by zero)
  if (r < 1e-10) {
    return vec3f(0.0, 0.0, 0.0);
  }

  // θ = polar angle from z-axis [0, π]
  // Using atan2(rho_xy, z) for numerical stability
  let rho_xy = sqrt(rho_xy_sq);
  let theta = atan2(rho_xy, pos.z);

  // φ = azimuthal angle from x-axis
  var phi = atan2(pos.y, pos.x);

  // Ensure φ ∈ [0, 2π]
  if (phi < 0.0) {
    phi += 2.0 * PI;
  }

  return vec3f(r, theta, phi);
}

/**
 * Check if hydrogen radial contribution is negligible
 *
 * Uses precomputed threshold uniform for performance.
 */
fn hydrogenRadialEarlyExit(r: f32, uniforms: SchroedingerUniforms) -> bool {
  return r > uniforms.hydrogenRadialThreshold;
}

/**
 * Evaluate hydrogen orbital at a 3D Cartesian position
 *
 * Returns the wavefunction as a complex number (vec2f).
 * For real orbitals, the imaginary part will be zero.
 */
fn evalHydrogenPsi(
  pos: vec3f,
  n: i32,
  l: i32,
  m: i32,
  a0: f32,
  useReal: bool,
  uniforms: SchroedingerUniforms
) -> vec2f {
  // Convert to spherical coordinates
  let sph = cartesianToSpherical(pos);
  let r = sph.x;
  let theta = sph.y;
  let phi = sph.z;

  // EARLY EXIT: Skip if radial contribution is negligible
  if (hydrogenRadialEarlyExit(r, uniforms)) {
    return vec2f(0.0, 0.0);
  }

  // Radial part R_nl(r)
  let R = hydrogenRadial(n, l, r, a0);

  // Angular part Y_lm(θ, φ)
  if (useReal) {
    // Real spherical harmonics (for px, py, pz, dxy, etc.)
    var Y: f32;
    if (l <= 2) {
      // Use fast direct computation for common orbitals
      Y = fastRealSphericalHarmonic(l, m, theta, phi);
    } else {
      Y = realSphericalHarmonic(l, m, theta, phi, true);
    }
    // Real orbital: ψ is purely real
    return vec2f(R * Y, 0.0);
  } else {
    // Complex spherical harmonics
    let Y = sphericalHarmonic(l, m, theta, phi);
    // ψ = R · Y (complex multiplication with real R)
    return R * Y;
  }
}

/**
 * Evaluate hydrogen orbital with time evolution
 *
 * Applies the time-dependent phase factor e^{-iE_n t/ℏ}
 *
 * Energy: E_n = -1/(2n²) in atomic units
 */
fn evalHydrogenPsiTime(
  pos: vec3f,
  n: i32,
  l: i32,
  m: i32,
  a0: f32,
  useReal: bool,
  t: f32,
  uniforms: SchroedingerUniforms
) -> vec2f {
  // Static wavefunction
  let psi0 = evalHydrogenPsi(pos, n, l, m, a0, useReal, uniforms);

  // Energy eigenvalue: E_n = -1/(2n²) in atomic units
  let fn = f32(n);
  let E = -0.5 / (fn * fn);

  // Time evolution: ψ(t) = ψ(0) · e^{-iEt}
  let phase = -E * t;
  let timeFactor = vec2f(cos(phase), sin(phase));

  // Complex multiplication: ψ(t) = ψ(0) · e^{-iEt}
  return cmul(psi0, timeFactor);
}

/**
 * Evaluate hydrogen orbital with spatial phase for coloring
 *
 * Returns wavefunction value and phase information for
 * phase-based coloring schemes.
 *
 * @return vec4f(psi.re, psi.im, spatialPhase, magnitude)
 */
fn evalHydrogenPsiWithPhase(
  pos: vec3f,
  n: i32,
  l: i32,
  m: i32,
  a0: f32,
  useReal: bool,
  t: f32,
  uniforms: SchroedingerUniforms
) -> vec4f {
  // Compute static wavefunction ONCE
  let psi0 = evalHydrogenPsi(pos, n, l, m, a0, useReal, uniforms);

  // Spatial phase (at t=0) for stable coloring
  let spatialPhase = atan2(psi0.y, psi0.x);

  // Apply time evolution: ψ(t) = ψ(0) · e^{-iEt}
  let fn = f32(n);
  let E = -0.5 / (fn * fn);
  let phase = -E * t;
  let timeFactor = vec2f(cos(phase), sin(phase));

  // Complex multiplication: ψ(t) = ψ(0) · e^{-iEt}
  let psi = cmul(psi0, timeFactor);

  // Magnitude
  let mag = length(psi);

  return vec4f(psi.x, psi.y, spatialPhase, mag);
}

/**
 * Compute probability density |ψ|² at a point
 */
fn hydrogenProbabilityDensity(
  pos: vec3f,
  n: i32,
  l: i32,
  m: i32,
  a0: f32,
  useReal: bool,
  uniforms: SchroedingerUniforms
) -> f32 {
  let psi = evalHydrogenPsi(pos, n, l, m, a0, useReal, uniforms);
  return dot(psi, psi); // |ψ|² = re² + im²
}
`
