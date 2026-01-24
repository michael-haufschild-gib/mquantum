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
 * Port of GLSL quantum/density.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/density.wgsl
 */

/**
 * First part of density block - noise and flow functions (before mapPosToND)
 */
export const densityPreMapBlock = /* wgsl */ `
// ============================================
// Noise & Erosion Functions
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

// ============================================
// Worley Noise - Fast 2×2×2 octant search
// ============================================

// Returns squared distance, sqrt deferred to caller
fn worleyNoiseSquared(p: vec3f) -> f32 {
  let id = floor(p);
  let f = fract(p);

  // Determine which octant of the cell we're in
  let o = step(vec3f(0.5), f) - 1.0;

  // Unrolled 8 neighbor checks (2×2×2)
  let d0 = o + hash33(id + o) * 0.5 + 0.5 - f;
  let d1 = o + vec3f(1.0,0.0,0.0) + hash33(id + o + vec3f(1.0,0.0,0.0)) * 0.5 + 0.5 - f;
  let d2 = o + vec3f(0.0,1.0,0.0) + hash33(id + o + vec3f(0.0,1.0,0.0)) * 0.5 + 0.5 - f;
  let d3 = o + vec3f(1.0,1.0,0.0) + hash33(id + o + vec3f(1.0,1.0,0.0)) * 0.5 + 0.5 - f;
  let d4 = o + vec3f(0.0,0.0,1.0) + hash33(id + o + vec3f(0.0,0.0,1.0)) * 0.5 + 0.5 - f;
  let d5 = o + vec3f(1.0,0.0,1.0) + hash33(id + o + vec3f(1.0,0.0,1.0)) * 0.5 + 0.5 - f;
  let d6 = o + vec3f(0.0,1.0,1.0) + hash33(id + o + vec3f(0.0,1.0,1.0)) * 0.5 + 0.5 - f;
  let d7 = o + vec3f(1.0,1.0,1.0) + hash33(id + o + vec3f(1.0,1.0,1.0)) * 0.5 + 0.5 - f;

  // Find minimum squared distance
  var m = dot(d0, d0);
  m = min(m, dot(d1, d1));
  m = min(m, dot(d2, d2));
  m = min(m, dot(d3, d3));
  m = min(m, dot(d4, d4));
  m = min(m, dot(d5, d5));
  m = min(m, dot(d6, d6));
  m = min(m, dot(d7, d7));

  return m;
}

// Unified Noise Function based on type
// 0=Worley (Billowy), 1=Perlin (Smooth), 2=Hybrid
fn getErosionNoise(p: vec3f, noiseType: i32) -> f32 {
  if (noiseType == 0) {
    // Worley: sqrt of squared distance, inverted for billowy clouds
    return 1.0 - sqrt(worleyNoiseSquared(p));
  } else if (noiseType == 1) {
    // Perlin: -1 to 1. Map to 0..1
    return gradientNoise(p) * 0.5 + 0.5;
  } else {
    // Hybrid: Perlin-Worley
    let pN = gradientNoise(p) * 0.5 + 0.5;
    let wN = 1.0 - sqrt(worleyNoiseSquared(p * 2.0));
    return mix(pN, wN, 0.5);
  }
}

// ============================================
// Curl Distortion - Fast pseudo-curl
// ============================================

// Fast: Pseudo-curl with 2 samples
fn distortPosition(p: vec3f, strength: f32) -> vec3f {
  if (strength < 0.1) { return p; }

  // Pseudo-curl with only 2 noise samples
  let n1 = gradientNoise(p + vec3f(0.1, 0.0, 0.0));
  let n2 = gradientNoise(p + vec3f(0.0, 0.1, 0.0));

  // Create pseudo-curl displacement
  let displacement = vec3f(
    n2,           // X displacement from Y-offset sample
    -n1,          // Y displacement from X-offset sample (negated for rotation)
    n1 - n2       // Z displacement from difference (adds turbulence)
  );

  return p + displacement * strength;
}

// Erode density based on noise
fn erodeDensity(rho: f32, pos: vec3f, uniforms: SchroedingerUniforms) -> f32 {
  // Early exit: erosion disabled
  if (uniforms.erosionStrength <= 0.001) { return rho; }

  // Skip erosion for very low density (invisible samples)
  if (rho < 0.001) { return rho; }

  // Skip erosion for high-density core
  if (rho > 2.0) { return rho; }

  // Scale position for noise
  var noisePos = pos * uniforms.erosionScale;

  // Add turbulence/distortion
  if (uniforms.erosionTurbulence > 0.0) {
    // Animate swirl
    let t = uniforms.time * uniforms.timeScale * 0.2;
    noisePos += vec3f(0.0, -t, 0.0);
    noisePos = distortPosition(noisePos, uniforms.erosionTurbulence);
  }

  // Sample noise
  let noise = getErosionNoise(noisePos, uniforms.erosionNoiseType);

  // Direct subtraction in linear space
  let erodedRho = max(0.0, rho - noise * uniforms.erosionStrength * 2.0);

  // Smooth blending to avoid hard cuts
  return mix(rho, erodedRho, uniforms.erosionStrength);
}

// Procedural Curl Noise (Divergence Free)
fn curlNoise(p: vec3f) -> vec3f {
  return distortPosition(p, 1.0) - p;
}

// Apply Curl Noise Flow to position
fn applyFlow(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> vec3f {
  if (!uniforms.curlEnabled || uniforms.curlStrength <= 0.001) { return pos; }

  let flowPos = pos * uniforms.curlScale + vec3f(0.0, 0.0, t * uniforms.curlSpeed * 0.2);

  // Base curl vector
  var curl = curlNoise(flowPos);

  // Apply bias
  if (uniforms.curlBias == 1) { // Upward
    curl += vec3f(0.0, 1.0, 0.0) * 0.5;
  } else if (uniforms.curlBias == 2) { // Outward
    curl += normalize(pos) * 0.5;
  } else if (uniforms.curlBias == 3) { // Inward
    curl -= normalize(pos) * 0.5;
  }

  // Distort sampling position by the curl vector
  return pos - curl * uniforms.curlStrength;
}
`

