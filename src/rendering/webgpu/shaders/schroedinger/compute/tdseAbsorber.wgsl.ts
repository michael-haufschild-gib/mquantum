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
 * Two variants: tdseAbsorberBlock (1-D, workgroup_size(64), linearToND)
 * and tdseAbsorberBlock3D (3-D, workgroup_size(4,4,4), gid.xyz). See
 * pickSiteDispatch in computePassUtils for the selection rule.
 *
 * @workgroup_size(64) (1-D variant) | @workgroup_size(4, 4, 4) (3-D variant)
 * @module
 */

/** Shared kernel body. Expects 'idx' and 'coords' to be defined by the prologue. */
const TDSE_ABSORBER_BODY = /* wgsl */ `
  if (params.absorberEnabled == 0u) {
    return;
  }

  let sigma = computePMLSigma(coords, params.gridSize, params.latticeDim,
                              params.absorberWidth, params.absorberStrength,
                              params.compactDimsMask);

  if (sigma > 0.0) {
    let dampFactor = exp(-sigma * params.dt);
    psi[idx] = psi[idx] * dampFactor;
  }
`

/** 1-D variant: linear dispatch + linearToND coord decomposition. Used when latticeDim !== 3. */
export const tdseAbsorberBlock = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> psi: array<vec2f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }
  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);
${TDSE_ABSORBER_BODY}
}
`

/** 3-D variant: workgroup_size(4,4,4) + direct gid.xyz coord read. Used when latticeDim === 3. */
export const tdseAbsorberBlock3D = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> psi: array<vec2f>;

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= params.gridSize[0] || gid.y >= params.gridSize[1] || gid.z >= params.gridSize[2]) {
    return;
  }
  var coords: array<u32, 12>;
  coords[0] = gid.x;
  coords[1] = gid.y;
  coords[2] = gid.z;
  let idx = gid.x * params.strides[0] + gid.y * params.strides[1] + gid.z;
${TDSE_ABSORBER_BODY}
}
`
