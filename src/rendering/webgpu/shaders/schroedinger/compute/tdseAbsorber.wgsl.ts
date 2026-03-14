/**
 * TDSE Complex Absorbing Potential (CAP) Compute Shader
 *
 * Applies absorbing boundary conditions after each Strang step:
 *   psi *= exp(-alpha * (d/W)^2)
 * where d is the distance from the domain boundary and W is the absorber width.
 *
 * This prevents spurious reflections from the periodic boundary.
 *
 * Requires tdseUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const tdseAbsorberBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> psiIm: array<f32>;

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
    psiRe[idx] *= factor;
    psiIm[idx] *= factor;
  }
}
`
