/**
 * Grid-Based Volume Raymarching
 *
 * Uses pre-computed 3D density grid texture instead of inline wavefunction evaluation.
 * Extracted from integration.wgsl.ts for file-size management.
 *
 * Two variants:
 * - Full: all features (analytical modes with density grid)
 * - Simple: stripped for gridOnly compute modes (TDSE/BEC/Dirac/FSF/QW)
 *   Removes dead branches that trigger Metal shader compiler miscompilation
 *   on Apple Silicon when combined with heavy register pressure from the
 *   complex full loop body.
 *
 * Profiling strip flags (compile-time, dead-code-eliminated when false):
 * - PROFILING_STRIP_GRADIENT: replace 6-fetch gradient with constant normal
 * - PROFILING_STRIP_LIGHTING: replace lit emission with flat baseColor
 * - PROFILING_STRIP_EMPTY_SKIP: disable empty-region skip (force all samples to evaluate)
 * - PROFILING_STRIP_ADAPTIVE_STEP: force stepMultiplier=1 (uniform stepping)
 * - PROFILING_STRIP_COMPOSITING: skip gradient+emission+compositing entirely
 * - PROFILING_HALF_SAMPLES: cap iteration budget at 64 instead of 128
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGrid.wgsl
 */
import { volumeRaymarchGridHelpersBlock } from './volumeRaymarchGridHelpers.wgsl'

export { generateVolumeRaymarchGridSimpleBlock } from './volumeRaymarchGridSimple.wgsl'

/**
 * Generate the full-featured grid-based volume raymarching block.
 *
 * Used by analytical modes (HO, hydrogen) with density grid, which need
 * all feature overlays (nodal, uncertainty boundary, probability current,
 * radial probability, cross-section, dual-channel).
 */
