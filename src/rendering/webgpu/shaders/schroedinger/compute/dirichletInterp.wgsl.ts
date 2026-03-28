/**
 * Dirichlet Kernel Interpolation for Periodic Lattices
 *
 * Provides exact band-limited interpolation for periodic lattice data using
 * the Dirichlet kernel (periodic sinc). Activated when the visible grid is
 * coarse (N ≤ 16 per dimension), where trilinear interpolation produces
 * visible blocky artifacts.
 *
 * Architecture:
 * - Workgroup shared memory: the entire 3D visible slice (N0×N1×N2 floats)
 *   is cooperatively loaded by the 4×4×4 workgroup (done by the caller)
 * - Separable evaluation: 1D Dirichlet weights Dx[i], Dy[j], Dz[k] are
 *   precomputed per thread, then the triple sum is evaluated from shared mem
 * - Cost: 3×N sin() + N³ MADs per texel (tractable for N ≤ 16)
 *
 * The Dirichlet kernel for an N-point periodic grid with spacing a:
 *   D_N(x) = sin(N·π·x / L) / (N · sin(π·x / L))   where L = N·a
 *
 * This is the exact inverse DFT reconstruction kernel — it perfectly
 * interpolates any band-limited signal on the periodic lattice.
 *
 * @module rendering/webgpu/shaders/schroedinger/compute/dirichletInterp.wgsl
 */

/**
 * Maximum number of floats in workgroup shared memory for the 3D slice.
 * 16³ = 4096 floats = 16 KB — fits within the 16-48 KB workgroup limit.
 */
export const DIRICHLET_MAX_SHARED_SITES = 4096

/** Maximum grid size per visible dimension for Dirichlet interpolation. */
export const DIRICHLET_MAX_N = 16

export const dirichletInterpBlock = /* wgsl */ `
// ============================================
// Dirichlet Kernel Interpolation (Periodic)
// ============================================

const DIRICHLET_MAX_SHARED: u32 = ${DIRICHLET_MAX_SHARED_SITES}u;
var<workgroup> sharedPhi: array<f32, ${DIRICHLET_MAX_SHARED_SITES}>;
var<workgroup> sharedPi: array<f32, ${DIRICHLET_MAX_SHARED_SITES}>;

/**
 * Band-limited interpolation kernel for a periodic lattice.
 *
 * For even N (power-of-2 grids):
 *   K(x) = sin(N·π·x/L) · cos(π·x/L) / (N · sin(π·x/L))
 * For odd N:
 *   K(x) = sin(N·π·x/L) / (N · sin(π·x/L))
 *
 * Equivalent to the half-Nyquist DFT reconstruction:
 *   K(x) = (1/N) [1 + 2·Σ_{k=1}^{M} cos(2πkx/L) + δ_{even}·cos(Nπx/L)]
 * where M = N/2-1 (even) or (N-1)/2 (odd).
 *
 * This correctly reconstructs all modes up to k = N/2-1 without aliased
 * high-frequency oscillations. Satisfies K(0)=1, K(j·a)=0, partition of unity.
 */
fn dirichletWeight(x: f32, N: u32, L: f32) -> f32 {
  let piOverL = 3.141592653589793 / L;
  let arg = piOverL * x;
  let denom = sin(arg);
  let isEven = (N & 1u) == 0u;

  // Near a lattice node: sin(π·x/L) ≈ 0 → K → ±1
  if (abs(denom) < 1e-6) {
    // L'Hôpital: sin(Nα)[cos(α)] / sin(α) → N·cos(Nα)[cos(α)] / cos(α) → N·cos(Nα)
    // For even N: K(0) = N·1·1 / (N·1) = 1
    let nArg = f32(N) * arg;
    let cosNode = cos(arg);
    if (abs(cosNode) < 1e-10) { return 0.0; }
    let numer = f32(N) * cos(nArg);
    if (isEven) {
      // d/dx[sin(Nα)·cos(α)] / d/dx[sin(α)] = [N·cos(Nα)·cos(α) - sin(Nα)·sin(α)] / cos(α)
      let sinNArg = sin(nArg);
      let sinArg = sin(arg);
      return (numer * cosNode - sinNArg * sinArg) / (f32(N) * cosNode);
    }
    return numer / (f32(N) * cosNode);
  }

  let base = sin(f32(N) * arg) / (f32(N) * denom);
  if (isEven) {
    return base * cos(arg);
  }
  return base;
}

/**
 * Evaluate 3D Dirichlet interpolation from sharedPhi.
 *
 * Separable: precompute 1D weights per axis, then triple sum.
 * Shared memory layout: row-major [i * n1*n2 + j * n2 + k].
 */
fn dirichletInterp3D(
  worldX: f32, worldY: f32, worldZ: f32,
  n0: u32, n1: u32, n2: u32,
  a0: f32, a1: f32, a2: f32,
  usePi: bool
) -> f32 {
  let L0 = f32(n0) * a0;
  let L1 = f32(n1) * a1;
  let L2 = f32(n2) * a2;

  var wx: array<f32, 16>;
  for (var i: u32 = 0u; i < n0; i++) {
    wx[i] = dirichletWeight(worldX - (f32(i) * a0 - L0 * 0.5), n0, L0);
  }

  var wy: array<f32, 16>;
  for (var j: u32 = 0u; j < n1; j++) {
    wy[j] = dirichletWeight(worldY - (f32(j) * a1 - L1 * 0.5), n1, L1);
  }

  var wz: array<f32, 16>;
  for (var k: u32 = 0u; k < n2; k++) {
    wz[k] = dirichletWeight(worldZ - (f32(k) * a2 - L2 * 0.5), n2, L2);
  }

  var result: f32 = 0.0;
  let n12 = n1 * n2;
  for (var i: u32 = 0u; i < n0; i++) {
    let wxi = wx[i];
    if (abs(wxi) < 1e-10) { continue; }
    let iBase = i * n12;
    for (var j: u32 = 0u; j < n1; j++) {
      let wxy = wxi * wy[j];
      if (abs(wxy) < 1e-10) { continue; }
      let ijBase = iBase + j * n2;
      for (var k: u32 = 0u; k < n2; k++) {
        let val = select(sharedPhi[ijBase + k], sharedPi[ijBase + k], usePi);
        result += wxy * wz[k] * val;
      }
    }
  }

  return result;
}
`
