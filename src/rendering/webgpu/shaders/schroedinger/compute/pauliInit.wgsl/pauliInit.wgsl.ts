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
 * Component layout: spinor[c * totalSites + idx] = vec2f(re, im),
 *                   c ∈ {0=up, 1=down}.
 *
 * Initial condition modes:
 *   0 (gaussianSpinUp):        ψ_up = envelope·e^{ikx}, ψ_down = 0
 *   1 (gaussianSpinDown):      ψ_up = 0, ψ_down = envelope·e^{ikx}
 *   2 (gaussianSuperposition): Bloch-sphere state χ = (cos(θ/2), sin(θ/2)·e^{iφ})
 *   3 (planeWaveSpinor):       Bloch-sphere state with flat envelope (no Gaussian)
 *
 * Buffer layout: merged spinor: array<vec2f> where
 *   spinor[c * totalSites + idx] = vec2f(re, im)  (c=0 up, c=1 down).
 * One 8-byte vec2f store per component instead of two 4-byte scalar stores.
 *
 * Requires pauliUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * Two variants share the same body:
 *   pauliInitBlock   — 1D dispatch, @workgroup_size(64), uses linearToND()
 *   pauliInit3DBlock — 3D dispatch, @workgroup_size(4, 4, 4), reads gid.xyz
 *                      directly. Used for latticeDim == 3 to eliminate the
 *                      ~3 integer shifts in linearToND per thread.
 *
 * @workgroup_size(64)
 * @module
 */

export const pauliInitBlock = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: PauliUniforms;
@group(0) @binding(1) var<storage, read_write> spinor: array<vec2f>;

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
  // packetMomentum stores wavevector k₀ (units 1/length); phase = k₀·x
  let phase = kdotx;
  let cosP = cos(phase);
  let sinP = sin(phase);

  let T = params.totalSites;
  let idx1 = T + idx;

  // Bloch sphere spin state: χ = (cos(θ/2), sin(θ/2)·e^{iφ})
  let cosHalf = cos(params.spinTheta * 0.5);
  let sinHalf = sin(params.spinTheta * 0.5);
  let phiCos = cos(params.spinPhi);
  let phiSin = sin(params.spinPhi);

  if (params.initCondition == 0u) {
    // gaussianSpinUp: only spin-up component populated
    spinor[idx] = vec2f(envelope * cosP, envelope * sinP);
    spinor[idx1] = vec2f(0.0, 0.0);

  } else if (params.initCondition == 1u) {
    // gaussianSpinDown: only spin-down component populated
    spinor[idx] = vec2f(0.0, 0.0);
    spinor[idx1] = vec2f(envelope * cosP, envelope * sinP);

  } else if (params.initCondition == 2u) {
    // gaussianSuperposition: Bloch-sphere state with Gaussian envelope
    // spin-up:   cosHalf · envelope · e^{ikx}
    // spin-down: sinHalf · e^{iφ} · envelope · e^{ikx}
    // Cache cosHalf·envelope (mirrors existing sinHEnv cache) — saves one
    // mul per voxel by reusing the product across both real and imag writes.
    let rotRe = cosP * phiCos - sinP * phiSin;
    let rotIm = sinP * phiCos + cosP * phiSin;
    let cosHEnv = cosHalf * envelope;
    let sinHEnv = sinHalf * envelope;
    spinor[idx] = vec2f(cosHEnv * cosP, cosHEnv * sinP);
    spinor[idx1] = vec2f(sinHEnv * rotRe, sinHEnv * rotIm);

  } else if (params.initCondition == 3u) {
    // planeWaveSpinor: flat envelope (plane wave limit) with Bloch-sphere spin
    // Uses unit amplitude everywhere — the absorbing boundary prevents edge wrap.
    let rotRe = cosP * phiCos - sinP * phiSin;
    let rotIm = sinP * phiCos + cosP * phiSin;
    spinor[idx] = vec2f(cosHalf * cosP, cosHalf * sinP);
    spinor[idx1] = vec2f(sinHalf * rotRe, sinHalf * rotIm);
  }
}
`

/**
 * 3D-dispatch variant of pauliInit (latticeDim == 3 only).
 * Reads gid.xyz directly and computes the linear buffer index from strides[0..2]
 * — no linearToND() call, no temporary coords array. Identical body otherwise,
 * so output is bit-identical to pauliInitBlock for any (gx, gy, gz) on a 3D grid.
 */
export const pauliInit3DBlock = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: PauliUniforms;
@group(0) @binding(1) var<storage, read_write> spinor: array<vec2f>;

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  // Defensive bounds check (dead in practice: Pauli sanitizes gridSize to
  // power-of-2 with per-axis min 8, all multiples of 4).
  if (gid.x >= params.gridSize[0] || gid.y >= params.gridSize[1] || gid.z >= params.gridSize[2]) {
    return;
  }

  // Direct linear-index computation: 3 mul-adds, no shifts/divides, no array.
  let idx = gid.x * params.strides[0] + gid.y * params.strides[1] + gid.z * params.strides[2];

  // Coords vector for physical-position formula (matches the linearToND output
  // for the 1D variant when latticeDim == 3).
  var coords: array<u32, 12>;
  coords[0] = gid.x;
  coords[1] = gid.y;
  coords[2] = gid.z;

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
  let phase = kdotx;
  let cosP = cos(phase);
  let sinP = sin(phase);

  let T = params.totalSites;
  let idx1 = T + idx;

  let cosHalf = cos(params.spinTheta * 0.5);
  let sinHalf = sin(params.spinTheta * 0.5);
  let phiCos = cos(params.spinPhi);
  let phiSin = sin(params.spinPhi);

  if (params.initCondition == 0u) {
    spinor[idx] = vec2f(envelope * cosP, envelope * sinP);
    spinor[idx1] = vec2f(0.0, 0.0);

  } else if (params.initCondition == 1u) {
    spinor[idx] = vec2f(0.0, 0.0);
    spinor[idx1] = vec2f(envelope * cosP, envelope * sinP);

  } else if (params.initCondition == 2u) {
    let rotRe = cosP * phiCos - sinP * phiSin;
    let rotIm = sinP * phiCos + cosP * phiSin;
    let sinHEnv = sinHalf * envelope;
    spinor[idx] = vec2f(cosHalf * envelope * cosP, cosHalf * envelope * sinP);
    spinor[idx1] = vec2f(sinHEnv * rotRe, sinHEnv * rotIm);

  } else if (params.initCondition == 3u) {
    let rotRe = cosP * phiCos - sinP * phiSin;
    let rotIm = sinP * phiCos + cosP * phiSin;
    spinor[idx] = vec2f(cosHalf * cosP, cosHalf * sinP);
    spinor[idx1] = vec2f(sinHalf * rotRe, sinHalf * rotIm);
  }
}
`
