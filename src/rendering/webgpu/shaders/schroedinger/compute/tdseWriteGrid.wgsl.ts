/**
 * TDSE — Write to 3D Density Grid Compute Shader
 *
 * Writes the N-D TDSE wavefunction data into a 3D density texture for raymarching.
 * Same contract as freeScalarWriteGrid: basis-rotated slicing, model-space output.
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
// Each type uses only its own parameters to avoid cross-contamination from defaults.
fn getPotentialScale() -> f32 {
  if (params.potentialType == 1u || params.potentialType == 5u) {
    // barrier / driven
    return max(params.barrierHeight, 1.0);
  } else if (params.potentialType == 2u) {
    // step
    return max(params.stepHeight, 1.0);
  } else if (params.potentialType == 3u) {
    // finiteWell
    return max(abs(params.wellDepth), 1.0);
  } else if (params.potentialType == 4u) {
    // harmonicTrap — scale by V at half the bounding radius
    let r = params.boundingRadius * 0.5;
    return max(0.5 * params.mass * params.harmonicOmega * params.harmonicOmega * r * r, 1.0);
  } else if (params.potentialType == 6u) {
    // doubleSlit
    return max(params.wallHeight, 1.0);
  } else if (params.potentialType == 7u) {
    // periodicLattice
    return max(params.latticeDepth, 1.0);
  } else if (params.potentialType == 8u) {
    // doubleWell — barrier height is λa⁴
    let a2 = params.doubleWellSeparation * params.doubleWellSeparation;
    return max(params.doubleWellLambda * a2 * a2, 1.0);
  }
  return 1.0;
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

  // Convert N-D world position to lattice coordinates
  var coords: array<u32, 12>;
  var inBounds: bool = true;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let halfExtent = f32(params.gridSize[d]) * params.spacing[d] * 0.5;
    let coordF = (ndWorldPos[d] + halfExtent) / params.spacing[d];
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

  let idx = ndToLinear(coords, params.strides, params.latticeDim);
  let re = psiRe[idx];
  let im = psiIm[idx];
  let potentialVal = potential[idx];

  // Probability density |psi|^2
  let density = re * re + im * im;
  // Phase angle arg(psi) in [0, 2*pi]
  let phase = atan2(im, re) + 3.14159265;

  // Encode selected field into display scalar [0,1] for the density-grid contract.
  var displayScalar: f32 = 0.0;
  if (params.fieldView == 0u) {
    // density
    displayScalar = select(density / params.maxDensity, density, params.maxDensity <= 0.0);
  } else if (params.fieldView == 1u) {
    // phase
    displayScalar = phase / (2.0 * 3.14159265);
  } else if (params.fieldView == 2u) {
    // current magnitude — compute probability current j via central differences
    // j_d = (hbar / m) * Im(conj(psi) * d_d psi)
    var currentMagSq: f32 = 0.0;
    let hbarOverM = params.hbar / max(params.mass, 1e-6);
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      if (params.gridSize[d] <= 1u) {
        continue;
      }
      // Stride-based neighbor lookup: O(1) instead of O(D) per neighbor
      let stride = params.strides[d];
      let coord = coords[d];
      let fwdIdx = select(idx + stride, idx - stride * (params.gridSize[d] - 1u), coord == params.gridSize[d] - 1u);
      let bwdIdx = select(idx - stride, idx + stride * (params.gridSize[d] - 1u), coord == 0u);
      let invDx = 0.5 / params.spacing[d];
      let dRe = (psiRe[fwdIdx] - psiRe[bwdIdx]) * invDx;
      let dIm = (psiIm[fwdIdx] - psiIm[bwdIdx]) * invDx;
      let jd = hbarOverM * (re * dIm - im * dRe);
      currentMagSq += jd * jd;
    }
    displayScalar = 1.0 - exp(-sqrt(currentMagSq));
  } else {
    // potential
    let potentialScale = getPotentialScale();
    displayScalar = 0.5 + 0.5 * tanh(potentialVal / potentialScale);
  }

  let normDensity = clamp(displayScalar, 0.0, 1.0);
  let logDensity = log(normDensity + 1e-10);

  // Potential overlay: encode normalized V(x) in alpha channel for raymarcher.
  // The raymarcher accumulates overlay opacity per-step, so thin potentials
  // (barrier: 2 steps) work fine at full scale, but smooth/unbounded potentials
  // (harmonic, doubleWell: 20-30 steps) saturate to opaque. We reduce the
  // per-voxel overlay for wide potentials and fade out confining walls.
  var potOverlay: f32 = 0.0;
  if (params.showPotential == 1u && params.fieldView != 3u) {
    let potentialScale = getPotentialScale();
    let normPot = abs(potentialVal) / potentialScale;
    let fadeout = 1.0 - smoothstep(1.5, 3.0, normPot);
    // Bounded step-function potentials (barrier, step, well, slit) occupy thin
    // regions — full overlay is fine. Smooth/unbounded potentials span many voxels
    // and need reduced gain to prevent volumetric saturation.
    var overlayGain: f32 = 1.0;
    if (params.potentialType == 4u || params.potentialType == 8u) {
      overlayGain = 0.03;
    }
    potOverlay = clamp(normPot, 0.0, 1.0) * fadeout * overlayGain;
  }

  textureStore(outputTex, gid, vec4f(normDensity, logDensity, phase, potOverlay));
}
`
