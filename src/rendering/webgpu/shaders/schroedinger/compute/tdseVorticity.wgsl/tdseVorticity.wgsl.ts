/** TDSE/BEC quantized plaquette circulation helpers. */

export const tdseVorticityBlock = /* wgsl */ `
fn phaseAtSite(siteIdx: u32) -> f32 {
  let z = psi[siteIdx];
  return atan2(z.y, z.x);
}

fn wrappedPhaseDelta(fromPhase: f32, toPhase: f32) -> f32 {
  let raw = toPhase - fromPhase;
  return atan2(sin(raw), cos(raw));
}

// Forward neighbor for plaquette phase winding. PML clamps at edges; otherwise
// wraps periodically to match the FFT topology used by the solver.
fn forwardPhaseNeighbor(
  siteIdx: u32,
  nnCoords: ptr<function, array<u32, 12>>,
  axis: u32
) -> u32 {
  let Nd = params.gridSize[axis];
  if (Nd <= 1u) {
    return siteIdx;
  }
  let coord = (*nnCoords)[axis];
  let stride = params.strides[axis];
  if (coord + 1u < Nd) {
    return siteIdx + stride;
  }
  if (tdsePmlAxisActive(axis)) {
    return siteIdx;
  }
  return siteIdx - stride * (Nd - 1u);
}

fn plaquetteWinding(
  siteIdx: u32,
  nnCoords: ptr<function, array<u32, 12>>,
  axisI: u32,
  axisJ: u32
) -> f32 {
  let p00 = siteIdx;
  let p10 = forwardPhaseNeighbor(p00, nnCoords, axisI);
  let p01 = forwardPhaseNeighbor(p00, nnCoords, axisJ);
  let p11 = forwardPhaseNeighbor(p10, nnCoords, axisJ);
  let th00 = phaseAtSite(p00);
  let th10 = phaseAtSite(p10);
  let th01 = phaseAtSite(p01);
  let th11 = phaseAtSite(p11);
  let circulation = wrappedPhaseDelta(th00, th10)
    + wrappedPhaseDelta(th10, th11)
    + wrappedPhaseDelta(th11, th01)
    + wrappedPhaseDelta(th01, th00);
  return circulation * TDSE_WG_INV_TAU;
}
`
