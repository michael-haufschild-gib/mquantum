/**
 * WGSL Black Hole Main Shader
 *
 * Port of GLSL blackhole/main.glsl to WGSL.
 * Main raymarching loop with gravitational lensing.
 *
 * @module rendering/webgpu/shaders/blackhole/main.wgsl
 */

export const mainBlock = /* wgsl */ `
// ============================================
// Black Hole Main Raymarcher
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

// Accumulate disk hit contribution
fn accumulateDiskHit(state: ptr<function, AccumulationState>, hitColor: vec3f) {
  (*state).color += hitColor * (*state).transmittance;
  (*state).diskHits += 1;
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

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // Ray setup
  var ro = camera.cameraPosition;
  var rd = normalize(input.vPosition - camera.cameraPosition);

  // Accumulation state
  var state = initAccumulation();

  // Previous position for disk crossing detection
  var prevPos = ro;

  // Time for animations
  let time = camera.time * blackhole.timeScale;

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

    // Detect disk crossings
    let crossing = detectDiskCrossing(prevPos, pos);
    if (crossing.w > 0.5) {
      // Disk crossing detected
      let hitColor = shadeDiskHit(crossing.xyz, rd, state.diskHits, time);

      // Apply Doppler if enabled
      var finalHitColor = hitColor;
      if (blackhole.dopplerEnabled != 0u) {
        let dopplerFac = dopplerFactor(crossing.xyz, rd);
        finalHitColor = applyDopplerShift(hitColor, dopplerFac);
      }

      accumulateDiskHit(&state, finalHitColor);

      // Absorption
      if (blackhole.enableAbsorption != 0u) {
        state.transmittance *= exp(-blackhole.absorption * stepSize);
      }
    }

    // Photon shell glow
    let shellGlow = getPhotonShellGlow(ndRadius, rd, pos);
    state.shellAccum += shellGlow * state.transmittance * stepSize;

    // Apply gravitational lensing (bend the ray)
    rd = bendRay(rd, pos, stepSize, ndRadius);

    // Save previous position
    prevPos = pos;

    // Advance ray
    totalDist += stepSize;
  }

  // Combine contributions
  var finalColor = state.color + state.shellAccum;

  // Background (environment map or black)
  if (state.transmittance > 0.01) {
    // Sample environment if available
    var bgColor = vec3f(0.0);
    if (blackhole.envMapReady > 0.5) {
      // Would sample environment map here
      // bgColor = textureSample(envMap, envMapSampler, rd).rgb;
    }
    finalColor += bgColor * state.transmittance;
  }

  // Apply bloom boost for HDR
  finalColor *= blackhole.bloomBoost;

  return vec4f(finalColor, 1.0);
}
`

/**
 * Main block with environment map support.
 */
export const mainBlockWithEnvMap = /* wgsl */ `
// ============================================
// Black Hole Main Raymarcher (with Environment Map)
// ============================================

struct AccumulationState {
  color: vec3f,
  transmittance: f32,
  shellAccum: vec3f,
  diskHits: i32,
}

fn initAccumulation() -> AccumulationState {
  var state: AccumulationState;
  state.color = vec3f(0.0);
  state.transmittance = 1.0;
  state.shellAccum = vec3f(0.0);
  state.diskHits = 0;
  return state;
}

fn accumulateDiskHit(state: ptr<function, AccumulationState>, hitColor: vec3f) {
  (*state).color += hitColor * (*state).transmittance;
  (*state).diskHits += 1;
}

fn getAdaptiveStep(ndRadius: f32) -> f32 {
  let rs = blackhole.horizonRadius;
  var step = blackhole.stepBase;
  let horizonProximity = ndRadius / rs;
  if (horizonProximity < 3.0) {
    let t = smoothstep(1.0, 3.0, horizonProximity);
    step = mix(blackhole.stepMin, step, t);
  }
  step *= getPhotonShellStepMultiplier(ndRadius);
  step = clamp(step, blackhole.stepMin, blackhole.stepMax);
  return step;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  var ro = camera.cameraPosition;
  var rd = normalize(input.vPosition - camera.cameraPosition);

  var state = initAccumulation();
  var prevPos = ro;
  let time = camera.time * blackhole.timeScale;

  var totalDist = 0.0;
  for (var i = 0; i < blackhole.maxSteps; i++) {
    let pos = ro + rd * totalDist;
    let ndRadius = ndDistance(pos);

    if (isInsideHorizon(ndRadius)) {
      state.color = vec3f(0.0);
      break;
    }

    if (ndRadius > blackhole.farRadius) {
      break;
    }

    if (state.transmittance < blackhole.transmittanceCutoff) {
      break;
    }

    let stepSize = getAdaptiveStep(ndRadius);

    let crossing = detectDiskCrossing(prevPos, pos);
    if (crossing.w > 0.5) {
      let hitColor = shadeDiskHit(crossing.xyz, rd, state.diskHits, time);
      var finalHitColor = hitColor;
      if (blackhole.dopplerEnabled != 0u) {
        let dopplerFac = dopplerFactor(crossing.xyz, rd);
        finalHitColor = applyDopplerShift(hitColor, dopplerFac);
      }
      accumulateDiskHit(&state, finalHitColor);
      if (blackhole.enableAbsorption != 0u) {
        state.transmittance *= exp(-blackhole.absorption * stepSize);
      }
    }

    let shellGlow = getPhotonShellGlow(ndRadius, rd, pos);
    state.shellAccum += shellGlow * state.transmittance * stepSize;

    rd = bendRay(rd, pos, stepSize, ndRadius);
    prevPos = pos;
    totalDist += stepSize;
  }

  var finalColor = state.color + state.shellAccum;

  // Sample environment map for background
  if (state.transmittance > 0.01) {
    let bgColor = textureSample(envMap, envMapSampler, rd).rgb;
    finalColor += bgColor * state.transmittance;
  }

  finalColor *= blackhole.bloomBoost;

  return vec4f(finalColor, 1.0);
}
`
