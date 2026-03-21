/**
 * Momentum-Space Observable Reduction — Pass 1
 *
 * Multi-channel parallel reduction over the k-space FFT buffer computing:
 *   - Σ |φ(k)|²                       (k-space norm)
 *   - Σ k_d · |φ(k)|²                (momentum mean, per dimension d)
 *   - Σ k_d² · |φ(k)|²              (momentum second moment, per dimension d)
 *
 * Operates on the interleaved complex FFT buffer AFTER forward FFT, BEFORE
 * the kinetic phase is applied. k-vector components use the standard FFT
 * frequency ordering (same formula as tdseApplyKinetic.wgsl.ts).
 *
 * Output layout: [knorm, k0_mean, k0_sq, k1_mean, k1_sq, ..., kD_mean, kD_sq]
 * Total channels = 1 + 2 * latticeDim
 *
 * Requires freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(256)
 * @module
 */

export const observablesMomentumReduceBlock = /* wgsl */ `
struct ObsMomReduceUniforms {
  totalSites: u32,
  numWorkgroups: u32,
  latticeDim: u32,
  numChannels: u32,
  gridSize: array<u32, 12>,
  strides: array<u32, 12>,
  kGridScale: array<f32, 12>,   // 2*pi/(N*a) per dimension
}

@group(0) @binding(0) var<uniform> obsParams: ObsMomReduceUniforms;
@group(0) @binding(1) var<storage, read> complexBuf: array<f32>;
@group(0) @binding(2) var<storage, read_write> partials: array<f32>;

const MAX_CHANNELS: u32 = 23u;
const WG_SIZE: u32 = 256u;
var<workgroup> shared: array<f32, 5888>;  // WG_SIZE * MAX_CHANNELS

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
) {
  let idx = gid.x;
  let local = lid.x;
  let nc = obsParams.numChannels;

  for (var ch: u32 = 0u; ch < nc; ch++) {
    shared[local * MAX_CHANNELS + ch] = 0.0;
  }

  if (idx < obsParams.totalSites) {
    // Read interleaved complex value from FFT buffer
    let re = complexBuf[idx * 2u];
    let im = complexBuf[idx * 2u + 1u];
    let density = re * re + im * im;

    // Channel 0: k-space norm
    shared[local * MAX_CHANNELS] = density;

    // Decompose linear index to N-D coordinates
    let coords = linearToND(idx, obsParams.strides, obsParams.gridSize, obsParams.latticeDim);

    // Per-dimension k-vector components (FFT frequency ordering)
    for (var d: u32 = 0u; d < obsParams.latticeDim; d++) {
      let n = obsParams.gridSize[d];
      let halfN = n / 2u;
      let kIdx = select(i32(coords[d]) - i32(n), i32(coords[d]), coords[d] < halfN);
      let kVal = obsParams.kGridScale[d] * f32(kIdx);

      let chBase = 1u + d * 2u;
      shared[local * MAX_CHANNELS + chBase] = kVal * density;          // k_d * |φ|²
      shared[local * MAX_CHANNELS + chBase + 1u] = kVal * kVal * density; // k_d² * |φ|²
    }
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

  if (local == 0u) {
    for (var ch: u32 = 0u; ch < nc; ch++) {
      partials[wid.x * nc + ch] = shared[ch];
    }
  }
}
`

/**
 * Momentum-Space Observable Reduction — Pass 2 (Finalize)
 *
 * Single-workgroup reduction of partial sums from Pass 1.
 * Output: [knorm, k0_mean, k0_sq, k1_mean, k1_sq, ...]
 *
 * @workgroup_size(256)
 */
export const observablesMomentumFinalizeBlock = /* wgsl */ `
struct ObsMomReduceUniforms {
  totalSites: u32,
  numWorkgroups: u32,
  latticeDim: u32,
  numChannels: u32,
  gridSize: array<u32, 12>,
  strides: array<u32, 12>,
  kGridScale: array<f32, 12>,
}

@group(0) @binding(0) var<uniform> obsParams: ObsMomReduceUniforms;
@group(0) @binding(1) var<storage, read> partials: array<f32>;
@group(0) @binding(2) var<storage, read_write> result: array<f32>;

const MAX_CHANNELS: u32 = 23u;
const WG_SIZE: u32 = 256u;
var<workgroup> shared: array<f32, 5888>;

@compute @workgroup_size(256)
fn main(
  @builtin(local_invocation_id) lid: vec3u,
) {
  let local = lid.x;
  let nc = obsParams.numChannels;

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

  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      for (var ch: u32 = 0u; ch < nc; ch++) {
        shared[local * MAX_CHANNELS + ch] += shared[(local + stride) * MAX_CHANNELS + ch];
      }
    }
    workgroupBarrier();
  }

  if (local == 0u) {
    for (var ch: u32 = 0u; ch < nc; ch++) {
      result[ch] = shared[ch];
    }
  }
}
`
