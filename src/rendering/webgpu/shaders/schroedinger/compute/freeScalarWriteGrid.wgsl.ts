/**
 * Free Scalar Field — Write to 3D Density Grid Compute Shader
 *
 * Writes the N-D scalar field data into a 3D density texture for raymarching.
 * Uses basis-rotated slicing: each 3D texture voxel maps to a model-space
 * position, which is projected into the N-D lattice via the inverse basis
 * transform. Extra dimensions (d >= 3) use configurable slice positions.
 *
 * Uses trilinear interpolation across the 3 visible lattice dimensions for
 * smooth output. Dims 4+ use nearest-neighbor (slice-fixed). Energy density
 * (fieldView 2) uses nearest-neighbor due to gradient computation.
 *
 * The density texture is written in model space, so the fragment shader
 * samples directly with pos (no additional basis remap needed).
 *
 * When analysisMode > 0, also writes per-voxel physics observables to
 * the analysis texture:
 *   mode 1 (Hamiltonian/Character): R=K, G=gradE, B=V, A=E
 *   mode 2 (Energy Flux): R=Sx, G=Sy, B=Sz, A=|S|
 *   mode 3 (k-Space): CPU manages both textures — GPU skips all writes
 *
 * Requires freeScalarUniformsBlock + freeScalarNDIndexBlock to be prepended.
 */

export const freeScalarWriteGridBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: FreeScalarUniforms;
@group(0) @binding(1) var<storage, read> phi: array<f32>;
@group(0) @binding(2) var<storage, read> pi: array<f32>;
@group(0) @binding(3) var outputTex: texture_storage_3d<rgba16float, write>;
@group(0) @binding(4) var analysisTex: texture_storage_3d<rgba16float, write>;

// Convert N-D world position to lattice coordinates with trilinear interpolation.
fn worldToLatticeInterp(
  ndWorldPos: ptr<function, array<f32, 12>>,
  coordsLo: ptr<function, array<u32, 12>>,
  coordsHi: ptr<function, array<u32, 12>>,
  fracs: ptr<function, array<f32, 12>>
) -> bool {
  let interpDims = min(params.latticeDim, 3u);
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let halfExtent = f32(params.gridSize[d]) * params.spacing[d] * 0.5;
    let coordF = ((*ndWorldPos)[d] + halfExtent) / params.spacing[d];

    if (d < interpDims) {
      let lo = floor(coordF);
      let hi = lo + 1.0;
      let f = coordF - lo;
      let loI = i32(lo);
      let hiI = i32(hi);
      if (loI < -1 || hiI > i32(params.gridSize[d])) {
        return false;
      }
      (*coordsLo)[d] = u32(clamp(loI, 0, i32(params.gridSize[d]) - 1));
      (*coordsHi)[d] = u32(clamp(hiI, 0, i32(params.gridSize[d]) - 1));
      (*fracs)[d] = clamp(f, 0.0, 1.0);
    } else {
      let coordI = i32(round(coordF));
      if (coordI < 0 || coordI >= i32(params.gridSize[d])) {
        return false;
      }
      (*coordsLo)[d] = u32(coordI);
      (*coordsHi)[d] = u32(coordI);
      (*fracs)[d] = 0.0;
    }
  }
  return true;
}

fn siteIndexForCorner(
  coordsLo: ptr<function, array<u32, 12>>,
  coordsHi: ptr<function, array<u32, 12>>,
  corner: u32
) -> u32 {
  var coords: array<u32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    if ((corner & (1u << d)) != 0u) {
      coords[d] = (*coordsHi)[d];
    } else {
      coords[d] = (*coordsLo)[d];
    }
  }
  return ndToLinear(coords, params.strides, params.latticeDim);
}

