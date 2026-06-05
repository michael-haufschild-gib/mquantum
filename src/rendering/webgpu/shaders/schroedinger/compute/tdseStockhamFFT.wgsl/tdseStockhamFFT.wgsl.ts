/**
 * Stockham radix-2 FFT butterfly compute shader for TDSE.
 *
 * Performs one stage of the Stockham auto-sort FFT algorithm.
 * Dispatched log2(N) times per axis per transform direction.
 * Ping-pongs between srcBuf and dstBuf each stage.
 *
 * Data layout: interleaved complex [re0, im0, re1, im1, ...] for each 1-D pencil.
 * Multi-axis support: axisStride and batchCount uniforms select which axis to transform.
 *
 * @workgroup_size(64)
 * @module
 */

/**
 * Uniform struct for FFT stage parameters.
 * Updated per dispatch: axis, stage, direction, grid dimensions.
 */
export const tdseFFTStageUniformsBlock = /* wgsl */ `
struct FFTStageUniforms {
  axisDim: u32,        // N for current axis (must be power of 2)
  stage: u32,          // Current Stockham stage (0 .. log2(N)-1)
  direction: f32,      // +1.0 forward, -1.0 inverse
  totalElements: u32,  // Total number of complex elements (product of all grid dims)
  axisStride: u32,     // Stride between consecutive elements along this axis
  batchCount: u32,     // Number of independent 1-D transforms = totalElements / axisDim
  invN: f32,           // 1.0/N for inverse normalization (only used on unpack, but kept for uniformity)
  _pad0: u32,          // pad to 32 bytes
}
`

/**
 * TDSE-only per-stage Stockham butterfly with a CPU-precomputed twiddle table.
 *
 * Each invocation processes one butterfly pair for the current stage.
 * Stage 0 (halfStage=1, j=0): twiddle is exactly (1,0). Stage 1
 * (halfStage=2, j∈{0,1}): twiddles are exactly {(1,0), (0,−dir)} — cos/sin
 * reduce to 0/±1 and the complex multiply becomes a swap with a signed flip.
 * Stages ≥ 2 read the twiddle from `fftTwiddleTable` (no cos/sin in-kernel).
 *
 * Bind group layout (TDSE-only):
 *   @group(0) @binding(0) FFTStageUniforms (uniform)
 *   @group(0) @binding(1) srcBuf: array<vec2f> (read)
 *   @group(0) @binding(2) dstBuf: array<vec2f> (read_write)
 *   @group(0) @binding(3) fftTwiddleTable: array<vec2f> (read) — see
 *     src/rendering/webgpu/passes/FFTTwiddle.ts for layout.
 *
 * All three modes (TDSE, Dirac, Pauli) use this 4-binding twiddle variant.
 *
 * `srcBuf` / `dstBuf` are typed `vec2f` views of the interleaved [re, im]
 * buffer. The buffer base is 256-byte aligned (WebGPU
 * `minStorageBufferOffsetAlignment`) and each complex element occupies
 * exactly 8 bytes, so the typed view is well-aligned and produces a single
 * 8-byte load/store per access instead of two scalar loads/stores at
 * addr/addr+1.
 */
export const tdseStockhamFFTTwiddleBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> fftUni: FFTStageUniforms;
@group(0) @binding(1) var<storage, read> srcBuf: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> dstBuf: array<vec2f>;
@group(0) @binding(3) var<storage, read> fftTwiddleTable: array<vec2f>;

// Max FFT axis length for the TDSE twiddle path. Must match
// N_MAX_FFT_TWIDDLE in src/rendering/webgpu/passes/FFTTwiddle.ts.
const N_MAX_FFT_TWIDDLE_PS: u32 = 128u;
const LOG2_N_MAX_FFT_TWIDDLE_PS: u32 = 7u;

fn cmul_tw_ps(a: vec2f, b: vec2f) -> vec2f {
  return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let tid = gid.x;
  let halfTotal = fftUni.totalElements >> 1u;
  if (tid >= halfTotal) {
    return;
  }

  let N = fftUni.axisDim;
  let s = fftUni.stage;
  let halfStage = 1u << s;
  let fullStage = halfStage << 1u;

  let butterfliesPerTransform = N >> 1u;
  let log2BpT = firstTrailingBit(butterfliesPerTransform);
  let bptMask = butterfliesPerTransform - 1u;
  let batchId = tid >> log2BpT;
  let localBfly = tid & bptMask;

  let g = localBfly >> s;
  let j = localBfly & (halfStage - 1u);

  let axisStride = fftUni.axisStride;
  let log2Stride = firstTrailingBit(axisStride);
  let strideMask = axisStride - 1u;
  let batchInner = batchId & strideMask;
  let batchOuter = batchId >> log2Stride;
  let outerStride = axisStride * N;
  let baseOffset = batchOuter * outerStride + batchInner;

  let pairDelta = butterfliesPerTransform * axisStride;
  let inIdx0 = baseOffset + localBfly * axisStride;
  let inIdx1 = inIdx0 + pairDelta;

  let val0 = srcBuf[inIdx0];
  let val1 = srcBuf[inIdx1];

  // Twiddle selection. fftUni.stage is uniform across every thread in the
  // dispatch, so the if-chain collapses to a single path per dispatch.
  var twVal1: vec2f;
  if (fftUni.stage == 0u) {
    twVal1 = val1;
  } else if (fftUni.stage == 1u) {
    let dir = fftUni.direction;
    let rotated = vec2f(dir * val1.y, -dir * val1.x);
    twVal1 = select(val1, rotated, j == 1u);
  } else {
    let dir = fftUni.direction;
    let twStride = 1u << (LOG2_N_MAX_FFT_TWIDDLE_PS - s - 1u);
    let twIdx = j * twStride;
    let twFwd = fftTwiddleTable[twIdx];
    let tw = vec2f(twFwd.x, dir * twFwd.y);
    twVal1 = cmul_tw_ps(tw, val1);
  }

  let outTop = val0 + twVal1;
  let outBot = val0 - twVal1;

  let outIdx0 = g * fullStage + j;
  let outAddr0 = baseOffset + outIdx0 * axisStride;
  let outAddr1 = outAddr0 + halfStage * axisStride;

  dstBuf[outAddr0] = outTop;
  dstBuf[outAddr1] = outBot;
}
`
