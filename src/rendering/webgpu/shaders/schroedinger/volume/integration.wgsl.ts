/**
 * WGSL Volume integration loop for Schrödinger density field
 *
 * Performs front-to-back compositing along rays through the volume.
 * Uses Beer-Lambert absorption and emission accumulation.
 *
 * Key optimizations:
 * - Early ray termination when transmittance is low
 * - Adaptive step size based on density
 * - Gaussian bounds allow aggressive culling
 *
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/integration.wgsl
 */

/**
 * Tetrahedral gradient sampling - shared between isosurface and volumetric modes.
 * Extracted so both rendering paths can compute surface/volume normals.
 */
export const volumeGradientBlock = /* wgsl */ `
// ============================================
// Tetrahedral Gradient Sampling
// ============================================
// Uses symmetric 4-point stencil for combined density+gradient computation
// More accurate than forward differences (O(h^2) vs O(h)) with same sample count

// Tetrahedral stencil vertices (regular tetrahedron, equidistant from origin)
// Normalized to unit distance: each vertex is 1/sqrt(3) from origin
const TETRA_V0: vec3f = vec3f(1.0, 1.0, -1.0) * 0.5773503;
const TETRA_V1: vec3f = vec3f(1.0, -1.0, 1.0) * 0.5773503;
const TETRA_V2: vec3f = vec3f(-1.0, 1.0, 1.0) * 0.5773503;
const TETRA_V3: vec3f = vec3f(-1.0, -1.0, -1.0) * 0.5773503;

// Result structure for combined density+gradient sampling
struct TetraSample {
  rho: f32,       // Probability density (averaged from 4 samples)
  s: f32,         // Log-density (averaged)
  phase: f32,     // Spatial phase (averaged)
  gradient: vec3f // Gradient of log-density
}

/**
 * Combined density+gradient via tetrahedral finite differences.
 * Samples 4 points in symmetric tetrahedral pattern.
 * Returns: averaged density/phase at center + O(h^2) accurate gradient.
 */
fn sampleWithTetrahedralGradient(pos: vec3f, t: f32, delta: f32, uniforms: SchroedingerUniforms) -> TetraSample {
  // Sample at 4 tetrahedral vertices
  let d0 = sampleDensityWithPhase(pos + TETRA_V0 * delta, t, uniforms);
  let d1 = sampleDensityWithPhase(pos + TETRA_V1 * delta, t, uniforms);
  let d2 = sampleDensityWithPhase(pos + TETRA_V2 * delta, t, uniforms);
  let d3 = sampleDensityWithPhase(pos + TETRA_V3 * delta, t, uniforms);

  // Average for center approximation
  let rho = (d0.x + d1.x + d2.x + d3.x) * 0.25;
  let s = (d0.y + d1.y + d2.y + d3.y) * 0.25;
  let phase = (d0.z + d1.z + d2.z + d3.z) * 0.25;

  // Gradient from tetrahedral stencil (scale factor: 3/(4*delta) = 0.75/delta)
  let grad = (TETRA_V0 * d0.y + TETRA_V1 * d1.y +
              TETRA_V2 * d2.y + TETRA_V3 * d3.y) * (0.75 / delta);

  return TetraSample(rho, s, phase, grad);
}

/**
 * Convenience function: gradient-only (for cold path where density already known).
 * Still uses 4 tetrahedral samples for symmetric O(h^2) accuracy.
 */
fn computeGradientTetrahedral(pos: vec3f, t: f32, delta: f32, uniforms: SchroedingerUniforms) -> vec3f {
  let s0 = sFromRho(sampleDensity(pos + TETRA_V0 * delta, t, uniforms));
  let s1 = sFromRho(sampleDensity(pos + TETRA_V1 * delta, t, uniforms));
  let s2 = sFromRho(sampleDensity(pos + TETRA_V2 * delta, t, uniforms));
  let s3 = sFromRho(sampleDensity(pos + TETRA_V3 * delta, t, uniforms));

  return (TETRA_V0 * s0 + TETRA_V1 * s1 + TETRA_V2 * s2 + TETRA_V3 * s3) * (0.75 / delta);
}

`

