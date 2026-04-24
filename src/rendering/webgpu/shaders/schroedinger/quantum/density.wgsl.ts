/**
 * WGSL Probability density field calculations
 *
 * The probability density is:
 *   ρ(x,t) = |ψ(x,t)|² = ψ*ψ = re² + im²
 *
 * For rendering stability and better dynamic range, we often use
 * log-density:
 *   s(x,t) = log(ρ + ε)
 *
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/density.wgsl
 */

/**
 * First part of density block - noise and flow functions (before mapPosToND)
 */
export const densityPreMapBlock = /* wgsl */ `
// ============================================
// Noise Functions
// ============================================

// OPTIMIZED: Integer bit-manipulation hash
// Uses WebGPU u32 operations - faster than sin()-based hash
fn hash33(p: vec3f) -> vec3f {
  var q = vec3u(vec3i(floor(p))) * vec3u(1597334673u, 3812015801u, 2798796415u);
  q = (q.x ^ q.y ^ q.z) * vec3u(1597334673u, 3812015801u, 2798796415u);
  return -1.0 + 2.0 * vec3f(q) * (1.0 / f32(0xffffffffu));
}

// 3D Perlin/Gradient Noise
fn gradientNoise(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);

  return mix(mix(mix(dot(hash33(i + vec3f(0.0,0.0,0.0)), f - vec3f(0.0,0.0,0.0)),
                     dot(hash33(i + vec3f(1.0,0.0,0.0)), f - vec3f(1.0,0.0,0.0)), u.x),
                 mix(dot(hash33(i + vec3f(0.0,1.0,0.0)), f - vec3f(0.0,1.0,0.0)),
                     dot(hash33(i + vec3f(1.0,1.0,0.0)), f - vec3f(1.0,1.0,0.0)), u.x), u.y),
             mix(mix(dot(hash33(i + vec3f(0.0,0.0,1.0)), f - vec3f(0.0,0.0,1.0)),
                     dot(hash33(i + vec3f(1.0,0.0,1.0)), f - vec3f(1.0,0.0,1.0)), u.x),
                 mix(dot(hash33(i + vec3f(0.0,1.0,1.0)), f - vec3f(0.0,1.0,1.0)),
                     dot(hash33(i + vec3f(1.0,1.0,1.0)), f - vec3f(1.0,1.0,1.0)), u.x), u.y), u.z);
}

`

/**
 * Generate dimension-specific mapPosToND function.
 *
 * Uses the global `basis` uniform (BasisVectors) for coordinate transformation.
 * The basis vectors are packed as array<vec4f, 3> each (12 f32 slots for 11 components).
 *
 * @param dimension - The dimension (3-11)
 * @returns WGSL mapPosToND function for the specified dimension
 */
export function generateMapPosToND(
  dimension: number,
  options?: { coupledNodalOffset?: boolean }
): string {
  const dim = Math.min(Math.max(dimension, 2), 11)
  const coupled = options?.coupledNodalOffset ?? false
  const extraDimCount = dim - 3

  // Generate unrolled coordinate assignments using getBasisComponent helper
  // The basis uniform is globally available from the bind group
  const assignments = []
  for (let j = 0; j < dim; j++) {
    assignments.push(
      `  let bx${j} = getBasisComponent(basis.basisX, ${j});
  let by${j} = getBasisComponent(basis.basisY, ${j});
  let bz${j} = getBasisComponent(basis.basisZ, ${j});
  let o${j} = getBasisComponent(basis.origin, ${j});
  xND[${j}] = (o${j} + pos.x*bx${j} + pos.y*by${j} + pos.z*bz${j}) * uniforms.fieldScale;`
    )
  }

  // WGSL 'var' declarations are zero-initialized, so remaining dimensions
  // beyond dim are already 0.0. No explicit zeroing loop needed.
  const zeroLoop = ''

  // Coupled hydrogen nodal-plane avoidance: mix visible-dim coordinates
  // into extra dims so cos(θ_k) is not exactly zero at default orientation.
  // Each extra dim uses a different source coordinate (z, y, x cycling) to
  // avoid creating a new co-aligned nodal surface.
  let nodalOffset = ''
  if (coupled && extraDimCount > 0) {
    const sourceCoords = [2, 1, 0]
    const lines = []
    for (let i = 0; i < extraDimCount; i++) {
      const extraIdx = i + 3
      const srcIdx = sourceCoords[i % sourceCoords.length]!
      lines.push(`  xND[${extraIdx}] += xND[${srcIdx}] * 0.26;`)
    }
    nodalOffset = `
  // Tilt slice ~15° off Gegenbauer nodal plane (coupled hydrogen ND)
${lines.join('\n')}`
  }

  return `
// ============================================
// Dimension-Specific Coordinate Mapping (Unrolled)
// Dimension: ${dim}${coupled ? ' — Coupled nodal offset' : ''}
// ============================================

// Maps 3D position to ND coordinates using rotated basis vectors.
// Uses global 'basis' uniform (BasisVectors) for basis vectors and origin.
// Unrolled for dimension ${dim} - no runtime branching.
fn mapPosToND(pos: vec3f, uniforms: SchroedingerUniforms) -> array<f32, 11> {
  var xND: array<f32, 11>;
${assignments.join('\n')}${zeroLoop}${nodalOffset}
  return xND;
}
`
}

