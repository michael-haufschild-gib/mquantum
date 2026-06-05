/**
 * Free Scalar Field Initialization Compute Shader
 *
 * Initializes phi and pi storage buffers from selected initial conditions:
 * - singleMode (1u): plane wave A*cos(k.x) with conjugate momentum
 * - gaussianPacket (2u): Traveling Gaussian wavepacket with carrier wave and conjugate momentum
 * - retrocausalCaustic (4u): bounded recursive advanced/retarded image caustic
 * - rankDefectGenesis (5u): zero-mean orthogonal rank-completion seed
 * - chronogenicShear (6u): sheared rank-completion seed
 *
 * Supports N-dimensional lattices (1-11D) via per-dimension arrays and stride tables.
 * vacuumNoise is handled CPU-side via exact vacuum spectrum sampling
 * (see src/lib/physics/freeScalar/vacuumSpectrum.ts).
 *
 * Exports both raw template literals (legacy string-concat consumers) and
 * `ShaderBlock` wrappers for `assembleShaderBlocks()` composition.
 */

import type { ShaderBlock } from '../../../shared/compose-helpers'

/**
 * Uniform struct for free scalar field parameters.
 * N-D capable layout with per-dimension arrays of 12 elements each.
 * WGSL alignment: total 528 bytes.
 */
export const freeScalarUniformsBlock = /* wgsl */ `
struct FreeScalarUniforms {
  // Scalars (16 bytes)
  latticeDim: u32,           // offset 0
  totalSites: u32,           // offset 4
  mass: f32,                 // offset 8
  dt: f32,                   // offset 12

  // Per-dimension arrays (48 bytes each)
  gridSize: array<u32, 12>,  // offset 16
  strides: array<u32, 12>,   // offset 64
  spacing: array<f32, 12>,   // offset 112

  // Init/display scalars (32 bytes)
  initCondition: u32,        // offset 160
  fieldView: u32,            // offset 164
  stepsPerFrame: u32,        // offset 168
  packetWidth: f32,          // offset 172
  packetAmplitude: f32,      // offset 176
  maxFieldValue: f32,        // offset 180
  boundingRadius: f32,       // offset 184
  analysisMode: u32,         // offset 188 (0=off, 1=hamiltonian/character, 2=flux)

  // Per-dimension init arrays (48 bytes each)
  packetCenter: array<f32, 12>, // offset 192
  modeK: array<i32, 12>,       // offset 240
  slicePositions: array<f32, 12>, // offset 288

  // Basis vectors for N-D -> 3D projection (48 bytes each)
  basisX: array<f32, 12>,    // offset 336
  basisY: array<f32, 12>,    // offset 384
  basisZ: array<f32, 12>,    // offset 432

  // Self-interaction parameters (16 bytes)
  selfInteractionEnabled: u32,  // offset 480
  selfInteractionLambda: f32,   // offset 484
  selfInteractionVev: f32,      // offset 488
  absorberEnabled: u32,         // offset 492 — 0=disabled, 1=damp toward φ=0,
                                //              2=damp toward φ=sign(x−center)·vev
                                //                (kink-aware target preserves the
                                //                 domain-wall asymptotes at the PML
                                //                 boundary rather than dissolving
                                //                 them toward 0).

  // PML absorber + cosmology A/B coefficients (16 bytes)
  absorberWidth: f32,           // offset 496
  absorberStrength: f32,        // offset 500 (σ_max, auto-computed from R_target)
  aKinetic: f32,                // offset 504 — a^(−(n−2)), drift coefficient for
                                //              δφ' = aKinetic · π. 1.0 under Minkowski.
  aPotential: f32,              // offset 508 — a^(n−2), gradient (stress) coefficient for
                                //              π' ⊃ aPotential · ∇²δφ. 1.0 under Minkowski.

  // Remaining cosmology coefficient + preheating scale + Bianchi-I anisotropy (16 bytes)
  aFull: f32,                   // offset 512 — a^n, volume-form coefficient for the
                                //              mass term (mass²·aFull·δφ) and the
                                //              self-interaction V'. 1.0 under Minkowski.
  massSquaredScale: f32,        // offset 516 — post-inflation preheating drive. The
                                //              pi-update multiplies the mass term by
                                //              (1 + A·sin(Ω·(η−η_ref))), turning each
                                //              mode's evolution into the Mathieu
                                //              equation and enabling exponential
                                //              parametric amplification inside the
                                //              Floquet instability tongues. 1.0 when
                                //              the drive is disabled — a multiplicative
                                //              no-op composing with every other branch.
  aPotentialRatio1: f32,        // offset 520 — Bianchi-I Kasner per-axis ratio
                                //              aPot_1/aPot_0 = (a_1/a_2)² for axis-1
                                //              kinetic coefficient. 1.0 under every
                                //              isotropic preset — the pi-update
                                //              shader adds a correction term
                                //              (ratio1−1)·axialLap_1 that evaluates
                                //              to exactly 0 when ratio1 = 1, giving
                                //              bit-identical output on the flat path.
  aPotentialRatio2: f32,        // offset 524 — Bianchi-I Kasner per-axis ratio
                                //              aPot_2/aPot_0 = (a_1/a_3)² for axis-2.
                                //              Same bit-identity property.
}
`

