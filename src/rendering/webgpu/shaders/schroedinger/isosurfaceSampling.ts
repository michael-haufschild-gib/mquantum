/**
 * Isosurface Density Sampling Helpers
 *
 * Shared TypeScript generators for conditional WGSL density sampling blocks
 * used by both mainIsosurface.wgsl.ts and mainIsosurfaceTemporal.wgsl.ts.
 *
 * Each function returns a WGSL code snippet that either samples from the
 * pre-computed density grid (when useDensityGrid=true) or evaluates inline
 * (when false), with appropriate uncertainty boundary emphasis handling.
 *
 * @module rendering/webgpu/shaders/schroedinger/isosurfaceSampling
 */

/**
 * Generate WGSL helpers that keep isosurface sampling consistent with
 * volumetric spacetime-lens effects. The helpers return the density used
 * for threshold tests plus the warped sample position used for final
 * surface color/normal evaluation.
 */
export function generateIsosurfaceSpacetimeHelpers(): string {
  return /* wgsl */ `
struct IsosurfaceHitState {
  samplePos: vec3f,
  hitRho: f32,
  rawRho: f32,
  rawS: f32,
  phase: f32,
  emissionGain: f32,
}

fn isosurfaceLogFromRho(rho: f32) -> f32 {
  if (rho > 1e-9) { return log(rho); }
  return -20.0;
}

fn isosurfaceUsesRelativePhase(uniforms: SchroedingerUniforms) -> bool {
  return (COLOR_ALGORITHM == 10)
    && (uniforms.quantumMode == 0
        || uniforms.quantumMode == 1
        || uniforms.quantumMode == 7);
}

fn sampleIsosurfaceHitState(
  pos: vec3f,
  animTime: f32,
  isoGain: f32,
  uniforms: SchroedingerUniforms
) -> IsosurfaceHitState {
  var rawRho: f32;
  var rawS: f32;
  var phase: f32 = 0.0;

  if (USE_DENSITY_GRID) {
    let gridSample = sampleDensityFromGrid(pos, uniforms);
    let primaryRho = select(
      gridSample.r,
      gridSample.a,
      IS_PAULI && !IS_DUAL_CHANNEL && DENSITY_GRID_HAS_PHASE
    );
    rawRho = select(primaryRho, gridSample.r + gridSample.g, IS_DUAL_CHANNEL);
    if (IS_DUAL_CHANNEL || (IS_PAULI && !IS_DUAL_CHANNEL) || !DENSITY_GRID_HAS_PHASE) {
      rawS = isosurfaceLogFromRho(rawRho);
    } else {
      rawS = gridSample.g;
    }
    if (DENSITY_GRID_HAS_PHASE) {
      phase = select(gridSample.b, gridSample.a, isosurfaceUsesRelativePhase(uniforms));
    }
  } else {
    let densityInfo = sampleDensityWithPhase(pos, animTime, uniforms);
    rawRho = densityInfo.x;
    rawS = densityInfo.y;
    phase = densityInfo.z;
  }

  var hitRho = rawRho * isoGain;
  if (FEATURE_UNCERTAINTY_BOUNDARY && !IS_DUAL_CHANNEL) {
    hitRho = applyUncertaintyBoundaryEmphasis(hitRho, sFromRho(hitRho), uniforms);
  }

  return IsosurfaceHitState(pos, hitRho, rawRho, rawS, phase, 1.0);
}

fn sampleIsosurfaceGradient(
  pos: vec3f,
  animTime: f32,
  uniforms: SchroedingerUniforms
) -> vec3f {
  if (USE_DENSITY_GRID) {
    return computeGradientFromGrid(pos, uniforms);
  }
  if (USE_ANALYTICAL_GRADIENT) {
    return computeAnalyticalGradient(pos, animTime, uniforms);
  }
  return computeGradientTetrahedral(pos, animTime, uniforms.boundingRadius * 0.005, uniforms);
}

fn sampleIsosurfaceWithSpacetimeWarp(
  rayPos: vec3f,
  rayDir: vec3f,
  animTime: f32,
  isoGain: f32,
  uniforms: SchroedingerUniforms
) -> IsosurfaceHitState {
  var state = sampleIsosurfaceHitState(rayPos, animTime, isoGain, uniforms);
  var pos = rayPos;
  var emissionGain = 1.0;

  if (state.rawRho < EMPTY_SKIP_THRESHOLD) {
    state.emissionGain = emissionGain;
    return state;
  }

  if (FEATURE_BILOCAL_ER_BRIDGE && isBilocalERBridgeActive(uniforms)) {
    let remoteEndpoint = vec3f(-pos.x, pos.y, pos.z);
    let remoteState = sampleIsosurfaceHitState(remoteEndpoint, animTime, isoGain, uniforms);
    let bridge = applyBilocalERBridgeTopology(
      pos,
      rayDir,
      state.rawRho,
      state.rawS,
      state.phase,
      remoteState.rawRho,
      remoteState.rawS,
      remoteState.phase,
      uniforms
    );
    let beforeBridge = pos;
    pos = bridge.position;
    emissionGain *= bridge.gain;
    if (length(pos - beforeBridge) > 1e-6) {
      state = sampleIsosurfaceHitState(pos, animTime, isoGain, uniforms);
    }
  }

  if (
    state.rawRho >= EMPTY_SKIP_THRESHOLD &&
    FEATURE_QUANTUM_BACKREACTION_LENSING &&
    isQuantumBackreactionActive(uniforms)
  ) {
    let metricGradient = sampleIsosurfaceGradient(pos, animTime, uniforms);
    let metric = applyQuantumBackreactionMetric(
      pos,
      rayDir,
      state.rawRho,
      state.rawS,
      metricGradient,
      uniforms
    );
    let beforeBackreaction = pos;
    pos = metric.position;
    emissionGain *= metric.caustic;
    if (length(pos - beforeBackreaction) > 1e-6) {
      state = sampleIsosurfaceHitState(pos, animTime, isoGain, uniforms);
    }
  }

  if (
    state.rawRho >= EMPTY_SKIP_THRESHOLD &&
    FEATURE_ENTROPIC_TIME_SHEAR &&
    isEntropicTimeShearActive(uniforms)
  ) {
    let entropyGradient = sampleIsosurfaceGradient(pos, animTime, uniforms);
    let entropyShear = applyEntropicTimeShear(
      pos,
      rayDir,
      state.rawRho,
      state.rawS,
      state.phase,
      entropyGradient,
      uniforms
    );
    let beforeEntropy = pos;
    pos = entropyShear.position;
    emissionGain *= 1.0 + uniforms.entropicTimeShearStrength * max(entropyShear.entropyGain, 0.0) * 0.35;
    if (length(pos - beforeEntropy) > 1e-6) {
      state = sampleIsosurfaceHitState(pos, animTime, isoGain, uniforms);
    }
  }

  if (
    state.rawRho >= EMPTY_SKIP_THRESHOLD &&
    FEATURE_SPECTRAL_DIMENSION_FLOW &&
    isSpectralDimensionFlowActive(uniforms)
  ) {
    let spectralGradient = sampleIsosurfaceGradient(pos, animTime, uniforms);
    let spectralFlow = applySpectralDimensionFlow(
      pos,
      rayDir,
      state.rawRho,
      state.rawS,
      spectralGradient,
      uniforms
    );
    let beforeSpectral = pos;
    pos = spectralFlow.position;
    emissionGain *= spectralFlow.emissionGain;
    if (length(pos - beforeSpectral) > 1e-6) {
      state = sampleIsosurfaceHitState(pos, animTime, isoGain, uniforms);
    }
  }

  if (
    state.rawRho >= EMPTY_SKIP_THRESHOLD &&
    FEATURE_VACUUM_BUBBLE_LENS &&
    isVacuumBubbleLensActive(uniforms)
  ) {
    let vacuumBubble = applyVacuumBubbleLens(pos, rayDir, uniforms);
    let beforeVacuumBubble = pos;
    pos = vacuumBubble.position;
    emissionGain *= vacuumBubble.emissionGain;
    if (length(pos - beforeVacuumBubble) > 1e-6) {
      state = sampleIsosurfaceHitState(pos, animTime, isoGain, uniforms);
    }
  }

  state.samplePos = pos;
  state.emissionGain = emissionGain;
  return state;
}
`
}

