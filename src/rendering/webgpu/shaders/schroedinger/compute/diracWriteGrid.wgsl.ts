/**
 * Dirac — Write to 3D Density Grid Compute Shader
 *
 * Writes the N-D Dirac spinor field data into a 3D density texture for raymarching.
 * Same spatial mapping as tdseWriteGrid: basis-rotated slicing, model-space output.
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

// Access element (row, col) of gamma matrix at index matIdx
fn gammaReWG(matIdx: u32, row: u32, col: u32) -> f32 {
  let S = params.spinorSize;
  return gammaMatrices[matIdx * S * S * 2u + row * S * 2u + col * 2u];
}

fn gammaImWG(matIdx: u32, row: u32, col: u32) -> f32 {
  let S = params.spinorSize;
  return gammaMatrices[matIdx * S * S * 2u + row * S * 2u + col * 2u + 1u];
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

  // Convert N-D world position to lattice coordinates
  var coords: array<u32, 12>;
  var inBounds: bool = true;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let halfExtent = f32(params.gridSize[d]) * params.spacing[d] * 0.5;
    let coordF = (ndWorldPos[d] + halfExtent) / params.spacing[d] - 0.5;
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

  // Perpendicular falloff for low-dimensional lattices (1D → tube, 2D → sheet)
  // When latticeDim < 3, the lattice subspace doesn't fill 3D model-space.
  // Without falloff, every voxel at the same lattice coordinate gets identical
  // density regardless of perpendicular offset, producing solid slabs.
  var perpFalloff: f32 = 1.0;
  if (params.latticeDim < 3u) {
    // Compute squared perpendicular distance from modelPos to lattice subspace.
    // The 3D direction for lattice dimension d is v_d = (basisX[d], basisY[d], basisZ[d]).
    // perpDist² = |modelPos|² - Σ_d (dot(modelPos, v_d))²
    var projSq: f32 = 0.0;
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      let v = vec3f(params.basisX[d], params.basisY[d], params.basisZ[d]);
      let proj = dot(modelPos, v);
      projSq += proj * proj;
    }
    let perpDist2 = max(dot(modelPos, modelPos) - projSq, 0.0);
    // Gaussian tube/sheet with sigma = 6% of bounding radius
    let perpSigma = bound * 0.06;
    perpFalloff = exp(-perpDist2 / (2.0 * perpSigma * perpSigma));
  }

  let siteIdx = ndToLinear(coords, params.strides, params.latticeDim);
  let S = params.spinorSize;
  let half = S / 2u;

  // Compute total density for normalization and gating
  var totalDensity: f32 = 0.0;
  for (var c: u32 = 0u; c < S; c++) {
    let bufIdx = c * params.totalSites + siteIdx;
    let re = spinorRe[bufIdx];
    let im = spinorIm[bufIdx];
    totalDensity += re * re + im * im;
  }

  // Phase of dominant component (component 0)
  let re0 = spinorRe[siteIdx];
  let im0 = spinorIm[siteIdx];
  let phase = atan2(im0, re0) + 3.14159265;

  // Density gate for derived quantities
  let normDensityRaw = select(totalDensity / params.densityScale, 0.0, params.densityScale <= 0.0);
  let densityGate = smoothstep(0.0, 0.02, normDensityRaw);

  var displayScalar: f32 = 0.0;

  if (params.fieldView == 0u) {
    // totalDensity: Σ_c |ψ_c|²
    displayScalar = normDensityRaw;

  } else if (params.fieldView == 1u) {
    // Upper spinor components (representation-basis, not energy projection)
    var particleD: f32 = 0.0;
    for (var c: u32 = 0u; c < half; c++) {
      let bufIdx = c * params.totalSites + siteIdx;
      let re = spinorRe[bufIdx];
      let im = spinorIm[bufIdx];
      particleD += re * re + im * im;
    }
    displayScalar = select(particleD / params.densityScale, 0.0, params.densityScale <= 0.0);

  } else if (params.fieldView == 2u) {
    // Lower spinor components (representation-basis, not energy projection)
    var antiD: f32 = 0.0;
    for (var c: u32 = half; c < S; c++) {
      let bufIdx = c * params.totalSites + siteIdx;
      let re = spinorRe[bufIdx];
      let im = spinorIm[bufIdx];
      antiD += re * re + im * im;
    }
    displayScalar = select(antiD / params.densityScale, 0.0, params.densityScale <= 0.0);

  } else if (params.fieldView == 3u) {
    // Upper/lower spinor split: upper in R, lower in G (representation-basis)
    var particleD: f32 = 0.0;
    var antiD: f32 = 0.0;
    for (var c: u32 = 0u; c < S; c++) {
      let bufIdx = c * params.totalSites + siteIdx;
      let re = spinorRe[bufIdx];
      let im = spinorIm[bufIdx];
      let d = re * re + im * im;
      if (c < half) {
        particleD += d;
      } else {
        antiD += d;
      }
    }
    let pNorm = select(particleD / params.densityScale, 0.0, params.densityScale <= 0.0);
    let aNorm = select(antiD / params.densityScale, 0.0, params.densityScale <= 0.0);
    textureStore(outputTex, gid, vec4f(
      clamp(pNorm * perpFalloff, 0.0, 1.0),
      clamp(aNorm * perpFalloff, 0.0, 1.0),
      phase, 0.0
    ));
    return;

  } else if (params.fieldView == 4u) {
    // spinDensity: |s| where s_k = ψ†Σ_k ψ
    // For S=2: Σ_k = σ_k = α_k (exact, Pauli matrices).
    // For S≥4 in 3D: Σ_k = -i·α_{(k+1)%3}·α_{(k+2)%3} (Dirac spin operator).
    // For S≥4 with latticeDim < 3: falls back to alpha (no well-defined spin vector).
    var spinMag2: f32 = 0.0;
    let nSpin = min(params.latticeDim, 3u);

    if (S <= 2u || nSpin < 3u) {
      // S=2 or low-dim: α_k = Σ_k, direct expectation
      for (var k: u32 = 0u; k < nSpin; k++) {
        var expectRe: f32 = 0.0;
        for (var row: u32 = 0u; row < S; row++) {
          let bufIdxR = row * params.totalSites + siteIdx;
          let psiRRow = spinorRe[bufIdxR];
          let psiIRow = spinorIm[bufIdxR];
          for (var col: u32 = 0u; col < S; col++) {
            let bufIdxC = col * params.totalSites + siteIdx;
            let psiRCol = spinorRe[bufIdxC];
            let psiICol = spinorIm[bufIdxC];
            let gRe = gammaReWG(k, row, col);
            let gIm = gammaImWG(k, row, col);
            let matPsiRe = gRe * psiRCol - gIm * psiICol;
            let matPsiIm = gRe * psiICol + gIm * psiRCol;
            expectRe += psiRRow * matPsiRe + psiIRow * matPsiIm;
          }
        }
        spinMag2 += expectRe * expectRe;
      }
    } else {
      // S≥4, 3D: Σ_k = -i·α_i·α_j where (i,j,k) cyclic permutation of (0,1,2)
      // ⟨Σ_k⟩ = Im(ψ†·α_i·α_j·ψ) since -i times a complex number has Re = Im part
      for (var k: u32 = 0u; k < 3u; k++) {
        let idxI = (k + 1u) % 3u;
        let idxJ = (k + 2u) % 3u;

        // Step 1: tmpψ = α_j · ψ
        var tmpRe: array<f32, 64>;
        var tmpIm: array<f32, 64>;
        for (var row: u32 = 0u; row < S; row++) {
          var aRe: f32 = 0.0;
          var aIm: f32 = 0.0;
          for (var col: u32 = 0u; col < S; col++) {
            let bufIdx = col * params.totalSites + siteIdx;
            let pR = spinorRe[bufIdx];
            let pI = spinorIm[bufIdx];
            let gRe = gammaReWG(idxJ, row, col);
            let gIm = gammaImWG(idxJ, row, col);
            aRe += gRe * pR - gIm * pI;
            aIm += gRe * pI + gIm * pR;
          }
          tmpRe[row] = aRe;
          tmpIm[row] = aIm;
        }

        // Step 2: compute ψ†·α_i·tmpψ (complex)
        var dotIm: f32 = 0.0;
        for (var row: u32 = 0u; row < S; row++) {
          let bufIdxR = row * params.totalSites + siteIdx;
          let psiRRow = spinorRe[bufIdxR];
          let psiIRow = spinorIm[bufIdxR];
          var aRe: f32 = 0.0;
          var aIm: f32 = 0.0;
          for (var col: u32 = 0u; col < S; col++) {
            let gRe = gammaReWG(idxI, row, col);
            let gIm = gammaImWG(idxI, row, col);
            aRe += gRe * tmpRe[col] - gIm * tmpIm[col];
            aIm += gRe * tmpIm[col] + gIm * tmpRe[col];
          }
          // Im(conj(ψ_row)·v) = psiR·vIm - psiI·vRe
          dotIm += psiRRow * aIm - psiIRow * aRe;
        }

        // ⟨Σ_k⟩ = Re(-i · (ψ†·α_i·α_j·ψ)) = Im(ψ†·α_i·α_j·ψ) = dotIm
        spinMag2 += dotIm * dotIm;
      }
    }
    displayScalar = sqrt(spinMag2) * densityGate;

  } else if (params.fieldView == 5u) {
    // currentDensity: |j| = c · |ψ†α ψ| (probability current magnitude)
    var currentMag2: f32 = 0.0;
    for (var k: u32 = 0u; k < params.latticeDim; k++) {
      var expectRe: f32 = 0.0;
      for (var row: u32 = 0u; row < S; row++) {
        let bufIdxR = row * params.totalSites + siteIdx;
        let psiRRow = spinorRe[bufIdxR];
        let psiIRow = spinorIm[bufIdxR];
        for (var col: u32 = 0u; col < S; col++) {
          let bufIdxC = col * params.totalSites + siteIdx;
          let psiRCol = spinorRe[bufIdxC];
          let psiICol = spinorIm[bufIdxC];
          let gRe = gammaReWG(k, row, col);
          let gIm = gammaImWG(k, row, col);
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
    // phase: arg(ψ₀), gated by density
    displayScalar = phase / (2.0 * 3.14159265) * densityGate;
  }

  let normDisplay = clamp(displayScalar * perpFalloff, 0.0, 1.0);
  let logDensity = log(normDisplay + 1e-10);

  // Potential overlay
  var potOverlay: f32 = 0.0;
  if (params.showPotential == 1u && params.fieldView != 3u) {
    let V = potential[siteIdx];
    let potScale = max(abs(params.potentialStrength), 1.0);
    let normPot = abs(V) / potScale;
    let fadeout = 1.0 - smoothstep(1.5, 3.0, normPot);
    var overlayGain: f32 = 1.0;
    // Reduce gain for smooth potentials (harmonic, coulomb)
    if (params.potentialType == 4u || params.potentialType == 5u) {
      overlayGain = 0.03;
    }
    potOverlay = clamp(normPot, 0.0, 1.0) * fadeout * overlayGain * perpFalloff;
  }

  textureStore(outputTex, gid, vec4f(normDisplay, logDensity, phase, potOverlay));
}
`
