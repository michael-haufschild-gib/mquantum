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
 *   @group(0) @binding(1) srcBuf: array<f32> (read)
 *   @group(0) @binding(2) dstBuf: array<f32> (write)
 */
export const tdseStockhamFFTBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> fftUni: FFTStageUniforms;
@group(0) @binding(1) var<storage, read> srcBuf: array<f32>;
@group(0) @binding(2) var<storage, read_write> dstBuf: array<f32>;

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

  // Address pattern: in0 at localBfly, in1 at localBfly + N/2.
  // Compute inAddr0 once; inAddr1 is inAddr0 + 2 * bpt * axisStride (one mul saved).
  let pairDelta = (butterfliesPerTransform * axisStride) << 1u;
  let inAddr0 = (baseOffset + localBfly * axisStride) << 1u; // *2 for interleaved re,im
  let inAddr1 = inAddr0 + pairDelta;

  let val0 = vec2f(srcBuf[inAddr0], srcBuf[inAddr0 + 1u]);
  let val1 = vec2f(srcBuf[inAddr1], srcBuf[inAddr1 + 1u]);

  // Twiddle factor: W_N^(j * N / fullStage) = exp(-i * direction * 2π * j / fullStage).
  // fullStage is a per-dispatch uniform → the (−dir·2π/fullStage) factor is the same for every
  // thread. Precomputing it turns the per-thread divide into a multiply.
  let anglePerJ = (-fftUni.direction * FFT_TWO_PI) / f32(fullStage);
  let angle = anglePerJ * f32(j);
  let tw = vec2f(cos(angle), sin(angle));
  let twVal1 = cmul(tw, val1);

  // Butterfly
  let outTop = val0 + twVal1;
  let outBot = val0 - twVal1;

  // Stockham OUTPUT: out0 = g * fullStage + j, out1 = out0 + halfStage.
  let outIdx0 = g * fullStage + j;
  let outAddr0 = (baseOffset + outIdx0 * axisStride) << 1u;
  let outAddr1 = outAddr0 + ((halfStage * axisStride) << 1u);

  dstBuf[outAddr0] = outTop.x;
  dstBuf[outAddr0 + 1u] = outTop.y;
  dstBuf[outAddr1] = outBot.x;
  dstBuf[outAddr1 + 1u] = outBot.y;
}
`
