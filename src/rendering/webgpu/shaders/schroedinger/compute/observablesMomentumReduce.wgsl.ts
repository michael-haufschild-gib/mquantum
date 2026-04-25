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

@group(0) @binding(0) var<storage, read> obsParams: ObsMomReduceUniforms;
@group(0) @binding(1) var<storage, read> complexBuf: array<f32>;
@group(0) @binding(2) var<storage, read_write> partials: array<f32>;

// Channel-major layout: sdata[ch * WG_SIZE + local]. Bank-conflict-free
// because WG_SIZE=256 is a multiple of 32-bank width (previously:
// sdata[local * 24 + ch] caused 4-way bank conflicts since gcd(24,32)=8).
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

  for (var ch: u32 = 0u; ch < nc; ch = ch + 1u) {
    sdata[ch * WG_SIZE + local] = 0.0;
  }

  if (idx < obsParams.totalSites) {
    // Read interleaved complex value from FFT buffer
    let c = idx << 1u;
    let re = complexBuf[c];
    let im = complexBuf[c + 1u];
    let density = re * re + im * im;

    // Channel 0: k-space norm
    sdata[local] = density;

    // Decompose linear index to N-D coordinates
    let ldim = obsParams.latticeDim;
    let coords = linearToND(idx, obsParams.strides, obsParams.gridSize, ldim);

    // Per-dimension k-vector components (FFT frequency ordering)
    for (var d: u32 = 0u; d < ldim; d = d + 1u) {
      let n = obsParams.gridSize[d];
      let halfN = n >> 1u;
      let kIdx = select(i32(coords[d]) - i32(n), i32(coords[d]), coords[d] < halfN);
      let kVal = obsParams.kGridScale[d] * f32(kIdx);

      let chMean = (1u + (d << 1u)) * WG_SIZE + local;
      let chSq   = chMean + WG_SIZE;
      sdata[chMean] = kVal * density;          // k_d · |φ|²
      sdata[chSq]   = kVal * kVal * density;   // k_d² · |φ|²
    }
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

  if (local == 0u) {
    let outBase = wid.x * nc;
    for (var ch: u32 = 0u; ch < nc; ch = ch + 1u) {
      partials[outBase + ch] = sdata[ch * WG_SIZE];
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

@group(0) @binding(0) var<storage, read> obsParams: ObsMomReduceUniforms;
@group(0) @binding(1) var<storage, read> partials: array<f32>;
@group(0) @binding(2) var<storage, read_write> result: array<f32>;

// Channel-major layout — see observablesMomentumReduceBlock for rationale.
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

  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      for (var ch: u32 = 0u; ch < nc; ch = ch + 1u) {
        let chBase = ch * WG_SIZE;
        sdata[chBase + local] += sdata[chBase + local + stride];
      }
    }
    workgroupBarrier();
  }

  if (local == 0u) {
    for (var ch: u32 = 0u; ch < nc; ch = ch + 1u) {
      result[ch] = sdata[ch * WG_SIZE];
    }
  }
}
`
