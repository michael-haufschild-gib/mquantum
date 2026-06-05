/**
 * Dirac axial charge helper for write-grid rendering.
 *
 * Computes the signed bilinear ψ†γ5ψ with γ5 = -i α0 α1 α2 in 3+1D — i.e.
 * `diracAxialChargeAtSite()` returns the raw signed accumulated sum and does
 * NOT take an absolute value or divide by ρ. Callers that want |ψ†γ5ψ|/ρ
 * must apply `abs(...)` and divide by the local density themselves.
 *
 * Requires diracUniformsBlock, sparse gamma tables, and diracWriteGrid
 * bindings.
 */

export const diracAxialChargeBlock = /* wgsl */ `
// γ5 = -i α0 α1 α2.
fn diracAxialChargeAtSite(siteIdx: u32, S: u32, T: u32, matStride: u32) -> f32 {
  if (params.latticeDim < 3u) { return 0.0; }

  var psiRe: array<f32, 64>;
  var psiIm: array<f32, 64>;
  for (var c: u32 = 0u; c < S; c = c + 1u) {
    let v = spinor[c * T + siteIdx];
    psiRe[c] = v.x;
    psiIm[c] = v.y;
  }

  var tmp0Re: array<f32, 64>;
  var tmp0Im: array<f32, 64>;
  var tmp1Re: array<f32, 64>;
  var tmp1Im: array<f32, 64>;

  if (DIRAC_USE_SPARSE_GAMMA) {
    let alpha2Base = 2u * DIRAC_SPARSE_S;
    for (var row: u32 = 0u; row < S; row = row + 1u) {
      let t = alpha2Base + row;
      let col = DIRAC_SPARSE_COL[t];
      let gRe = DIRAC_SPARSE_RE[t];
      let gIm = DIRAC_SPARSE_IM[t];
      tmp0Re[row] = gRe * psiRe[col] - gIm * psiIm[col];
      tmp0Im[row] = gRe * psiIm[col] + gIm * psiRe[col];
    }
    let alpha1Base = DIRAC_SPARSE_S;
    for (var row: u32 = 0u; row < S; row = row + 1u) {
      let t = alpha1Base + row;
      let col = DIRAC_SPARSE_COL[t];
      let gRe = DIRAC_SPARSE_RE[t];
      let gIm = DIRAC_SPARSE_IM[t];
      tmp1Re[row] = gRe * tmp0Re[col] - gIm * tmp0Im[col];
      tmp1Im[row] = gRe * tmp0Im[col] + gIm * tmp0Re[col];
    }
    for (var row: u32 = 0u; row < S; row = row + 1u) {
      let col = DIRAC_SPARSE_COL[row];
      let gRe = DIRAC_SPARSE_RE[row];
      let gIm = DIRAC_SPARSE_IM[row];
      tmp0Re[row] = gRe * tmp1Re[col] - gIm * tmp1Im[col];
      tmp0Im[row] = gRe * tmp1Im[col] + gIm * tmp1Re[col];
    }
  } else {
    let alpha2Base = 2u * matStride;
    for (var row: u32 = 0u; row < S; row++) {
      var aRe: f32 = 0.0;
      var aIm: f32 = 0.0;
      let rowBase = alpha2Base + row * S * 2u;
      for (var col: u32 = 0u; col < S; col++) {
        let gRe = gammaMatrices[rowBase + col * 2u];
        let gIm = gammaMatrices[rowBase + col * 2u + 1u];
        aRe += gRe * psiRe[col] - gIm * psiIm[col];
        aIm += gRe * psiIm[col] + gIm * psiRe[col];
      }
      tmp0Re[row] = aRe;
      tmp0Im[row] = aIm;
    }
    let alpha1Base = matStride;
    for (var row: u32 = 0u; row < S; row++) {
      var aRe: f32 = 0.0;
      var aIm: f32 = 0.0;
      let rowBase = alpha1Base + row * S * 2u;
      for (var col: u32 = 0u; col < S; col++) {
        let gRe = gammaMatrices[rowBase + col * 2u];
        let gIm = gammaMatrices[rowBase + col * 2u + 1u];
        aRe += gRe * tmp0Re[col] - gIm * tmp0Im[col];
        aIm += gRe * tmp0Im[col] + gIm * tmp0Re[col];
      }
      tmp1Re[row] = aRe;
      tmp1Im[row] = aIm;
    }
    for (var row: u32 = 0u; row < S; row++) {
      var aRe: f32 = 0.0;
      var aIm: f32 = 0.0;
      let rowBase = row * S * 2u;
      for (var col: u32 = 0u; col < S; col++) {
        let gRe = gammaMatrices[rowBase + col * 2u];
        let gIm = gammaMatrices[rowBase + col * 2u + 1u];
        aRe += gRe * tmp1Re[col] - gIm * tmp1Im[col];
        aIm += gRe * tmp1Im[col] + gIm * tmp1Re[col];
      }
      tmp0Re[row] = aRe;
      tmp0Im[row] = aIm;
    }
  }

  var axialCharge: f32 = 0.0;
  for (var row: u32 = 0u; row < S; row = row + 1u) {
    axialCharge += psiRe[row] * tmp0Im[row] - psiIm[row] * tmp0Re[row];
  }
  return axialCharge;
}
`
