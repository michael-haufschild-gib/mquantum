/**
 * Shared-Memory Stockham FFT Compute Shader
 *
 * Performs a complete 1D FFT for one pencil (all log2(N) stages) within a
 * single workgroup using workgroup-local shared memory. One dispatch per axis
 * replaces log2(N) dispatches of the per-stage Stockham kernel.
 *
 * Data flow:
 *   1. Each workgroup loads one pencil from global memory into shared memory
 *   2. All butterfly stages execute in shared memory with workgroupBarrier()
 *   3. Result is written back to the same global buffer (pencils are disjoint)
 *
 * Supports axisDim = 8, 16, 32, 64, 128 (log2N = 3..7).
 * Threads with local_id >= N/2 skip butterfly math but participate in barriers.
 *
 * @workgroup_size(64)
 * @module
 */

/**
 * Per-axis uniform struct. One slot per axis per direction in the staging buffer.
 * Same 32-byte size as FFTStageUniforms for staging buffer alignment.
 */
export const fftAxisUniformsBlock = /* wgsl */ `
struct FFTAxisUniforms {
  axisDim: u32,        // N for current axis (power of 2, 8..128)
  direction: f32,      // +1.0 forward, -1.0 inverse
  totalElements: u32,  // Total complex elements (product of all grid dims)
  axisStride: u32,     // Stride between consecutive elements along this axis
  log2N: u32,          // Number of butterfly stages = log2(axisDim)
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}
`

/**
 * Shared-memory Stockham FFT kernel.
 *
 * Bind group layout:
 *   @group(0) @binding(0) FFTAxisUniforms (uniform)
 *   @group(0) @binding(1) complexBuf (storage, read_write) — interleaved [re,im]
 */
export const tdseSharedMemFFTBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> axisUni: FFTAxisUniforms;
@group(0) @binding(1) var<storage, read_write> complexBuf: array<f32>;

const SM_FFT_TWO_PI: f32 = 6.28318530717958647692;

// Unified ping-pong shared memory: A at [0..128), B at [128..256).
// 256 * 8 = 2048 bytes — well under the 16 KB workgroup storage cap.
// Avoids per-stage A/B selection branches by indexing a single flat buffer.
var<workgroup> smem: array<vec2f, 256>;

fn cmul_sm(a: vec2f, b: vec2f) -> vec2f {
  return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

@compute @workgroup_size(64)
fn main(
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wgid: vec3u
) {
  let tid = lid.x;
  let N = axisUni.axisDim;
  let halfN = N >> 1u;
  let log2N = axisUni.log2N;
  let pencilId = wgid.x;

  // axisStride is a product of power-of-2 grid dims → itself power of 2.
  let axisStride = axisUni.axisStride;
  let log2Stride = firstTrailingBit(axisStride);
  let strideMask = axisStride - 1u;
  let batchInner = pencilId & strideMask;
  let batchOuter = pencilId >> log2Stride;
  let outerStride = axisStride * N;
  let baseOffset = batchOuter * outerStride + batchInner;

  // ── Load pencil from global memory into smem[0..N) (A half). ──
  // Loop: each thread handles ceil(N/64) elements. For N ≤ 64 only iteration
  // i=tid runs; for N=128 each thread does 2 loads. Without this loop a
  // workgroup_size(64) kernel silently drops elements 64..127 at N=128.
  for (var i = tid; i < N; i = i + 64u) {
    let gAddr = (baseOffset + i * axisStride) << 1u;
    smem[i] = vec2f(complexBuf[gAddr], complexBuf[gAddr + 1u]);
  }
  workgroupBarrier();

  // ── Stage 0 (specialized). ──
  // First butterfly has halfStage=1, so j = tid & 0 = 0 and the twiddle is
  // W^0 = (1, 0). Skip the cos/sin and complex multiply entirely.
  if (log2N > 0u && tid < halfN) {
    let val0 = smem[tid];
    let val1 = smem[tid + halfN];
    // g = tid, fullStage = 2, j = 0 → outIdx0 = tid * 2.
    let outIdx0 = tid << 1u;
    smem[128u + outIdx0]       = val0 + val1;
    smem[128u + outIdx0 + 1u]  = val0 - val1;
  }
  workgroupBarrier();

  // ── Butterfly stages 1..log2N-1. ──
  // Stage s reads from half ((s & 1) == 0 → A[0..128), else B[128..256)) and
  // writes to the other half. srcBase/dstBase pre-computed per stage avoid
  // per-butterfly branches over smemA vs smemB.
  let inv_fullStage_base = -axisUni.direction * SM_FFT_TWO_PI;
  for (var s = 1u; s < log2N; s = s + 1u) {
    let halfStage = 1u << s;
    let fullStage = halfStage << 1u;
    let hsMask = halfStage - 1u;
    let srcBase = (s & 1u) << 7u;         // 0 or 128
    let dstBase = ((s + 1u) & 1u) << 7u;  // 128 or 0
    // 1/fullStage is uniform across halfN butterfly threads — compute once.
    let invFullStage = 1.0 / f32(fullStage);
    let anglePerJ = inv_fullStage_base * invFullStage;

    if (tid < halfN) {
      // Stockham decomposition: g = tid >> s, j = tid & (halfStage-1).
      let j = tid & hsMask;
      // g * fullStage = ((tid >> s) << (s+1)) = (tid & ~hsMask) << 1.
      let outIdx0 = ((tid & ~hsMask) << 1u) + j;

      let val0 = smem[srcBase + tid];
      let val1 = smem[srcBase + tid + halfN];

      // Twiddle: W_N^{j*N/fullStage} = exp(-i·dir·2π·j/fullStage).
      let angle = anglePerJ * f32(j);
      let tw = vec2f(cos(angle), sin(angle));
      let twVal1 = cmul_sm(tw, val1);

      smem[dstBase + outIdx0] = val0 + twVal1;
      smem[dstBase + outIdx0 + halfStage] = val0 - twVal1;
    }

    workgroupBarrier();
  }

  // ── Write result back to global memory. ──
  // After log2N stages the result lives in half (log2N & 1).
  let finalBase = (log2N & 1u) << 7u;
  for (var i = tid; i < N; i = i + 64u) {
    let gAddr = (baseOffset + i * axisStride) << 1u;
    let val = smem[finalBase + i];
    complexBuf[gAddr] = val.x;
    complexBuf[gAddr + 1u] = val.y;
  }
}
`
