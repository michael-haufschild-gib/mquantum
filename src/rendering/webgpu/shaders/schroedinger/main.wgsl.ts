/**
 * WGSL Schrödinger Main Shader
 *
 * Port of GLSL schroedinger/main.glsl to WGSL.
 * Main volume raymarching loop for quantum wavefunction visualization.
 *
 * @module rendering/webgpu/shaders/schroedinger/main.wgsl
 */

export const mainBlock = /* wgsl */ `
// ============================================
// Schrödinger Volume Raymarcher
// ============================================

// Simple 3D harmonic oscillator wavefunction for testing
fn harmonicOscillator3D(pos: vec3f, n: vec3<i32>, omega: vec3f, time: f32) -> vec2f {
  // Simplified HO eigenfunction
  let x = pos * sqrt(omega);

  // Gaussian envelope
  let gaussian = exp(-0.5 * dot(x, x));

  // Simple polynomial approximation for Hermite polynomials
  var poly: f32 = 1.0;
  if (n.x > 0) { poly *= x.x; }
  if (n.y > 0) { poly *= x.y; }
  if (n.z > 0) { poly *= x.z; }

  // Energy for time evolution
  let E = 0.5 * (f32(n.x) + f32(n.y) + f32(n.z) + 1.5);
  let phase = -E * time * schroedinger.timeScale;

  // Return complex amplitude (re, im)
  let amplitude = gaussian * poly;
  return vec2f(amplitude * cos(phase), amplitude * sin(phase));
}

// Compute probability density at position
fn computeDensity(pos: vec3f) -> f32 {
  let scaledPos = pos * schroedinger.fieldScale;

  // For now, use a single 3D HO state
  let omega = vec3f(schroedinger.omega[0], schroedinger.omega[1], schroedinger.omega[2]);
  let n = vec3<i32>(
    schroedinger.quantum[0],
    schroedinger.quantum[1],
    schroedinger.quantum[2]
  );

  let psi = harmonicOscillator3D(scaledPos, n, omega, schroedinger.time);

  // |psi|^2
  return dot(psi, psi);
}

// Beer-Lambert absorption
fn applyAbsorption(transmittance: f32, density: f32, stepSize: f32) -> f32 {
  let sigma = density * schroedinger.densityGain;
  return transmittance * exp(-sigma * stepSize);
}

// Get emission color from density
fn getEmissionColor(density: f32, pos: vec3f) -> vec3f {
  if (density < schroedinger.emissionThreshold) {
    return vec3f(0.0);
  }

  // Base color from position
  let t = (normalize(pos) * 0.5 + 0.5);
  let baseColor = vec3f(
    0.5 + 0.5 * sin(t.x * 6.28318),
    0.5 + 0.5 * sin(t.y * 6.28318 + 2.094),
    0.5 + 0.5 * sin(t.z * 6.28318 + 4.188)
  );

  return baseColor * density * schroedinger.emissionIntensity;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // Ray setup
  let ro = camera.cameraPosition;
  let rd = normalize(input.vPosition - camera.cameraPosition);

  // Sphere intersection for bounding volume
  let sphereRadius = 2.0;
  let a = dot(rd, rd);
  let b = 2.0 * dot(ro, rd);
  let c = dot(ro, ro) - sphereRadius * sphereRadius;
  let discriminant = b * b - 4.0 * a * c;

  if (discriminant < 0.0) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }

  let sqrtD = sqrt(discriminant);
  var tNear = (-b - sqrtD) / (2.0 * a);
  var tFar = (-b + sqrtD) / (2.0 * a);

  tNear = max(tNear, 0.0);

  if (tFar < tNear) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }

  // Volume raymarch
  let stepCount = schroedinger.sampleCount;
  let stepSize = (tFar - tNear) / f32(stepCount);

  var accumulatedColor = vec3f(0.0);
  var transmittance: f32 = 1.0;

  for (var i = 0; i < stepCount; i++) {
    let t = tNear + (f32(i) + 0.5) * stepSize;
    let pos = ro + rd * t;

    // Sample density
    let density = computeDensity(pos);

    // Accumulate emission
    let emission = getEmissionColor(density, pos);
    accumulatedColor += emission * transmittance * stepSize;

    // Apply absorption
    transmittance = applyAbsorption(transmittance, density, stepSize);

    // Early exit
    if (transmittance < 0.01) {
      break;
    }
  }

  // Apply powder effect
  if (schroedinger.powderScale > 0.0) {
    let powder = 1.0 - exp(-schroedinger.powderScale * (1.0 - transmittance));
    accumulatedColor *= 1.0 + powder * 0.5;
  }

  return vec4f(accumulatedColor, 1.0 - transmittance);
}
`

export const mainBlockIsosurface = /* wgsl */ `
// ============================================
// Schrödinger Isosurface Raymarcher
// ============================================

// (Isosurface implementation would go here)
// For now, redirect to volumetric mode

${mainBlock}
`