/**
 * Generate the march-loop density sample block.
 *
 * Reads `pos` (vec3f) and writes `rho` (f32, already multiplied by isoGain).
 *
 * @param useDensityGrid - When true, samples from the density grid with dual-channel and UB support
 */
export function generateDensitySample(useDensityGrid: boolean): string {
  void useDensityGrid
  return `let isoDensityState = sampleIsosurfaceWithSpacetimeWarp(pos, rd, animTime, isoGain, schroedinger);
    rho = isoDensityState.hitRho;`
}

/**
 * Generate the seed sample block for adaptive ray marching.
 *
 * Reads `ro`, `rd`, `tNear` and produces `prevS` (f32) — the initial
 * log-density directional derivative seed.
 *
 * @param useDensityGrid - When true, seeds from the density grid
 */
export function generateSeedSample(useDensityGrid: boolean): string {
  void useDensityGrid
  return `let isoSeedState = sampleIsosurfaceWithSpacetimeWarp(ro + rd * tNear, rd, animTime, isoGain, schroedinger);
  var prevS = sFromRho(isoSeedState.hitRho);`
}

/**
 * Generate the binary search refinement sample block.
 *
 * Reads `midPos` (vec3f) and produces `midS` (f32) — the log-density at
 * the bisection midpoint.
 *
 * @param useDensityGrid - When true, samples from the density grid
 */
