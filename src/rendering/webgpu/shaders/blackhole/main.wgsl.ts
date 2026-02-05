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

// Accumulate volumetric disk contribution using Beer-Lambert absorption
// Matches WebGL: density-scaled absorption for physically correct volumetric integration
fn accumulateDiskEmission(state: ptr<function, AccumulationState>, emission: vec3f, density: f32, stepSize: f32) {
  // Beer-Lambert law: absorption scales with local density (matches WebGL)
  let absorption = density * blackhole.absorption * 2.0;
  let stepTransmittance = exp(-absorption * stepSize);

  // Emission contribution: emission * stepSize * current transmittance
  let stepEmission = emission * stepSize * (*state).transmittance;
  (*state).color += stepEmission;

  // Update transmittance
  (*state).transmittance *= stepTransmittance;
}

// Bounding spheroid intersection (matches WebGL intersectSpheroid)
// Returns vec2f(near, far). If no intersection, returns vec2f(-1.0).
fn intersectSpheroid(ro: vec3f, rd: vec3f, rad: f32, yFlatten: f32) -> vec2f {
  let s = vec3f(1.0, 1.0 / yFlatten, 1.0) / rad;
  let roS = ro * s;
  let rdS = rd * s;
  let a = dot(rdS, rdS);
  let b = 2.0 * dot(roS, rdS);
  let c = dot(roS, roS) - 1.0;
  let h = b * b - 4.0 * a * c;
  if (h < 0.0) { return vec2f(-1.0); }
  let sqrtH = sqrt(h);
  return vec2f(-b - sqrtH, -b + sqrtH) / (2.0 * a);
}

// Interleaved gradient noise for dithering (matches WebGL)
fn interleavedGradientNoise(fragCoord: vec2f) -> f32 {
  let magic = vec3f(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(fragCoord, magic.xy)));
}

