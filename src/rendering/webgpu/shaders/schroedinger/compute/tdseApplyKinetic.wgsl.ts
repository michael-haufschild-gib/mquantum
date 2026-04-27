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
 * Two emitted variants:
 *   - 1D (@workgroup_size(64)): legacy linear dispatch using linearToND on
 *     the k-space site index.
 *   - 3D (@workgroup_size(4, 4, 4)): direct gid.xyz coords for latticeDim==3.
 *     Eliminates per-thread linearToND of k-coords. The k-space FFT buffer
 *     uses row-major strides so (coord -> idx) maps identically to the 1D
 *     linearToND round-trip — `complexBuf[c]` writes are bit-identical.
 *
 * @module
 */

const tdseKineticBindings = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> complexBuf: array<f32>;

const KIN_INV_TWO_PI: f32 = 0.15915494309189535;
const KIN_TWO_PI: f32 = 6.283185307179587;
`

const tdseKineticBody = /* wgsl */ `
  // Uniform-only factor: hoist ℏ·dt/(2m) — one division+max+mul per thread, kept here
  // (not as a pre-computed uniform) because it avoids a struct re-layout and the
  // compiler promotes it to subgroup-uniform ALU on every driver we ship against.
  let hbarDtOver2m = (0.5 * params.hbar * params.dt) / max(params.mass, 1e-6);

  // Compute |k|² from lattice k-indices.
  // |k_d| = kGridScale[d] · min(coord_d, N_d − coord_d); k² is sign-invariant so we
  // skip the signed cast (select + i32 subtract) from the canonical FFT ordering.
  var k2: f32 = 0.0;
  let ldim = params.latticeDim;
  for (var d: u32 = 0u; d < ldim; d = d + 1u) {
    let n = params.gridSize[d];
    let kAbs = min(coords[d], n - coords[d]);
    let kVal = params.kGridScale[d] * f32(kAbs);
    k2 += kVal * kVal;
  }

  // Cache adjacent complex-buffer address (4 accesses otherwise).
  let c = idx << 1u;
  let re = complexBuf[c];
  let im = complexBuf[c + 1u];

  let arg = k2 * hbarDtOver2m;

  if (params.imaginaryTime != 0u) {
    // Imaginary-time (Wick rotation): exp(-ℏk²dτ/(2m)) — real exponential decay
    // High-k modes decay exponentially, leaving the ground state
    let decay = exp(-arg);
    complexBuf[c] = re * decay;
    complexBuf[c + 1u] = im * decay;
  } else {
    // Real-time: exp(-i·ℏk²dt/(2m)) — unitary phase rotation.
    // Reduce arg (not −arg) to [-π, π], then fold the sign of −arg into the
    // complex multiply via cos(-x)=cos(x), sin(-x)=-sin(x). Saves one neg.
    let argReduced = arg - round(arg * KIN_INV_TWO_PI) * KIN_TWO_PI;
    let cosP = cos(argReduced);
    let sinP = sin(argReduced);
    // exp(−i·arg) · (re + i·im) = (re·cosP + im·sinP) + i·(im·cosP − re·sinP)
    complexBuf[c] = re * cosP + im * sinP;
    complexBuf[c + 1u] = im * cosP - re * sinP;
  }
}
`

/** Legacy 1-D dispatch. Workgroup size 64. */
export const tdseApplyKineticBlock = /* wgsl */ `${tdseKineticBindings}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  // Convert linear index to N-D k-space coordinates
  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);
${tdseKineticBody}`

/**
 * 3-D dispatch variant for latticeDim==3. Workgroup size 4x4x4. Reads k-coords
 * directly from gid.xyz, then computes idx via ndToLinear so complexBuf writes
 * line up with the FFT buffer's row-major layout. Body is otherwise identical
 * to tdseApplyKineticBlock — IEEE bit-identical writes.
 */
export const tdseApplyKineticBlock3D = /* wgsl */ `${tdseKineticBindings}
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
${tdseKineticBody}`
