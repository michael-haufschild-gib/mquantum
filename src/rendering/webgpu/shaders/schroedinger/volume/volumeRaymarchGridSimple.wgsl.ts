/**
 * Simplified grid-only volume raymarcher for compute modes.
 *
 * Kept separate from the full grid raymarcher so each shader module stays
 * within lint max-lines while preserving a single exported contract.
 */

/** Generate the simplified grid-only volume raymarching WGSL block. */
export function generateVolumeRaymarchGridSimpleBlock(usePrecomputedNormals = false): string {
  const gradientFetchFn = usePrecomputedNormals
    ? `fn fetchGradient(pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  return sampleNormalFromGrid(pos, uniforms);
}`
    : `fn fetchGradient(pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  return computeGradientFromGrid(pos, uniforms);
}`

  return /* wgsl */ `
// ============================================
// Grid-Based Volume Raymarching (Simplified — compute modes only)
// ============================================

${gradientFetchFn}

// PERF: per-step grid-gradient cache. See volumeRaymarchGrid for rationale.
fn ensureGridGradient(
  pos: vec3f,
  uniforms: SchroedingerUniforms,
  cache: ptr<function, GradientCache>,
) -> vec3f {
  if ((*cache).valid && all(pos == (*cache).pos)) {
    return (*cache).gradient;
  }
  let g = fetchGradient(pos, uniforms);
  (*cache).gradient = g;
  (*cache).pos = pos;
  (*cache).valid = true;
  return g;
}

fn gridOpacityDensity(gridSample: vec4f) -> f32 {
  return select(
    gridSample.r,
    gridSample.a,
    IS_PAULI && !IS_DUAL_CHANNEL && DENSITY_GRID_HAS_PHASE
  );
}

fn gridSkipDensity(gridSample: vec4f) -> f32 {
  let primaryDensity = gridOpacityDensity(gridSample);
  return select(primaryDensity, gridSample.r + gridSample.g, IS_DUAL_CHANNEL);
}

fn gridAdaptiveLogDensity(rho: f32, sCenter: f32) -> f32 {
  if (
    IS_DUAL_CHANNEL
    || (IS_PAULI && !IS_DUAL_CHANNEL && DENSITY_GRID_HAS_PHASE)
    || !DENSITY_GRID_HAS_PHASE
  ) {
    if (rho > 1e-9) { return log(rho); }
    return -20.0;
  }
  return sCenter;
}

// PERF (OPT-PERF-2): consolidate 5 nearly-identical post-warp re-sample blocks
// (bilocal/backreaction/entropy/spectral/vacuumBubble) into one helper function.
// Compute modes never use useRelPhase (they don't write the relativePhase
// channel), so the Simple variant always reads gridSample.b as the phase
// source.
struct GridSampleStateSimple {
  rho: f32,
  sCenter: f32,
  colorRho: f32,
  colorS: f32,
  phase: f32,
  gridSample: vec4f,
}

fn loadGridSampleStateSimple(
  pos: vec3f,
  phaseOffset: f32,
  adsAmplitudeSq: f32,
  uniforms: SchroedingerUniforms
) -> GridSampleStateSimple {
  let gridSample = sampleDensityFromGrid(pos, uniforms);
  var rho = gridOpacityDensity(gridSample) * adsAmplitudeSq;
  var colorRho: f32 = gridSample.r * adsAmplitudeSq;
  var colorS: f32 = 0.0;
  var sCenter: f32;
  if (IS_DUAL_CHANNEL) {
    colorRho = gridSample.r;
    colorS = gridSample.g;
    sCenter = gridSample.g;
    rho = rho + gridSample.g;
  } else if (DENSITY_GRID_HAS_PHASE) {
    sCenter = gridSample.g;
    colorS = sCenter;
  } else {
    if (rho > 1e-9) {
      sCenter = log(rho);
    } else {
      sCenter = -20.0;
    }
    colorS = sCenter;
  }
  var phase: f32 = 0.0;
  if (DENSITY_GRID_HAS_PHASE) {
    phase = gridSample.b - phaseOffset;
  }
  return GridSampleStateSimple(rho, sCenter, colorRho, colorS, phase, gridSample);
}

fn volumeRaymarchGrid(
  rayOrigin: vec3f,
  rayDir: vec3f,
  tNear: f32,
  tFar: f32,
  uniforms: SchroedingerUniforms
) -> VolumeResult {
  var accColor = vec3f(0.0);
  var iterCount: i32 = 0;
  var primaryHitT: f32 = -1.0;

  let safeBoundingRadius = max(abs(uniforms.boundingRadius), 1e-4);
  let maxPathLen = 2.0 * safeBoundingRadius;
  let sampleCount = max(i32(f32(max(uniforms.sampleCount, 1)) * (tFar - tNear) / maxPathLen), 4);
  let stepLen = (tFar - tNear) / f32(sampleCount);
  var t = tNear;
  let viewDir = -rayDir;
  var transmittance: f32 = 1.0;

  var adsAmplitudeSq = 1.0;
  if (FEATURE_ADS_AMPLITUDE) {
    let adsCoshGamma = cosh(uniforms.adsGrowthRate * uniforms.time);
    adsAmplitudeSq = adsCoshGamma * adsCoshGamma;
  }
  var phaseOffset = 0.0;
  if (FEATURE_GRID_PHASE_OFFSET) {
    phaseOffset = (uniforms.wdwPhaseRotationRate + uniforms.adsEnergy) * uniforms.time;
  }
  let invStepLen = 1.0 / max(stepLen, 1e-5);

  let branchColorActive =
    FEATURE_TDSE_BRANCH_COLOR
    && uniforms.branchSeparation > 0.0
    && uniforms.branchTransitionWidth > 0.0;
  let backreactionActive = isQuantumBackreactionActive(uniforms)
    && FEATURE_QUANTUM_BACKREACTION_LENSING;
  let bilocalBridgeActive = isBilocalERBridgeActive(uniforms) && FEATURE_BILOCAL_ER_BRIDGE;
  let entropyShearActive = isEntropicTimeShearActive(uniforms) && FEATURE_ENTROPIC_TIME_SHEAR;
  let spectralFlowActive = isSpectralDimensionFlowActive(uniforms) && FEATURE_SPECTRAL_DIMENSION_FLOW;
  let vacuumBubbleActive = isVacuumBubbleLensActive(uniforms) && FEATURE_VACUUM_BUBBLE_LENS;

  for (var i: i32 = 0; i < MAX_VOLUME_SAMPLES; i++) {
    if (PROFILING_HALF_SAMPLES && i >= 64) { break; }
    if (i >= sampleCount) { break; }
    iterCount = i + 1;

    let remaining = tFar - t;
    if (shouldTerminateRay(transmittance, uniforms.densityGain, max(remaining, 0.0))) { break; }

    let basePos = rayOrigin + rayDir * t;
    var pos = basePos;

    // PERF: per-step gradient cache shared across all spacetime effects.
    var gradCache: GradientCache;
    gradCache.valid = false;

    var _state = loadGridSampleStateSimple(pos, phaseOffset, adsAmplitudeSq, uniforms);
    var gridSample = _state.gridSample;
    var rho = _state.rho;
    var sCenter = _state.sCenter;
    var phase = _state.phase;
    var colorRho = _state.colorRho;
    var colorS = _state.colorS;

    var causticMultiplier = 1.0;
    var bridgeGain = 1.0;
    if (bilocalBridgeActive && rho >= EMPTY_SKIP_THRESHOLD) {
      let remoteEndpoint = vec3f(-basePos.x, basePos.y, basePos.z);
      let remoteGridSample = sampleDensityFromGrid(remoteEndpoint, uniforms);
      // Match local rho amplitude scaling so AdS bridge locking compares like-for-like.
      let remotePrimaryRho = gridOpacityDensity(remoteGridSample) * adsAmplitudeSq;
      let remoteRho = select(remotePrimaryRho, remotePrimaryRho + remoteGridSample.g, IS_DUAL_CHANNEL);
      var localLogDensity = sCenter;
      var remoteLogDensity = remoteGridSample.g;
      if (IS_DUAL_CHANNEL || !DENSITY_GRID_HAS_PHASE) {
        if (rho > 1e-9) {
          localLogDensity = log(rho);
        } else {
          localLogDensity = -20.0;
        }
        if (remoteRho > 1e-9) {
          remoteLogDensity = log(remoteRho);
        } else {
          remoteLogDensity = -20.0;
        }
      }
      let remotePhase = remoteGridSample.b - phaseOffset;
      let bridge = applyBilocalERBridgeTopology(
        pos,
        rayDir,
        rho,
        localLogDensity,
        phase,
        remoteRho,
        remoteLogDensity,
        remotePhase,
        uniforms
      );
      pos = bridge.position;
      bridgeGain = bridge.gain;
      if (length(pos - basePos) > 1e-6) {
        // PERF (OPT-PERF-2): consolidated post-warp re-sample.
        let _resampled = loadGridSampleStateSimple(pos, phaseOffset, adsAmplitudeSq, uniforms);
        gridSample = _resampled.gridSample;
        rho = _resampled.rho;
        sCenter = _resampled.sCenter;
        phase = _resampled.phase;
        colorRho = _resampled.colorRho;
        colorS = _resampled.colorS;
      }
    }

    if (backreactionActive && rho >= EMPTY_SKIP_THRESHOLD) {
      let metricGradient = ensureGridGradient(pos, uniforms, &gradCache);
      let beforeBackreaction = pos;
      let metric = applyQuantumBackreactionMetric(
        beforeBackreaction, rayDir, rho, sCenter, metricGradient, uniforms
      );
      pos = metric.position;
      causticMultiplier = metric.caustic;
      if (length(pos - beforeBackreaction) > 1e-6) {
        // PERF (OPT-PERF-2): consolidated post-warp re-sample.
        let _resampled = loadGridSampleStateSimple(pos, phaseOffset, adsAmplitudeSq, uniforms);
        gridSample = _resampled.gridSample;
        rho = _resampled.rho;
        sCenter = _resampled.sCenter;
        phase = _resampled.phase;
        colorRho = _resampled.colorRho;
        colorS = _resampled.colorS;
      }
    }

    var entropyGain = 0.0;
    if (entropyShearActive && rho >= EMPTY_SKIP_THRESHOLD) {
      let entropyGradient = ensureGridGradient(pos, uniforms, &gradCache);
      var entropyLogDensity = sCenter;
      if (IS_DUAL_CHANNEL) {
        if (rho > 1e-9) {
          entropyLogDensity = log(rho);
        } else {
          entropyLogDensity = -20.0;
        }
      }
      let beforeEntropyShear = pos;
      let entropyShear = applyEntropicTimeShear(
        pos, rayDir, rho, entropyLogDensity, phase, entropyGradient, uniforms
      );
      pos = entropyShear.position;
      entropyGain = entropyShear.entropyGain;
      if (length(pos - beforeEntropyShear) > 1e-6) {
        // PERF (OPT-PERF-2): consolidated post-warp re-sample.
        let _resampled = loadGridSampleStateSimple(pos, phaseOffset, adsAmplitudeSq, uniforms);
        gridSample = _resampled.gridSample;
        rho = _resampled.rho;
        sCenter = _resampled.sCenter;
        phase = _resampled.phase;
        colorRho = _resampled.colorRho;
        colorS = _resampled.colorS;
      }
    }

    var spectralEmissionGain = 1.0;
    var spectralOpacityScale = 1.0;
    if (spectralFlowActive && rho >= EMPTY_SKIP_THRESHOLD) {
      let spectralGradient = ensureGridGradient(pos, uniforms, &gradCache);
      var spectralLogDensity = sCenter;
      if (IS_DUAL_CHANNEL) {
        if (rho > 1e-9) {
          spectralLogDensity = log(rho);
        } else {
          spectralLogDensity = -20.0;
        }
      }
      let beforeSpectralFlow = pos;
      let spectralFlow = applySpectralDimensionFlow(
        pos, rayDir, rho, spectralLogDensity, spectralGradient, uniforms
      );
      pos = spectralFlow.position;
      spectralEmissionGain = spectralFlow.emissionGain;
      spectralOpacityScale = spectralFlow.opacityScale;
      if (length(pos - beforeSpectralFlow) > 1e-6) {
        // PERF (OPT-PERF-2): consolidated post-warp re-sample.
        let _resampled = loadGridSampleStateSimple(pos, phaseOffset, adsAmplitudeSq, uniforms);
        gridSample = _resampled.gridSample;
        rho = _resampled.rho;
        sCenter = _resampled.sCenter;
        phase = _resampled.phase;
        colorRho = _resampled.colorRho;
        colorS = _resampled.colorS;
      }
    }

    var vacuumBubbleEmissionGain = 1.0;
    var vacuumBubbleOpacityScale = 1.0;
    if (vacuumBubbleActive && rho >= EMPTY_SKIP_THRESHOLD) {
      let beforeVacuumBubble = pos;
      let vacuumBubble = applyVacuumBubbleLens(pos, rayDir, uniforms);
      pos = vacuumBubble.position;
      vacuumBubbleEmissionGain = vacuumBubble.emissionGain;
      vacuumBubbleOpacityScale = vacuumBubble.opacityScale;
      if (length(pos - beforeVacuumBubble) > 1e-6) {
        // PERF (OPT-PERF-2): consolidated post-warp re-sample.
        let _resampled = loadGridSampleStateSimple(pos, phaseOffset, adsAmplitudeSq, uniforms);
        gridSample = _resampled.gridSample;
        rho = _resampled.rho;
        sCenter = _resampled.sCenter;
        phase = _resampled.phase;
        colorRho = _resampled.colorRho;
        colorS = _resampled.colorS;
      }
    }

    let hasPotOverlay =
      FEATURE_NEGATIVE_ALPHA_POTENTIAL_OVERLAY && DENSITY_GRID_HAS_PHASE && gridSample.a < -0.01;
    let hasWdwOverlay = FEATURE_WDW_OVERLAY && DENSITY_GRID_HAS_PHASE && gridSample.a > 0.01;

    if (!PROFILING_STRIP_EMPTY_SKIP && rho < EMPTY_SKIP_THRESHOLD && !hasPotOverlay && !hasWdwOverlay) {
      let skipDistance = min(stepLen * EMPTY_SKIP_FACTOR, max(remaining, 0.0));
      if (skipDistance > stepLen) {
        let probeMid = sampleDensityFromGrid(pos + rayDir * (skipDistance * 0.5), uniforms);
        let probeFar = sampleDensityFromGrid(pos + rayDir * skipDistance, uniforms);
        let midHasPot =
          FEATURE_NEGATIVE_ALPHA_POTENTIAL_OVERLAY && DENSITY_GRID_HAS_PHASE && probeMid.a < -0.01;
        let farHasPot =
          FEATURE_NEGATIVE_ALPHA_POTENTIAL_OVERLAY && DENSITY_GRID_HAS_PHASE && probeFar.a < -0.01;
        let midHasWdwOverlay =
          FEATURE_WDW_OVERLAY && DENSITY_GRID_HAS_PHASE && probeMid.a > 0.01;
        let farHasWdwOverlay =
          FEATURE_WDW_OVERLAY && DENSITY_GRID_HAS_PHASE && probeFar.a > 0.01;
        let midTotal = gridSkipDensity(probeMid);
        let farTotal = gridSkipDensity(probeFar);
        if (
          midTotal < EMPTY_SKIP_THRESHOLD && farTotal < EMPTY_SKIP_THRESHOLD
          && !midHasPot && !farHasPot
          && !midHasWdwOverlay && !farHasWdwOverlay
        ) {
          t += skipDistance;
          continue;
        }
      }
    }

    var adaptiveStep: f32;
    if (!PROFILING_STRIP_ADAPTIVE_STEP && !hasPotOverlay) {
      let logRhoForStep = gridAdaptiveLogDensity(rho, sCenter);
      adaptiveStep = computeAdaptiveStep(logRhoForStep, stepLen, remaining);
    } else {
      adaptiveStep = min(stepLen, remaining);
    }

    if (hasPotOverlay) {
      let potColor = vec3f(0.35, 0.45, 0.55);
      let potIntensity = abs(gridSample.a);
      let potOpacity = clamp(potIntensity * 0.06 * transmittance * min(adaptiveStep * invStepLen, 2.0), 0.0, 0.2);
      accColor += transmittance * potOpacity * potColor;
      transmittance *= (1.0 - potOpacity);
    }

    if (hasWdwOverlay) {
      let overlayColor = vec3f(0.96, 0.78, 0.28);
      let overlayOpacity = clamp(gridSample.a * min(adaptiveStep * invStepLen, 2.0) * 0.5, 0.0, 0.35);
      accColor += transmittance * overlayOpacity * overlayColor;
      transmittance *= (1.0 - overlayOpacity);
    }

    let effectiveRho = computeEffectiveDensity(
      rho * spectralOpacityScale * vacuumBubbleOpacityScale,
      phase,
      transmittance,
      uniforms
    );
    let alpha = computeAlpha(effectiveRho, adaptiveStep, uniforms.densityGain);

    let primaryHitThreshold: f32 = 0.01;
    if (alpha > 0.001) {
      if (primaryHitT < 0.0 && alpha > primaryHitThreshold) { primaryHitT = t; }

      if (!PROFILING_STRIP_COMPOSITING) {
        let emissionRho = colorRho;
        let emissionS = colorS;
        var emission: vec3f;
        if (PROFILING_STRIP_LIGHTING) {
          emission = computeBaseColor(emissionRho, emissionS, phase, pos, uniforms);
        } else if (FAST_GRID_EMISSION) {
          emission = computeEmission(emissionRho, emissionS, phase, pos, uniforms);
        } else {
          var gradient: vec3f;
          if (PROFILING_STRIP_GRADIENT) {
            gradient = vec3f(0.0, 1.0, 0.0);
          } else {
            // PERF: reuse cached gradient when an upstream spacetime effect
            // already fetched it at this position.
            gradient = ensureGridGradient(pos, uniforms, &gradCache);
          }
          emission = computeEmissionLit(emissionRho, emissionS, phase, pos, gradient, viewDir, uniforms);
        }
        emission *= causticMultiplier;
        emission *= bridgeGain;
        emission *= spectralEmissionGain;
        emission *= vacuumBubbleEmissionGain;
        emission *= 1.0 + uniforms.entropicTimeShearStrength * max(entropyGain, 0.0) * 0.35;

        if (branchColorActive) {
          let branchFrac = smoothstep(
            uniforms.branchPlaneThreshold - uniforms.branchTransitionWidth,
            uniforms.branchPlaneThreshold + uniforms.branchTransitionWidth,
            pos.x
          );
          let branchColor = mix(uniforms.branchColorA, uniforms.branchColorB, branchFrac);
          let lum = dot(emission, LUMA_WEIGHTS);
          emission = branchColor * lum;
        }

        accColor += transmittance * alpha * emission;
      }
      transmittance *= (1.0 - alpha);
    }

    t += adaptiveStep;
  }

  let finalAlpha = 1.0 - transmittance;
  if (primaryHitT < 0.0) {
    primaryHitT = (tNear + tFar) * 0.5;
  }
  return VolumeResult(accColor, finalAlpha, iterCount, primaryHitT);
}
`
}
