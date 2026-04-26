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
 * Stockham FFT butterfly compute kernel.
 * Each invocation processes one butterfly pair for the current stage.
 *
 * Bind group layout:
 *   @group(0) @binding(0) FFTStageUniforms
 *   @group(0) @binding(1) srcBuf: array<vec2f> (read)
 *   @group(0) @binding(2) dstBuf: array<vec2f> (write)
 */
export const tdseStockhamFFTBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> fftUni: FFTStageUniforms;
// vec2f view of the interleaved [re,im] buffer. The buffer base is
// 256-byte aligned (WebGPU minStorageBufferOffsetAlignment) and each
// complex element occupies exactly 8 bytes, so the typed view is
// well-aligned and produces a single 8-byte load/store per access
// instead of two scalar loads/stores at addr/addr+1.
@group(0) @binding(1) var<storage, read> srcBuf: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> dstBuf: array<vec2f>;

const FFT_TWO_PI: f32 = 6.28318530717958647692;

// Complex multiply: (a+bi)(c+di) = (ac-bd) + (ad+bc)i
fn cmul(a: vec2f, b: vec2f) -> vec2f {
  return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let tid = gid.x;
  // Total butterflies = totalElements / 2 (each butterfly reads 2 and writes 2)
  let halfTotal = fftUni.totalElements >> 1u;
  if (tid >= halfTotal) {
    return;
  }

  let N = fftUni.axisDim;
  let s = fftUni.stage;
  let halfStage = 1u << s;         // 2^s
  let fullStage = halfStage << 1u; // 2^(s+1)

  // Decompose tid into (batchId, localId within this 1-D transform).
  // butterfliesPerTransform = N/2 — N is a power of 2, so use shift.
  let butterfliesPerTransform = N >> 1u;
  let log2BpT = firstTrailingBit(butterfliesPerTransform);
  let bptMask = butterfliesPerTransform - 1u;
  let batchId = tid >> log2BpT;
  let localBfly = tid & bptMask;

  // Stockham auto-sort index decomposition:
  //   g = which group of size fullStage, j = position within half-group.
  //   halfStage is 2^s → divide/modulo become shift/mask.
  let g = localBfly >> s;
  let j = localBfly & (halfStage - 1u);

  // Batch offset: decompose batchId by axisStride (axisStride is a product
  // of power-of-2 grid dims, so itself a power of 2).
  let axisStride = fftUni.axisStride;
  let log2Stride = firstTrailingBit(axisStride);
  let strideMask = axisStride - 1u;
  let batchInner = batchId & strideMask;
  let batchOuter = batchId >> log2Stride;
  let outerStride = axisStride * N;
  let baseOffset = batchOuter * outerStride + batchInner;

  // Address pattern (complex-element units; the typed view drops the
  // historical *2 shift). in0 at localBfly, in1 at localBfly + N/2.
  let pairDelta = butterfliesPerTransform * axisStride;
  let inIdx0 = baseOffset + localBfly * axisStride;
  let inIdx1 = inIdx0 + pairDelta;

  let val0 = srcBuf[inIdx0];
  let val1 = srcBuf[inIdx1];

  // Twiddle factor: W_N^(j * N / fullStage) = exp(-i * direction * 2π * j / fullStage).
  // fftUni.stage is uniform across every thread in the dispatch, so the three
  // if-branches collapse to a single code path per dispatch — no divergence.
  // Stage 0 (halfStage=1, j=0): twiddle is exactly (1, 0). Stage 1 (halfStage=2,
  // j∈{0,1}): twiddles are exactly {(1,0), (0,−dir)} — cos/sin reduce to 0/±1
  // and the complex multiply becomes a swap with a signed flip.
  var twVal1: vec2f;
  if (fftUni.stage == 0u) {
    twVal1 = val1;
  } else if (fftUni.stage == 1u) {
    let dir = fftUni.direction;
    let rotated = vec2f(dir * val1.y, -dir * val1.x);
    twVal1 = select(val1, rotated, j == 1u);
  } else {
    let anglePerJ = (-fftUni.direction * FFT_TWO_PI) / f32(fullStage);
    let angle = anglePerJ * f32(j);
    let tw = vec2f(cos(angle), sin(angle));
    twVal1 = cmul(tw, val1);
  }

  // Butterfly
  let outTop = val0 + twVal1;
  let outBot = val0 - twVal1;

  // Stockham OUTPUT: out0 = g * fullStage + j, out1 = out0 + halfStage.
  let outIdx0 = g * fullStage + j;
  let outAddr0 = baseOffset + outIdx0 * axisStride;
  let outAddr1 = outAddr0 + halfStage * axisStride;

  dstBuf[outAddr0] = outTop;
  dstBuf[outAddr1] = outBot;
}
`

/**
 * TDSE-only per-stage Stockham butterfly with a CPU-precomputed twiddle table.
 *
 * Diverges from `tdseStockhamFFTBlock` only in the stage >= 2 branch — stage 0
 * and stage 1 remain specialized (W^0 = (1,0) and W^{halfStage} ∈ {(1,0),
 * (0,-dir)} respectively). Address math, buffer layout, and dispatch
 * decomposition are identical.
 *
 * Bind group layout (TDSE-only):
 *   @group(0) @binding(0) FFTStageUniforms (uniform)
 *   @group(0) @binding(1) srcBuf: array<vec2f> (read)
 *   @group(0) @binding(2) dstBuf: array<vec2f> (read_write)
 *   @group(0) @binding(3) fftTwiddleTable: array<vec2f> (read) — see
 *     src/rendering/webgpu/passes/FFTTwiddle.ts for layout.
 *
 * All three modes (TDSE, Dirac, Pauli) use this 4-binding twiddle variant.
 * The original 3-binding `tdseStockhamFFTBlock` above is retained for reference.
 */
export const tdseStockhamFFTTwiddleBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> fftUni: FFTStageUniforms;
// vec2f view: see comment in tdseStockhamFFTBlock above. Saves one
// shift per address computation and replaces 2 scalar
// loads/stores per element with a single 8-byte vector op.
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
