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

// Twiddle factor: exp(-i * direction * 2*pi*k / N)
fn twiddle(k: u32, N: u32, direction: f32) -> vec2f {
  let angle = -direction * 2.0 * 3.14159265358979323846 * f32(k) / f32(N);
  return vec2f(cos(angle), sin(angle));
}

// Complex multiply: (a+bi)(c+di) = (ac-bd) + (ad+bc)i
fn cmul(a: vec2f, b: vec2f) -> vec2f {
  return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let tid = gid.x;
  // Total butterflies = totalElements / 2 (each butterfly reads 2 and writes 2)
  let halfTotal = fftUni.totalElements / 2u;
  if (tid >= halfTotal) {
    return;
  }

  let N = fftUni.axisDim;
  let s = fftUni.stage;
  let halfStage = 1u << s;        // 2^s
  let fullStage = halfStage << 1u; // 2^(s+1)

  // Decompose tid into (batchId, localId within this 1-D transform)
  // Number of butterflies per 1-D transform = N/2
  let butterfliesPerTransform = N / 2u;
  let batchId = tid / butterfliesPerTransform;
  let localBfly = tid % butterfliesPerTransform;

  // Stockham auto-sort index decomposition:
  // g = which group of size fullStage, j = position within half-group
  let g = localBfly / halfStage;
  let j = localBfly % halfStage;

  // Batch offset: decompose batchId into slow/fast axis components
  let batchInner = batchId % fftUni.axisStride;
  let batchOuter = batchId / fftUni.axisStride;
  let outerStride = fftUni.axisStride * N;
  let baseOffset = batchOuter * outerStride + batchInner;

  // Stockham INPUT: read from sequential halves (natural order from previous stage)
  // in0 = localBfly, in1 = localBfly + N/2
  let inIdx0 = localBfly;
  let inIdx1 = localBfly + butterfliesPerTransform;

  let inAddr0 = (baseOffset + inIdx0 * fftUni.axisStride) * 2u; // *2 for interleaved re,im
  let inAddr1 = (baseOffset + inIdx1 * fftUni.axisStride) * 2u;

  let val0 = vec2f(srcBuf[inAddr0], srcBuf[inAddr0 + 1u]);
  let val1 = vec2f(srcBuf[inAddr1], srcBuf[inAddr1 + 1u]);

  // Twiddle factor: W_N^(j * N / fullStage) = exp(-i * direction * 2pi * j / fullStage)
  let tw = twiddle(j * (N / fullStage), N, fftUni.direction);
  let twVal1 = cmul(tw, val1);

  // Butterfly
  let outTop = val0 + twVal1;
  let outBot = val0 - twVal1;

  // Stockham OUTPUT: write to shuffled positions (auto-sort reordering)
  // out0 = g * fullStage + j, out1 = out0 + halfStage
  let outIdx0 = g * fullStage + j;
  let outIdx1 = outIdx0 + halfStage;

  let outAddr0 = (baseOffset + outIdx0 * fftUni.axisStride) * 2u;
  let outAddr1 = (baseOffset + outIdx1 * fftUni.axisStride) * 2u;

  dstBuf[outAddr0] = outTop.x;
  dstBuf[outAddr0 + 1u] = outTop.y;
  dstBuf[outAddr1] = outBot.x;
  dstBuf[outAddr1 + 1u] = outBot.y;
}
`
