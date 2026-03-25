/**
 * Volume Raymarching Functions
 *
 * Main raymarching loop and HQ variant extracted from integration.wgsl.ts.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/volumeRaymarch.wgsl
 */

/**
 * Volume raymarching and HQ raymarching blocks.
 * Included after volumeIntegrationBlock in the shader assembly.
 */
export const volumeRaymarchBlock = /* wgsl */ `
/**
 * Main volume raymarching function.
 * Supports lighting (matched to Mandelbulb behavior).
 * Returns: VolumeResult with color, alpha, and iteration count.
 *
 * Fixed sample counts: uses uniforms.sampleCount
 */
fn volumeRaymarch(
  rayOrigin: vec3f,
  rayDir: vec3f,
  tNear: f32,
  tFar: f32,
  uniforms: SchroedingerUniforms
) -> VolumeResult {
  var accColor = vec3f(0.0);

  // Iteration counter for debug visualization
  var iterCount: i32 = 0;

  // Primary hit tracking for temporal reprojection
  var primaryHitT: f32 = -1.0;
  let primaryHitThreshold: f32 = 0.01; // Alpha threshold to consider a "hit"

  // Sample count scaled by per-pixel path length to keep step SIZE constant.
  // Glancing rays traverse less volume → fewer steps, same sampling density.
  let maxPathLen = 2.0 * uniforms.boundingRadius;
  let sampleCount = max(i32(f32(max(uniforms.sampleCount, 1)) * (tFar - tNear) / maxPathLen), 4);

  let stepLen = (tFar - tNear) / f32(sampleCount);
  var t = tNear;

  // Time for animation
  let animTime = getVolumeTime(uniforms);
  let viewDir = -rayDir;
  let ambientLight = lighting.ambientColor * lighting.ambientIntensity;

  // Transmittance
  var transmittance: f32 = 1.0;

  // PERF: Hoist loop-invariant bounding radius computation
  let boundR2 = uniforms.boundingRadius * uniforms.boundingRadius;
  // sqrt(0.85)≈0.92: outer 8% shell is deep exponential tail for HO/hydrogen wavefunctions.
  let boundR2Skip = boundR2 * 0.85;

  for (var i: i32 = 0; i < MAX_VOLUME_SAMPLES; i++) {
    if (i >= sampleCount) { break; }
    iterCount = i + 1;  // Track iteration count

    if (transmittance < MIN_TRANSMITTANCE) { break; }
    let remainingDistance = max(tFar - t, 0.0);
    let maxRemainingOpacity = 1.0 - exp(-min(uniforms.densityGain * MAX_REMAINING_DENSITY_BOUND * remainingDistance, 20.0));
    let remainingContributionBound = transmittance * maxRemainingOpacity;
    if (remainingContributionBound < MIN_REMAINING_CONTRIBUTION) { break; }

    let pos = rayOrigin + rayDir * t;

    // PERFORMANCE: Gaussian envelope early-skip for deep tail region.
    // The outer ~15% shell of the bounding sphere is exponentially low density
    // for HO/hydrogen wavefunctions (Gaussian/exponential decay).
    // Free scalar fields use a cubic lattice with no radial falloff — skip is invalid.
    if (!IS_FREE_SCALAR) {
      let r2 = dot(pos, pos);
      if (r2 > boundR2Skip) {
        // 8× step in tail shell: at r>0.92R, HO/hydrogen ρ is exponentially small.
        t += stepLen * 8.0;
        continue;
      }
    }

    // Sample density with phase AND get flowed position for optimized gradient computation
    let densityResult = sampleDensityWithPhaseAndFlow(pos, animTime, uniforms);
    let densityInfo = densityResult[0];
    let flowedPos = densityResult[1];
    let rho = densityInfo.x;
    let sCenter = densityInfo.y;
    let phase = densityInfo.z;

    if (rho < EMPTY_SKIP_THRESHOLD) {
      let skipDistance = min(stepLen * EMPTY_SKIP_FACTOR, max(tFar - t, 0.0));
      if (skipDistance > stepLen) {
        let probeMid = sampleDensity(pos + rayDir * (skipDistance * 0.5), animTime, uniforms);
        let probeFar = sampleDensity(pos + rayDir * skipDistance, animTime, uniforms);
        if (probeMid < EMPTY_SKIP_THRESHOLD && probeFar < EMPTY_SKIP_THRESHOLD) {
          t += skipDistance;
          continue;
        }
      }
    }

    // Adaptive step size: log(ρ)=-12 → ρ≈6e-6, alpha≈σ·6e-6·4·step≈5e-7·σ (sub-pixel).
    // log(ρ)=-8 → ρ≈3.4e-4, alpha≈σ·3.4e-4·2·step≈1.4e-5·σ (sub-pixel at σ≤10).
    // IMPORTANT: Use adaptiveStep for absorption/fog integration to preserve energy.
    var stepMultiplier = 1.0;
    if (sCenter < -12.0) {
      stepMultiplier = 4.0;
    } else if (sCenter < -8.0) {
      stepMultiplier = 2.0;
    }
    let adaptiveStep = min(stepLen * stepMultiplier, tFar - t);

    if (
      FEATURE_NODAL &&
      uniforms.nodalEnabled != 0u &&
      uniforms.nodalStrength > 0.0 &&
      uniforms.nodalRenderMode == NODAL_RENDER_MODE_BAND
    ) {
      let nodal = computePhysicalNodalField(pos, animTime, uniforms);
      let fadedIntensity = nodal.intensity * nodal.envelopeWeight;
      if (fadedIntensity > 1e-4) {
        let nodalColor = selectPhysicalNodalColor(uniforms, nodal.colorMode, nodal.signValue);
        let nodalOpticalStep = min(adaptiveStep, stepLen * 1.5);
        let nodalAlpha = clamp(
          1.0 - exp(-max(fadedIntensity * uniforms.nodalStrength, 0.0) * nodalOpticalStep),
          0.0,
          1.0
        );
        if (nodalAlpha > 1e-5) {
          let nodalScattered = mix(nodalColor, nodalColor * ambientLight, 0.35);
          accColor += transmittance * nodalAlpha * nodalScattered;
          transmittance *= (1.0 - nodalAlpha * 0.6);
        }
      }
    }

    // PERF: Hoist density threshold check before expensive 7-evaluation current sampling.
    // sampleProbabilityCurrent evaluates the full wavefunction 7 times (center + 6 finite diffs).
    // computeProbabilityCurrentOverlay would discard the result anyway if rho < threshold.
    let momentumOverlaySubsample =
      uniforms.representationMode == REPRESENTATION_MOMENTUM && (i & 3) != 0;
    if (
      FEATURE_PROBABILITY_CURRENT &&
      !momentumOverlaySubsample &&
      uniforms.probabilityCurrentEnabled != 0u &&
      uniforms.probabilityCurrentScale > 0.0 &&
      rho >= max(uniforms.probabilityCurrentDensityThreshold, 0.0)
    ) {
      let normalProxy = normalize(pos + vec3f(1e-6, 0.0, 0.0));
      let currentSample = sampleProbabilityCurrent(pos, animTime, uniforms);
      let currentOverlay = computeProbabilityCurrentOverlay(
        pos,
        currentSample,
        rho,
        normalProxy,
        viewDir,
        uniforms
      );
      if (currentOverlay.a > 1e-5) {
        let overlayAlpha = clamp(
          currentOverlay.a * min(adaptiveStep / max(stepLen, 1e-5), 2.0),
          0.0,
          1.0
        );
        accColor += transmittance * overlayAlpha * currentOverlay.rgb;
        transmittance *= (1.0 - overlayAlpha * 0.45);
      }
    }

    // Radial probability overlay (hydrogen P(r) shells)
    if (FEATURE_RADIAL_PROBABILITY && uniforms.radialProbabilityEnabled != 0u) {
      let rProbOverlay = computeRadialProbabilityOverlay(pos, uniforms);
      if (rProbOverlay.a > 1e-5) {
        let rProbAlpha = clamp(
          rProbOverlay.a * min(adaptiveStep / max(stepLen, 1e-5), 2.0), 0.0, 1.0
        );
        accColor += transmittance * rProbAlpha * rProbOverlay.rgb;
        transmittance *= (1.0 - rProbAlpha * 0.5);
      }
    }

    // Density contrast sharpening: compress low-density tails for sharper lobes
    var effectiveRho = applyDensityContrast(rho, uniforms);
    // Phase materiality: smoke regions are denser (more absorbing)
    if (FEATURE_PHASE_MATERIALITY && uniforms.phaseMaterialityEnabled != 0u) {
      let pmPhase = fract((phase + PI) / TAU);
      let pmSmoke = 1.0 - smoothstep(0.35, 0.65, pmPhase);
      effectiveRho *= mix(1.0, 3.0, pmSmoke * uniforms.phaseMaterialityStrength);
    }
    // Nodal plane softening: when inside the cloud, apply a tiny density floor
    // to fill the thin dark line artifact where |psi|^2 = 0 at nodal surfaces.
    // Scales with cloud depth so edges and empty space are unaffected.
    let cloudDepth = 1.0 - transmittance;
    effectiveRho = max(effectiveRho, 5e-4 * cloudDepth * cloudDepth);
    let alpha = computeAlpha(effectiveRho, adaptiveStep, uniforms.densityGain);

    if (alpha > 0.001) {
      // Track primary hit for temporal reprojection
      if (primaryHitT < 0.0 && alpha > primaryHitThreshold) {
        primaryHitT = t;
      }

      // Compute gradient for emission lighting
      // When eigenfunction cache is available, use analytical gradient (no extra evaluations).
      // Otherwise, fall back to tetrahedral finite differences (4 samples).
      var gradient: vec3f;
      if (USE_ANALYTICAL_GRADIENT) {
        gradient = computeAnalyticalGradient(pos, animTime, uniforms);
      } else {
        gradient = computeGradientTetrahedralAtPos(flowedPos, animTime, 0.05, uniforms);
      }

      // Compute emission with lighting (pass pre-computed log-density to avoid redundant log())
      let emission = computeEmissionLit(rho, sCenter, phase, pos, gradient, viewDir, uniforms);

      // Front-to-back compositing (scalar path)
      accColor += transmittance * alpha * emission;
      transmittance *= (1.0 - alpha);
    }

    t += adaptiveStep;
  }

  // Final alpha
  let finalAlpha = 1.0 - transmittance;

  // If no primary hit found, use midpoint of ray segment
  if (primaryHitT < 0.0) {
    primaryHitT = (tNear + tFar) * 0.5;
  }

  return VolumeResult(accColor, finalAlpha, iterCount, primaryHitT);
}

/**
 * High-quality volume integration with lighting.
 * Uses tetrahedral gradient sampling (4 samples) for O(h^2) accuracy.
 */
fn volumeRaymarchHQ(
  rayOrigin: vec3f,
  rayDir: vec3f,
  tNear: f32,
  tFar: f32,
  uniforms: SchroedingerUniforms
) -> VolumeResult {
  var accColor = vec3f(0.0);
  var transmittance: f32 = 1.0;

  // Iteration counter for debug visualization
  var iterCount: i32 = 0;

  // Primary hit tracking for temporal reprojection
  var primaryHitT: f32 = -1.0;
  let primaryHitThreshold: f32 = 0.01; // Alpha threshold to consider a "hit"

  // Sample count scaled by per-pixel path length to keep step SIZE constant.
  let maxPathLen = 2.0 * uniforms.boundingRadius;
  let sampleCount = max(i32(f32(max(uniforms.sampleCount, 1)) * (tFar - tNear) / maxPathLen), 4);
  let stepLen = (tFar - tNear) / f32(sampleCount);
  var t = tNear;

  let animTime = getVolumeTime(uniforms);
  let viewDir = -rayDir;
  let ambientLight = lighting.ambientColor * lighting.ambientIntensity;

  // PERF: Hoist loop-invariant bounding radius computation
  let boundR2 = uniforms.boundingRadius * uniforms.boundingRadius;
  // sqrt(0.85)≈0.92: outer 8% shell is deep exponential tail for HO/hydrogen wavefunctions.
  let boundR2Skip = boundR2 * 0.85;

  for (var i: i32 = 0; i < MAX_VOLUME_SAMPLES; i++) {
    if (i >= sampleCount) { break; }
    iterCount = i + 1;  // Track iteration count

    if (transmittance < MIN_TRANSMITTANCE) { break; }
    let remainingDistance = max(tFar - t, 0.0);
    let maxRemainingOpacity = 1.0 - exp(-min(uniforms.densityGain * MAX_REMAINING_DENSITY_BOUND * remainingDistance, 20.0));
    let remainingContributionBound = transmittance * maxRemainingOpacity;
    if (remainingContributionBound < MIN_REMAINING_CONTRIBUTION) { break; }

    let pos = rayOrigin + rayDir * t;

    // PERFORMANCE: Gaussian envelope early-skip for deep tail region.
    // Disabled for free scalar (cubic lattice, no radial Gaussian decay).
    if (!IS_FREE_SCALAR) {
      let r2 = dot(pos, pos);
      if (r2 > boundR2Skip) {
        // 8× step in tail shell: at r>0.92R, HO/hydrogen ρ is exponentially small.
        t += stepLen * 8.0;
        continue;
      }
    }

    // First do cheap center-only density check
    let quickCheck = sampleDensityWithPhase(pos, animTime, uniforms);
    let quickRho = quickCheck.x;
    let quickS = quickCheck.y;

    // Skip expensive tetrahedral gradient when density is negligible.
    // log(ρ)=-15 → ρ≈3e-7: gradient contributes to lighting normal only, and at this
    // density the emission is invisible. Saves 3 extra wavefunction evaluations per step.
    var skipGradient = (quickS < -15.0);

    if (quickRho < EMPTY_SKIP_THRESHOLD) {
      let skipDistance = min(stepLen * EMPTY_SKIP_FACTOR, max(tFar - t, 0.0));
      if (skipDistance > stepLen) {
        let probeMid = sampleDensity(pos + rayDir * (skipDistance * 0.5), animTime, uniforms);
        let probeFar = sampleDensity(pos + rayDir * skipDistance, animTime, uniforms);
        if (probeMid < EMPTY_SKIP_THRESHOLD && probeFar < EMPTY_SKIP_THRESHOLD) {
          t += skipDistance;
          continue;
        }
      }
    }

    var rho: f32;
    var sCenter: f32;
    var phase: f32;
    var gradient: vec3f;

    if (skipGradient) {
      rho = quickRho;
      sCenter = quickS;
      phase = quickCheck.z;
      gradient = vec3f(0.0);
    } else if (USE_ANALYTICAL_GRADIENT) {
      // Analytical gradient from cached eigenfunctions (1 eval vs 4 tetrahedral samples)
      let cached = sampleDensityWithAnalyticalGradient(pos, animTime, uniforms);
      rho = cached.rho;
      sCenter = cached.s;
      phase = cached.phase;
      gradient = cached.gradient;
    } else {
      let tetra = sampleWithTetrahedralGradient(pos, animTime, 0.05, uniforms);
      rho = tetra.rho;
      sCenter = tetra.s;
      phase = tetra.phase;
      gradient = tetra.gradient;
    }

    // Adaptive step size: log(ρ)=-12 → ρ≈6e-6, alpha≈σ·6e-6·4·step≈5e-7·σ (sub-pixel).
    // log(ρ)=-8 → ρ≈3.4e-4, alpha≈σ·3.4e-4·2·step≈1.4e-5·σ (sub-pixel at σ≤10).
    // IMPORTANT: Use adaptiveStep for absorption/fog integration to preserve energy.
    var stepMultiplier = 1.0;
    if (quickS < -12.0) {
      stepMultiplier = 4.0;
    } else if (quickS < -8.0) {
      stepMultiplier = 2.0;
    }
    let adaptiveStep = min(stepLen * stepMultiplier, tFar - t);

    if (
      FEATURE_NODAL &&
      uniforms.nodalEnabled != 0u &&
      uniforms.nodalStrength > 0.0 &&
      uniforms.nodalRenderMode == NODAL_RENDER_MODE_BAND
    ) {
      let nodal = computePhysicalNodalField(pos, animTime, uniforms);
      let fadedIntensityHQ = nodal.intensity * nodal.envelopeWeight;
      if (fadedIntensityHQ > 1e-4) {
        let nodalColor = selectPhysicalNodalColor(uniforms, nodal.colorMode, nodal.signValue);
        let nodalOpticalStepHQ = min(adaptiveStep, stepLen * 1.5);
        let nodalAlpha = clamp(
          1.0 - exp(-max(fadedIntensityHQ * uniforms.nodalStrength, 0.0) * nodalOpticalStepHQ),
          0.0,
          1.0
        );
        if (nodalAlpha > 1e-5) {
          let nodalScattered = mix(nodalColor, nodalColor * ambientLight, 0.35);
          accColor += transmittance * nodalAlpha * nodalScattered;
          transmittance *= (1.0 - nodalAlpha * 0.6);
        }
      }
    }

    // PERF: Hoist density threshold check before expensive 7-evaluation current sampling
    let momentumOverlaySubsample =
      uniforms.representationMode == REPRESENTATION_MOMENTUM && (i & 3) != 0;
    if (
      FEATURE_PROBABILITY_CURRENT &&
      !momentumOverlaySubsample &&
      uniforms.probabilityCurrentEnabled != 0u &&
      uniforms.probabilityCurrentScale > 0.0 &&
      rho >= max(uniforms.probabilityCurrentDensityThreshold, 0.0)
    ) {
      let normalProxy = normalize(gradient + pos * 0.2 + vec3f(1e-6, 0.0, 0.0));
      let currentSample = sampleProbabilityCurrent(pos, animTime, uniforms);
      let currentOverlay = computeProbabilityCurrentOverlay(
        pos,
        currentSample,
        rho,
        normalProxy,
        viewDir,
        uniforms
      );
      if (currentOverlay.a > 1e-5) {
        let overlayAlpha = clamp(
          currentOverlay.a * min(adaptiveStep / max(stepLen, 1e-5), 2.0),
          0.0,
          1.0
        );
        accColor += transmittance * overlayAlpha * currentOverlay.rgb;
        transmittance *= (1.0 - overlayAlpha * 0.45);
      }
    }

    // Radial probability overlay (hydrogen P(r) shells)
    if (FEATURE_RADIAL_PROBABILITY && uniforms.radialProbabilityEnabled != 0u) {
      let rProbOverlay = computeRadialProbabilityOverlay(pos, uniforms);
      if (rProbOverlay.a > 1e-5) {
        let rProbAlpha = clamp(
          rProbOverlay.a * min(adaptiveStep / max(stepLen, 1e-5), 2.0), 0.0, 1.0
        );
        accColor += transmittance * rProbAlpha * rProbOverlay.rgb;
        transmittance *= (1.0 - rProbAlpha * 0.5);
      }
    }

    // Density contrast sharpening: compress low-density tails for sharper lobes
    var effectiveRho = applyDensityContrast(rho, uniforms);
    // Phase materiality: smoke regions are denser (more absorbing)
    if (FEATURE_PHASE_MATERIALITY && uniforms.phaseMaterialityEnabled != 0u) {
      let pmPhase = fract((phase + PI) / TAU);
      let pmSmoke = 1.0 - smoothstep(0.35, 0.65, pmPhase);
      effectiveRho *= mix(1.0, 3.0, pmSmoke * uniforms.phaseMaterialityStrength);
    }
    // Nodal plane softening: density floor AFTER contrast so sigmoid doesn't kill it
    let cloudDepthHQ = 1.0 - transmittance;
    effectiveRho = max(effectiveRho, 5e-4 * cloudDepthHQ * cloudDepthHQ);
    let alpha = computeAlpha(effectiveRho, adaptiveStep, uniforms.densityGain);

    if (alpha > 0.001) {
      // Track primary hit for temporal reprojection
      if (primaryHitT < 0.0 && alpha > primaryHitThreshold) {
        primaryHitT = t;
      }

      // Compute emission with lighting (pass pre-computed log-density to avoid redundant log())
      let emission = computeEmissionLit(rho, sCenter, phase, pos, gradient, viewDir, uniforms);

      // Front-to-back compositing
      accColor += transmittance * alpha * emission;
      transmittance *= (1.0 - alpha);
    }

    t += adaptiveStep;
  }

  // Final alpha
  let finalAlpha = 1.0 - transmittance;

  // If no primary hit found, use midpoint of ray segment
  if (primaryHitT < 0.0) {
    primaryHitT = (tNear + tFar) * 0.5;
  }

  return VolumeResult(accColor, finalAlpha, iterCount, primaryHitT);
}
`

/**
 * Grid-based volume raymarching function.
 * Uses pre-computed 3D density grid texture instead of inline wavefunction evaluation.
 * Same compositing logic as volumeRaymarch() but ~3-6x cheaper per step
 * (texture lookup vs Laguerre + Legendre + spherical harmonics).
 *
 * Only used for hydrogen modes when eigenfunctionCacheEnabled.
 */
