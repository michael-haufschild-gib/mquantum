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

  // Stockham index mapping:
  // For stage s, group size = 2^(s+1), pair offset = 2^s
  // j = position within group, g = which group
  let g = localBfly / halfStage;
  let j = localBfly % halfStage;

  // Input indices in the 1-D sequence
  let idxEven = g * fullStage + j;
  let idxOdd = idxEven + halfStage;

  // Convert 1-D sequence index to buffer position:
  // For axis with stride S, element k along the axis contributes k*S to the linear index.
  // The batch offset is: batchId decomposed into the "other axes" strides.
  // Simplified: we treat the data as batchCount independent 1-D sequences of length N,
  // each interleaved at axisStride apart.
  //
  // batchId -> (batchOuter, batchInner) where
  //   batchInner = batchId % axisStride (position within the fast axis)
  //   batchOuter = batchId / axisStride (position in the slow axes)
  let batchInner = batchId % fftUni.axisStride;
  let batchOuter = batchId / fftUni.axisStride;
  let outerStride = fftUni.axisStride * N;

  let baseOffset = batchOuter * outerStride + batchInner;
  let evenAddr = (baseOffset + idxEven * fftUni.axisStride) * 2u; // *2 for interleaved re,im
  let oddAddr = (baseOffset + idxOdd * fftUni.axisStride) * 2u;

  // Read even and odd values
  let even = vec2f(srcBuf[evenAddr], srcBuf[evenAddr + 1u]);
  let odd = vec2f(srcBuf[oddAddr], srcBuf[oddAddr + 1u]);

  // Twiddle factor for this butterfly
  let tw = twiddle(j * (N / fullStage), N, fftUni.direction);
  let twOdd = cmul(tw, odd);

  // Butterfly output
  let outTop = even + twOdd;
  let outBot = even - twOdd;

  // Stockham output mapping (bit-reversal free):
  // Output index for top half: g * halfStage + j -> position in first half
  // Output index for bottom half: same + N/2
  // But Stockham puts them at:
  //   top -> 2*g * halfStage + j (interleaved pattern)
  //   bot -> (2*g+1) * halfStage + j
  // Actually in Stockham: outIdx0 = localBfly, outIdx1 = localBfly + N/2
  // since the auto-sort property places them at natural order after log2(N) stages.
  let outIdx0 = localBfly;
  let outIdx1 = localBfly + butterfliesPerTransform;

  let outAddr0 = (baseOffset + outIdx0 * fftUni.axisStride) * 2u;
  let outAddr1 = (baseOffset + outIdx1 * fftUni.axisStride) * 2u;

  dstBuf[outAddr0] = outTop.x;
  dstBuf[outAddr0 + 1u] = outTop.y;
  dstBuf[outAddr1] = outBot.x;
  dstBuf[outAddr1 + 1u] = outBot.y;
}
`
