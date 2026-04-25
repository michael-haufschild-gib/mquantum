/**
 * Dirac Potential Compute Shader
 *
 * Fills the potential buffer V(x) from the selected potential type.
 * Simpler than the TDSE potential shader — Dirac scenarios use
 * step, barrier, well, harmonic trap, and Coulomb potentials.
 *
 * Potential types:
 *   0 = none (V=0, free particle)
 *   1 = step (Heaviside along axis 0 at potentialCenter)
 *   2 = barrier (rectangular along axis 0)
 *   3 = well (symmetric finite square well along axis 0)
 *   4 = harmonicTrap (isotropic harmonic oscillator)
 *   5 = coulomb (-Z/r, soft-core regularized)
 *
 * Two emitted variants:
 *   - 1D (@workgroup_size(64)): legacy linear dispatch using linearToND.
 *   - 3D (@workgroup_size(4, 4, 4)): direct gid.xyz coords for latticeDim ≤ 3.
 *     Eliminates the per-thread linearToND decode. Same write set per voxel.
 *
 * Requires diracUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @module
 */

const diracPotentialBindings = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: DiracUniforms;
@group(0) @binding(1) var<storage, read_write> potential: array<f32>;
`

const diracPotentialBody = /* wgsl */ `
  // Compute physical positions
  var pos: array<f32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    pos[d] = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
  }

  var V: f32 = 0.0;

  if (params.potentialType == 0u) {
    // Free particle: V = 0
    V = 0.0;

  } else if (params.potentialType == 1u) {
    // Step potential: V0 for x_0 > center (Klein paradox)
    V = select(0.0, params.potentialStrength, pos[0] > params.potentialCenter);

  } else if (params.potentialType == 2u) {
    // Rectangular barrier: V0 within half-width of center
    let halfWidth = params.potentialWidth * 0.5;
    let inBarrier = abs(pos[0] - params.potentialCenter) < halfWidth;
    V = select(0.0, params.potentialStrength, inBarrier);

  } else if (params.potentialType == 3u) {
    // Finite square well: -V0 within half-width of center
    let halfWidth = params.potentialWidth * 0.5;
    let inWell = abs(pos[0] - params.potentialCenter) < halfWidth;
    V = select(0.0, -params.potentialStrength, inWell);

  } else if (params.potentialType == 4u) {
    // Harmonic trap: V = 0.5 * m * omega^2 * |x|^2
    var r2: f32 = 0.0;
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      r2 += pos[d] * pos[d];
    }
    let omega2 = params.harmonicOmega * params.harmonicOmega;
    V = 0.5 * params.mass * omega2 * r2;

  } else if (params.potentialType == 5u) {
    // Coulomb: V = -Z/r (soft-core regularized to avoid singularity)
    var r2: f32 = 0.0;
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      r2 += pos[d] * pos[d];
    }
    // Soft-core: r_eff = sqrt(r^2 + (0.1 * dx)^2)
    let softCore = 0.1 * params.spacing[0];
    let r = sqrt(r2 + softCore * softCore);
    V = -params.coulombZ / r;
  }

  potential[idx] = V;
}
`

/** Legacy 1D dispatch. Workgroup size 64. */
export const diracPotentialBlock = /* wgsl */ `${diracPotentialBindings}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);
${diracPotentialBody}`

/** 3-D dispatch variant for latticeDim <= 3. Workgroup size 4x4x4. */
export const diracPotentialBlock3D = /* wgsl */ `${diracPotentialBindings}
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let latDim = params.latticeDim;
  if (gid.x >= params.gridSize[0]) { return; }
  if (latDim > 1u && gid.y >= params.gridSize[1]) { return; }
  if (latDim > 2u && gid.z >= params.gridSize[2]) { return; }

  var coords: array<u32, 12>;
  coords[0] = gid.x;
  if (latDim > 1u) { coords[1] = gid.y; }
  if (latDim > 2u) { coords[2] = gid.z; }

  let idx = ndToLinear(coords, params.strides, latDim);
${diracPotentialBody}`
