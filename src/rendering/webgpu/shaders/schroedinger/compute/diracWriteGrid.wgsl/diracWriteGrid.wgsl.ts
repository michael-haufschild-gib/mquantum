/* eslint-disable max-lines -- single exported WGSL block is validated by shader tests. */

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
@group(0) @binding(0) var<storage, read> params: DiracUniforms;
@group(0) @binding(1) var<storage, read> spinor: array<vec2f>;
@group(0) @binding(2) var<storage, read> potential: array<f32>;
@group(0) @binding(3) var<storage, read> gammaMatrices: array<f32>;
@group(0) @binding(4) var outputTex: texture_storage_3d<rgba16float, write>;

fn gammaReAtBase(matBase: u32, row: u32, col: u32, S: u32) -> f32 {
  return gammaMatrices[matBase + row * S * 2u + col * 2u];
}

fn gammaImAtBase(matBase: u32, row: u32, col: u32, S: u32) -> f32 {
  return gammaMatrices[matBase + row * S * 2u + col * 2u + 1u];
}

fn totalDensityAt(siteIdx: u32, S: u32, T: u32) -> f32 {
  var density: f32 = 0.0;
  for (var c: u32 = 0u; c < S; c++) {
    let v = spinor[c * T + siteIdx];
    density += v.x * v.x + v.y * v.y;
  }
  return density;
}

fn upperDensityAt(siteIdx: u32, S: u32, T: u32) -> f32 {
  let half = S / 2u;
  var density: f32 = 0.0;
  for (var c: u32 = 0u; c < half; c++) {
    let v = spinor[c * T + siteIdx];
    density += v.x * v.x + v.y * v.y;
  }
  return density;
}

fn lowerDensityAt(siteIdx: u32, S: u32, T: u32) -> f32 {
  let half = S >> 1u;
  var density: f32 = 0.0;
  for (var c: u32 = half; c < S; c = c + 1u) {
    let v = spinor[c * T + siteIdx];
    density += v.x * v.x + v.y * v.y;
  }
  return density;
}

fn upperLowerDensityAt(siteIdx: u32, S: u32, T: u32) -> vec2f {
  let half = S >> 1u;
  var upper: f32 = 0.0;
  var lower: f32 = 0.0;
  for (var c: u32 = 0u; c < S; c = c + 1u) {
    let v = spinor[c * T + siteIdx];
    let d = v.x * v.x + v.y * v.y;
    if (c < half) { upper += d; } else { lower += d; }
  }
  return vec2f(upper, lower);
}

fn getDiracPotentialScale() -> f32 {
  if (params.potentialType == 1u || params.potentialType == 2u || params.potentialType == 3u) {
    return max(abs(params.potentialStrength), 1.0);
  } else if (params.potentialType == 4u) {
    let r = params.boundingRadius * 0.5;
    return max(0.5 * params.mass * params.harmonicOmega * params.harmonicOmega * r * r, 1.0);
  } else if (params.potentialType == 5u) {
    return max(abs(params.coulombZ) / 0.05, 1.0);
  }
  return 1.0;
}

