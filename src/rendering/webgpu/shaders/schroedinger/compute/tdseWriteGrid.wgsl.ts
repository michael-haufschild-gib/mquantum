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
@group(0) @binding(0) var<storage, read> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read> psiIm: array<f32>;
@group(0) @binding(3) var<storage, read> potential: array<f32>;
@group(0) @binding(4) var outputTex: texture_storage_3d<rgba16float, write>;

const TDSE_WG_PI:     f32 = 3.14159265358979323846;
const TDSE_WG_TAU:    f32 = 6.28318530717958647692;
const TDSE_WG_INV_TAU: f32 = 0.15915494309189535;

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
  } else if (params.potentialType == 10u) {
    // Radial double well: V(r) = λ(r−r₁)²(r−r₂)² − ε·r
    // Barrier peak between minima ≈ λ·((r₂−r₁)/2)⁴
    let halfDr = (params.radialWellOuter - params.radialWellInner) * 0.5;
    let h4 = halfDr * halfDr * halfDr * halfDr;
    return max(params.radialWellDepth * h4, 1.0);
  } else if (params.potentialType == 11u || params.potentialType == 12u) {
    // Custom expression or Anderson disorder: max|V| computed JS-side and passed via uniform
    return max(params.customPotentialScale, 1.0);
  } else if (params.potentialType == 13u) {
    // Coupled anharmonic: V = ½Σω²x² + λΣ_{i<j} x_i²x_j²
    // Scale by harmonic contribution at half-bounding-radius (same as becTrap)
    let r = params.boundingRadius * 0.5;
    return max(0.5 * params.mass * params.harmonicOmega * params.harmonicOmega * r * r, 1.0);
  } else if (params.potentialType == 14u) {
    // Regge–Wheeler ringdown: closed-form leading-order peak near the photon
    // sphere r = 3M is V_peak ≈ ℓ(ℓ+1)/(27·M²). Mirrors
    // getPotentialPlotScale() in src/lib/physics/tdse/potentialProfile.ts so
    // the GPU overlay and the CPU-side energy plot share a y-axis scale.
    let Mbh = max(params.bhMass, 1e-4);
    let ell = params.bhMultipoleL;
    let s = params.bhSpin;
    // Include the spin-dependent correction (1-s²)·2/(3M) at the photon
    // sphere r=3M so the normalization reflects the actual peak height
    // for all perturbation spins s ∈ {0, 1, 2}. abs() mirrors the CPU
    // formula in potentialProfile.ts so the gravitational (s=2, ℓ=0)
    // edge case doesn't collapse to the 0.02 floor.
    let spinCorr = (1.0 - s * s) * 2.0 / 3.0;
    return max(abs((ell * (ell + 1.0) + spinCorr) / (27.0 * Mbh * Mbh)), 0.02);
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

// Analog-Hawking quantum-extremal island membership test. Returns true iff
// the voxel at nnCoords lies inside the Page-curve island ball on the
// supersonic side of the horizon. See islandMask.ts for the pure-TS
// reference used by unit tests. When islandOverlayEnabled is 0 or the
// radius is zero the function short-circuits to false so callers can treat
// it as a no-op in the common path.
fn voxelIsInIsland(nnCoords: ptr<function, array<u32, 12>>) -> bool {
  if (params.islandOverlayEnabled == 0u) { return false; }
  if (params.islandRadiusWs <= 0.0) { return false; }
  let interpDims = min(params.latticeDim, 3u);
  // Voxel world-space coordinate: (coord - N/2) * spacing along each of the
  // visible lattice axes. Axes with latticeDim < 3 contribute 0 (treated as
  // coincident with the origin in the missing dimensions).
  var wx: array<f32, 3>;
  wx[0] = 0.0;
  wx[1] = 0.0;
  wx[2] = 0.0;
  for (var d: u32 = 0u; d < interpDims; d++) {
    let N = f32(params.gridSize[d]);
    let dx = params.spacing[d];
    wx[d] = (f32((*nnCoords)[d]) + 0.5 - 0.5 * N) * dx;
  }
  let cx = params.islandCenterX0;
  // Supersonic-side gate mirrors islandMask.ts:
  //   centerX0 == 0  → gate is permissive (ball centred at origin)
  //   otherwise      → same sign AND |wx[0]| ≥ |centerX0| (modulo fuzz)
  let eps = 1e-6;
  let onSupersonicSide = (cx == 0.0) ||
    (wx[0] * cx >= 0.0 && abs(wx[0]) >= abs(cx) - eps);
  if (!onSupersonicSide) { return false; }
  let dx0 = wx[0] - cx;
  let dy = wx[1];
  let dz = wx[2];
  let r2 = dx0 * dx0 + dy * dy + dz * dz;
  let R = params.islandRadiusWs;
  return r2 <= R * R;
}

// Superfluid velocity |v_s|² via central differences with PML-aware boundary
// handling and periodic wrap-around. Shared by fieldView 4 (superfluidVelocity)
// and fieldView 6 (machNumber) so both views agree voxel-for-voxel. Uses
// j/ρ with v_s = (ℏ/m)·Im(ψ*∇ψ)/|ψ|². Returns 0 if only degenerate axes exist.
fn computeSuperfluidVelocityMagSq(
  idx: u32,
  re: f32,
  im: f32,
  density: f32,
  nnCoords: ptr<function, array<u32, 12>>
) -> f32 {
  let hbarOverM = params.hbar / max(params.mass, 1e-6);
  let densitySafe = max(density, 1e-20);
  let invDensity = 1.0 / densitySafe;  // per-thread scalar, used inside axis loop
  let hasPML = params.absorberEnabled != 0u;
  var vsMagSq: f32 = 0.0;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    if (params.gridSize[d] <= 1u) { continue; }
    let stride = params.strides[d];
    let coord = (*nnCoords)[d];
    let Nd = params.gridSize[d];
    let invSpacing = 1.0 / params.spacing[d];
    let invDx = 0.5 * invSpacing;
    let atLo = coord == 0u;
    let atHi = coord == Nd - 1u;

    var dRe: f32;
    var dIm: f32;
    if (hasPML && atLo) {
      let fIdx = idx + stride;
      dRe = (psiRe[fIdx] - re) * invSpacing;
      dIm = (psiIm[fIdx] - im) * invSpacing;
    } else if (hasPML && atHi) {
      let bIdx = idx - stride;
      dRe = (re - psiRe[bIdx]) * invSpacing;
      dIm = (im - psiIm[bIdx]) * invSpacing;
    } else {
      let fwdIdx = select(idx + stride, idx - stride * (Nd - 1u), atHi);
      let bwdIdx = select(idx - stride, idx + stride * (Nd - 1u), atLo);
      dRe = (psiRe[fwdIdx] - psiRe[bwdIdx]) * invDx;
      dIm = (psiIm[fwdIdx] - psiIm[bwdIdx]) * invDx;
    }
    let jd = hbarOverM * (re * dIm - im * dRe);
    let vsd = jd * invDensity;
    vsMagSq += vsd * vsd;
  }
  return vsMagSq;
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
    let invTwoPerpSigma2 = 1.0 / (2.0 * perpSigma * perpSigma);
    perpFalloff = exp(-perpDist2 * invTwoPerpSigma2);
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
    phase = atan2(blendedIm, blendedRe) + TDSE_WG_PI;
    idx = nnIdx; // for potential overlay
  } else {
    idx = nnIdx;
    re = psiRe[idx];
    im = psiIm[idx];
    density = re * re + im * im;
    phase = atan2(im, re) + TDSE_WG_PI;
  }

  let potentialVal = potential[idx];

  let normDensityRaw = select(density / params.maxDensity, 0.0, params.maxDensity <= 0.0);
  let densityGate = smoothstep(0.0, 0.02, normDensityRaw);

  var displayScalar: f32 = 0.0;
  if (params.fieldView == 0u) {
    displayScalar = normDensityRaw;
  } else if (params.fieldView == 1u) {
    displayScalar = phase * TDSE_WG_INV_TAU * densityGate;
  } else if (params.fieldView == 2u) {
    // current magnitude via central differences (NN) with PML-aware boundaries
    var currentMagSq: f32 = 0.0;
    let hbarOverM = params.hbar / max(params.mass, 1e-6);
    let hasPML = params.absorberEnabled != 0u;
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      if (params.gridSize[d] <= 1u) {
        continue;
      }
      let stride = params.strides[d];
      let coord = nnCoords[d];
      let Nd = params.gridSize[d];
      let invSpacing = 1.0 / params.spacing[d];
      let invDx = 0.5 * invSpacing;
      let atLo = coord == 0u;
      let atHi = coord == Nd - 1u;

      var dRe: f32;
      var dIm: f32;
      if (hasPML && atLo) {
        let fIdx = idx + stride;
        dRe = (psiRe[fIdx] - re) * invSpacing;
        dIm = (psiIm[fIdx] - im) * invSpacing;
      } else if (hasPML && atHi) {
        let bIdx = idx - stride;
        dRe = (re - psiRe[bIdx]) * invSpacing;
        dIm = (im - psiIm[bIdx]) * invSpacing;
      } else {
        let fwdIdx = select(idx + stride, idx - stride * (Nd - 1u), atHi);
        let bwdIdx = select(idx - stride, idx + stride * (Nd - 1u), atLo);
        dRe = (psiRe[fwdIdx] - psiRe[bwdIdx]) * invDx;
        dIm = (psiIm[fwdIdx] - psiIm[bwdIdx]) * invDx;
      }
      let jd = hbarOverM * (re * dIm - im * dRe);
      currentMagSq += jd * jd;
    }
    // Normalize current by maxDensity (same pattern as Dirac currentDensity).
    // j = ρ·v, so j/ρ_max ≈ v where density is significant. This maps
    // the current to a velocity-like scale where vortex flow is O(1) and
    // stationary states are ~0. The exp mapping provides soft saturation.
    let jMag = sqrt(currentMagSq);
    let jNorm = jMag / max(params.maxDensity, 1e-20);
    displayScalar = (1.0 - exp(-jNorm)) * densityGate;
  } else if (params.fieldView == 4u) {
    // superfluid velocity magnitude (NN) with PML-aware boundaries
    let vsqMag = computeSuperfluidVelocityMagSq(idx, re, im, density, &nnCoords);
    let cs2Peak = max(abs(params.interactionStrength) * params.maxDensity / max(params.mass, 1e-6), 1e-10);
    displayScalar = clamp(sqrt(vsqMag / cs2Peak), 0.0, 1.0) * densityGate;
  } else if (params.fieldView == 5u) {
    // healing length (NN)
    let absG = max(abs(params.interactionStrength), 1e-10);
    let denom = 2.0 * params.mass * absG * max(density, 1e-20);
    let xi = params.hbar / sqrt(denom);
    let xiRef = params.hbar / sqrt(2.0 * params.mass * absG * max(params.maxDensity, 1e-10));
    displayScalar = clamp(xiRef / max(xi, 1e-10), 0.0, 1.0) * densityGate;
  } else if (params.fieldView == 6u) {
    // machNumber M(x) = |v_s| / c_s. Analog black-hole horizon sits at M = 1.
    //
    // v_s from j/ρ: v_s = (ℏ/m) · Im(ψ*∇ψ) / |ψ|². Shares the same
    // probability-current helper as superfluidVelocity (fieldView 4), so the
    // colour agrees with that view at M = 1. c_s = √(g|ψ|²/m) is the local
    // Bogoliubov sound speed in natural units (ℏ absorbed into mass).
    let vsMagSq = computeSuperfluidVelocityMagSq(idx, re, im, density, &nnCoords);
    // c_s² = g|ψ|²/m (Bogoliubov). Guard against non-positive g or |ψ|²=0.
    let gAbs = max(abs(params.interactionStrength), 1e-10);
    let csSq = max(gAbs * density / max(params.mass, 1e-6), 1e-12);
    let vs = sqrt(vsMagSq);
    let cs = sqrt(csSq);
    let mach = vs / cs;
    // machNumber display mapping: identity-clamp so M = 1 → 1.0 exactly.
    // This gives the Analog-Horizon preset an unambiguous isosurface contract:
    // an iso-threshold of 1.0 in the Mach view lies precisely on the horizon
    // (c_s = v_s). Supersonic voxels saturate at 1.0 rather than being
    // separately differentiated — use the superfluidVelocity view for |v_s|.
    let machDisplay = clamp(mach, 0.0, 1.0);
    displayScalar = machDisplay * densityGate;
  } else if (params.fieldView == 3u) {
    // potential (NN)
    let potentialScale = getPotentialScale();
    let normPot = clamp(potentialVal / potentialScale, -1.0, 1.0);
    let potGate = smoothstep(0.0, 0.5, 1.0 - abs(potentialVal) / (potentialScale * 3.0));
    displayScalar = (0.5 + 0.5 * normPot) * max(densityGate, potGate);
  } else {
    displayScalar = 0.0;
  }

  // Analog-Hawking quantum-extremal island overlay. When a voxel lies in the
  // Page-curve island ball we (a) brighten its display scalar by islandBoost
  // (CPU-clamped to [1.0, 4.0]) and (b) shift its phase by +π/4 so the
  // existing phase-mixed colormap tints the region. Both effects land before
  // the final clamp so saturated voxels cap at 1.0 rather than wrapping.
  if (voxelIsInIsland(&nnCoords)) {
    displayScalar = displayScalar * params.islandBoost;
    phase = phase + 0.7853981633974483;
    if (phase >= TDSE_WG_TAU) {
      phase = phase - TDSE_WG_TAU;
    }
  }

  // ── Curved-space TDSE v2 Wave 6 visualization ────────────────────────────
  //
  // Proper-volume density view: |ψ|² → |ψ|²·√|g|. Only applied to the
  // density field view (fieldView == 0); phase / current / potential field
  // views carry no volume-form meaning so √|g| would be visually confusing.
  // On flat / torus metrics √|g| = 1 so this branch is a no-op.
  //
  // WARNING: auto-scale tracks the COORDINATE-volume maximum density, so in
  // proper mode the packet may appear dim or bright depending on where the
  // √|g| peak is relative to the packet support. The downstream 'clamp' to
  // [0, 1] prevents visual overflow, but users exploring with auto-scale
  // should be aware of the interaction.
  if (params.densityViewMode == 1u && params.fieldView == 0u) {
    let properSqrtDet = tdseCurvatureSqrtDet(ndWorldPos, params.latticeDim, params.simTime);
    displayScalar = displayScalar * properSqrtDet;
  }

  // Ricci-scalar curvature overlay (diverging sign(R)-keyed modulation).
  //
  // Because the write-grid output texture is scalar (R=density, G=log, B=
  // phase, A=dual-purpose) we cannot literally mix an RGB overlay colour
  // into the voxel here — the palette lives in the raymarch fragment stage.
  // Instead we re-use the display scalar: for R > 0 we bias the voxel
  // toward 1.0 (bright / hot side of the density palette) and for R < 0
  // toward 0.0 (dim / cool). |R| drives the blend strength via a soft
  // log·tanh mapping so large values saturate rather than overwhelm.
  //
  // Restricted to the density field view so we don't clash with the
  // island overlay's phase shift (fieldView == 1) or the potential-
  // overlay alpha encoding below. No-ops when:
  //   - toggle is off,
  //   - metric has zero Ricci (flat / torus / Schwarzschild),
  //   - |R| < 1e-6 (numerical floor — matches the plan's contract).
  //
  // The tint is gated by densityGate so empty voxels stay empty. Without
  // the gate, constant-positive-Ricci metrics (sphere2D) lifted every voxel
  // to ~tintFactor, which the raymarcher accumulated into a solid "white
  // cube" that hid the packet entirely. Gating keeps the tint bound to the
  // wavefunction support — the curvature signature is visible where the
  // packet is, which is also the only place the overlay is physically
  // meaningful.
  if (params.showCurvatureOverlay == 1u && params.fieldView == 0u) {
    let ricci = tdseCurvatureRicci(ndWorldPos, params.latticeDim, params.simTime);
    let absR = abs(ricci);
    if (absR >= 1e-6) {
      // |tanh(log(|R|+1))| — bounded soft-saturating magnitude in [0, 1).
      let magnitude = abs(tanh(log(absR + 1.0)));
      let tintFactor = clamp(magnitude, 0.0, 1.0)
        * clamp(params.curvatureOverlayOpacity, 0.0, 1.0)
        * densityGate;
      let tintVal = select(0.0, 1.0, ricci > 0.0);
      displayScalar = mix(displayScalar, tintVal, tintFactor);
    }
  }

  let normDensity = clamp(displayScalar * perpFalloff, 0.0, 1.0);
  let logDensity = log(normDensity + 1e-10);

  // Alpha channel dual encoding:
  // .a >= 0 → raw |ψ|² density (used by quantum carpet, always available)
  // .a <  0 → -potOverlay intensity (used by raymarcher potential overlay)
  //
  // Branch mode (branchingEnabled=1) overrides alpha with branch fraction:
  // .a in [2.0, 3.0] → branch fraction encoded as 2.0 + fraction (0=pure A, 1=pure B)
  // The 2.0 offset distinguishes branch data from both raw density and potential overlay.
  let rawDensityScaled = clamp(normDensityRaw * perpFalloff, 0.0, 1.0);
  var alphaChannel: f32 = rawDensityScaled;

  // NOTE: Branch fraction encoding (alpha = 2.0 + branchFrac) was previously
  // computed here when params.branchingEnabled == 1u. This triggered a Metal
  // shader compiler bug on Apple Silicon that corrupted texture sampling in the
  // fragment shader's raymarching loop. The branch fraction is now computed
  // directly in the fragment shader from the ray position, using branchPlanePosition
  // and spacing from SchroedingerUniforms. The TDSE uniform branchingEnabled field
  // is no longer written as 1 (always 0) — see TDSEComputePassUniforms.ts.
  if (params.showPotential == 1u && params.fieldView != 3u) {
    let potentialScale = getPotentialScale();
    let normPot = abs(potentialVal) / potentialScale;
    let fadeout = 1.0 - smoothstep(1.5, 3.0, normPot);
    var overlayGain: f32 = 1.0;
    if (params.potentialType == 4u || params.potentialType == 9u) {
      // Harmonic and BEC traps fill entire volume — low gain to stay translucent
      overlayGain = 0.03;
    }
    let potOverlay = clamp(normPot, 0.0, 1.0) * fadeout * overlayGain * perpFalloff;
    if (potOverlay > 0.01) {
      alphaChannel = -potOverlay;
    }
  }

  textureStore(outputTex, gid, vec4f(normDensity, logDensity, phase, alphaChannel));
}
`