/**
 * Generate dimension-specific mapPosToND function.
 *
 * @param dimension - The dimension (3-11)
 * @returns WGSL mapPosToND function for the specified dimension
 */
export function generateMapPosToND(dimension: number): string {
  const dim = Math.min(Math.max(dimension, 3), 11)

  // Generate unrolled coordinate assignments
  const assignments = []
  for (let j = 0; j < dim; j++) {
    assignments.push(
      `  xND[${j}] = (uniforms.origin[${j}] + pos.x*uniforms.basisX[${j}] + pos.y*uniforms.basisY[${j}] + pos.z*uniforms.basisZ[${j}]) * uniforms.fieldScale;`
    )
  }

  // Zero out remaining dimensions if not at MAX_DIM (11)
  const zeroLoop =
    dim < 11
      ? `
  for (var j = ${dim}; j < 11; j++) { xND[j] = 0.0; }`
      : ''

  return `
// ============================================
// Dimension-Specific Coordinate Mapping (Unrolled)
// Dimension: ${dim}
// ============================================

// Maps 3D position to ND coordinates using rotated basis vectors.
// Unrolled for dimension ${dim} - no runtime branching.
fn mapPosToND(pos: vec3f, uniforms: SchroedingerUniforms) -> array<f32, 11> {
  var xND: array<f32, 11>;
${assignments.join('\n')}${zeroLoop}
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

// Small epsilon to prevent log(0)
const DENSITY_EPS: f32 = 1e-8;

// Compute probability density ρ = |ψ|²
fn rhoFromPsi(psi: vec2f) -> f32 {
  return dot(psi, psi); // re² + im²
}

// Compute log-density for stability and dynamic range
fn sFromRho(rho: f32) -> f32 {
  return log(rho + DENSITY_EPS);
}

// Compute both ρ and s efficiently
fn densityPair(psi: vec2f) -> vec2f {
  let rho = rhoFromPsi(psi);
  let s = sFromRho(rho);
  return vec2f(rho, s);
}

// Sample density at a 3D position, mapping through ND basis
fn sampleDensity(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> f32 {
  // Apply Animated Flow (Curl Noise)
  let flowedPos = applyFlow(pos, t, uniforms);

  // Map 3D position to ND coordinates
  let xND = mapPosToND(flowedPos, uniforms);

  // Evaluate wavefunction and density
  let psi = evalPsi(xND, t, uniforms);
  var rho = rhoFromPsi(psi);

  // Hydrogen orbital density boost
  if (uniforms.quantumMode == QUANTUM_MODE_HYDROGEN) {
    rho *= uniforms.hydrogenBoost;
  }

  // Hydrogen ND density boost
  if (uniforms.quantumMode == QUANTUM_MODE_HYDROGEN_ND) {
    rho *= uniforms.hydrogenNDBoost;
  }

  // Apply Edge Erosion
  rho = erodeDensity(rho, flowedPos, uniforms);

  return rho;
}

// Sample density with phase information for coloring
// Returns: vec3f(rho, logRho, spatialPhase)
fn sampleDensityWithPhase(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> vec3f {
  // Apply Animated Flow (Curl Noise)
  let flowedPos = applyFlow(pos, t, uniforms);

  // Map 3D position to ND coordinates
  let xND = mapPosToND(flowedPos, uniforms);

  // OPTIMIZED: Single-pass evaluation for both time-dependent density and spatial phase
  let psiResult = evalPsiWithSpatialPhase(xND, t, uniforms);
  let psi = psiResult.xy;
  let spatialPhase = psiResult.z;

  var rho = rhoFromPsi(psi);

  // Hydrogen orbital density boost
  if (uniforms.quantumMode == QUANTUM_MODE_HYDROGEN) {
    rho *= uniforms.hydrogenBoost;
  }

  // Hydrogen ND density boost
  if (uniforms.quantumMode == QUANTUM_MODE_HYDROGEN_ND) {
    rho *= uniforms.hydrogenNDBoost;
  }

  // Apply Edge Erosion
  rho = erodeDensity(rho, flowedPos, uniforms);

  // Apply shimmer if enabled
  if (uniforms.shimmerEnabled && uniforms.shimmerStrength > 0.0) {
    if (rho > 0.001 && rho < 0.5) {
      let time = uniforms.time * uniforms.timeScale;
      let noisePos = flowedPos * 5.0 + vec3f(0.0, 0.0, time * 2.0);
      var shimmer = gradientNoise(noisePos);
      shimmer = shimmer * 0.5 + 0.5;
      let uncertainty = 1.0 - clamp(rho * 2.0, 0.0, 1.0);
      rho *= (1.0 + (shimmer - 0.5) * uniforms.shimmerStrength * uncertainty);
    }
  }

  let s = sFromRho(rho);

  return vec3f(rho, s, spatialPhase);
}

// Sample density with phase, also returning the flowed position for gradient reuse
// Returns tuple: (vec3f density info, vec3f flowed position)
fn sampleDensityWithPhaseAndFlow(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> array<vec3f, 2> {
  // Apply Animated Flow (Curl Noise) - computed once and returned
  let flowedPos = applyFlow(pos, t, uniforms);

  // Map 3D position to ND coordinates
  let xND = mapPosToND(flowedPos, uniforms);

  // OPTIMIZED: Single-pass evaluation
  let psiResult = evalPsiWithSpatialPhase(xND, t, uniforms);
  let psi = psiResult.xy;
  let spatialPhase = psiResult.z;

  var rho = rhoFromPsi(psi);

  // Hydrogen orbital density boost
  if (uniforms.quantumMode == QUANTUM_MODE_HYDROGEN) {
    rho *= uniforms.hydrogenBoost;
  }

  // Hydrogen ND density boost
  if (uniforms.quantumMode == QUANTUM_MODE_HYDROGEN_ND) {
    rho *= uniforms.hydrogenNDBoost;
  }

  // Apply Edge Erosion
  rho = erodeDensity(rho, flowedPos, uniforms);

  // Apply shimmer if enabled
  if (uniforms.shimmerEnabled && uniforms.shimmerStrength > 0.0) {
    if (rho > 0.001 && rho < 0.5) {
      let time = uniforms.time * uniforms.timeScale;
      let noisePos = flowedPos * 5.0 + vec3f(0.0, 0.0, time * 2.0);
      var shimmer = gradientNoise(noisePos);
      shimmer = shimmer * 0.5 + 0.5;
      let uncertainty = 1.0 - clamp(rho * 2.0, 0.0, 1.0);
      rho *= (1.0 + (shimmer - 0.5) * uniforms.shimmerStrength * uncertainty);
    }
  }

  let s = sFromRho(rho);

  return array<vec3f, 2>(vec3f(rho, s, spatialPhase), flowedPos);
}

// Sample density at a pre-flowed position (skips applyFlow)
fn sampleDensityAtFlowedPos(flowedPos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> f32 {
  // Map pre-flowed 3D position to ND coordinates
  let xND = mapPosToND(flowedPos, uniforms);

  // Evaluate wavefunction and density
  let psi = evalPsi(xND, t, uniforms);
  var rho = rhoFromPsi(psi);

  // Hydrogen orbital density boost
  if (uniforms.quantumMode == QUANTUM_MODE_HYDROGEN) {
    rho *= uniforms.hydrogenBoost;
  }

  // Hydrogen ND density boost
  if (uniforms.quantumMode == QUANTUM_MODE_HYDROGEN_ND) {
    rho *= uniforms.hydrogenNDBoost;
  }

  // Apply Edge Erosion
  rho = erodeDensity(rho, flowedPos, uniforms);

  return rho;
}

// Sample density WITHOUT erosion for gradient computation
// Gradient samples only affect lighting direction, not density values.
fn sampleDensityAtFlowedPosNoErosion(flowedPos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> f32 {
  // Map pre-flowed 3D position to ND coordinates
  let xND = mapPosToND(flowedPos, uniforms);

  // Evaluate wavefunction and density
  let psi = evalPsi(xND, t, uniforms);
  var rho = rhoFromPsi(psi);

  // Hydrogen orbital density boost (still needed for correct gradient magnitude)
  if (uniforms.quantumMode == QUANTUM_MODE_HYDROGEN) {
    rho *= uniforms.hydrogenBoost;
  }

  // Hydrogen ND density boost
  if (uniforms.quantumMode == QUANTUM_MODE_HYDROGEN_ND) {
    rho *= uniforms.hydrogenNDBoost;
  }

  // NO erosion applied - gradient shape from base wavefunction is sufficient
  return rho;
}
`

/**
 * Legacy combined block - kept for backwards compatibility
 * Uses generic loop-based mapping
 */
export const densityBlock =
  densityPreMapBlock +
  /* wgsl */ `
// Fallback: generic loop-based mapping
fn mapPosToND(pos: vec3f, uniforms: SchroedingerUniforms) -> array<f32, 11> {
  var xND: array<f32, 11>;
  for (var j = 0; j < 11; j++) {
    if (j >= uniforms.dimension) {
      xND[j] = 0.0;
    } else {
      xND[j] = (uniforms.origin[j]
             + pos.x * uniforms.basisX[j]
             + pos.y * uniforms.basisY[j]
             + pos.z * uniforms.basisZ[j]) * uniforms.fieldScale;
    }
  }
  return xND;
}
` +
  densityPostMapBlock
