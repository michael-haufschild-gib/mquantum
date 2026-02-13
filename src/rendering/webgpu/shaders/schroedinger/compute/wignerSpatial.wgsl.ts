/**
 * Wigner Spatial Precompute Shader
 *
 * Phase 1 of the two-phase Wigner cache pipeline. Runs once per parameter
 * change (quantum numbers, omega, grid ranges, basis vectors). Writes:
 *
 * - Diagonal texture (rgba16float, 512x512):
 *   R = W_diag(x,p), G = |W_diag|, B = 0, A = 1
 *
 * - Cross-term texture array (rgba16float, 512x512 x N layers):
 *   Each layer packs 2 cross pairs: .rg = pair0(Re,Im), .ba = pair1(Re,Im).
 *   Last layer may have only 1 pair (pair1 = zeros).
 *
 * The reconstruction pass (Phase 2) combines these with time-dependent
 * scalar coefficients to produce the final cache texture every frame.
 *
 * @module rendering/webgpu/shaders/schroedinger/compute/wignerSpatial
 */

/**
 * Parameters for spatial precompute: maps each layer to its pair(s).
 *
 * Layout (240 bytes):
 *   u32 numPairs        (offset 0)   — total cross pairs
 *   u32 numLayers       (offset 4)   — number of texture array layers
 *   u32 _pad0           (offset 8)
 *   u32 _pad1           (offset 12)
 *   array<vec4i, 14>    layerPairs   (offset 16, 224 bytes)
 *     Each vec4i: (j0, k0, j1, k1)
 *     j0/k0 = first pair's term indices
 *     j1/k1 = second pair's term indices (j1 = -1 if no second pair)
 */
export const wignerSpatialParamsBlock = /* wgsl */ `
// ============================================
// Wigner Spatial Precompute Parameters
// ============================================

struct WignerSpatialParams {
  numPairs: u32,
  numLayers: u32,
  _pad0: u32,
  _pad1: u32,
  layerPairs: array<vec4i, 14>,  // (j0, k0, j1, k1) per layer
}
`

/** Size of WignerSpatialParams struct in bytes: 16 + 14 * 16 = 240 */
export const WIGNER_SPATIAL_PARAMS_SIZE = 240

/**
 * Bind group layout for the spatial precompute compute shader.
 * All in Group 0:
 * - Binding 0: SchroedingerUniforms (quantum state)
 * - Binding 1: BasisVectors
 * - Binding 2: WignerGridParams (grid ranges)
 * - Binding 3: WignerSpatialParams (layer-to-pair mapping)
 * - Binding 4: Diagonal output texture (write-only storage)
 * - Binding 5: Cross-term output texture array (write-only storage)
 */
export function generateWignerSpatialBindingsBlock(): string {
  return /* wgsl */ `
// ============================================
// Wigner Spatial Precompute Bind Groups
// ============================================

// Uniform bindings (read-only)
@group(0) @binding(0) var<uniform> schroedinger: SchroedingerUniforms;
@group(0) @binding(1) var<uniform> basis: BasisVectors;
@group(0) @binding(2) var<uniform> wignerGridParams: WignerGridParams;
@group(0) @binding(3) var<uniform> spatialParams: WignerSpatialParams;

// Output textures (write-only)
@group(0) @binding(4) var diagOut: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var crossOut: texture_storage_2d_array<rgba16float, write>;
`
}

/**
 * Spatial precompute entry point.
 *
 * For each grid cell (x, p):
 * 1. Compute diagonal: sum_k |c_k|^2 * wignerDiagonal(n_k, x, p, omega)
 * 2. For each layer: compute both cross pairs' spatial patterns and write
 *    packed (Re0, Im0, Re1, Im1) in a single textureStore call.
 */
