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
 *      ψ_ND = R_nl^(D)(r_3D) × Y_lm(θ,φ) × ∏_{j=4}^{D} φ_{nj}(xj)
 *    The radial part R_nl^(D) uses the D-dimensional Coulomb solution
 *    with effective angular momentum λ = l + (D-3)/2 and n_eff = n + (D-3)/2.
 *
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/psi.wgsl
 */

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
  // length() + divide fused into inverseSqrt (1 transcendental instead of 2).
  let sumK = kx * kx + ky * ky + kz * kz;
  let invR = inverseSqrt(max(sumK, 1e-20));
  let r3D = sumK * invR;
  let nx = kx * invR;
  let ny = ky * invR;
  let nz = kz * invR;

  let radial = hydrogenRadialMomentumND(
    uniforms.principalN,
    uniforms.azimuthalL,
    r3D,
    uniforms.bohrRadius,
    ACTUAL_DIM
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

  let realScale = radial * extraProduct * representationNorm;
  let psiSpatialMom = realScale * angular;
  let momentumPhase = phaseNegI(uniforms.azimuthalL + extraQuantumSum);
  return cmul(psiSpatialMom, momentumPhase);
}

fn evalHydrogenNDMomentumPsi(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  let psiSpatial = evalHydrogenNDMomentumSpatial(xND, uniforms);
  let nf = f32(max(uniforms.principalN, 1));
  let nEff = nf + f32(ACTUAL_DIM - 3) * 0.5;
  let energy = -0.5 / (nEff * nEff);
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
    // Guard against principalN=0 — matches the explicit max() in the
    // other psi blocks and the momentum variant; keeps phase animation
    // NaN-free if a legacy-preset import ever bypasses the setter clamp.
    let nf = f32(max(uniforms.principalN, 1));
    let nEff = nf + f32(ACTUAL_DIM - 3) * 0.5;
    let E = -0.5 / (nEff * nEff);
    outputPhase = spatialPhase - E * t;
  }

  let relativePhase = outputPhase - spatialPhase;
  return vec4f(psiSpatial.x, psiSpatial.y, outputPhase, relativePhase);
}
`

/**
 * Hydrogen ND Coupled psi block.
 * Uses hydrogenNDCoupledOptimized() from hyperspherical harmonics module.
 * Position-only for now (momentum-space deferred).
 */
export const psiBlockHydrogenNDCoupled = /* wgsl */ `
// ============================================
// Wavefunction Evaluation (Hydrogen ND Coupled)
// True D-dimensional Coulomb with hyperspherical harmonics
// ============================================

fn evalPsi(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  return hydrogenNDCoupledOptimized(xND, t, uniforms);
}

fn evalPsiWithPhase(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec3f {
  let psi = evalPsi(xND, t, uniforms);
  let phase = atan2(psi.y, psi.x);
  return vec3f(psi.x, psi.y, phase);
}

fn evalSpatialPhase(xND: array<f32, 11>, uniforms: SchroedingerUniforms) -> f32 {
  let psi = hydrogenNDCoupledOptimized(xND, 0.0, uniforms);
  return atan2(psi.y, psi.x);
}

fn evalPsiWithSpatialPhase(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec4f {
  let psiSpatial = hydrogenNDCoupledOptimized(xND, 0.0, uniforms);
  let spatialPhase = atan2(psiSpatial.y, psiSpatial.x);

  var outputPhase = spatialPhase;
  if (uniforms.phaseAnimationEnabled != 0u) {
    // Guard against principalN=0 — matches the explicit max() in the
    // other psi blocks and the momentum variant; keeps phase animation
    // NaN-free if a legacy-preset import ever bypasses the setter clamp.
    let nf = f32(max(uniforms.principalN, 1));
    let nEff = nf + f32(ACTUAL_DIM - 3) * 0.5;
    let E = -0.5 / (nEff * nEff);
    outputPhase = spatialPhase - E * t;
  }

  let relativePhase = outputPhase - spatialPhase;
  return vec4f(psiSpatial.x, psiSpatial.y, outputPhase, relativePhase);
}
`
