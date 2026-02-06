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

// Grid parameters (must match compute shader)
const DENSITY_GRID_MIN: vec3f = vec3f(-2.0, -2.0, -2.0);
const DENSITY_GRID_MAX: vec3f = vec3f(2.0, 2.0, 2.0);
const DENSITY_GRID_SIZE: vec3f = vec3f(64.0, 64.0, 64.0);
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
 * Maps world space [-2, 2] to texture UV [0, 1].
 */
fn worldToGridUV(worldPos: vec3f) -> vec3f {
  return (worldPos - DENSITY_GRID_MIN) / (DENSITY_GRID_MAX - DENSITY_GRID_MIN);
}

/**
 * Sample density from the pre-computed 3D texture.
 * Returns the same format as sampleDensityWithPhase: vec3f(rho, logRho, phase)
 *
 * Note: Phase is currently not stored in the texture (r32float format).
 * Returns 0.0 for phase - if phase-based coloring is needed, either:
 * 1. Use rgba32float texture format
 * 2. Compute phase separately at lower cost
 *
 * IMPORTANT: Uses textureSampleLevel instead of textureSample to allow
 * calling from non-uniform control flow (e.g., inside conditionals that
 * depend on per-pixel values like gradient calculations).
 */
fn sampleDensityFromGrid(worldPos: vec3f) -> vec3f {
  let uv = worldToGridUV(worldPos);

  // Clamp to valid range (edge clamping handled by sampler, but be safe)
  let uvClamped = clamp(uv, vec3f(0.0), vec3f(1.0));

  // Sample density from texture (trilinear filtering at mip level 0)
  // textureSampleLevel allows non-uniform control flow (no derivative calculation)
  let rho = textureSampleLevel(densityGridTex, densityGridSampler, uvClamped, 0.0).r;

  // Compute log-density for consistency with direct path
  let s = log(rho + 1e-8);

  // Phase not available in r32float texture - return 0
  // For phase-based coloring, use rgba32float format and store it
  let phase = 0.0;

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
  let uv = worldToGridUV(worldPos);
  let uvClamped = clamp(uv, vec3f(0.0), vec3f(1.0));
  // textureSampleLevel allows non-uniform control flow (no derivative calculation)
  return textureSampleLevel(densityGridTex, densityGridSampler, uvClamped, 0.0).r;
}

/**
 * Compute gradient from density grid using central differences.
 * This is much cheaper than tetrahedral sampling of the wavefunction.
 */
fn computeGradientFromGrid(worldPos: vec3f, delta: f32) -> vec3f {
  // Central differences: gradient = (f(x+h) - f(x-h)) / (2h)
  let dx = sampleDensityOnlyFromGrid(worldPos + vec3f(delta, 0.0, 0.0)) -
           sampleDensityOnlyFromGrid(worldPos - vec3f(delta, 0.0, 0.0));
  let dy = sampleDensityOnlyFromGrid(worldPos + vec3f(0.0, delta, 0.0)) -
           sampleDensityOnlyFromGrid(worldPos - vec3f(0.0, delta, 0.0));
  let dz = sampleDensityOnlyFromGrid(worldPos + vec3f(0.0, 0.0, delta)) -
           sampleDensityOnlyFromGrid(worldPos - vec3f(0.0, 0.0, delta));

  // Scale by 1/(2*delta) and convert to log-density gradient
  // For lighting, we want gradient of log(rho), not rho itself
  let rhoCenter = sampleDensityOnlyFromGrid(worldPos);
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
  let gradient = computeGradientFromGrid(worldPos, delta);

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

    // Physically grounded nodal overlay (consistent with direct-sampling paths).
    if (uniforms.nodalEnabled != 0u && uniforms.nodalStrength > 0.0) {
      let nodal = computePhysicalNodalField(pos, animTime, uniforms);
      if (nodal.intensity > 1e-4) {
        let nodalColor = selectPhysicalNodalColor(uniforms, nodal.colorMode, nodal.signValue);
        let nodalAlpha = clamp(nodal.intensity * uniforms.nodalStrength * stepLen * 2.5, 0.0, 1.0);
        accColor += transmittance * nodalAlpha * nodalColor;
      }
    }

    let alpha = computeAlpha(rho, stepLen, uniforms.densityGain);

    if (alpha > 0.001) {
      // Track primary hit
      if (primaryHitT < 0.0 && alpha > primaryHitThreshold) {
        primaryHitT = t;
      }

      // Compute gradient from grid (6 texture samples instead of 4 wavefunction evals)
      let gradient = computeGradientFromGrid(pos, 0.05);

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
