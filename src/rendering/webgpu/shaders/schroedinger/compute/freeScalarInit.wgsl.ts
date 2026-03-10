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
 */

/**
 * Uniform struct for free scalar field parameters.
 * N-D capable layout with per-dimension arrays of 12 elements each.
 * WGSL alignment: total 480 bytes.
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
  let coords = linearToND(idx, params.gridSize, params.latticeDim);

  // Compute world-space position per dimension (centered on origin)
  var worldPos: array<f32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let halfExtent = f32(params.gridSize[d]) * params.spacing[d] * 0.5;
    worldPos[d] = f32(coords[d]) * params.spacing[d] - halfExtent;
  }

  var phiVal: f32 = 0.0;
  var piVal: f32 = 0.0;

  if (params.initCondition == 1u) {
    // Single mode: phi = A * cos(k . x), pi = A * omega * sin(k . x)
    // Physical wave vector: k_phys_d = 2*pi*n_d / L_d
    var phase: f32 = 0.0;
    var omegaSq: f32 = params.mass * params.mass;

    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      let latticeL = f32(params.gridSize[d]) * params.spacing[d];
      if (latticeL <= 0.0 || params.gridSize[d] <= 1u) { continue; }

      let kPhys = 6.283185307 * f32(params.modeK[d]) / latticeL;
      phase += kPhys * worldPos[d];

      // Lattice dispersion: (2/a) * sin(k * a / 2)
      let sk = 2.0 * sin(kPhys * params.spacing[d] * 0.5) / params.spacing[d];
      omegaSq += sk * sk;
    }

    let omega = sqrt(omegaSq);
    phiVal = params.packetAmplitude * cos(phase);
    piVal = params.packetAmplitude * omega * sin(phase);
  } else if (params.initCondition == 2u) {
    // Gaussian packet: phi = A * exp(-|x-x0|^2 / (2*sigma^2)) * cos(k . x)
    //                  pi  = A * omega * exp(...) * sin(k . x)  (traveling wave)
    var r2: f32 = 0.0;
    var phase: f32 = 0.0;
    var omegaSq: f32 = params.mass * params.mass;

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

    let omega = sqrt(omegaSq);
    let sigma2 = params.packetWidth * params.packetWidth;
    let envelope = params.packetAmplitude * exp(-r2 / (2.0 * sigma2));
    phiVal = envelope * cos(phase);
    piVal = envelope * omega * sin(phase);
  }
  // initCondition == 0u (vacuumNoise): no-op, data written by CPU

  phi[idx] = phiVal;
  pi[idx] = piVal;
}
`
