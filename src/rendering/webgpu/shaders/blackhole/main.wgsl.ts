/**
 * WGSL Black Hole Main Shader
 *
 * Port of GLSL blackhole/main.glsl to WGSL.
 * Main raymarching loop with gravitational lensing and volumetric accretion disk.
 *
 * @module rendering/webgpu/shaders/blackhole/main.wgsl
 */

/**
 * Shared helper functions for the main raymarcher.
 */
export const mainHelpersBlock = /* wgsl */ `
// ============================================
// Black Hole Main Raymarcher - Helpers
// ============================================

struct AccumulationState {
  color: vec3f,
  transmittance: f32,
  shellAccum: vec3f,
  diskHits: i32,
}

// Initialize accumulation state
fn initAccumulation() -> AccumulationState {
  var state: AccumulationState;
  state.color = vec3f(0.0);
  state.transmittance = 1.0;
  state.shellAccum = vec3f(0.0);
  state.diskHits = 0;
  return state;
}

// Accumulate volumetric disk contribution
fn accumulateDiskEmission(state: ptr<function, AccumulationState>, emission: vec3f, stepSize: f32) {
  // Volumetric accumulation with absorption
  (*state).color += emission * (*state).transmittance * stepSize;

  // Apply absorption if enabled
  if (blackhole.enableAbsorption != 0u) {
    (*state).transmittance *= exp(-blackhole.absorption * stepSize);
  }
}

// Get adaptive step size based on distance from black hole
fn getAdaptiveStep(ndRadius: f32) -> f32 {
  let rs = blackhole.horizonRadius;

  // Base step size
  var step = blackhole.stepBase;

  // Reduce step size near horizon for accuracy
  let horizonProximity = ndRadius / rs;
  if (horizonProximity < 3.0) {
    let t = smoothstep(1.0, 3.0, horizonProximity);
    step = mix(blackhole.stepMin, step, t);
  }

  // Further reduce near photon shell
  step *= getPhotonShellStepMultiplier(ndRadius);

  // Clamp to bounds
  step = clamp(step, blackhole.stepMin, blackhole.stepMax);

  return step;
}
`

/**
 * Main fragment shader - uses volumetric raymarching for accretion disk.
 * Uses USE_ENVMAP constant for conditional env map sampling.
 */
export const mainBlock = /* wgsl */ `
// ============================================
// Black Hole Main Raymarcher - Fragment
// ============================================

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // Ray setup - direction comes from vertex shader (fullscreen quad)
  var ro = camera.cameraPosition;
  var rd = normalize(input.vRayDir);

  // Accumulation state
  var state = initAccumulation();

  // Time for animations
  let time = camera.time * blackhole.timeScale;

  // Fragment coordinates for noise dithering
  let fragCoord = input.clipPosition.xy;

  // Pre-compute disk inner radius
  let innerR = blackhole.diskInnerR;

  // Raymarch loop
  var totalDist = 0.0;
  for (var i = 0; i < blackhole.maxSteps; i++) {
    // Current position
    let pos = ro + rd * totalDist;

    // N-dimensional radius
    let ndRadius = ndDistance(pos);

    // Check event horizon
    if (isInsideHorizon(ndRadius)) {
      // Ray absorbed by black hole
      state.color = vec3f(0.0);
      state.transmittance = 0.0;
      break;
    }

    // Check far radius
    if (ndRadius > blackhole.farRadius) {
      break;
    }

    // Early exit based on transmittance
    if (state.transmittance < blackhole.transmittanceCutoff) {
      break;
    }

    // Adaptive step size
    let stepSize = getAdaptiveStep(ndRadius);

    // === VOLUMETRIC ACCRETION DISK ===
    // Pre-compute radial distance in XZ plane (disk plane)
    let diskR = length(pos.xz);

    // Sample disk density at current position
    let density = getDiskDensity(pos, time, diskR, fragCoord);

    if (density > 0.001) {
      // Calculate normal if needed for coloring
      var diskNormal = vec3f(0.0, 1.0, 0.0);
      if (blackhole.lightingMode == 1 || blackhole.colorAlgorithm == 3) { // ALGO_NORMAL
        diskNormal = computeVolumetricDiskNormal(pos, rd);
      }

      // Calculate emission with Doppler and temperature effects
      let emission = getDiskEmission(pos, density, time, rd, diskNormal, diskR, innerR);

      // Accumulate volumetric contribution
      accumulateDiskEmission(&state, emission, stepSize);

      state.diskHits += 1;
    }

    // Photon shell glow
    let shellGlow = getPhotonShellGlow(ndRadius, rd, pos);
    state.shellAccum += shellGlow * state.transmittance * stepSize;

    // Apply gravitational lensing (bend the ray)
    rd = bendRay(rd, pos, stepSize, ndRadius);

    // Advance ray
    totalDist += stepSize;
  }

  // Combine contributions
  var finalColor = state.color + state.shellAccum;

  // Background - sample environment map if enabled and available
  if (state.transmittance > 0.01) {
    if (USE_ENVMAP) {
      // Environment map is bound - sample it
      let bgColor = textureSample(envMap, envMapSampler, rd).rgb;
      finalColor += bgColor * state.transmittance;
    }
    // Without environment map, background is black (already 0)
  }

  // Apply bloom boost for HDR
  finalColor *= blackhole.bloomBoost;

  return vec4f(finalColor, 1.0);
}
`

/**
 * Legacy export for backwards compatibility.
 * Both mainBlock and mainBlockWithEnvMap now export the same unified code.
 * The USE_ENVMAP constant controls behavior at compile time.
 */
export const mainBlockWithEnvMap = mainBlock
