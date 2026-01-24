/**
 * WGSL 3D Mandelbulb-style SDF for Schrödinger isosurface rendering
 *
 * Port of GLSL schroedinger/sdf/sdf3d.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/sdf/sdf3d.wgsl
 */

export const sdf3dBlock = /* wgsl */ `
// 3D Mandelbulb SDF with orbital trap support
fn sdf3D(pos: vec3f, pwr: f32, bail: f32, maxIt: i32, uniforms: SchroedingerUniforms) -> vec2f {
  // c = uOrigin + pos.x * uBasisX + pos.y * uBasisY + pos.z * uBasisZ
  let cx = uniforms.origin[0] + pos.x*uniforms.basisX[0] + pos.y*uniforms.basisY[0] + pos.z*uniforms.basisZ[0];
  let cy = uniforms.origin[1] + pos.x*uniforms.basisX[1] + pos.y*uniforms.basisY[1] + pos.z*uniforms.basisZ[1];
  let cz = uniforms.origin[2] + pos.x*uniforms.basisX[2] + pos.y*uniforms.basisY[2] + pos.z*uniforms.basisZ[2];
  var zx = cx;
  var zy = cy;
  var zz = cz;

  var dr = 1.0;
  var r = 0.0;

  // Orbit traps
  var minPlane = 1000.0;
  var minAxis = 1000.0;
  var minSphere = 1000.0;
  var escIt = 0;

  for (var i = 0; i < 256; i++) {
    if (i >= maxIt) { break; }

    // r = |z|
    r = sqrt(zx*zx + zy*zy + zz*zz);
    if (r > bail) { escIt = i; break; }

    // Orbit traps
    minPlane = min(minPlane, abs(zy));
    minAxis = min(minAxis, sqrt(zx*zx + zy*zy));
    minSphere = min(minSphere, abs(r - 0.8));

    // Optimized power calculation
    let rp = pow(max(r, EPS), pwr);
    let rpMinus1 = rp / max(r, EPS);
    dr = rpMinus1 * pwr * dr + 1.0;

    // To spherical: z-axis primary
    let theta = acos(clamp(zz / max(r, EPS), -1.0, 1.0));
    let phi = atan2(zy, zx);

    // Power map: angles * n (with optional phase shift)
    let phaseTheta = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled);
    let phasePhi = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled);
    let thetaN = (theta + phaseTheta) * pwr;
    let phiN = (phi + phasePhi) * pwr;

    // From spherical: z-axis primary reconstruction
    let cTheta = cos(thetaN);
    let sTheta = sin(thetaN);
    let cPhi = cos(phiN);
    let sPhi = sin(phiN);

    zz = rp * cTheta + cz;
    zx = rp * sTheta * cPhi + cx;
    zy = rp * sTheta * sPhi + cy;
    escIt = i;
  }

  let trap = exp(-minPlane * 5.0) * 0.3 + exp(-minAxis * 3.0) * 0.2 +
             exp(-minSphere * 8.0) * 0.2 + f32(escIt) / f32(max(maxIt, 1)) * 0.3;
  let dist = max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
  return vec2f(dist, trap);
}

fn sdf3D_simple(pos: vec3f, pwr: f32, bail: f32, maxIt: i32, uniforms: SchroedingerUniforms) -> f32 {
  let cx = uniforms.origin[0] + pos.x*uniforms.basisX[0] + pos.y*uniforms.basisY[0] + pos.z*uniforms.basisZ[0];
  let cy = uniforms.origin[1] + pos.x*uniforms.basisX[1] + pos.y*uniforms.basisY[1] + pos.z*uniforms.basisZ[1];
  let cz = uniforms.origin[2] + pos.x*uniforms.basisX[2] + pos.y*uniforms.basisY[2] + pos.z*uniforms.basisZ[2];
  var zx = cx;
  var zy = cy;
  var zz = cz;
  var dr = 1.0;
  var r = 0.0;

  for (var i = 0; i < 256; i++) {
    if (i >= maxIt) { break; }
    r = sqrt(zx*zx + zy*zy + zz*zz);
    if (r > bail) { break; }

    let rp = pow(max(r, EPS), pwr);
    let rpMinus1 = rp / max(r, EPS);
    dr = rpMinus1 * pwr * dr + 1.0;

    let theta = acos(clamp(zz / max(r, EPS), -1.0, 1.0));
    let phi = atan2(zy, zx);

    let phaseTheta = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled);
    let phasePhi = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled);
    let thetaN = (theta + phaseTheta) * pwr;
    let phiN = (phi + phasePhi) * pwr;
    let cTheta = cos(thetaN);
    let sTheta = sin(thetaN);
    let cPhi = cos(phiN);
    let sPhi = sin(phiN);

    zz = rp * cTheta + cz;
    zx = rp * sTheta * cPhi + cx;
    zy = rp * sTheta * sPhi + cy;
  }
  return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`
