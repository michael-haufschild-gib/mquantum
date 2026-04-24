/**
 * Pauli Half-Step Potential + Zeeman SU(2) Rotation
 *
 * Applies the combined scalar-potential phase and Zeeman magnetic-field
 * rotation in a single half-step of the Strang splitting:
 *
 *   U_half = exp(-i [V(x) + μ_B σ·B(x)] dt/(2ℏ))
 *
 * PML absorber damping is applied in a SEPARATE pass after the full
 * Strang step to prevent the FFT kinetic step from scattering the
 * absorber's spatial modulation across k-space.
 *
 * The 2×2 matrix exponential factors exactly as:
 *
 *   1) Scalar potential phase (both components):
 *        φ_V = -V(x) dt / (2ℏ)
 *        ψ_c → (cos φ_V + i sin φ_V) ψ_c
 *
 *   2) Zeeman SU(2) rotation (Cayley–Klein matrix):
 *        θ_B = |B(x)| dt / (2ℏ)        (natural units: μ_B = 1)
 *        n̂ = B / |B|
 *        σ·n̂ = [[nz, nx - i·ny], [nx + i·ny, -nz]]
 *        U = cos(θ_B)·I - i·sin(θ_B)·σ·n̂
 *
 * Magnetic field models (fieldType):
 *   0 uniform:    B = B₀ (sin θ_d cos φ_d, sin θ_d sin φ_d, cos θ_d)
 *   1 gradient:   B = (B₀ + g·z) ẑ,  z = coord along dim 2
 *   2 rotating:   B = B₀ (cos(ω·t), sin(ω·t), 0)
 *   3 quadrupole: B = g (x ẑ + z x̂) using coords[0] and coords[2]
 *
 * Scalar potential V(x) is now precomputed once per parameter change by
 * pauliPotential.wgsl.ts and read here via a single load — this saves the
 * per-voxel position loop + exp() / muladd chain on every Strang substep.
 *
 * Requires pauliUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * Two variants:
 *   pauliPotentialHalfBlock   — 1D dispatch, @workgroup_size(64), uses linearToND()
 *   pauliPotentialHalf3DBlock — 3D dispatch, @workgroup_size(4, 4, 4),
 *                               reads gid.xyz directly (latticeDim == 3 only).
 *                               Saves the linearToND call from the per-substep
 *                               kernel — the dominant Pauli compute cost.
 *
 * @workgroup_size(64)
 * @module
 */