export function generateVolumeRaymarchGridBlock(usePrecomputedNormals: boolean): string {
  // Generate the gradient fetch function — either delegates to the precomputed
  // normal grid (1 texture fetch) or the inline central differences (6 fetches).
  // This avoids referencing sampleNormalFromGrid when the binding doesn't exist.
  const gradientFetchFn = usePrecomputedNormals
    ? `fn fetchGradient(pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  return sampleNormalFromGrid(pos, uniforms);
}`
    : `fn fetchGradient(pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  return computeGradientFromGrid(pos, uniforms);
}`

  return /* wgsl */ `
// ============================================
// Grid-Based Volume Raymarching
// ============================================

// Gradient fetch: generated to avoid referencing undeclared normal-grid bindings.
${gradientFetchFn}

${volumeRaymarchGridHelpersBlock}

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
  let primaryHitThreshold: f32 = 0.01;

  // Sample count scaled by per-pixel path length to keep step SIZE constant
  let maxPathLen = 2.0 * uniforms.boundingRadius;
  let sampleCount = max(i32(f32(max(uniforms.sampleCount, 1)) * (tFar - tNear) / maxPathLen), 4);
  let stepLen = (tFar - tNear) / f32(sampleCount);
  var t = tNear;

  let animTime = getVolumeTime(uniforms);
  let viewDir = -rayDir;
  let ambientLight = lighting.ambientColor * lighting.ambientIntensity;

  var transmittance: f32 = 1.0;

  // PERF: Hoist loop-invariant AdS + phase-rotation uniforms out of the
  // per-sample loop. Mirrors the Simple variant above. These evaluate to
  // identity values (1.0 for adsAmplitudeSq, 0.0 for phaseOffset) for every
  // non-AdS analytical mode because adsGrowthRate, wdwPhaseRotationRate, and
  // adsEnergy are zero outside their owning quantum modes.
  let adsCoshGamma = cosh(uniforms.adsGrowthRate * uniforms.time);
  let adsAmplitudeSq = adsCoshGamma * adsCoshGamma;
  let phaseOffset = (uniforms.wdwPhaseRotationRate + uniforms.adsEnergy) * uniforms.time;

  // PERF: Hoist 1/stepLen for the potential-overlay opacity clamp (mirrors
  // Simple variant). stepLen is constant per ray; the per-iteration division
  // would otherwise run up to 128 times per pixel.
  let invStepLen = 1.0 / max(stepLen, 1e-5);

  // PERF: hoist mode-only uniforms out of the per-sample loop.
  let isWdwMode = uniforms.quantumMode == 9;
  let branchColorActive =
    uniforms.quantumMode == 3
    && uniforms.branchSeparation > 0.5
    && uniforms.branchTransitionWidth > 0.0;
  let backreactionActive = isQuantumBackreactionActive(uniforms);
  let bilocalBridgeActive = isBilocalERBridgeActive(uniforms);
  let entropyShearActive = isEntropicTimeShearActive(uniforms);
  let spectralFlowActive = isSpectralDimensionFlowActive(uniforms);
  let vacuumBubbleActive = isVacuumBubbleLensActive(uniforms);

  // PERF (OPT-PERF-1): hoist useRelPhase out of the per-step loop. Loop-invariant —
  // depends on compile-time COLOR_ALGORITHM and the current quantumMode uniform.
  // Was recomputed up to 6× per ray step (initial + 5 post-warp re-samples) on
  // every fragment; with all warps active that adds 6 * 128 = 768 redundant
  // boolean compares per pixel. quantumMode is i32 so compare with signed
  // literals rather than u32 suffixes.
  // Only the three analytical modes write relativePhase into the A channel of
  // the density grid (see compute/densityGrid.wgsl.ts, sampleDensityWithPhaseComponents):
  //   mode 0 = harmonicOscillator
  //   mode 1 = hydrogenND
  //   mode 7 = hydrogenNDCoupled
  // Every other mode stores something else in A — AdS (8) and WdW (9) pack
  // overlay alpha; TDSE/BEC/Dirac/QW/FSF pack total density or a potential-overlay
  // sentinel; open quantum mode stores coherenceFraction. Default to the
  // spatial-phase (B) channel for every mode outside the analytical whitelist.
  let useRelPhaseGlobal =
    (COLOR_ALGORITHM == 10)
    && (uniforms.quantumMode == 0
        || uniforms.quantumMode == 1
        || uniforms.quantumMode == 7);

  for (var i: i32 = 0; i < MAX_VOLUME_SAMPLES; i++) {
    if (PROFILING_HALF_SAMPLES && i >= 64) { break; }
    if (i >= sampleCount) { break; }
    iterCount = i + 1;

    // PERF: cache tFar - t once per iter. Used 3+ times below.
    let remaining = tFar - t;
    if (shouldTerminateRay(transmittance, uniforms.densityGain, max(remaining, 0.0))) { break; }

    let basePos = rayOrigin + rayDir * t;
    var pos = basePos;

    // PERF: per-step gradient cache shared across all spacetime effects.
    var gradCache: GradientCache; gradCache.valid = false;

    // PERF (OPT-PERF-2): consolidate initial grid load + post-warp re-samples
    // into loadGridSampleState (defined in volumeRaymarchGridHelpers).
    // Was 6 nearly-identical 30-line blocks duplicated across the warp chain.
    var state = loadGridSampleState(pos, useRelPhaseGlobal, phaseOffset, adsAmplitudeSq, uniforms);
    var gridSample = state.gridSample;
    var rho = state.rho;
    var sCenter = state.sCenter;
    var colorRho = state.colorRho;
    var colorS = state.colorS;
    var phase = state.phase;

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
      if (IS_DUAL_CHANNEL) {
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
      var remotePhase: f32;
      if (DENSITY_GRID_HAS_PHASE) {
        remotePhase = remoteGridSample.b - phaseOffset;
      } else {
        remotePhase = 0.0;
      }
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
        let _resampled = loadGridSampleState(pos, useRelPhaseGlobal, phaseOffset, adsAmplitudeSq, uniforms);
        gridSample = _resampled.gridSample;
        rho = _resampled.rho;
        sCenter = _resampled.sCenter;
        colorRho = _resampled.colorRho;
        colorS = _resampled.colorS;
        phase = _resampled.phase;
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
        let _resampled = loadGridSampleState(pos, useRelPhaseGlobal, phaseOffset, adsAmplitudeSq, uniforms);
        gridSample = _resampled.gridSample;
        rho = _resampled.rho;
        sCenter = _resampled.sCenter;
        colorRho = _resampled.colorRho;
        colorS = _resampled.colorS;
        phase = _resampled.phase;
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
        let _resampled = loadGridSampleState(pos, useRelPhaseGlobal, phaseOffset, adsAmplitudeSq, uniforms);
        gridSample = _resampled.gridSample;
        rho = _resampled.rho;
        sCenter = _resampled.sCenter;
        colorRho = _resampled.colorRho;
        colorS = _resampled.colorS;
        phase = _resampled.phase;
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
        let _resampled = loadGridSampleState(pos, useRelPhaseGlobal, phaseOffset, adsAmplitudeSq, uniforms);
        gridSample = _resampled.gridSample;
        rho = _resampled.rho;
        sCenter = _resampled.sCenter;
        colorRho = _resampled.colorRho;
        colorS = _resampled.colorS;
        phase = _resampled.phase;
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
        let _resampled = loadGridSampleState(pos, useRelPhaseGlobal, phaseOffset, adsAmplitudeSq, uniforms);
        gridSample = _resampled.gridSample;
        rho = _resampled.rho;
        sCenter = _resampled.sCenter;
        colorRho = _resampled.colorRho;
        colorS = _resampled.colorS;
        phase = _resampled.phase;
      }
    }

    // Apply uncertainty boundary emphasis (matches inline sampleDensityWithPhase path)
    // PERF: Only recompute log(rho) when emphasis actually modifies rho
    // Skip for dual-channel modes since sCenter is secondary density, not logRho.
    if (FEATURE_UNCERTAINTY_BOUNDARY && !IS_DUAL_CHANNEL) {
      rho = applyUncertaintyBoundaryEmphasis(rho, sCenter, uniforms);
      // Update logRho to reflect emphasis. Branch so log() is not evaluated on
      // near-zero rho when emphasis leaves a region dim.
      if (rho > 1e-9) {
        sCenter = log(rho);
      } else {
        sCenter = -20.0;
      }
      colorRho = rho;
      colorS = sCenter;
    }

    // Skip near-zero density regions (but not potential overlay regions).
    // Compute mode alpha dual-encoding: .a >= 0 → raw density, .a < 0 → -potOverlay.
    // For HO/hydrogen modes, alpha is relativePhase (always >= 0).
    // Pauli spinor: alpha is total density — skip potential check.
    let hasPotOverlay = IS_FREE_SCALAR && !IS_PAULI && DENSITY_GRID_HAS_PHASE && gridSample.a < -0.01;
    // Wheeler-DeWitt overlay: A > 0 carries streamline / SRMT overlay alpha
    // (packer stores the max of the two alphas in [0, 1]). Must protect
    // overlay cells from empty-skip when rho = 0. isWdwMode hoisted above.
    let hasWdwOverlay = DENSITY_GRID_HAS_PHASE && isWdwMode && gridSample.a > 0.01;
    if (!PROFILING_STRIP_EMPTY_SKIP && rho < EMPTY_SKIP_THRESHOLD && !hasPotOverlay && !hasWdwOverlay) {
      let skipDistance = min(stepLen * EMPTY_SKIP_FACTOR, max(remaining, 0.0));
      if (skipDistance > stepLen) {
        let probeMid = sampleDensityFromGrid(pos + rayDir * (skipDistance * 0.5), uniforms);
        let probeFar = sampleDensityFromGrid(pos + rayDir * skipDistance, uniforms);
        let midHasPot = IS_FREE_SCALAR && !IS_PAULI && DENSITY_GRID_HAS_PHASE && probeMid.a < -0.01;
        let farHasPot = IS_FREE_SCALAR && !IS_PAULI && DENSITY_GRID_HAS_PHASE && probeFar.a < -0.01;
        let midHasWdwOverlay = DENSITY_GRID_HAS_PHASE && isWdwMode && probeMid.a > 0.01;
        let farHasWdwOverlay = DENSITY_GRID_HAS_PHASE && isWdwMode && probeFar.a > 0.01;
        // For dual-channel modes, include secondary density (G channel) in skip check
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

    // Adaptive step size based on log-density.
    // For dual-channel modes, sCenter is secondary density [0,1], not logRho [-20,0].
    // Use logRho of total density for adaptive stepping. select() would evaluate log(rho)
    // unconditionally -- the branch below skips the log entirely when rho is near-zero
    // (common in empty regions, where the raymarch spends most of its iterations).
    var adaptiveStep: f32;
    if (!PROFILING_STRIP_ADAPTIVE_STEP && !hasPotOverlay) {
      let logRhoForStep = gridAdaptiveLogDensity(rho, sCenter);
      adaptiveStep = computeAdaptiveStep(logRhoForStep, stepLen, remaining);
    } else {
      adaptiveStep = min(stepLen, remaining);
    }

    // Potential overlay: render V(x) as a solid semi-transparent wall.
    // Alpha dual-encoding: .a < 0 encodes -potOverlay from the write-grid shader.
    // For HO/hydrogen modes, alpha is relativePhase (>= 0) — never triggers.
    // For Pauli spinor mode, alpha encodes total density (>= 0) — never triggers.
    // Reuse the hasPotOverlay boolean (computed above) to avoid re-checking 4 conditions.
    if (hasPotOverlay) {
      let potColor = vec3f(0.35, 0.45, 0.55);
      let potIntensity = abs(gridSample.a);
      // Scale opacity by current transmittance: first samples contribute strongly,
      // deep samples contribute progressively less — prevents thick potential regions
      // (step, harmonic) from going fully opaque while keeping thin barriers visible.
      let potOpacity = clamp(potIntensity * 0.06 * transmittance * min(adaptiveStep * invStepLen, 2.0), 0.0, 0.2);
      accColor += transmittance * potOpacity * potColor;
      transmittance *= (1.0 - potOpacity);
    }

    // Wheeler-DeWitt overlay (streamlines + SRMT heatmap). Composited
    // additively BEFORE the density-driven alpha so overlays remain
    // visible even on cells where rho = 0 — and so overlays never flow
    // into densityGain / densityContrast / empty-skip / adaptive-step
    // (which would be the case if overlay values lived in R/G).
    if (hasWdwOverlay) {
      let overlayColor = vec3f(0.96, 0.78, 0.28);
      let overlayOpacity = clamp(gridSample.a * min(adaptiveStep * invStepLen, 2.0) * 0.5, 0.0, 0.35);
      accColor += transmittance * overlayOpacity * overlayColor;
      transmittance *= (1.0 - overlayOpacity);
    }

    // Nodal surface overlay (uses inline evaluation, not grid)
    if (
      FEATURE_NODAL &&
      uniforms.nodalEnabled != 0u &&
      uniforms.nodalStrength > 0.0 &&
      activeNodalRenderMode(uniforms) == NODAL_RENDER_MODE_BAND
    ) {
      var nodal: NodalSample;
      if (canUseGridPsiAbsNodal(uniforms)) {
        nodal = computeGridPsiAbsNodalField(pos, rho, uniforms, &gradCache);
      } else {
        nodal = computePhysicalNodalField(pos, animTime, uniforms);
      }
      let fadedIntensity = nodal.intensity * nodal.envelopeWeight;
      if (fadedIntensity > 1e-4) {
        let nodalColor = selectPhysicalNodalColor(uniforms, nodal.colorMode, nodal.signValue);
        compositeNodalBand(
          fadedIntensity, uniforms.nodalStrength, nodalColor,
          min(adaptiveStep, stepLen * 1.5), ambientLight,
          &transmittance, &accColor
        );
      }
    }

    // Probability current overlay
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
      let normalProxy = normalize(pos + vec3f(1e-6, 0.0, 0.0));
      let currentSample = sampleProbabilityCurrent(pos, animTime, uniforms);
      let currentOverlay = computeProbabilityCurrentOverlay(
        pos, currentSample, rho, normalProxy, viewDir, uniforms
      );
      compositeOverlay(currentOverlay, adaptiveStep, invStepLen, 0.45, &transmittance, &accColor);
    }

    // Radial probability overlay (hydrogen P(r) shells)
    if (FEATURE_RADIAL_PROBABILITY && uniforms.radialProbabilityEnabled != 0u) {
      let rProbOverlay = computeRadialProbabilityOverlay(pos, uniforms);
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
      if (primaryHitT < 0.0 && alpha > primaryHitThreshold) {
        primaryHitT = t;
      }

      if (!PROFILING_STRIP_COMPOSITING) {
        // Gradient normal: use pre-computed normal grid (1 fetch) or inline central
        // differences (6 fetches). Pre-computed saves ~0.4-1.6ms at Retina resolution.
        // Note: sampleNormalFromGrid is called via the PRECOMPUTED_GRADIENT macro
        // to avoid referencing an undeclared function when the normal grid binding
        // is not included (compute modes).
        var gradient: vec3f;
        if (PROFILING_STRIP_GRADIENT) {
          gradient = vec3f(0.0, 1.0, 0.0); // profiling: constant up-normal
        } else {
          // PERF: when an upstream spacetime effect already fetched the
          // gradient at this position, reuse it.
          gradient = ensureGridGradient(pos, uniforms, &gradCache);
        }

        // Compute emission with lighting
        var emission: vec3f;
        if (PROFILING_STRIP_LIGHTING) {
          emission = computeBaseColor(colorRho, colorS, phase, pos, uniforms);
        } else {
          // For algo 23: pass particle (colorRho) and antiparticle (colorS) to color function.
          // For other algos: colorRho == rho and colorS == sCenter (no difference).
          emission = computeEmissionLit(colorRho, colorS, phase, pos, gradient, viewDir, uniforms);
        }
        emission *= causticMultiplier;
        emission *= bridgeGain;
        emission *= spectralEmissionGain;
        emission *= vacuumBubbleEmissionGain;
        emission *= 1.0 + uniforms.entropicTimeShearStrength * max(entropyGain, 0.0) * 0.35;

        // Branch coloring: when alpha encodes branch fraction (2.0 + frac),
        // tint emission toward branch A or branch B color.
        // Guard: only TDSE dynamics (mode 3) produces branch-encoded alpha.
        // branchSeparation > 0.5 means stochastic decoherence is active (γ > 0).
        // Without this guard, enabling "show branches" at γ=0 would recolor
        // the volume without any actual decoherence happening. branchColorActive
        // hoisted above the loop (uniforms-only).
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

        // Front-to-back compositing
        accColor += transmittance * alpha * emission;
      }
      transmittance *= (1.0 - alpha);
    }

    t += adaptiveStep;
  }

  // Final alpha
  let finalAlpha = 1.0 - transmittance;
  if (primaryHitT < 0.0) {
    primaryHitT = (tNear + tFar) * 0.5;
  }

  return VolumeResult(accColor, finalAlpha, iterCount, primaryHitT);
}
`
}
