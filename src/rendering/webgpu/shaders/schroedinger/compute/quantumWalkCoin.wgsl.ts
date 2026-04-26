/**
 * Quantum Walk Coin Operator Compute Shader
 *
 * Applies the coin operator to the internal state at each lattice site.
 * The coin state has 2D complex components (D = latticeDim): one for +/-
 * direction per spatial axis.
 *
 * Supported coins:
 *   0 = Grover: G_jk = 1/D - δ_jk (mean minus self, no explicit matrix)
 *   1 = Hadamard: biased H(θ) = [[cos θ, sin θ],[sin θ, -cos θ]] applied independently per ±axis pair
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
// vec2f view of interleaved [re,im] coin amplitudes. The buffer base is
// 256-byte aligned and each complex slot is exactly 8 bytes, so the
// view is well-aligned. This drops one shift per address and replaces
// 2 scalar loads/stores per amplitude with 1 vec2 op. Sibling shaders
// (shift / absorber / diagnostics / writeGrid) keep their array<f32>
// views — the buffer is unchanged.
@group(0) @binding(1) var<storage, read> coinIn: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> coinOut: array<vec2f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let site = gid.x;
  if (site >= params.totalSites) { return; }

  let numCoinStates = 2u * params.latticeDim;
  // Complex-element units (vec2f view): site * numCoinStates instead of *2 in f32 units.
  let baseIdx = site * numCoinStates;

  if (params.coinType == 0u) {
    // Grover coin: out[j] = (2/N) * sum(in[k]) - in[j]
    // Load each coin component once into a vec2f local array so the output
    // loop doesn't re-read from storage (previous: 2·N reads; now: N reads).
    var inVal: array<vec2f, 22>;
    var sumV = vec2f(0.0);
    for (var k: u32 = 0u; k < numCoinStates; k++) {
      let v = coinIn[baseIdx + k];
      inVal[k] = v;
      sumV += v;
    }
    let invN = 2.0 / f32(numCoinStates);
    let scaledSum = sumV * invN;
    for (var j: u32 = 0u; j < numCoinStates; j++) {
      coinOut[baseIdx + j] = scaledSum - inVal[j];
    }
  } else if (params.coinType == 1u) {
    // Biased Hadamard: H(θ) = [[cos θ, sin θ], [sin θ, -cos θ]] per axis pair
    // coinBias ∈ [0,1] maps to θ ∈ [0, π/2]. Standard Hadamard at coinBias=0.5 (θ=π/4).
    // For D dimensions: applied independently to each (2d, 2d+1) pair.
    let theta = clamp(params.coinBias, 0.0, 1.0) * 1.57079632679489661923; // π/2
    let c = cos(theta);
    let s = sin(theta);
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      let i0 = baseIdx + d * 2u;
      let i1 = i0 + 1u;
      let a = coinIn[i0];
      let b = coinIn[i1];
      // Two simultaneous SU(2)-like 2x2 rotations on the (a, b) complex pair.
      // Vector form computes both real and imag with 2 fmas + 2 muls.
      coinOut[i0] = a * c + b * s;
      coinOut[i1] = a * s - b * c;
    }
  } else {
    // DFT coin: F_jk = exp(2πi·jk/N) / √N where N = 2D.
    // Inner k-phase is an arithmetic progression (step = j * twoPiOverN).
    // Use a 2x2 rotation recurrence to advance (cos, sin) without calling cos/sin
    // per k. Init once per j; then N-1 iterations of 2 muls + 1 sub + 1 add each.
    //
    // PERF: coinIn is cached into a function-local vec2f array so the j×k double
    // loop makes N storage loads (not N·N). For D=11, N=22: 22 vec2 loads
    // instead of 484 scalar loads per site per timestep.
    var inVal: array<vec2f, 22>;
    for (var k: u32 = 0u; k < numCoinStates; k++) {
      inVal[k] = coinIn[baseIdx + k];
    }
    let N = f32(numCoinStates);
    let invSqrtN = inverseSqrt(N);
    let twoPiOverN = 6.28318530717958647692 / N;
    for (var j: u32 = 0u; j < numCoinStates; j++) {
      var acc = vec2f(0.0);
      // Phase increment per k for this j.
      let dPhi = twoPiOverN * f32(j);
      let cosD = cos(dPhi);
      let sinD = sin(dPhi);
      var p = vec2f(1.0, 0.0); // (cos(0), sin(0))
      for (var k: u32 = 0u; k < numCoinStates; k++) {
        let v = inVal[k];
        // (cos + i sin) * (re + i im) = (cos*re - sin*im) + i (cos*im + sin*re)
        acc += vec2f(p.x * v.x - p.y * v.y, p.x * v.y + p.y * v.x);
        // Advance (cos, sin) by dPhi via 2x2 rotation. Vector update.
        p = vec2f(p.x * cosD - p.y * sinD, p.y * cosD + p.x * sinD);
      }
      coinOut[baseIdx + j] = acc * invSqrtN;
    }
  }
}
`
