/**
 * Density Grid Texture Sampling
 *
 * Provides texture-based density sampling functions that read from
 * a pre-computed 3D density grid texture instead of evaluating the
 * quantum wavefunction per-pixel.
 *
 * This is the render-pass counterpart to the compute shader that
 * generates the density grid (see compute/densityGrid.wgsl.ts).
 *
 * Performance benefit:
 * - Direct: ~300-460 ops per density evaluation
 * - Texture: ~10 ops per texture sample (trilinear lookup)
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/densityGridSampling.wgsl
 */

/**
 * Bind group layout for density grid texture.
 * These bindings are added to an existing group (typically group 2 after object uniforms).
 *
 * Note: The actual binding indices depend on where these are inserted
 * in the bind group. These are typically at binding 2 and 3 after
 * SchroedingerUniforms (0) and BasisVectors (1).
 *
 * The texture uses rgba16float format:
 * - R: density (rho)
 * - G: reserved (could store log-density)
 * - B: reserved (could store phase)
 * - A: reserved
 */
export const densityGridBindingsBlock = /* wgsl */ `
// ============================================
// Density Grid Texture Bindings
// ============================================

// Pre-computed density grid from compute pass (rgba16float, trilinear filtering)
@group(2) @binding(2) var densityGridTex: texture_3d<f32>;
@group(2) @binding(3) var densityGridSampler: sampler;
`

/**
 * Density grid sampling functions.
 * These replace direct sampleDensityWithPhase() calls with texture lookups.
 */
export const densityGridSamplingBlock = /* wgsl */ `
// ============================================
// Density Grid Sampling Functions
// ============================================

/**
 * Convert world position to density grid UV coordinates.
 * Maps world space [-boundingRadius, +boundingRadius] to texture UV [0, 1].
 * Must stay in sync with DensityGridComputePass worldMin/worldMax updates.
 */
fn worldToGridUV(worldPos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  let radius = max(uniforms.boundingRadius, 1e-6);
  let minBound = vec3f(-radius);
  let maxBound = vec3f(radius);
  return (worldPos - minBound) / (maxBound - minBound);
}

/**
 * Sample density from the pre-computed 3D texture.
 * Returns the same format as sampleDensityWithPhase: vec3f(rho, logRho, phase)
 *
 * In density-only mode (r16float), phase is not stored and defaults to 0.0.
 * In phase-capable mode (rgba16float), log-density and phase are read directly.
 *
 * IMPORTANT: Uses textureSampleLevel instead of textureSample to allow
 * calling from non-uniform control flow (e.g., inside conditionals that
 * depend on per-pixel values like gradient calculations).
 */
fn sampleDensityFromGrid(worldPos: vec3f) -> vec3f {
  let uv = worldToGridUV(worldPos, schroedinger);

  // Clamp to valid range (edge clamping handled by sampler, but be safe)
  let uvClamped = clamp(uv, vec3f(0.0), vec3f(1.0));

  // Sample density payload from texture (trilinear filtering at mip level 0).
  // textureSampleLevel allows non-uniform control flow (no derivative calculation).
  let densityPayload = textureSampleLevel(densityGridTex, densityGridSampler, uvClamped, 0.0);
  let rho = densityPayload.r;
  let s = select(log(rho + 1e-8), densityPayload.g, DENSITY_GRID_HAS_PHASE);
  let phase = select(0.0, densityPayload.b, DENSITY_GRID_HAS_PHASE);

  return vec3f(rho, s, phase);
}

/**
 * Sample only density value from grid (no phase/log).
 * Faster for cases where only rho is needed.
 *
 * IMPORTANT: Uses textureSampleLevel instead of textureSample to allow
 * calling from non-uniform control flow (e.g., gradient calculations,
 * shadow sampling, AO sampling inside conditionals).
 */
fn sampleDensityOnlyFromGrid(worldPos: vec3f) -> f32 {
  let uv = worldToGridUV(worldPos, schroedinger);
  let uvClamped = clamp(uv, vec3f(0.0), vec3f(1.0));
  // textureSampleLevel allows non-uniform control flow (no derivative calculation)
  return textureSampleLevel(densityGridTex, densityGridSampler, uvClamped, 0.0).r;
}

/**
 * Compute gradient from density grid using central differences.
 * This is much cheaper than tetrahedral sampling of the wavefunction.
 */
fn computeGradientFromGrid(worldPos: vec3f, delta: f32, rhoCenter: f32) -> vec3f {
  // Central differences: gradient = (f(x+h) - f(x-h)) / (2h)
  let dx = sampleDensityOnlyFromGrid(worldPos + vec3f(delta, 0.0, 0.0)) -
           sampleDensityOnlyFromGrid(worldPos - vec3f(delta, 0.0, 0.0));
  let dy = sampleDensityOnlyFromGrid(worldPos + vec3f(0.0, delta, 0.0)) -
           sampleDensityOnlyFromGrid(worldPos - vec3f(0.0, delta, 0.0));
  let dz = sampleDensityOnlyFromGrid(worldPos + vec3f(0.0, 0.0, delta)) -
           sampleDensityOnlyFromGrid(worldPos - vec3f(0.0, 0.0, delta));

  // Scale by 1/(2*delta) and convert to log-density gradient
  // For lighting, we want gradient of log(rho), not rho itself
  let scale = 1.0 / (2.0 * delta * max(rhoCenter, 0.001));

  return vec3f(dx, dy, dz) * scale;
}

/**
 * Combined density + gradient sampling from grid.
 * Returns TetraSample-compatible result for drop-in replacement.
 *
 * Note: This function assumes TetraSample struct is defined elsewhere.
 */
fn sampleWithGradientFromGrid(worldPos: vec3f, delta: f32) -> TetraSample {
  let density = sampleDensityFromGrid(worldPos);
  let gradient = computeGradientFromGrid(worldPos, delta, density.x);

  return TetraSample(
    density.x,  // rho
    density.y,  // s (log-density)
    density.z,  // phase
    gradient    // gradient of log-density
  );
}
`

