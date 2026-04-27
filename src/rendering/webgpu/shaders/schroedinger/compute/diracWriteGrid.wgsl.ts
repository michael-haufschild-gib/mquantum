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
@group(0) @binding(0) var<storage, read> params: DiracUniforms;
@group(0) @binding(1) var<storage, read> spinor: array<vec2f>;
@group(0) @binding(2) var<storage, read> potential: array<f32>;
@group(0) @binding(3) var<storage, read> gammaMatrices: array<f32>;
@group(0) @binding(4) var outputTex: texture_storage_3d<rgba16float, write>;

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
    let v = spinor[c * T + siteIdx];
    density += v.x * v.x + v.y * v.y;
  }
  return density;
}

// Compute upper-spinor density Σ_{c<S/2} |ψ_c|² at a given site
fn upperDensityAt(siteIdx: u32, S: u32, T: u32) -> f32 {
  let half = S / 2u;
  var density: f32 = 0.0;
  for (var c: u32 = 0u; c < half; c++) {
    let v = spinor[c * T + siteIdx];
    density += v.x * v.x + v.y * v.y;
  }
  return density;
}

// Compute lower-spinor density Σ_{c>=S/2} |ψ_c|² at a given site
fn lowerDensityAt(siteIdx: u32, S: u32, T: u32) -> f32 {
  let half = S >> 1u;
  var density: f32 = 0.0;
  for (var c: u32 = half; c < S; c = c + 1u) {
    let v = spinor[c * T + siteIdx];
    density += v.x * v.x + v.y * v.y;
  }
  return density;
}

// Combined upper-and-lower density — one pass through the spinor buffers
// instead of two. Used by fieldView=3 (particle/antiparticle split) so S
// buffer reads are halved on each corner evaluation.
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

// Convert precomputed fractional lattice coordinates into interpolation corners.
// Returns false if position is outside lattice bounds (with 0.5-cell margin for interpolation).
// coordsLo/coordsHi: integer lattice coordinates for interpolation corners.
// fracs: fractional part per dimension for blending weights.
// For dims >= min(latticeDim, 3), uses nearest-neighbor (frac=0).
// Caller passes coordFs[d] = (ndWorldPos[d] + N/2*dx)/dx - 0.5 so the same
// value feeds both the interp branching and the nearest-neighbor round+clamp
// used downstream — avoids a second per-dim mul/div/sub chain per voxel.
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

  // Precompute fractional lattice coordinate per dim ONCE. Reused by the interp
  // helper (lo/hi/frac) and the nearest-neighbor derivation below.
  //
  // The halfExtent/spacing factor is just (N·dx·½)/dx = N/2, so the original
  //   coordF = (ndWorldPos + halfExtent) / dx − 0.5
  // simplifies algebraically to
  //   coordF = ndWorldPos · invSpacing + (N/2 − ½)
  // — one less multiply and the spacing divide is folded into a multiply
  // by precomputed invSpacing. Bit-identical for f32 within rounding.
  var coordF: array<f32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let invSpacing = 1.0 / params.spacing[d];
    let centerOffset = f32(params.gridSize[d]) * 0.5 - 0.5;
    coordF[d] = ndWorldPos[d] * invSpacing + centerOffset;
  }

  // Convert to lattice coordinates with trilinear interpolation support
  var coordsLo: array<u32, 12>;
  var coordsHi: array<u32, 12>;
  var fracs: array<f32, 12>;

  let inBounds = worldToLatticeInterp(&coordF, &coordsLo, &coordsHi, &fracs);
  if (!inBounds) {
    textureStore(outputTex, gid, vec4f(0.0));
    return;
  }

  // PERF: precompute baseIdxLo (coordsLo to linear index) once and the up-to-3
  // visible-axis stride deltas, then derive each corner's index by adding up
  // to 3 deltas. Replaces a per-corner ndToLinear scan over 12 dims with 1
  // ndToLinear + 3 small subs + per-corner bit-tested adds. All trilinear
  // and phase paths reuse this. Slice dims (d >= 3) always read coordsLo
  // because corner
  // bit (1u << d) is never set (numCorners caps at 1u << min(latticeDim, 3u)).
  // Edge voxels remain bit-equivalent: when worldToLatticeInterp clamps lo
  // and hi to the same value, deltaIdx[d] = 0 and the bit-add is a no-op,
  // matching the original behavior.
  let baseIdxLo = ndToLinear(coordsLo, params.strides, params.latticeDim);
  let interpDimsTri = min(params.latticeDim, 3u);
  var deltaIdx: array<u32, 3>;
  deltaIdx[0] = 0u;
  deltaIdx[1] = 0u;
  deltaIdx[2] = 0u;
  for (var d: u32 = 0u; d < interpDimsTri; d++) {
    deltaIdx[d] = (coordsHi[d] - coordsLo[d]) * params.strides[d];
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

  let S = params.spinorSize;
  let T = params.totalSites;
  let half = S / 2u;
  let matStride = S * S * 2u;
  let numCorners = 1u << min(params.latticeDim, 3u); // 2, 4, or 8

  // Nearest-neighbor site for complex field views and phase. Derived from the
  // coordF values computed above — round+clamp on the exact same fractional
  // coordinate preserves boundary behavior bit-for-bit (deriving round from
  // coordsLo/frac would disagree at grid edges where the interp clamps
  // truncate loI=-1 and hiI=N to valid neighbors).
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

  // Precompute 1/densityScale once (guard against 0): each field-view branch
  // used select(x / scale, 0.0, scale <= 0), which always ran the divide —
  // 11 redundant divides total. One reciprocal + 11 multiplies is ~10× cheaper.
  let invDensityScale = select(0.0, 1.0 / params.densityScale, params.densityScale > 0.0);

  var displayScalar: f32 = 0.0;

  if (params.fieldView == 0u) {
    // totalDensity: trilinear interpolation of Σ_c |ψ_c|²
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
    // Upper spinor: trilinear interpolation
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
    // Lower spinor: trilinear interpolation
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
    // Upper/lower split: trilinear interpolation of both channels.
    // Uses the fused upperLowerDensityAt helper so each corner reads the
    // spinor buffers once instead of twice.
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
    // spinDensity: nearest-neighbor (expensive gamma matrix work).
    // Preload spinor components at this site ONCE. The inner loops would
    // otherwise re-read each component S times per row × S rows × nSpin axes.
    //
    // PERF: when DIRAC_USE_SPARSE_GAMMA is true, each α is monomial (1 non-zero
    // per row), so the S-wide col loop collapses to a single lookup. IEEE
    // bit-identical to the dense path (dense sum has S−1 exactly-zero terms).
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

  // Alpha dual-encoding: raw density (>= 0) or -potOverlay (< 0)
  let rawTotalDensity = totalDensityAt(nnSiteIdx, S, T);
  let rawDensityNorm = clamp(
    (rawTotalDensity * invDensityScale) * perpFalloff,
    0.0, 1.0
  );
  var alphaChannel: f32 = rawDensityNorm;

  if (params.showPotential == 1u && params.fieldView != 3u) {
    let V = potential[nnSiteIdx];
    let potScale = max(abs(params.potentialStrength), 1.0);
    let normPot = abs(V) / potScale;
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

  textureStore(outputTex, gid, vec4f(normDisplay, logDensity, phase, alphaChannel));
}
`
