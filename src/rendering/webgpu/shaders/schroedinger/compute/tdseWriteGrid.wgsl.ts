/**
 * TDSE — Write to 3D Density Grid Compute Shader
 *
 * Writes the N-D TDSE wavefunction data into a 3D density texture for raymarching.
 * Same contract as freeScalarWriteGrid: basis-rotated slicing, model-space output.
 *
 * Output encoding (rgba16float):
 *   R: |psi|^2 normalized (probability density)
 *   G: log(|psi|^2 + epsilon) for log-density rendering
 *   B: arg(psi) phase angle [0, 2*pi]
 *   A: reserved (0.0)
 *
 * Requires tdseUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(4, 4, 4)
 * @module
 */

export const tdseWriteGridBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read> psiIm: array<f32>;
@group(0) @binding(3) var<storage, read> potential: array<f32>;
@group(0) @binding(4) var outputTex: texture_storage_3d<rgba16float, write>;

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let texDims = textureDimensions(outputTex);
  if (gid.x >= texDims.x || gid.y >= texDims.y || gid.z >= texDims.z) { return; }

  let bound = params.boundingRadius;
  if (bound <= 0.0) {
    textureStore(outputTex, gid, vec4f(0.0));
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
    return;
  }

  let idx = ndToLinear(coords, params.strides, params.latticeDim);
  let re = psiRe[idx];
  let im = psiIm[idx];
  let potentialVal = potential[idx];

  // Probability density |psi|^2
  let density = re * re + im * im;
  // Phase angle arg(psi) in [0, 2*pi]
  let phase = atan2(im, re) + 3.14159265;

  // Probability current magnitude |j| using central differences:
  // j_d = (hbar / m) * Im(conj(psi) * d_d psi)
  var currentMagSq: f32 = 0.0;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    if (params.gridSize[d] <= 1u) {
      continue;
    }
    var fwdCoords = coords;
    fwdCoords[d] = wrapCoord(i32(coords[d]) + 1, params.gridSize[d]);
    var bwdCoords = coords;
    bwdCoords[d] = wrapCoord(i32(coords[d]) - 1, params.gridSize[d]);
    let fwdIdx = ndToLinear(fwdCoords, params.strides, params.latticeDim);
    let bwdIdx = ndToLinear(bwdCoords, params.strides, params.latticeDim);
    let invDx = 0.5 / params.spacing[d];
    let dRe = (psiRe[fwdIdx] - psiRe[bwdIdx]) * invDx;
    let dIm = (psiIm[fwdIdx] - psiIm[bwdIdx]) * invDx;
    let jd = (params.hbar / max(params.mass, 1e-6)) * (re * dIm - im * dRe);
    currentMagSq += jd * jd;
  }
  let currentMag = sqrt(currentMagSq);

  // Encode selected field into display scalar [0,1] for the density-grid contract.
  var displayScalar: f32 = 0.0;
  if (params.fieldView == 0u) {
    // density
    displayScalar = select(density / params.maxDensity, density, params.maxDensity <= 0.0);
  } else if (params.fieldView == 1u) {
    // phase
    displayScalar = phase / (2.0 * 3.14159265);
  } else if (params.fieldView == 2u) {
    // current magnitude
    displayScalar = 1.0 - exp(-currentMag);
  } else {
    // potential
    let potentialScale = max(max(params.barrierHeight, abs(params.wellDepth)), 1.0);
    displayScalar = 0.5 + 0.5 * tanh(potentialVal / potentialScale);
  }

  let normDensity = clamp(displayScalar, 0.0, 1.0);
  let logDensity = log(normDensity + 1e-10);

  textureStore(outputTex, gid, vec4f(normDensity, logDensity, phase, 0.0));
}
`