// Get adaptive step size based on distance from black hole
// Matches WebGL adaptiveStepSizeWithMask logic
fn getAdaptiveStep(ndRadius: f32) -> f32 {
  let rs = blackhole.horizonRadius;

  // Base step - scale with distance to allow efficient travel far from hole
  var step = blackhole.stepBase * (1.0 + ndRadius * 0.5);

  // Reduce step near horizon (gravity adaption)
  let gravityFactor = 1.0 / (1.0 + blackhole.stepAdaptG * blackhole.gravityStrength / max(ndRadius, blackhole.epsilonMul));
  step *= gravityFactor;

  // Reduce step near photon shell
  step *= getPhotonShellStepMultiplier(ndRadius);

  // Reduce step when close to horizon
  let horizonDist = max(ndRadius - rs, 0.0);
  let horizonFactor = smoothstep(0.0, rs * blackhole.stepAdaptR, horizonDist);
  step *= mix(0.1, 1.0, horizonFactor);

  // Distance-based step relaxation: allow larger steps far from black hole
  let dynamicMax = blackhole.stepMax * (1.0 + ndRadius * 0.5);

  return clamp(step, blackhole.stepMin, dynamicMax);
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
  // Compute ray direction per-pixel from NDC (not interpolated from vertices)
  // This avoids distortion from the oversized fullscreen triangle trick
  let clipPos = vec4f(input.vNDC, 1.0, 1.0);
  var viewPos = camera.inverseProjectionMatrix * clipPos;
  viewPos = viewPos / viewPos.w;
  let worldDir = normalize((camera.inverseViewMatrix * vec4f(normalize(viewPos.xyz), 0.0)).xyz);

  // Ray setup - transform to LOCAL space using inverse model matrix
  // This matches WebGL: rayOrigin = (uInverseModelMatrix * vec4(uCameraPosition, 1.0)).xyz
  var ro = (camera.inverseModelMatrix * vec4f(camera.cameraPosition, 1.0)).xyz;
  var rd = normalize((camera.inverseModelMatrix * vec4f(worldDir, 0.0)).xyz);

  // Accumulation state
  var state = initAccumulation();

  // Time for animations
  let time = camera.time * blackhole.timeScale;

  // Fragment coordinates for noise dithering
  let fragCoord = input.clipPosition.xy;

  // Pre-compute disk inner radius
  let innerR = blackhole.diskInnerR;

  // Far radius matches WebGL: uFarRadius * uHorizonRadius
  let farRadius = blackhole.farRadius * blackhole.horizonRadius;

  // Bounding spheroid intersection (matches WebGL optimization)
  // Skips empty space before the black hole region
  let cameraElevation = abs(ro.y) / max(farRadius, 0.001);
  let dynamicFlatten = mix(0.5, 1.0, smoothstep(0.3, 0.8, cameraElevation));
  let intersect = intersectSpheroid(ro, rd, farRadius, dynamicFlatten);

  // Early exit if bounding sphere is entirely behind camera
  if (intersect.y < 0.0) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }

  let tNear = max(0.0, intersect.x);

  // Dithering to hide banding (Interleaved Gradient Noise)
  let dither = interleavedGradientNoise(fragCoord + fract(time));
  let startOffset = dither * 0.1; // DITHER_JITTER_AMOUNT (matches WebGL)

  // Per-step jitter state (matches WebGL golden ratio dithering)
  var stepJitter = dither;

  // Initialize ray position at bounding volume entry (incremental tracking, matches WebGL)
  var pos = ro + rd * (tNear + startOffset);
  var dir = rd;
  var totalDist = tNear + startOffset;
  let maxDist = intersect.y; // Far intersection of bounding spheroid

  // Compute ndRadius once before loop (matches WebGL OPT-BH-1)
  var ndRadius = ndDistance(pos);

  // Pre-bend ray (initial deflection, matches WebGL)
  dir = bendRay(dir, pos, 0.1, ndRadius);

  var hitHorizon = false;

  // Main raymarch loop - incremental position tracking for correct curved ray paths
  for (var i = 0; i < blackhole.maxSteps; i++) {
    if (totalDist > maxDist) { break; }
    if (state.transmittance < blackhole.transmittanceCutoff) { break; }

    // ndRadius is already computed (from pre-loop or previous iteration's post-step)

    // Check event horizon - absorb all light (matches WebGL)
    if (isInsideHorizon(ndRadius)) {
      state.transmittance = 0.0;
      state.shellAccum = vec3f(0.0); // Clear shell glow for pure black horizon
      hitHorizon = true;
      break;
    }

    // Adaptive step size
    var stepSize = getAdaptiveStep(ndRadius);

    // Pre-compute radial distance in XZ plane (disk plane)
    let diskR = length(pos.xz);
    let diskH = abs(pos.y);

    // Importance sampling: reduce step size near the disk midplane
    // (matches WebGL OPT-BH-28 importance sampling)
    if (diskR > blackhole.diskInnerR * 0.5 && diskR < blackhole.diskOuterR * 1.5) {
      let diskThickness = blackhole.manifoldThickness * blackhole.horizonRadius;
      let importance = 1.0 + 1.5 * smoothstep(2.0, 0.0, diskH / max(diskThickness, 0.001));
      stepSize /= importance;
    }

    // Per-step jitter (golden ratio low-discrepancy sequence)
    stepJitter = fract(stepJitter + 0.618033988749);
    let jitterScale = (stepJitter - 0.5) * 0.4;
    stepSize *= (1.0 + jitterScale);

    // Apply gravitational lensing BEFORE stepping (matches WebGL)
    dir = bendRay(dir, pos, stepSize, ndRadius);

    // Advance ray position incrementally (NOT from origin — follows curved path)
    pos += dir * stepSize;
    totalDist += stepSize;

    // Recompute ndRadius at new position (matches WebGL OPT-BH-1)
    ndRadius = ndDistance(pos);

    // Immediate post-step horizon check (matches WebGL)
    // Catches rays that cross the horizon boundary in a single step
    if (isInsideHorizon(ndRadius)) {
      state.transmittance = 0.0;
      state.shellAccum = vec3f(0.0);
      hitHorizon = true;
      break;
    }

    // === VOLUMETRIC ACCRETION DISK (sample at NEW position) ===
    let newDiskR = length(pos.xz);
    let density = getDiskDensity(pos, time, newDiskR, fragCoord);

    if (density > 0.001) {
      // Calculate normal if needed for coloring
      var diskNormal = vec3f(0.0, 1.0, 0.0);
      if (blackhole.lightingMode == 1 || blackhole.colorAlgorithm == 3) { // ALGO_NORMAL
        diskNormal = computeVolumetricDiskNormal(pos, dir);
      }

      // Calculate emission with Doppler and temperature effects
      let emission = getDiskEmission(pos, density, time, dir, diskNormal, newDiskR, innerR);

      // Accumulate volumetric contribution (pass density for Beer-Lambert absorption)
      accumulateDiskEmission(&state, emission, density, stepSize);

      state.diskHits += 1;
    }

    // Photon shell glow
    let shellGlow = getPhotonShellGlow(ndRadius, dir, pos);
    state.shellAccum += shellGlow * state.transmittance * stepSize;
  }

  // Combine contributions
  var finalColor = state.color + state.shellAccum;

  // Apply bloom boost for HDR
  finalColor *= blackhole.bloomBoost;

  // Alpha from transmittance (matches WebGL):
  // - transmittance=0 (hit horizon or opaque disk) → alpha=1 (fully opaque)
  // - transmittance=1 (ray missed everything) → alpha=0 (fully transparent, show sky)
  let alpha = 1.0 - state.transmittance;

  return vec4f(finalColor, alpha);
}
`

/**
 * Legacy export for backwards compatibility.
 * Both mainBlock and mainBlockWithEnvMap now export the same unified code.
 * The USE_ENVMAP constant controls behavior at compile time.
 */
export const mainBlockWithEnvMap = mainBlock
