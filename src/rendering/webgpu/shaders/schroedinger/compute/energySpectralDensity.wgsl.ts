/**
 * Energy Spectral Density Compute Shader
 *
 * Bins |φ(k)|² by kinetic energy E(k) = ℏ²|k|²/(2m) into a histogram.
 * Runs after the forward FFT in the observables pipeline, reading from
 * the interleaved complex k-space buffer.
 *
 * Uses atomicAdd with fixed-point scaling (2^20) to accumulate floating-point
 * density values into atomic<u32> bins without requiring shared memory.
 *
 * Output: 32-bin energy histogram ρ(E) stored as atomic<u32>.
 * On readback, divide each bin by the fixed-point scale (1048576.0) to get floats.
 *
 * @workgroup_size(64)
 * @module
 */

/** Number of energy histogram bins. */
export const NUM_ENERGY_BINS = 32

export const energySpectralDensityUniformsBlock = /* wgsl */ `
struct EnergySpectrumUniforms {
  totalSites: u32,      // offset 0
  numBins: u32,         // offset 4
  eMin: f32,            // offset 8
  eMax: f32,            // offset 12
  hbar: f32,            // offset 16
  mass: f32,            // offset 20
  latticeDim: u32,      // offset 24
  _pad0: u32,           // offset 28
  gridSize: array<u32, 12>,   // offset 32
  strides: array<u32, 12>,    // offset 80
  kGridScale: array<f32, 12>, // offset 128
}
`

export const energySpectralDensityBlock = /* wgsl */ `
@group(0) @binding(0) var<storage, read> esParams: EnergySpectrumUniforms;
@group(0) @binding(1) var<storage, read> complexBuf: array<f32>;
@group(0) @binding(2) var<storage, read_write> bins: array<atomic<u32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= esParams.totalSites) {
    return;
  }

  // Decompose linear index to N-D k-space coordinates
  var remaining = idx;
  var coords: array<u32, 12>;
  for (var d: i32 = i32(esParams.latticeDim) - 1; d >= 0; d--) {
    let du = u32(d);
    coords[du] = remaining % esParams.gridSize[du];
    remaining /= esParams.gridSize[du];
  }

  // Compute kinetic energy E(k) = ℏ²|k|²/(2m)
  var k2: f32 = 0.0;
  for (var d: u32 = 0u; d < esParams.latticeDim; d++) {
    let n = esParams.gridSize[d];
    let halfN = n / 2u;
    let kIdx = select(i32(coords[d]) - i32(n), i32(coords[d]), coords[d] < halfN);
    let kVal = esParams.kGridScale[d] * f32(kIdx);
    k2 += kVal * kVal;
  }
  let ek = esParams.hbar * esParams.hbar * k2 / (2.0 * max(esParams.mass, 1e-6));

  // Determine energy bin
  let eRange = esParams.eMax - esParams.eMin;
  if (eRange <= 0.0 || ek < esParams.eMin || ek > esParams.eMax) {
    return;
  }
  let fBin = (ek - esParams.eMin) / eRange * f32(esParams.numBins);
  let bin = min(u32(floor(fBin)), esParams.numBins - 1u);

  // Read |φ(k)|² from interleaved complex buffer
  let re = complexBuf[idx * 2u];
  let im = complexBuf[idx * 2u + 1u];
  let density = re * re + im * im;

  // Fixed-point encode and atomically accumulate
  let scaled = u32(clamp(density * 1048576.0, 0.0, 4294967040.0));
  if (scaled > 0u) {
    atomicAdd(&bins[bin], scaled);
  }
}
`
