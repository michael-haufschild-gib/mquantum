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
 *   R: displayScalar          (field-view-dependent: probability, phase, chirality, or entropy)
 *   G: log(R + ε)             (log-density for Beer-Lambert)
 *   B: arg(Σ_j c_j)           (phase of summed coin amplitude) [0, 2π]
 *   A: raw |ψ|²/max * falloff (always density — used by quantum carpet readback)
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
  fieldView: u32,            // offset 12 (0=probability, 1=phase, 2=coinState, 3=coinEntropy)

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
// QWWriteGridUniforms binds as storage because the struct embeds scalar arrays
// (array<u32/f32, 12>) with 4-byte stride — spec-forbidden in uniform address
// space. Chrome/Tint accepts it; naga rejects.
@group(0) @binding(0) var<storage, read> params: QWWriteGridUniforms;
// vec2f view of the [re,im] interleaved coin buffer (matches sibling QW
// shaders). One vec2 load replaces two scalar loads per amplitude.
@group(0) @binding(1) var<storage, read> coinState: array<vec2f>;
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

// Per-site coin state data — raw (unnormalized) for correct trilinear blending.
struct CoinSiteData {
  prob: f32,      // total probability Σ_j |c_j|²
  sumRe: f32,     // Σ_j Re(c_j) — for phase via atan2 after blending
  sumIm: f32,     // Σ_j Im(c_j) — for phase via atan2 after blending
  chirality: f32, // Σ_d (|c_{+d}|² - |c_{-d}|²) — raw, normalize by prob after blending
}

// Sum raw coin state quantities at a single lattice site.
// Coin state layout: j=2d → +axis_d, j=2d+1 → -axis_d; each j is one vec2f.
fn sumCoinStates(site: u32) -> CoinSiteData {
  // vec2f view: per-site stride is numCoinStates (was numCoinStates * 2 in f32 units).
  let baseIdx = site * params.numCoinStates;
  var data: CoinSiteData;
  let ldim = params.latticeDim;
  for (var d: u32 = 0u; d < ldim; d = d + 1u) {
    // Each axis uses 2 consecutive vec2 slots: [+, -]. (Was 4 f32 slots.)
    let b = baseIdx + (d << 1u);
    let zPlus = coinState[b];
    let zMinus = coinState[b + 1u];
    let pPlus = dot(zPlus, zPlus);
    let pMinus = dot(zMinus, zMinus);
    data.prob += pPlus + pMinus;
    data.sumRe += zPlus.x + zMinus.x;
    data.sumIm += zPlus.y + zMinus.y;
    data.chirality += pPlus - pMinus;
  }
  return data;
}

fn coinProbabilityAt(site: u32, coinIdx: u32) -> f32 {
  let z = coinState[site * params.numCoinStates + coinIdx];
  return dot(z, z);
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

  // Map texture voxel to model-space position [-bound, +bound]^3.
  // PERF: fold per-axis divides into one hoisted vec3 reciprocal + fma.
  let gridToModel = (2.0 * bound) / vec3f(texDims);
  let modelPos = fma(vec3f(gid) + 0.5, gridToModel, vec3f(-bound));

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
    let invTwoPerpSigma2 = 1.0 / (2.0 * perpSigma * perpSigma);
    perpFalloff = exp(-perpDist2 * invTwoPerpSigma2);
  }

  let numCorners = 1u << min(params.latticeDim, 3u);

  // Trilinear interpolation of raw coin state quantities.
  // Blend raw Re/Im (not atan2 angles) to avoid wrapping artifacts near 0/2π.
  // Blend raw chirality (not normalized) so high-density corners dominate correctly.
  var blendedProb: f32 = 0.0;
  var blendedRe: f32 = 0.0;
  var blendedIm: f32 = 0.0;
  var blendedChirality: f32 = 0.0;

  for (var corner: u32 = 0u; corner < numCorners; corner++) {
    let w = cornerWeight(&fracs, corner);
    if (w > 0.0) {
      let sIdx = siteIndexForCorner(&coordsLo, &coordsHi, corner);
      let coinData = sumCoinStates(sIdx);
      blendedProb += w * coinData.prob;
      blendedRe += w * coinData.sumRe;
      blendedIm += w * coinData.sumIm;
      blendedChirality += w * coinData.chirality;
    }
  }

  // Compute phase from blended complex amplitude (correct across 0/2π boundary)
  const QW_WG_PI: f32 = 3.14159265358979323846;
  const QW_WG_INV_TAU: f32 = 0.15915494309189535;
  let phase = atan2(blendedIm, blendedRe) + QW_WG_PI;
  // Normalize chirality by blended probability (correct density-weighted average)
  let chirality = select(blendedChirality / max(blendedProb, 1e-20), 0.0, blendedProb < 1e-30);

  var coinEntropy: f32 = 0.0;
  if (params.fieldView == 3u && blendedProb >= 1e-30) {
    let invBlendedProb = 1.0 / blendedProb;
    var entropySum: f32 = 0.0;
    for (var coinIdx: u32 = 0u; coinIdx < params.numCoinStates; coinIdx++) {
      var blendedCoinProb: f32 = 0.0;
      for (var corner: u32 = 0u; corner < numCorners; corner++) {
        let w = cornerWeight(&fracs, corner);
        if (w > 0.0) {
          let sIdx = siteIndexForCorner(&coordsLo, &coordsHi, corner);
          blendedCoinProb += w * coinProbabilityAt(sIdx, coinIdx);
        }
      }
      let q = blendedCoinProb * invBlendedProb;
      entropySum += -q * log(max(q, 1e-20));
    }
    let coinEntropyDenom = max(log(max(f32(params.numCoinStates), 2.0)), 1e-6);
    coinEntropy = clamp(entropySum / coinEntropyDenom, 0.0, 1.0);
  }

  // Track peak raw probability for next-frame normalization.
  // Use raw blendedProb (without perpFalloff) so normalization reflects actual
  // wavefunction amplitudes. perpFalloff is a visual effect applied at output only.
  // IEEE 754 positive floats compare correctly as unsigned integers,
  // so bitcast to u32 for atomicMax.
  atomicMax(&maxDensityAtomic, bitcast<u32>(blendedProb));

  let maxD = max(params.maxDensity, 1e-20);
  let normDensityRaw = clamp(blendedProb / maxD, 0.0, 1.0);
  let densityGate = smoothstep(0.0, 0.02, normDensityRaw);

  // Field view branching — select displayScalar per visualization mode
  var displayScalar: f32 = 0.0;
  if (params.fieldView == 0u) {
    // Probability: normalized |ψ|²
    displayScalar = normDensityRaw;
  } else if (params.fieldView == 1u) {
    // Phase: complex phase of summed coin amplitude, gated by density
    displayScalar = phase * QW_WG_INV_TAU * densityGate;
  } else if (params.fieldView == 2u) {
    // Coin state: chirality (net forward-backward bias), mapped to [0,1]
    displayScalar = (0.5 + 0.5 * chirality) * densityGate;
  } else if (params.fieldView == 3u) {
    // Coin entropy: normalized local Shannon spread across ±axis coin states
    displayScalar = coinEntropy * densityGate;
  }

  let normDensity = displayScalar * perpFalloff;
  let logDensity = log(normDensity + 1e-10);

  textureStore(outputTex, gid, vec4f(normDensity, logDensity, phase, normDensityRaw * perpFalloff));
}
`
