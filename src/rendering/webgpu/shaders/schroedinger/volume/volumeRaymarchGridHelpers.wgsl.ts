/**
 * Shared helpers for the full grid-based volume raymarcher.
 *
 * Kept separate so volumeRaymarchGrid stays under the repo line-limit while
 * preserving one generated WGSL block at composition time.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGridHelpers.wgsl
 */

export const volumeRaymarchGridHelpersBlock = /* wgsl */ `
// PERF: per-step grid-gradient cache. Backreaction, entropy shear, and
// spectral flow each ask for fetchGradient(pos). When no upstream warp moves
// position, the cache short-circuits 1-6 texture fetches per call. The
// position equality test is exact float compare.
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

fn gridOpacityDensity(gridSample: vec4f) -> f32 { return select(gridSample.r, gridSample.a, IS_PAULI && !IS_DUAL_CHANNEL && DENSITY_GRID_HAS_PHASE); }
fn gridSkipDensity(gridSample: vec4f) -> f32 { return select(gridOpacityDensity(gridSample), gridSample.r + gridSample.g, IS_DUAL_CHANNEL); }
fn gridAdaptiveLogDensity(rho: f32, sCenter: f32) -> f32 {
  if (IS_DUAL_CHANNEL || (IS_PAULI && !IS_DUAL_CHANNEL && DENSITY_GRID_HAS_PHASE)) {
    if (rho > 1e-9) { return log(rho); }
    return -20.0;
  }
  return sCenter;
}

fn canUseGridPsiAbsNodal(uniforms: SchroedingerUniforms) -> bool {
  return uniforms.nodalDefinition == NODAL_DEFINITION_PSI_ABS
    && uniforms.nodalFamilyFilter == NODAL_FAMILY_ALL
    && uniforms.nodalLobeColoringEnabled == 0u;
}

// PERF (OPT-PERF-2): consolidates the grid-load + post-warp re-sample logic
// previously duplicated 6× per ray step (initial sample + 5 post-warp re-samples
// for bilocal/backreaction/entropy/spectral/vacuumBubble). Reduces shader text
// size by ~150 lines and lets the compiler share register usage across all
// re-sample sites.
struct GridSampleState {
  rho: f32,
  sCenter: f32,
  colorRho: f32,
  colorS: f32,
  phase: f32,
  gridSample: vec4f,
}

fn loadGridSampleState(
  pos: vec3f,
  useRelPhase: bool,
  phaseOffset: f32,
  adsAmplitudeSq: f32,
  uniforms: SchroedingerUniforms
) -> GridSampleState {
  let gridSample = sampleDensityFromGrid(pos, uniforms);
  // AdS tachyon amplification: |ψ(t)|² = |ψ(0)|² · cosh²(γ·t).
  // adsAmplitudeSq is 1.0 outside AdS — caller hoists it from the loop.
  // Applied to the R channel only (AdS is never dual-channel).
  var rho = gridOpacityDensity(gridSample) * adsAmplitudeSq;
  var colorRho: f32 = gridSample.r * adsAmplitudeSq;
  var colorS: f32 = 0.0;
  var sCenter: f32;
  if (IS_DUAL_CHANNEL) {
    // Dual-channel (Dirac, Pauli): R = primary, G = secondary density (NOT logRho).
    // Total density (R + G) drives opacity/skip/adaptive-step; colorRho/colorS
    // preserve raw channels for computeBaseColor.
    colorS = gridSample.g;
    sCenter = gridSample.g;
    rho = rho + gridSample.g;
    colorRho = gridSample.r;
  } else if (DENSITY_GRID_HAS_PHASE) {
    sCenter = gridSample.g;
    colorS = sCenter;
  } else {
    // r16float fallback: derive logRho. Branch so log() is not called on zero.
    if (rho > 1e-9) {
      sCenter = log(rho);
    } else {
      sCenter = -20.0;
    }
    colorS = sCenter;
  }
  var phase: f32 = 0.0;
  if (DENSITY_GRID_HAS_PHASE) {
    let rotatedB = gridSample.b - phaseOffset;
    phase = select(rotatedB, gridSample.a, useRelPhase);
  }
  return GridSampleState(rho, sCenter, colorRho, colorS, phase, gridSample);
}

fn computeGridPsiAbsNodalField(
  pos: vec3f,
  rho: f32,
  uniforms: SchroedingerUniforms,
  cache: ptr<function, GradientCache>,
) -> NodalSample {
  let eps = max(uniforms.nodalTolerance, 1e-6);
  let psiAbs = sqrt(max(rho, 0.0));
  let logGradient = ensureGridGradient(pos, uniforms, cache);
  let gradAbs = logGradient * (0.5 * psiAbs);
  let intensity = nodalBandMask(psiAbs, gradAbs, eps);
  let envelopeFloor = max(eps * 0.4, 5e-5);
  let envelopeCeil = max(eps * 2.0, envelopeFloor + 1e-4);
  let envelopeWeight = smoothstep(envelopeFloor, envelopeCeil, psiAbs);
  return NodalSample(clamp(intensity, 0.0, 1.0), 1.0, NODAL_DEFINITION_PSI_ABS, envelopeWeight);
}
`
