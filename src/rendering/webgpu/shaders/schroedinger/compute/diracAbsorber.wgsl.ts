/**
 * Dirac Complex Absorbing Potential (CAP) Compute Shader
 *
 * Applies absorbing boundary conditions after each Strang step to all
 * spinor components:
 *   ψ_c(x) *= exp(-alpha * (d/W)^2)
 * where d is the distance from the domain boundary, W is the absorber width,
 * and c indexes the spinor component.
 *
 * Prevents spurious reflections from the periodic boundary.
 *
 * Requires diracUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const diracAbsorberBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: DiracUniforms;
@group(0) @binding(1) var<storage, read_write> spinorRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> spinorIm: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }
  if (params.absorberEnabled == 0u) {
    return;
  }

  let coords = linearToND(idx, params.gridSize, params.latticeDim);

  // Compute maximum damping factor across all dimensions
  var maxDamp: f32 = 0.0;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let N = f32(params.gridSize[d]);
    let W = params.absorberWidth * N; // absorber width in grid points
    let pos = f32(coords[d]);

    // Distance from nearest boundary (in grid points)
    let distFromEdge = min(pos, N - 1.0 - pos);

    if (distFromEdge < W) {
      let ratio = (W - distFromEdge) / W;
      let damp = params.absorberStrength * ratio * ratio;
      maxDamp = max(maxDamp, damp);
    }
  }

  if (maxDamp > 0.0) {
    let factor = exp(-maxDamp);
    let S = params.spinorSize;
    let T = params.totalSites;
    // Apply to all spinor components
    for (var c: u32 = 0u; c < S; c++) {
      let bufIdx = c * T + idx;
      spinorRe[bufIdx] *= factor;
      spinorIm[bufIdx] *= factor;
    }
  }
}
`
