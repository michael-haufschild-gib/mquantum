/**
 * Quantum Walk — Write to 3D Density Grid Compute Shader
 *
 * Maps the N-D quantum walk lattice onto the 3D density texture consumed by the
 * volume raymarcher. For each 3D texture voxel, projects model-space position
 * through basis vectors to find the corresponding lattice site, then sums the
 * probability over all coin states: P(site) = Σ_j |c_j(site)|².
 *
 * Supports trilinear interpolation for the first min(latticeDim, 3) dimensions
 * and perpendicular Gaussian falloff for 1D/2D lattices.
 *
 * Output encoding (rgba16float):
 *   R: P(site) / maxDensity  (normalized probability)
 *   G: log(R + ε)            (log-density for Beer-Lambert)
 *   B: arg(Σ_j c_j)          (phase of summed coin amplitude) [0, 2π]
 *   A: 0.0                   (reserved)
 *
 * Requires freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(4, 4, 4)
 * @module
 */

export const qwWriteGridUniformsBlock = /* wgsl */ `
struct QWWriteGridUniforms {
  // Lattice parameters (16 bytes)
  latticeDim: u32,           // offset 0
  totalSites: u32,           // offset 4
  numCoinStates: u32,        // offset 8  (= 2 * latticeDim)
  fieldView: u32,            // offset 12 (0=probability, 1=phase, 2=coinState)

  // Per-dimension arrays (48 bytes each)
  gridSize: array<u32, 12>,  // offset 16
  strides: array<u32, 12>,   // offset 64
  spacing: array<f32, 12>,   // offset 112

  // Rendering parameters (16 bytes)
  boundingRadius: f32,       // offset 160
  maxDensity: f32,           // offset 164
  _pad0: u32,                // offset 168
  _pad1: u32,                // offset 172

  // Basis vectors for N-D -> 3D projection (48 bytes each = 144 bytes)
  basisX: array<f32, 12>,    // offset 176
  basisY: array<f32, 12>,    // offset 224
  basisZ: array<f32, 12>,    // offset 272

  // Slice positions for extra dimensions (48 bytes)
  slicePositions: array<f32, 12>, // offset 320
}
`

/** Total byte size of QWWriteGridUniforms. */
export const QW_WRITE_GRID_UNIFORMS_SIZE = 368 // 320 + 48

export const qwWriteGridBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: QWWriteGridUniforms;
@group(0) @binding(1) var<storage, read> coinState: array<f32>;
@group(0) @binding(2) var outputTex: texture_storage_3d<rgba16float, write>;
@group(0) @binding(3) var<storage, read_write> maxDensityAtomic: atomic<u32>;

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
    let coordF = ((*ndWorldPos)[d] + halfExtent) / params.spacing[d] - 0.5;

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

// Sum probability and complex amplitude over all coin states at a given site.
fn sumCoinStates(site: u32) -> vec3f {
  let baseIdx = site * params.numCoinStates * 2u;
  var prob: f32 = 0.0;
  var sumRe: f32 = 0.0;
  var sumIm: f32 = 0.0;
  for (var j: u32 = 0u; j < params.numCoinStates; j++) {
    let re = coinState[baseIdx + j * 2u];
    let im = coinState[baseIdx + j * 2u + 1u];
    prob += re * re + im * im;
    sumRe += re;
    sumIm += im;
  }
  let phase = atan2(sumIm, sumRe) + 3.14159265;
  return vec3f(prob, phase, 0.0);
}

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

  // Convert to lattice coordinates with trilinear interpolation
  var coordsLo: array<u32, 12>;
  var coordsHi: array<u32, 12>;
  var fracs: array<f32, 12>;

  let inBounds = worldToLatticeInterp(&ndWorldPos, &coordsLo, &coordsHi, &fracs);
  if (!inBounds) {
    textureStore(outputTex, gid, vec4f(0.0));
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

  // Trilinear interpolation of probability density and phase
  var blendedProb: f32 = 0.0;
  var blendedPhase: f32 = 0.0;
  var totalWeight: f32 = 0.0;

  for (var corner: u32 = 0u; corner < numCorners; corner++) {
    let w = cornerWeight(&fracs, corner);
    if (w > 0.0) {
      let sIdx = siteIndexForCorner(&coordsLo, &coordsHi, corner);
      let coinData = sumCoinStates(sIdx);
      blendedProb += w * coinData.x;
      blendedPhase += w * coinData.y;
      totalWeight += w;
    }
  }

  if (totalWeight > 0.0) {
    blendedPhase /= totalWeight;
  }

  // Track peak probability for next-frame normalization.
  // IEEE 754 positive floats compare correctly as unsigned integers,
  // so bitcast to u32 for atomicMax.
  let rawProb = blendedProb * perpFalloff;
  atomicMax(&maxDensityAtomic, bitcast<u32>(rawProb));

  let maxD = max(params.maxDensity, 1e-20);
  let normDensity = clamp(rawProb / maxD, 0.0, 1.0);
  let logDensity = log(normDensity + 1e-10);

  textureStore(outputTex, gid, vec4f(normDensity, logDensity, blendedPhase, normDensity));
}
`