fn cornerWeight(fracs: ptr<function, array<f32, 12>>, corner: u32) -> f32 {
  var w: f32 = 1.0;
  let interpDims = min(params.latticeDim, 3u);
  for (var d: u32 = 0u; d < interpDims; d++) {
    if ((corner & (1u << d)) != 0u) {
      w *= (*fracs)[d];
    } else {
      w *= (1.0 - (*fracs)[d]);
    }
  }
  return w;
}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let texDims = textureDimensions(outputTex);
  if (gid.x >= texDims.x || gid.y >= texDims.y || gid.z >= texDims.z) { return; }

  // k-Space mode (analysisMode 3): CPU manages both textures — skip all GPU writes
  if (params.analysisMode == 3u) { return; }

  let bound = params.boundingRadius;
  if (bound <= 0.0) {
    textureStore(outputTex, gid, vec4f(0.0));
    textureStore(analysisTex, gid, vec4f(0.0));
    return;
  }

  // Map texture voxel to model-space position [-bound, +bound]^3
  let modelPos = vec3f(
    (f32(gid.x) + 0.5) / f32(texDims.x) * 2.0 * bound - bound,
    (f32(gid.y) + 0.5) / f32(texDims.y) * 2.0 * bound - bound,
    (f32(gid.z) + 0.5) / f32(texDims.z) * 2.0 * bound - bound
  );

  // Project model-space position into N-D lattice coordinates via basis vectors
  var ndWorldPos: array<f32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    ndWorldPos[d] = modelPos.x * params.basisX[d]
                  + modelPos.y * params.basisY[d]
                  + modelPos.z * params.basisZ[d];
    if (d >= 3u) {
      ndWorldPos[d] += params.slicePositions[d];
    }
  }

  // Convert to lattice coordinates with trilinear interpolation support
  var coordsLo: array<u32, 12>;
  var coordsHi: array<u32, 12>;
  var fracs: array<f32, 12>;

  let inBounds = worldToLatticeInterp(&ndWorldPos, &coordsLo, &coordsHi, &fracs);
  if (!inBounds) {
    textureStore(outputTex, gid, vec4f(0.0));
    textureStore(analysisTex, gid, vec4f(0.0));
    return;
  }

  // Perpendicular falloff for low-dimensional lattices (1D → tube, 2D → sheet)
  var perpFalloff: f32 = 1.0;
  if (params.latticeDim < 3u) {
    var projSq: f32 = 0.0;
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      let v = vec3f(params.basisX[d], params.basisY[d], params.basisZ[d]);
      let proj = dot(modelPos, v);
      projSq += proj * proj;
    }
    let perpDist2 = max(dot(modelPos, modelPos) - projSq, 0.0);
    let perpSigma = bound * 0.06;
    perpFalloff = exp(-perpDist2 / (2.0 * perpSigma * perpSigma));
  }

  let numCorners = 1u << min(params.latticeDim, 3u);

  // Nearest-neighbor coords (for gradient-based modes and analysis)
  var nnCoords: array<u32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let halfExtent = f32(params.gridSize[d]) * params.spacing[d] * 0.5;
    let coordF = (ndWorldPos[d] + halfExtent) / params.spacing[d];
    nnCoords[d] = u32(clamp(i32(round(coordF)), 0, i32(params.gridSize[d]) - 1));
  }
  let nnIdx = ndToLinear(nnCoords, params.strides, params.latticeDim);

  // Trilinear interpolation for phi/pi (fieldView 0, 1)
  // NN for energy density (fieldView 2) which needs gradient
  let useTrilinear = params.fieldView <= 1u;

  var phiVal: f32;
  var piVal: f32;
  var idx: u32;

  if (useTrilinear) {
    var blendedPhi: f32 = 0.0;
    var blendedPi: f32 = 0.0;
    for (var corner: u32 = 0u; corner < numCorners; corner++) {
      let w = cornerWeight(&fracs, corner);
      if (w > 0.0) {
        let sIdx = siteIndexForCorner(&coordsLo, &coordsHi, corner);
        blendedPhi += w * phi[sIdx];
        blendedPi += w * pi[sIdx];
      }
    }
    phiVal = blendedPhi;
    piVal = blendedPi;
    idx = nnIdx;
  } else {
    idx = nnIdx;
    phiVal = phi[idx];
    piVal = pi[idx];
  }

  var fieldValue: f32 = 0.0;

  // Compute gradient energy (for energy density view and analysis modes)
  var gradEnergy: f32 = 0.0;
  var gradPhi: array<f32, 12>;

  let needGrad = params.fieldView == 2u || params.analysisMode > 0u;
  if (needGrad) {
    let nnPhiVal = phi[nnIdx];
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      gradPhi[d] = 0.0;
      if (params.gridSize[d] <= 1u) { continue; }

      let stride = params.strides[d];
      let coord = nnCoords[d];
      let fwdIdx = select(nnIdx + stride, nnIdx - stride * (params.gridSize[d] - 1u), coord == params.gridSize[d] - 1u);
      let dPhi = phi[fwdIdx] - nnPhiVal;
      let invA = 1.0 / params.spacing[d];
      gradPhi[d] = dPhi * invA;
      gradEnergy += gradPhi[d] * gradPhi[d];
    }
  }

  if (params.fieldView == 0u) {
    fieldValue = phiVal;
  } else if (params.fieldView == 1u) {
    fieldValue = piVal;
  } else if (params.fieldView == 3u) {
    // Wall density: V(phi) = lambda*(phi^2 - v^2)^2 — zero at vacua, peaks at domain walls
    let nnPhiVal = phi[nnIdx];
    let wdV2 = params.selfInteractionVev * params.selfInteractionVev;
    let wdPhi2 = nnPhiVal * nnPhiVal;
    let wdDiff = wdPhi2 - wdV2;
    fieldValue = params.selfInteractionLambda * wdDiff * wdDiff;
  } else {
    let nnPiVal = pi[nnIdx];
    let nnPhiVal = phi[nnIdx];
    fieldValue = 0.5 * (nnPiVal * nnPiVal + params.mass * params.mass * nnPhiVal * nnPhiVal + gradEnergy);
    // Self-interaction potential energy: V(phi) = lambda*(phi^2 - v^2)^2
    if (params.selfInteractionEnabled != 0u) {
      let siV2 = params.selfInteractionVev * params.selfInteractionVev;
      let siPhi2 = nnPhiVal * nnPhiVal;
      let siDiff = siPhi2 - siV2;
      fieldValue += params.selfInteractionLambda * siDiff * siDiff;
    }
  }

  let rho = abs(fieldValue);
  let normRho = select(rho / params.maxFieldValue, rho, params.maxFieldValue <= 0.0) * perpFalloff;
  let logRho = log(normRho + 1e-10);
  let phase = select(0.0, 3.14159265, fieldValue < 0.0);

  textureStore(outputTex, gid, vec4f(normRho, logRho, phase, 0.0));

  // Analysis texture output (educational color modes)
  if (params.analysisMode == 1u) {
    let nnPiVal = pi[nnIdx];
    let nnPhiVal = phi[nnIdx];
    let K = 0.5 * nnPiVal * nnPiVal;
    let G = 0.5 * gradEnergy;
    var V = 0.5 * params.mass * params.mass * nnPhiVal * nnPhiVal;
    if (params.selfInteractionEnabled != 0u) {
      let siV2 = params.selfInteractionVev * params.selfInteractionVev;
      let siPhi2 = nnPhiVal * nnPhiVal;
      let siDiff = siPhi2 - siV2;
      V += params.selfInteractionLambda * siDiff * siDiff;
    }
    let E = K + G + V;
    textureStore(analysisTex, gid, vec4f(K, G, V, E));
  } else if (params.analysisMode == 2u) {
    let nnPiVal = pi[nnIdx];
    var Sx: f32 = 0.0;
    var Sy: f32 = 0.0;
    var Sz: f32 = 0.0;
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      let fluxD = -nnPiVal * gradPhi[d];
      Sx += fluxD * params.basisX[d];
      Sy += fluxD * params.basisY[d];
      Sz += fluxD * params.basisZ[d];
    }
    let Smag = sqrt(Sx * Sx + Sy * Sy + Sz * Sz);
    textureStore(analysisTex, gid, vec4f(Sx, Sy, Sz, Smag));
  } else {
    textureStore(analysisTex, gid, vec4f(0.0));
  }
}
`
