/**
 * Grid-Based Volume Raymarching
 *
 * Uses pre-computed 3D density grid texture instead of inline wavefunction evaluation.
 * Extracted from integration.wgsl.ts for file-size management.
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

/**
 *
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

// Gradient fetch: delegates to precomputed normal grid or inline central differences.
// Generated at shader composition time to avoid referencing undeclared bindings.
${gradientFetchFn}

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

  // Profiling: iteration budget override
  let maxIter = select(MAX_VOLUME_SAMPLES, 64, PROFILING_HALF_SAMPLES);

  for (var i: i32 = 0; i < MAX_VOLUME_SAMPLES; i++) {
    if (PROFILING_HALF_SAMPLES && i >= 64) { break; }
    if (i >= sampleCount) { break; }
    iterCount = i + 1;

    if (shouldTerminateRay(transmittance, uniforms.densityGain, max(tFar - t, 0.0))) { break; }

    let pos = rayOrigin + rayDir * t;

    // Sample density from pre-computed 3D grid texture
    // Returns (rho, logRho, spatialPhase, relativePhase) for rgba16float
    // Returns (rho, 0, 0, 0) for r16float
    let gridSample = sampleDensityFromGrid(pos, uniforms);
    var rho = gridSample.r;

    // For dual-channel modes (Dirac particle/antiparticle, Pauli spin-up/down):
    //   R = primary density, G = secondary density (NOT logRho)
    //   Opacity/absorption must use total density (R + G) so that
    //   secondary-only regions remain visible.
    //   colorRho/colorS preserve the raw channels for computeBaseColor.
    // For all other modes: G = logRho as usual.
    var sCenter: f32;
    var colorRho: f32 = rho;
    var colorS: f32 = 0.0;
    if (IS_DUAL_CHANNEL) {
      colorS = gridSample.g;        // secondary density for computeBaseColor 's'
      sCenter = gridSample.g;       // (also kept in sCenter for backward compat)
      rho = rho + gridSample.g;     // total density for alpha/skip/adaptive stepping
      colorRho = gridSample.r;      // primary density for computeBaseColor 'rho'
    } else if (DENSITY_GRID_HAS_PHASE) {
      sCenter = gridSample.g; // logRho from grid
      colorS = sCenter;
    } else {
      sCenter = select(-20.0, log(rho), rho > 1e-9);
      colorS = sCenter;
    }

    // Phase: choose spatial (B) or relative (A) based on compile-time color algorithm.
    var phase: f32;
    if (DENSITY_GRID_HAS_PHASE) {
      phase = select(gridSample.b, gridSample.a, COLOR_ALGORITHM == 10);
    } else {
      phase = 0.0;
    }

    // Apply uncertainty boundary emphasis (matches inline sampleDensityWithPhase path)
    // PERF: Only recompute log(rho) when emphasis actually modifies rho
    // Skip for dual-channel modes since sCenter is secondary density, not logRho.
    if (FEATURE_UNCERTAINTY_BOUNDARY && !IS_DUAL_CHANNEL) {
      rho = applyUncertaintyBoundaryEmphasis(rho, sCenter, uniforms);
      // Update logRho to reflect emphasis so emission color/brightness matches inline path
      // (computeBaseColor uses s for color mapping: normalized = clamp((s+8)/8, 0, 1))
      sCenter = select(-20.0, log(rho), rho > 1e-9);
      colorRho = rho;
      colorS = sCenter;
    }

    // Skip near-zero density regions (but not potential overlay regions).
    // Compute mode alpha dual-encoding: .a >= 0 → raw density, .a < 0 → -potOverlay.
    // For HO/hydrogen modes, alpha is relativePhase (always >= 0).
    // Pauli spinor: alpha is total density — skip potential check.
    let hasPotOverlay = IS_FREE_SCALAR && !IS_PAULI && DENSITY_GRID_HAS_PHASE && gridSample.a < -0.01;
    if (!PROFILING_STRIP_EMPTY_SKIP && rho < EMPTY_SKIP_THRESHOLD && !hasPotOverlay) {
      let skipDistance = min(stepLen * EMPTY_SKIP_FACTOR, max(tFar - t, 0.0));
      if (skipDistance > stepLen) {
        let probeMid = sampleDensityFromGrid(pos + rayDir * (skipDistance * 0.5), uniforms);
        let probeFar = sampleDensityFromGrid(pos + rayDir * skipDistance, uniforms);
        let midHasPot = IS_FREE_SCALAR && !IS_PAULI && DENSITY_GRID_HAS_PHASE && probeMid.a < -0.01;
        let farHasPot = IS_FREE_SCALAR && !IS_PAULI && DENSITY_GRID_HAS_PHASE && probeFar.a < -0.01;
        // For dual-channel modes, include secondary density (G channel) in skip check
        let midTotal = select(probeMid.r, probeMid.r + probeMid.g, IS_DUAL_CHANNEL);
        let farTotal = select(probeFar.r, probeFar.r + probeFar.g, IS_DUAL_CHANNEL);
        if (midTotal < EMPTY_SKIP_THRESHOLD && farTotal < EMPTY_SKIP_THRESHOLD && !midHasPot && !farHasPot) {
          t += skipDistance;
          continue;
        }
      }
    }

    // Adaptive step size based on log-density.
    // For dual-channel modes, sCenter is secondary density [0,1], not logRho [-20,0].
    // Use logRho of total density for adaptive stepping.
    var adaptiveStep: f32;
    if (!PROFILING_STRIP_ADAPTIVE_STEP && !hasPotOverlay) {
      let logRhoForStep = select(sCenter, select(-20.0, log(rho), rho > 1e-9), IS_DUAL_CHANNEL);
      adaptiveStep = computeAdaptiveStep(logRhoForStep, stepLen, tFar - t);
    } else {
      adaptiveStep = min(stepLen, tFar - t);
    }

    // Potential overlay: render V(x) as a solid semi-transparent wall.
    // Alpha dual-encoding: .a < 0 encodes -potOverlay from the write-grid shader.
    // For HO/hydrogen modes, alpha is relativePhase (>= 0) — never triggers.
    // For Pauli spinor mode, alpha encodes total density (>= 0) — never triggers.
    if (IS_FREE_SCALAR && !IS_PAULI && DENSITY_GRID_HAS_PHASE && gridSample.a < -0.01) {
      let potColor = vec3f(0.35, 0.45, 0.55);
      let potIntensity = abs(gridSample.a);
      // Scale opacity by current transmittance: first samples contribute strongly,
      // deep samples contribute progressively less — prevents thick potential regions
      // (step, harmonic) from going fully opaque while keeping thin barriers visible.
      let potOpacity = clamp(potIntensity * 0.06 * transmittance * min(adaptiveStep / max(stepLen, 1e-5), 2.0), 0.0, 0.2);
      accColor += transmittance * potOpacity * potColor;
      transmittance *= (1.0 - potOpacity);
    }

    // Nodal surface overlay (uses inline evaluation, not grid)
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
      compositeOverlay(currentOverlay, adaptiveStep, stepLen, 0.45, &transmittance, &accColor);
    }

    // Radial probability overlay (hydrogen P(r) shells)
    if (FEATURE_RADIAL_PROBABILITY && uniforms.radialProbabilityEnabled != 0u) {
      let rProbOverlay = computeRadialProbabilityOverlay(pos, uniforms);
      compositeOverlay(rProbOverlay, adaptiveStep, stepLen, 0.5, &transmittance, &accColor);
    }

    let effectiveRho = computeEffectiveDensity(rho, phase, transmittance, uniforms);
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
          gradient = fetchGradient(pos, uniforms);
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

        // Branch coloring: when alpha encodes branch fraction (2.0 + frac),
        // tint emission toward branch A or branch B color.
        // Guard: only TDSE dynamics (mode 3) produces branch-encoded alpha.
        // branchSeparation > 0.5 means stochastic decoherence is active (γ > 0).
        // Without this guard, enabling "show branches" at γ=0 would recolor
        // the volume without any actual decoherence happening.
        if (uniforms.quantumMode == 3 && gridSample.a >= 1.99 && uniforms.branchSeparation > 0.5) {
          let branchFrac = clamp(gridSample.a - 2.0, 0.0, 1.0);
          let branchColorA = vec3f(uniforms.branchColorA[0], uniforms.branchColorA[1], uniforms.branchColorA[2]);
          let branchColorB = vec3f(uniforms.branchColorB[0], uniforms.branchColorB[1], uniforms.branchColorB[2]);
          let branchColor = mix(branchColorA, branchColorB, branchFrac);
          let lum = dot(emission, vec3f(0.2126, 0.7152, 0.0722));
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
