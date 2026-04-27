/**
 * Pauli Potential Fill Compute Shader
 *
 * Fills the scalar potential buffer V(x) once per parameter change so the
 * per-substep pauliPotentialHalf kernel can read V via a single load instead
 * of re-evaluating the V formula every Strang substep.
 *
 * The V formulas are the authoritative Pauli-spinor scalar potential set;
 * they are duplicated (read-only) by pauliWriteGrid.wgsl.ts for the display
 * overlay but otherwise computed only here.
 *
 * Scalar potential models (potentialType):
 *   0 none
 *   1 harmonicTrap:  V = 1/2 mass omega^2 |x|^2
 *   2 barrier:       V = wellDepth   if |x0| < wellWidth/2 (first dim)
 *   3 doubleWell:    V = wellDepth (1 - exp(-|x|^2 / wellWidth^2))  (radial Gaussian)
 *
 * Requires pauliUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * Two variants:
 *   pauliPotentialBlock   — 1D dispatch, @workgroup_size(64), uses linearToND()
 *   pauliPotential3DBlock — 3D dispatch, @workgroup_size(4, 4, 4), reads gid.xyz
 *                           directly (latticeDim == 3 only).
 *
 * @workgroup_size(64)
 * @module
 */

export const pauliPotentialBlock = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: PauliUniforms;
@group(0) @binding(1) var<storage, read_write> potential: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);

  // PERF: compute pos lazily inside each potential-type branch instead of
  // filling a pos[12] array. Type 0 needs nothing; type 2 needs only x0;
  // types 1 and 3 stream the coordinate into r2 directly.
  var V: f32 = 0.0;
  if (params.potentialType == 1u) {
    // Harmonic trap: V = 1/2 m omega^2 |x|^2
    var r2: f32 = 0.0;
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      let p = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
      r2 += p * p;
    }
    V = 0.5 * params.mass * params.harmonicOmega * params.harmonicOmega * r2;
  } else if (params.potentialType == 2u) {
    // Barrier: step function along first dimension
    let x0 = (f32(coords[0u]) - f32(params.gridSize[0u]) * 0.5 + 0.5) * params.spacing[0u];
    let halfW = params.wellWidth * 0.5;
    if (x0 > -halfW && x0 < halfW) {
      V = params.wellDepth;
    }
  } else if (params.potentialType == 3u) {
    // Double well (radial Gaussian): V = D (1 - exp(-|x|^2 / W^2))
    var r2: f32 = 0.0;
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      let p = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
      r2 += p * p;
    }
    let W2 = max(params.wellWidth * params.wellWidth, 1e-12);
    V = params.wellDepth * (1.0 - exp(-r2 / W2));
  }

  potential[idx] = V;
}
`

/**
 * 3D-dispatch variant of pauliPotential (latticeDim == 3 only).
 * Reads gid.xyz directly. Bit-identical writes for any 3D grid.
 */
export const pauliPotential3DBlock = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: PauliUniforms;
@group(0) @binding(1) var<storage, read_write> potential: array<f32>;

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= params.gridSize[0] || gid.y >= params.gridSize[1] || gid.z >= params.gridSize[2]) {
    return;
  }
  let idx = gid.x * params.strides[0] + gid.y * params.strides[1] + gid.z * params.strides[2];

  // PERF: pos[] computed lazily inside each potential-type branch — gid.xyz
  // is the coord directly, no array fill needed.
  var V: f32 = 0.0;
  if (params.potentialType == 1u) {
    let px = (f32(gid.x) - f32(params.gridSize[0]) * 0.5 + 0.5) * params.spacing[0];
    let py = (f32(gid.y) - f32(params.gridSize[1]) * 0.5 + 0.5) * params.spacing[1];
    let pz = (f32(gid.z) - f32(params.gridSize[2]) * 0.5 + 0.5) * params.spacing[2];
    let r2 = px * px + py * py + pz * pz;
    V = 0.5 * params.mass * params.harmonicOmega * params.harmonicOmega * r2;
  } else if (params.potentialType == 2u) {
    let x0 = (f32(gid.x) - f32(params.gridSize[0]) * 0.5 + 0.5) * params.spacing[0];
    let halfW = params.wellWidth * 0.5;
    if (x0 > -halfW && x0 < halfW) {
      V = params.wellDepth;
    }
  } else if (params.potentialType == 3u) {
    let px = (f32(gid.x) - f32(params.gridSize[0]) * 0.5 + 0.5) * params.spacing[0];
    let py = (f32(gid.y) - f32(params.gridSize[1]) * 0.5 + 0.5) * params.spacing[1];
    let pz = (f32(gid.z) - f32(params.gridSize[2]) * 0.5 + 0.5) * params.spacing[2];
    let r2 = px * px + py * py + pz * pz;
    let W2 = max(params.wellWidth * params.wellWidth, 1e-12);
    V = params.wellDepth * (1.0 - exp(-r2 / W2));
  }

  potential[idx] = V;
}
`
