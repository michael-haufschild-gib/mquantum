/**
 * Dirac PML Absorber Compute Shader
 *
 * Applies PML absorbing boundary conditions after each Strang step to all
 * spinor components:
 *   ψ_c(x) *= exp(-σ(x) · dt)
 *
 * Uses cubic polynomial grading (p=3) via the shared computePMLSigma()
 * function, with additive damping across dimensions for correct corner
 * treatment.
 *
 * Two emitted variants:
 *   - 1D (@workgroup_size(64)): legacy linear dispatch using linearToND.
 *   - 3D (@workgroup_size(4, 4, 4)): direct gid.xyz coords for latticeDim ≤ 3.
 *     Eliminates the per-thread linearToND decode. Same write set per voxel.
 *
 * Requires diracUniformsBlock + freeScalarNDIndexBlock + pmlProfileBlock
 * to be prepended.
 *
 * @module
 */

const diracAbsorberBindings = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: DiracUniforms;
@group(0) @binding(1) var<storage, read_write> spinor: array<vec2f>;
`

const diracAbsorberBody = /* wgsl */ `
  let sigma = computePMLSigma(coords, params.gridSize, params.latticeDim,
                              params.absorberWidth, params.absorberStrength, 0u);

  if (sigma > 0.0) {
    let dampFactor = exp(-sigma * params.dt);
    let S = params.spinorSize;
    let T = params.totalSites;
    // Apply to all spinor components
    for (var c: u32 = 0u; c < S; c++) {
      let bufIdx = c * T + idx;
      spinor[bufIdx] = spinor[bufIdx] * dampFactor;
    }
  }
}
`

/** Legacy 1D dispatch. Workgroup size 64. */
export const diracAbsorberBlock = /* wgsl */ `${diracAbsorberBindings}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }
  if (params.absorberEnabled == 0u) {
    return;
  }

  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);
${diracAbsorberBody}`

/** 3-D dispatch variant for latticeDim <= 3. Workgroup size 4x4x4. */
export const diracAbsorberBlock3D = /* wgsl */ `${diracAbsorberBindings}
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let latDim = params.latticeDim;
  if (gid.x >= params.gridSize[0]) { return; }
  if (latDim > 1u && gid.y >= params.gridSize[1]) { return; }
  if (latDim > 2u && gid.z >= params.gridSize[2]) { return; }
  if (params.absorberEnabled == 0u) { return; }

  var coords: array<u32, 12>;
  coords[0] = gid.x;
  if (latDim > 1u) { coords[1] = gid.y; }
  if (latDim > 2u) { coords[2] = gid.z; }

  let idx = ndToLinear(coords, params.strides, latDim);
${diracAbsorberBody}`
