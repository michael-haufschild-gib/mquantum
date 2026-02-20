/**
 * Free Scalar Field — Write to 3D Density Grid Compute Shader
 *
 * Writes the N-D scalar field data into a 3D density texture for raymarching.
 * Uses basis-rotated slicing: each 3D texture voxel maps to a model-space
 * position, which is projected into the N-D lattice via the inverse basis
 * transform. Extra dimensions (d >= 3) use configurable slice positions.
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
  // ndWorldPos[d] = modelPos.x * basisX[d] + modelPos.y * basisY[d] + modelPos.z * basisZ[d]
  // For d >= 3, add slice offset
  var ndWorldPos: array<f32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    ndWorldPos[d] = modelPos.x * params.basisX[d]
                  + modelPos.y * params.basisY[d]
                  + modelPos.z * params.basisZ[d];
    if (d >= 3u) {
      ndWorldPos[d] += params.slicePositions[d];
    }
  }

  // Convert N-D world position to lattice coordinates
  var coords: array<u32, 12>;
  var inBounds: bool = true;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let halfExtent = f32(params.gridSize[d]) * params.spacing[d] * 0.5;
    let coordF = (ndWorldPos[d] + halfExtent) / params.spacing[d];
    let coordI = i32(round(coordF));
    if (coordI < 0 || coordI >= i32(params.gridSize[d])) {
      inBounds = false;
      break;
    }
    coords[d] = u32(coordI);
  }

  if (!inBounds) {
    textureStore(outputTex, gid, vec4f(0.0));
    textureStore(analysisTex, gid, vec4f(0.0));
    return;
  }

  let idx = ndToLinear(coords, params.strides, params.latticeDim);
  let phiVal = phi[idx];
  let piVal = pi[idx];

  var fieldValue: f32 = 0.0;

  // Compute gradient energy (shared between energy density view and analysis modes)
  var gradEnergy: f32 = 0.0;
  var gradPhi: array<f32, 12>; // per-dimension gradient for flux computation

  // Always compute gradient when analysis mode is active or fieldView == energyDensity
  let needGrad = params.fieldView == 2u || params.analysisMode > 0u;
  if (needGrad) {
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      if (params.gridSize[d] <= 1u) { continue; }

      var fwdCoords = coords;
      fwdCoords[d] = wrapCoord(i32(coords[d]) + 1, params.gridSize[d]);
      let fwdIdx = ndToLinear(fwdCoords, params.strides, params.latticeDim);
      let dPhi = phi[fwdIdx] - phiVal;
      let invA = 1.0 / params.spacing[d];
      gradPhi[d] = dPhi * invA;
      gradEnergy += dPhi * dPhi * invA * invA;
    }
  }

  if (params.fieldView == 0u) {
    // phi (field amplitude)
    fieldValue = phiVal;
  } else if (params.fieldView == 1u) {
    // pi (conjugate momentum)
    fieldValue = piVal;
  } else {
    // Energy density: E = 0.5*pi^2 + 0.5*m^2*phi^2 + 0.5*|grad phi|^2
    fieldValue = 0.5 * (piVal * piVal + params.mass * params.mass * phiVal * phiVal + gradEnergy);
  }

  // Encode for density grid:
  // R: |value| (magnitude / density)
  // G: log(|value| + epsilon) for log-density rendering
  // B: phase encoding (0.0 = positive, PI = negative) for color algorithms
  // A: unused
  let rho = abs(fieldValue);
  let normRho = select(rho / params.maxFieldValue, rho, params.maxFieldValue <= 0.0);
  let logRho = log(normRho + 1e-10);
  let phase = select(0.0, 3.14159265, fieldValue < 0.0);

  textureStore(outputTex, gid, vec4f(normRho, logRho, phase, 0.0));

  // Analysis texture output (educational color modes)
  if (params.analysisMode == 1u) {
    // Hamiltonian decomposition / Mode character: R=K, G=gradE, B=V, A=E
    let K = 0.5 * piVal * piVal;
    let G = 0.5 * gradEnergy;
    let V = 0.5 * params.mass * params.mass * phiVal * phiVal;
    let E = K + G + V;
    textureStore(analysisTex, gid, vec4f(K, G, V, E));
  } else if (params.analysisMode == 2u) {
    // Energy flux: S_i = -pi * grad_i(phi)
    // Project N-D flux vector onto the 3D basis for visualization
    var Sx: f32 = 0.0;
    var Sy: f32 = 0.0;
    var Sz: f32 = 0.0;
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      let fluxD = -piVal * gradPhi[d];
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
