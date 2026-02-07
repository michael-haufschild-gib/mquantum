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

// Higher quality Worley noise - 3×3×3 neighborhood search
fn worleyNoiseSquaredHQ(p: vec3f) -> f32 {
  let id = floor(p);
  let f = fract(p);
  var minDist = 1e9;

  for (var z: i32 = -1; z <= 1; z++) {
    for (var y: i32 = -1; y <= 1; y++) {
      for (var x: i32 = -1; x <= 1; x++) {
        let cell = vec3f(f32(x), f32(y), f32(z));
        let jitter = hash33(id + cell) * 0.5 + 0.5;
        let d = cell + jitter - f;
        minDist = min(minDist, dot(d, d));
      }
    }
  }

  return minDist;
}

// Unified Noise Function based on type
// 0=Worley (Billowy), 1=Perlin (Smooth), 2=Hybrid
fn getErosionNoise(p: vec3f, uniforms: SchroedingerUniforms) -> f32 {
  let noiseType = uniforms.erosionNoiseType;
  let hqMode = uniforms.erosionHQ != 0u;

  if (noiseType == 0) {
    // Worley: sqrt of squared distance, inverted for billowy clouds
    let worleySq = select(worleyNoiseSquared(p), worleyNoiseSquaredHQ(p), hqMode);
    return 1.0 - sqrt(worleySq);
  } else if (noiseType == 1) {
    // Perlin: -1 to 1. Map to 0..1
    return gradientNoise(p) * 0.5 + 0.5;
  } else {
    // Hybrid: Perlin-Worley
    let pN = gradientNoise(p) * 0.5 + 0.5;
    let worleySq = select(worleyNoiseSquared(p * 2.0), worleyNoiseSquaredHQ(p * 2.0), hqMode);
    let wN = 1.0 - sqrt(worleySq);
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

// HQ pseudo-curl distortion with central differences (4 samples)
fn distortPositionHQ(p: vec3f, strength: f32) -> vec3f {
  if (strength < 0.1) { return p; }

  let eps = 0.1;
  let nx1 = gradientNoise(p + vec3f(eps, 0.0, 0.0));
  let nx2 = gradientNoise(p - vec3f(eps, 0.0, 0.0));
  let ny1 = gradientNoise(p + vec3f(0.0, eps, 0.0));
  let ny2 = gradientNoise(p - vec3f(0.0, eps, 0.0));

  let dx = nx1 - nx2;
  let dy = ny1 - ny2;
  let displacement = vec3f(
    dy,
    -dx,
    dx - dy
  );

  return p + displacement * (strength * 0.5);
}

// Erode density based on noise — surface-aware edge erosion.
// IMPORTANT: quantumPos must be the basis-rotated quantum-space position
// (first 3 components of xND), NOT the raw model-space ray position.
// Using model-space would make the noise static while lobes rotate via basis vectors.
fn erodeDensity(rho: f32, quantumPos: vec3f, uniforms: SchroedingerUniforms) -> f32 {
  // Early exit: erosion disabled
  if (uniforms.erosionStrength <= 0.001) { return rho; }

  // Skip erosion for very low density (invisible samples)
  if (rho < 0.001) { return rho; }

  // Scale position for noise (quantumPos already includes fieldScale from mapPosToND)
  var noisePos = quantumPos * uniforms.erosionScale;

  // Add turbulence/distortion
  if (uniforms.erosionTurbulence > 0.0) {
    // Animate swirl
    let t = uniforms.time * uniforms.timeScale * 0.2;
    noisePos += vec3f(0.0, -t, 0.0);
    if (uniforms.erosionHQ != 0u) {
      noisePos = distortPositionHQ(noisePos, uniforms.erosionTurbulence);
    } else {
      noisePos = distortPosition(noisePos, uniforms.erosionTurbulence);
    }
  }

  // Sample noise
  let noise = getErosionNoise(noisePos, uniforms);

  // Surface-proximity weighting:
  // normalizedRho ≈ per-step opacity contribution (rho * densityGain).
  //   Edge  (normalizedRho small, ~0-0.3)  → full erosion  → carves lobe boundary
  //   Core  (normalizedRho large, >2)       → zero erosion  → preserves interior
  // This prevents volumetric noise from acting as a view-dependent overlay.
  let normalizedRho = rho * max(uniforms.densityGain, 0.01);
  let surfaceWeight = 1.0 - smoothstep(0.3, 2.0, normalizedRho);

  // Subtract noise scaled by surface weight
  let erodedRho = max(0.0, rho - noise * uniforms.erosionStrength * surfaceWeight * 2.0);

  // Smooth blending to avoid hard cuts
  return mix(rho, erodedRho, uniforms.erosionStrength);
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
export function generateMapPosToND(dimension: number): string {
  const dim = Math.min(Math.max(dimension, 3), 11)

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
// Uses global 'basis' uniform (BasisVectors) for basis vectors and origin.
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
  let band = exp(-0.5 * normalizedDistance * normalizedDistance);
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
  let flowedPos = pos;

  // Map 3D position to ND coordinates
  let xND = mapPosToND(flowedPos, uniforms);

  // Evaluate wavefunction and density
  let psi = evalPsi(xND, t, uniforms);
  var rho = rhoFromPsi(psi);

  // Hydrogen ND density boost
  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
    rho *= uniforms.hydrogenNDBoost;
  }

  // Apply Edge Erosion (using quantum-space coords so noise rotates with lobes)
  let qPos = vec3f(xND[0], xND[1], xND[2]);
  rho = erodeDensity(rho, qPos, uniforms);

  return rho;
}

// Sample density with phase information for coloring
// Returns: vec3f(rho, logRho, spatialPhase)
fn sampleDensityWithPhase(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> vec3f {
  let flowedPos = pos;

  // Map 3D position to ND coordinates
  let xND = mapPosToND(flowedPos, uniforms);

  // OPTIMIZED: Single-pass evaluation for both time-dependent density and spatial phase
  let psiResult = evalPsiWithSpatialPhase(xND, t, uniforms);
  let psi = psiResult.xy;
  let spatialPhase = psiResult.z;

  var rho = rhoFromPsi(psi);

  // Hydrogen ND density boost
  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
    rho *= uniforms.hydrogenNDBoost;
  }

  // Apply Edge Erosion (using quantum-space coords so noise rotates with lobes)
  let qPos = vec3f(xND[0], xND[1], xND[2]);
  rho = erodeDensity(rho, qPos, uniforms);

  // Confidence-boundary emphasis around an iso-probability surface.
  // Skipped in compute shaders (SKIP_DENSITY_EMPHASIS=true) so the density grid
  // stores raw density; emphasis is applied per-pixel in the fragment raymarcher.
  if (!SKIP_DENSITY_EMPHASIS) {
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
  if (uniforms.probabilityFlowEnabled != 0u && uniforms.probabilityFlowStrength > 0.0) {
    let pcfSpeedMod = 1.0 - clamp(rho * 5.0, 0.0, 1.0);
    let pcfTime = uniforms.time * uniforms.probabilityFlowSpeed;
    let pcfOffset = pcfTime * pcfSpeedMod;
    let psiLen = max(length(psi), 1e-8);
    let pcfCosP = psi.x / psiLen;
    let pcfSinP = psi.y / psiLen;
    let pcfNoise = gradientNoise(flowedPos * 2.0 + vec3f(
        pcfOffset + pcfCosP * 0.5,
        pcfSinP * 0.5,
        pcfOffset * 0.7 + pcfCosP * 0.3
    ));
    rho *= (1.0 + pcfNoise * uniforms.probabilityFlowStrength * pcfSpeedMod);
    rho = max(rho, 0.0);
  }

  let s = sFromRho(rho);

  return vec3f(rho, s, spatialPhase);
}

// Sample density with phase, also returning the flowed position for gradient reuse
// Returns tuple: (vec3f density info, vec3f flowed position)
fn sampleDensityWithPhaseAndFlow(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> array<vec3f, 2> {
  let flowedPos = pos;

  // Map 3D position to ND coordinates
  let xND = mapPosToND(flowedPos, uniforms);

  // OPTIMIZED: Single-pass evaluation
  let psiResult = evalPsiWithSpatialPhase(xND, t, uniforms);
  let psi = psiResult.xy;
  let spatialPhase = psiResult.z;

  var rho = rhoFromPsi(psi);

  // Hydrogen ND density boost
  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
    rho *= uniforms.hydrogenNDBoost;
  }

  // Apply Edge Erosion (using quantum-space coords so noise rotates with lobes)
  let qPos = vec3f(xND[0], xND[1], xND[2]);
  rho = erodeDensity(rho, qPos, uniforms);

  // Confidence-boundary emphasis (see sampleDensityWithPhase for details)
  if (!SKIP_DENSITY_EMPHASIS) {
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

  // Phase-coherent quantum texture (see sampleDensityWithPhase for details)
  if (uniforms.probabilityFlowEnabled != 0u && uniforms.probabilityFlowStrength > 0.0) {
    let pcfSpeedMod = 1.0 - clamp(rho * 5.0, 0.0, 1.0);
    let pcfTime = uniforms.time * uniforms.probabilityFlowSpeed;
    let pcfOffset = pcfTime * pcfSpeedMod;
    let psiLen = max(length(psi), 1e-8);
    let pcfCosP = psi.x / psiLen;
    let pcfSinP = psi.y / psiLen;
    let pcfNoise = gradientNoise(flowedPos * 2.0 + vec3f(
        pcfOffset + pcfCosP * 0.5,
        pcfSinP * 0.5,
        pcfOffset * 0.7 + pcfCosP * 0.3
    ));
    rho *= (1.0 + pcfNoise * uniforms.probabilityFlowStrength * pcfSpeedMod);
    rho = max(rho, 0.0);
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

  // Hydrogen ND density boost
  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
    rho *= uniforms.hydrogenNDBoost;
  }

  // Apply Edge Erosion (using quantum-space coords so noise rotates with lobes)
  let qPos = vec3f(xND[0], xND[1], xND[2]);
  rho = erodeDensity(rho, qPos, uniforms);

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

  // Hydrogen ND density boost (still needed for correct gradient magnitude)
  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
    rho *= uniforms.hydrogenNDBoost;
  }

  // NO erosion applied - gradient shape from base wavefunction is sufficient
  return rho;
}
`

/**
 * Legacy combined block - kept for backwards compatibility
 * Uses generic loop-based mapping with global basis uniform
 */
export const densityBlock =
  densityPreMapBlock +
  /* wgsl */ `
// Fallback: generic loop-based mapping using basis uniform
fn mapPosToND(pos: vec3f, uniforms: SchroedingerUniforms) -> array<f32, 11> {
  var xND: array<f32, 11>;
  for (var j = 0; j < 11; j++) {
    let bx = getBasisComponent(basis.basisX, j);
    let by = getBasisComponent(basis.basisY, j);
    let bz = getBasisComponent(basis.basisZ, j);
    let o = getBasisComponent(basis.origin, j);
    xND[j] = (o + pos.x * bx + pos.y * by + pos.z * bz) * uniforms.fieldScale;
  }
  return xND;
}
` +
  densityPostMapBlock
