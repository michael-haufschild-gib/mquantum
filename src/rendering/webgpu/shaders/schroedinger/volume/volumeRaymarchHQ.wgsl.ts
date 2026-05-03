/**
 * High-quality volume raymarching function.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchHQ.wgsl
 */

export const volumeRaymarchHQBlock = /* wgsl */ `
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
  let bornNullWeaveActive = isBornNullWeaveActive(uniforms);
  let volumeWarpEffectsActive =
    bilocalBridgeActive ||
    backreactionActive ||
    entropyShearActive ||
    spectralFlowActive ||
    vacuumBubbleActive ||
    bornNullWeaveActive;
  let nodalBandEnabled =
    FEATURE_NODAL &&
    uniforms.nodalEnabled != 0u &&
    uniforms.nodalStrength > 0.0 &&
    activeNodalRenderMode(uniforms) == NODAL_RENDER_MODE_BAND;
  let useAnalyticalDensitySample = USE_ANALYTICAL_GRADIENT && nodalBandEnabled;

  for (var i: i32 = 0; i < MAX_VOLUME_SAMPLES; i++) {
    if (i >= sampleCount) { break; }
    iterCount = i + 1;  // Track iteration count

    // PERF: cache tFar - t once per iter — used 3+ times below.
    let remaining = tFar - t;
    if (shouldTerminateRay(transmittance, uniforms.densityGain, max(remaining, 0.0))) { break; }

    let pos = rayOrigin + rayDir * t;

    // PERF: per-step gradient cache shared across all spacetime effects and
    // the final emission lighting. See volumeRaymarch for rationale.
    var gradCache: GradientCache;
    gradCache.valid = false;

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

    // First do center density check. In analytical nodal mode, use the richer
    // closed-form sample up front so density, lighting gradient, psi, and
    // nodal band share one eigenfunction evaluation.
    var quickCheck: vec3f;
    var quickRho: f32;
    var quickS: f32;
    var analyticalAtSamplePos: AnalyticalSample;
    var hasAnalytical = false;
    if (useAnalyticalDensitySample) {
      let analytical = sampleDensityWithAnalyticalGradientFlow(pos, animTime, uniforms);
      quickCheck = vec3f(analytical.rho, analytical.s, analytical.phase);
      quickRho = analytical.rho;
      quickS = analytical.s;
      gradCache.gradient = analytical.gradient;
      gradCache.pos = pos;
      gradCache.valid = true;
      analyticalAtSamplePos = analytical;
      hasAnalytical = true;
    } else {
      quickCheck = sampleDensityWithPhase(pos, animTime, uniforms);
      quickRho = quickCheck.x;
      quickS = quickCheck.y;
    }

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
    var causticMultiplier = 1.0;
    var entropyGain = 0.0;
    var spectralEmissionGain = 1.0;
    var spectralOpacityScale = 1.0;
    var vacuumBubbleEmissionGain = 1.0;
    var vacuumBubbleOpacityScale = 1.0;
    var bornNullEmissionGain: f32 = 1.0;
    var bornNullOpacityScale: f32 = 1.0;
    if (volumeWarpEffectsActive) {
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
        if (useAnalyticalDensitySample) {
          let analytical = sampleDensityWithAnalyticalGradientFlow(samplePos, animTime, uniforms);
          quickCheck = vec3f(analytical.rho, analytical.s, analytical.phase);
          gradCache.gradient = analytical.gradient;
          gradCache.pos = samplePos;
          gradCache.valid = true;
          analyticalAtSamplePos = analytical;
          hasAnalytical = true;
        } else {
          quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms);
          gradCache.valid = false;
          hasAnalytical = false;
        }
        quickRho = quickCheck.x;
        quickS = quickCheck.y;
      }
    }

    if (backreactionActive && quickRho >= EMPTY_SKIP_THRESHOLD) {
      let metricGradient = ensureGradient(samplePos, animTime, uniforms, &gradCache);
      let beforeBackreaction = samplePos;
      let metric = applyQuantumBackreactionMetric(
        beforeBackreaction, rayDir, quickRho, quickS, metricGradient, uniforms
      );
      samplePos = metric.position;
      causticMultiplier = metric.caustic;
      if (length(samplePos - beforeBackreaction) > 1e-6) {
        if (useAnalyticalDensitySample) {
          let analytical = sampleDensityWithAnalyticalGradientFlow(samplePos, animTime, uniforms);
          quickCheck = vec3f(analytical.rho, analytical.s, analytical.phase);
          gradCache.gradient = analytical.gradient;
          gradCache.pos = samplePos;
          gradCache.valid = true;
          analyticalAtSamplePos = analytical;
          hasAnalytical = true;
        } else {
          quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms);
          gradCache.valid = false;
          hasAnalytical = false;
        }
        quickRho = quickCheck.x;
        quickS = quickCheck.y;
      }
    }
    if (entropyShearActive && quickRho >= EMPTY_SKIP_THRESHOLD) {
      let entropyGradient = ensureGradient(samplePos, animTime, uniforms, &gradCache);
      let beforeEntropyShear = samplePos;
      let entropyShear = applyEntropicTimeShear(
        samplePos, rayDir, quickRho, quickS, quickCheck.z, entropyGradient, uniforms
      );
      samplePos = entropyShear.position;
      entropyGain = entropyShear.entropyGain;
      if (length(samplePos - beforeEntropyShear) > 1e-6) {
        if (useAnalyticalDensitySample) {
          let analytical = sampleDensityWithAnalyticalGradientFlow(samplePos, animTime, uniforms);
          quickCheck = vec3f(analytical.rho, analytical.s, analytical.phase);
          gradCache.gradient = analytical.gradient;
          gradCache.pos = samplePos;
          gradCache.valid = true;
          analyticalAtSamplePos = analytical;
          hasAnalytical = true;
        } else {
          quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms);
          gradCache.valid = false;
          hasAnalytical = false;
        }
        quickRho = quickCheck.x;
        quickS = quickCheck.y;
      }
    }

    if (spectralFlowActive && quickRho >= EMPTY_SKIP_THRESHOLD) {
      let spectralGradient = ensureGradient(samplePos, animTime, uniforms, &gradCache);
      let beforeSpectralFlow = samplePos;
      let spectralFlow = applySpectralDimensionFlow(
        samplePos, rayDir, quickRho, quickS, spectralGradient, uniforms
      );
      samplePos = spectralFlow.position;
      spectralEmissionGain = spectralFlow.emissionGain;
      spectralOpacityScale = spectralFlow.opacityScale;
      if (length(samplePos - beforeSpectralFlow) > 1e-6) {
        if (useAnalyticalDensitySample) {
          let analytical = sampleDensityWithAnalyticalGradientFlow(samplePos, animTime, uniforms);
          quickCheck = vec3f(analytical.rho, analytical.s, analytical.phase);
          gradCache.gradient = analytical.gradient;
          gradCache.pos = samplePos;
          gradCache.valid = true;
          analyticalAtSamplePos = analytical;
          hasAnalytical = true;
        } else {
          quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms);
          gradCache.valid = false;
          hasAnalytical = false;
        }
        quickRho = quickCheck.x;
        quickS = quickCheck.y;
      }
    }

    if (vacuumBubbleActive && quickRho >= EMPTY_SKIP_THRESHOLD) {
      let beforeVacuumBubble = samplePos;
      let vacuumBubble = applyVacuumBubbleLens(samplePos, rayDir, uniforms);
      samplePos = vacuumBubble.position;
      vacuumBubbleEmissionGain = vacuumBubble.emissionGain;
      vacuumBubbleOpacityScale = vacuumBubble.opacityScale;
      if (length(samplePos - beforeVacuumBubble) > 1e-6) {
        if (useAnalyticalDensitySample) {
          let analytical = sampleDensityWithAnalyticalGradientFlow(samplePos, animTime, uniforms);
          quickCheck = vec3f(analytical.rho, analytical.s, analytical.phase);
          gradCache.gradient = analytical.gradient;
          gradCache.pos = samplePos;
          gradCache.valid = true;
          analyticalAtSamplePos = analytical;
          hasAnalytical = true;
        } else {
          quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms);
          gradCache.valid = false;
          hasAnalytical = false;
        }
        quickRho = quickCheck.x;
        quickS = quickCheck.y;
      }
    }

    // PERF: external gate so the function call disappears when inactive.
    // PERF: gradient sourced from the shared cache when available.
    if (bornNullWeaveActive && quickRho >= EMPTY_SKIP_THRESHOLD) {
      let bornGradient = ensureGradient(samplePos, animTime, uniforms, &gradCache);
      let bornPsi = evalPsi(mapPosToND(samplePos, uniforms), animTime, uniforms);
      let bornNullWeave = applyBornNullWeave(
        samplePos, rayDir, quickRho, quickS, quickCheck.z, bornGradient, bornPsi, uniforms
      );
      bornNullEmissionGain = bornNullWeave.emissionGain;
      bornNullOpacityScale = bornNullWeave.opacityScale;
      let beforeBornNullWeave = samplePos;
      samplePos = bornNullWeave.position;
      if (length(samplePos - beforeBornNullWeave) > 1e-6) {
        if (useAnalyticalDensitySample) {
          let analytical = sampleDensityWithAnalyticalGradientFlow(samplePos, animTime, uniforms);
          quickCheck = vec3f(analytical.rho, analytical.s, analytical.phase);
          gradCache.gradient = analytical.gradient;
          gradCache.pos = samplePos;
          gradCache.valid = true;
          analyticalAtSamplePos = analytical;
          hasAnalytical = true;
        } else {
          quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms);
          gradCache.valid = false;
          hasAnalytical = false;
        }
        quickRho = quickCheck.x;
        quickS = quickCheck.y;
      }
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

    // Two-stage nodal band gate:
    // 1. density/log-density gate rejects invisible low-amplitude samples.
    // 2. nodal-only sample gates color/composite work by faded band intensity.
    // Density gradient stays lazy and is computed later only if downstream work needs it.
    let nodalBandActive = nodalBandEnabled && quickS > -10.0;

    if (skipGradient) {
      rho = quickRho;
      sCenter = quickS;
      phase = quickCheck.z;
      gradient = vec3f(0.0);
    } else if (nodalBandActive && USE_ANALYTICAL_GRADIENT) {
      if (!hasAnalytical) {
        let analytical = sampleDensityWithAnalyticalGradientFlow(samplePos, animTime, uniforms);
        quickCheck = vec3f(analytical.rho, analytical.s, analytical.phase);
        quickRho = analytical.rho;
        quickS = analytical.s;
        gradCache.gradient = analytical.gradient;
        gradCache.pos = samplePos;
        gradCache.valid = true;
        analyticalAtSamplePos = analytical;
        hasAnalytical = true;
      }
      rho = analyticalAtSamplePos.rho;
      sCenter = analyticalAtSamplePos.s;
      phase = analyticalAtSamplePos.phase;
      gradient = analyticalAtSamplePos.gradient;

      let nodalSample = computeNodalFromAnalyticalPsi(
        analyticalAtSamplePos.psi,
        analyticalAtSamplePos.gradPsiRe,
        analyticalAtSamplePos.gradPsiIm,
        uniforms
      );
      let nodalBandIntensityHQ = nodalSample.intensity * nodalSample.envelopeWeight;
      if (nodalBandIntensityHQ > 1e-4) {
        let nodalColor = selectPhysicalNodalColor(uniforms, nodalSample.colorMode, nodalSample.signValue);
        compositeNodalBand(
          nodalBandIntensityHQ, uniforms.nodalStrength, nodalColor,
          min(adaptiveStep, stepLen * 1.5), ambientLight,
          &transmittance, &accColor
        );
      }
    } else {
      rho = quickRho;
      sCenter = quickS;
      phase = quickCheck.z;
      // Lazy: emission lighting only needs this gradient if alpha survives.
      gradient = vec3f(0.0);

      if (nodalBandActive) {
        let nodalSample = computePhysicalNodalField(samplePos, animTime, uniforms);
        let nodalBandIntensityHQ = nodalSample.intensity * nodalSample.envelopeWeight;
        if (nodalBandIntensityHQ > 1e-4) {
          let nodalColor = selectPhysicalNodalColor(uniforms, nodalSample.colorMode, nodalSample.signValue);
          compositeNodalBand(
            nodalBandIntensityHQ, uniforms.nodalStrength, nodalColor,
            min(adaptiveStep, stepLen * 1.5), ambientLight,
            &transmittance, &accColor
          );
        }
      }
    }

    // Hoisted feature gates (see start of function).
    let momentumOverlaySubsample = momentumRepresentation && (i & 3) != 0;
    if (
      probCurrentEnabled &&
      !momentumOverlaySubsample &&
      rho >= probCurrentDensityThreshold
    ) {
      gradient = ensureGradient(samplePos, animTime, uniforms, &gradCache);
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
      rho * spectralOpacityScale * vacuumBubbleOpacityScale * bornNullOpacityScale,
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
      var emissionGradient = gradient;
      if (!skipGradient) {
        emissionGradient = ensureGradient(samplePos, animTime, uniforms, &gradCache);
      }
      let emission = computeEmissionLit(rho, sCenter, phase, samplePos, emissionGradient, viewDir, uniforms)
        * causticMultiplier * bridgeGain * spectralEmissionGain * vacuumBubbleEmissionGain
        * bornNullEmissionGain;
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
