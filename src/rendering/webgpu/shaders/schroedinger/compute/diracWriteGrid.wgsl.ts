/**
 * Dirac — Write to 3D Density Grid Compute Shader
 *
 * Writes the N-D Dirac spinor field data into a 3D density texture for raymarching.
 * Same spatial mapping as tdseWriteGrid: basis-rotated slicing, model-space output.
 *
 * Uses trilinear interpolation across the 3 visible lattice dimensions for smooth
 * density output. Dims 4+ use nearest-neighbor (slice-fixed). Complex field views
 * (spin, current) use nearest-neighbor to avoid 8x gamma matrix work.
 *
 * Field view modes:
 *   0: totalDensity           — ρ = Σ_c |ψ_c|²
 *   1: particleDensity        — Σ_{c < S/2} |ψ_c|² (upper spinor)
 *   2: antiparticleDensity    — Σ_{c ≥ S/2} |ψ_c|² (lower spinor)
 *   3: particleAntiparticleSplit — R = particle, G = antiparticle (dual-channel)
 *   4: spinDensity            — |s| = √(Σ_k |ψ†Σ_k ψ|²) (S=2: Σ=α; S≥4 3D: Σ_k=-i·α_i·α_j cyclic)
 *   5: currentDensity         — |j| = c·√(Σ_k |ψ†α_k ψ|²)
 *   6: phase                  — arg(ψ₀) (phase of dominant component)
 *
 * Output encoding (rgba16float):
 *   R: display scalar (normalized density or selected observable)
 *   G: log-density for log-scale rendering
 *   B: phase angle of dominant component [0, 2π]
 *   A: potential overlay (when showPotential enabled)
 *
 * Requires diracUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(4, 4, 4)
 * @module
 */

export const diracWriteGridBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: DiracUniforms;
@group(0) @binding(1) var<storage, read> spinorRe: array<f32>;
@group(0) @binding(2) var<storage, read> spinorIm: array<f32>;
@group(0) @binding(3) var<storage, read> potential: array<f32>;
@group(0) @binding(4) var<storage, read> gammaMatrices: array<f32>;
@group(0) @binding(5) var outputTex: texture_storage_3d<rgba16float, write>;

// Access gamma matrix element using precomputed base offset for the matrix.
// Caller should compute matBase = matIdx * S * S * 2u once per matrix.
fn gammaReAtBase(matBase: u32, row: u32, col: u32, S: u32) -> f32 {
  return gammaMatrices[matBase + row * S * 2u + col * 2u];
}

fn gammaImAtBase(matBase: u32, row: u32, col: u32, S: u32) -> f32 {
  return gammaMatrices[matBase + row * S * 2u + col * 2u + 1u];
}

// Compute total spinor density Σ_c |ψ_c|² at a given site
fn totalDensityAt(siteIdx: u32, S: u32, T: u32) -> f32 {
  var density: f32 = 0.0;
  for (var c: u32 = 0u; c < S; c++) {
    let bufIdx = c * T + siteIdx;
    let re = spinorRe[bufIdx];
    let im = spinorIm[bufIdx];
    density += re * re + im * im;
  }
  return density;
}

// Compute upper-spinor density Σ_{c<S/2} |ψ_c|² at a given site
fn upperDensityAt(siteIdx: u32, S: u32, T: u32) -> f32 {
  let half = S / 2u;
  var density: f32 = 0.0;
  for (var c: u32 = 0u; c < half; c++) {
    let bufIdx = c * T + siteIdx;
    let re = spinorRe[bufIdx];
    let im = spinorIm[bufIdx];
    density += re * re + im * im;
  }
  return density;
}

// Compute lower-spinor density Σ_{c>=S/2} |ψ_c|² at a given site
fn lowerDensityAt(siteIdx: u32, S: u32, T: u32) -> f32 {
  let half = S / 2u;
  var density: f32 = 0.0;
  for (var c: u32 = half; c < S; c++) {
    let bufIdx = c * T + siteIdx;
    let re = spinorRe[bufIdx];
    let im = spinorIm[bufIdx];
    density += re * re + im * im;
  }
  return density;
}

