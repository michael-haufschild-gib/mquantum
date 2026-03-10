/**
 * TDSE Wavefunction Initialization Compute Shader
 *
 * Initializes psiRe and psiIm storage buffers with a Gaussian wavepacket:
 *   psi(x) = A * exp(-|x - x0|^2 / (4*sigma^2)) * exp(i * k0 . x)
 *
 * For 'planeWave' mode, sigma is set very large (flat envelope).
 * For 'superposition' mode, two counter-propagating packets are summed.
 *
 * Requires tdseUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const tdseInitBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> psiIm: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  // Convert linear index to N-D coordinates
  let coords = linearToND(idx, params.gridSize, params.latticeDim);

  // Compute physical position from lattice coordinates
  var r2: f32 = 0.0;    // |x - x0|^2
  var kdotx: f32 = 0.0; // k0 . x
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let pos = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
    let dx = pos - params.packetCenter[d];
    r2 += dx * dx;
    kdotx += params.packetMomentum[d] * pos;
  }

  let sigma = params.packetWidth;
  let sigma2 = sigma * sigma;
  let envelope = params.packetAmplitude * exp(-r2 / (4.0 * sigma2));

  var reVal: f32 = 0.0;
  var imVal: f32 = 0.0;

  if (params.initCondition == 0u) {
    // gaussianPacket
    reVal = envelope * cos(kdotx);
    imVal = envelope * sin(kdotx);
  } else if (params.initCondition == 1u) {
    // planeWave (Gaussian with very large sigma — effectively flat)
    // The large sigma is set CPU-side via packetWidth, but we still
    // apply the Gaussian to get smooth boundary falloff
    reVal = envelope * cos(kdotx);
    imVal = envelope * sin(kdotx);
  } else if (params.initCondition == 2u) {
    // superposition: two counter-propagating Gaussian packets
    let env1 = params.packetAmplitude * 0.7071 * exp(-r2 / (4.0 * sigma2));
    let phase1 = kdotx;

    // Second packet: shifted center, reversed momentum
    var r2b: f32 = 0.0;
    var kdotx2: f32 = 0.0;
    for (var d2: u32 = 0u; d2 < params.latticeDim; d2++) {
      let pos2 = (f32(coords[d2]) - f32(params.gridSize[d2]) * 0.5 + 0.5) * params.spacing[d2];
      let dx2 = pos2 + params.packetCenter[d2]; // mirrored center
      r2b += dx2 * dx2;
      kdotx2 += -params.packetMomentum[d2] * pos2; // reversed momentum
    }
    let env2 = params.packetAmplitude * 0.7071 * exp(-r2b / (4.0 * sigma2));

    reVal = env1 * cos(phase1) + env2 * cos(kdotx2);
    imVal = env1 * sin(phase1) + env2 * sin(kdotx2);
  } else if (params.initCondition == 3u) {
    // Thomas-Fermi ground state: psi = sqrt(max(0, (mu - V) / g))
    // mu is passed via packetAmplitude, g via interactionStrength
    let mu = params.packetAmplitude;
    let g = params.interactionStrength;
    var Vtf: f32 = 0.0;
    for (var d3: u32 = 0u; d3 < params.latticeDim; d3++) {
      let pos3 = (f32(coords[d3]) - f32(params.gridSize[d3]) * 0.5 + 0.5) * params.spacing[d3];
      let omega_d = params.harmonicOmega * params.trapAnisotropy[d3];
      Vtf += 0.5 * params.mass * omega_d * omega_d * pos3 * pos3;
    }
    let n = max(0.0, (mu - Vtf) / max(abs(g), 1e-10));
    reVal = sqrt(n);
    imVal = 0.0;
  } else if (params.initCondition == 4u) {
    // Vortex imprint: Thomas-Fermi background × product of vortex phase windings.
    // packetMomentum[0] = vortex charge (integer winding number)
    // packetMomentum[3] = vortex lattice count (0 or 1 = single vortex)
    let mu = params.packetAmplitude;
    let g = params.interactionStrength;
    var Vv: f32 = 0.0;
    var pos0v: f32 = 0.0;
    var pos1v: f32 = 0.0;
    for (var d4: u32 = 0u; d4 < params.latticeDim; d4++) {
      let pos4 = (f32(coords[d4]) - f32(params.gridSize[d4]) * 0.5 + 0.5) * params.spacing[d4];
      let omega_d4 = params.harmonicOmega * params.trapAnisotropy[d4];
      Vv += 0.5 * params.mass * omega_d4 * omega_d4 * pos4 * pos4;
      if (d4 == 0u) { pos0v = pos4; }
      if (d4 == 1u) { pos1v = pos4; }
    }
    let nv = max(0.0, (mu - Vv) / max(abs(g), 1e-10));
    let rho = sqrt(nv);
    let charge = params.packetMomentum[0];
    let latticeCount = i32(params.packetMomentum[3]);
    let nVortices = max(latticeCount, 1);
    let xi_bg = params.hbar / sqrt(2.0 * params.mass * max(abs(g) * max(nv, 1e-10), 1e-10));

    if (nVortices <= 1) {
      // Single vortex at origin
      let theta = atan2(pos1v, pos0v);
      let vortexPhase = charge * theta;
      let r_perp = sqrt(pos0v * pos0v + pos1v * pos1v);
      let coreProfile = r_perp / sqrt(r_perp * r_perp + xi_bg * xi_bg);
      reVal = rho * coreProfile * cos(vortexPhase);
      imVal = rho * coreProfile * sin(vortexPhase);
    } else {
      // Multi-vortex lattice: place vortices in a ring pattern.
      // Radius ≈ TF radius / 3 for stable configuration.
      let Rtf = sqrt(2.0 * mu / max(params.mass * params.harmonicOmega * params.harmonicOmega, 1e-10));
      let ringRadius = Rtf * 0.35;
      var totalRe: f32 = rho;
      var totalIm: f32 = 0.0;
      let nf = f32(nVortices);
      for (var vi: i32 = 0; vi < nVortices; vi++) {
        let angle = 2.0 * 3.14159265 * f32(vi) / nf;
        let cx = ringRadius * cos(angle);
        let cy = ringRadius * sin(angle);
        let dx = pos0v - cx;
        let dy = pos1v - cy;
        let r_perp_i = sqrt(dx * dx + dy * dy);
        let theta_i = atan2(dy, dx);
        let vPhase = charge * theta_i;
        let coreFactor = r_perp_i / sqrt(r_perp_i * r_perp_i + xi_bg * xi_bg);
        // Multiply total wavefunction by this vortex's contribution
        let nextRe = totalRe * coreFactor * cos(vPhase) - totalIm * coreFactor * sin(vPhase);
        let nextIm = totalRe * coreFactor * sin(vPhase) + totalIm * coreFactor * cos(vPhase);
        totalRe = nextRe;
        totalIm = nextIm;
      }
      reVal = totalRe;
      imVal = totalIm;
    }
  } else if (params.initCondition == 5u) {
    // Dark soliton with configurable depth and velocity.
    // packetMomentum[1] = soliton depth β ∈ [0,1] (1 = full black soliton)
    // packetMomentum[2] = soliton velocity v_s as fraction of sound speed c_s
    //
    // Full dark soliton ansatz: ψ(x) = √n₀ · (β·tanh(β·x/(√2·ξ)) + i·v_s/c_s)
    // where β = √(1 - v²/c²), and for a stationary soliton (v_s=0): ψ = √n₀ · tanh(x/(√2·ξ))
    let mu = params.packetAmplitude;
    let g = params.interactionStrength;
    var Vs: f32 = 0.0;
    var pos0s: f32 = 0.0;
    for (var d5: u32 = 0u; d5 < params.latticeDim; d5++) {
      let pos5 = (f32(coords[d5]) - f32(params.gridSize[d5]) * 0.5 + 0.5) * params.spacing[d5];
      let omega_d5 = params.harmonicOmega * params.trapAnisotropy[d5];
      Vs += 0.5 * params.mass * omega_d5 * omega_d5 * pos5 * pos5;
      if (d5 == 0u) { pos0s = pos5; }
    }
    let n0 = max(0.0, (mu - Vs) / max(abs(g), 1e-10));
    let absG = max(abs(g), 1e-10);
    let n0_safe = max(n0, 1e-10);
    let xi = params.hbar / sqrt(2.0 * params.mass * absG * n0_safe);
    // Read depth parameter (0 = no notch, 1 = full black soliton)
    let depthParam = clamp(params.packetMomentum[1], 0.0, 1.0);
    // Read velocity as fraction of local sound speed
    let vFrac = clamp(params.packetMomentum[2], -0.99, 0.99);
    // β = √(depth² - v²) clamped; for depth=1, v=0 → β=1 (black soliton)
    let beta = sqrt(max(depthParam * depthParam - vFrac * vFrac, 0.0));
    let xi_safe = max(xi, 1e-6);
    let solitonRe = beta * tanh(beta * pos0s / (1.414 * xi_safe));
    let solitonIm = vFrac;
    reVal = sqrt(n0) * solitonRe;
    imVal = sqrt(n0) * solitonIm;
  }

  psiRe[idx] = reVal;
  psiIm[idx] = imVal;
}
`
