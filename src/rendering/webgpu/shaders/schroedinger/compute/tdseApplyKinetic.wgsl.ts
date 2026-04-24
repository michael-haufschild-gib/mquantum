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
@group(0) @binding(0) var<storage, read> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> complexBuf: array<f32>;

const KIN_INV_TWO_PI: f32 = 0.15915494309189535;
const KIN_TWO_PI: f32 = 6.283185307179587;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  // Convert linear index to N-D k-space coordinates
  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);

  // Compute |k|² from lattice k-indices.
  // k_d = kGridScale[d] * (coord_d < N_d/2 ? coord_d : coord_d - N_d)  (FFT freq ordering)
  var k2: f32 = 0.0;
  let ldim = params.latticeDim;
  for (var d: u32 = 0u; d < ldim; d = d + 1u) {
    let n = params.gridSize[d];
    let halfN = n >> 1u;
    let kIdx = select(i32(coords[d]) - i32(n), i32(coords[d]), coords[d] < halfN);
    let kVal = params.kGridScale[d] * f32(kIdx);
    k2 += kVal * kVal;
  }

  // Cache adjacent complex-buffer address (4 accesses otherwise).
  let c = idx << 1u;
  let re = complexBuf[c];
  let im = complexBuf[c + 1u];

  // Uniform-only factor: hoist ℏ·dt/(2m) to replace the per-thread divide with a multiply.
  let hbarDtOver2m = (0.5 * params.hbar * params.dt) / max(params.mass, 1e-6);
  let arg = k2 * hbarDtOver2m;

  if (params.imaginaryTime != 0u) {
    // Imaginary-time (Wick rotation): exp(-ℏk²dτ/(2m)) — real exponential decay
    // High-k modes decay exponentially, leaving the ground state
    let decay = exp(-arg);
    complexBuf[c] = re * decay;
    complexBuf[c + 1u] = im * decay;
  } else {
    // Real-time: exp(-i·ℏk²dt/(2m)) — unitary phase rotation
    let phase = -arg;
    // Reduce to [-π, π] so f32 cos/sin stay precise for high-frequency k-modes
    let reduced = phase - round(phase * KIN_INV_TWO_PI) * KIN_TWO_PI;
    let cosP = cos(reduced);
    let sinP = sin(reduced);
    complexBuf[c] = re * cosP - im * sinP;
    complexBuf[c + 1u] = re * sinP + im * cosP;
  }
}
`
