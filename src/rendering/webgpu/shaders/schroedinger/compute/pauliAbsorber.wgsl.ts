/**
 * Pauli Complex Absorbing Potential (CAP) Compute Shader
 *
 * Applies absorbing boundary conditions to both Pauli spinor components
 * after each Strang splitting step:
 *
 *   ψ_c(x) *= exp(-α · (d/W)²)
 *
 * where d is the distance from the nearest domain boundary, W is the
 * absorber width in grid points, and α = absorberStrength controls
 * the attenuation rate.
 *
 * The damping factor is computed per-site as the maximum over all
 * dimensions, preventing spurious reflections from the periodic boundary.
 *
 * Requires pauliUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const pauliAbsorberBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: PauliUniforms;
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

  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);

  // Compute maximum quadratic damping exponent across all dimensions
  var maxDamp: f32 = 0.0;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let N = f32(params.gridSize[d]);
    let W = params.absorberWidth * N;  // absorber width in grid points
    let pos = f32(coords[d]);

    // Distance from the nearest boundary (in grid points)
    let distFromEdge = min(pos, N - 1.0 - pos);

    if (distFromEdge < W) {
      let ratio = (W - distFromEdge) / W;
      let damp = params.absorberStrength * ratio * ratio;
      maxDamp = max(maxDamp, damp);
    }
  }

  if (maxDamp > 0.0) {
    let factor = exp(-maxDamp);
    let T = params.totalSites;
    // Apply to spin-up (c=0) and spin-down (c=1)
    spinorRe[idx] *= factor;
    spinorIm[idx] *= factor;
    spinorRe[T + idx] *= factor;
    spinorIm[T + idx] *= factor;
  }
}
`
