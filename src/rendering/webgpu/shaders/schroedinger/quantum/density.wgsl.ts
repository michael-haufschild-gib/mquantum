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

// OPTIMIZED: Integer bit-manipulation hash.
// Uses WebGPU u32 operations - faster than sin()-based hash.
// The u32 reciprocal is a precomputed const so drivers don't re-fold the divide.
const INV_U32_MAX: f32 = 2.3283064365386963e-10; // 1.0 / f32(0xffffffffu)

fn hash33u(q0: vec3u) -> vec3f {
  var q = q0 * vec3u(1597334673u, 3812015801u, 2798796415u);
  q = (q.x ^ q.y ^ q.z) * vec3u(1597334673u, 3812015801u, 2798796415u);
  return fma(vec3f(q), vec3f(2.0 * INV_U32_MAX), vec3f(-1.0));
}

// f32-entry wrapper kept for API compatibility.
fn hash33(p: vec3f) -> vec3f {
  return hash33u(vec3u(vec3i(floor(p))));
}

// 3D Perlin/Gradient Noise.
// PERF: the 8 hash33 calls in the original form each redid floor()+vec3i() on
// lattice-aligned inputs that were already integers. We compute the u32 lattice
// base once and add integer deltas, saving 7 floors + 7 f32->i32 casts per call.
fn gradientNoise(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let iu = vec3u(vec3i(i));

  let g000 = hash33u(iu);
  let g100 = hash33u(iu + vec3u(1u, 0u, 0u));
  let g010 = hash33u(iu + vec3u(0u, 1u, 0u));
  let g110 = hash33u(iu + vec3u(1u, 1u, 0u));
  let g001 = hash33u(iu + vec3u(0u, 0u, 1u));
  let g101 = hash33u(iu + vec3u(1u, 0u, 1u));
  let g011 = hash33u(iu + vec3u(0u, 1u, 1u));
  let g111 = hash33u(iu + vec3u(1u, 1u, 1u));

  let f100 = f - vec3f(1.0, 0.0, 0.0);
  let f010 = f - vec3f(0.0, 1.0, 0.0);
  let f110 = f - vec3f(1.0, 1.0, 0.0);
  let f001 = f - vec3f(0.0, 0.0, 1.0);
  let f101 = f - vec3f(1.0, 0.0, 1.0);
  let f011 = f - vec3f(0.0, 1.0, 1.0);
  let f111 = f - vec3f(1.0, 1.0, 1.0);

  return mix(mix(mix(dot(g000, f),    dot(g100, f100), u.x),
                 mix(dot(g010, f010), dot(g110, f110), u.x), u.y),
             mix(mix(dot(g001, f001), dot(g101, f101), u.x),
                 mix(dot(g011, f011), dot(g111, f111), u.x), u.y), u.z);
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

// Apply density modulations shared by inline analytical and tetrahedral samplers.
// Returns: vec4f(modulatedRho, logRho, spatialPhase, relativePhase)
fn applyDensityPostModulation(
  pos: vec3f,
  psi: vec2f,
  psiMag2: f32,
  spatialPhase: f32,
  relativePhase: f32,
  uniforms: SchroedingerUniforms
) -> vec4f {
  var rho = psiMag2;

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
    let invPsiLen = inverseSqrt(max(psiMag2, 1e-16));
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

  return vec4f(rho, sFromRho(rho), spatialPhase, relativePhase);
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

  // Cache |psi|^2 before rho is mutated by boost / boundary / interference.
  // The shimmer branch below needs the raw magnitude, and rho starts equal to it,
  // so we save a second dot(psi, psi) in the raymarch hot path.
  let psiMag2 = rhoFromPsi(psi);

  return applyDensityPostModulation(pos, psi, psiMag2, spatialPhase, relativePhase, uniforms);
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
// PERF: Reuses post-modulation processing from sampleDensityWithPhaseComponents
// while keeping raw psi from evalPsiWithSpatialPhase without a redundant evalPsi call.
// This saves 1 full wavefunction evaluation per step when probability current is active.
fn sampleDensityWithPhaseAndFlow(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> array<vec3f, 2> {
  let xND = mapPosToND(pos, uniforms);
  let psiResult = evalPsiWithSpatialPhase(xND, t, uniforms);
  let psi = psiResult.xy;
  let spatialPhase = psiResult.z;
  let relativePhase = psiResult.w;

  // Cache |psi|^2 before rho is mutated — shimmer branch reuses it to skip a second dot.
  let psiMag2 = rhoFromPsi(psi);
  let densityInfo = applyDensityPostModulation(
    pos,
    psi,
    psiMag2,
    spatialPhase,
    relativePhase,
    uniforms
  );
  let phaseForColor = select(densityInfo.z, densityInfo.w, COLOR_ALGORITHM == 10);
  return array<vec3f, 2>(vec3f(densityInfo.x, densityInfo.y, phaseForColor), vec3f(psi.x, psi.y, 0.0));
}

`
