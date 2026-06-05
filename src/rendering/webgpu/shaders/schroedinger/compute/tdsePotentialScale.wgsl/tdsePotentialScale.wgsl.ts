/** TDSE write-grid potential normalization helper. */

export const tdsePotentialScaleBlock = /* wgsl */ `
fn getPotentialScale() -> f32 {
  if (params.potentialType == 1u || params.potentialType == 5u) {
    return max(params.barrierHeight, 1.0);
  } else if (params.potentialType == 2u) {
    return max(params.stepHeight, 1.0);
  } else if (params.potentialType == 3u) {
    return max(abs(params.wellDepth), 1.0);
  } else if (params.potentialType == 4u) {
    let r = params.boundingRadius * 0.5;
    return max(0.5 * params.mass * params.harmonicOmega * params.harmonicOmega * r * r, 1.0);
  } else if (params.potentialType == 6u) {
    return max(params.wallHeight, 1.0);
  } else if (params.potentialType == 7u) {
    return max(params.latticeDepth, 1.0);
  } else if (params.potentialType == 8u) {
    let a2 = params.doubleWellSeparation * params.doubleWellSeparation;
    return max(params.doubleWellLambda * a2 * a2, 1.0);
  } else if (params.potentialType == 9u) {
    let r = params.boundingRadius * 0.5;
    return max(0.5 * params.mass * params.harmonicOmega * params.harmonicOmega * r * r, 1.0);
  } else if (params.potentialType == 10u) {
    let halfDr = (params.radialWellOuter - params.radialWellInner) * 0.5;
    let h4 = halfDr * halfDr * halfDr * halfDr;
    return max(params.radialWellDepth * h4, 1.0);
  } else if (params.potentialType == 11u || params.potentialType == 12u) {
    return max(params.customPotentialScale, 1.0);
  } else if (params.potentialType == 13u) {
    let r = params.boundingRadius * 0.5;
    return max(0.5 * params.mass * params.harmonicOmega * params.harmonicOmega * r * r, 1.0);
  } else if (params.potentialType == 14u) {
    let Mbh = max(params.bhMass, 1e-4);
    let ell = params.bhMultipoleL;
    let s = params.bhSpin;
    let spinCorr = (1.0 - s * s) * 2.0 / 3.0;
    return max(abs((ell * (ell + 1.0) + spinCorr) / (27.0 * Mbh * Mbh)), 0.02);
  }
  return 1.0;
}
`
