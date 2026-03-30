/**
 * TDSE PML Absorber Compute Shader
 *
 * Applies PML absorbing boundary conditions after each Strang step:
 *   ψ(x) *= exp(-σ(x) · dt)
 *
 * Uses cubic polynomial grading (p=3) via the shared computePMLSigma()
 * function, with additive damping across dimensions for correct corner
 * treatment. σ_max is auto-computed on the CPU from the target reflection
 * coefficient.
 *
 * Requires tdseUniformsBlock + freeScalarNDIndexBlock + pmlProfileBlock
 * to be prepended.
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
  let sigma = computePMLSigma(coords, params.gridSize, params.latticeDim,
                              params.absorberWidth, params.absorberStrength,
                              params.compactDimsMask);

  if (sigma > 0.0) {
    let dampFactor = exp(-sigma * params.dt);
    psiRe[idx] *= dampFactor;
    psiIm[idx] *= dampFactor;
  }
}
`
