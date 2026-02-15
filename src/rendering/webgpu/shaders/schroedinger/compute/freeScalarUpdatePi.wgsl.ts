/**
 * Free Scalar Field — Leapfrog Pi-Update Compute Shader
 *
 * Updates conjugate momentum pi using the Klein-Gordon equation of motion:
 *   pi[n] += dt * (laplacian(phi)[n] - m^2 * phi[n])
 *
 * The discrete Laplacian uses periodic boundary conditions:
 *   laplacian = sum_i (phi[n+e_i] - 2*phi[n] + phi[n-e_i]) / a_i^2
 *
 * Requires freeScalarUniformsBlock to be prepended for struct definition.
 */

export const freeScalarUpdatePiBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: FreeScalarUniforms;
@group(0) @binding(1) var<storage, read> phi: array<f32>;
@group(0) @binding(2) var<storage, read_write> pi: array<f32>;

// Convert 3D lattice coordinates to 1D buffer index
fn coordToIndex(ix: u32, iy: u32, iz: u32) -> u32 {
  return iz * params.gridSize.x * params.gridSize.y + iy * params.gridSize.x + ix;
}

// Periodic boundary wrap
fn wrap(coord: i32, size: u32) -> u32 {
  return u32((coord + i32(size)) % i32(size));
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) { return; }

  let nx = params.gridSize.x;
  let ny = params.gridSize.y;
  let nz = params.gridSize.z;
  let iz = idx / (nx * ny);
  let iy = (idx % (nx * ny)) / nx;
  let ix = idx % nx;

  let phiCenter = phi[idx];
  var laplacian: f32 = 0.0;

  // X dimension (always active)
  if (nx > 1u) {
    let ixp = coordToIndex(wrap(i32(ix) + 1, nx), iy, iz);
    let ixm = coordToIndex(wrap(i32(ix) - 1, nx), iy, iz);
    let ax2 = params.spacing.x * params.spacing.x;
    laplacian += (phi[ixp] - 2.0 * phiCenter + phi[ixm]) / ax2;
  }

  // Y dimension (active when latticeDim >= 2)
  if (params.latticeDim >= 2u && ny > 1u) {
    let iyp = coordToIndex(ix, wrap(i32(iy) + 1, ny), iz);
    let iym = coordToIndex(ix, wrap(i32(iy) - 1, ny), iz);
    let ay2 = params.spacing.y * params.spacing.y;
    laplacian += (phi[iyp] - 2.0 * phiCenter + phi[iym]) / ay2;
  }

  // Z dimension (active when latticeDim >= 3)
  if (params.latticeDim >= 3u && nz > 1u) {
    let izp = coordToIndex(ix, iy, wrap(i32(iz) + 1, nz));
    let izm = coordToIndex(ix, iy, wrap(i32(iz) - 1, nz));
    let az2 = params.spacing.z * params.spacing.z;
    laplacian += (phi[izp] - 2.0 * phiCenter + phi[izm]) / az2;
  }

  // Klein-Gordon equation: d²phi/dt² = laplacian(phi) - m² * phi
  // In Hamiltonian form: dpi/dt = laplacian(phi) - m² * phi
  pi[idx] = pi[idx] + params.dt * (laplacian - params.mass * params.mass * phiCenter);
}
`
