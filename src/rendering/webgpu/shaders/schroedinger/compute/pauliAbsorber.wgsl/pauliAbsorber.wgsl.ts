/**
 * Pauli PML Absorber Compute Shader
 *
 * Applies PML absorbing boundary conditions to both Pauli spinor
 * components after each Strang splitting step:
 *
 *   ψ_c(x) *= exp(-σ(x) · dt)
 *
 * Uses cubic polynomial grading (p=3) via the shared computePMLSigma()
 * function, with additive damping across dimensions for correct corner
 * treatment. The damping is spin-independent, preserving the spin state
 * direction while reducing amplitude.
 *
 * Requires pauliUniformsBlock + freeScalarNDIndexBlock + pmlProfileBlock
 * to be prepended.
 *
 * Two variants:
 *   pauliAbsorberBlock   — 1D dispatch, @workgroup_size(64), uses linearToND()
 *   pauliAbsorber3DBlock — 3D dispatch, @workgroup_size(4, 4, 4),
 *                          reads gid.xyz directly (latticeDim == 3 only).
 *
 * @workgroup_size(64)
 * @module
 */

export const pauliAbsorberBlock = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: PauliUniforms;
@group(0) @binding(1) var<storage, read_write> spinor: array<vec2f>;

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
    let idx1 = params.totalSites + idx;
    // Apply to spin-up (c=0) and spin-down (c=1). Merged vec2f: a single
    // SIMD multiply scales both (re, im) components per load.
    spinor[idx]  = spinor[idx]  * dampFactor;
    spinor[idx1] = spinor[idx1] * dampFactor;
  }
}
`

/**
 * 3D-dispatch variant of pauliAbsorber (latticeDim == 3 only).
 * Reads gid.xyz directly. Identical PML math; bit-identical writes.
 */
export const pauliAbsorber3DBlock = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: PauliUniforms;
@group(0) @binding(1) var<storage, read_write> spinor: array<vec2f>;

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= params.gridSize[0] || gid.y >= params.gridSize[1] || gid.z >= params.gridSize[2]) {
    return;
  }
  if (params.absorberEnabled == 0u) {
    return;
  }

  let idx = gid.x * params.strides[0] + gid.y * params.strides[1] + gid.z * params.strides[2];

  var coords: array<u32, 12>;
  coords[0] = gid.x;
  coords[1] = gid.y;
  coords[2] = gid.z;

  let sigma = computePMLSigma(coords, params.gridSize, params.latticeDim,
                              params.absorberWidth, params.absorberStrength, 0u);

  if (sigma > 0.0) {
    let dampFactor = exp(-sigma * params.dt);
    let idx1 = params.totalSites + idx;
    spinor[idx]  = spinor[idx]  * dampFactor;
    spinor[idx1] = spinor[idx1] * dampFactor;
  }
}
`