export function generateBinarySearchSample(useDensityGrid: boolean): string {
  void useDensityGrid
  return `let isoMidState = sampleIsosurfaceWithSpacetimeWarp(midPos, rd, animTime, isoGain, schroedinger);
        let midS = sFromRho(isoMidState.hitRho);`
}

/**
 * Generate the gradient computation block.
 *
 * Reads `p` (vec3f) and writes `rawGrad` (vec3f) — the density gradient
 * at the isosurface hit point.
 *
 * @param useDensityGrid - When true, prefers grid gradient with analytical/tetrahedral fallback
 */
export function generateGradientCompute(useDensityGrid: boolean): string {
  if (useDensityGrid) {
    return `if (USE_DENSITY_GRID) {
    rawGrad = computeGradientFromGrid(p, schroedinger);
  } else if (USE_ANALYTICAL_GRADIENT) {
    rawGrad = computeAnalyticalGradient(p, animTime, schroedinger);
  } else {
    rawGrad = computeGradientTetrahedral(p, animTime, schroedinger.boundingRadius * 0.005, schroedinger);
  }`
  }
  return `if (USE_ANALYTICAL_GRADIENT) {
    rawGrad = computeAnalyticalGradient(p, animTime, schroedinger);
  } else {
    rawGrad = computeGradientTetrahedral(p, animTime, schroedinger.boundingRadius * 0.005, schroedinger);
  }`
}

/**
 * Generate the surface color sampling block.
 *
 * Reads `p` (vec3f) and produces `rhoSurface`, `dualSecondary`, `phase` (all f32)
 * for isosurface coloring.
 *
 * @param useDensityGrid - When true, samples color from grid with phase channel support
 */
export function generateColorSample(useDensityGrid: boolean): string {
  if (useDensityGrid) {
    return `var rhoSurface: f32;
  var colorRhoSurface: f32;
  var dualSecondary: f32 = 0.0;
  var phase: f32;
  let surfaceEmissionGain = surfaceSample.emissionGain;
  if (USE_DENSITY_GRID && DENSITY_GRID_HAS_PHASE) {
    let gridColor = sampleDensityFromGrid(p, schroedinger);
    let primarySurfaceRho = select(gridColor.r, gridColor.a, IS_PAULI && !IS_DUAL_CHANNEL && DENSITY_GRID_HAS_PHASE);
    rhoSurface = primarySurfaceRho * isoGain;
    colorRhoSurface = gridColor.r * isoGain;
    if (IS_DUAL_CHANNEL) {
      dualSecondary = gridColor.g * isoGain;
    }
    // Only the three analytical modes (harmonicOscillator=0, hydrogenND=1,
    // hydrogenNDCoupled=7) write relativePhase into the density grid's A
    // channel via sampleDensityWithPhaseComponents. Every other mode
    // packs something else (overlay alpha for AdS/WdW, total density for
    // Dirac/Pauli, coherenceFraction for open quantum, potOverlay / raw
    // density for TDSE/BEC/FSF/QW). Reading those as a phase yields hue
    // garbage, so whitelist the analytical modes and fall back to the
    // spatial-phase channel B for everything else. quantumMode is i32 —
    // use signed literals to keep WGSL strict typing happy.
    let useRelPhase =
      (COLOR_ALGORITHM == 10)
      && (schroedinger.quantumMode == 0
          || schroedinger.quantumMode == 1
          || schroedinger.quantumMode == 7);
    phase = select(gridColor.b, gridColor.a, useRelPhase);
  } else {
    let densityInfo = sampleDensityWithPhase(p, animTime, schroedinger);
    rhoSurface = densityInfo.x * isoGain;
    colorRhoSurface = rhoSurface;
    phase = densityInfo.z;
  }`
  }
  return `let densityInfo = sampleDensityWithPhase(p, animTime, schroedinger);
  let rhoSurface = densityInfo.x * isoGain;
  let colorRhoSurface = rhoSurface;
  let phase = densityInfo.z;
  let surfaceEmissionGain = surfaceSample.emissionGain;
  let dualSecondary: f32 = 0.0;`
}
