/**
 * WGSL Schrödinger wavefunction evaluation
 *
 * Supports two quantum physics modes:
 *
 * 1. HARMONIC OSCILLATOR (quantum_mode == 0):
 *    Evaluates the time-dependent wavefunction as a superposition of
 *    harmonic oscillator eigenstates:
 *      ψ(x,t) = Σ_k c_k · Φ_k(x) · e^{-iE_k t}
 *
 * 2. HYDROGEN ND (quantum_mode == 1):
 *    Evaluates an N-dimensional hydrogen-like wavefunction:
 *      ψ_ND = R_nl(r_D) × Y_lm(θ,φ) × ∏_{j=4}^{D} φ_{nj}(xj)
 *
 * Port of GLSL quantum/psi.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/psi.wgsl
 */

/**
 * Full psi block with dynamic HO superposition loop.
 * Used when termCount is NOT known at compile time.
 */
export const psiBlock = /* wgsl */ `
// ============================================
// Wavefunction Evaluation (Mode-Switching)
// ============================================
// Note: QUANTUM_MODE_* constants defined in uniforms.wgsl.ts

// ----------------------------------------
// Harmonic Oscillator Mode Evaluation (Dynamic Loop)
// ----------------------------------------

// Evaluate harmonic oscillator wavefunction with runtime term count
fn evalHarmonicOscillatorPsi(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  var psi = vec2f(0.0, 0.0);

  for (var k = 0; k < 8; k++) {
    if (k >= uniforms.termCount) { break; }

    // Time phase factor: e^{-iE_k t}
    let phase = -getEnergy(uniforms, k) * t;
    let timeFactor = cexp_i(phase);

    // Complex coefficient c_k
    let coeff = getCoeff(uniforms, k);

    // Combined: c_k · e^{-iE_k t}
    let term = cmul(coeff, timeFactor);

    // Spatial eigenfunction Φ_k(x)
    // Uses compile-time dimension dispatch for loop unrolling optimization
    let spatial = hoNDOptimized(xND, k, uniforms);

    // Accumulate: ψ += c_k · Φ_k(x) · e^{-iE_k t}
    psi += cscale(spatial, term);
  }

  return psi;
}

// ----------------------------------------
// Unified Evaluation (Mode-Switching)
// ----------------------------------------

// Evaluate wavefunction ψ(x,t) at D-dimensional point xND and time t
// Returns complex value as vec2f(re, im)
// Automatically selects between harmonic oscillator and hydrogen ND modes
fn evalPsi(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  // Check quantum mode and dispatch
  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
    // Hydrogen ND mode - use generated dispatch function
    return hydrogenNDOptimized(xND, t, uniforms);
  }

  // Default: Harmonic oscillator mode
  return evalHarmonicOscillatorPsi(xND, t, uniforms);
}

// Evaluate ψ with phase information for coloring
// Returns: vec3f(re, im, phase)
fn evalPsiWithPhase(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec3f {
  let psi = evalPsi(xND, t, uniforms);
  let phase = atan2(psi.y, psi.x);
  return vec3f(psi.x, psi.y, phase);
}

// Evaluate spatial-only phase (t=0) for stable coloring
// This gives position-dependent color without time-flickering
fn evalSpatialPhase(xND: array<f32, 11>, uniforms: SchroedingerUniforms) -> f32 {
  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
    // Hydrogen ND mode - evaluate at t=0 for spatial phase
    let psi = hydrogenNDOptimized(xND, 0.0, uniforms);
    return atan2(psi.y, psi.x);
  }

  // Harmonic oscillator mode
  var psi = vec2f(0.0, 0.0);

  for (var k = 0; k < 8; k++) {
    if (k >= uniforms.termCount) { break; }

    // No time factor - just spatial part
    let coeff = getCoeff(uniforms, k);
    let spatial = hoNDOptimized(xND, k, uniforms);
    psi += cscale(spatial, coeff);
  }

  return atan2(psi.y, psi.x);
}

// OPTIMIZED: Evaluate time-dependent ψ AND spatial-only phase in ONE pass
// This computes both the density (from time-dependent |ψ|²) and the
// stable spatial phase (for coloring) without redundant calculations.
// Returns: vec4f(psi_time.re, psi_time.im, spatialPhase, relativePhaseToSpatialRef)
fn evalPsiWithSpatialPhase(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec4f {
  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
    // OPTIMIZED: Evaluate spatial wavefunction ONCE (at t=0)
    let psiSpatial = hydrogenNDOptimized(xND, 0.0, uniforms);

    // Spatial phase for stable coloring (default)
    let spatialPhase = atan2(psiSpatial.y, psiSpatial.x);

    // Phase animation: compute time-dependent phase rotation when enabled
    var outputPhase = spatialPhase;
    if (uniforms.phaseAnimationEnabled != 0u) {
      // Use simplified hydrogen energy (extra dimension contributions are small)
      let nf = f32(uniforms.principalN);
      let E = -0.5 / (nf * nf);

      // phase(t) = phase_spatial - E * t
      outputPhase = spatialPhase - E * t;
    }

    // Hydrogen ND keeps spatial-only density for stability; relative phase is
    // interpreted as animated offset from the spatial reference phase.
    let relativePhase = outputPhase - spatialPhase;
    return vec4f(psiSpatial.x, psiSpatial.y, outputPhase, relativePhase);
  }

  // Harmonic oscillator mode
  var psiTime = vec2f(0.0, 0.0);
  var psiSpatial = vec2f(0.0, 0.0);

  for (var k = 0; k < 8; k++) {
    if (k >= uniforms.termCount) { break; }

    // Spatial eigenfunction - computed ONCE per term
    let spatial = hoNDOptimized(xND, k, uniforms);

    // Complex coefficient c_k
    let coeff = getCoeff(uniforms, k);

    // Spatial-only accumulation (no time factor)
    psiSpatial += cscale(spatial, coeff);

    // Time-dependent accumulation
    let phase = -getEnergy(uniforms, k) * t;
    let timeFactor = cexp_i(phase);
    let term = cmul(coeff, timeFactor);
    psiTime += cscale(spatial, term);
  }

  let spatialPhase = atan2(psiSpatial.y, psiSpatial.x);
  let refNorm2 = dot(psiSpatial, psiSpatial);
  let psiNorm2 = dot(psiTime, psiTime);
  var relativePhase = spatialPhase;
  if (refNorm2 > 1e-12 && psiNorm2 > 1e-12) {
    let imagPart = psiSpatial.x * psiTime.y - psiSpatial.y * psiTime.x;
    let realPart = dot(psiSpatial, psiTime);
    relativePhase = atan2(imagPart, realPart);
  }
  return vec4f(psiTime.x, psiTime.y, spatialPhase, relativePhase);
}
`