fn worldToLatticeInterp(
  coordFs: ptr<function, array<f32, 12>>,
  coordsLo: ptr<function, array<u32, 12>>,
  coordsHi: ptr<function, array<u32, 12>>,
  fracs: ptr<function, array<f32, 12>>
) -> bool {
  let interpDims = min(params.latticeDim, 3u);
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let coordF = (*coordFs)[d];

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

  let modelPos = vec3f(
    (f32(gid.x) + 0.5) / f32(texDims.x) * 2.0 * bound - bound,
    (f32(gid.y) + 0.5) / f32(texDims.y) * 2.0 * bound - bound,
    (f32(gid.z) + 0.5) / f32(texDims.z) * 2.0 * bound - bound
  );

  var ndWorldPos: array<f32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    ndWorldPos[d] = modelPos.x * params.basisX[d]
                  + modelPos.y * params.basisY[d]
                  + modelPos.z * params.basisZ[d];
    if (d >= 3u) {
      ndWorldPos[d] += params.slicePositions[d];
    }
  }

  var coordF: array<f32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let invSpacing = 1.0 / params.spacing[d];
    let centerOffset = f32(params.gridSize[d]) * 0.5 - 0.5;
    coordF[d] = ndWorldPos[d] * invSpacing + centerOffset;
  }

  var coordsLo: array<u32, 12>;
  var coordsHi: array<u32, 12>;
  var fracs: array<f32, 12>;

  let inBounds = worldToLatticeInterp(&coordF, &coordsLo, &coordsHi, &fracs);
  if (!inBounds) {
    textureStore(outputTex, gid, vec4f(0.0));
    return;
  }

  let baseIdxLo = ndToLinear(coordsLo, params.strides, params.latticeDim);
  let interpDimsTri = min(params.latticeDim, 3u);
  var deltaIdx: array<u32, 3>;
  deltaIdx[0] = 0u;
  deltaIdx[1] = 0u;
  deltaIdx[2] = 0u;
  for (var d: u32 = 0u; d < interpDimsTri; d++) {
    deltaIdx[d] = (coordsHi[d] - coordsLo[d]) * params.strides[d];
  }

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

  let S = params.spinorSize;
  let T = params.totalSites;
  let half = S / 2u;
  let matStride = S * S * 2u;
  let numCorners = 1u << min(params.latticeDim, 3u); // 2, 4, or 8

  // Nearest-neighbor site for complex field views and phase.
  var nnCoords: array<u32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    nnCoords[d] = u32(clamp(i32(round(coordF[d])), 0, i32(params.gridSize[d]) - 1));
  }
  let nnSiteIdx = ndToLinear(nnCoords, params.strides, params.latticeDim);

  // Phase of dominant component (nearest-neighbor, not interpolated)
  let v0 = spinor[nnSiteIdx];
  let re0 = v0.x;
  let im0 = v0.y;
  const DIRAC_WG_PI:  f32 = 3.14159265358979323846;
  const DIRAC_WG_INV_TAU: f32 = 0.15915494309189535;
  let phase = atan2(im0, re0) + DIRAC_WG_PI;
  var phaseForColor: f32 = phase;

  let invDensityScale = select(0.0, 1.0 / params.densityScale, params.densityScale > 0.0);

  var displayScalar: f32 = 0.0;

  if (params.fieldView == 0u) {
    var blended: f32 = 0.0;
    for (var corner: u32 = 0u; corner < numCorners; corner++) {
      let w = cornerWeight(&fracs, corner);
      if (w > 0.0) {
        var sIdx = baseIdxLo;
        if ((corner & 1u) != 0u) { sIdx += deltaIdx[0]; }
        if ((corner & 2u) != 0u) { sIdx += deltaIdx[1]; }
        if ((corner & 4u) != 0u) { sIdx += deltaIdx[2]; }
        blended += w * totalDensityAt(sIdx, S, T);
      }
    }
    displayScalar = (blended * invDensityScale);

  } else if (params.fieldView == 1u) {
    var blended: f32 = 0.0;
    for (var corner: u32 = 0u; corner < numCorners; corner++) {
      let w = cornerWeight(&fracs, corner);
      if (w > 0.0) {
        var sIdx = baseIdxLo;
        if ((corner & 1u) != 0u) { sIdx += deltaIdx[0]; }
        if ((corner & 2u) != 0u) { sIdx += deltaIdx[1]; }
        if ((corner & 4u) != 0u) { sIdx += deltaIdx[2]; }
        blended += w * upperDensityAt(sIdx, S, T);
      }
    }
    displayScalar = (blended * invDensityScale);

  } else if (params.fieldView == 2u) {
    var blended: f32 = 0.0;
    for (var corner: u32 = 0u; corner < numCorners; corner++) {
      let w = cornerWeight(&fracs, corner);
      if (w > 0.0) {
        var sIdx = baseIdxLo;
        if ((corner & 1u) != 0u) { sIdx += deltaIdx[0]; }
        if ((corner & 2u) != 0u) { sIdx += deltaIdx[1]; }
        if ((corner & 4u) != 0u) { sIdx += deltaIdx[2]; }
        blended += w * lowerDensityAt(sIdx, S, T);
      }
    }
    displayScalar = (blended * invDensityScale);

  } else if (params.fieldView == 3u) {
    var blendedP: f32 = 0.0;
    var blendedA: f32 = 0.0;
    for (var corner: u32 = 0u; corner < numCorners; corner = corner + 1u) {
      let w = cornerWeight(&fracs, corner);
      if (w > 0.0) {
        var sIdx = baseIdxLo;
        if ((corner & 1u) != 0u) { sIdx += deltaIdx[0]; }
        if ((corner & 2u) != 0u) { sIdx += deltaIdx[1]; }
        if ((corner & 4u) != 0u) { sIdx += deltaIdx[2]; }
        let ul = upperLowerDensityAt(sIdx, S, T);
        blendedP += w * ul.x;
        blendedA += w * ul.y;
      }
    }
    let pNorm = (blendedP * invDensityScale);
    let aNorm = (blendedA * invDensityScale);
    let totalNorm = clamp((pNorm + aNorm) * perpFalloff, 0.0, 1.0);
    textureStore(outputTex, gid, vec4f(
      clamp(pNorm * perpFalloff, 0.0, 1.0),
      clamp(aNorm * perpFalloff, 0.0, 1.0),
      phase, totalNorm
    ));
    return;

  } else if (params.fieldView == 4u) {
    let siteIdx = nnSiteIdx;
    var psiSiteRe: array<f32, 64>;
    var psiSiteIm: array<f32, 64>;
    for (var c: u32 = 0u; c < S; c = c + 1u) {
      let v = spinor[c * T + siteIdx];
      psiSiteRe[c] = v.x;
      psiSiteIm[c] = v.y;
    }
    var totalDensity: f32 = 0.0;
    for (var c: u32 = 0u; c < S; c = c + 1u) {
      totalDensity += psiSiteRe[c] * psiSiteRe[c] + psiSiteIm[c] * psiSiteIm[c];
    }
    let normDensityRaw = (totalDensity * invDensityScale);
    let densityGate = smoothstep(0.0, 0.02, normDensityRaw);

    var spinMag2: f32 = 0.0;
    let nSpin = min(params.latticeDim, 3u);

    if (S <= 2u || nSpin < 3u) {
      // ⟨α_k⟩ expectation for low S or low nSpin.
      if (DIRAC_USE_SPARSE_GAMMA) {
        for (var k: u32 = 0u; k < nSpin; k = k + 1u) {
          let tBase = k * DIRAC_SPARSE_S;
          var expectRe: f32 = 0.0;
          for (var row: u32 = 0u; row < S; row = row + 1u) {
            let t = tBase + row;
            let col = DIRAC_SPARSE_COL[t];
            let gRe = DIRAC_SPARSE_RE[t];
            let gIm = DIRAC_SPARSE_IM[t];
            let psiRCol = psiSiteRe[col];
            let psiICol = psiSiteIm[col];
            let matPsiRe = gRe * psiRCol - gIm * psiICol;
            let matPsiIm = gRe * psiICol + gIm * psiRCol;
            expectRe += psiSiteRe[row] * matPsiRe + psiSiteIm[row] * matPsiIm;
          }
          spinMag2 += expectRe * expectRe;
        }
      } else {
        for (var k: u32 = 0u; k < nSpin; k++) {
          let kBase = k * matStride;
          var expectRe: f32 = 0.0;
          for (var row: u32 = 0u; row < S; row++) {
            let psiRRow = psiSiteRe[row];
            let psiIRow = psiSiteIm[row];
            let rowBase = kBase + row * S * 2u;
            for (var col: u32 = 0u; col < S; col++) {
              let psiRCol = psiSiteRe[col];
              let psiICol = psiSiteIm[col];
              let gRe = gammaMatrices[rowBase + col * 2u];
              let gIm = gammaMatrices[rowBase + col * 2u + 1u];
              let matPsiRe = gRe * psiRCol - gIm * psiICol;
              let matPsiIm = gRe * psiICol + gIm * psiRCol;
              expectRe += psiRRow * matPsiRe + psiIRow * matPsiIm;
            }
          }
          spinMag2 += expectRe * expectRe;
        }
      }
    } else {
      // Σ_k = −i·α_i·α_j spin cyclic. Two sparse monomial multiplies per k.
      if (DIRAC_USE_SPARSE_GAMMA) {
        for (var k: u32 = 0u; k < 3u; k = k + 1u) {
          let idxI = (k + 1u) % 3u;
          let idxJ = (k + 2u) % 3u;
          let tBaseJ = idxJ * DIRAC_SPARSE_S;
          let tBaseI = idxI * DIRAC_SPARSE_S;

          var tmpRe: array<f32, 64>;
          var tmpIm: array<f32, 64>;
          for (var row: u32 = 0u; row < S; row = row + 1u) {
            let t = tBaseJ + row;
            let col = DIRAC_SPARSE_COL[t];
            let gRe = DIRAC_SPARSE_RE[t];
            let gIm = DIRAC_SPARSE_IM[t];
            let pR = psiSiteRe[col];
            let pI = psiSiteIm[col];
            tmpRe[row] = gRe * pR - gIm * pI;
            tmpIm[row] = gRe * pI + gIm * pR;
          }

          var dotIm: f32 = 0.0;
          for (var row: u32 = 0u; row < S; row = row + 1u) {
            let t = tBaseI + row;
            let col = DIRAC_SPARSE_COL[t];
            let gRe = DIRAC_SPARSE_RE[t];
            let gIm = DIRAC_SPARSE_IM[t];
            let aRe = gRe * tmpRe[col] - gIm * tmpIm[col];
            let aIm = gRe * tmpIm[col] + gIm * tmpRe[col];
            dotIm += psiSiteRe[row] * aIm - psiSiteIm[row] * aRe;
          }
          spinMag2 += dotIm * dotIm;
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
              let pR = psiSiteRe[col];
              let pI = psiSiteIm[col];
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
            let psiRRow = psiSiteRe[row];
            let psiIRow = psiSiteIm[row];
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
    }
    let rawSpin = sqrt(spinMag2);
    displayScalar = (rawSpin * invDensityScale) * densityGate;

  } else if (params.fieldView == 5u) {
    // currentDensity: nearest-neighbor (expensive gamma matrix work).
    // Preload once — same rationale as fieldView=4.
    let siteIdx = nnSiteIdx;
    var psiSiteRe: array<f32, 64>;
    var psiSiteIm: array<f32, 64>;
    for (var c: u32 = 0u; c < S; c = c + 1u) {
      let v = spinor[c * T + siteIdx];
      psiSiteRe[c] = v.x;
      psiSiteIm[c] = v.y;
    }
    var totalDensity: f32 = 0.0;
    for (var c: u32 = 0u; c < S; c = c + 1u) {
      totalDensity += psiSiteRe[c] * psiSiteRe[c] + psiSiteIm[c] * psiSiteIm[c];
    }
    let normDensityRaw = (totalDensity * invDensityScale);
    let densityGate = smoothstep(0.0, 0.02, normDensityRaw);

    var currentMag2: f32 = 0.0;
    if (DIRAC_USE_SPARSE_GAMMA) {
      // ⟨α_k⟩ expectation — sparse lookup per row.
      for (var k: u32 = 0u; k < params.latticeDim; k = k + 1u) {
        let tBase = k * DIRAC_SPARSE_S;
        var expectRe: f32 = 0.0;
        for (var row: u32 = 0u; row < S; row = row + 1u) {
          let t = tBase + row;
          let col = DIRAC_SPARSE_COL[t];
          let gRe = DIRAC_SPARSE_RE[t];
          let gIm = DIRAC_SPARSE_IM[t];
          let psiRCol = psiSiteRe[col];
          let psiICol = psiSiteIm[col];
          let matPsiRe = gRe * psiRCol - gIm * psiICol;
          let matPsiIm = gRe * psiICol + gIm * psiRCol;
          expectRe += psiSiteRe[row] * matPsiRe + psiSiteIm[row] * matPsiIm;
        }
        currentMag2 += expectRe * expectRe;
      }
    } else {
      for (var k: u32 = 0u; k < params.latticeDim; k++) {
        let kBase = k * matStride;
        var expectRe: f32 = 0.0;
        for (var row: u32 = 0u; row < S; row++) {
          let psiRRow = psiSiteRe[row];
          let psiIRow = psiSiteIm[row];
          let rowBase = kBase + row * S * 2u;
          for (var col: u32 = 0u; col < S; col++) {
            let psiRCol = psiSiteRe[col];
            let psiICol = psiSiteIm[col];
            let gRe = gammaMatrices[rowBase + col * 2u];
            let gIm = gammaMatrices[rowBase + col * 2u + 1u];
            let matPsiRe = gRe * psiRCol - gIm * psiICol;
            let matPsiIm = gRe * psiICol + gIm * psiRCol;
            expectRe += psiRRow * matPsiRe + psiIRow * matPsiIm;
          }
        }
        currentMag2 += expectRe * expectRe;
      }
    }
    let cFactor = params.speedOfLight;
    let rawCurrent = cFactor * sqrt(currentMag2);
    displayScalar = (rawCurrent * invDensityScale) * densityGate;

  } else if (params.fieldView == 7u) {
    // axialCharge: nearest-neighbor 3+1D chirality magnitude.
    let totalDensity = totalDensityAt(nnSiteIdx, S, T);
    let normDensityRaw = totalDensity * invDensityScale;
    let densityGate = smoothstep(0.0, 0.02, normDensityRaw);
    let axialCharge = diracAxialChargeAtSite(nnSiteIdx, S, T, matStride);
    let axialNorm = select(abs(axialCharge) / max(totalDensity, 1e-20), 0.0, totalDensity < 1e-30);
    displayScalar = clamp(axialNorm, 0.0, 1.0) * densityGate;

  } else if (params.fieldView == 8u) {
    // cliffordBloom: sector-balanced relative-phase petals from the visible
    // Clifford representation split. Density gates visibility; upper/lower
    // balance controls whether petals can bloom at all.
    let totalDensity = totalDensityAt(nnSiteIdx, S, T);
    let normDensityRaw = totalDensity * invDensityScale;
    let densityGate = smoothstep(0.0, 0.02, normDensityRaw);
    let split = upperLowerDensityAt(nnSiteIdx, S, T);
    let sectorDenom = max(split.x + split.y, 1e-20);
    let sectorBalance = clamp(4.0 * split.x * split.y / (sectorDenom * sectorDenom), 0.0, 1.0);

    let upper0 = spinor[nnSiteIdx];
    let lower0 = spinor[half * T + nnSiteIdx];
    let upperPhase = atan2(upper0.y, upper0.x);
    let lowerPhase = atan2(lower0.y, lower0.x);
    let relativePhase = atan2(sin(upperPhase - lowerPhase), cos(upperPhase - lowerPhase));

    let x = ndWorldPos[0];
    let y = select(0.0, ndWorldPos[1], params.latticeDim > 1u);
    let z = select(0.0, ndWorldPos[2], params.latticeDim > 2u);
    let phiXY = atan2(y, x);
    let phiXZ = atan2(z, x);
    let radius = sqrt(x * x + y * y + z * z);
    let carrierPhase = 4.0 * phiXY + 2.0 * phiXZ + 3.0 * relativePhase + 0.3 * radius - 0.8 * params.simTime;
    let carrier = 0.5 + 0.5 * cos(carrierPhase);
    let radialShellPhase = 5.5 * radius + 2.0 * relativePhase - 1.1 * params.simTime;
    let radialShell = 0.5 + 0.5 * cos(radialShellPhase);
    let angularPetal = carrier * carrier * carrier;
    let shellFocus = radialShell * radialShell;
    let phaseTension = 0.35 + 0.65 * abs(sin(relativePhase));
    let bloom = sectorBalance * phaseTension * shellFocus * (0.04 + 0.96 * angularPetal);
    displayScalar = clamp(1.0 - exp(-7.2 * bloom), 0.0, 1.0) * densityGate;
    let bloomHuePhase = atan2(
      sin(relativePhase + 2.0 * phiXY + phiXZ + 0.5 * radius),
      cos(relativePhase + 2.0 * phiXY + phiXZ + 0.5 * radius)
    );
    phaseForColor = bloomHuePhase + DIRAC_WG_PI;

  } else if (params.fieldView == 9u) {
    let siteIdx = nnSiteIdx;

    var totalDensity: f32 = 0.0;
    var upperDensity: f32 = 0.0;
    var lowerDensity: f32 = 0.0;
    for (var c: u32 = 0u; c < S; c = c + 1u) {
      let v = spinor[c * T + siteIdx];
      let d = v.x * v.x + v.y * v.y;
      totalDensity += d;
      if (c < half) { upperDensity += d; } else { lowerDensity += d; }
    }
    let normDensityRaw = totalDensity * invDensityScale;
    let densityGate = smoothstep(0.0, 0.025, normDensityRaw);
    let sectorDenom = max(upperDensity + lowerDensity, 1e-20);
    let pairBalance = clamp(
      4.0 * upperDensity * lowerDensity / (sectorDenom * sectorDenom),
      0.0,
      1.0
    );
    let x = ndWorldPos[0];
    let y = select(0.0, ndWorldPos[1], params.latticeDim > 1u);
    let z = select(0.0, ndWorldPos[2], params.latticeDim > 2u);
    let radius = sqrt(x * x + y * y + z * z);
    let radiusNorm = radius / max(params.boundingRadius, 1e-6);
    let azimuth = atan2(y, x);
    let phaseCentered = phase - DIRAC_WG_PI;

    let invSectorDenom = 1.0 / sectorDenom;
    let upperPrimary = spinor[siteIdx];
    let upperSecondaryComponent = select(0u, 1u, half > 1u);
    let lowerPrimaryComponent = min(half, S - 1u);
    let lowerSecondaryComponent = min(lowerPrimaryComponent + 1u, S - 1u);
    let upperSecondary = spinor[upperSecondaryComponent * T + siteIdx];
    let lowerPrimary = spinor[lowerPrimaryComponent * T + siteIdx];
    let lowerSecondary = spinor[lowerSecondaryComponent * T + siteIdx];

    let sectorMixRe = 2.0 * (
      upperPrimary.x * lowerPrimary.x + upperPrimary.y * lowerPrimary.y
    ) * invSectorDenom;
    let sectorMixIm = 2.0 * (
      upperPrimary.y * lowerPrimary.x - upperPrimary.x * lowerPrimary.y
    ) * invSectorDenom;
    let spinVec = vec3f(
      (upperDensity - lowerDensity) * invSectorDenom,
      sectorMixRe,
      sectorMixIm
    );

    let currentX = 2.0 * (
      upperPrimary.x * lowerSecondary.x + upperPrimary.y * lowerSecondary.y +
      upperSecondary.x * lowerPrimary.x + upperSecondary.y * lowerPrimary.y
    ) * invSectorDenom;
    let currentY = 2.0 * (
      upperPrimary.y * lowerSecondary.x - upperPrimary.x * lowerSecondary.y +
      upperSecondary.y * lowerPrimary.x - upperSecondary.x * lowerPrimary.y
    ) * invSectorDenom;
    let currentZ = 2.0 * (
      upperPrimary.x * lowerPrimary.x + upperPrimary.y * lowerPrimary.y -
      upperSecondary.x * lowerSecondary.x - upperSecondary.y * lowerSecondary.y
    ) * invSectorDenom;
    let sectorCurrent = params.speedOfLight * vec3f(
      currentX,
      select(0.0, currentY, params.latticeDim > 1u),
      select(0.0, currentZ, params.latticeDim > 2u)
    );
    let radialFlow = select(
      vec3f(0.0, 0.0, 1.0),
      vec3f(x, y, z) * inverseSqrt(max(radius * radius, 1e-12)),
      radius > 1e-6
    );
    let currentVec = sectorCurrent + 0.12 * params.speedOfLight * pairBalance * radialFlow;
    let currentMag2 = dot(currentVec, currentVec);
    let spinMag2 = dot(spinVec, spinVec);
    let signedHelicity = select(
      0.0,
      dot(currentVec, spinVec) * inverseSqrt(currentMag2 * spinMag2),
      densityGate > 0.0001 && pairBalance > 0.0001 && currentMag2 > 1e-20 && spinMag2 > 1e-20
    );
    let helicityAlignment = pow(abs(signedHelicity), 0.65);

    let shellCarrier = 0.5 + 0.5 * cos(6.283185307179586 * (3.25 * radiusNorm - 0.18 * params.simTime));
    let radialShell2 = shellCarrier * shellCarrier;
    let radialShell4 = radialShell2 * radialShell2;
    let radialShell = radialShell4 * radialShell4;

    var x4Norm: f32 = 0.0;
    if (params.latticeDim > 3u) {
      x4Norm = ndWorldPos[3] / max(params.boundingRadius, 1e-6);
    }
    let bulk4DPhase = 6.283185307179586 * (
      0.72 * x4Norm + phaseCentered * DIRAC_WG_INV_TAU - 0.17 * params.simTime
    );
    let bulk4DCarrier = 0.5 + 0.5 * cos(bulk4DPhase);
    let bulk4DGate = select(
      1.0,
      0.2 + 0.8 * pow(max(bulk4DCarrier, 0.0), 1.5),
      params.latticeDim > 3u
    );

    let laceCarrier = 0.5 + 0.5 * cos(
      phaseCentered + 5.0 * azimuth + 12.0 * radiusNorm - 0.9 * params.simTime
    );
    let lace2 = laceCarrier * laceCarrier;
    let phaseLace = 0.08 + 0.92 * lace2 * lace2;
    let aperture = densityGate * pairBalance * helicityAlignment * radialShell * bulk4DGate * phaseLace;
    displayScalar = clamp(aperture, 0.0, 1.0);

    let huePhase = atan2(
      sin(phaseCentered + signedHelicity * DIRAC_WG_PI + 2.0 * azimuth + 1.7 * x4Norm),
      cos(phaseCentered + signedHelicity * DIRAC_WG_PI + 2.0 * azimuth + 1.7 * x4Norm)
    );
    phaseForColor = huePhase + DIRAC_WG_PI;

  } else if (params.fieldView == 6u) {
    // phase: trilinear-interpolated density for gating, NN for phase value.
    // Reuses baseIdxLo + deltaIdx from the precompute above — the ndToLinear
    // of coordsLo plus per-axis (coordsHi[d] - coordsLo[d]) * strides[d] is
    // the linear index of the corner with that bit set, identical to what
    // a per-corner coordinate-array selection would compute.
    var blended: f32 = 0.0;
    for (var corner: u32 = 0u; corner < numCorners; corner++) {
      let w = cornerWeight(&fracs, corner);
      if (w > 0.0) {
        var sIdx = baseIdxLo;
        if ((corner & 1u) != 0u) { sIdx += deltaIdx[0]; }
        if ((corner & 2u) != 0u) { sIdx += deltaIdx[1]; }
        if ((corner & 4u) != 0u) { sIdx += deltaIdx[2]; }
        blended += w * totalDensityAt(sIdx, S, T);
      }
    }
    let normDensityRaw = (blended * invDensityScale);
    let densityGate = smoothstep(0.0, 0.02, normDensityRaw);
    displayScalar = phase * DIRAC_WG_INV_TAU * densityGate;
  }

  let normDisplay = clamp(displayScalar * perpFalloff, 0.0, 1.0);
  let logDensity = log(normDisplay + 1e-10);

  let rawTotalDensity = totalDensityAt(nnSiteIdx, S, T);
  let rawDensityNorm = clamp(
    (rawTotalDensity * invDensityScale) * perpFalloff,
    0.0, 1.0
  );
  var alphaChannel: f32 = rawDensityNorm;

  if (params.showPotential == 1u && params.fieldView != 3u) {
    let V = potential[nnSiteIdx];
    let normPot = abs(V) / getDiracPotentialScale();
    let fadeout = 1.0 - smoothstep(1.5, 3.0, normPot);
    var overlayGain: f32 = 1.0;
    if (params.potentialType == 4u || params.potentialType == 5u) {
      overlayGain = 0.03;
    }
    let potOverlay = clamp(normPot, 0.0, 1.0) * fadeout * overlayGain * perpFalloff;
    if (potOverlay > 0.01) {
      alphaChannel = -potOverlay;
    }
  }

  textureStore(outputTex, gid, vec4f(normDisplay, logDensity, phaseForColor, alphaChannel));
}
`
