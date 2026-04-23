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
 * Requires diracUniformsBlock + freeScalarNDIndexBlock + pmlProfileBlock
 * to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const diracAbsorberBlock = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: DiracUniforms;
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
  let sigma = computePMLSigma(coords, params.gridSize, params.latticeDim,
                              params.absorberWidth, params.absorberStrength, 0u);

  if (sigma > 0.0) {
    let dampFactor = exp(-sigma * params.dt);
    let S = params.spinorSize;
    let T = params.totalSites;
    // Apply to all spinor components
    for (var c: u32 = 0u; c < S; c++) {
      let bufIdx = c * T + idx;
      spinorRe[bufIdx] *= dampFactor;
      spinorIm[bufIdx] *= dampFactor;
    }
  }
}
`