/**
 * Dynamic psi block - assumes evalHarmonicOscillatorPsi is provided externally.
 * Used when termCount IS known at compile time and HO superposition is unrolled.
 * The unrolled dispatch block provides evalHarmonicOscillatorPsi, evalHOSpatialOnly,
 * and evalHOCombinedPsi functions.
 */
export const psiBlockDynamic = /* wgsl */ `
// ============================================
// Wavefunction Evaluation (Mode-Switching)
// HO functions provided by unrolled dispatch block
// ============================================
// Note: QUANTUM_MODE_* constants defined in uniforms.wgsl.ts
// Note: evalHarmonicOscillatorPsi is provided by HO Dispatch (Unrolled) block

// ----------------------------------------
// Unified Evaluation (Mode-Switching)
// ----------------------------------------

// Evaluate wavefunction ψ(x,t) at D-dimensional point xND and time t
fn evalPsi(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
    return hydrogenNDOptimized(xND, t, uniforms);
  }

  // Default: Harmonic oscillator mode (unrolled version)
  return evalHarmonicOscillatorPsi(xND, t, uniforms);
}

// Evaluate ψ with phase information for coloring
fn evalPsiWithPhase(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec3f {
  let psi = evalPsi(xND, t, uniforms);
  let phase = atan2(psi.y, psi.x);
  return vec3f(psi.x, psi.y, phase);
}

// Evaluate spatial-only phase (t=0) for stable coloring
fn evalSpatialPhase(xND: array<f32, 11>, uniforms: SchroedingerUniforms) -> f32 {
  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
    let psi = hydrogenNDOptimized(xND, 0.0, uniforms);
    return atan2(psi.y, psi.x);
  }

  // Harmonic oscillator mode - use unrolled spatial function
  let psi = evalHOSpatialOnly(xND, uniforms);
  return atan2(psi.y, psi.x);
}

// OPTIMIZED: Evaluate time-dependent ψ AND spatial-only phase in ONE pass
fn evalPsiWithSpatialPhase(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec4f {
  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
    let psiSpatial = hydrogenNDOptimized(xND, 0.0, uniforms);
    let spatialPhase = atan2(psiSpatial.y, psiSpatial.x);
    var outputPhase = spatialPhase;
    if (uniforms.phaseAnimationEnabled != 0u) {
      let nf = f32(uniforms.principalN);
      let E = -0.5 / (nf * nf);
      outputPhase = spatialPhase - E * t;
    }
    let relativePhase = outputPhase - spatialPhase;
    return vec4f(psiSpatial.x, psiSpatial.y, outputPhase, relativePhase);
  }

  // Harmonic oscillator mode - use unrolled combined function
  return evalHOCombinedPsi(xND, t, uniforms);
}
`

