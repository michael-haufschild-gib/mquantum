/**
 * TDSE Full-Step Kinetic Propagator Compute Shader (k-space)
 *
 * Applies the kinetic energy propagator in momentum space:
 *   psi_k *= exp(-i * hbar * |k|^2 * dt / (2 * m))
 *
 * Operates on the interleaved complex FFT buffer after forward FFT.
 * k-vector components are computed from lattice indices using kGridScale.
 *
 * Requires tdseUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const tdseApplyKineticBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> complexBuf: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  // Convert linear index to N-D k-space coordinates
  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);

  // Compute |k|^2 from lattice k-indices
  // k_d = kGridScale[d] * (coord_d < N_d/2 ? coord_d : coord_d - N_d)
  // This gives the standard FFT frequency ordering
  var k2: f32 = 0.0;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let n = params.gridSize[d];
    let halfN = n / 2u;
    let kIdx = select(i32(coords[d]) - i32(n), i32(coords[d]), coords[d] < halfN);
    let kVal = params.kGridScale[d] * f32(kIdx);
    k2 += kVal * kVal;
  }

  // Phase rotation: exp(-i * hbar * k^2 * dt / (2*m))
  let phase = -params.hbar * k2 * params.dt / (2.0 * params.mass);
  let cosP = cos(phase);
  let sinP = sin(phase);

  // Read interleaved complex value
  let re = complexBuf[idx * 2u];
  let im = complexBuf[idx * 2u + 1u];

  // Apply rotation
  complexBuf[idx * 2u] = re * cosP - im * sinP;
  complexBuf[idx * 2u + 1u] = re * sinP + im * cosP;
}
`
