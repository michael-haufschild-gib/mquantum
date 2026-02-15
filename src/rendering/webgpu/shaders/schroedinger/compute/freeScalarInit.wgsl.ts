/**
 * Free Scalar Field Initialization Compute Shader
 *
 * Initializes phi and pi storage buffers from selected initial conditions:
 * - vacuumNoise: pseudo-random Gaussian noise
 * - singleMode: plane wave A*cos(k.x) with conjugate momentum
 * - gaussianPacket: Gaussian envelope with carrier wave
 */

/**
 * Uniform struct for free scalar field parameters.
 * WGSL alignment: total 112 bytes (rounded to 16-byte alignment).
 */
export const freeScalarUniformsBlock = /* wgsl */ `
struct FreeScalarUniforms {
  gridSize: vec3u,         // offset 0, 12 bytes
  latticeDim: u32,         // offset 12, 4 bytes
  spacing: vec3f,          // offset 16, 12 bytes
  mass: f32,               // offset 28, 4 bytes
  dt: f32,                 // offset 32, 4 bytes
  initCondition: u32,      // offset 36, 4 bytes (0=vacuumNoise, 1=singleMode, 2=gaussianPacket)
  fieldView: u32,          // offset 40, 4 bytes (0=phi, 1=pi, 2=energyDensity)
  stepsPerFrame: u32,      // offset 44, 4 bytes
  packetCenter: vec3f,     // offset 48, 12 bytes (aligned to 16)
  packetWidth: f32,        // offset 60, 4 bytes
  packetAmplitude: f32,    // offset 64, 4 bytes
  _pad0: u32,              // offset 68, 4 bytes
  _pad1: u32,              // offset 72, 4 bytes
  _pad2: u32,              // offset 76, 4 bytes
  modeK: vec3i,            // offset 80, 12 bytes (aligned to 16)
  totalSites: u32,         // offset 92, 4 bytes
  maxFieldValue: f32,      // offset 96, 4 bytes (for auto-scale normalization)
  _pad3: u32,              // offset 100
  _pad4: u32,              // offset 104
  _pad5: u32,              // offset 108
}
`

/**
 * Initialization compute shader entry point.
 * Maps 1D global invocation ID to 3D lattice index, computes world position,
 * and initializes phi/pi from the selected initial condition.
 */
export const freeScalarInitBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: FreeScalarUniforms;
@group(0) @binding(1) var<storage, read_write> phi: array<f32>;
@group(0) @binding(2) var<storage, read_write> pi: array<f32>;

