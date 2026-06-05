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
  fieldView: u32,            // offset 12 (0=probability, 1=phase, 2=coinState, 3=coinEntropy, 4=causalCurvature, 5=ctcFractalCarpet)

  // Per-dimension arrays (48 bytes each)
  gridSize: array<u32, 12>,  // offset 16
  strides: array<u32, 12>,   // offset 64
  spacing: array<f32, 12>,   // offset 112

  // Rendering parameters (16 bytes)
  boundingRadius: f32,       // offset 160
  maxDensity: f32,           // offset 164
  walkSteps: u32,            // offset 168
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

fn coinAxisCurrentAt(site: u32, axis: u32) -> f32 {
  let baseIdx = site * params.numCoinStates + (axis << 1u);
  let zPlus = coinState[baseIdx];
  let zMinus = coinState[baseIdx + 1u];
  return dot(zPlus, zPlus) - dot(zMinus, zMinus);
}

fn nearestLatticeCoords(
  coordsLo: ptr<function, array<u32, 12>>,
  coordsHi: ptr<function, array<u32, 12>>,
  fracs: ptr<function, array<f32, 12>>
) -> array<u32, 12> {
  var coords: array<u32, 12>;
  let interpDims = min(params.latticeDim, 3u);
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    if (d < interpDims && (*fracs)[d] >= 0.5) {
      coords[d] = (*coordsHi)[d];
    } else {
      coords[d] = (*coordsLo)[d];
    }
  }
  return coords;
}

fn offsetSiteClamped(coords: ptr<function, array<u32, 12>>, axis: u32, delta: i32) -> u32 {
  var shifted: array<u32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    shifted[d] = (*coords)[d];
  }
  let maxCoord = i32(params.gridSize[axis]) - 1;
  shifted[axis] = u32(clamp(i32((*coords)[axis]) + delta, 0, maxCoord));
  return ndToLinear(shifted, params.strides, params.latticeDim);
}

fn causalExpansionAt(coords: ptr<function, array<u32, 12>>) -> f32 {
  var theta: f32 = 0.0;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let plusSite = offsetSiteClamped(coords, d, 1);
    let minusSite = offsetSiteClamped(coords, d, -1);
    let centeredCurrentDiff = coinAxisCurrentAt(plusSite, d) - coinAxisCurrentAt(minusSite, d);
    theta += centeredCurrentDiff / (2.0 * max(params.spacing[d], 1e-12));
  }
  return theta;
}

fn causalCurvature(coords: ptr<function, array<u32, 12>>, rho: f32) -> f32 {
  let theta = causalExpansionAt(coords);
  return 1.0 - exp(-abs(theta / max(rho, 1e-20)));
}

fn normalizedVisibleCoord(coords: ptr<function, array<u32, 12>>, axis: u32) -> f32 {
  if (axis >= params.latticeDim) {
    return 0.0;
  }
  let grid = max(params.gridSize[axis], 2u);
  let coord = clamp((*coords)[axis], 0u, grid - 1u);
  return (f32(coord) / f32(grid - 1u)) * 2.0 - 1.0;
}

fn ctcLoopDistance01(value: f32) -> f32 {
  let f = fract(value);
  return min(f, 1.0 - f);
}

fn ctcFractalCarpet(coords: ptr<function, array<u32, 12>>, rho: f32, phase01: f32, chirality: f32) -> f32 {
  if (rho <= 0.0) {
    return 0.0;
  }

  const CTC_PERIOD: u32 = 512u;
  let stepPhase = f32(params.walkSteps % CTC_PERIOD) / f32(CTC_PERIOD);
  let phaseStep = phase01 * 0.35 + stepPhase * 0.18;
  let chi = clamp(chirality, -1.0, 1.0);

  var q = vec3f(
    normalizedVisibleCoord(coords, 0u),
    normalizedVisibleCoord(coords, 1u),
    normalizedVisibleCoord(coords, 2u)
  );
  var closure: f32 = 0.0;

  for (var i: u32 = 0u; i < 6u; i++) {
    let iter = f32(i + 1u);
    let scale = vec3f(1.72 + 0.11 * iter, 2.03 + 0.09 * iter, 2.37 + 0.07 * iter);
    let offsets = vec3f(0.137 * iter + chi * 0.083, 0.311 * iter - chi * 0.047, 0.571 * iter + chi * 0.061);
    q = abs(fract(q * scale + offsets + vec3f(phaseStep)) * 2.0 - vec3f(1.0));

    let radial = length(q - vec3f(0.5));
    let shell = 0.48 + 0.14 * cos(6.283185307179586 * (phaseStep * 0.5 + iter * 0.137));
    let shellScore = 1.0 - smoothstep(0.014, 0.065, abs(radial - shell));

    let winding = q.x - q.y + 0.5 * q.z;
    let phaseScore = 1.0 - smoothstep(0.02, 0.18, ctcLoopDistance01(winding + phaseStep));
    let chiralityScore = 1.0 - smoothstep(0.08, 0.65, abs(chi - clamp(winding, -1.0, 1.0)));
    let threadScore = 1.0 - smoothstep(0.008, 0.055, min(abs(q.x - q.y), abs(q.y - q.z)));

    closure = max(closure, shellScore * (0.18 + 0.82 * phaseScore) * (0.35 + 0.65 * chiralityScore));
    closure = max(closure, threadScore * phaseScore * (0.28 + 0.72 * chiralityScore));
  }

  let rhoClamped = clamp(rho, 0.0, 1.0);
  let densityEnvelope = pow(rhoClamped, 0.72) * smoothstep(0.018, 0.16, rhoClamped);
  return clamp(densityEnvelope * closure * 7.0, 0.0, 1.0);
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
  } else if (params.fieldView == 4u) {
    // Ricci theta: Raychaudhuri-like focusing magnitude from coin current expansion
    var nnCoords = nearestLatticeCoords(&coordsLo, &coordsHi, &fracs);
    let nnSite = ndToLinear(nnCoords, params.strides, params.latticeDim);
    let localRho = sumCoinStates(nnSite).prob;
    let causalCurvatureValue = causalCurvature(&nnCoords, localRho);
    displayScalar = causalCurvatureValue * densityGate;
  } else if (params.fieldView == 5u) {
    // CTC fractal carpet: folded return-map closure bands over density and phase
    var nnCoords = nearestLatticeCoords(&coordsLo, &coordsHi, &fracs);
    let rhoWithFalloff = clamp(normDensityRaw * perpFalloff, 0.0, 1.0);
    displayScalar = ctcFractalCarpet(&nnCoords, rhoWithFalloff, phase * QW_WG_INV_TAU, chirality);
  }

  let normDensity = select(displayScalar * perpFalloff, displayScalar, params.fieldView == 5u);
  let logDensity = log(normDensity + 1e-10);

  textureStore(outputTex, gid, vec4f(normDensity, logDensity, phase, normDensityRaw * perpFalloff));
}
`
