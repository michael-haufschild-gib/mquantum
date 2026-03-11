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
 * Requires diracUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const diracInitBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: DiracUniforms;
@group(0) @binding(1) var<storage, read_write> spinorRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> spinorIm: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  // Convert linear index to N-D coordinates
  let coords = linearToND(idx, params.gridSize, params.latticeDim);

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
  let envelope = exp(-r2 / (4.0 * sigma * sigma));
  let phase = kdotx / params.hbar;
  let cosP = cos(phase);
  let sinP = sin(phase);

  // Zero all spinor components first
  for (var c: u32 = 0u; c < params.spinorSize; c++) {
    let bufIdx = c * params.totalSites + idx;
    spinorRe[bufIdx] = 0.0;
    spinorIm[bufIdx] = 0.0;
  }

  // Spin polarization on the Bloch sphere: u = (cos(θ/2), sin(θ/2)·e^{iφ})
  let cosHalf = cos(params.spinTheta * 0.5);
  let sinHalf = sin(params.spinTheta * 0.5);
  let phiCos = cos(params.spinPhi);
  let phiSin = sin(params.spinPhi);

  // Positive/negative energy amplitudes from positiveEnergyFraction
  let pef = clamp(params.positiveEnergyFraction, 0.0, 1.0);
  let pAmp = sqrt(pef);
  let aAmp = sqrt(1.0 - pef);
  let S = params.spinorSize;
  let halfS = S / 2u;

  if (params.initCondition == 0u || params.initCondition == 1u) {
    // gaussianPacket / planeWave: spin-polarized packet with energy projection
    // Upper (particle) spinor: pAmp · u · envelope · e^{ikx}
    spinorRe[idx] = pAmp * cosHalf * envelope * cosP;
    spinorIm[idx] = pAmp * cosHalf * envelope * sinP;
    if (S > 1u) {
      let bufIdx1 = 1u * params.totalSites + idx;
      spinorRe[bufIdx1] = pAmp * sinHalf * envelope * (cosP * phiCos - sinP * phiSin);
      spinorIm[bufIdx1] = pAmp * sinHalf * envelope * (sinP * phiCos + cosP * phiSin);
    }
    // Lower (antiparticle) spinor: aAmp · u · envelope · e^{ikx}
    if (aAmp > 1e-10 && halfS > 0u) {
      let bufIdxH0 = halfS * params.totalSites + idx;
      spinorRe[bufIdxH0] = aAmp * cosHalf * envelope * cosP;
      spinorIm[bufIdxH0] = aAmp * cosHalf * envelope * sinP;
      if (S > halfS + 1u) {
        let bufIdxH1 = (halfS + 1u) * params.totalSites + idx;
        spinorRe[bufIdxH1] = aAmp * sinHalf * envelope * (cosP * phiCos - sinP * phiSin);
        spinorIm[bufIdxH1] = aAmp * sinHalf * envelope * (sinP * phiCos + cosP * phiSin);
      }
    }

  } else if (params.initCondition == 2u) {
    // standingWave: superposition of +k and -k spin-polarized packets
    let env1 = 0.7071 * envelope;
    var r2b: f32 = 0.0;
    var kdotx2: f32 = 0.0;
    for (var d2: u32 = 0u; d2 < params.latticeDim; d2++) {
      let pos2 = (f32(coords[d2]) - f32(params.gridSize[d2]) * 0.5 + 0.5) * params.spacing[d2];
      let dx2 = pos2 + params.packetCenter[d2];
      r2b += dx2 * dx2;
      kdotx2 += -params.packetMomentum[d2] * pos2;
    }
    let env2 = 0.7071 * exp(-r2b / (4.0 * sigma * sigma));
    let phase2 = kdotx2 / params.hbar;
    let cosP2 = cos(phase2);
    let sinP2 = sin(phase2);

    // Component 0: spin-up from both packets
    let re0 = pAmp * cosHalf * (env1 * cosP + env2 * cosP2);
    let im0 = pAmp * cosHalf * (env1 * sinP + env2 * sinP2);
    spinorRe[idx] = re0;
    spinorIm[idx] = im0;
    // Component 1: spin-down
    if (S > 1u) {
      let bufIdx1 = 1u * params.totalSites + idx;
      spinorRe[bufIdx1] = pAmp * sinHalf * ((env1 * cosP + env2 * cosP2) * phiCos - (env1 * sinP + env2 * sinP2) * phiSin);
      spinorIm[bufIdx1] = pAmp * sinHalf * ((env1 * sinP + env2 * sinP2) * phiCos + (env1 * cosP + env2 * cosP2) * phiSin);
    }

  } else if (params.initCondition == 3u) {
    // zitterbewegung: uses positiveEnergyFraction to control mixing
    // (pef=0.5 gives maximum Zitterbewegung, equal upper/lower)
    // Upper spinor
    spinorRe[idx] = pAmp * cosHalf * envelope * cosP;
    spinorIm[idx] = pAmp * cosHalf * envelope * sinP;
    if (S > 1u) {
      let bufIdx1 = 1u * params.totalSites + idx;
      spinorRe[bufIdx1] = pAmp * sinHalf * envelope * (cosP * phiCos - sinP * phiSin);
      spinorIm[bufIdx1] = pAmp * sinHalf * envelope * (sinP * phiCos + cosP * phiSin);
    }
    // Lower spinor
    if (halfS > 0u) {
      let bufIdxH0 = halfS * params.totalSites + idx;
      spinorRe[bufIdxH0] = aAmp * cosHalf * envelope * cosP;
      spinorIm[bufIdxH0] = aAmp * cosHalf * envelope * sinP;
      if (S > halfS + 1u) {
        let bufIdxH1 = (halfS + 1u) * params.totalSites + idx;
        spinorRe[bufIdxH1] = aAmp * sinHalf * envelope * (cosP * phiCos - sinP * phiSin);
        spinorIm[bufIdxH1] = aAmp * sinHalf * envelope * (sinP * phiCos + cosP * phiSin);
      }
    }
  }
}
`
