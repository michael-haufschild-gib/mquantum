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

  // ── Stage 1 (specialized: twiddles ∈ {(1,0), (0,−dir)}). ──
  // halfStage=2, fullStage=4. Angles are multiples of π/2, so cos/sin simplify
  // to ±1, 0 and the complex multiply reduces to a swap with a signed flip.
  // Eliminates halfN cos + halfN sin per FFT dispatch.
  let dir = axisUni.direction;
  if (log2N > 1u && tid < halfN) {
    // outIdx0 = ((tid & ~1u) << 1u) + j,  j = tid & 1u.
    let j = tid & 1u;
    let outIdx0 = ((tid & 0xFFFFFFFEu) << 1u) + j;
    let val0 = smem[128u + tid];                     // srcBase = 128 after stage 0
    let val1 = smem[128u + tid + halfN];
    // j=0: tw·val1 = val1.  j=1: tw = (0, −dir) ⇒ tw·val1 = (dir·val1.y, −dir·val1.x).
    let rotated = vec2f(dir * val1.y, -dir * val1.x);
    let twVal1 = select(val1, rotated, j == 1u);
    smem[outIdx0] = val0 + twVal1;                   // dstBase = 0 → write to A
    smem[outIdx0 + 2u] = val0 - twVal1;              // halfStage = 2
  }
  workgroupBarrier();

  // ── Butterfly stages 2..log2N-1. ──
  // Stage s reads from half ((s & 1) == 0 → A[0..128), else B[128..256)) and
  // writes to the other half. srcBase/dstBase pre-computed per stage avoid
  // per-butterfly branches over smemA vs smemB.
  let inv_fullStage_base = -dir * SM_FFT_TWO_PI;
  for (var s = 2u; s < log2N; s = s + 1u) {
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

/**
 * TDSE-only shared-memory Stockham FFT kernel with a CPU-precomputed
 * twiddle table replacing `cos/sin` at stages s >= 2.
 *
 * Diverges from `tdseSharedMemFFTBlock` only in the s >= 2 butterfly body —
 * the stage-0/1 specializations, smem ping-pong layout, workgroup-barrier
 * cadence, and load/store loops are identical.
 *
 * Bind group layout (TDSE-only):
 *   @group(0) @binding(0) FFTAxisUniforms (uniform)
 *   @group(0) @binding(1) complexBuf (storage, read_write) — interleaved [re,im]
 *   @group(0) @binding(2) fftTwiddleTable (storage, read) — interleaved forward
 *     twiddles of length N_MAX_FFT_TWIDDLE (= 128). See
 *     src/rendering/webgpu/passes/TDSEFFTTwiddle.ts for layout/derivation.
 *
 * Dirac and Pauli do NOT use this block — they import the trig-based
 * `tdseSharedMemFFTBlock` above, and their 2-entry FFT BGL is untouched.
 */
export const tdseSharedMemFFTTwiddleBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> axisUni: FFTAxisUniforms;
@group(0) @binding(1) var<storage, read_write> complexBuf: array<f32>;
@group(0) @binding(2) var<storage, read> fftTwiddleTable: array<f32>;

// Max FFT axis length supported by the TDSE twiddle path. Must match
// N_MAX_FFT_TWIDDLE in src/rendering/webgpu/passes/TDSEFFTTwiddle.ts.
const N_MAX_FFT_TWIDDLE: u32 = 128u;
const LOG2_N_MAX_FFT_TWIDDLE: u32 = 7u;

// Unified ping-pong shared memory: A at [0..128), B at [128..256).
var<workgroup> smem_tw: array<vec2f, 256>;

fn cmul_sm_tw(a: vec2f, b: vec2f) -> vec2f {
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

  let axisStride = axisUni.axisStride;
  let log2Stride = firstTrailingBit(axisStride);
  let strideMask = axisStride - 1u;
  let batchInner = pencilId & strideMask;
  let batchOuter = pencilId >> log2Stride;
  let outerStride = axisStride * N;
  let baseOffset = batchOuter * outerStride + batchInner;

  // ── Load pencil from global memory into smem[0..N) (A half). ──
  for (var i = tid; i < N; i = i + 64u) {
    let gAddr = (baseOffset + i * axisStride) << 1u;
    smem_tw[i] = vec2f(complexBuf[gAddr], complexBuf[gAddr + 1u]);
  }
  workgroupBarrier();

  // ── Stage 0 (specialized, W^0 = (1, 0)) — no trig, no table read. ──
  if (log2N > 0u && tid < halfN) {
    let val0 = smem_tw[tid];
    let val1 = smem_tw[tid + halfN];
    let outIdx0 = tid << 1u;
    smem_tw[128u + outIdx0]       = val0 + val1;
    smem_tw[128u + outIdx0 + 1u]  = val0 - val1;
  }
  workgroupBarrier();

  // ── Stage 1 (specialized: twiddles in {(1,0), (0,-dir)}) — no trig. ──
  let dir = axisUni.direction;
  if (log2N > 1u && tid < halfN) {
    let j = tid & 1u;
    let outIdx0 = ((tid & 0xFFFFFFFEu) << 1u) + j;
    let val0 = smem_tw[128u + tid];
    let val1 = smem_tw[128u + tid + halfN];
    let rotated = vec2f(dir * val1.y, -dir * val1.x);
    let twVal1 = select(val1, rotated, j == 1u);
    smem_tw[outIdx0] = val0 + twVal1;
    smem_tw[outIdx0 + 2u] = val0 - twVal1;
  }
  workgroupBarrier();

  // ── Butterfly stages 2..log2N-1: twiddles from precomputed table. ──
  // Index derivation:
  //   anglePerJ = -dir * 2*pi / fullStage, fullStage = 1 << (s+1)
  //   => twFwd[k] with k = j * (N_MAX >> (s+1)) equals exp(-i*2*pi*j/fullStage)
  //   => inverse = conj(twFwd[k]), done in-shader via dir * twFwd.y.
  // twStride is uniform across the halfN butterfly threads in a dispatch.
  for (var s = 2u; s < log2N; s = s + 1u) {
    let halfStage = 1u << s;
    let hsMask = halfStage - 1u;
    let srcBase = (s & 1u) << 7u;
    let dstBase = ((s + 1u) & 1u) << 7u;
    let twStride = 1u << (LOG2_N_MAX_FFT_TWIDDLE - s - 1u);

    if (tid < halfN) {
      let j = tid & hsMask;
      let outIdx0 = ((tid & ~hsMask) << 1u) + j;

      let val0 = smem_tw[srcBase + tid];
      let val1 = smem_tw[srcBase + tid + halfN];

      let twIdx = j * twStride;
      let twFwd = vec2f(
        fftTwiddleTable[twIdx << 1u],
        fftTwiddleTable[(twIdx << 1u) + 1u]
      );
      let tw = vec2f(twFwd.x, dir * twFwd.y);
      let twVal1 = cmul_sm_tw(tw, val1);

      smem_tw[dstBase + outIdx0] = val0 + twVal1;
      smem_tw[dstBase + outIdx0 + halfStage] = val0 - twVal1;
    }

    workgroupBarrier();
  }

  // ── Write result back to global memory. ──
  let finalBase = (log2N & 1u) << 7u;
  for (var i = tid; i < N; i = i + 64u) {
    let gAddr = (baseOffset + i * axisStride) << 1u;
    let val = smem_tw[finalBase + i];
    complexBuf[gAddr] = val.x;
    complexBuf[gAddr + 1u] = val.y;
  }
}
`