/**
 * Grid-accelerated volume raymarching.
 * Replaces sampleDensityWithPhase calls with texture lookups.
 *
 * This is a drop-in replacement for volumeRaymarch when using
 * the density grid compute pass.
 */
export const volumeRaymarchGridBlock = /* wgsl */ `
// ============================================
// Grid-Accelerated Volume Raymarching
// ============================================

/**
 * Volume raymarching using pre-computed density grid.
 * This is 3-6x faster than direct wavefunction evaluation.
 */
fn volumeRaymarchGrid(
  rayOrigin: vec3f,
  rayDir: vec3f,
  tNear: f32,
  tFar: f32,
  uniforms: SchroedingerUniforms
) -> VolumeResult {
  const EMPTY_SKIP_THRESHOLD: f32 = 1e-7;
  const EMPTY_SKIP_FACTOR: f32 = 4.0;
  const MIN_REMAINING_CONTRIBUTION: f32 = 0.001;
  const MAX_REMAINING_DENSITY_BOUND: f32 = 8.0;

  var accColor = vec3f(0.0);
  var transmittance: f32 = 1.0;
  var iterCount: i32 = 0;
  var primaryHitT: f32 = -1.0;
  let primaryHitThreshold: f32 = 0.01;

  let sampleCount = max(uniforms.sampleCount, 1);
  let stepLen = (tFar - tNear) / f32(sampleCount);
  var t = tNear;

  let animTime = getVolumeTime(uniforms);
  let viewDir = -rayDir;
  let fogColor = lighting.ambientColor * lighting.ambientIntensity;

  var lowDensityCount: i32 = 0;
  let allowEarlyExit = (uniforms.quantumMode == QUANTUM_MODE_HARMONIC);

  for (var i: i32 = 0; i < MAX_VOLUME_SAMPLES; i++) {
    if (i >= sampleCount) { break; }
    iterCount = i + 1;

    if (transmittance < MIN_TRANSMITTANCE) { break; }
    let remainingDistance = max(tFar - t, 0.0);
    let maxRemainingOpacity = 1.0 - exp(-min(uniforms.densityGain * MAX_REMAINING_DENSITY_BOUND * remainingDistance, 20.0));
    let remainingContributionBound = transmittance * maxRemainingOpacity;
    if (remainingContributionBound < MIN_REMAINING_CONTRIBUTION) { break; }

    let pos = rayOrigin + rayDir * t;

    // Sample from pre-computed density grid (FAST!)
    let densityInfo = sampleDensityFromGrid(pos);
    let rho = densityInfo.x;
    let phase = densityInfo.z;

    // Early exit if density is consistently low
    if (allowEarlyExit && rho < MIN_DENSITY) {
      lowDensityCount++;
      if (lowDensityCount > 5) { break; }
      t += stepLen;
      continue;
    } else {
      lowDensityCount = 0;
    }

    if (rho < EMPTY_SKIP_THRESHOLD) {
      let skipDistance = min(stepLen * EMPTY_SKIP_FACTOR, max(tFar - t, 0.0));
      if (skipDistance > stepLen) {
        let probeMid = sampleDensityOnlyFromGrid(pos + rayDir * (skipDistance * 0.5));
        let probeFar = sampleDensityOnlyFromGrid(pos + rayDir * skipDistance);
        if (probeMid < EMPTY_SKIP_THRESHOLD && probeFar < EMPTY_SKIP_THRESHOLD) {
          t += skipDistance;
          continue;
        }
      }
    }

    // Physically neutral nodal visualization:
    // Smooth spatial fade matching the Gaussian envelope falloff.
    // Cannot use density gating because ρ=|ψ|²≈0 at nodes by definition.
    let nodalR2Grid = dot(pos, pos);
    let nodalBoundR2Grid = uniforms.boundingRadius * uniforms.boundingRadius;
    let nodalRadialFadeGrid = 1.0 - smoothstep(0.25, 0.65, nodalR2Grid / nodalBoundR2Grid);
    if (FEATURE_NODAL && uniforms.nodalEnabled != 0u && uniforms.nodalStrength > 0.0 && nodalRadialFadeGrid > 0.01) {
      let nodal = computePhysicalNodalField(pos, animTime, uniforms);
      let fadedIntensityGrid = nodal.intensity * nodalRadialFadeGrid;
      if (fadedIntensityGrid > 1e-4) {
        let nodalColor = selectPhysicalNodalColor(uniforms, nodal.colorMode, nodal.signValue);
        let nodalAlpha = clamp(
          1.0 - exp(-max(fadedIntensityGrid * uniforms.nodalStrength, 0.0) * stepLen),
          0.0,
          1.0
        );
        if (nodalAlpha > 1e-5) {
          let nodalScattered = nodalColor * fogColor;
          accColor += transmittance * nodalAlpha * nodalScattered;
          transmittance *= (1.0 - nodalAlpha);
        }
      }
    }

    let alpha = computeAlpha(rho, stepLen, uniforms.densityGain);

    if (alpha > 0.001) {
      // Track primary hit
      if (primaryHitT < 0.0 && alpha > primaryHitThreshold) {
        primaryHitT = t;
      }

      // Compute gradient from grid (6 texture samples instead of 4 wavefunction evals)
      let gradient = computeGradientFromGrid(pos, 0.05, rho);

      // Compute emission with lighting
      let emission = computeEmissionLit(rho, phase, pos, gradient, viewDir, uniforms);

      // Front-to-back compositing
      accColor += transmittance * alpha * emission;
      transmittance *= (1.0 - alpha);
    }

    // Internal fog integration (scene atmosphere inside volume)
    let fogAlpha = computeInternalFogAlpha(stepLen, uniforms);
    if (fogAlpha > 0.0001) {
      accColor += transmittance * fogAlpha * fogColor;
      transmittance *= (1.0 - fogAlpha);
    }

    t += stepLen;
  }

  let finalAlpha = 1.0 - transmittance;

  if (primaryHitT < 0.0) {
    primaryHitT = (tNear + tFar) * 0.5;
  }

  return VolumeResult(accColor, finalAlpha, iterCount, primaryHitT);
}
`
