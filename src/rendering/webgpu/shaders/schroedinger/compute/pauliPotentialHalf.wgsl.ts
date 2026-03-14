/**
 * Pauli Half-Step Potential + Zeeman SU(2) Rotation Compute Shader
 *
 * Applies the combined scalar-potential phase and Zeeman magnetic-field
 * rotation in a single half-step of the Strang splitting:
 *
 *   U_half = exp(-i [V(x) + μ_B σ·B(x)] dt/(2ℏ))
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
 *        U components:
 *          U_00 = (cos θ_B,          -sin θ_B · nz)   [re, im]
 *          U_01 = (-sin θ_B · ny,    -sin θ_B · nx)
 *          U_10 = ( sin θ_B · ny,    -sin θ_B · nx)
 *          U_11 = (cos θ_B,           sin θ_B · nz)
 *
 * Magnetic field models (fieldType):
 *   0 uniform:    B = B₀ (sin θ_d cos φ_d, sin θ_d sin φ_d, cos θ_d)
 *   1 gradient:   B = (B₀ + g·z) ẑ,  z = coord along dim 2
 *   2 rotating:   B = B₀ (cos(ω·t), sin(ω·t), 0)
 *   3 quadrupole: B = g (x ẑ + z x̂) using coords[0] and coords[2]
 *
 * Scalar potential models (potentialType):
 *   0 none
 *   1 harmonicTrap:  V = ½ mass ω² |x|²
 *   2 barrier:       V = wellDepth   if |x₀| < wellWidth/2 (first dim)
 *   3 doubleWell:    V = wellDepth (1 - exp(-|x|²/wellWidth²))
 *
 * Requires pauliUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const pauliPotentialHalfBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: PauliUniforms;
@group(0) @binding(1) var<storage, read_write> spinorRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> spinorIm: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  let T = params.totalSites;
  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);

  // Compute physical position for each dimension
  var pos: array<f32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    pos[d] = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
  }

  // ---- Scalar potential V(x) ----
  var V: f32 = 0.0;
  if (params.potentialType == 1u) {
    // Harmonic trap: V = ½ m ω² |x|²
    var r2: f32 = 0.0;
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      r2 += pos[d] * pos[d];
    }
    V = 0.5 * params.mass * params.harmonicOmega * params.harmonicOmega * r2;
  } else if (params.potentialType == 2u) {
    // Barrier: step function along first dimension
    let x0 = pos[0u];
    let halfW = params.wellWidth * 0.5;
    if (x0 > -halfW && x0 < halfW) {
      V = params.wellDepth;
    }
  } else if (params.potentialType == 3u) {
    // Double well: V = D (1 - exp(-|x|²/W²))
    var r2: f32 = 0.0;
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      r2 += pos[d] * pos[d];
    }
    let W2 = params.wellWidth * params.wellWidth;
    V = params.wellDepth * (1.0 - exp(-r2 / W2));
  }

  // ---- Scalar potential phase rotation ----
  // φ_V = -V dt / (2ℏ)
  let phiV = -V * params.dt / (2.0 * params.hbar);
  let cosPV = cos(phiV);
  let sinPV = sin(phiV);

  let re0_in = spinorRe[idx];
  let im0_in = spinorIm[idx];
  let re1_in = spinorRe[T + idx];
  let im1_in = spinorIm[T + idx];

  // Apply scalar phase to both components
  let re0_v = re0_in * cosPV - im0_in * sinPV;
  let im0_v = re0_in * sinPV + im0_in * cosPV;
  let re1_v = re1_in * cosPV - im1_in * sinPV;
  let im1_v = re1_in * sinPV + im1_in * cosPV;

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
  // θ_B = |B| dt / (2ℏ)
  let Bmag = sqrt(Bx * Bx + By * By + Bz * Bz);

  var re0_out: f32 = re0_v;
  var im0_out: f32 = im0_v;
  var re1_out: f32 = re1_v;
  var im1_out: f32 = im1_v;

  if (Bmag > 1e-20) {
    let nx = Bx / Bmag;
    let ny = By / Bmag;
    let nz = Bz / Bmag;

    let thetaB = Bmag * params.dt / (2.0 * params.hbar);
    let cosB = cos(thetaB);
    let sinB = sin(thetaB);

    // U_00 = (cosB - i sinB nz),  U_01 = (-sinB ny - i sinB nx)
    // U_10 = ( sinB ny - i sinB nx), U_11 = (cosB + i sinB nz)
    //
    // New ψ_up   = U_00 ψ_up + U_01 ψ_down
    // New ψ_down = U_10 ψ_up + U_11 ψ_down

    // U_00 applied to (re0_v, im0_v):
    //   re part: cosB · re0_v - (-sinB·nz) · im0_v = cosB·re0 + sinB·nz·im0
    //   im part: cosB · im0_v + (-sinB·nz) · re0_v = cosB·im0 - sinB·nz·re0
    let a00Re = cosB;
    let a00Im = -sinB * nz;
    let a01Re = -sinB * ny;
    let a01Im = -sinB * nx;
    let a10Re = sinB * ny;
    let a10Im = -sinB * nx;
    let a11Re = cosB;
    let a11Im = sinB * nz;

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

  spinorRe[idx] = re0_out;
  spinorIm[idx] = im0_out;
  spinorRe[T + idx] = re1_out;
  spinorIm[T + idx] = im1_out;
}
`
