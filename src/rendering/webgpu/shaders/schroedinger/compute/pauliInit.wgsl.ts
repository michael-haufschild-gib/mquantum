/**
 * Pauli Spinor Wavepacket Initialization Compute Shader
 *
 * Initializes the 2-component Pauli spinor from a Gaussian wavepacket
 * multiplied by an initial spin state on the Bloch sphere:
 *
 *   ψ(x) = A · exp(-|x - x₀|²/(4σ²)) · exp(ik₀·x/ℏ) · χ
 *
 * where χ is the spin-½ state determined by (spinTheta, spinPhi).
 *
 * Component layout: spinorRe/Im[c * totalSites + idx], c ∈ {0=up, 1=down}.
 *
 * Initial condition modes:
 *   0 (gaussianSpinUp):        ψ_up = envelope·e^{ikx}, ψ_down = 0
 *   1 (gaussianSpinDown):      ψ_up = 0, ψ_down = envelope·e^{ikx}
 *   2 (gaussianSuperposition): Bloch-sphere state χ = (cos(θ/2), sin(θ/2)·e^{iφ})
 *   3 (planeWaveSpinor):       Bloch-sphere state with flat envelope (no Gaussian)
 *
 * Requires pauliUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const pauliInitBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: PauliUniforms;
@group(0) @binding(1) var<storage, read_write> spinorRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> spinorIm: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  // Convert linear index to N-D coordinates
  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);

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
  let phase = kdotx / params.hbar;
  let cosP = cos(phase);
  let sinP = sin(phase);

  let T = params.totalSites;

  // Bloch sphere spin state: χ = (cos(θ/2), sin(θ/2)·e^{iφ})
  let cosHalf = cos(params.spinTheta * 0.5);
  let sinHalf = sin(params.spinTheta * 0.5);
  let phiCos = cos(params.spinPhi);
  let phiSin = sin(params.spinPhi);

  if (params.initCondition == 0u) {
    // gaussianSpinUp: only spin-up component populated
    spinorRe[idx] = envelope * cosP;
    spinorIm[idx] = envelope * sinP;
    spinorRe[T + idx] = 0.0;
    spinorIm[T + idx] = 0.0;

  } else if (params.initCondition == 1u) {
    // gaussianSpinDown: only spin-down component populated
    spinorRe[idx] = 0.0;
    spinorIm[idx] = 0.0;
    spinorRe[T + idx] = envelope * cosP;
    spinorIm[T + idx] = envelope * sinP;

  } else if (params.initCondition == 2u) {
    // gaussianSuperposition: Bloch-sphere state with Gaussian envelope
    // spin-up:   cosHalf · envelope · e^{ikx}
    // spin-down: sinHalf · e^{iφ} · envelope · e^{ikx}

    spinorRe[idx] = cosHalf * envelope * cosP;
    spinorIm[idx] = cosHalf * envelope * sinP;
    spinorRe[T + idx] = sinHalf * envelope * (cosP * phiCos - sinP * phiSin);
    spinorIm[T + idx] = sinHalf * envelope * (sinP * phiCos + cosP * phiSin);

  } else if (params.initCondition == 3u) {
    // planeWaveSpinor: flat envelope (plane wave limit) with Bloch-sphere spin
    // Uses unit amplitude everywhere — the absorbing boundary prevents edge wrap.
    spinorRe[idx] = cosHalf * cosP;
    spinorIm[idx] = cosHalf * sinP;
    spinorRe[T + idx] = sinHalf * (cosP * phiCos - sinP * phiSin);
    spinorIm[T + idx] = sinHalf * (sinP * phiCos + cosP * phiSin);
  }
}
`
