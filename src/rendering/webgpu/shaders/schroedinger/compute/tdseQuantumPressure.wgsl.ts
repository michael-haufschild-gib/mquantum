/**
 * TDSE Madelung quantum-pressure helper for write-grid rendering.
 *
 * Computes Q = -(hbar^2/2m) * laplacian(sqrt(rho)) / sqrt(rho), returned as a
 * bounded magnitude in [0, 1].
 */

export const tdseQuantumPressureBlock = /* wgsl */ `
fn tdseQuantumPressureAtSite(
  idx: u32,
  density: f32,
  nnCoords: ptr<function, array<u32, 12>>,
  invSpacings: ptr<function, array<f32, 12>>
) -> f32 {
  let rCenter = sqrt(max(density, 1e-30));
  var laplacianR: f32 = 0.0;
  var maxInvDx2: f32 = 0.0;

  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    if (params.gridSize[d] <= 1u) { continue; }
    let stride = params.strides[d];
    let coord = (*nnCoords)[d];
    let Nd = params.gridSize[d];
    let invDx = (*invSpacings)[d];
    let invDx2 = invDx * invDx;
    maxInvDx2 = max(maxInvDx2, invDx2);

    let atLo = coord == 0u;
    let atHi = coord == Nd - 1u;
    var fwdIdx = select(idx + stride, idx - stride * (Nd - 1u), atHi);
    var bwdIdx = select(idx - stride, idx + stride * (Nd - 1u), atLo);
    let pmlAxis = tdsePmlAxisActive(d);
    if (pmlAxis && atLo) { bwdIdx = idx; }
    if (pmlAxis && atHi) { fwdIdx = idx; }

    let zF = psi[fwdIdx];
    let zB = psi[bwdIdx];
    let rF = sqrt(max(dot(zF, zF), 1e-30));
    let rB = sqrt(max(dot(zB, zB), 1e-30));
    laplacianR += (rF - 2.0 * rCenter + rB) * invDx2;
  }

  let qCoeff = (params.hbar * params.hbar) / (2.0 * max(params.mass, 1e-6));
  let qPotential = -qCoeff * laplacianR / max(rCenter, 1e-10);
  let qScale = max(qCoeff * maxInvDx2, 1e-12);
  return 1.0 - exp(-abs(qPotential) / qScale);
}
`
