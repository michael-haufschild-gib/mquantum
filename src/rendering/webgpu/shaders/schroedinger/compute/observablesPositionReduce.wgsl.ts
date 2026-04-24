/**
 * Position-Space Observable Reduction — Pass 1
 *
 * Multi-channel parallel reduction over the N-D lattice computing:
 *   - Σ |ψ|² · dV                    (norm)
 *   - Σ x_d · |ψ|² · dV             (position mean, per dimension d)
 *   - Σ x_d² · |ψ|² · dV            (position second moment, per dimension d)
 *   - Σ V(x) · |ψ|² · dV            (potential energy expectation ⟨V⟩)
 *
 * Output layout per workgroup:
 *   [norm, x0_mean, x0_sq, ..., xD_mean, xD_sq, potentialEnergy]
 * Total channels = 2 + 2 * latticeDim
 *
 * Each workgroup reduces a chunk of sites into partial sums written to
 * storage buffers. A finalization pass combines them.
 *
 * Requires freeScalarNDIndexBlock to be prepended (for linearToND).
 *
 * @workgroup_size(256)
 * @module
 */

export const observablesPositionReduceBlock = /* wgsl */ `
struct ObsReduceUniforms {
  totalSites: u32,
  numWorkgroups: u32,
  latticeDim: u32,
  numChannels: u32,    // 2 + 2 * latticeDim
  gridSize: array<u32, 12>,
  strides: array<u32, 12>,
  spacing: array<f32, 12>,
}

@group(0) @binding(0) var<storage, read> obsParams: ObsReduceUniforms;
@group(0) @binding(1) var<storage, read> psi: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> partials: array<f32>;
@group(0) @binding(3) var<storage, read> potentialBuf: array<f32>;

// Max channels: 2 + 2*11 = 24. Shared memory: 24 * 256 = 6144 floats.
// Layout is CHANNEL-MAJOR: sdata[ch * WG_SIZE + local]. This gives bank-
// conflict-free access in the tree reduction because WG_SIZE=256 is a
// multiple of the 32-bank width — every warp hits 32 distinct banks
// (bank = (ch*256 + local) mod 32 = local mod 32). The previous
// thread-major layout sdata[local * 24 + ch] caused 4-way bank conflicts
// (gcd(24, 32) = 8 ⇒ 4 threads per warp per bank per channel access).
const MAX_CHANNELS: u32 = 24u;
const WG_SIZE: u32 = 256u;
var<workgroup> sdata: array<f32, 6144>;  // MAX_CHANNELS * WG_SIZE

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
) {
  let idx = gid.x;
  let local = lid.x;
  let nc = obsParams.numChannels;

  // Initialize shared memory for this thread's channel slots (channel-major).
  for (var ch: u32 = 0u; ch < nc; ch = ch + 1u) {
    sdata[ch * WG_SIZE + local] = 0.0;
  }

  if (idx < obsParams.totalSites) {
    let z = psi[idx];
    let re = z.x;
    let im = z.y;
    let density = re * re + im * im;

    // Compute volume element dV = product of all spacings
    var dV: f32 = 1.0;
    let ldim = obsParams.latticeDim;
    for (var d: u32 = 0u; d < ldim; d = d + 1u) {
      dV *= obsParams.spacing[d];
    }
    let weightedDensity = density * dV;

    // Channel 0: norm
    sdata[local] = weightedDensity;

    // Decompose linear index to N-D coordinates
    let coords = linearToND(idx, obsParams.strides, obsParams.gridSize, ldim);

    // Per-dimension position moments
    for (var d: u32 = 0u; d < ldim; d = d + 1u) {
      let pos_d = (f32(coords[d]) - f32(obsParams.gridSize[d]) * 0.5 + 0.5) * obsParams.spacing[d];
      let chMean = (1u + (d << 1u)) * WG_SIZE + local;
      let chSq   = chMean + WG_SIZE;
      sdata[chMean] = pos_d * weightedDensity;           // x_d · |ψ|² dV
      sdata[chSq]   = pos_d * pos_d * weightedDensity;   // x_d² · |ψ|² dV
    }

    // Last channel: potential energy ⟨V⟩ = Σ V(x) |ψ|² dV
    sdata[(1u + (ldim << 1u)) * WG_SIZE + local] = potentialBuf[idx] * weightedDensity;
  }
  workgroupBarrier();

  // Tree reduction within workgroup — all channels.
  // Channel-major layout: sdata[ch * WG_SIZE + local] += sdata[ch * WG_SIZE + local + stride].
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      for (var ch: u32 = 0u; ch < nc; ch = ch + 1u) {
        let chBase = ch * WG_SIZE;
        sdata[chBase + local] += sdata[chBase + local + stride];
      }
    }
    workgroupBarrier();
  }

  // Write workgroup results: partials[wid.x * numChannels + ch]
  // After reduction, channel ch's total lives at sdata[ch * WG_SIZE + 0].
  if (local == 0u) {
    let outBase = wid.x * nc;
    for (var ch: u32 = 0u; ch < nc; ch = ch + 1u) {
      partials[outBase + ch] = sdata[ch * WG_SIZE];
    }
  }
}
`

/**
 * Position-Space Observable Reduction — Pass 2 (Finalize)
 *
 * Single-workgroup reduction of partial sums from Pass 1 into final results.
 * Output: [norm, x0_mean, x0_sq, ..., xD_mean, xD_sq, potentialEnergy]
 *
 * @workgroup_size(256)
 */
export const observablesPositionFinalizeBlock = /* wgsl */ `
struct ObsReduceUniforms {
  totalSites: u32,
  numWorkgroups: u32,
  latticeDim: u32,
  numChannels: u32,
  gridSize: array<u32, 12>,
  strides: array<u32, 12>,
  spacing: array<f32, 12>,
}

@group(0) @binding(0) var<storage, read> obsParams: ObsReduceUniforms;
@group(0) @binding(1) var<storage, read> partials: array<f32>;
@group(0) @binding(2) var<storage, read_write> result: array<f32>;

// Channel-major layout matches pass 1 — see rationale in observablesPositionReduceBlock.
const MAX_CHANNELS: u32 = 24u;
const WG_SIZE: u32 = 256u;
var<workgroup> sdata: array<f32, 6144>;

@compute @workgroup_size(256)
fn main(
  @builtin(local_invocation_id) lid: vec3u,
) {
  let local = lid.x;
  let nc = obsParams.numChannels;
  let ngroups = obsParams.numWorkgroups;

  // Each thread accumulates multiple workgroup entries (channel-major layout).
  for (var ch: u32 = 0u; ch < nc; ch = ch + 1u) {
    sdata[ch * WG_SIZE + local] = 0.0;
  }

  var i = local;
  while (i < ngroups) {
    let inBase = i * nc;
    for (var ch: u32 = 0u; ch < nc; ch = ch + 1u) {
      sdata[ch * WG_SIZE + local] += partials[inBase + ch];
    }
    i += WG_SIZE;
  }
  workgroupBarrier();

  // Tree reduction (channel-major, bank-conflict-free).
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      for (var ch: u32 = 0u; ch < nc; ch = ch + 1u) {
        let chBase = ch * WG_SIZE;
        sdata[chBase + local] += sdata[chBase + local + stride];
      }
    }
    workgroupBarrier();
  }

  // Write final result — channel ch's total lives at sdata[ch * WG_SIZE + 0].
  if (local == 0u) {
    for (var ch: u32 = 0u; ch < nc; ch = ch + 1u) {
      result[ch] = sdata[ch * WG_SIZE];
    }
  }
}
`
