/**
 * Dirac Spinor Wavepacket Initialization Compute Shader
 *
 * Initializes the multi-component spinor field with a Gaussian wavepacket:
 *   ψ_c(x) = A · exp(-|x - x₀|²/(4σ²)) · exp(ik₀·x/ℏ) · u_c
 *
 * where u_c is the spinor polarization vector constructed from Bloch sphere
 * angles (spinTheta, spinPhi): u = (cos(θ/2), sin(θ/2)·e^{iφ}).
 * positiveEnergyFraction controls the particle/antiparticle mixing:
 *   1.0 = pure positive energy (upper spinor only)
 *   0.5 = equal mix (maximum Zitterbewegung)
 *   0.0 = pure negative energy (lower spinor only)
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
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let pos = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
    let dx = pos - params.packetCenter[d];
    r2 += dx * dx;
    kdotx += params.packetMomentum[d] * pos;
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

  if (params.initCondition == 0u || params.initCondition == 1u) {
    // gaussianPacket / planeWave: spin-polarized packet with energy projection
    // Upper (particle) spinor
    spinor[idx] = vec2f(pAmp * cosHalf * envelope * cosP,
                        pAmp * cosHalf * envelope * sinP);
    if (S > 1u) {
      spinor[1u * T + idx] = vec2f(
        pAmp * sinHalf * envelope * (cosP * phiCos - sinP * phiSin),
        pAmp * sinHalf * envelope * (sinP * phiCos + cosP * phiSin)
      );
    }
    // Lower (antiparticle) spinor
    if (aAmp > 1e-10 && halfS > 0u) {
      spinor[halfS * T + idx] = vec2f(aAmp * cosHalf * envelope * cosP,
                                      aAmp * cosHalf * envelope * sinP);
      if (S > halfS + 1u) {
        spinor[(halfS + 1u) * T + idx] = vec2f(
          aAmp * sinHalf * envelope * (cosP * phiCos - sinP * phiSin),
          aAmp * sinHalf * envelope * (sinP * phiCos + cosP * phiSin)
        );
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

    // Component 0: spin-up from both packets
    spinor[idx] = vec2f(pAmp * cosHalf * combinedCos, pAmp * cosHalf * combinedSin);
    // Component 1: spin-down
    if (S > 1u) {
      spinor[1u * T + idx] = vec2f(
        pAmp * sinHalf * (combinedCos * phiCos - combinedSin * phiSin),
        pAmp * sinHalf * (combinedSin * phiCos + combinedCos * phiSin)
      );
    }

  } else if (params.initCondition == 3u) {
    // zitterbewegung: uses positiveEnergyFraction to control mixing
    // (pef=0.5 gives maximum Zitterbewegung, equal upper/lower)
    // Upper spinor
    spinor[idx] = vec2f(pAmp * cosHalf * envelope * cosP,
                        pAmp * cosHalf * envelope * sinP);
    if (S > 1u) {
      spinor[1u * T + idx] = vec2f(
        pAmp * sinHalf * envelope * (cosP * phiCos - sinP * phiSin),
        pAmp * sinHalf * envelope * (sinP * phiCos + cosP * phiSin)
      );
    }
    // Lower spinor
    if (halfS > 0u) {
      spinor[halfS * T + idx] = vec2f(aAmp * cosHalf * envelope * cosP,
                                      aAmp * cosHalf * envelope * sinP);
      if (S > halfS + 1u) {
        spinor[(halfS + 1u) * T + idx] = vec2f(
          aAmp * sinHalf * envelope * (cosP * phiCos - sinP * phiSin),
          aAmp * sinHalf * envelope * (sinP * phiCos + cosP * phiSin)
        );
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
