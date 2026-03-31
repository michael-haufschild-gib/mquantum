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

// Ping-pong shared memory buffers. Max N=128 → 128 vec2f = 1024 bytes each.
// Total workgroup storage: 2048 bytes (well under 16KB limit).
var<workgroup> smemA: array<vec2f, 128>;
var<workgroup> smemB: array<vec2f, 128>;

fn twiddle_sm(k: u32, N: u32, direction: f32) -> vec2f {
  let angle = -direction * 2.0 * 3.14159265358979323846 * f32(k) / f32(N);
  return vec2f(cos(angle), sin(angle));
}

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
  let halfN = N / 2u;
  let log2N = axisUni.log2N;
  let pencilId = wgid.x;

  // Decompose pencilId into batch-outer and batch-inner components
  // to compute the global memory base offset for this pencil.
  let batchInner = pencilId % axisUni.axisStride;
  let batchOuter = pencilId / axisUni.axisStride;
  let outerStride = axisUni.axisStride * N;
  let baseOffset = batchOuter * outerStride + batchInner;

  // ── Load pencil from global memory into smemA ──
  // Thread tid loads element tid (if tid < N).
  // Each element is at global index: baseOffset + tid * axisStride
  if (tid < N) {
    let gAddr = (baseOffset + tid * axisUni.axisStride) * 2u;
    smemA[tid] = vec2f(complexBuf[gAddr], complexBuf[gAddr + 1u]);
  }
  workgroupBarrier();

  // ── Butterfly stages ──
  // Stockham auto-sort: read from src buffer, write to dst buffer.
  // Stage 0: read smemA → write smemB
  // Stage 1: read smemB → write smemA
  // ...alternating per stage.
  for (var s = 0u; s < log2N; s++) {
    let halfStage = 1u << s;
    let fullStage = halfStage << 1u;

    if (tid < halfN) {
      // Stockham decomposition: which group and position within group
      let g = tid / halfStage;
      let j = tid % halfStage;

      // Input indices (natural order from previous stage)
      let inIdx0 = tid;
      let inIdx1 = tid + halfN;

      // Read from current source buffer
      var val0: vec2f;
      var val1: vec2f;
      if (s % 2u == 0u) {
        val0 = smemA[inIdx0];
        val1 = smemA[inIdx1];
      } else {
        val0 = smemB[inIdx0];
        val1 = smemB[inIdx1];
      }

      // Twiddle factor
      let tw = twiddle_sm(j * (N / fullStage), N, axisUni.direction);
      let twVal1 = cmul_sm(tw, val1);

      // Butterfly outputs
      let outTop = val0 + twVal1;
      let outBot = val0 - twVal1;

      // Stockham output indices (auto-sort reordering)
      let outIdx0 = g * fullStage + j;
      let outIdx1 = outIdx0 + halfStage;

      // Write to destination buffer
      if (s % 2u == 0u) {
        smemB[outIdx0] = outTop;
        smemB[outIdx1] = outBot;
      } else {
        smemA[outIdx0] = outTop;
        smemA[outIdx1] = outBot;
      }
    }

    workgroupBarrier();
  }

  // ── Write result back to global memory ──
  // After log2N stages, result is in smemA (even stages) or smemB (odd stages).
  if (tid < N) {
    let gAddr = (baseOffset + tid * axisUni.axisStride) * 2u;
    var val: vec2f;
    if (log2N % 2u == 0u) {
      val = smemA[tid];
    } else {
      val = smemB[tid];
    }
    complexBuf[gAddr] = val.x;
    complexBuf[gAddr + 1u] = val.y;
  }
}
`
