/**
 * Wigner Reconstruction Compute Shader
 *
 * Phase 2 of the two-phase Wigner cache pipeline. Runs every animated frame.
 * Reads pre-computed spatial patterns from Phase 1, applies time-dependent
 * phase coefficients computed on CPU, and writes the final Wigner cache texture.
 *
 * W(x,p,t) = W_diag(x,p) + sum_pairs 2*(phasedRe * C.re - phasedIm * C.im)
 *
 * No quantum math needed — just texture reads, scalar multiplies, and adds.
 * Estimated cost: <1ms (vs ~30ms for full evaluation).
 *
 * @module rendering/webgpu/shaders/schroedinger/compute/wignerReconstruct
 */

/**
 * Reconstruction parameters: per-pair phased coefficients computed on CPU.
 *
 * Layout (480 bytes):
 *   u32 numPairs         (offset 0)
 *   u32 _pad0            (offset 4)
 *   u32 _pad1            (offset 8)
 *   u32 _pad2            (offset 12)
 *   array<vec4f, 29>     pairData     (offset 16, 464 bytes)
 *     pairData[i] = vec4f(phasedRe, phasedIm, layerIndex_f, channelOffset_f)
 *       phasedRe/Im = 2 * Re/Im(c_j* c_k * e^{-i*dE*t})
 *       layerIndex_f = float cast of layer index in cross texture array
 *       channelOffset_f = 0.0 for .rg, 1.0 for .ba
 *
 * Why 29 not 28: WGSL uniform buffer size must be a multiple of 16.
 * 16 + 29*16 = 480 bytes (cleanly aligned). Only first numPairs entries used.
 */
export const wignerReconstructParamsBlock = /* wgsl */ `
// ============================================
// Wigner Reconstruction Parameters
// ============================================

struct WignerReconstructParams {
  numPairs: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
  pairData: array<vec4f, 29>,  // (phasedRe, phasedIm, layerIdx, channelOff)
}
`

/** Size of WignerReconstructParams struct in bytes: 16 + 29 * 16 = 480 */
export const WIGNER_RECONSTRUCT_PARAMS_SIZE = 480

/**
 * Bind group layout for the reconstruction compute shader.
 * All in Group 0:
 * - Binding 0: Diagonal texture (read as texture_2d)
 * - Binding 1: Cross-term texture array (read as texture_2d_array)
 * - Binding 2: WignerReconstructParams (phased coefficients)
 * - Binding 3: Final cache output texture (write-only storage)
 */
export function generateWignerReconstructBindingsBlock(): string {
  return /* wgsl */ `
// ============================================
// Wigner Reconstruction Bind Groups
// ============================================

// Input textures (read-only)
@group(0) @binding(0) var diagTex: texture_2d<f32>;
@group(0) @binding(1) var crossArrayTex: texture_2d_array<f32>;

// Reconstruction parameters
@group(0) @binding(2) var<uniform> reconstructParams: WignerReconstructParams;

// Output texture (write-only)
@group(0) @binding(3) var cacheOut: texture_storage_2d<rgba16float, write>;
`
}

/**
 * Reconstruction entry point.
 *
 * For each grid cell:
 * 1. Load diagonal W_diag from diagTex
 * 2. For each cross pair: load spatial pattern from crossArrayTex,
 *    multiply by phased coefficient, accumulate
 * 3. Write final W = W_diag + cross_sum to cacheOut
 */
export const wignerReconstructComputeBlock = /* wgsl */ `
// ============================================
// Wigner Reconstruction Entry Point
// ============================================

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  // Bounds check — use output texture dimensions
  let dims = textureDimensions(diagTex);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let coord = vec2i(gid.xy);

  // Load diagonal contribution
  let diagSample = textureLoad(diagTex, coord, 0);
  var W = diagSample.x;  // signed W_diag

  // Accumulate cross-term contributions
  let numPairs = reconstructParams.numPairs;
  for (var i = 0u; i < numPairs; i++) {
    let pd = reconstructParams.pairData[i];
    let phasedRe = pd.x;
    let phasedIm = pd.y;
    let layerIdx = i32(pd.z);
    let channelOff = pd.w;

    // Load spatial cross-Wigner from texture array
    let crossSample = textureLoad(crossArrayTex, coord, layerIdx, 0);

    // Select correct channel pair: .rg (off=0) or .ba (off=1)
    var spatialRe: f32;
    var spatialIm: f32;
    if (channelOff < 0.5) {
      spatialRe = crossSample.x;
      spatialIm = crossSample.y;
    } else {
      spatialRe = crossSample.z;
      spatialIm = crossSample.w;
    }

    // W += 2 * Re(phased * spatial) = phasedRe * spatialRe - phasedIm * spatialIm
    // Factor of 2 is already baked into phasedRe/phasedIm on the CPU side
    W += phasedRe * spatialRe - phasedIm * spatialIm;
  }

  // Store final: same format as original cache — R = signed W, G = |W|, B = 0, A = 1
  textureStore(cacheOut, gid.xy, vec4f(W, abs(W), 0.0, 1.0));
}
`