export const pauliPotentialHalfBlock = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: PauliUniforms;
@group(0) @binding(1) var<storage, read_write> spinor: array<vec2f>;
@group(0) @binding(2) var<storage, read> potential: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  let T = params.totalSites;
  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);

  // Compute physical position for each dimension. Needed below for the
  // magnetic-field evaluation (gradient / quadrupole branches).
  var pos: array<f32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    pos[d] = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
  }

  // Scalar potential V(x) — filled once per parameter change by
  // pauliPotential.wgsl.ts so this per-substep kernel only pays 1 load.
  let V = potential[idx];

  // ---- Scalar potential phase rotation ----
  // Hoist dt/(2ℏ) once so it can be reused below for θ_B (saves 1 divide).
  let dtOver2Hbar = params.dt / (2.0 * max(params.hbar, 1e-6));
  // Use the positive argument V·dt/(2ℏ); fold the −arg sign into the complex
  // multiplies below via cos(−x)=cos(x), sin(−x)=−sin(x). Saves one negation.
  let argV = V * dtOver2Hbar;
  let cosPV = cos(argV);
  let sinPV = sin(argV);

  let idx1 = T + idx;
  // Merged vec2f layout: one 8-byte load per component.
  let s0_in = spinor[idx];
  let s1_in = spinor[idx1];
  let re0_in = s0_in.x;
  let im0_in = s0_in.y;
  let re1_in = s1_in.x;
  let im1_in = s1_in.y;

  // Apply scalar phase exp(−i·argV) to both components:
  //   (cosPV − i·sinPV)·(re + i·im) = (re·cosPV + im·sinPV) + i·(im·cosPV − re·sinPV)
  let re0_v = re0_in * cosPV + im0_in * sinPV;
  let im0_v = im0_in * cosPV - re0_in * sinPV;
  let re1_v = re1_in * cosPV + im1_in * sinPV;
  let im1_v = im1_in * cosPV - re1_in * sinPV;

  // ---- Magnetic field B(x) ----
  var Bx: f32 = 0.0;
  var By: f32 = 0.0;
  var Bz: f32 = 0.0;
  let B0 = params.fieldStrength;

  if (params.fieldType == 0u) {
    // Uniform field in direction (theta_d, phi_d)
    let st = sin(params.fieldDirTheta);
    let ct = cos(params.fieldDirTheta);
    let sp = sin(params.fieldDirPhi);
    let cp = cos(params.fieldDirPhi);
    Bx = B0 * st * cp;
    By = B0 * st * sp;
    Bz = B0 * ct;
  } else if (params.fieldType == 1u) {
    // Gradient along z (dim 2): B = (B0 + g·z) ẑ
    let zCoord = select(0.0, pos[2u], params.latticeDim > 2u);
    Bz = B0 + params.gradientStrength * zCoord;
  } else if (params.fieldType == 2u) {
    // Rotating field in xy-plane: B = B0 (cos(ωt), sin(ωt), 0)
    let ang = params.rotatingFrequency * params.simTime;
    Bx = B0 * cos(ang);
    By = B0 * sin(ang);
  } else if (params.fieldType == 3u) {
    // Quadrupole: B = g (x ẑ + z x̂)
    let xCoord = pos[0u];
    let zCoord = select(0.0, pos[2u], params.latticeDim > 2u);
    let g = params.gradientStrength;
    Bx = g * zCoord;
    Bz = g * xCoord;
  }

  // ---- Zeeman SU(2) rotation ----
  // θ_B = |B| dt / (2ℏ). Fuse sqrt + reciprocal via inverseSqrt: one rsqrt and
  // one multiply reproduce |B| from |B|^2.
  let BmagSq = Bx * Bx + By * By + Bz * Bz;

  var re0_out: f32 = re0_v;
  var im0_out: f32 = im0_v;
  var re1_out: f32 = re1_v;
  var im1_out: f32 = im1_v;

  if (BmagSq > 1e-40) {
    let invBmag = inverseSqrt(BmagSq);
    let Bmag = BmagSq * invBmag;
    let nx = Bx * invBmag;
    let ny = By * invBmag;
    let nz = Bz * invBmag;

    let thetaB = Bmag * dtOver2Hbar;
    let cosB = cos(thetaB);
    let sinB = sin(thetaB);
    // Precompute the three sinB·n* products — each appears twice below.
    let sBx = sinB * nx;
    let sBy = sinB * ny;
    let sBz = sinB * nz;

    // U_00 = (cosB - i sinB nz),  U_01 = (-sinB ny - i sinB nx)
    // U_10 = ( sinB ny - i sinB nx), U_11 = (cosB + i sinB nz)
    let a00Re = cosB;
    let a00Im = -sBz;
    let a01Re = -sBy;
    let a01Im = -sBx;
    let a10Re =  sBy;
    let a10Im = -sBx;
    let a11Re = cosB;
    let a11Im =  sBz;

    // Complex matrix-vector multiply: (aRe + i aIm)(rV + i iV) = aRe·rV - aIm·iV + i(aRe·iV + aIm·rV)
    let new_re0 = (a00Re * re0_v - a00Im * im0_v) + (a01Re * re1_v - a01Im * im1_v);
    let new_im0 = (a00Re * im0_v + a00Im * re0_v) + (a01Re * im1_v + a01Im * re1_v);
    let new_re1 = (a10Re * re0_v - a10Im * im0_v) + (a11Re * re1_v - a11Im * im1_v);
    let new_im1 = (a10Re * im0_v + a10Im * re0_v) + (a11Re * im1_v + a11Im * re1_v);

    re0_out = new_re0;
    im0_out = new_im0;
    re1_out = new_re1;
    im1_out = new_im1;
  }

  // Absorber is a SEPARATE pass after the full Strang step — not here.
  // This prevents the FFT kinetic step from scattering the absorber's
  // spatial modulation across k-space.

  // Merged vec2f layout: one 8-byte store per component.
  spinor[idx] = vec2f(re0_out, im0_out);
  spinor[idx1] = vec2f(re1_out, im1_out);
}
`

/**
 * 3D-dispatch variant of pauliPotentialHalf (latticeDim == 3 only).
 * Reads gid.xyz directly. Identical math to pauliPotentialHalfBlock — only the
 * coordinate-derivation prelude differs (no linearToND call). Bit-identical
 * spinor writes for any 3D grid.
 */
export const pauliPotentialHalf3DBlock = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: PauliUniforms;
@group(0) @binding(1) var<storage, read_write> spinor: array<vec2f>;
@group(0) @binding(2) var<storage, read> potential: array<f32>;

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= params.gridSize[0] || gid.y >= params.gridSize[1] || gid.z >= params.gridSize[2]) {
    return;
  }
  let T = params.totalSites;
  let idx = gid.x * params.strides[0] + gid.y * params.strides[1] + gid.z * params.strides[2];

  var coords: array<u32, 12>;
  coords[0] = gid.x;
  coords[1] = gid.y;
  coords[2] = gid.z;

  var pos: array<f32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    pos[d] = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
  }

  let V = potential[idx];

  let dtOver2Hbar = params.dt / (2.0 * max(params.hbar, 1e-6));
  let argV = V * dtOver2Hbar;
  let cosPV = cos(argV);
  let sinPV = sin(argV);

  let idx1 = T + idx;
  let s0_in = spinor[idx];
  let s1_in = spinor[idx1];
  let re0_in = s0_in.x;
  let im0_in = s0_in.y;
  let re1_in = s1_in.x;
  let im1_in = s1_in.y;

  let re0_v = re0_in * cosPV + im0_in * sinPV;
  let im0_v = im0_in * cosPV - re0_in * sinPV;
  let re1_v = re1_in * cosPV + im1_in * sinPV;
  let im1_v = im1_in * cosPV - re1_in * sinPV;

  var Bx: f32 = 0.0;
  var By: f32 = 0.0;
  var Bz: f32 = 0.0;
  let B0 = params.fieldStrength;

  if (params.fieldType == 0u) {
    let st = sin(params.fieldDirTheta);
    let ct = cos(params.fieldDirTheta);
    let sp = sin(params.fieldDirPhi);
    let cp = cos(params.fieldDirPhi);
    Bx = B0 * st * cp;
    By = B0 * st * sp;
    Bz = B0 * ct;
  } else if (params.fieldType == 1u) {
    let zCoord = select(0.0, pos[2u], params.latticeDim > 2u);
    Bz = B0 + params.gradientStrength * zCoord;
  } else if (params.fieldType == 2u) {
    let ang = params.rotatingFrequency * params.simTime;
    Bx = B0 * cos(ang);
    By = B0 * sin(ang);
  } else if (params.fieldType == 3u) {
    let xCoord = pos[0u];
    let zCoord = select(0.0, pos[2u], params.latticeDim > 2u);
    let g = params.gradientStrength;
    Bx = g * zCoord;
    Bz = g * xCoord;
  }

  let BmagSq = Bx * Bx + By * By + Bz * Bz;

  var re0_out: f32 = re0_v;
  var im0_out: f32 = im0_v;
  var re1_out: f32 = re1_v;
  var im1_out: f32 = im1_v;

  if (BmagSq > 1e-40) {
    let invBmag = inverseSqrt(BmagSq);
    let Bmag = BmagSq * invBmag;
    let nx = Bx * invBmag;
    let ny = By * invBmag;
    let nz = Bz * invBmag;

    let thetaB = Bmag * dtOver2Hbar;
    let cosB = cos(thetaB);
    let sinB = sin(thetaB);
    let sBx = sinB * nx;
    let sBy = sinB * ny;
    let sBz = sinB * nz;

    let a00Re = cosB;
    let a00Im = -sBz;
    let a01Re = -sBy;
    let a01Im = -sBx;
    let a10Re =  sBy;
    let a10Im = -sBx;
    let a11Re = cosB;
    let a11Im =  sBz;

    let new_re0 = (a00Re * re0_v - a00Im * im0_v) + (a01Re * re1_v - a01Im * im1_v);
    let new_im0 = (a00Re * im0_v + a00Im * re0_v) + (a01Re * im1_v + a01Im * re1_v);
    let new_re1 = (a10Re * re0_v - a10Im * im0_v) + (a11Re * re1_v - a11Im * im1_v);
    let new_im1 = (a10Re * im0_v + a10Im * re0_v) + (a11Re * im1_v + a11Im * re1_v);

    re0_out = new_re0;
    im0_out = new_im0;
    re1_out = new_re1;
    im1_out = new_im1;
  }

  spinor[idx] = vec2f(re0_out, im0_out);
  spinor[idx1] = vec2f(re1_out, im1_out);
}
`