/**
 * Initialization compute shader entry point.
 * Maps 1D global invocation ID to N-D lattice coordinates via stride table,
 * computes world position per dimension, and initializes phi/pi from the
 * selected initial condition.
 *
 * Note: initCondition == 0u (vacuumNoise) is a no-op here since it is
 * handled by CPU-side exact vacuum spectrum sampling via writeBuffer.
 */
export const freeScalarInitBlock = /* wgsl */ `
// Bound as 'storage, read' (not 'uniform') because FreeScalarUniforms
// contains scalar arrays ('array<u32, 12>', 'array<f32, 12>') which the WGSL
// spec forbids in uniform address space (element stride must be a multiple of
// 16 bytes). Chrome/Tint silently accepts it, naga correctly rejects it;
// storage buffers have no such restriction. Tiny read-bandwidth cost.
@group(0) @binding(0) var<storage, read> params: FreeScalarUniforms;
@group(0) @binding(1) var<storage, read_write> phi: array<f32>;
@group(0) @binding(2) var<storage, read_write> pi: array<f32>;

const RETROCAUSAL_EPS: f32 = 1e-6;
const RETROCAUSAL_IMAGE_CLAMP: f32 = 8.0;
const RETROCAUSAL_PHASE_GAIN: f32 = 1.7;
const RETROCAUSAL_OMEGA_MAX: f32 = 96.0;

fn retrocausalClamp(v: f32, lo: f32, hi: f32) -> f32 {
  return min(hi, max(lo, v));
}

fn retrocausalMode(d: u32) -> f32 {
  return f32(params.modeK[d]);
}

fn retrocausalOffset(d: u32, iter: u32, dim: u32) -> f32 {
  let k0 = abs(retrocausalMode(d));
  let k1 = abs(retrocausalMode((d + 1u) % dim));
  let k2 = abs(retrocausalMode((d + 2u) % dim));
  return 0.54
    + 0.22 * cos(0.731 * f32(iter + 1u) * f32(d + 1u) + 0.173 * (k0 + 1.0))
    + 0.13 * sin(0.419 * f32(iter + 1u) * (k1 + k2 + 2.0));
}

fn retrocausalLoopPhase(iter: u32, dim: u32) -> f32 {
  var signedMode: f32 = 0.0;
  var absMode: f32 = 0.0;
  for (var d: u32 = 0u; d < dim; d++) {
    let k = retrocausalMode(d);
    signedMode += k * f32(d + 1u);
    absMode += abs(k);
  }
  let modeSign = select(sign(signedMode), 1.0, abs(signedMode) < RETROCAUSAL_EPS);
  return modeSign * (0.31 + 0.029 * absMode) * f32(iter + 1u);
}

fn retrocausalBoundedSum(sum: f32, norm: f32) -> f32 {
  return tanh(RETROCAUSAL_PHASE_GAIN * (sum / max(norm, RETROCAUSAL_EPS)));
}

fn retrocausalOmegaScale() -> f32 {
  var omegaSq = max(params.mass * params.mass, 0.0);
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    if (params.gridSize[d] <= 1u) { continue; }
    let spacing = max(abs(params.spacing[d]), RETROCAUSAL_EPS);
    let sk = 2.0 * sin(3.14159265358979323846 * retrocausalMode(d) / f32(params.gridSize[d])) / spacing;
    omegaSq += sk * sk;
  }
  return min(sqrt(max(omegaSq, 0.0)), RETROCAUSAL_OMEGA_MAX);
}

fn computeRetrocausalCaustic(worldPos: array<f32, 12>) -> vec2f {
  let dim = max(params.latticeDim, 1u);
  let sigma = max(abs(params.packetWidth), RETROCAUSAL_EPS);
  var p: array<f32, 12>;
  for (var d: u32 = 0u; d < dim; d++) {
    p[d] = (worldPos[d] - params.packetCenter[d]) / sigma;
  }

  var echoSum: f32 = 0.0;
  var kickSum: f32 = 0.0;
  var norm: f32 = 0.0;

  for (var iter: u32 = 0u; iter < 6u; iter++) {
    var r2: f32 = 0.0;
    for (var d: u32 = 0u; d < dim; d++) {
      r2 += p[d] * p[d];
    }
    r2 = max(r2, RETROCAUSAL_EPS);

    for (var d: u32 = 0u; d < dim; d++) {
      p[d] = retrocausalClamp(abs(p[d]) / r2 - retrocausalOffset(d, iter, dim), -RETROCAUSAL_IMAGE_CLAMP, RETROCAUSAL_IMAGE_CLAMP);
    }

    var imageR2: f32 = 0.0;
    var phase: f32 = retrocausalLoopPhase(iter, dim);
    for (var d: u32 = 0u; d < dim; d++) {
      imageR2 += p[d] * p[d];
      phase += retrocausalMode(d) * p[d];
    }

    let tau = sqrt(max(imageR2, RETROCAUSAL_EPS));
    let decay = pow(0.72, f32(iter)) / (1.0 + 0.035 * imageR2);
    echoSum += decay * cos(phase) * cos(tau);
    kickSum += decay * sin(phase) * sin(tau);
    norm += decay;
  }

  let echo = retrocausalBoundedSum(echoSum, norm);
  let kick = retrocausalBoundedSum(kickSum, norm);
  return vec2f(params.packetAmplitude * echo, params.packetAmplitude * retrocausalOmegaScale() * kick);
}

fn computeRankDefectGenesis(worldPos: array<f32, 12>) -> vec2f {
  let dim = max(params.latticeDim, 1u);
  let sigma = max(abs(params.packetWidth), 1e-6);
  var r2: f32 = 0.0;
  var x0: f32 = 0.0;
  var x1: f32 = 0.0;

  for (var d: u32 = 0u; d < dim; d++) {
    let centered = worldPos[d] + 0.5 * params.spacing[d] - params.packetCenter[d];
    let u = centered / sigma;
    r2 += u * u;
    if (d == 0u) { x0 = u; }
    if (d == 1u) { x1 = u; }
  }

  // Globally null, locally rank-bearing: phi on axis 0, pi on axis 1.
  let envelope = exp(-0.5 * r2);
  let omega = sqrt(max(params.mass * params.mass + 2.0 / (sigma * sigma), 0.0));
  let phiSeed = params.packetAmplitude * x0 * envelope;
  let piSeed = params.packetAmplitude * omega * x1 * envelope;
  return vec2f(phiSeed, piSeed);
}

fn computeChronogenicShear(worldPos: array<f32, 12>) -> vec2f {
  let dim = max(params.latticeDim, 1u);
  let sigma = max(abs(params.packetWidth), 1e-6);
  var r2: f32 = 0.0;
  var x0: f32 = 0.0;
  var x1: f32 = 0.0;

  for (var d: u32 = 0u; d < dim; d++) {
    let centered = worldPos[d] + 0.5 * params.spacing[d] - params.packetCenter[d];
    let u = centered / sigma;
    r2 += u * u;
    if (d == 0u) { x0 = u; }
    if (d == 1u) { x1 = u; }
  }

  // Radial phase-space shear; modeK[0] is integer winding.
  let shearWinding = max(abs(f32(params.modeK[0])), 1.0);
  let theta = 0.45 * shearWinding * r2;
  let c = cos(theta);
  let s = sin(theta);
  let envelope = exp(-0.5 * r2);
  let omega = sqrt(max(params.mass * params.mass + 2.0 / (sigma * sigma), 0.0));
  let phiSeed = params.packetAmplitude * (c * x0 - s * x1) * envelope;
  let piSeed = params.packetAmplitude * omega * (s * x0 + c * x1) * envelope;
  return vec2f(phiSeed, piSeed);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) { return; }

  // Map 1D index to N-D lattice coordinates
  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);

  // Compute world-space position per dimension (centered on origin)
  var worldPos: array<f32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let halfExtent = f32(params.gridSize[d]) * params.spacing[d] * 0.5;
    worldPos[d] = f32(coords[d]) * params.spacing[d] - halfExtent;
  }

  var phiVal: f32 = 0.0;
  var piVal: f32 = 0.0;

  // Cosmology-aware oscillator for the initial conjugate-momentum kick.
  // Hamilton equations give:
  //   δφ' = aKinetic·π
  //   π'  = −K·δφ, K = Σ_d aPotential_d·k_d² + m²·aFull·massSquaredScale
  // so ω² = aKinetic·K and π amplitude = ω/aKinetic. Under isotropic FLRW
  // aKinetic·aPotential = 1, reducing to the old k² + m²a² formula.
  let safeAKinetic = select(1.0, params.aKinetic, params.aKinetic > 0.0);
  let massStiffness = params.mass * params.mass * params.aFull * params.massSquaredScale;

  if (params.initCondition == 1u) {
    // Single mode: δφ = A * cos(k . x), π_δφ = δφ' / aKinetic
    //                  = (ω / aKinetic) · A · sin(k . x)
    // Physical wave vector: k_phys_d = 2*pi*n_d / L_d.
    var phase: f32 = 0.0;
    var omegaSq: f32 = safeAKinetic * massStiffness;

    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      let latticeL = f32(params.gridSize[d]) * params.spacing[d];
      if (latticeL <= 0.0 || params.gridSize[d] <= 1u) { continue; }

      let kPhys = 6.28318530717958647692 * f32(params.modeK[d]) / latticeL;
      phase += kPhys * worldPos[d];

      // Lattice dispersion: (2/a) * sin(k * a / 2)
      let sk = 2.0 * sin(kPhys * params.spacing[d] * 0.5) / params.spacing[d];
      var axisPotential = params.aPotential;
      if (d == 1u) { axisPotential *= params.aPotentialRatio1; }
      if (d == 2u) { axisPotential *= params.aPotentialRatio2; }
      omegaSq += safeAKinetic * axisPotential * sk * sk;
    }

    // ω² is non-negative for real mass and positive stiffness; the max() is
    // a belt-and-braces guard against pathological coefficient underflow.
    let omega = sqrt(max(omegaSq, 0.0));
    phiVal = params.packetAmplitude * cos(phase);
    piVal = (omega / safeAKinetic) * params.packetAmplitude * sin(phase);
  } else if (params.initCondition == 2u) {
    // Gaussian packet: δφ = A * exp(-|x-x0|^2 / (2*sigma^2)) * cos(k . x)
    //                  π_δφ = (ω / aKinetic) · A · exp(...) * sin(k . x)
    var r2: f32 = 0.0;
    var phase: f32 = 0.0;
    var omegaSq: f32 = safeAKinetic * massStiffness;

    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      let dx = worldPos[d] - params.packetCenter[d];
      r2 += dx * dx;

      let latticeL = f32(params.gridSize[d]) * params.spacing[d];
      if (latticeL > 0.0 && params.gridSize[d] > 1u) {
        let kPhys = 6.28318530717958647692 * f32(params.modeK[d]) / latticeL;
        phase += kPhys * worldPos[d];

        // Lattice dispersion: (2/a) * sin(k * a / 2)
        let sk = 2.0 * sin(kPhys * params.spacing[d] * 0.5) / params.spacing[d];
        var axisPotential = params.aPotential;
        if (d == 1u) { axisPotential *= params.aPotentialRatio1; }
        if (d == 2u) { axisPotential *= params.aPotentialRatio2; }
        omegaSq += safeAKinetic * axisPotential * sk * sk;
      }
    }

    let omega = sqrt(max(omegaSq, 0.0));
    // Guard zero / near-zero packetWidth: a degenerate width would send
    // invTwoSigma2 to INF and exp(-r2·INF) to NaN at the packet center,
    // poisoning the phi / pi buffers for the rest of the run.
    let width2 = max(params.packetWidth * params.packetWidth, 1e-12);
    let invTwoSigma2 = 0.5 / width2;
    let envelope = params.packetAmplitude * exp(-r2 * invTwoSigma2);
    phiVal = envelope * cos(phase);
    piVal = (omega / safeAKinetic) * envelope * sin(phase);
  } else if (params.initCondition == 3u) {
    // Kink profile: phi = v * tanh((x0 - center0) / width), pi = 0
    // Domain wall interpolating between -v and +v along axis 0
    let v = params.selfInteractionVev;
    let dx = worldPos[0] - params.packetCenter[0];
    let w = select(params.packetWidth, 0.3, params.packetWidth <= 0.0);
    phiVal = v * tanh(dx / w);
    piVal = 0.0;
  } else if (params.initCondition == 4u) {
    let caustic = computeRetrocausalCaustic(worldPos);
    phiVal = caustic.x;
    piVal = caustic.y;
  } else if (params.initCondition == 5u) {
    let completion = computeRankDefectGenesis(worldPos);
    phiVal = completion.x;
    piVal = completion.y;
  } else if (params.initCondition == 6u) {
    let shear = computeChronogenicShear(worldPos);
    phiVal = shear.x;
    piVal = shear.y;
  }
  // initCondition == 0u (vacuumNoise): no-op, data written by CPU

  phi[idx] = phiVal;
  pi[idx] = piVal;
}
`

// ─── ShaderBlock wrappers for assembleShaderBlocks() composition ────────────

/** `FreeScalarUniforms` struct as a ShaderBlock. */
export const freeScalarUniformsShaderBlock: ShaderBlock = {
  name: 'free-scalar-uniforms',
  content: freeScalarUniformsBlock,
}

/** Init compute entry point as a ShaderBlock. */
export const freeScalarInitShaderBlock: ShaderBlock = {
  name: 'free-scalar-init',
  content: freeScalarInitBlock,
}