export const wignerSpatialComputeBlock = /* wgsl */ `
// ============================================
// Wigner Spatial Precompute Entry Point
// ============================================

/**
 * Compute the cross-Wigner spatial pattern for a pair (termJ, termK).
 * Returns vec2f(Re, Im) with conjugation applied when nj < nk.
 * Returns vec2f(0,0) if the marginal rule rejects this pair.
 */
fn computeCrossPairSpatial(termJ: i32, termK: i32, xPhys: f32, pPhys: f32, dimIdx: i32, omega: f32) -> vec2f {
  // Marginal rule: all non-selected dims must match
  if (!wignerTermsMatchExcept(termJ, termK, dimIdx, schroedinger)) {
    return vec2f(0.0, 0.0);
  }

  let nj = getQuantumNumber(schroedinger, termJ, dimIdx);
  let nk = getQuantumNumber(schroedinger, termK, dimIdx);

  // wignerCross always computes W_{max,min}
  let Wcross = wignerCross(nj, nk, xPhys, pPhys, omega);
  // When nj < nk, need conjugate: negate imaginary
  let crossIm = select(Wcross.y, -Wcross.y, nj < nk);

  return vec2f(Wcross.x, crossIm);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  // Bounds check
  if (gid.x >= wignerGridParams.gridSize.x || gid.y >= wignerGridParams.gridSize.y) {
    return;
  }

  // Convert grid coordinate to physical (x, p)
  let gridSizeF = vec2f(wignerGridParams.gridSize);
  let uv = (vec2f(gid.xy) + 0.5) / gridSizeF;
  let xPhys = mix(wignerGridParams.xRange.x, wignerGridParams.xRange.y, uv.x);
  let pPhys = mix(wignerGridParams.pRange.x, wignerGridParams.pRange.y, uv.y);

  let dimIdx = schroedinger.wignerDimensionIndex;

  // ---- DIAGONAL CONTRIBUTION ----
  var Wdiag = 0.0;

  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
    // Hydrogen family
    if (dimIdx < 3) {
      // xPhys >= 0 guaranteed by grid range [0, xRange] for hydrogen radial;
      // hydrogenReducedRadial() handles r <= 0 as a safety net.
      let r = xPhys;
      let pr = pPhys;
      Wdiag = wignerHydrogenRadial(
        r, pr,
        schroedinger.principalN,
        schroedinger.azimuthalL,
        schroedinger.bohrRadius,
        schroedinger.wignerQuadPoints
      );
    } else {
      let extraIdx = dimIdx - 3;
      let n = getExtraDimN(schroedinger, extraIdx);
      let omega = getExtraDimOmega(schroedinger, extraIdx);
      Wdiag = wignerDiagonal(n, xPhys, pPhys, omega);
    }
  } else {
    // HO mode: diagonal = sum_k |c_k|^2 * W_{n_k}(x, p)
    let omega = getOmega(schroedinger, dimIdx);
    let tc = schroedinger.termCount;
    for (var k = 0; k < tc; k++) {
      let c = getCoeff(schroedinger, k);
      let weight = c.x * c.x + c.y * c.y;
      let n = getQuantumNumber(schroedinger, k, dimIdx);
      Wdiag += weight * wignerDiagonal(n, xPhys, pPhys, omega);
    }
  }

  // Store diagonal: R = signed W_diag, G = |W_diag|, B = 0, A = 1
  textureStore(diagOut, gid.xy, vec4f(Wdiag, abs(Wdiag), 0.0, 1.0));

  // ---- CROSS-TERM SPATIAL PATTERNS ----
  // Only for HO mode with cross terms enabled and multiple terms
  if (QUANTUM_MODE_DEFAULT != QUANTUM_MODE_HYDROGEN_ND &&
      schroedinger.wignerCrossTermsEnabled != 0u) {
    let omega = getOmega(schroedinger, dimIdx);
    let numLayers = spatialParams.numLayers;

    for (var layerIdx = 0u; layerIdx < numLayers; layerIdx++) {
      let lp = spatialParams.layerPairs[layerIdx];

      // First pair (always present)
      let pair0 = computeCrossPairSpatial(lp.x, lp.y, xPhys, pPhys, dimIdx, omega);

      // Second pair (j1 = -1 means no second pair)
      var pair1 = vec2f(0.0, 0.0);
      if (lp.z >= 0) {
        pair1 = computeCrossPairSpatial(lp.z, lp.w, xPhys, pPhys, dimIdx, omega);
      }

      // Pack both pairs: .rg = pair0, .ba = pair1
      textureStore(crossOut, gid.xy, layerIdx, vec4f(pair0.x, pair0.y, pair1.x, pair1.y));
    }
  }
}
`
