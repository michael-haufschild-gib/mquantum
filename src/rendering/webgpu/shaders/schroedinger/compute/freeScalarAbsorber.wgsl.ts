/**
 * Free Scalar Field PML Absorber Compute Shader
 *
 * Applies PML cubic polynomial damping to both field components (φ, π):
 *   φ(x) *= exp(-σ(x) · dt)
 *   π(x) *= exp(-σ(x) · dt)
 *
 * Unlike the Schrödinger/Pauli/Dirac modes where PML is merged into
 * the potential half-step, the Free Scalar Field uses a leapfrog scheme
 * with no potential half-step. The absorber runs as a separate dispatch
 * after each full leapfrog step.
 *
 * σ(x) uses cubic polynomial grading with σ_max auto-computed from
 * the target reflection coefficient on the CPU.
 *
 * Requires freeScalarNDIndexBlock + pmlProfileBlock to be prepended.
 * The uniform struct (FreeScalarUniforms) is declared inline since the
 * Free Scalar mode doesn't have a separate uniforms block file.
 *
 * @workgroup_size(64)
 * @module
 */

export const freeScalarAbsorberBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: FreeScalarUniforms;
@group(0) @binding(1) var<storage, read_write> phi: array<f32>;
@group(0) @binding(2) var<storage, read_write> pi: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);
  let sigma = computePMLSigma(coords, params.gridSize, params.latticeDim,
                              params.absorberWidth, params.absorberStrength, 0u);

  if (sigma > 0.0) {
    let dampFactor = exp(-sigma * params.dt);
    phi[idx] *= dampFactor;
    pi[idx] *= dampFactor;
  }
}
`
