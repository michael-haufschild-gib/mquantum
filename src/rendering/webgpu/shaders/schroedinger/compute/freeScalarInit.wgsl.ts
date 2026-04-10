/**
 * Free Scalar Field Initialization Compute Shader
 *
 * Initializes phi and pi storage buffers from selected initial conditions:
 * - singleMode (1u): plane wave A*cos(k.x) with conjugate momentum
 * - gaussianPacket (2u): Traveling Gaussian wavepacket with carrier wave and conjugate momentum
 *
 * Supports N-dimensional lattices (1-11D) via per-dimension arrays and stride tables.
 * vacuumNoise is handled CPU-side via exact vacuum spectrum sampling
 * (see src/lib/physics/freeScalar/vacuumSpectrum.ts).
 *
 * Exports both raw template literals (legacy string-concat consumers) and
 * `ShaderBlock` wrappers for `assembleShaderBlocks()` composition.
 */

import type { ShaderBlock } from '../../shared/compose-helpers'

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
  absorberEnabled: u32,         // offset 492

  // PML absorber + cosmology A/B coefficients (16 bytes)
  absorberWidth: f32,           // offset 496
  absorberStrength: f32,        // offset 500 (σ_max, auto-computed from R_target)
  aKinetic: f32,                // offset 504 — a^(−(n−2)), drift coefficient for
                                //              δφ' = aKinetic · π. 1.0 under Minkowski.
  aPotential: f32,              // offset 508 — a^(n−2), gradient (stress) coefficient for
                                //              π' ⊃ aPotential · ∇²δφ. 1.0 under Minkowski.

  // Remaining cosmology coefficient + padding (16 bytes)
  aFull: f32,                   // offset 512 — a^n, volume-form coefficient for the
                                //              mass term (mass²·aFull·δφ) and the
                                //              self-interaction V'. 1.0 under Minkowski.
  _padCosmo0: u32,              // offset 516
  _padCosmo1: u32,              // offset 520
  _padCosmo2: u32,              // offset 524
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
@group(0) @binding(0) var<uniform> params: FreeScalarUniforms;
@group(0) @binding(1) var<storage, read_write> phi: array<f32>;
@group(0) @binding(2) var<storage, read_write> pi: array<f32>;

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

  // Cosmology-aware physical dispersion for the initial conjugate-momentum
  // kick. The canonical δφ Hamiltonian has ω² = k_lat² + mass²·a². We get
  // a² from aFull/aPotential (a^n / a^(n−2) = a²), valid for every preset
  // including the Minkowski trivial case where both coefs are 1. Under a
  // degenerate config (aPotential = 0), the fallback keeps ω² real and the
  // integrator can recover on the first full step.
  let aSq = select(1.0, params.aFull / params.aPotential, params.aPotential > 0.0);
  let massTerm = params.mass * params.mass * aSq;

  if (params.initCondition == 1u) {
    // Single mode: δφ = A * cos(k . x), π_δφ = a^(n−2) · δφ'
    //                  = aPotential · A · ω · sin(k . x)
    // Physical wave vector: k_phys_d = 2*pi*n_d / L_d.
    var phase: f32 = 0.0;
    var omegaSq: f32 = massTerm;

    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      let latticeL = f32(params.gridSize[d]) * params.spacing[d];
      if (latticeL <= 0.0 || params.gridSize[d] <= 1u) { continue; }

      let kPhys = 6.283185307 * f32(params.modeK[d]) / latticeL;
      phase += kPhys * worldPos[d];

      // Lattice dispersion: (2/a) * sin(k * a / 2)
      let sk = 2.0 * sin(kPhys * params.spacing[d] * 0.5) / params.spacing[d];
      omegaSq += sk * sk;
    }

    // ω² = k_lat² + m²·a² is non-negative for real mass; the max() is a
    // belt-and-braces guard against pathological configs (aFull/aPotential
    // overflow on underflow in extreme de Sitter futures).
    let omega = sqrt(max(omegaSq, 0.0));
    phiVal = params.packetAmplitude * cos(phase);
    piVal = params.aPotential * params.packetAmplitude * omega * sin(phase);
  } else if (params.initCondition == 2u) {
    // Gaussian packet: δφ = A * exp(-|x-x0|^2 / (2*sigma^2)) * cos(k . x)
    //                  π_δφ = aPotential · A · ω · exp(...) * sin(k . x)
    var r2: f32 = 0.0;
    var phase: f32 = 0.0;
    var omegaSq: f32 = massTerm;

    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      let dx = worldPos[d] - params.packetCenter[d];
      r2 += dx * dx;

      let latticeL = f32(params.gridSize[d]) * params.spacing[d];
      if (latticeL > 0.0 && params.gridSize[d] > 1u) {
        let kPhys = 6.283185307 * f32(params.modeK[d]) / latticeL;
        phase += kPhys * worldPos[d];

        // Lattice dispersion: (2/a) * sin(k * a / 2)
        let sk = 2.0 * sin(kPhys * params.spacing[d] * 0.5) / params.spacing[d];
        omegaSq += sk * sk;
      }
    }

    let omega = sqrt(max(omegaSq, 0.0));
    let sigma2 = params.packetWidth * params.packetWidth;
    let envelope = params.packetAmplitude * exp(-r2 / (2.0 * sigma2));
    phiVal = envelope * cos(phase);
    piVal = params.aPotential * envelope * omega * sin(phase);
  } else if (params.initCondition == 3u) {
    // Kink profile: phi = v * tanh((x0 - center0) / width), pi = 0
    // Domain wall interpolating between -v and +v along axis 0
    let v = params.selfInteractionVev;
    let dx = worldPos[0] - params.packetCenter[0];
    let w = select(params.packetWidth, 0.3, params.packetWidth <= 0.0);
    phiVal = v * tanh(dx / w);
    piVal = 0.0;
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
