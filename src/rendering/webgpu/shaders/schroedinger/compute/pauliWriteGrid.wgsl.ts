/**
 * Pauli — Write to 3D Density Grid Compute Shader
 *
 * Writes the N-D Pauli spinor field into a 3D density texture (rgba16float)
 * for raymarching. Maps each texture voxel to a physical position via the
 * basis vectors, then trilinearly interpolates the spinor density.
 *
 * Component layout: spinorRe/Im[c * totalSites + siteIdx], c ∈ {0=up, 1=down}.
 *
 * Field view modes (fieldView):
 *   0 spinDensity:     R = |ψ_up|², G = |ψ_down|², B = phase, A = total
 *                        Aligns with Dirac dual-channel convention (algo 23/24)
 *   1 totalDensity:    R = total, G = log(total), B = phase, A = total
 *   2 spinExpectation: R = spin-up fraction * density, G = spin-down fraction * density
 *                        R+G = total density always; σ_z = (R-G)/(R+G) reconstructed by color algo
 *   3 coherence:       R = |ψ_up* ψ_down|, G = log(coh), B = phase, A = coherence
 *
 * Output texture channels (rgba16float):
 *   R: primary display scalar
 *   G: secondary scalar (spin-down density, log-density, or σ_z⁻)
 *   B: phase of spin-up component arg(ψ_up) in [0, 2π]
 *   A: total density (used for opacity/skip in raymarcher)
 *
 * Uses trilinear interpolation over the 3 visible lattice dimensions
 * (dims 4+ are nearest-neighbour at their respective slicePositions).
 *
 * Requires pauliUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(4, 4, 4)
 * @module
 */

export const pauliWriteGridBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: PauliUniforms;
@group(0) @binding(1) var<storage, read> spinorRe: array<f32>;
@group(0) @binding(2) var<storage, read> spinorIm: array<f32>;
@group(0) @binding(3) var densityGrid: texture_storage_3d<rgba16float, write>;

// Spin-up density |ψ_up|² at a lattice site
fn upDensityAt(siteIdx: u32, T: u32) -> f32 {
  let re = spinorRe[siteIdx];
  let im = spinorIm[siteIdx];
  return re * re + im * im;
}

// Spin-down density |ψ_down|² at a lattice site
fn downDensityAt(siteIdx: u32, T: u32) -> f32 {
  let re = spinorRe[T + siteIdx];
  let im = spinorIm[T + siteIdx];
  return re * re + im * im;
}

// Total density (|ψ_up|² + |ψ_down|²) at a lattice site
fn totalDensityAt(siteIdx: u32, T: u32) -> f32 {
  return upDensityAt(siteIdx, T) + downDensityAt(siteIdx, T);
}

// Map N-D world position to lattice coordinates for trilinear interpolation.
// Dims 0..min(latticeDim,3)-1 use trilinear (lo/hi + frac).
// Dims >= 3 use nearest-neighbour (slice-fixed).
// Returns false if position is out of lattice bounds.
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

// Build a linear site index for a trilinear corner (corner bit d = use hi[d])
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