/**
 * Harmonic-oscillator-only psi block with dynamic HO superposition loop.
 * Does not reference hydrogen symbols, enabling family-specific shader composition.
 * HO momentum is handled by CPU uniform transformation (1/ω, coefficient phase rotation),
 * so the shader always runs the position-mode path.
 */
export const psiBlockHarmonic = /* wgsl */ `
// ============================================
// Wavefunction Evaluation (Harmonic Oscillator)
// ============================================

// Evaluate harmonic oscillator wavefunction with runtime term count
fn evalHarmonicOscillatorPsi(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  var psi = vec2f(0.0, 0.0);

  for (var k = 0; k < 8; k++) {
    if (k >= uniforms.termCount) { break; }

    // Time phase factor: e^{-iE_k t}
    let phase = -getEnergy(uniforms, k) * t;
    let timeFactor = cexp_i(phase);

    // Complex coefficient c_k
    let coeff = getCoeff(uniforms, k);

    // Combined: c_k · e^{-iE_k t}
    let term = cmul(coeff, timeFactor);

    // Spatial eigenfunction Φ_k(x)
    let spatial = hoNDOptimized(xND, k, uniforms);

    // Accumulate: ψ += c_k · Φ_k(x) · e^{-iE_k t}
    psi += cscale(spatial, term);
  }

  return psi;
}

// Evaluate wavefunction ψ(x,t) at D-dimensional point xND and time t.
fn evalPsi(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  return evalHarmonicOscillatorPsi(xND, t, uniforms);
}

// Evaluate ψ with phase information for coloring.
fn evalPsiWithPhase(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec3f {
  let psi = evalPsi(xND, t, uniforms);
  let phase = atan2(psi.y, psi.x);
  return vec3f(psi.x, psi.y, phase);
}

// Evaluate spatial-only phase (t=0) for stable coloring.
fn evalSpatialPhase(xND: array<f32, 11>, uniforms: SchroedingerUniforms) -> f32 {
  var psi = vec2f(0.0, 0.0);

  for (var k = 0; k < 8; k++) {
    if (k >= uniforms.termCount) { break; }

    let coeff = getCoeff(uniforms, k);
    let spatial = hoNDOptimized(xND, k, uniforms);
    psi += cscale(spatial, coeff);
  }

  return atan2(psi.y, psi.x);
}

// Evaluate time-dependent ψ and spatial-only phase in one pass.
// Returns: vec4f(psi_time.re, psi_time.im, spatialPhase, relativePhaseToSpatialRef)
fn evalPsiWithSpatialPhase(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec4f {
  var psiTime = vec2f(0.0, 0.0);
  var psiSpatial = vec2f(0.0, 0.0);

  for (var k = 0; k < 8; k++) {
    if (k >= uniforms.termCount) { break; }

    let spatial = hoNDOptimized(xND, k, uniforms);
    let coeff = getCoeff(uniforms, k);

    psiSpatial += cscale(spatial, coeff);

    let phase = -getEnergy(uniforms, k) * t;
    let timeFactor = cexp_i(phase);
    let term = cmul(coeff, timeFactor);
    psiTime += cscale(spatial, term);
  }

  let spatialPhase = atan2(psiSpatial.y, psiSpatial.x);
  let refNorm2 = dot(psiSpatial, psiSpatial);
  let psiNorm2 = dot(psiTime, psiTime);
  var relativePhase = spatialPhase;
  if (refNorm2 > 1e-12 && psiNorm2 > 1e-12) {
    let imagPart = psiSpatial.x * psiTime.y - psiSpatial.y * psiTime.x;
    let realPart = dot(psiSpatial, psiTime);
    relativePhase = atan2(imagPart, realPart);
  }
  return vec4f(psiTime.x, psiTime.y, spatialPhase, relativePhase);
}
`

/**
 * Harmonic-oscillator-only psi block for unrolled HO superposition variants.
 * Requires evalHarmonicOscillatorPsi/evalHOSpatialOnly/evalHOCombinedPsi from HO dispatch.
 * HO momentum is handled by CPU uniform transformation, so no momentum branching.
 */
export const psiBlockDynamicHarmonic = /* wgsl */ `
// ============================================
// Wavefunction Evaluation (Harmonic Oscillator, Unrolled)
// ============================================
// Note: evalHarmonicOscillatorPsi is provided by HO Dispatch (Unrolled) block

fn evalPsi(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  return evalHarmonicOscillatorPsi(xND, t, uniforms);
}

fn evalPsiWithPhase(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec3f {
  let psi = evalPsi(xND, t, uniforms);
  let phase = atan2(psi.y, psi.x);
  return vec3f(psi.x, psi.y, phase);
}

fn evalSpatialPhase(xND: array<f32, 11>, uniforms: SchroedingerUniforms) -> f32 {
  let psi = evalHOSpatialOnly(xND, uniforms);
  return atan2(psi.y, psi.x);
}

fn evalPsiWithSpatialPhase(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec4f {
  return evalHOCombinedPsi(xND, t, uniforms);
}
`

