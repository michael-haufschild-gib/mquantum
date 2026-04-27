/**
 * Pauli Kinetic Phase Kick Compute Shader (k-space)
 *
 * Applies the free-particle kinetic propagator in momentum space:
 *
 *   ψ̃_c(k) → exp(-i · ℏk² · dt / (2m)) · ψ̃_c(k)
 *
 * Since the Pauli kinetic term p²/(2m) is a scalar operator (identity in
 * spinor space), both spinor components receive the same phase rotation
 * independently. No inter-component mixing occurs.
 *
 * This shader operates on the FFT-transformed spinor buffers. The k² for
 * each mode is computed from the N-D FFT frequency ordering:
 *
 *   kd = (idx_d < N/2) ? idx_d : idx_d - N         [integer frequency]
 *   k_physical_d = 2π · kd / (N · spacing[d])
 *   k² = Σ_d k_physical_d²
 *
 * Phase: phase = ℏ · k² · dt / (2 · mass)
 * Rotation: ψ̃_c → (cos(phase) + i·sin(phase)) · ψ̃_c
 *
 * Requires pauliUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * Two variants:
 *   pauliKineticBlock    — 1D dispatch, @workgroup_size(64), uses linearToND().
 *   pauliKinetic3DBlock  — 3D dispatch, @workgroup_size(4, 4, 4), reads gid.xyz
 *                          directly (latticeDim == 3 only). Saves the
 *                          per-thread linearToND k-coord decode.
 *
 * @module
 */

const pauliKineticBindings = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: PauliUniforms;
@group(0) @binding(1) var<storage, read_write> spinor: array<vec2f>;
`

const pauliKineticBody = /* wgsl */ `
  // Compute k² using FFT frequency ordering.
  // PERF: k_phys = kGridScale[d] · kIdx uses a host-precomputed reciprocal so
  // each thread replaces a per-dim divide with a multiply. kGridScale[d] =
  // 2π / (N_d · a_d). Mirrors TDSE/Dirac kinetic kernels.
  // PERF: k² is sign-invariant, so |k_d| = min(coord, N − coord) drops the
  // signed cast (i32 cd, i32 gdI, select) for one u32 sub + one min per dim.
  const PAULI_TWO_PI: f32 = 6.28318530717958647692;
  var k2: f32 = 0.0;
  let ldim = params.latticeDim;
  for (var d: u32 = 0u; d < ldim; d = d + 1u) {
    let n = params.gridSize[d];
    let kAbs = min(coords[d], n - coords[d]);
    let kPhys = params.kGridScale[d] * f32(kAbs);
    k2 += kPhys * kPhys;
  }

  // Kinetic phase: e^{-i ℏ k² dt / (2m)}. Hoist the uniform-only prefactor
  // (-0.5·ℏ·dt/max(m,ε)) so k² becomes a single multiply per thread.
  let kineticCoef = -(0.5 * params.hbar * params.dt) / max(params.mass, 1e-6);
  let phase = k2 * kineticCoef;
  // Reduce to [-π, π] so f32 cos/sin stay precise for high-frequency k-modes
  const PAULI_INV_TAU: f32 = 0.15915494309189535;
  let reduced = phase - round(phase * PAULI_INV_TAU) * PAULI_TWO_PI;
  let cosP = cos(reduced);
  let sinP = sin(reduced);

  // Apply the same phase rotation to both spinor components independently.
  // Merged vec2f layout: one 8-byte load + one 8-byte store per component.
  let T = params.totalSites;
  let idx1 = T + idx;

  // Spin-up (c=0)
  let v0 = spinor[idx];
  spinor[idx] = vec2f(v0.x * cosP - v0.y * sinP, v0.x * sinP + v0.y * cosP);

  // Spin-down (c=1)
  let v1 = spinor[idx1];
  spinor[idx1] = vec2f(v1.x * cosP - v1.y * sinP, v1.x * sinP + v1.y * cosP);
}
`

/** Legacy 1-D dispatch. Workgroup size 64. */
export const pauliKineticBlock = /* wgsl */ `${pauliKineticBindings}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  // Decode k-space coordinates from linear index
  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);
${pauliKineticBody}`

/**
 * 3-D dispatch variant for latticeDim==3. Workgroup size 4x4x4. Reads k-coords
 * directly from gid.xyz, then computes idx via ndToLinear so spinor[idx] /
 * spinor[T+idx] addresses match the FFT buffer layout. Body is bit-identical
 * to pauliKineticBlock — same arithmetic order, same row-major strides.
 */
export const pauliKinetic3DBlock = /* wgsl */ `${pauliKineticBindings}
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let latDim = params.latticeDim;
  if (gid.x >= params.gridSize[0]) { return; }
  if (latDim > 1u && gid.y >= params.gridSize[1]) { return; }
  if (latDim > 2u && gid.z >= params.gridSize[2]) { return; }

  var coords: array<u32, 12>;
  coords[0] = gid.x;
  if (latDim > 1u) { coords[1] = gid.y; }
  if (latDim > 2u) { coords[2] = gid.z; }

  let idx = ndToLinear(coords, params.strides, latDim);
${pauliKineticBody}`
