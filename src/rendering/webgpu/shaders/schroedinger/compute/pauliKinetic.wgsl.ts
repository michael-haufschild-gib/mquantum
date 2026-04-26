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
 * @workgroup_size(64)
 * @module
 */

export const pauliKineticBlock = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: PauliUniforms;
@group(0) @binding(1) var<storage, read_write> spinor: array<vec2f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  // Decode k-space coordinates from linear index
  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);

  // Compute k² using FFT frequency ordering.
  // PERF: k_phys = kGridScale[d] · kIdx uses a host-precomputed reciprocal so
  // each thread replaces a per-dim divide with a multiply. kGridScale[d] =
  // 2π / (N_d · a_d). Mirrors TDSE/Dirac kinetic kernels.
  const PAULI_TWO_PI: f32 = 6.28318530717958647692;
  var k2: f32 = 0.0;
  let ldim = params.latticeDim;
  for (var d: u32 = 0u; d < ldim; d = d + 1u) {
    let gd = params.gridSize[d];
    let cd = i32(coords[d]);
    let gdI = i32(gd);
    // FFT frequency: positive half [0, N/2), negative half [N/2, N) → [0, -N/2)
    // Branchless via direct subtraction with a u32 comparison instead of two i32 casts.
    let kIdx = select(cd - gdI, cd, coords[d] < (gd >> 1u));
    let kPhys = params.kGridScale[d] * f32(kIdx);
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