// Convert N-D world position to lattice coordinates (fractional).
// Returns false if position is outside lattice bounds (with 0.5-cell margin for interpolation).
// coordsLo/coordsHi: integer lattice coordinates for interpolation corners.
// fracs: fractional part per dimension for blending weights.
// For dims >= min(latticeDim, 3), uses nearest-neighbor (frac=0).
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
      // Trilinear interpolation for visible dimensions
      let lo = floor(coordF);
      let hi = lo + 1.0;
      let f = coordF - lo;
      let loI = i32(lo);
      let hiI = i32(hi);
      // Both lo and hi must be in valid range for interpolation
      if (loI < -1 || hiI > i32(params.gridSize[d])) {
        return false;
      }
      // Clamp to valid range (handles edge voxels gracefully)
      (*coordsLo)[d] = u32(clamp(loI, 0, i32(params.gridSize[d]) - 1));
      (*coordsHi)[d] = u32(clamp(hiI, 0, i32(params.gridSize[d]) - 1));
      (*fracs)[d] = clamp(f, 0.0, 1.0);
    } else {
      // Nearest-neighbor for slice dimensions (4+)
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

// Build site index from coordinate arrays, selecting lo or hi per dimension
// based on corner bitmask (bit d set = use hi[d], else lo[d])
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

// Compute trilinear weight for a corner based on fractional coords
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

  // Map texture voxel to model-space position [-bound, +bound]³
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

  let S = params.spinorSize;
  let T = params.totalSites;
  let half = S / 2u;
  let matStride = S * S * 2u;
  let numCorners = 1u << min(params.latticeDim, 3u); // 2, 4, or 8

  // Nearest-neighbor site for complex field views and phase
  var nnCoords: array<u32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let halfExtent = f32(params.gridSize[d]) * params.spacing[d] * 0.5;
    let coordF = (ndWorldPos[d] + halfExtent) / params.spacing[d] - 0.5;
    nnCoords[d] = u32(clamp(i32(round(coordF)), 0, i32(params.gridSize[d]) - 1));
  }
  let nnSiteIdx = ndToLinear(nnCoords, params.strides, params.latticeDim);

  // Phase of dominant component (nearest-neighbor, not interpolated)
  let re0 = spinorRe[nnSiteIdx];
  let im0 = spinorIm[nnSiteIdx];
  let phase = atan2(im0, re0) + 3.14159265;

  var displayScalar: f32 = 0.0;

  if (params.fieldView == 0u) {
    // totalDensity: trilinear interpolation of Σ_c |ψ_c|²
    var blended: f32 = 0.0;
    for (var corner: u32 = 0u; corner < numCorners; corner++) {
      let w = cornerWeight(&fracs, corner);
      if (w > 0.0) {
        let sIdx = siteIndexForCorner(&coordsLo, &coordsHi, corner);
        blended += w * totalDensityAt(sIdx, S, T);
      }
    }
    displayScalar = select(blended / params.densityScale, 0.0, params.densityScale <= 0.0);

  } else if (params.fieldView == 1u) {
    // Upper spinor: trilinear interpolation
    var blended: f32 = 0.0;
    for (var corner: u32 = 0u; corner < numCorners; corner++) {
      let w = cornerWeight(&fracs, corner);
      if (w > 0.0) {
        let sIdx = siteIndexForCorner(&coordsLo, &coordsHi, corner);
        blended += w * upperDensityAt(sIdx, S, T);
      }
    }
    displayScalar = select(blended / params.densityScale, 0.0, params.densityScale <= 0.0);

  } else if (params.fieldView == 2u) {
    // Lower spinor: trilinear interpolation
    var blended: f32 = 0.0;
    for (var corner: u32 = 0u; corner < numCorners; corner++) {
      let w = cornerWeight(&fracs, corner);
      if (w > 0.0) {
        let sIdx = siteIndexForCorner(&coordsLo, &coordsHi, corner);
        blended += w * lowerDensityAt(sIdx, S, T);
      }
    }
    displayScalar = select(blended / params.densityScale, 0.0, params.densityScale <= 0.0);

  } else if (params.fieldView == 3u) {
    // Upper/lower split: trilinear interpolation of both channels
    var blendedP: f32 = 0.0;
    var blendedA: f32 = 0.0;
    for (var corner: u32 = 0u; corner < numCorners; corner++) {
      let w = cornerWeight(&fracs, corner);
      if (w > 0.0) {
        let sIdx = siteIndexForCorner(&coordsLo, &coordsHi, corner);
        blendedP += w * upperDensityAt(sIdx, S, T);
        blendedA += w * lowerDensityAt(sIdx, S, T);
      }
    }
    let pNorm = select(blendedP / params.densityScale, 0.0, params.densityScale <= 0.0);
    let aNorm = select(blendedA / params.densityScale, 0.0, params.densityScale <= 0.0);
    textureStore(outputTex, gid, vec4f(
      clamp(pNorm * perpFalloff, 0.0, 1.0),
      clamp(aNorm * perpFalloff, 0.0, 1.0),
      phase, 0.0
    ));
    return;

  } else if (params.fieldView == 4u) {
    // spinDensity: nearest-neighbor (expensive gamma matrix work)
    let siteIdx = nnSiteIdx;
    let totalDensity = totalDensityAt(siteIdx, S, T);
    let normDensityRaw = select(totalDensity / params.densityScale, 0.0, params.densityScale <= 0.0);
    let densityGate = smoothstep(0.0, 0.02, normDensityRaw);

    var spinMag2: f32 = 0.0;
    let nSpin = min(params.latticeDim, 3u);

    if (S <= 2u || nSpin < 3u) {
      for (var k: u32 = 0u; k < nSpin; k++) {
        let kBase = k * matStride;
        var expectRe: f32 = 0.0;
        for (var row: u32 = 0u; row < S; row++) {
          let bufIdxR = row * T + siteIdx;
          let psiRRow = spinorRe[bufIdxR];
          let psiIRow = spinorIm[bufIdxR];
          let rowBase = kBase + row * S * 2u;
          for (var col: u32 = 0u; col < S; col++) {
            let bufIdxC = col * T + siteIdx;
            let psiRCol = spinorRe[bufIdxC];
            let psiICol = spinorIm[bufIdxC];
            let gRe = gammaMatrices[rowBase + col * 2u];
            let gIm = gammaMatrices[rowBase + col * 2u + 1u];
            let matPsiRe = gRe * psiRCol - gIm * psiICol;
            let matPsiIm = gRe * psiICol + gIm * psiRCol;
            expectRe += psiRRow * matPsiRe + psiIRow * matPsiIm;
          }
        }
        spinMag2 += expectRe * expectRe;
      }
    } else {
      for (var k: u32 = 0u; k < 3u; k++) {
        let idxI = (k + 1u) % 3u;
        let idxJ = (k + 2u) % 3u;
        let baseJ = idxJ * matStride;
        let baseI = idxI * matStride;

        var tmpRe: array<f32, 64>;
        var tmpIm: array<f32, 64>;
        for (var row: u32 = 0u; row < S; row++) {
          var aRe: f32 = 0.0;
          var aIm: f32 = 0.0;
          let rowBaseJ = baseJ + row * S * 2u;
          for (var col: u32 = 0u; col < S; col++) {
            let bufIdx = col * T + siteIdx;
            let pR = spinorRe[bufIdx];
            let pI = spinorIm[bufIdx];
            let gRe = gammaMatrices[rowBaseJ + col * 2u];
            let gIm = gammaMatrices[rowBaseJ + col * 2u + 1u];
            aRe += gRe * pR - gIm * pI;
            aIm += gRe * pI + gIm * pR;
          }
          tmpRe[row] = aRe;
          tmpIm[row] = aIm;
        }

        var dotIm: f32 = 0.0;
        for (var row: u32 = 0u; row < S; row++) {
          let bufIdxR = row * T + siteIdx;
          let psiRRow = spinorRe[bufIdxR];
          let psiIRow = spinorIm[bufIdxR];
          var aRe: f32 = 0.0;
          var aIm: f32 = 0.0;
          let rowBaseI = baseI + row * S * 2u;
          for (var col: u32 = 0u; col < S; col++) {
            let gRe = gammaMatrices[rowBaseI + col * 2u];
            let gIm = gammaMatrices[rowBaseI + col * 2u + 1u];
            aRe += gRe * tmpRe[col] - gIm * tmpIm[col];
            aIm += gRe * tmpIm[col] + gIm * tmpRe[col];
          }
          dotIm += psiRRow * aIm - psiIRow * aRe;
        }

        spinMag2 += dotIm * dotIm;
      }
    }
    displayScalar = sqrt(spinMag2) * densityGate;

  } else if (params.fieldView == 5u) {
    // currentDensity: nearest-neighbor (expensive gamma matrix work)
    let siteIdx = nnSiteIdx;
    let totalDensity = totalDensityAt(siteIdx, S, T);
    let normDensityRaw = select(totalDensity / params.densityScale, 0.0, params.densityScale <= 0.0);
    let densityGate = smoothstep(0.0, 0.02, normDensityRaw);

    var currentMag2: f32 = 0.0;
    for (var k: u32 = 0u; k < params.latticeDim; k++) {
      let kBase = k * matStride;
      var expectRe: f32 = 0.0;
      for (var row: u32 = 0u; row < S; row++) {
        let bufIdxR = row * T + siteIdx;
        let psiRRow = spinorRe[bufIdxR];
        let psiIRow = spinorIm[bufIdxR];
        let rowBase = kBase + row * S * 2u;
        for (var col: u32 = 0u; col < S; col++) {
          let bufIdxC = col * T + siteIdx;
          let psiRCol = spinorRe[bufIdxC];
          let psiICol = spinorIm[bufIdxC];
          let gRe = gammaMatrices[rowBase + col * 2u];
          let gIm = gammaMatrices[rowBase + col * 2u + 1u];
          let matPsiRe = gRe * psiRCol - gIm * psiICol;
          let matPsiIm = gRe * psiICol + gIm * psiRCol;
          expectRe += psiRRow * matPsiRe + psiIRow * matPsiIm;
        }
      }
      currentMag2 += expectRe * expectRe;
    }
    let cFactor = params.speedOfLight;
    displayScalar = cFactor * sqrt(currentMag2) * densityGate;

  } else if (params.fieldView == 6u) {
    // phase: trilinear-interpolated density for gating, NN for phase value
    var blended: f32 = 0.0;
    for (var corner: u32 = 0u; corner < numCorners; corner++) {
      let w = cornerWeight(&fracs, corner);
      if (w > 0.0) {
        let sIdx = siteIndexForCorner(&coordsLo, &coordsHi, corner);
        blended += w * totalDensityAt(sIdx, S, T);
      }
    }
    let normDensityRaw = select(blended / params.densityScale, 0.0, params.densityScale <= 0.0);
    let densityGate = smoothstep(0.0, 0.02, normDensityRaw);
    displayScalar = phase / (2.0 * 3.14159265) * densityGate;
  }

  let normDisplay = clamp(displayScalar * perpFalloff, 0.0, 1.0);
  let logDensity = log(normDisplay + 1e-10);

  // Potential overlay (nearest-neighbor)
  var potOverlay: f32 = 0.0;
  if (params.showPotential == 1u && params.fieldView != 3u) {
    let V = potential[nnSiteIdx];
    let potScale = max(abs(params.potentialStrength), 1.0);
    let normPot = abs(V) / potScale;
    let fadeout = 1.0 - smoothstep(1.5, 3.0, normPot);
    var overlayGain: f32 = 1.0;
    if (params.potentialType == 4u || params.potentialType == 5u) {
      overlayGain = 0.03;
    }
    potOverlay = clamp(normPot, 0.0, 1.0) * fadeout * overlayGain * perpFalloff;
  }

  textureStore(outputTex, gid, vec4f(normDisplay, logDensity, phase, potOverlay));
}
`
