/**
 * Dirac Spinor Wavepacket Initialization Compute Shader
 *
 * Initializes the multi-component spinor field with a Gaussian wavepacket:
 *   ψ_c(x) = A · exp(-|x - x₀|²/(4σ²)) · exp(ik₀·x/ℏ) · u_c
 *
 * where u_c is the spinor polarization vector constructed from Bloch sphere
 * angles (spinTheta, spinPhi): u = (cos(θ/2), sin(θ/2)·e^{iφ}).
 * positiveEnergyFraction controls the particle/antiparticle mixing:
 *   1.0 = pure positive energy (P+ projected, when sparse Clifford tables are available)
 *   0.5 = equal mix (maximum Zitterbewegung)
 *   0.0 = pure negative energy (P- projected, when sparse Clifford tables are available)
 *
 * Initial condition modes:
 *   0 = gaussianPacket: Spin-polarized Gaussian with energy projection
 *   1 = planeWave: Same as gaussianPacket (σ set large on CPU)
 *   2 = standingWave: Two counter-propagating spin-polarized packets
 *   3 = zitterbewegung: Uses positiveEnergyFraction for mixing control
 *
 * Spinor buffer layout: single array<vec2f> where component c at site idx
 * occupies spinor[c*T + idx] = vec2f(re, im). One 8-byte complex load per
 * site replaces the prior split spinorRe/spinorIm f32 bindings.
 *
 * Two emitted variants:
 *   - 1D (@workgroup_size(64)): legacy linear dispatch using linearToND.
 *   - 3D (@workgroup_size(4, 4, 4)): direct gid.xyz coords for latticeDim ≤ 3.
 *     Eliminates the per-thread linearToND decode (firstTrailingBit + shift +
 *     mask per dim — strides are pow-of-2). Body and buffer access pattern
 *     are otherwise identical, so the spinor[c*T+idx] write set is the same.
 *
 * Requires diracUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @module
 */