// Trilinear weight for a corner from fractional coordinates
fn cornerWeight(fracs: ptr<function, array<f32, 12>>, corner: u32) -> f32 {
  var w: f32 = 1.0;
  let interpDims = min(params.latticeDim, 3u);
  for (var d: u32 = 0u; d < interpDims; d++) {
    if ((corner & (1u << d)) != 0u) {
      w *= (*fracs)[d];
    } else {
      w *= 1.0 - (*fracs)[d];
    }
  }
  return w;
}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let texDims = textureDimensions(densityGrid);
  if (gid.x >= texDims.x || gid.y >= texDims.y || gid.z >= texDims.z) {
    return;
  }

  let bound = params.boundingRadius;
  if (bound <= 0.0) {
    textureStore(densityGrid, gid, vec4f(0.0));
    return;
  }

  // Map voxel to model-space position [-bound, +bound]³
  let modelPos = vec3f(
    (f32(gid.x) + 0.5) / f32(texDims.x) * 2.0 * bound - bound,
    (f32(gid.y) + 0.5) / f32(texDims.y) * 2.0 * bound - bound,
    (f32(gid.z) + 0.5) / f32(texDims.z) * 2.0 * bound - bound
  );

  // Project into N-D lattice space via basis vectors (dims 0-2)
  // and slice positions (dims 3+)
  var ndWorldPos: array<f32, 12>;
  if (params.latticeDim > 0u) {
    ndWorldPos[0u] = modelPos.x * params.basisXx + modelPos.y * params.basisYx + modelPos.z * params.basisZx;
  }
  if (params.latticeDim > 1u) {
    ndWorldPos[1u] = modelPos.x * params.basisXy + modelPos.y * params.basisYy + modelPos.z * params.basisZy;
  }
  if (params.latticeDim > 2u) {
    ndWorldPos[2u] = modelPos.x * params.basisXz + modelPos.y * params.basisYz + modelPos.z * params.basisZz;
  }
  for (var d: u32 = 3u; d < params.latticeDim; d++) {
    ndWorldPos[d] = params.slicePositions[d];
  }

  var coordsLo: array<u32, 12>;
  var coordsHi: array<u32, 12>;
  var fracs: array<f32, 12>;

  let inBounds = worldToLatticeInterp(&ndWorldPos, &coordsLo, &coordsHi, &fracs);
  if (!inBounds) {
    textureStore(densityGrid, gid, vec4f(0.0));
    return;
  }

  // Perpendicular falloff for low-dimensional lattices
  var perpFalloff: f32 = 1.0;
  if (params.latticeDim < 3u) {
    var projSq: f32 = 0.0;
    if (params.latticeDim > 0u) {
      let v0 = vec3f(params.basisXx, params.basisYx, params.basisZx);
      let p0 = dot(modelPos, v0);
      projSq += p0 * p0;
    }
    if (params.latticeDim > 1u) {
      let v1 = vec3f(params.basisXy, params.basisYy, params.basisZy);
      let p1 = dot(modelPos, v1);
      projSq += p1 * p1;
    }
    let perpDist2 = max(dot(modelPos, modelPos) - projSq, 0.0);
    let perpSigma = bound * 0.06;
    perpFalloff = exp(-perpDist2 / (2.0 * perpSigma * perpSigma));
  }

  let T = params.totalSites;
  let numCorners = 1u << min(params.latticeDim, 3u);

  // Nearest-neighbour site for phase and coherence queries
  var nnCoords: array<u32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let halfExtent = f32(params.gridSize[d]) * params.spacing[d] * 0.5;
    let coordF = (ndWorldPos[d] + halfExtent) / params.spacing[d] - 0.5;
    nnCoords[d] = u32(clamp(i32(round(coordF)), 0, i32(params.gridSize[d]) - 1));
  }
  let nnSite = ndToLinear(nnCoords, params.strides, params.latticeDim);

  // Phase of spin-up component (NN, not interpolated)
  let re0nn = spinorRe[nnSite];
  let im0nn = spinorIm[nnSite];
  let phase = atan2(im0nn, re0nn) + 3.14159265;

  // Density scale: when autoScale is on, normalize by GPU-computed maxDensity;
  // when off, use a fixed scale of 1.0 so raw density values are displayed.
  let scale = select(
    1.0,
    select(params.densityScale, 1.0, params.densityScale <= 0.0),
    params.autoScale != 0u
  );

  var outR: f32 = 0.0;
  var outG: f32 = 0.0;
  var outB: f32 = phase;
  var outA: f32 = 0.0;

  if (params.fieldView == 0u) {
    // spinDensity: R = |ψ_up|², G = |ψ_down|², B = phase, A = total
    // Aligned with Dirac dual-channel convention for raymarcher reuse
    var blendUp: f32 = 0.0;
    var blendDown: f32 = 0.0;
    for (var corner: u32 = 0u; corner < numCorners; corner++) {
      let w = cornerWeight(&fracs, corner);
      if (w > 0.0) {
        let sIdx = siteIndexForCorner(&coordsLo, &coordsHi, corner);
        blendUp += w * upDensityAt(sIdx, T);
        blendDown += w * downDensityAt(sIdx, T);
      }
    }
    let upNorm = clamp(blendUp / scale * perpFalloff, 0.0, 1.0);
    let downNorm = clamp(blendDown / scale * perpFalloff, 0.0, 1.0);
    outR = upNorm;
    outG = downNorm;
    outA = upNorm + downNorm;

  } else if (params.fieldView == 1u) {
    // totalDensity: R = total, G = log(total), B = phase, A = total
    // Standard single-density path — compatible with all existing color algorithms
    var blendTotal: f32 = 0.0;
    for (var corner: u32 = 0u; corner < numCorners; corner++) {
      let w = cornerWeight(&fracs, corner);
      if (w > 0.0) {
        let sIdx = siteIndexForCorner(&coordsLo, &coordsHi, corner);
        blendTotal += w * totalDensityAt(sIdx, T);
      }
    }
    let norm = clamp(blendTotal / scale * perpFalloff, 0.0, 1.0);
    outR = norm;
    outG = log(norm + 1e-10);
    outA = norm;

  } else if (params.fieldView == 2u) {
    // spinExpectation: R = spin-up fraction * density, G = spin-down fraction * density
    // B = phase, A = total. R+G = totalNorm always, so raymarcher sees correct opacity.
    // Color algo reconstructs σ_z = (R-G)/(R+G) for diverging blue/red mapping.
    var blendUp: f32 = 0.0;
    var blendDown: f32 = 0.0;
    for (var corner: u32 = 0u; corner < numCorners; corner++) {
      let w = cornerWeight(&fracs, corner);
      if (w > 0.0) {
        let sIdx = siteIndexForCorner(&coordsLo, &coordsHi, corner);
        blendUp += w * upDensityAt(sIdx, T);
        blendDown += w * downDensityAt(sIdx, T);
      }
    }
    let total = blendUp + blendDown;
    let upFrac = select(blendUp / total, 0.5, total < 1e-20);
    let downFrac = select(blendDown / total, 0.5, total < 1e-20);
    let totalNorm = clamp(total / scale * perpFalloff, 0.0, 1.0);
    outR = upFrac * totalNorm;
    outG = downFrac * totalNorm;
    outA = totalNorm;

  } else if (params.fieldView == 3u) {
    // coherence: R = |ψ_up* ψ_down|, G = log(coh), B = phase, A = coherence
    // Trilinear interpolation of coherence magnitude at each corner
    var blendCoh: f32 = 0.0;
    for (var corner: u32 = 0u; corner < numCorners; corner++) {
      let w = cornerWeight(&fracs, corner);
      if (w > 0.0) {
        let sIdx = siteIndexForCorner(&coordsLo, &coordsHi, corner);
        let re0c = spinorRe[sIdx];
        let im0c = spinorIm[sIdx];
        let re1c = spinorRe[T + sIdx];
        let im1c = spinorIm[T + sIdx];
        let cohReC = re0c * re1c + im0c * im1c;
        let cohImC = re0c * im1c - im0c * re1c;
        blendCoh += w * sqrt(cohReC * cohReC + cohImC * cohImC);
      }
    }
    let cohNorm = clamp(blendCoh / scale * perpFalloff, 0.0, 1.0);
    outR = cohNorm;
    outG = log(cohNorm + 1e-10);
    outA = cohNorm;
  }

  // Potential overlay: blend a translucent potential contour into the B channel
  // when showPotential is enabled. Encodes V(x) as a brightness additive on the
  // blue channel, which the raymarcher treats as phase — potential regions appear
  // as a distinct phase-colored shell overlaid on the spinor density.
  if (params.showPotential != 0u && params.potentialType != 0u) {
    // Compute V(x) at this voxel position (same formulas as pauliPotentialHalf)
    var V: f32 = 0.0;
    if (params.potentialType == 1u) {
      // Harmonic trap: V = ½ m ω² |x|²
      var r2pot: f32 = 0.0;
      for (var d: u32 = 0u; d < params.latticeDim; d++) {
        r2pot += ndWorldPos[d] * ndWorldPos[d];
      }
      V = 0.5 * params.mass * params.harmonicOmega * params.harmonicOmega * r2pot;
    } else if (params.potentialType == 2u) {
      // Barrier along first dimension
      let x0 = ndWorldPos[0u];
      let halfW = params.wellWidth * 0.5;
      if (x0 > -halfW && x0 < halfW) {
        V = params.wellDepth;
      }
    } else if (params.potentialType == 3u) {
      // Double well: V = D (1 - exp(-|x|²/W²))
      var r2pot: f32 = 0.0;
      for (var d: u32 = 0u; d < params.latticeDim; d++) {
        r2pot += ndWorldPos[d] * ndWorldPos[d];
      }
      let W2 = params.wellWidth * params.wellWidth;
      V = params.wellDepth * (1.0 - exp(-r2pot / W2));
    }
    // Normalize to [0, 1] using wellDepth or harmonicOmega as characteristic scale
    let vMax = max(params.wellDepth, 0.5 * params.mass * params.harmonicOmega * params.harmonicOmega * params.boundingRadius * params.boundingRadius);
    let vNorm = clamp(V / max(vMax, 1e-10), 0.0, 1.0);
    // Add potential as a faint additive to density so it's visible even where ψ ≈ 0
    let potOverlay = vNorm * 0.15 * perpFalloff;
    outA = max(outA, potOverlay);
    // Shift the B channel (phase) to tint potential regions distinctly
    outB = outB + vNorm * 1.5;
  }

  textureStore(densityGrid, gid, vec4f(outR, outG, outB, outA));
}
`
