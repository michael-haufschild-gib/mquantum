/**
 * Free Scalar Field — Write to 3D Density Grid Compute Shader
 *
 * Reads the selected field quantity (phi, pi, or energy density) from
 * storage buffers and writes to the 3D density grid texture used by
 * the existing raymarching pipeline.
 *
 * Sign encoding: |value| stored in R channel, sign encoded as phase
 * in B channel (0.0 = positive, PI = negative). This makes diverging
 * and phase color algorithms work naturally.
 *
 * Requires freeScalarUniformsBlock to be prepended for struct definition.
 */

export const freeScalarWriteGridBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: FreeScalarUniforms;
@group(0) @binding(1) var<storage, read> phi: array<f32>;
@group(0) @binding(2) var<storage, read> pi: array<f32>;
@group(0) @binding(3) var outputTex: texture_storage_3d<rgba16float, write>;

// Convert 3D lattice coordinates to 1D buffer index
fn coordToIdx(ix: u32, iy: u32, iz: u32) -> u32 {
  return iz * params.gridSize.x * params.gridSize.y + iy * params.gridSize.x + ix;
}

// Periodic boundary wrap
fn wrapCoord(coord: i32, size: u32) -> u32 {
  return u32((coord + i32(size)) % i32(size));
}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let nx = params.gridSize.x;
  let ny = params.gridSize.y;
  let nz = params.gridSize.z;

  // For lower-dimensional lattices, map appropriately to 3D texture
  let texDims = textureDimensions(outputTex);
  if (gid.x >= texDims.x || gid.y >= texDims.y || gid.z >= texDims.z) { return; }

  // Nearest-neighbor resample: map texture coordinate to lattice coordinate
  var ix = min(u32(f32(gid.x) * f32(nx) / f32(texDims.x)), nx - 1u);
  var iy = select(min(u32(f32(gid.y) * f32(ny) / f32(texDims.y)), ny - 1u), 0u, params.latticeDim < 2u);
  var iz = select(min(u32(f32(gid.z) * f32(nz) / f32(texDims.z)), nz - 1u), 0u, params.latticeDim < 3u);

  let idx = coordToIdx(ix, iy, iz);
  let phiVal = phi[idx];
  let piVal = pi[idx];

  var fieldValue: f32 = 0.0;

  if (params.fieldView == 0u) {
    // phi (field amplitude)
    fieldValue = phiVal;
  } else if (params.fieldView == 1u) {
    // pi (conjugate momentum)
    fieldValue = piVal;
  } else {
    // Energy density: E = 0.5*(pi^2 + |grad phi|^2 + m^2*phi^2)
    var gradPhiSq: f32 = 0.0;

    // Gradient in X
    if (nx > 1u) {
      let phiXp = phi[coordToIdx(wrapCoord(i32(ix) + 1, nx), iy, iz)];
      let phiXm = phi[coordToIdx(wrapCoord(i32(ix) - 1, nx), iy, iz)];
      let dPhiDx = (phiXp - phiXm) / (2.0 * params.spacing.x);
      gradPhiSq += dPhiDx * dPhiDx;
    }

    // Gradient in Y
    if (params.latticeDim >= 2u && ny > 1u) {
      let phiYp = phi[coordToIdx(ix, wrapCoord(i32(iy) + 1, ny), iz)];
      let phiYm = phi[coordToIdx(ix, wrapCoord(i32(iy) - 1, ny), iz)];
      let dPhiDy = (phiYp - phiYm) / (2.0 * params.spacing.y);
      gradPhiSq += dPhiDy * dPhiDy;
    }

    // Gradient in Z
    if (params.latticeDim >= 3u && nz > 1u) {
      let phiZp = phi[coordToIdx(ix, iy, wrapCoord(i32(iz) + 1, nz))];
      let phiZm = phi[coordToIdx(ix, iy, wrapCoord(i32(iz) - 1, nz))];
      let dPhiDz = (phiZp - phiZm) / (2.0 * params.spacing.z);
      gradPhiSq += dPhiDz * dPhiDz;
    }

    fieldValue = 0.5 * (piVal * piVal + gradPhiSq + params.mass * params.mass * phiVal * phiVal);
  }

  // Encode for density grid:
  // R: |value| (magnitude / density)
  // G: log(|value| + epsilon) for log-density rendering
  // B: phase encoding (0.0 = positive, PI = negative) for color algorithms
  // A: unused
  let rho = abs(fieldValue);
  let normRho = select(rho / params.maxFieldValue, rho, params.maxFieldValue <= 0.0);
  let logRho = log(normRho + 1e-10);
  let phase = select(0.0, 3.14159265, fieldValue < 0.0);

  textureStore(outputTex, gid, vec4f(normRho, logRho, phase, 0.0));
}
`