// Simple hash-based pseudo-random number generator
fn pcgHash(input: u32) -> u32 {
  var state = input * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

// Convert hash to float in [0, 1)
fn hashToFloat(h: u32) -> f32 {
  return f32(h) / 4294967296.0;
}

// Box-Muller approximation for Gaussian noise from uniform hash
fn gaussianNoise(seed1: u32, seed2: u32) -> f32 {
  let u1 = max(hashToFloat(pcgHash(seed1)), 1e-10);
  let u2 = hashToFloat(pcgHash(seed2));
  return sqrt(-2.0 * log(u1)) * cos(6.283185307 * u2);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) { return; }

  // Map 1D index to 3D lattice coordinates
  let nx = params.gridSize.x;
  let ny = params.gridSize.y;
  let iz = idx / (nx * ny);
  let iy = (idx % (nx * ny)) / nx;
  let ix = idx % nx;

  // Compute world-space position (centered on origin)
  let halfExtent = vec3f(
    f32(nx) * params.spacing.x * 0.5,
    f32(ny) * params.spacing.y * 0.5,
    f32(params.gridSize.z) * params.spacing.z * 0.5
  );
  let worldPos = vec3f(
    f32(ix) * params.spacing.x - halfExtent.x,
    f32(iy) * params.spacing.y - halfExtent.y,
    f32(iz) * params.spacing.z - halfExtent.z
  );

  var phiVal: f32 = 0.0;
  var piVal: f32 = 0.0;

  if (params.initCondition == 0u) {
    // Vacuum noise: small Gaussian fluctuations
    let seed = idx * 1337u + 42u;
    phiVal = gaussianNoise(seed, seed + 7919u) * params.packetAmplitude * 0.01;
    piVal = gaussianNoise(seed + 15487u, seed + 23456u) * params.packetAmplitude * 0.01;
  } else if (params.initCondition == 1u) {
    // Single mode: phi = A * cos(k . x), pi = -A * omega * sin(k . x)
    let k = vec3f(f32(params.modeK.x), f32(params.modeK.y), f32(params.modeK.z));
    // Physical wave vector: k_phys = 2*pi*n / L
    let latticeL = vec3f(
      f32(nx) * params.spacing.x,
      f32(ny) * params.spacing.y,
      f32(params.gridSize.z) * params.spacing.z
    );
    // Gate kPhys by latticeDim to zero out inactive dimensions
    let kPhys = vec3f(
      select(0.0, 6.283185307 * k.x / latticeL.x, params.latticeDim >= 1u && latticeL.x > 0.0),
      select(0.0, 6.283185307 * k.y / latticeL.y, params.latticeDim >= 2u && latticeL.y > 0.0),
      select(0.0, 6.283185307 * k.z / latticeL.z, params.latticeDim >= 3u && latticeL.z > 0.0)
    );
    let phase = dot(kPhys, worldPos);
    // Lattice dispersion: omega_k^2 = m^2 + sum_i [(2/a_i) * sin(k_i * a_i / 2)]^2
    let skx = select(0.0, 2.0 * sin(kPhys.x * params.spacing.x * 0.5) / params.spacing.x, params.latticeDim >= 1u && latticeL.x > 0.0);
    let sky = select(0.0, 2.0 * sin(kPhys.y * params.spacing.y * 0.5) / params.spacing.y, params.latticeDim >= 2u && latticeL.y > 0.0);
    let skz = select(0.0, 2.0 * sin(kPhys.z * params.spacing.z * 0.5) / params.spacing.z, params.latticeDim >= 3u && latticeL.z > 0.0);
    let omega = sqrt(skx * skx + sky * sky + skz * skz + params.mass * params.mass);
    phiVal = params.packetAmplitude * cos(phase);
    piVal = -params.packetAmplitude * omega * sin(phase);
  } else {
    // Gaussian packet: phi = A * exp(-|x-x0|^2 / (2*sigma^2)) * cos(k . x)
    // Gate inactive dimensions to zero so residual packetCenter.y/z from 3D
    // don't kill the envelope when latticeDim < 3
    let dx = vec3f(
      worldPos.x - params.packetCenter.x,
      select(0.0, worldPos.y - params.packetCenter.y, params.latticeDim >= 2u),
      select(0.0, worldPos.z - params.packetCenter.z, params.latticeDim >= 3u)
    );
    let r2 = dot(dx, dx);
    let sigma2 = params.packetWidth * params.packetWidth;
    let envelope = params.packetAmplitude * exp(-r2 / (2.0 * sigma2));

    let k = vec3f(f32(params.modeK.x), f32(params.modeK.y), f32(params.modeK.z));
    let latticeL = vec3f(
      f32(nx) * params.spacing.x,
      f32(ny) * params.spacing.y,
      f32(params.gridSize.z) * params.spacing.z
    );
    // Gate kPhys by latticeDim to zero out inactive dimensions
    let kPhys = vec3f(
      select(0.0, 6.283185307 * k.x / latticeL.x, params.latticeDim >= 1u && latticeL.x > 0.0),
      select(0.0, 6.283185307 * k.y / latticeL.y, params.latticeDim >= 2u && latticeL.y > 0.0),
      select(0.0, 6.283185307 * k.z / latticeL.z, params.latticeDim >= 3u && latticeL.z > 0.0)
    );
    let phase = dot(kPhys, worldPos);
    phiVal = envelope * cos(phase);
    piVal = 0.0; // Static initial condition (packet at rest)
  }

  phi[idx] = phiVal;
  pi[idx] = piVal;
}
`
