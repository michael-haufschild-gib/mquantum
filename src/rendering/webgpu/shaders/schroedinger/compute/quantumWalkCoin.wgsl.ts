/**
 * Quantum Walk Coin Operator Compute Shader
 *
 * Applies the coin operator to the internal state at each lattice site.
 * The coin state has 2D complex components (D = latticeDim): one for +/-
 * direction per spatial axis.
 *
 * Supported coins:
 *   0 = Grover: G_jk = 1/D - δ_jk (mean minus self, no explicit matrix)
 *   1 = Hadamard: biased H(θ) = [[cos θ, sin θ],[sin θ, -cos θ]] per axis (tensor product for D>1)
 *   2 = DFT: F_jk = exp(2πi·jk/(2D)) / √(2D)
 *
 * Buffer layout: coinState[site * 2D * 2 + j * 2 + {0=re,1=im}]
 * where j ∈ [0, 2D) is the coin state index.
 *
 * @workgroup_size(64)
 * @module
 */

export const quantumWalkCoinBlock = /* wgsl */ `
struct QWCoinUniforms {
  totalSites: u32,
  latticeDim: u32,
  coinType: u32,       // 0=grover, 1=hadamard, 2=dft
  coinBias: f32,       // bias angle for hadamard: θ = coinBias * π/2, standard H at coinBias=0.5
}

@group(0) @binding(0) var<uniform> params: QWCoinUniforms;
@group(0) @binding(1) var<storage, read> coinIn: array<f32>;
@group(0) @binding(2) var<storage, read_write> coinOut: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let site = gid.x;
  if (site >= params.totalSites) { return; }

  let numCoinStates = 2u * params.latticeDim;
  let baseIdx = site * numCoinStates * 2u;

  if (params.coinType == 0u) {
    // Grover coin: out[j] = (2/N) * sum(in[k]) - in[j]
    // Simplified: out[j] = invN * sum - in[j] where invN = 2/numCoinStates
    var sumRe: f32 = 0.0;
    var sumIm: f32 = 0.0;
    for (var k: u32 = 0u; k < numCoinStates; k++) {
      sumRe += coinIn[baseIdx + k * 2u];
      sumIm += coinIn[baseIdx + k * 2u + 1u];
    }
    let invN = 2.0 / f32(numCoinStates);
    for (var j: u32 = 0u; j < numCoinStates; j++) {
      let reIn = coinIn[baseIdx + j * 2u];
      let imIn = coinIn[baseIdx + j * 2u + 1u];
      coinOut[baseIdx + j * 2u] = invN * sumRe - reIn;
      coinOut[baseIdx + j * 2u + 1u] = invN * sumIm - imIn;
    }
  } else if (params.coinType == 1u) {
    // Biased Hadamard: H(θ) = [[cos θ, sin θ], [sin θ, -cos θ]] per axis pair
    // coinBias ∈ [0,1] maps to θ ∈ [0, π/2]. Standard Hadamard at coinBias=0.5 (θ=π/4).
    // For D dimensions: tensor product of D biased gates on pairs (2d, 2d+1).
    let theta = params.coinBias * 1.57079632679; // π/2
    let c = cos(theta);
    let s = sin(theta);
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      let i0 = baseIdx + (d * 2u) * 2u;
      let i1 = baseIdx + (d * 2u + 1u) * 2u;
      let aRe = coinIn[i0]; let aIm = coinIn[i0 + 1u];
      let bRe = coinIn[i1]; let bIm = coinIn[i1 + 1u];
      coinOut[i0] = c * aRe + s * bRe;
      coinOut[i0 + 1u] = c * aIm + s * bIm;
      coinOut[i1] = s * aRe - c * bRe;
      coinOut[i1 + 1u] = s * aIm - c * bIm;
    }
  } else {
    // DFT coin: F_jk = exp(2πi·jk/N) / √N where N = 2D
    let N = f32(numCoinStates);
    let invSqrtN = 1.0 / sqrt(N);
    let twoPiOverN = 6.28318530718 / N;
    for (var j: u32 = 0u; j < numCoinStates; j++) {
      var outRe: f32 = 0.0;
      var outIm: f32 = 0.0;
      for (var k: u32 = 0u; k < numCoinStates; k++) {
        let phase = twoPiOverN * f32(j * k);
        let cosP = cos(phase);
        let sinP = sin(phase);
        let inRe = coinIn[baseIdx + k * 2u];
        let inIm = coinIn[baseIdx + k * 2u + 1u];
        outRe += cosP * inRe - sinP * inIm;
        outIm += cosP * inIm + sinP * inRe;
      }
      coinOut[baseIdx + j * 2u] = outRe * invSqrtN;
      coinOut[baseIdx + j * 2u + 1u] = outIm * invSqrtN;
    }
  }
}
`