/**
 * Core volume integration block: constants, VolumeResult struct, shared helpers.
 * Always included for 3D rendering. Struct definitions (NodalSample, NodalSurfaceHit)
 * remain here so both real and stub blocks can reference them.
 */
export const volumeIntegrationBlock = /* wgsl */ `
// ============================================
// Volume Integration (Beer-Lambert Compositing)
// ============================================

// Maximum samples per ray (iteration budget, clamped by sampleCount from uniforms)
const MAX_VOLUME_SAMPLES: i32 = 128;

// 1% remaining transmittance → max 2.56/256 sRGB levels → below quantization noise.
// Conservative 2.5× margin over minimum perceptible delta (1/255 ≈ 0.004).
const MIN_TRANSMITTANCE: f32 = 0.01;

// Minimum density to consider for accumulation (below f32 precision for alpha)
const MIN_DENSITY: f32 = 1e-8;
// At ρ=1e-7 for Gaussian ψ: r≈4σ (deep tail). 2-point probe guards against missed spikes.
const EMPTY_SKIP_THRESHOLD: f32 = 1e-7;
// 4× step at ρ<1e-7: alpha contribution ≈ σ·1e-7·4·stepLen ≈ 8e-9·σ. Sub-pixel.
const EMPTY_SKIP_FACTOR: f32 = 4.0;
// transmittance × max_remaining_alpha at this threshold < 0.1%. Below 8-bit precision.
const MIN_REMAINING_CONTRIBUTION: f32 = 0.001;
// Upper ρ bound for early-exit estimate. Normalized HO peak ≈ 1/(π^1.5) ≈ 0.18;
// high-n hydrogen peaks ≈ 2-5. 8.0 provides ≥1.5× safety margin. (computeAlpha clamps at 10.)
const MAX_REMAINING_DENSITY_BOUND: f32 = 8.0;

// Note: QUANTUM_MODE_* constants defined in uniforms.wgsl.ts

// Result structure for volume raymarching
// Contains fields for temporal reprojection support
struct VolumeResult {
  color: vec3f,
  alpha: f32,
  iterationCount: i32,   // Number of iterations performed (for debug visualization)
  primaryHitT: f32,      // Model-space ray distance to first significant density hit (for temporal reprojection)
}

/**
 * Compute time value for animation.
 */
fn getVolumeTime(uniforms: SchroedingerUniforms) -> f32 {
  return uniforms.time * uniforms.timeScale;
}

/**
 * Apply density contrast sharpening via smoothstep sigmoid transfer function.
 * Uses smoothstep(0, width, normalized) where width = 1/contrast.
 *
 * Effect: mid-range densities are BOOSTED toward peak (lobes stay same size),
 * while very low tail densities are suppressed to zero (kills blur/noise).
 * This creates a sharper opaque→transparent transition at lobe boundaries
 * without shrinking the visible lobe extent.
 *
 * contrast=1.0: smoothstep with width=1.0 (gentle S-curve sharpening)
 * contrast=1.5: width=0.67, saturates above 67% of peak
 * contrast=2.0: moderate (width=0.50, saturates above 50% of peak)
 * contrast=3.0: aggressive (width=0.33, saturates above 33% of peak)
 */
fn applyDensityContrast(rho: f32, uniforms: SchroedingerUniforms) -> f32 {
  if (uniforms.peakDensity <= 0.0) { return rho; }
  let normalized = clamp(rho / uniforms.peakDensity, 0.0, 1.0);
  let width = 1.0 / uniforms.densityContrast;
  return smoothstep(0.0, width, normalized) * uniforms.peakDensity;
}

// ============================================
// Shared Structs (used by nodal + probability current + stubs)
// ============================================

struct NodalSample {
  intensity: f32,
  signValue: f32,
  colorMode: i32,
  envelopeWeight: f32,
}

struct NodalScalarSample {
  value: f32,
  signValue: f32,
  amplitude: f32,
  colorMode: i32,
}

struct NodalSurfaceHit {
  hitMask: f32,
  t: f32,
  signValue: f32,
  colorMode: i32,
  normal: vec3f,
  _pad: f32,
}

// Combined nodal + gradient result (performance: shares tetrahedral samples)
struct NodalWithGradient {
  nodal: NodalSample,
  gradient: vec3f, // Density gradient from same tetrahedral psi samples
  rho: f32,        // Average density
  s: f32,          // Average log-density
}

struct QuantumBackreactionMetric {
  position: vec3f,
  caustic: f32,
}

struct BilocalERBridgeTopology {
  position: vec3f,
  gain: f32,
}

struct EntropicTimeShearResult {
  position: vec3f,
  entropyGain: f32,
}

struct SpectralDimensionFlowResult {
  position: vec3f,
  emissionGain: f32,
  opacityScale: f32,
  spectralDimension: f32,
  uvGate: f32,
}

struct VacuumBubbleLensResult {
  position: vec3f,
  emissionGain: f32,
  opacityScale: f32,
  wall: f32,
  tunnelingGate: f32,
}

// Per-step gradient cache used to share one computeAnalyticalGradient /
// computeGradientTetrahedral call across multiple effects (backreaction,
// entropy shear, spectral flow, born-null weave, final emission lighting).
// The position-equality check is exact; any actual warp invalidates it
// because samplePos is a fresh vec3f after each warp branch.
struct GradientCache {
  gradient: vec3f,
  pos: vec3f,
  valid: bool,
}

fn ensureGradient(
  pos: vec3f,
  animTime: f32,
  uniforms: SchroedingerUniforms,
  cache: ptr<function, GradientCache>,
) -> vec3f {
  if ((*cache).valid && all(pos == (*cache).pos)) {
    return (*cache).gradient;
  }
  var grad: vec3f;
  if (USE_ANALYTICAL_GRADIENT) {
    grad = computeAnalyticalGradient(pos, animTime, uniforms);
  } else {
    grad = computeGradientTetrahedral(pos, animTime, 0.05, uniforms);
  }
  (*cache).gradient = grad;
  (*cache).pos = pos;
  (*cache).valid = true;
  return grad;
}

fn isQuantumBackreactionActive(uniforms: SchroedingerUniforms) -> bool {
  return uniforms.quantumBackreactionLensingEnabled != 0u
    && uniforms.quantumBackreactionLensingStrength > 0.0;
}

fn isBilocalERBridgeActive(uniforms: SchroedingerUniforms) -> bool {
  return uniforms.bilocalERBridgeEnabled != 0u
    && uniforms.bilocalERBridgeStrength > 0.0
    && uniforms.bilocalERBridgeThroatRadius > 0.0;
}

fn isEntropicTimeShearActive(uniforms: SchroedingerUniforms) -> bool {
  return uniforms.entropicTimeShearEnabled != 0u
    && uniforms.entropicTimeShearStrength > 0.0
    && uniforms.entropicTimeShearFilamentScale > 0.0;
}

fn isSpectralDimensionFlowActive(uniforms: SchroedingerUniforms) -> bool {
  return uniforms.spectralDimensionFlowEnabled != 0u
    && uniforms.spectralDimensionFlowStrength > 0.0
    && uniforms.spectralDimensionFlowDiffusionScale > 0.0;
}

fn isVacuumBubbleLensActive(uniforms: SchroedingerUniforms) -> bool {
  return uniforms.vacuumBubbleLensEnabled != 0u
    && uniforms.vacuumBubbleLensStrength > 0.0
    && uniforms.vacuumBubbleWallRadius > 0.0
    && uniforms.vacuumBubbleWallThickness > 0.0;
}

fn applyVacuumBubbleLens(
  worldPosition: vec3f,
  rayDirection: vec3f,
  uniforms: SchroedingerUniforms
) -> VacuumBubbleLensResult {
  if (!isVacuumBubbleLensActive(uniforms)) {
    return VacuumBubbleLensResult(worldPosition, 1.0, 1.0, 0.0, 0.0);
  }

  let boundingRadius = max(uniforms.boundingRadius, 1e-4);
  let strength = clamp(uniforms.vacuumBubbleLensStrength, 0.0, 2.0);
  let strengthBound = clamp(strength, 0.0, 1.0);
  let wallRadius = clamp(uniforms.vacuumBubbleWallRadius, 0.05, 1.5);
  let wallThickness = clamp(uniforms.vacuumBubbleWallThickness, 0.02, 0.5);
  let tension = clamp(uniforms.vacuumBubbleTension, 0.0, 3.0);
  let bias = clamp(uniforms.vacuumBubbleBias, 0.0, 3.0);
  let r = length(worldPosition);
  let R = wallRadius * boundingRadius * (1.0 + 0.12 * sin(getVolumeTime(uniforms) * (0.35 + bias)));
  let thickness = max(wallThickness * boundingRadius, 1e-4);
  let wallCoordinate = (r - R) / thickness;
  let wall = exp(-(wallCoordinate * wallCoordinate));
  let inside = 1.0 - smoothstep(R - thickness, R + thickness, r);
  let S_proxy = tension * R * R - bias * R * R * R;
  let normalizedAction = S_proxy / max(boundingRadius * boundingRadius, 1e-4);
  let tunnelingGate = clamp(
    exp(-max(normalizedAction, 0.0)) * (1.0 + 0.35 * max(-normalizedAction, 0.0)),
    0.0,
    1.0
  );
  let radialNormal = select(
    worldPosition / max(r, 1e-5),
    normalize(-rayDirection),
    r < 1e-5
  );
  let refraction = clamp(wall * strength * tunnelingGate * thickness * 0.65, 0.0, boundingRadius * 0.18);
  let refractedPosition = worldPosition - radialNormal * refraction;
  let opacityScale = mix(1.0, 0.55, clamp(inside * strengthBound, 0.0, 1.0));
  let emissionGain = 1.0 + wall * tunnelingGate * strength;

  return VacuumBubbleLensResult(refractedPosition, emissionGain, opacityScale, wall, tunnelingGate);
}

fn applySpectralDimensionFlow(
  worldPosition: vec3f,
  rayDirection: vec3f,
  densityProxy: f32,
  logDensityProxy: f32,
  localGradient: vec3f,
  uniforms: SchroedingerUniforms
) -> SpectralDimensionFlowResult {
  if (!isSpectralDimensionFlowActive(uniforms)) {
    return SpectralDimensionFlowResult(worldPosition, 1.0, 1.0, 0.0, 0.0);
  }

  let peakRho = max(uniforms.peakDensity, 1e-6);
  let strength = clamp(uniforms.spectralDimensionFlowStrength, 0.0, 2.0);
  let diffusionScale = clamp(uniforms.spectralDimensionFlowDiffusionScale, 0.05, 3.0);
  let gradientMagnitude = length(localGradient);
  let gradientCurvature = log(1.0 + gradientMagnitude * diffusionScale);
  let densityGate =
    smoothstep(-14.0, -2.0, logDensityProxy) *
    (1.0 - smoothstep(1.5, 8.0, densityProxy / peakRho));
  let uvGate = clamp(densityGate * gradientCurvature * strength, 0.0, 1.0);

  let isAnalyticMode =
    uniforms.quantumMode == 0
    || uniforms.quantumMode == 1
    || uniforms.quantumMode == 7
    || uniforms.quantumMode == 8;
  let dIR = select(4.0, 3.0, isAnalyticMode);
  let dUV = clamp(uniforms.spectralDimensionFlowUvDimension, 1.2, 3.5);
  let spectralDimension = mix(dIR, dUV, uvGate);
  let dimensionDrop = clamp((dIR - spectralDimension) / max(dIR, 1e-6), 0.0, 0.75);

  let gradN = select(
    localGradient / max(gradientMagnitude, 1e-6),
    normalize(-rayDirection),
    gradientMagnitude < 1e-6
  );
  let compressionFactor = clamp(dimensionDrop * (0.35 + 0.15 * strength), 0.0, 0.42);
  let maxShift = diffusionScale * 0.32 + 0.08;
  let projectedCoordinate = dot(worldPosition, gradN);
  // PERF: damp the position warp to exactly zero in low-effect regions so the
  // raymarcher's downstream length(pos - beforeSpectralFlow) > 1e-6 check
  // skips the per-step density resample. Peer warp effects (backreaction,
  // vacuum bubble, bilocal bridge) all return worldPosition unchanged below
  // their locality gates; spectral flow's gates are by-design loose ("running
  // spectral dimension applies everywhere"), so without this ramp it triggers
  // a full resample on every visible step, dominating frame time. The
  // smoothstep [0.02, 0.08] avoids a banding seam at the gate boundary.
  let shiftRamp = smoothstep(0.02, 0.08, dimensionDrop);
  let compressionShift = clamp(projectedCoordinate * compressionFactor * shiftRamp, -maxShift, maxShift);
  let compressedPosition = worldPosition - gradN * compressionShift;

  let emissionGain = 1.0 + dimensionDrop * strength * (0.45 + 0.35 * uvGate);
  let opacityScale = clamp(1.0 - dimensionDrop * (0.35 + 0.25 * uvGate), 0.35, 1.0);
  return SpectralDimensionFlowResult(
    compressedPosition,
    emissionGain,
    opacityScale,
    spectralDimension,
    uvGate
  );
}

fn entropyShearFilamentField(worldPosition: vec3f, phase: f32, uniforms: SchroedingerUniforms) -> vec3f {
  let scale = clamp(uniforms.entropicTimeShearFilamentScale, 0.1, 4.0);
  let spatialFrequency = 6.2831853 / scale;
  let p = worldPosition * spatialFrequency;
  let t = getVolumeTime(uniforms) * 0.37;
  let a = sin(dot(p, vec3f(0.73, 1.19, 0.41)) + phase + t);
  let b = cos(dot(p, vec3f(-0.37, 0.67, 1.31)) - phase * 0.5 - t * 0.7);
  let c = sin(dot(p, vec3f(1.11, -0.29, 0.83)) + a * b + t * 1.3);
  return vec3f(a, b, c);
}

fn applyEntropicTimeShear(
  worldPosition: vec3f,
  rayDirection: vec3f,
  densityProxy: f32,
  logDensityProxy: f32,
  phaseProxy: f32,
  localGradient: vec3f,
  uniforms: SchroedingerUniforms
) -> EntropicTimeShearResult {
  if (!isEntropicTimeShearActive(uniforms)) {
    return EntropicTimeShearResult(worldPosition, 0.0);
  }

  let rayN = normalize(rayDirection);
  let gradMag = length(localGradient);
  let gradN = select(localGradient / max(gradMag, 1e-6), vec3f(0.0, 1.0, 0.0), gradMag < 1e-6);
  let densityWindow = smoothstep(-16.0, -2.0, logDensityProxy) *
    (1.0 - smoothstep(1.5, 8.0, densityProxy / max(uniforms.peakDensity, 1e-6)));
  let gradientWindow = clamp(log(1.0 + gradMag) * 0.35, 0.0, 1.0);

  let filament = entropyShearFilamentField(worldPosition, phaseProxy, uniforms);
  let filamentTransverse = filament - rayN * dot(filament, rayN);
  let fallbackCross = cross(rayN, gradN);
  let fallbackSeed = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(rayN.x) > 0.9);
  let fallbackSeedTransverse = fallbackSeed - rayN * dot(fallbackSeed, rayN);
  let fallbackLen = length(fallbackCross);
  let fallbackSeedLen = length(fallbackSeedTransverse);
  let fallbackTransverse = select(
    fallbackCross / max(fallbackLen, 1e-6),
    fallbackSeedTransverse / max(fallbackSeedLen, 1e-6),
    fallbackLen < 1e-6
  );
  let filamentLen = length(filamentTransverse);
  let shearDir = select(
    filamentTransverse / max(filamentLen, 1e-6),
    fallbackTransverse,
    filamentLen < 1e-6
  );

  let flowHandedness = clamp(dot(cross(rayN, gradN), shearDir), -1.0, 1.0);
  let phaseHandedness = sin(phaseProxy + dot(filament, vec3f(0.31, 0.57, 0.79)));
  let handedness = clamp(0.5 * flowHandedness + 0.5 * phaseHandedness, -1.0, 1.0);
  let entropyProxy = densityWindow * gradientWindow;
  let reversibleGain = entropyProxy * handedness;
  let irreversibleGain = entropyProxy * (0.5 + 0.5 * handedness);
  let irreversibility = clamp(uniforms.entropicTimeShearIrreversibility, 0.0, 1.0);
  let entropyGain = mix(reversibleGain, max(irreversibleGain, 0.0), irreversibility);

  let coherenceScale = clamp(uniforms.entropicTimeShearFilamentScale, 0.1, 4.0);
  let shearMagnitudeRaw = clamp(
    uniforms.entropicTimeShearStrength * entropyGain * coherenceScale * 0.08,
    -coherenceScale * 0.25,
    coherenceScale * 0.25
  );
  // PERF: damp the warp to exactly zero in low-effect regions so the
  // raymarcher's downstream length(pos - before...) > 1e-6 check skips the
  // density resample. entropyGain is non-zero everywhere the density and
  // gradient windows overlap, so without this ramp every visible step
  // triggers a resample. Threshold scales with the coherence scale.
  let shearRamp = smoothstep(coherenceScale * 0.003, coherenceScale * 0.012, abs(shearMagnitudeRaw));
  let shearMagnitude = shearMagnitudeRaw * shearRamp;
  return EntropicTimeShearResult(worldPosition + shearDir * shearMagnitude, entropyGain);
}

fn applyQuantumBackreactionMetric(
  worldPosition: vec3f,
  rayDirection: vec3f,
  densityProxy: f32,
  logDensityProxy: f32,
  localGradient: vec3f,
  uniforms: SchroedingerUniforms
) -> QuantumBackreactionMetric {
  if (!isQuantumBackreactionActive(uniforms)) {
    return QuantumBackreactionMetric(worldPosition, 1.0);
  }

  let peakDensity = max(uniforms.peakDensity, 1e-6);
  let densityStress = clamp(densityProxy / peakDensity, 0.0, 4.0);
  let stressWindow = smoothstep(-14.0, -2.0, logDensityProxy);
  let stressT00 = densityStress * stressWindow;
  let softening = max(uniforms.quantumBackreactionSoftening, 0.0001);
  let softening2 = softening * softening;
  let r2 = dot(worldPosition, worldPosition);
  let potentialPhi =
    uniforms.quantumBackreactionLensingStrength * stressT00 / (r2 + softening2);

  let rayN = normalize(rayDirection);
  let transverseGradient = localGradient - rayN * dot(localGradient, rayN);
  let gradLen = length(transverseGradient);
  if (gradLen < 1e-5 || stressT00 <= 0.0) {
    let causticOnly = 1.0 + uniforms.quantumBackreactionCausticGain * clamp(potentialPhi * 0.01, 0.0, 0.35);
    return QuantumBackreactionMetric(worldPosition, causticOnly);
  }

  let bendDir = transverseGradient / gradLen;
  let bendMagnitudeRaw = clamp(potentialPhi * softening * 0.08, 0.0, softening * 1.5);
  // PERF: damp the warp to exactly zero in low-stress regions so the
  // raymarcher's downstream length(pos - before...) > 1e-6 gate skips the
  // expensive density resample. potentialPhi is non-zero across the entire
  // smoothstep(-14, -2) density window — without this ramp every visible
  // step triggers a resample. Ramp width is referenced to softening so the
  // gate scales with the user's chosen lensing locality.
  let bendRamp = smoothstep(softening * 0.01, softening * 0.04, bendMagnitudeRaw);
  let bendMagnitude = bendMagnitudeRaw * bendRamp;
  let warpedPosition = worldPosition + bendDir * bendMagnitude;
  let caustic =
    1.0 + uniforms.quantumBackreactionCausticGain *
    clamp(potentialPhi * clamp(gradLen * softening, 0.0, 4.0) * 0.02, 0.0, 2.0);

  return QuantumBackreactionMetric(warpedPosition, caustic);
}

fn applyBilocalERBridgeTopology(
  worldPosition: vec3f,
  rayDirection: vec3f,
  localRho: f32,
  localLogDensity: f32,
  localPhase: f32,
  remoteRho: f32,
  remoteLogDensity: f32,
  remotePhase: f32,
  uniforms: SchroedingerUniforms
) -> BilocalERBridgeTopology {
  if (!isBilocalERBridgeActive(uniforms)) {
    return BilocalERBridgeTopology(worldPosition, 1.0);
  }

  let remoteEndpoint = vec3f(-worldPosition.x, worldPosition.y, worldPosition.z);
  let throatMidpoint = (worldPosition + remoteEndpoint) * 0.5;
  let rayN = normalize(rayDirection);
  let toThroat = throatMidpoint - worldPosition;
  let transverseToRay = toThroat - rayN * dot(toThroat, rayN);

  let throatRadius = max(uniforms.bilocalERBridgeThroatRadius, 0.0001);
  let throatRadius2 = throatRadius * throatRadius;
  let throatSoftening = throatRadius2 / (dot(transverseToRay, transverseToRay) + throatRadius2);
  let logWindow =
    smoothstep(-18.0, -2.0, localLogDensity) *
    smoothstep(-18.0, -2.0, remoteLogDensity);

  let peakDensity = max(uniforms.peakDensity, 1e-6);
  let amplitudeWeight = sqrt(max(localRho, 0.0) * max(remoteRho, 0.0)) / peakDensity;
  let phaseAgreement = clamp(0.5 + 0.5 * cos(localPhase - remotePhase), 0.0, 1.0);
  let phaseGate = mix(1.0, phaseAgreement, clamp(uniforms.bilocalERBridgePhaseLock, 0.0, 1.0));
  let bridgeWeight = clamp(amplitudeWeight * phaseGate * throatSoftening * logWindow, 0.0, 1.0);

  let warpScale = clamp(uniforms.bilocalERBridgeStrength * bridgeWeight * 0.45, -0.75, 0.75);
  let warpedPosition = worldPosition + transverseToRay * warpScale;
  let bridgeGain = 1.0 + uniforms.bilocalERBridgeStrength * max(bridgeWeight, 0.0);

  return BilocalERBridgeTopology(warpedPosition, bridgeGain);
}

// Sample complex wavefunction ψ at world position.
fn samplePsiWithFlow(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  let xND = mapPosToND(pos, uniforms);
  return evalPsi(xND, t, uniforms);
}
`

// Re-export compositing helpers — shared by all three raymarching functions
export { volumeCompositingBlock } from './volumeCompositing.wgsl'

// Re-export nodal field jet primitives (always included before nodal surfaces)
export { nodalFieldJetBlock, nodalFieldJetStubBlock } from './nodalFieldJet.wgsl'

// Re-export nodal surfaces from dedicated module — extracted for file-size management
export { nodalSurfacesBlock, nodalSurfacesStubBlock } from './nodalSurfaces.wgsl'

// Re-export probability current from dedicated module — extracted for file-size management
export { probabilityCurrentBlock, probabilityCurrentStubBlock } from './probabilityCurrent.wgsl'

// Re-export Born-Null Weave from dedicated module — extracted for file-size management
export { bornNullWeaveBlock } from './bornNullWeave.wgsl'

// Re-export raymarching block from dedicated module
export { volumeRaymarchBlock } from './volumeRaymarch.wgsl'

// Re-export grid raymarching blocks from dedicated module
export {
  generateVolumeRaymarchGridBlock,
  generateVolumeRaymarchGridSimpleBlock,
} from './volumeRaymarchGrid.wgsl'

// EOF — nodalSurfaces and probabilityCurrent blocks extracted to dedicated files