/**
 * Second part of density block - density calculations (after mapPosToND)
 */
export const densityPostMapBlock = /* wgsl */ `
// ============================================
// Density Field Calculations
// ============================================

// DENSITY_EPS is now in shared/core/constants.wgsl.ts

// Compute probability density ρ = |ψ|²
fn rhoFromPsi(psi: vec2f) -> f32 {
  return dot(psi, psi); // re² + im²
}

// Compute log-density for stability and dynamic range
fn sFromRho(rho: f32) -> f32 {
  return log(rho + DENSITY_EPS);
}

fn applyUncertaintyBoundaryEmphasis(
  rho: f32,
  logRho: f32,
  uniforms: SchroedingerUniforms
) -> f32 {
  if (
    uniforms.uncertaintyBoundaryEnabled == 0u ||
    uniforms.uncertaintyBoundaryStrength <= 0.0
  ) {
    return rho;
  }

  let width = max(uniforms.uncertaintyBoundaryWidth, 1e-3);
  let normalizedDistance = abs(logRho - uniforms.uncertaintyLogRhoThreshold) / width;
  // PERF: Replace exp(-0.5x²) with smoothstep approximation.
  // For |x| > 3, Gaussian < 0.01 — clamp to 0.
  // smoothstep(3,0,|x|)² gives a close visual match at zero ALU cost vs exp().
  let t = clamp(1.0 - normalizedDistance / 3.0, 0.0, 1.0);
  let band = t * t * (3.0 - 2.0 * t); // smoothstep
  let gain = 1.0 + uniforms.uncertaintyBoundaryStrength * band;
  return rho * gain;
}

// Compute both ρ and s efficiently
fn densityPair(psi: vec2f) -> vec2f {
  let rho = rhoFromPsi(psi);
  let s = sFromRho(rho);
  return vec2f(rho, s);
}

// Sample density at a 3D position, mapping through ND basis
fn sampleDensity(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> f32 {
  // Map 3D position to ND coordinates
  let xND = mapPosToND(pos, uniforms);

  // Evaluate wavefunction and density
  let psi = evalPsi(xND, t, uniforms);
  var rho = rhoFromPsi(psi);

  // Hydrogen ND density boost
  if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND) {
    rho *= uniforms.hydrogenNDBoost;
  }

  return rho;
}

// Sample density with both phase channels.
// Returns: vec4f(rho, logRho, spatialPhase, relativePhase)
fn sampleDensityWithPhaseComponents(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> vec4f {
  // Map 3D position to ND coordinates
  let xND = mapPosToND(pos, uniforms);

  // OPTIMIZED: Single-pass evaluation for both time-dependent density and spatial phase
  let psiResult = evalPsiWithSpatialPhase(xND, t, uniforms);
  let psi = psiResult.xy;
  let spatialPhase = psiResult.z;
  let relativePhase = psiResult.w;

  var rho = rhoFromPsi(psi);

  // Hydrogen ND density boost
  if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND) {
    rho *= uniforms.hydrogenNDBoost;
  }

  // Confidence-boundary emphasis around an iso-probability surface.
  // Skipped in compute shaders (SKIP_DENSITY_EMPHASIS=true) so the density grid
  // stores raw density; emphasis is applied per-pixel in the fragment raymarcher.
  if (FEATURE_UNCERTAINTY_BOUNDARY && !SKIP_DENSITY_EMPHASIS) {
    let boundaryLogRho = sFromRho(rho);
    rho = applyUncertaintyBoundaryEmphasis(rho, boundaryLogRho, uniforms);
  }

  // Apply interference fringing if enabled
  if (FEATURE_INTERFERENCE && uniforms.interferenceEnabled != 0u && uniforms.interferenceAmp > 0.0) {
    let iTime = uniforms.time * uniforms.interferenceSpeed;
    let fringe = 1.0 + uniforms.interferenceAmp * sin(spatialPhase * uniforms.interferenceFreq + iTime);
    rho *= fringe;
    rho = max(rho, 0.0);
  }

  // Phase-coherent quantum texture: uses wavefunction phase to create noise
  // patterns aligned with the quantum state's structure. The phase φ encodes
  // local momentum direction (p ∝ ∇φ in the semiclassical limit), so the
  // texture flows coherently with wavefronts rather than randomly.
  // For real eigenstates: highlights nodal surfaces (phase jumps 0 → π).
  // For complex/superposition states: patterns evolve with the phase field.
  if (uniforms.phaseShimmerEnabled != 0u && uniforms.phaseShimmerStrength > 0.0) {
    let pcfSpeedMod = 1.0 - clamp(rho * 5.0, 0.0, 1.0);
    let pcfTime = uniforms.time * uniforms.phaseShimmerSpeed;
    let pcfOffset = pcfTime * pcfSpeedMod;
    // inverseSqrt(|psi|^2) replaces length() + two scalar divides with one rsqrt + two muls.
    let invPsiLen = inverseSqrt(max(dot(psi, psi), 1e-16));
    let pcfCosP = psi.x * invPsiLen;
    let pcfSinP = psi.y * invPsiLen;
    let pcfNoise = gradientNoise(pos * 2.0 + vec3f(
        pcfOffset + pcfCosP * 0.5,
        pcfSinP * 0.5,
        pcfOffset * 0.7 + pcfCosP * 0.3
    ));
    rho *= (1.0 + pcfNoise * uniforms.phaseShimmerStrength * pcfSpeedMod);
    rho = max(rho, 0.0);
  }

  let s = sFromRho(rho);

  return vec4f(rho, s, spatialPhase, relativePhase);
}

// Sample density with phase information for coloring.
// Returns: vec3f(rho, logRho, selectedPhaseForColorAlgorithm)
fn sampleDensityWithPhase(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> vec3f {
  let densityInfo = sampleDensityWithPhaseComponents(pos, t, uniforms);
  let phaseForColor = select(densityInfo.z, densityInfo.w, COLOR_ALGORITHM == 10);
  return vec3f(densityInfo.x, densityInfo.y, phaseForColor);
}

// Sample density with phase, also returning the raw ψ for downstream reuse.
// Returns tuple: (vec3f(rho, logRho, phase), vec3f(psi.re, psi.im, 0))
// PERF: Inlines the density processing from sampleDensityWithPhaseComponents to
// capture the raw psi from evalPsiWithSpatialPhase without a redundant evalPsi call.
// This saves 1 full wavefunction evaluation per step when probability current is active.
// The logic must stay in sync with sampleDensityWithPhaseComponents — both live in this
// file and share the same compile-time feature flags.
fn sampleDensityWithPhaseAndFlow(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> array<vec3f, 2> {
  let xND = mapPosToND(pos, uniforms);
  let psiResult = evalPsiWithSpatialPhase(xND, t, uniforms);
  let psi = psiResult.xy;
  let spatialPhase = psiResult.z;
  let relativePhase = psiResult.w;

  var rho = rhoFromPsi(psi);
  if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND) {
    rho *= uniforms.hydrogenNDBoost;
  }
  if (FEATURE_UNCERTAINTY_BOUNDARY && !SKIP_DENSITY_EMPHASIS) {
    let boundaryLogRho = sFromRho(rho);
    rho = applyUncertaintyBoundaryEmphasis(rho, boundaryLogRho, uniforms);
  }
  if (FEATURE_INTERFERENCE && uniforms.interferenceEnabled != 0u && uniforms.interferenceAmp > 0.0) {
    let iTime = uniforms.time * uniforms.interferenceSpeed;
    let fringe = 1.0 + uniforms.interferenceAmp * sin(spatialPhase * uniforms.interferenceFreq + iTime);
    rho *= fringe;
    rho = max(rho, 0.0);
  }
  if (uniforms.phaseShimmerEnabled != 0u && uniforms.phaseShimmerStrength > 0.0) {
    let pcfSpeedMod = 1.0 - clamp(rho * 5.0, 0.0, 1.0);
    let pcfTime = uniforms.time * uniforms.phaseShimmerSpeed;
    let pcfOffset = pcfTime * pcfSpeedMod;
    // inverseSqrt(|psi|^2) replaces length() + two scalar divides with one rsqrt + two muls.
    let invPsiLen = inverseSqrt(max(dot(psi, psi), 1e-16));
    let pcfCosP = psi.x * invPsiLen;
    let pcfSinP = psi.y * invPsiLen;
    let pcfNoise = gradientNoise(pos * 2.0 + vec3f(
        pcfOffset + pcfCosP * 0.5,
        pcfSinP * 0.5,
        pcfOffset * 0.7 + pcfCosP * 0.3
    ));
    rho *= (1.0 + pcfNoise * uniforms.phaseShimmerStrength * pcfSpeedMod);
    rho = max(rho, 0.0);
  }
  let s = sFromRho(rho);
  let phaseForColor = select(spatialPhase, relativePhase, COLOR_ALGORITHM == 10);
  return array<vec3f, 2>(vec3f(rho, s, phaseForColor), vec3f(psi.x, psi.y, 0.0));
}

`
