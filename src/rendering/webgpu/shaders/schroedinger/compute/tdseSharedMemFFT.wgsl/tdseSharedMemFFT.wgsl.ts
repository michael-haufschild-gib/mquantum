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
 * Shared-memory Stockham FFT kernel with a CPU-precomputed twiddle table
 * replacing `cos/sin` at stages s >= 2.
 *
 * Stage 0 (W^0 = (1,0)) and stage 1 (W^{halfStage} ∈ {(1,0), (0,-dir)})
 * stay specialized in-kernel — no table read, no trig. Stages ≥ 2 read the
 * forward twiddle from `fftTwiddleTable` and conjugate via `dir * twFwd.y`
 * for the inverse direction. Same smem ping-pong layout, workgroup-barrier
 * cadence, and load/store loops a per-stage Stockham would use, but a single
 * dispatch covers all log2(N) stages of one pencil.
 *
 * Bind group layout:
 *   @group(0) @binding(0) FFTAxisUniforms (uniform)
 *   @group(0) @binding(1) complexBuf (storage, read_write) — array<vec2f>,
 *     interleaved [re,im] complex values, 8 bytes/element
 *   @group(0) @binding(2) fftTwiddleTable (storage, read) — array<vec2f>
 *     forward twiddles of length N_MAX_FFT_TWIDDLE/2 (= 64 vec2f). See
 *     src/rendering/webgpu/passes/FFTTwiddle.ts for layout/derivation.
 *
 * Used by TDSE, Dirac, and Pauli (all three modes share the same twiddle
 * buffer because their FFT axis lengths fit within N_MAX_FFT_TWIDDLE = 128).
 *
 * The buffer holds interleaved [re,im] complex values (8 bytes per element).
 * The vec2f typed view drops one shift per address computation and replaces
 * two scalar loads/stores per complex element with a single 8-byte vec2f op.
 * The buffer base is WebGPU-aligned (256 bytes) and the element stride is 8.
 */
export const tdseSharedMemFFTTwiddleBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> axisUni: FFTAxisUniforms;
@group(0) @binding(1) var<storage, read_write> complexBuf: array<vec2f>;
@group(0) @binding(2) var<storage, read> fftTwiddleTable: array<vec2f>;

// Max FFT axis length supported by the TDSE twiddle path. Must match
// N_MAX_FFT_TWIDDLE in src/rendering/webgpu/passes/FFTTwiddle.ts.
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
    let gAddr = baseOffset + i * axisStride;
    smem_tw[i] = complexBuf[gAddr];
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
      let twFwd = fftTwiddleTable[twIdx];
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
    let gAddr = baseOffset + i * axisStride;
    complexBuf[gAddr] = smem_tw[finalBase + i];
  }
}
`
