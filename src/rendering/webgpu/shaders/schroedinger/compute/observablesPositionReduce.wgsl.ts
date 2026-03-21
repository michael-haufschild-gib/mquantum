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

@group(0) @binding(0) var<uniform> obsParams: ObsReduceUniforms;
@group(0) @binding(1) var<storage, read> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read> psiIm: array<f32>;
@group(0) @binding(3) var<storage, read_write> partials: array<f32>;
@group(0) @binding(4) var<storage, read> potentialBuf: array<f32>;

// Max channels: 2 + 2*11 = 24. Shared memory: 256 * 24 = 6144 floats.
// WGSL requires compile-time constants for arrays, so use a flat block
// and index as shared[local * MAX_CHANNELS + ch].
const MAX_CHANNELS: u32 = 24u;
const WG_SIZE: u32 = 256u;
var<workgroup> shared: array<f32, 6144>;  // WG_SIZE * MAX_CHANNELS

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
) {
  let idx = gid.x;
  let local = lid.x;
  let nc = obsParams.numChannels;

  // Initialize shared memory for this thread's channels
  for (var ch: u32 = 0u; ch < nc; ch++) {
    shared[local * MAX_CHANNELS + ch] = 0.0;
  }

  if (idx < obsParams.totalSites) {
    let re = psiRe[idx];
    let im = psiIm[idx];
    let density = re * re + im * im;

    // Compute volume element dV = product of all spacings
    var dV: f32 = 1.0;
    for (var d: u32 = 0u; d < obsParams.latticeDim; d++) {
      dV *= obsParams.spacing[d];
    }
    let weightedDensity = density * dV;

    // Channel 0: norm
    shared[local * MAX_CHANNELS] = weightedDensity;

    // Decompose linear index to N-D coordinates
    let coords = linearToND(idx, obsParams.strides, obsParams.gridSize, obsParams.latticeDim);

    // Per-dimension position moments
    for (var d: u32 = 0u; d < obsParams.latticeDim; d++) {
      let pos_d = (f32(coords[d]) - f32(obsParams.gridSize[d]) * 0.5 + 0.5) * obsParams.spacing[d];
      let chBase = 1u + d * 2u;
      shared[local * MAX_CHANNELS + chBase] = pos_d * weightedDensity;          // x_d * |ψ|² dV
      shared[local * MAX_CHANNELS + chBase + 1u] = pos_d * pos_d * weightedDensity; // x_d² * |ψ|² dV
    }

    // Last channel: potential energy ⟨V⟩ = Σ V(x) |ψ|² dV
    let vIdx = 1u + 2u * obsParams.latticeDim;
    shared[local * MAX_CHANNELS + vIdx] = potentialBuf[idx] * weightedDensity;
  }
  workgroupBarrier();

  // Tree reduction within workgroup — all channels
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      for (var ch: u32 = 0u; ch < nc; ch++) {
        shared[local * MAX_CHANNELS + ch] += shared[(local + stride) * MAX_CHANNELS + ch];
      }
    }
    workgroupBarrier();
  }

  // Write workgroup results: partials[wid.x * numChannels + ch]
  if (local == 0u) {
    for (var ch: u32 = 0u; ch < nc; ch++) {
      partials[wid.x * nc + ch] = shared[ch];
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

@group(0) @binding(0) var<uniform> obsParams: ObsReduceUniforms;
@group(0) @binding(1) var<storage, read> partials: array<f32>;
@group(0) @binding(2) var<storage, read_write> result: array<f32>;

const MAX_CHANNELS: u32 = 24u;
const WG_SIZE: u32 = 256u;
var<workgroup> shared: array<f32, 6144>;

@compute @workgroup_size(256)
fn main(
  @builtin(local_invocation_id) lid: vec3u,
) {
  let local = lid.x;
  let nc = obsParams.numChannels;

  // Each thread accumulates multiple workgroup entries
  for (var ch: u32 = 0u; ch < nc; ch++) {
    shared[local * MAX_CHANNELS + ch] = 0.0;
  }

  var i = local;
  while (i < obsParams.numWorkgroups) {
    for (var ch: u32 = 0u; ch < nc; ch++) {
      shared[local * MAX_CHANNELS + ch] += partials[i * nc + ch];
    }
    i += WG_SIZE;
  }
  workgroupBarrier();

  // Tree reduction
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      for (var ch: u32 = 0u; ch < nc; ch++) {
        shared[local * MAX_CHANNELS + ch] += shared[(local + stride) * MAX_CHANNELS + ch];
      }
    }
    workgroupBarrier();
  }

  // Write final result
  if (local == 0u) {
    for (var ch: u32 = 0u; ch < nc; ch++) {
      result[ch] = shared[ch];
    }
  }
}
`
