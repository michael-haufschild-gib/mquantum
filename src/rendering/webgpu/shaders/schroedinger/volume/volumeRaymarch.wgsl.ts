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
  // Hoist 1/stepLen so compositeOverlay can skip its per-call division
  // (up to ~60-80 active calls per ray in the probCurrent/radialProb paths).
  let invStepLen = 1.0 / max(stepLen, 1e-5);
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

  // PERF: Hoist uniform-only feature gates out of the 128-iteration loop body.
  // Every read here would otherwise hit the uniform cache on every iteration.
  let nodalBandEnabled =
    FEATURE_NODAL &&
    uniforms.nodalEnabled != 0u &&
    uniforms.nodalStrength > 0.0 &&
    uniforms.nodalRenderMode == NODAL_RENDER_MODE_BAND;
  let probCurrentEnabled =
    FEATURE_PROBABILITY_CURRENT &&
    uniforms.probabilityCurrentEnabled != 0u &&
    uniforms.probabilityCurrentScale > 0.0;
  let probCurrentDensityThreshold = max(uniforms.probabilityCurrentDensityThreshold, 0.0);
  let radialProbEnabled = FEATURE_RADIAL_PROBABILITY && uniforms.radialProbabilityEnabled != 0u;
  let momentumRepresentation = uniforms.representationMode == REPRESENTATION_MOMENTUM;
  let backreactionActive = isQuantumBackreactionActive(uniforms);
  let bilocalBridgeActive = isBilocalERBridgeActive(uniforms);
  let entropyShearActive = isEntropicTimeShearActive(uniforms);
  let spectralFlowActive = isSpectralDimensionFlowActive(uniforms);
  let vacuumBubbleActive = isVacuumBubbleLensActive(uniforms);

  for (var i: i32 = 0; i < MAX_VOLUME_SAMPLES; i++) {
    if (i >= sampleCount) { break; }
    iterCount = i + 1;  // Track iteration count

    // PERF: cache tFar - t once per iter — used by shouldTerminateRay,
    // skipDistance ceiling, and adaptiveStep.
    let remaining = tFar - t;
    if (shouldTerminateRay(transmittance, uniforms.densityGain, max(remaining, 0.0))) { break; }

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

    // Sample density with phase AND raw ψ for probability current reuse
    let densityResult = sampleDensityWithPhaseAndFlow(pos, animTime, uniforms);
    var densityInfo = densityResult[0];
    var rawPsiVec = densityResult[1];
    var rho = densityInfo.x;
    var sCenter = densityInfo.y;
    var phase = densityInfo.z;

    if (rho < EMPTY_SKIP_THRESHOLD) {
      let skipDistance = min(stepLen * EMPTY_SKIP_FACTOR, max(remaining, 0.0));
      if (skipDistance > stepLen) {
        let probeMid = sampleDensity(pos + rayDir * (skipDistance * 0.5), animTime, uniforms);
        let probeFar = sampleDensity(pos + rayDir * skipDistance, animTime, uniforms);
        if (probeMid < EMPTY_SKIP_THRESHOLD && probeFar < EMPTY_SKIP_THRESHOLD) {
          t += skipDistance;
          continue;
        }
      }
    }

    var samplePos = pos;
    var bridgeGain = 1.0;
    if (bilocalBridgeActive && rho >= EMPTY_SKIP_THRESHOLD) {
      let remoteEndpoint = vec3f(-pos.x, pos.y, pos.z);
      let remoteDensityInfo = sampleDensityWithPhase(remoteEndpoint, animTime, uniforms);
      let bridge = applyBilocalERBridgeTopology(
        pos,
        rayDir,
        rho,
        sCenter,
        phase,
        remoteDensityInfo.x,
        remoteDensityInfo.y,
        remoteDensityInfo.z,
        uniforms
      );
      samplePos = bridge.position;
      bridgeGain = bridge.gain;
      if (length(samplePos - pos) > 1e-6) {
        let warpedDensityResult = sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms);
        densityInfo = warpedDensityResult[0];
        rawPsiVec = warpedDensityResult[1];
        rho = densityInfo.x;
        sCenter = densityInfo.y;
        phase = densityInfo.z;
      }
    }

    var causticMultiplier = 1.0;
    if (backreactionActive && rho >= EMPTY_SKIP_THRESHOLD) {
      var metricGradient: vec3f;
      if (USE_ANALYTICAL_GRADIENT) {
        metricGradient = computeAnalyticalGradient(samplePos, animTime, uniforms);
      } else {
        metricGradient = computeGradientTetrahedral(samplePos, animTime, 0.05, uniforms);
      }
      let beforeBackreaction = samplePos;
      let metric = applyQuantumBackreactionMetric(
        beforeBackreaction, rayDir, rho, sCenter, metricGradient, uniforms
      );
      samplePos = metric.position;
      causticMultiplier = metric.caustic;
      if (length(samplePos - beforeBackreaction) > 1e-6) {
        let warpedDensityResult = sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms);
        densityInfo = warpedDensityResult[0];
        rawPsiVec = warpedDensityResult[1];
        rho = densityInfo.x;
        sCenter = densityInfo.y;
        phase = densityInfo.z;
      }
    }

    var entropyGain = 0.0;
    if (entropyShearActive && rho >= EMPTY_SKIP_THRESHOLD) {
      var entropyGradient: vec3f;
      if (USE_ANALYTICAL_GRADIENT) {
        entropyGradient = computeAnalyticalGradient(samplePos, animTime, uniforms);
      } else {
        entropyGradient = computeGradientTetrahedral(samplePos, animTime, 0.05, uniforms);
      }
      let beforeEntropyShear = samplePos;
      let entropyShear = applyEntropicTimeShear(
        samplePos, rayDir, rho, sCenter, phase, entropyGradient, uniforms
      );
      samplePos = entropyShear.position;
      entropyGain = entropyShear.entropyGain;
      if (length(samplePos - beforeEntropyShear) > 1e-6) {
        let warpedDensityResult = sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms);
        densityInfo = warpedDensityResult[0];
        rawPsiVec = warpedDensityResult[1];
        rho = densityInfo.x;
        sCenter = densityInfo.y;
        phase = densityInfo.z;
      }
    }

    var spectralEmissionGain = 1.0;
    var spectralOpacityScale = 1.0;
    if (spectralFlowActive && rho >= EMPTY_SKIP_THRESHOLD) {
      var spectralGradient: vec3f;
      if (USE_ANALYTICAL_GRADIENT) {
        spectralGradient = computeAnalyticalGradient(samplePos, animTime, uniforms);
      } else {
        spectralGradient = computeGradientTetrahedral(samplePos, animTime, 0.05, uniforms);
      }
      let beforeSpectralFlow = samplePos;
      let spectralFlow = applySpectralDimensionFlow(
        samplePos, rayDir, rho, sCenter, spectralGradient, uniforms
      );
      samplePos = spectralFlow.position;
      spectralEmissionGain = spectralFlow.emissionGain;
      spectralOpacityScale = spectralFlow.opacityScale;
      if (length(samplePos - beforeSpectralFlow) > 1e-6) {
        let warpedDensityResult = sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms);
        densityInfo = warpedDensityResult[0];
        rawPsiVec = warpedDensityResult[1];
        rho = densityInfo.x;
        sCenter = densityInfo.y;
        phase = densityInfo.z;
      }
    }

    var vacuumBubbleEmissionGain = 1.0;
    var vacuumBubbleOpacityScale = 1.0;
    if (vacuumBubbleActive && rho >= EMPTY_SKIP_THRESHOLD) {
      let beforeVacuumBubble = samplePos;
      let vacuumBubble = applyVacuumBubbleLens(samplePos, rayDir, uniforms);
      samplePos = vacuumBubble.position;
      vacuumBubbleEmissionGain = vacuumBubble.emissionGain;
      vacuumBubbleOpacityScale = vacuumBubble.opacityScale;
      if (length(samplePos - beforeVacuumBubble) > 1e-6) {
        let warpedDensityResult = sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms);
        densityInfo = warpedDensityResult[0];
        rawPsiVec = warpedDensityResult[1];
        rho = densityInfo.x;
        sCenter = densityInfo.y;
        phase = densityInfo.z;
      }
    }

    let adaptiveStep = computeAdaptiveStep(sCenter, stepLen, remaining);

    // PERF: When nodal band mode is active, use the combined function that also computes
    // the density gradient from the same tetrahedral samples. This eliminates 4 redundant
    // psi evaluations when the gradient would otherwise be computed separately.
    // PERF: Skip nodal computation when density is very low (sCenter < -10 → rho < 4.5e-5).
    // The envelope weight drives nodal intensity to zero at low amplitude, so the 4 tetrahedral
    // psi evaluations would produce an invisible result. Saves ~44% ALU per low-density step.
    var nodalGradient = vec3f(0.0);
    var hasNodalGradient = false;
    if (nodalBandEnabled && sCenter > -10.0) {
      let combined = computePhysicalNodalFieldWithGradient(samplePos, animTime, uniforms);
      nodalGradient = combined.gradient;
      hasNodalGradient = true;
      let fadedIntensity = combined.nodal.intensity * combined.nodal.envelopeWeight;
      if (fadedIntensity > 1e-4) {
        let nodalColor = selectPhysicalNodalColor(uniforms, combined.nodal.colorMode, combined.nodal.signValue);
        compositeNodalBand(
          fadedIntensity, uniforms.nodalStrength, nodalColor,
          min(adaptiveStep, stepLen * 1.5), ambientLight,
          &transmittance, &accColor
        );
      }
    }

    // Hoisted feature gates are used below. sampleProbabilityCurrentWithPsi uses
    // 3 forward-diff evalPsi calls (was 7 central). The center psi is reused from
    // the density pass above (rawPsiVec).
    let momentumOverlaySubsample = momentumRepresentation && (i & 3) != 0;
    if (
      probCurrentEnabled &&
      !momentumOverlaySubsample &&
      rho >= probCurrentDensityThreshold
    ) {
      let normalProxy = normalize(samplePos + vec3f(1e-6, 0.0, 0.0));
      let currentSample = sampleProbabilityCurrentWithPsi(samplePos, animTime, rawPsiVec.xy, uniforms);
      let currentOverlay = computeProbabilityCurrentOverlay(
        samplePos, currentSample, rho, normalProxy, viewDir, uniforms
      );
      compositeOverlay(currentOverlay, adaptiveStep, invStepLen, 0.45, &transmittance, &accColor);
    }

    // Radial probability overlay (hydrogen P(r) shells)
    if (radialProbEnabled) {
      let rProbOverlay = computeRadialProbabilityOverlay(samplePos, uniforms);
      compositeOverlay(rProbOverlay, adaptiveStep, invStepLen, 0.5, &transmittance, &accColor);
    }

    let effectiveRho = computeEffectiveDensity(
      rho * spectralOpacityScale * vacuumBubbleOpacityScale,
      phase,
      transmittance,
      uniforms
    );
    let alpha = computeAlpha(effectiveRho, adaptiveStep, uniforms.densityGain);

    if (alpha > 0.001) {
      // Track primary hit for temporal reprojection
      if (primaryHitT < 0.0 && alpha > primaryHitThreshold) {
        primaryHitT = t;
      }

      // Compute gradient for emission lighting.
      // When nodal band already computed the gradient (shared tetrahedral samples), reuse it.
      // Otherwise: analytical gradient (cached eigenfunctions) or tetrahedral finite differences.
      var gradient: vec3f;
      if (hasNodalGradient) {
        gradient = nodalGradient;
      } else if (USE_ANALYTICAL_GRADIENT) {
        gradient = computeAnalyticalGradient(samplePos, animTime, uniforms);
      } else {
        gradient = computeGradientTetrahedral(samplePos, animTime, 0.05, uniforms);
      }

      // Compute emission with lighting (pass pre-computed log-density to avoid redundant log())
      let emission = computeEmissionLit(rho, sCenter, phase, samplePos, gradient, viewDir, uniforms)
        * causticMultiplier * bridgeGain * spectralEmissionGain * vacuumBubbleEmissionGain;
      let entropyEmissionGain =
        1.0 + uniforms.entropicTimeShearStrength * max(entropyGain, 0.0) * 0.35;

      // Front-to-back compositing (scalar path)
      accColor += transmittance * alpha * emission * entropyEmissionGain;
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
  // Hoist 1/stepLen so compositeOverlay skips its per-call division.
  let invStepLen = 1.0 / max(stepLen, 1e-5);
  var t = tNear;

  let animTime = getVolumeTime(uniforms);
  let viewDir = -rayDir;
  let ambientLight = lighting.ambientColor * lighting.ambientIntensity;

  // PERF: Hoist loop-invariant bounding radius computation
  let boundR2 = uniforms.boundingRadius * uniforms.boundingRadius;
  // sqrt(0.85)≈0.92: outer 8% shell is deep exponential tail for HO/hydrogen wavefunctions.
  let boundR2Skip = boundR2 * 0.85;

  // PERF: Hoist uniform-only feature gates (same pattern as volumeRaymarch above).
  let probCurrentEnabled =
    FEATURE_PROBABILITY_CURRENT &&
    uniforms.probabilityCurrentEnabled != 0u &&
    uniforms.probabilityCurrentScale > 0.0;
  let probCurrentDensityThreshold = max(uniforms.probabilityCurrentDensityThreshold, 0.0);
  let radialProbEnabled = FEATURE_RADIAL_PROBABILITY && uniforms.radialProbabilityEnabled != 0u;
  let momentumRepresentation = uniforms.representationMode == REPRESENTATION_MOMENTUM;
  let backreactionActive = isQuantumBackreactionActive(uniforms);
  let bilocalBridgeActive = isBilocalERBridgeActive(uniforms);
  let entropyShearActive = isEntropicTimeShearActive(uniforms);
  let spectralFlowActive = isSpectralDimensionFlowActive(uniforms);
  let vacuumBubbleActive = isVacuumBubbleLensActive(uniforms);

  for (var i: i32 = 0; i < MAX_VOLUME_SAMPLES; i++) {
    if (i >= sampleCount) { break; }
    iterCount = i + 1;  // Track iteration count

    // PERF: cache tFar - t once per iter — used 3+ times below.
    let remaining = tFar - t;
    if (shouldTerminateRay(transmittance, uniforms.densityGain, max(remaining, 0.0))) { break; }

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
    var quickCheck = sampleDensityWithPhase(pos, animTime, uniforms);
    var quickRho = quickCheck.x;
    var quickS = quickCheck.y;

    // Skip expensive tetrahedral gradient when density is negligible.
    // log(ρ)=-15 → ρ≈3e-7: gradient contributes to lighting normal only, and at this
    // density the emission is invisible. Saves 3 extra wavefunction evaluations per step.
    var skipGradient = (quickS < -15.0);

    if (quickRho < EMPTY_SKIP_THRESHOLD) {
      let skipDistance = min(stepLen * EMPTY_SKIP_FACTOR, max(remaining, 0.0));
      if (skipDistance > stepLen) {
        let probeMid = sampleDensity(pos + rayDir * (skipDistance * 0.5), animTime, uniforms);
        let probeFar = sampleDensity(pos + rayDir * skipDistance, animTime, uniforms);
        if (probeMid < EMPTY_SKIP_THRESHOLD && probeFar < EMPTY_SKIP_THRESHOLD) {
          t += skipDistance;
          continue;
        }
      }
    }

    var samplePos = pos;
    var bridgeGain = 1.0;
    if (bilocalBridgeActive && quickRho >= EMPTY_SKIP_THRESHOLD) {
      let remoteEndpoint = vec3f(-pos.x, pos.y, pos.z);
      let remoteDensityInfo = sampleDensityWithPhase(remoteEndpoint, animTime, uniforms);
      let bridge = applyBilocalERBridgeTopology(
        pos,
        rayDir,
        quickRho,
        quickS,
        quickCheck.z,
        remoteDensityInfo.x,
        remoteDensityInfo.y,
        remoteDensityInfo.z,
        uniforms
      );
      samplePos = bridge.position;
      bridgeGain = bridge.gain;
      if (length(samplePos - pos) > 1e-6) {
        quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms);
        quickRho = quickCheck.x;
        quickS = quickCheck.y;
      }
    }

    var causticMultiplier = 1.0;
    if (backreactionActive && quickRho >= EMPTY_SKIP_THRESHOLD) {
      var metricGradient: vec3f;
      if (USE_ANALYTICAL_GRADIENT) {
        metricGradient = computeAnalyticalGradient(samplePos, animTime, uniforms);
      } else {
        metricGradient = computeGradientTetrahedral(samplePos, animTime, 0.05, uniforms);
      }
      let beforeBackreaction = samplePos;
      let metric = applyQuantumBackreactionMetric(
        beforeBackreaction, rayDir, quickRho, quickS, metricGradient, uniforms
      );
      samplePos = metric.position;
      causticMultiplier = metric.caustic;
      if (length(samplePos - beforeBackreaction) > 1e-6) {
        quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms);
        quickRho = quickCheck.x;
        quickS = quickCheck.y;
      }
    }
    var entropyGain = 0.0;
    if (entropyShearActive && quickRho >= EMPTY_SKIP_THRESHOLD) {
      var entropyGradient: vec3f;
      if (USE_ANALYTICAL_GRADIENT) {
        entropyGradient = computeAnalyticalGradient(samplePos, animTime, uniforms);
      } else {
        entropyGradient = computeGradientTetrahedral(samplePos, animTime, 0.05, uniforms);
      }
      let beforeEntropyShear = samplePos;
      let entropyShear = applyEntropicTimeShear(
        samplePos, rayDir, quickRho, quickS, quickCheck.z, entropyGradient, uniforms
      );
      samplePos = entropyShear.position;
      entropyGain = entropyShear.entropyGain;
      if (length(samplePos - beforeEntropyShear) > 1e-6) {
        quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms);
        quickRho = quickCheck.x;
        quickS = quickCheck.y;
      }
    }

    var spectralEmissionGain = 1.0;
    var spectralOpacityScale = 1.0;
    if (spectralFlowActive && quickRho >= EMPTY_SKIP_THRESHOLD) {
      var spectralGradient: vec3f;
      if (USE_ANALYTICAL_GRADIENT) {
        spectralGradient = computeAnalyticalGradient(samplePos, animTime, uniforms);
      } else {
        spectralGradient = computeGradientTetrahedral(samplePos, animTime, 0.05, uniforms);
      }
      let beforeSpectralFlow = samplePos;
      let spectralFlow = applySpectralDimensionFlow(
        samplePos, rayDir, quickRho, quickS, spectralGradient, uniforms
      );
      samplePos = spectralFlow.position;
      spectralEmissionGain = spectralFlow.emissionGain;
      spectralOpacityScale = spectralFlow.opacityScale;
      if (length(samplePos - beforeSpectralFlow) > 1e-6) {
        quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms);
        quickRho = quickCheck.x;
        quickS = quickCheck.y;
      }
    }

    var vacuumBubbleEmissionGain = 1.0;
    var vacuumBubbleOpacityScale = 1.0;
    if (vacuumBubbleActive && quickRho >= EMPTY_SKIP_THRESHOLD) {
      let beforeVacuumBubble = samplePos;
      let vacuumBubble = applyVacuumBubbleLens(samplePos, rayDir, uniforms);
      samplePos = vacuumBubble.position;
      vacuumBubbleEmissionGain = vacuumBubble.emissionGain;
      vacuumBubbleOpacityScale = vacuumBubble.opacityScale;
      if (length(samplePos - beforeVacuumBubble) > 1e-6) {
        quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms);
        quickRho = quickCheck.x;
        quickS = quickCheck.y;
      }
    }
    skipGradient = (quickS < -15.0);

    // Hoisted so the nodal-band and main compositing paths share one computation
    // (was computed twice — once as adaptiveStepN in the nodal branch, once here).
    let adaptiveStep = computeAdaptiveStep(quickS, stepLen, remaining);

    var rho: f32;
    var sCenter: f32;
    var phase: f32;
    var gradient: vec3f;

    // PERF: When nodal band mode is active and gradient is needed, use the combined
    // nodalFieldWithGradient function that computes BOTH from the same 4 tetrahedral
    // psi samples — eliminating 4 redundant psi evaluations per ray step.
    // PERF: Also gate on density — skip nodal at very low density where envelope → 0.
    let nodalBandActive = FEATURE_NODAL &&
      uniforms.nodalEnabled != 0u &&
      uniforms.nodalStrength > 0.0 &&
      uniforms.nodalRenderMode == NODAL_RENDER_MODE_BAND &&
      quickS > -10.0;

    var nodalHandled = false;

    if (skipGradient) {
      rho = quickRho;
      sCenter = quickS;
      phase = quickCheck.z;
      gradient = vec3f(0.0);
    } else if (nodalBandActive && !USE_ANALYTICAL_GRADIENT) {
      // Combined path: nodal detection + density gradient from shared tetrahedral samples.
      // Saves 4 psi evaluations per step compared to separate computePhysicalNodalField + gradient.
      let combined = computePhysicalNodalFieldWithGradient(samplePos, animTime, uniforms);
      gradient = combined.gradient;
      // Use center density from the quick check (more accurate single-point value for compositing)
      rho = quickRho;
      sCenter = quickS;
      phase = quickCheck.z;
      // Process nodal contribution inline (avoid duplicate call)
      let fadedIntensityHQ = combined.nodal.intensity * combined.nodal.envelopeWeight;
      if (fadedIntensityHQ > 1e-4) {
        let nodalColor = selectPhysicalNodalColor(uniforms, combined.nodal.colorMode, combined.nodal.signValue);
        compositeNodalBand(
          fadedIntensityHQ, uniforms.nodalStrength, nodalColor,
          min(adaptiveStep, stepLen * 1.5), ambientLight,
          &transmittance, &accColor
        );
      }
      nodalHandled = true;
    } else if (USE_ANALYTICAL_GRADIENT) {
      // Analytical gradient from cached eigenfunctions (1 eval vs 4 tetrahedral samples)
      let cached = sampleDensityWithAnalyticalGradient(samplePos, animTime, uniforms);
      rho = cached.rho;
      sCenter = cached.s;
      phase = cached.phase;
      gradient = cached.gradient;
    } else {
      let tetra = sampleWithTetrahedralGradient(samplePos, animTime, 0.05, uniforms);
      rho = tetra.rho;
      sCenter = tetra.s;
      phase = tetra.phase;
      gradient = tetra.gradient;
    }

    // Nodal band processing (only if not already handled by the combined path above)
    if (!nodalHandled && nodalBandActive) {
      let nodal = computePhysicalNodalField(samplePos, animTime, uniforms);
      let fadedIntensityHQ = nodal.intensity * nodal.envelopeWeight;
      if (fadedIntensityHQ > 1e-4) {
        let nodalColor = selectPhysicalNodalColor(uniforms, nodal.colorMode, nodal.signValue);
        compositeNodalBand(
          fadedIntensityHQ, uniforms.nodalStrength, nodalColor,
          min(adaptiveStep, stepLen * 1.5), ambientLight,
          &transmittance, &accColor
        );
      }
    }

    // Hoisted feature gates (see start of function).
    let momentumOverlaySubsample = momentumRepresentation && (i & 3) != 0;
    if (
      probCurrentEnabled &&
      !momentumOverlaySubsample &&
      rho >= probCurrentDensityThreshold
    ) {
      let normalProxy = normalize(gradient + samplePos * 0.2 + vec3f(1e-6, 0.0, 0.0));
      let currentSample = sampleProbabilityCurrent(samplePos, animTime, uniforms);
      let currentOverlay = computeProbabilityCurrentOverlay(
        samplePos, currentSample, rho, normalProxy, viewDir, uniforms
      );
      compositeOverlay(currentOverlay, adaptiveStep, invStepLen, 0.45, &transmittance, &accColor);
    }

    // Radial probability overlay (hydrogen P(r) shells)
    if (radialProbEnabled) {
      let rProbOverlay = computeRadialProbabilityOverlay(samplePos, uniforms);
      compositeOverlay(rProbOverlay, adaptiveStep, invStepLen, 0.5, &transmittance, &accColor);
    }

    let effectiveRho = computeEffectiveDensity(
      rho * spectralOpacityScale * vacuumBubbleOpacityScale,
      phase,
      transmittance,
      uniforms
    );
    let alpha = computeAlpha(effectiveRho, adaptiveStep, uniforms.densityGain);

    if (alpha > 0.001) {
      // Track primary hit for temporal reprojection
      if (primaryHitT < 0.0 && alpha > primaryHitThreshold) {
        primaryHitT = t;
      }

      // Compute emission with lighting (pass pre-computed log-density to avoid redundant log())
      let emission = computeEmissionLit(rho, sCenter, phase, samplePos, gradient, viewDir, uniforms)
        * causticMultiplier * bridgeGain * spectralEmissionGain * vacuumBubbleEmissionGain;
      let entropyEmissionGain =
        1.0 + uniforms.entropicTimeShearStrength * max(entropyGain, 0.0) * 0.35;

      // Front-to-back compositing
      accColor += transmittance * alpha * emission * entropyEmissionGain;
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
