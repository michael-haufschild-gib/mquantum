/**
 * Dirac Free Propagator (k-space Matrix Exponential) Compute Shader
 *
 * Applies the free Dirac propagator in momentum space:
 *   ψ̃(k) → exp(-iH_free(k)·dt/ℏ) · ψ̃(k)
 *
 * where H_free(k) = c·α·ℏk + β·mc² and the matrix exponential uses
 * the Clifford algebra identity H² = E²·I:
 *   exp(-iHt) = cos(Et)·I - i·sin(Et)·(H/E)
 *
 * The shader reads gamma matrices (α₁..αₙ, β) from storage, computes
 * H·ψ via matrix-vector multiply, then combines with cos/sin terms.
 *
 * Operates on interleaved complex FFT buffers after forward FFT.
 * Each spinor component occupies a contiguous segment of totalSites
 * complex values in the spinor buffers.
 *
 * Requires diracUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const diracKineticBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: DiracUniforms;
@group(0) @binding(1) var<storage, read_write> spinorRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> spinorIm: array<f32>;
@group(0) @binding(3) var<storage, read> gammaMatrices: array<f32>;

// Access element (row, col) of gamma matrix at index matIdx.
// Each matrix is spinorSize × spinorSize complex entries (re/im interleaved).
// Layout: gammaMatrices[matIdx * S*S*2 + row * S*2 + col * 2 + 0] = real
//         gammaMatrices[matIdx * S*S*2 + row * S*2 + col * 2 + 1] = imag
fn gammaRe(matIdx: u32, row: u32, col: u32) -> f32 {
  let S = params.spinorSize;
  return gammaMatrices[matIdx * S * S * 2u + row * S * 2u + col * 2u];
}

fn gammaIm(matIdx: u32, row: u32, col: u32) -> f32 {
  let S = params.spinorSize;
  return gammaMatrices[matIdx * S * S * 2u + row * S * 2u + col * 2u + 1u];
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  let S = params.spinorSize;
  let c_light = params.speedOfLight;
  let mc2 = params.mass * c_light * c_light;
  let c_hbar = c_light * params.hbar;
  let latDim = params.latticeDim;

  // Decode k-space coordinates using N-D index helper
  let coords = linearToND(idx, params.gridSize, latDim);

  // Compute k-vector components with FFT frequency ordering
  var kVec: array<f32, 12>;
  var ck2: f32 = 0.0;
  let TWO_PI: f32 = 6.28318530;
  for (var d: u32 = 0u; d < latDim; d++) {
    let gd = params.gridSize[d];
    let halfN = gd / 2u;
    let kIdx = select(i32(coords[d]) - i32(gd), i32(coords[d]), coords[d] < halfN);
    kVec[d] = f32(kIdx) * TWO_PI / (f32(gd) * params.spacing[d]);
    let ck = c_hbar * kVec[d];
    ck2 += ck * ck;
  }

  // Energy: E = √((cℏ|k|)² + (mc²)²)
  let E = sqrt(ck2 + mc2 * mc2);

  // Read spinor at this k-point into local arrays
  // Max spinor size is 64 (for 11D: S = 2^⌊(11+1)/2⌋ = 64)
  var psiRe_local: array<f32, 64>;
  var psiIm_local: array<f32, 64>;
  for (var sc: u32 = 0u; sc < S; sc++) {
    let bufIdx = sc * params.totalSites + idx;
    psiRe_local[sc] = spinorRe[bufIdx];
    psiIm_local[sc] = spinorIm[bufIdx];
  }

  // Compute H_free · ψ = (c·Σⱼ αⱼ·ℏkⱼ + β·mc²) · ψ
  // Result stored in HpsiRe, HpsiIm
  var HpsiRe: array<f32, 64>;
  var HpsiIm: array<f32, 64>;

  // Initialize Hψ = 0
  for (var sc: u32 = 0u; sc < S; sc++) {
    HpsiRe[sc] = 0.0;
    HpsiIm[sc] = 0.0;
  }

  // Add contributions from each alpha matrix: c·ℏk_d · α_d · ψ
  // Alpha matrices are stored at indices 0..latticeDim-1 in gammaMatrices
  let matStride = S * S * 2u; // stride between matrices in gammaMatrices array
  for (var d: u32 = 0u; d < latDim; d++) {
    let coeff = c_hbar * kVec[d];
    if (abs(coeff) < 1e-20) {
      continue;
    }
    // Precompute base offset for this matrix
    let matBase = d * matStride;
    // Matrix-vector multiply: Hψ += coeff · α_d · ψ
    for (var row: u32 = 0u; row < S; row++) {
      var accRe: f32 = 0.0;
      var accIm: f32 = 0.0;
      let rowBase = matBase + row * S * 2u;
      for (var col: u32 = 0u; col < S; col++) {
        let gRe = gammaMatrices[rowBase + col * 2u];
        let gIm = gammaMatrices[rowBase + col * 2u + 1u];
        // Complex multiply: (gRe + i·gIm) · (psiRe + i·psiIm)
        accRe += gRe * psiRe_local[col] - gIm * psiIm_local[col];
        accIm += gRe * psiIm_local[col] + gIm * psiRe_local[col];
      }
      HpsiRe[row] += coeff * accRe;
      HpsiIm[row] += coeff * accIm;
    }
  }

  // Add beta matrix contribution: mc² · β · ψ
  // Beta is stored at index latticeDim in gammaMatrices
  let betaBase = latDim * matStride;
  for (var row: u32 = 0u; row < S; row++) {
    var accRe: f32 = 0.0;
    var accIm: f32 = 0.0;
    let rowBase = betaBase + row * S * 2u;
    for (var col: u32 = 0u; col < S; col++) {
      let gRe = gammaMatrices[rowBase + col * 2u];
      let gIm = gammaMatrices[rowBase + col * 2u + 1u];
      accRe += gRe * psiRe_local[col] - gIm * psiIm_local[col];
      accIm += gRe * psiIm_local[col] + gIm * psiRe_local[col];
    }
    HpsiRe[row] += mc2 * accRe;
    HpsiIm[row] += mc2 * accIm;
  }

  // Apply matrix exponential using H² = E²·I identity:
  //   exp(-iH·dt/ℏ)·ψ = cos(E·dt/ℏ)·ψ - i·sin(E·dt/ℏ)·(H·ψ)/E
  let arg = E * params.dt / params.hbar;
  let cosArg = cos(arg);
  let sinArg = sin(arg);
  // Precompute sin(arg)/E to avoid per-component multiply
  let sinOverE = select(sinArg / E, 0.0, E < 1e-20);

  let T = params.totalSites;
  for (var sc: u32 = 0u; sc < S; sc++) {
    // cos(Et/ℏ) · ψ_c
    let reCos = cosArg * psiRe_local[sc];
    let imCos = cosArg * psiIm_local[sc];
    // -i · sin(Et/ℏ) · (Hψ)_c / E = sinOverE · (Hψ_im_c, -Hψ_re_c)
    let reKin = sinOverE * HpsiIm[sc];
    let imKin = -sinOverE * HpsiRe[sc];

    let bufIdx = sc * T + idx;
    spinorRe[bufIdx] = reCos + reKin;
    spinorIm[bufIdx] = imCos + imKin;
  }
}
`
