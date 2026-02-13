/**
 * Wigner Cache Compute Shader
 *
 * Pre-computes a 2D Wigner quasi-probability distribution W(x,p)
 * on a texture grid. The fragment shader then samples this texture
 * with bilinear interpolation instead of evaluating the expensive
 * Laguerre/quadrature functions per-pixel.
 *
 * Architecture:
 * - Input: Quantum uniforms, basis vectors, grid parameters
 * - Output: 512x512 (configurable 128-1024) rgba16float 2D texture
 * - Workgroup: 16x16 threads
 * - Dispatch: ceil(gridSize/16) x ceil(gridSize/16) workgroups
 *
 * Texture layout (rgba16float):
 * - R: signed W(x,p) value
 * - G: |W(x,p)| (absolute value for fast color mapping)
 * - B: reserved (0.0)
 * - A: 1.0
 *
 * @module rendering/webgpu/shaders/schroedinger/compute/wignerCache
 */

/**
 * Wigner grid parameters uniform struct.
 *
 * Layout (32 bytes, 16-byte aligned):
 *   vec2u gridSize     (offset 0,  8 bytes)
 *   u32   _pad0        (offset 8,  4 bytes)
 *   u32   _pad1        (offset 12, 4 bytes)
 *   vec2f xRange       (offset 16, 8 bytes)  - (xMin, xMax)
 *   vec2f pRange       (offset 24, 8 bytes)  - (pMin, pMax)
 */
export const wignerGridParamsBlock = /* wgsl */ `
// ============================================
// Wigner Cache Compute Parameters
// ============================================

struct WignerGridParams {
  gridSize: vec2u,     // Grid resolution (e.g., 512, 512)
  _pad0: u32,          // Padding for 16-byte alignment
  _pad1: u32,          // Padding
  xRange: vec2f,       // Physical x-axis range (xMin, xMax)
  pRange: vec2f,       // Physical p-axis range (pMin, pMax)
}
`

/** Size of WignerGridParams struct in bytes */
export const WIGNER_GRID_PARAMS_SIZE = 32

/**
 * Compute shader bind group layout block for Wigner cache.
 * Uses Group 0 for all compute bindings.
 *
 * - Binding 0: SchroedingerUniforms (full quantum state)
 * - Binding 1: BasisVectors
 * - Binding 2: WignerGridParams
 * - Binding 3: Output 2D storage texture (rgba16float, write)
 */
export function generateWignerCacheBindingsBlock(): string {
  return /* wgsl */ `
// ============================================
// Wigner Cache Compute Bind Groups
// ============================================

// Uniform bindings (read-only)
@group(0) @binding(0) var<uniform> schroedinger: SchroedingerUniforms;
@group(0) @binding(1) var<uniform> basis: BasisVectors;
@group(0) @binding(2) var<uniform> wignerGridParams: WignerGridParams;

// Output texture (write-only)
@group(0) @binding(3) var wignerCacheOut: texture_storage_2d<rgba16float, write>;
`
}

/**
 * Wigner cache compute shader entry point.
 *
 * Each thread computes W(x,p) for one grid cell using the same
 * quantum evaluation logic as the fragment shader:
 * - HO mode: evaluateWignerMarginalHO() with diagonal + cross terms
 * - Hydrogen core dim: wignerHydrogenRadial() quadrature
 * - Hydrogen extra dim: wignerDiagonal() single Fock state
 */
export const wignerCacheComputeBlock = /* wgsl */ `
// ============================================
// Wigner Cache Compute Shader Entry Point
// ============================================

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  // Bounds check - skip threads outside grid
  if (gid.x >= wignerGridParams.gridSize.x || gid.y >= wignerGridParams.gridSize.y) {
    return;
  }

  // Convert grid coordinate to normalized [0,1] space
  let gridSizeF = vec2f(wignerGridParams.gridSize);
  let uv = (vec2f(gid.xy) + 0.5) / gridSizeF;

  // Convert to physical (x, p) coordinates via grid ranges
  let xPhys = mix(wignerGridParams.xRange.x, wignerGridParams.xRange.y, uv.x);
  let pPhys = mix(wignerGridParams.pRange.x, wignerGridParams.pRange.y, uv.y);

  // Evaluate Wigner function — dispatch based on quantum mode and dimension
  let dimIdx = schroedinger.wignerDimensionIndex;
  let t = schroedinger.time * schroedinger.timeScale;
  var W = 0.0;

  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
    // Hydrogen family
    if (dimIdx < 3) {
      // Core radial dimension: numerical Fourier-cosine quadrature
      // xPhys >= 0 guaranteed by grid range [0, xRange] for hydrogen radial;
      // hydrogenReducedRadial() handles r <= 0 as a safety net.
      let r = xPhys;
      let pr = pPhys;
      W = wignerHydrogenRadial(
        r, pr,
        schroedinger.principalN,
        schroedinger.azimuthalL,
        schroedinger.bohrRadius,
        schroedinger.wignerQuadPoints
      );
    } else {
      // Extra HO dimension: analytical single Fock state Wigner
      let extraIdx = dimIdx - 3;
      let n = getExtraDimN(schroedinger, extraIdx);
      let omega = getExtraDimOmega(schroedinger, extraIdx);
      W = wignerDiagonal(n, xPhys, pPhys, omega);
    }
  } else {
    // Harmonic oscillator: full marginal Wigner with cross terms and time evolution
    W = evaluateWignerMarginalHO(xPhys, pPhys, dimIdx, t, schroedinger);
  }

  // Store: R = signed W, G = |W|, B = 0, A = 1
  textureStore(wignerCacheOut, gid.xy, vec4f(W, abs(W), 0.0, 1.0));
}
`