const diracInitBindings = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: DiracUniforms;
@group(0) @binding(1) var<storage, read_write> spinor: array<vec2f>;
`

const diracInitBody = /* wgsl */ `
  // Compute physical position, Gaussian envelope, and plane-wave phase
  var r2: f32 = 0.0;
  var kdotx: f32 = 0.0;
  var initKVec: array<f32, 12>;
  var initCk2: f32 = 0.0;
  let initCHbar = params.speedOfLight * params.hbar;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let pos = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
    let dx = pos - params.packetCenter[d];
    let kd = params.packetMomentum[d];
    r2 += dx * dx;
    kdotx += kd * pos;
    initKVec[d] = kd;
    let cpk = initCHbar * kd;
    initCk2 += cpk * cpk;
  }

  let sigma = params.packetWidth;
  let invFourSigma2 = 1.0 / (4.0 * sigma * sigma);
  let envelope = exp(-r2 * invFourSigma2);
  // packetMomentum stores wavevector k_0 (units 1/length); phase = k_0 . x
  let phase = kdotx;
  let cosP = cos(phase);
  let sinP = sin(phase);

  let S = params.spinorSize;
  let T = params.totalSites;
  let initMc2 = params.mass * params.speedOfLight * params.speedOfLight;
  let initE2 = initCk2 + initMc2 * initMc2;
  let initInvE = inverseSqrt(max(initE2, 1e-40));
  let initE = initE2 * initInvE;
  let initProjectorNorm = sqrt((2.0 * initE) / max(initE + initMc2, 1e-20));

  // Zero all spinor components first
  for (var c: u32 = 0u; c < S; c++) {
    spinor[c * T + idx] = vec2f(0.0, 0.0);
  }

  // Spin polarization on the Bloch sphere: u = (cos(theta/2), sin(theta/2) e^{i phi})
  let cosHalf = cos(params.spinTheta * 0.5);
  let sinHalf = sin(params.spinTheta * 0.5);
  let phiCos = cos(params.spinPhi);
  let phiSin = sin(params.spinPhi);

  // Positive/negative energy amplitudes from positiveEnergyFraction
  let pef = clamp(params.positiveEnergyFraction, 0.0, 1.0);
  let pAmp = sqrt(pef);
  let aAmp = sqrt(1.0 - pef);
  let halfS = S / 2u;

  // CSE — these subexpressions repeat across branches and components:
  //   * Bloch-rotation product (cosP + i sinP)·(phiCos + i phiSin)
  //     yields the spin-down phase used by every component-1 / component-3
  //     write (4 sites in mode 0/1, 1 site in mode 3).
  //   * pAmp/aAmp × cosHalf/sinHalf × envelope is the real-amplitude
  //     factor before the cosP/sinP / spin-down-phase multiply. Caching
  //     these 4 products replaces 8 mul-chain per site with 4.
  let bdownCos = cosP * phiCos - sinP * phiSin;  // Re((cosP+i sinP)(phiCos+i phiSin))
  let bdownSin = sinP * phiCos + cosP * phiSin;  // Im(...)
  let pCosE = pAmp * cosHalf * envelope;
  let pSinE = pAmp * sinHalf * envelope;
  let aCosE = aAmp * cosHalf * envelope;
  let aSinE = aAmp * sinHalf * envelope;

  if ((params.initCondition == 0u || params.initCondition == 1u || params.initCondition == 3u)
      && DIRAC_USE_SPARSE_GAMMA) {
    // gaussianPacket / planeWave / zitterbewegung:
    // Build rest-frame upper/lower spinors, then apply exact free-particle
    // energy projectors P± = (I ± H/E)/2 for the packet carrier momentum.
    // This avoids contaminating "pure positive energy" packets with
    // representation-basis lower/upper components at non-zero momentum.
    var posBaseRe: array<f32, 64>;
    var posBaseIm: array<f32, 64>;
    var negBaseRe: array<f32, 64>;
    var negBaseIm: array<f32, 64>;
    var hPosRe: array<f32, 64>;
    var hPosIm: array<f32, 64>;
    var hNegRe: array<f32, 64>;
    var hNegIm: array<f32, 64>;
    for (var sc0: u32 = 0u; sc0 < S; sc0 = sc0 + 1u) {
      posBaseRe[sc0] = 0.0;
      posBaseIm[sc0] = 0.0;
      negBaseRe[sc0] = 0.0;
      negBaseIm[sc0] = 0.0;
      hPosRe[sc0] = 0.0;
      hPosIm[sc0] = 0.0;
      hNegRe[sc0] = 0.0;
      hNegIm[sc0] = 0.0;
    }

    posBaseRe[0] = cosHalf;
    if (S > 2u) {
      posBaseRe[1] = sinHalf * phiCos;
      posBaseIm[1] = sinHalf * phiSin;
    }
    negBaseRe[halfS] = cosHalf;
    if (S > halfS + 1u && S > 2u) {
      negBaseRe[halfS + 1u] = sinHalf * phiCos;
      negBaseIm[halfS + 1u] = sinHalf * phiSin;
    }

    for (var md: u32 = 0u; md < params.latticeDim; md = md + 1u) {
      let coeff = initCHbar * initKVec[md];
      if (abs(coeff) < 1e-20) {
        continue;
      }
      let tableBase = md * DIRAC_SPARSE_S;
      for (var row: u32 = 0u; row < S; row = row + 1u) {
        let t = tableBase + row;
        let col = DIRAC_SPARSE_COL[t];
        let gRe = DIRAC_SPARSE_RE[t];
        let gIm = DIRAC_SPARSE_IM[t];
        hPosRe[row] += coeff * (gRe * posBaseRe[col] - gIm * posBaseIm[col]);
        hPosIm[row] += coeff * (gRe * posBaseIm[col] + gIm * posBaseRe[col]);
        hNegRe[row] += coeff * (gRe * negBaseRe[col] - gIm * negBaseIm[col]);
        hNegIm[row] += coeff * (gRe * negBaseIm[col] + gIm * negBaseRe[col]);
      }
    }

    let betaTableBase = params.latticeDim * DIRAC_SPARSE_S;
    for (var rowB: u32 = 0u; rowB < S; rowB = rowB + 1u) {
      let t = betaTableBase + rowB;
      let col = DIRAC_SPARSE_COL[t];
      let gRe = DIRAC_SPARSE_RE[t];
      let gIm = DIRAC_SPARSE_IM[t];
      hPosRe[rowB] += initMc2 * (gRe * posBaseRe[col] - gIm * posBaseIm[col]);
      hPosIm[rowB] += initMc2 * (gRe * posBaseIm[col] + gIm * posBaseRe[col]);
      hNegRe[rowB] += initMc2 * (gRe * negBaseRe[col] - gIm * negBaseIm[col]);
      hNegIm[rowB] += initMc2 * (gRe * negBaseIm[col] + gIm * negBaseRe[col]);
    }

    let halfProjNorm = 0.5 * initProjectorNorm;
    for (var scP: u32 = 0u; scP < S; scP = scP + 1u) {
      let posRe = halfProjNorm * (posBaseRe[scP] + hPosRe[scP] * initInvE);
      let posIm = halfProjNorm * (posBaseIm[scP] + hPosIm[scP] * initInvE);
      let negRe = halfProjNorm * (negBaseRe[scP] - hNegRe[scP] * initInvE);
      let negIm = halfProjNorm * (negBaseIm[scP] - hNegIm[scP] * initInvE);
      let projectedRe = envelope * (pAmp * posRe + aAmp * negRe);
      let projectedIm = envelope * (pAmp * posIm + aAmp * negIm);
      spinor[scP * T + idx] = vec2f(
        projectedRe * cosP - projectedIm * sinP,
        projectedRe * sinP + projectedIm * cosP
      );
    }

  } else if (params.initCondition == 0u || params.initCondition == 1u) {
    // gaussianPacket / planeWave: spin-polarized packet with energy projection
    // Upper (particle) spinor
    spinor[idx] = vec2f(pCosE * cosP, pCosE * sinP);
    if (S > 1u) {
      spinor[1u * T + idx] = vec2f(pSinE * bdownCos, pSinE * bdownSin);
    }
    // Lower (antiparticle) spinor
    if (aAmp > 1e-10 && halfS > 0u) {
      spinor[halfS * T + idx] = vec2f(aCosE * cosP, aCosE * sinP);
      if (S > halfS + 1u) {
        spinor[(halfS + 1u) * T + idx] = vec2f(aSinE * bdownCos, aSinE * bdownSin);
      }
    }

  } else if (params.initCondition == 2u) {
    // standingWave: superposition of +k and -k spin-polarized packets
    const INV_SQRT2: f32 = 0.70710678118654752;
    let env1 = INV_SQRT2 * envelope;
    var r2b: f32 = 0.0;
    var kdotx2: f32 = 0.0;
    for (var d2: u32 = 0u; d2 < params.latticeDim; d2 = d2 + 1u) {
      let pos2 = (f32(coords[d2]) - f32(params.gridSize[d2]) * 0.5 + 0.5) * params.spacing[d2];
      let dx2 = pos2 + params.packetCenter[d2];
      r2b += dx2 * dx2;
      kdotx2 += -params.packetMomentum[d2] * pos2;
    }
    let env2 = INV_SQRT2 * exp(-r2b * invFourSigma2);
    let cosP2 = cos(kdotx2);
    let sinP2 = sin(kdotx2);

    // Cache the two combined-envelope projections (used 2x for re, 2x for im).
    let combinedCos = env1 * cosP + env2 * cosP2;
    let combinedSin = env1 * sinP + env2 * sinP2;

    // Standing-wave envelope is independent of cosHalf/sinHalf, so the
    // base amplitude pAmp·cosHalf / pAmp·sinHalf is reused unscaled.
    let pCos = pAmp * cosHalf;
    let pSin = pAmp * sinHalf;
    // Component 0: spin-up from both packets
    spinor[idx] = vec2f(pCos * combinedCos, pCos * combinedSin);
    // Component 1: spin-down
    if (S > 1u) {
      spinor[1u * T + idx] = vec2f(
        pSin * (combinedCos * phiCos - combinedSin * phiSin),
        pSin * (combinedSin * phiCos + combinedCos * phiSin)
      );
    }

  } else if (params.initCondition == 3u) {
    // zitterbewegung: uses positiveEnergyFraction to control mixing
    // (pef=0.5 gives maximum Zitterbewegung, equal upper/lower).
    // Reuses the bdownCos / bdownSin / p*E / a*E CSE blocks computed above.
    spinor[idx] = vec2f(pCosE * cosP, pCosE * sinP);
    if (S > 1u) {
      spinor[1u * T + idx] = vec2f(pSinE * bdownCos, pSinE * bdownSin);
    }
    // Lower spinor
    if (halfS > 0u) {
      spinor[halfS * T + idx] = vec2f(aCosE * cosP, aCosE * sinP);
      if (S > halfS + 1u) {
        spinor[(halfS + 1u) * T + idx] = vec2f(aSinE * bdownCos, aSinE * bdownSin);
      }
    }
  }
}
`

/**
 * Legacy 1D dispatch variant. Workgroup size 64. Uses linearToND to decode
 * the linear thread index into N-D coords.
 */
export const diracInitBlock = /* wgsl */ `${diracInitBindings}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  // Convert linear index to N-D coordinates
  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);
${diracInitBody}`

/**
 * 3-D dispatch variant for latticeDim <= 3. Workgroup size 4x4x4. Reads coords
 * directly from gid.xyz, eliminating the per-thread linearToND decode. Caller
 * must dispatch (ceil(N0/4), ceil(N1/4), ceil(N2/4)) with axes beyond
 * latticeDim clamped to 1.
 */
export const diracInitBlock3D = /* wgsl */ `${diracInitBindings}
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let latDim = params.latticeDim;
  // Bounds: only check axes that actually correspond to a lattice dimension.
  // Dispatch shape clamps unused axes to 1, so gid.y/gid.z are 0 there.
  if (gid.x >= params.gridSize[0]) { return; }
  if (latDim > 1u && gid.y >= params.gridSize[1]) { return; }
  if (latDim > 2u && gid.z >= params.gridSize[2]) { return; }

  // Build coords directly from gid.xyz; unused axes stay at 0 (ndToLinear
  // ignores them since it loops only to latDim).
  var coords: array<u32, 12>;
  coords[0] = gid.x;
  if (latDim > 1u) { coords[1] = gid.y; }
  if (latDim > 2u) { coords[2] = gid.z; }

  let idx = ndToLinear(coords, params.strides, latDim);
${diracInitBody}`
