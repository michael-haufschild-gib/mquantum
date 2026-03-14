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
@group(0) @binding(0) var<uniform> params: PauliUniforms;
@group(0) @binding(1) var<storage, read_write> spinorRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> spinorIm: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  // Decode k-space coordinates from linear index
  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);

  // Compute k² using FFT frequency ordering
  let TWO_PI: f32 = 6.28318530718;
  var k2: f32 = 0.0;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let gd = params.gridSize[d];
    let halfN = gd / 2u;
    // FFT frequency: positive half [0, N/2), negative half [N/2, N) → [0, -N/2)
    let kIdx = select(i32(coords[d]) - i32(gd), i32(coords[d]), coords[d] < halfN);
    let kPhys = f32(kIdx) * TWO_PI / (f32(gd) * params.spacing[d]);
    k2 += kPhys * kPhys;
  }

  // Kinetic phase: e^{-i ℏ k² dt / (2m)}  — negative sign for forward time evolution
  let phase = -params.hbar * k2 * params.dt / (2.0 * params.mass);
  let cosP = cos(phase);
  let sinP = sin(phase);

  // Apply the same phase rotation to both spinor components independently
  let T = params.totalSites;

  // Spin-up (c=0)
  let re0 = spinorRe[idx];
  let im0 = spinorIm[idx];
  spinorRe[idx] = re0 * cosP - im0 * sinP;
  spinorIm[idx] = re0 * sinP + im0 * cosP;

  // Spin-down (c=1)
  let re1 = spinorRe[T + idx];
  let im1 = spinorIm[T + idx];
  spinorRe[T + idx] = re1 * cosP - im1 * sinP;
  spinorIm[T + idx] = re1 * sinP + im1 * cosP;
}
`
