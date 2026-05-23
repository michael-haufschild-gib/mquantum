/**
 * Energy Spectral Density Compute Shader
 *
 * Bins |φ(k)|² by kinetic energy E(k) = ℏ²|k|²/(2m) into a histogram.
 * Runs after the forward FFT in the observables pipeline, reading from
 * the interleaved complex k-space buffer.
 *
 * Uses atomicAdd with fixed-point scaling to accumulate normalized spectral
 * density values into atomic<u32> bins without requiring shared memory.
 *
 * Output: 32-bin energy histogram ρ(E) stored as atomic<u32>.
 * On readback, divide each bin by ENERGY_SPECTRUM_FIXED_SCALE to get floats.
 *
 * @workgroup_size(64)
 * @module
 */

/** Number of energy histogram bins. */
export const NUM_ENERGY_BINS = 32
export const ENERGY_SPECTRUM_FIXED_SCALE = 16_777_216

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

// PERF: Workgroup-local histogram. With 884k threads and only 32 global bins,
// raw atomicAdd to global serializes catastrophically. We accumulate into
// shared workgroup bins first, then flush one atomic per bin per workgroup —
// reducing global atomic contention by a factor of #workgroups (thousands).
// u32 addition is associative & commutative mod 2^32, so the final per-bin
// value is bit-identical to the original direct-to-global implementation.
var<workgroup> shared_bins: array<atomic<u32>, 32>;

@compute @workgroup_size(64)
fn main(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(local_invocation_id) lid: vec3u,
) {
  // Init shared bins. workgroup_size=64, NUM_BINS=32 → first 32 lanes init.
  // Barriers below MUST run on every thread, so we never early-return.
  if (lid.x < 32u) {
    atomicStore(&shared_bins[lid.x], 0u);
  }
  workgroupBarrier();

  let idx = gid.x;
  let inBounds = idx < esParams.totalSites;
  let eRange = esParams.eMax - esParams.eMin;

  // Per-site accumulation gated by all early-out conditions, but no return —
  // every thread must reach the trailing workgroupBarrier in uniform CF.
  if (inBounds && eRange > 0.0) {
    // Decompose linear index to N-D k-space coordinates. The UI restricts
    // gridSize to powers of two, but a malformed save or programmatic
    // config could still land a non-pow2 dim here. Use the shift/mask
    // fast path when n is pow2, and fall back to u32 div/mod otherwise so
    // density still bins into the right energy bucket.
    var remaining = idx;
    var coords: array<u32, 12>;
    let ldim = esParams.latticeDim;
    for (var d: i32 = i32(ldim) - 1; d >= 0; d = d - 1) {
      let du = u32(d);
      let n = esParams.gridSize[du];
      if ((n & (n - 1u)) == 0u) {
        let logN = firstTrailingBit(n);
        coords[du] = remaining & (n - 1u);
        remaining = remaining >> logN;
      } else {
        coords[du] = remaining % n;
        remaining = remaining / n;
      }
    }

    // Compute kinetic energy E(k) = ℏ²|k|²/(2m).
    // PERF: k² is sign-invariant — |k_d| = min(coord, N − coord) drops the signed
    // cast (i32 cast, sub, select) for one u32 sub + one min per dim. Mirrors
    // tdseApplyKinetic / pauliKinetic.
    var k2: f32 = 0.0;
    for (var d: u32 = 0u; d < ldim; d = d + 1u) {
      let n = esParams.gridSize[d];
      let kAbs = min(coords[d], n - coords[d]);
      let kVal = esParams.kGridScale[d] * f32(kAbs);
      k2 += kVal * kVal;
    }
    // Hoist the uniform-only ℏ²/(2m) prefactor — replaces per-thread divide with multiply.
    let kineticCoef = (esParams.hbar * esParams.hbar) / (2.0 * max(esParams.mass, 1e-6));
    let ek = k2 * kineticCoef;

    if (ek >= esParams.eMin && ek <= esParams.eMax) {
      // invRange once; multiply replaces divide per thread.
      let invRange = f32(esParams.numBins) / eRange;
      let fBin = (ek - esParams.eMin) * invRange;
      let bin = min(u32(floor(fBin)), esParams.numBins - 1u);

      // Read |φ(k)|² from interleaved complex buffer. The forward FFT is
      // intentionally unnormalized, so Parseval gives Σ|φ(k)|² = N·Σ|ψ(x)|².
      // Divide by N before fixed-point accumulation; otherwise plane-wave
      // states on production grids saturate u32 bins and flatten the spectrum.
      let c = idx << 1u;
      let re = complexBuf[c];
      let im = complexBuf[c + 1u];
      let density = (re * re + im * im) / max(f32(esParams.totalSites), 1.0);

      // Fixed-point encode and atomically accumulate into workgroup-local bin
      let scaled = u32(clamp(density * ${ENERGY_SPECTRUM_FIXED_SCALE}.0, 0.0, 4294967040.0));
      if (scaled > 0u) {
        atomicAdd(&shared_bins[bin], scaled);
      }
    }
  }

  workgroupBarrier();

  // Flush workgroup-local bins to global. Skip global atomic when local sum
  // is zero — saves ~all-zero workgroups from any global traffic.
  if (lid.x < 32u) {
    let v = atomicLoad(&shared_bins[lid.x]);
    if (v != 0u) {
      atomicAdd(&bins[lid.x], v);
    }
  }
}
`