/**
 * Hydrogen-ND-only psi block.
 * Does not reference HO-specific symbols, enabling family-specific shader composition.
 */
export const psiBlockHydrogenND = /* wgsl */ `
// ============================================
// Wavefunction Evaluation (Hydrogen ND)
// ============================================

fn phaseNegI(power: i32) -> vec2f {
  let m = ((power % 4) + 4) % 4;
  if (m == 0) { return vec2f(1.0, 0.0); }
  if (m == 1) { return vec2f(0.0, -1.0); }
  if (m == 2) { return vec2f(-1.0, 0.0); }
  return vec2f(0.0, 1.0);
}

fn evalHydrogenNDMomentumSpatial(
  xND: array<f32, 11>,
  uniforms: SchroedingerUniforms
) -> vec2f {
  let kScale = max(uniforms.momentumScale, 1e-4);
  let representationNorm = pow(kScale, 0.5 * f32(max(ACTUAL_DIM, 1)));

  let kx = xND[0] * kScale;
  let ky = xND[1] * kScale;
  let kz = xND[2] * kScale;
  let r3D = length(vec3f(kx, ky, kz));
  let invR = 1.0 / max(r3D, 1e-10);
  let nx = kx * invR;
  let ny = ky * invR;
  let nz = kz * invR;

  let radial = hydrogenRadialMomentum(
    uniforms.principalN,
    uniforms.azimuthalL,
    r3D,
    uniforms.bohrRadius
  );
  let angular = evalHydrogenNDAngularCartesian(
    uniforms.azimuthalL,
    uniforms.magneticM,
    nx, ny, nz,
    uniforms.useRealOrbitals != 0u
  );

  var extraProduct = 1.0;
  var extraQuantumSum = 0;
  for (var i = 0; i < 8; i++) {
    if (i >= ACTUAL_DIM - 3) { break; }
    let nExtra = getExtraDimN(uniforms, i);
    extraQuantumSum += nExtra;
    let omegaExtra = max(getExtraDimOmega(uniforms, i), 0.01);
    let reciprocalOmega = 1.0 / omegaExtra;
    let kExtra = xND[i + 3] * kScale;
    extraProduct *= ho1D(nExtra, kExtra, reciprocalOmega);
    if (abs(extraProduct) < 1e-10) { return vec2f(0.0, 0.0); }
  }

  let amplitude = radial * angular * extraProduct * representationNorm;
  let momentumPhase = phaseNegI(uniforms.azimuthalL + extraQuantumSum);
  return cscale(amplitude, momentumPhase);
}

fn evalHydrogenNDMomentumPsi(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  let psiSpatial = evalHydrogenNDMomentumSpatial(xND, uniforms);
  let nf = f32(max(uniforms.principalN, 1));
  let energy = -0.5 / (nf * nf);
  return cmul(psiSpatial, cexp_i(-energy * t));
}

fn evalPsi(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  if (uniforms.representationMode == REPRESENTATION_MOMENTUM) {
    return evalHydrogenNDMomentumPsi(xND, t, uniforms);
  }
  return hydrogenNDOptimized(xND, t, uniforms);
}

fn evalPsiWithPhase(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec3f {
  let psi = evalPsi(xND, t, uniforms);
  let phase = atan2(psi.y, psi.x);
  return vec3f(psi.x, psi.y, phase);
}

fn evalSpatialPhase(xND: array<f32, 11>, uniforms: SchroedingerUniforms) -> f32 {
  if (uniforms.representationMode == REPRESENTATION_MOMENTUM) {
    let psi = evalHydrogenNDMomentumSpatial(xND, uniforms);
    return atan2(psi.y, psi.x);
  }

  let psi = hydrogenNDOptimized(xND, 0.0, uniforms);
  return atan2(psi.y, psi.x);
}

fn evalPsiWithSpatialPhase(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec4f {
  var psiSpatial = vec2f(0.0, 0.0);
  if (uniforms.representationMode == REPRESENTATION_MOMENTUM) {
    psiSpatial = evalHydrogenNDMomentumSpatial(xND, uniforms);
  } else {
    psiSpatial = hydrogenNDOptimized(xND, 0.0, uniforms);
  }
  let spatialPhase = atan2(psiSpatial.y, psiSpatial.x);

  var outputPhase = spatialPhase;
  if (uniforms.phaseAnimationEnabled != 0u) {
    let nf = f32(uniforms.principalN);
    let E = -0.5 / (nf * nf);
    outputPhase = spatialPhase - E * t;
  }

  let relativePhase = outputPhase - spatialPhase;
  return vec4f(psiSpatial.x, psiSpatial.y, outputPhase, relativePhase);
}
`
