/**
 * TDSE — Write to 3D Density Grid Compute Shader
 *
 * Writes the N-D TDSE wavefunction data into a 3D density texture for raymarching.
 * Same contract as freeScalarWriteGrid: basis-rotated slicing, model-space output.
 *
 * Uses trilinear interpolation across the 3 visible lattice dimensions for smooth
 * density output. Dims 4+ use nearest-neighbor (slice-fixed). Derivative-based
 * field views (current, velocity, healing length) use nearest-neighbor.
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

// Compute the appropriate normalization scale for the active potential type.
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
  }
  return 1.0;
}

// Convert N-D world position to lattice coordinates with trilinear interpolation.
// Returns false if out of bounds. For visible dims (< min(latticeDim,3)): lo/hi/frac.
// For slice dims (>= 3): nearest-neighbor (lo=hi, frac=0).
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

  // Convert to lattice coordinates with trilinear interpolation support
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

  // Nearest-neighbor coords for derivative-based and potential field views
  var nnCoords: array<u32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let halfExtent = f32(params.gridSize[d]) * params.spacing[d] * 0.5;
    let coordF = (ndWorldPos[d] + halfExtent) / params.spacing[d] - 0.5;
    nnCoords[d] = u32(clamp(i32(round(coordF)), 0, i32(params.gridSize[d]) - 1));
  }
  let nnIdx = ndToLinear(nnCoords, params.strides, params.latticeDim);

  // Determine if we use trilinear or NN for this field view
  // Trilinear: density (0), phase (1)
  // NN: current (2), potential (3), velocity (4), healing (5)
  let useTrilinear = params.fieldView <= 1u;

  var re: f32;
  var im: f32;
  var density: f32;
  var phase: f32;
  var idx: u32;

  if (useTrilinear) {
    // Trilinear interpolation of density (and re/im for phase)
    var blendedDensity: f32 = 0.0;
    var blendedRe: f32 = 0.0;
    var blendedIm: f32 = 0.0;
    for (var corner: u32 = 0u; corner < numCorners; corner++) {
      let w = cornerWeight(&fracs, corner);
      if (w > 0.0) {
        let sIdx = siteIndexForCorner(&coordsLo, &coordsHi, corner);
        let cRe = psiRe[sIdx];
        let cIm = psiIm[sIdx];
        blendedDensity += w * (cRe * cRe + cIm * cIm);
        blendedRe += w * cRe;
        blendedIm += w * cIm;
      }
    }
    re = blendedRe;
    im = blendedIm;
    density = blendedDensity;
    phase = atan2(blendedIm, blendedRe) + 3.14159265;
    idx = nnIdx; // for potential overlay
  } else {
    idx = nnIdx;
    re = psiRe[idx];
    im = psiIm[idx];
    density = re * re + im * im;
    phase = atan2(im, re) + 3.14159265;
  }

  let potentialVal = potential[idx];

  let normDensityRaw = select(density / params.maxDensity, 0.0, params.maxDensity <= 0.0);
  let densityGate = smoothstep(0.0, 0.02, normDensityRaw);

  var displayScalar: f32 = 0.0;
  if (params.fieldView == 0u) {
    displayScalar = normDensityRaw;
  } else if (params.fieldView == 1u) {
    displayScalar = phase / (2.0 * 3.14159265) * densityGate;
  } else if (params.fieldView == 2u) {
    // current magnitude via central differences (NN)
    var currentMagSq: f32 = 0.0;
    let hbarOverM = params.hbar / max(params.mass, 1e-6);
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      if (params.gridSize[d] <= 1u) {
        continue;
      }
      let stride = params.strides[d];
      let coord = nnCoords[d];
      let fwdIdx = select(idx + stride, idx - stride * (params.gridSize[d] - 1u), coord == params.gridSize[d] - 1u);
      let bwdIdx = select(idx - stride, idx + stride * (params.gridSize[d] - 1u), coord == 0u);
      let invDx = 0.5 / params.spacing[d];
      let dRe = (psiRe[fwdIdx] - psiRe[bwdIdx]) * invDx;
      let dIm = (psiIm[fwdIdx] - psiIm[bwdIdx]) * invDx;
      let jd = hbarOverM * (re * dIm - im * dRe);
      currentMagSq += jd * jd;
    }
    displayScalar = (1.0 - exp(-sqrt(currentMagSq))) * densityGate;
  } else if (params.fieldView == 4u) {
    // superfluid velocity magnitude (NN)
    let hbarOverM = params.hbar / max(params.mass, 1e-6);
    var vsqMag: f32 = 0.0;
    let densitySafe = max(density, 1e-20);
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      if (params.gridSize[d] <= 1u) { continue; }
      let stride = params.strides[d];
      let coord = nnCoords[d];
      let fwdIdx = select(idx + stride, idx - stride * (params.gridSize[d] - 1u), coord == params.gridSize[d] - 1u);
      let bwdIdx = select(idx - stride, idx + stride * (params.gridSize[d] - 1u), coord == 0u);
      let invDx = 0.5 / params.spacing[d];
      let dRe = (psiRe[fwdIdx] - psiRe[bwdIdx]) * invDx;
      let dIm = (psiIm[fwdIdx] - psiIm[bwdIdx]) * invDx;
      let jd = hbarOverM * (re * dIm - im * dRe);
      let vsd = jd / densitySafe;
      vsqMag += vsd * vsd;
    }
    let cs2Peak = max(abs(params.interactionStrength) * params.maxDensity / max(params.mass, 1e-6), 1e-10);
    displayScalar = clamp(sqrt(vsqMag / cs2Peak), 0.0, 1.0) * densityGate;
  } else if (params.fieldView == 5u) {
    // healing length (NN)
    let absG = max(abs(params.interactionStrength), 1e-10);
    let denom = 2.0 * params.mass * absG * max(density, 1e-20);
    let xi = params.hbar / sqrt(denom);
    let xiRef = params.hbar / sqrt(2.0 * params.mass * absG * max(params.maxDensity, 1e-10));
    displayScalar = clamp(xiRef / max(xi, 1e-10), 0.0, 1.0) * densityGate;
  } else if (params.fieldView == 3u) {
    // potential (NN)
    let potentialScale = getPotentialScale();
    let normPot = clamp(potentialVal / potentialScale, -1.0, 1.0);
    let potGate = smoothstep(0.0, 0.5, 1.0 - abs(potentialVal) / (potentialScale * 3.0));
    displayScalar = (0.5 + 0.5 * normPot) * max(densityGate, potGate);
  } else {
    displayScalar = 0.0;
  }

  let normDensity = clamp(displayScalar * perpFalloff, 0.0, 1.0);
  let logDensity = log(normDensity + 1e-10);

  // Potential overlay
  var potOverlay: f32 = 0.0;
  if (params.showPotential == 1u && params.fieldView != 3u) {
    let potentialScale = getPotentialScale();
    let normPot = abs(potentialVal) / potentialScale;
    let fadeout = 1.0 - smoothstep(1.5, 3.0, normPot);
    var overlayGain: f32 = 1.0;
    if (params.potentialType == 4u || params.potentialType == 8u || params.potentialType == 9u) {
      overlayGain = 0.03;
    }
    potOverlay = clamp(normPot, 0.0, 1.0) * fadeout * overlayGain * perpFalloff;
  }

  textureStore(outputTex, gid, vec4f(normDensity, logDensity, phase, potOverlay));
}
`
