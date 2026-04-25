/**
 * TDSE Wavefunction Initialization Compute Shader
 *
 * Initializes the psi storage buffer (array<vec2f>: .x = Re, .y = Im) with
 * a Gaussian wavepacket:
 *   psi(x) = A * exp(-|x - x0|^2 / (4*sigma^2)) * exp(i * k0 . x)
 *
 * For 'planeWave' mode, sigma is set very large (flat envelope).
 * For 'superposition' mode, two counter-propagating packets are summed.
 *
 * Requires tdseUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * Two variants are exported. Both have identical semantics — the host picks
 * one based on latticeDim (see pickSiteDispatch in computePassUtils):
 *   - tdseInitBlock:    1-D dispatch, @workgroup_size(64), linearToND coords.
 *   - tdseInitBlock3D:  3-D dispatch, @workgroup_size(4, 4, 4), gid.xyz coords.
 *
 * The 3-D variant is preferred when latticeDim === 3 — it skips the
 * shift/mask decomposition that linearToND performs for every thread.
 *
 * @workgroup_size(64) (1-D variant) | @workgroup_size(4, 4, 4) (3-D variant)
 * @module
 */

/** Shared kernel body — read by both 1-D and 3-D variants. Expects 'idx' and 'coords' to be defined. */
const TDSE_INIT_BODY = /* wgsl */ `
  // Compute physical position from lattice coordinates
  var r2: f32 = 0.0;    // |x - x0|^2
  var kdotx: f32 = 0.0; // k0 . x
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let pos = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
    let dx = pos - params.packetCenter[d];
    r2 += dx * dx;
    kdotx += params.packetMomentum[d] * pos;
  }

  // Guard near-zero packetWidth: inv4Sigma2 → INF → envelope = NaN poisons
  // psi for the rest of the run.
  let sigma = max(abs(params.packetWidth), 1e-6);
  let inv4Sigma2 = 1.0 / (4.0 * sigma * sigma);
  let gauss = exp(-r2 * inv4Sigma2);
  let envelope = params.packetAmplitude * gauss;

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
    // superposition: two counter-propagating Gaussian packets (amp ÷ √2 per arm).
    // Reuses the already-computed gauss = exp(-r2 * inv4Sigma2) — env1 shares
    // r2 with the default envelope so there is no extra transcendental here.
    let invSqrt2 = 0.7071067811865475;
    let env1 = params.packetAmplitude * invSqrt2 * gauss;
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
    let env2 = params.packetAmplitude * invSqrt2 * exp(-r2b * inv4Sigma2);

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
    // packetMomentum[4] = alternate charge flag (1.0 = dipole ±charge pattern)
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
    let alternateCharge = params.packetMomentum[4] > 0.5;
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
      let invNf = 1.0 / nf;
      let TAU_VORT: f32 = 6.28318530717958647692;
      for (var vi: i32 = 0; vi < nVortices; vi = vi + 1) {
        let angle = TAU_VORT * f32(vi) * invNf;
        let cx = ringRadius * cos(angle);
        let cy = ringRadius * sin(angle);
        let dx = pos0v - cx;
        let dy = pos1v - cy;
        let r_perp_i = sqrt(dx * dx + dy * dy);
        let theta_i = atan2(dy, dx);
        // Alternate charge sign for dipole: even vortices +charge, odd -charge
        let viCharge = select(charge, charge * select(1.0, -1.0, vi % 2 == 1), alternateCharge);
        let vPhase = viCharge * theta_i;
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
    // 1/(√2·ξ) — computed once instead of divide per thread.
    let invSqrt2Xi = 0.70710678118654752 / xi_safe;
    let solitonRe = beta * tanh(beta * pos0s * invSqrt2Xi);
    let solitonIm = vFrac;
    let rho0 = sqrt(n0);
    reVal = rho0 * solitonRe;
    imVal = rho0 * solitonIm;
  } else if (params.initCondition == 6u) {
    // N-D vortex reconnection pair: product of phase windings in configurable planes.
    //
    // Each vortex is a codimension-2 defect defined by a 2D winding plane (axisA, axisB).
    // In D=3 this is a vortex line; in D=4 a vortex surface; in D=5 a vortex volume.
    // The product ansatz ψ = ρ_TF × Π_i [f(r_i) × exp(i·m·θ_i)] seeds 1 or 2 vortices
    // in specified planes for reconnection studies.
    //
    // Uniform fields:
    //   vortexPlane1Axis0/1: plane axes for vortex 1
    //   vortexPlane2Axis0/1: plane axes for vortex 2
    //   vortexSeparation: displacement of vortex cores from origin
    //   vortexCount: 1 or 2 vortices
    //   packetMomentum[0]: vortex charge (winding number)
    //   packetAmplitude: chemical potential μ
    //   interactionStrength: coupling g

    let mu6 = params.packetAmplitude;
    let g6 = params.interactionStrength;
    let charge6 = params.packetMomentum[0];
    let sep = params.vortexSeparation;
    let nVortex = params.vortexCount;

    // Compute physical positions for all dimensions
    var worldPos: array<f32, 12>;
    var V6: f32 = 0.0;
    for (var d6: u32 = 0u; d6 < params.latticeDim; d6++) {
      let p6 = (f32(coords[d6]) - f32(params.gridSize[d6]) * 0.5 + 0.5) * params.spacing[d6];
      worldPos[d6] = p6;
      let omega6 = params.harmonicOmega * params.trapAnisotropy[d6];
      V6 += 0.5 * params.mass * omega6 * omega6 * p6 * p6;
    }

    // Thomas-Fermi background density
    let n6 = max(0.0, (mu6 - V6) / max(abs(g6), 1e-10));
    let rho6 = sqrt(n6);
    let xi6 = params.hbar / sqrt(2.0 * params.mass * max(abs(g6) * max(n6, 1e-10), 1e-10));

    // Start with TF background (real, no phase)
    var vRe: f32 = rho6;
    var vIm: f32 = 0.0;

    // Vortex 1: winding in plane (vortexPlane1Axis0, vortexPlane1Axis1)
    let a1a = params.vortexPlane1Axis0;
    let a1b = params.vortexPlane1Axis1;
    // Offset vortex 1 core along axis a1a by +sep/2
    let x1a = worldPos[a1a] - sep * 0.5;
    let x1b = worldPos[a1b];
    let r1 = sqrt(x1a * x1a + x1b * x1b);
    let theta1 = atan2(x1b, x1a);
    let core1 = r1 / sqrt(r1 * r1 + xi6 * xi6);
    let phase1 = charge6 * theta1;
    // Multiply: (vRe + i·vIm) × core1 × exp(i·phase1)
    let c1cos = core1 * cos(phase1);
    let c1sin = core1 * sin(phase1);
    let nextRe1 = vRe * c1cos - vIm * c1sin;
    let nextIm1 = vRe * c1sin + vIm * c1cos;
    vRe = nextRe1;
    vIm = nextIm1;

    // Vortex 2 (if vortexCount >= 2): winding in plane (vortexPlane2Axis0, vortexPlane2Axis1)
    if (nVortex >= 2u) {
      let a2a = params.vortexPlane2Axis0;
      let a2b = params.vortexPlane2Axis1;
      // Offset vortex 2 core along axis a2a by -sep/2
      let x2a = worldPos[a2a] + sep * 0.5;
      let x2b = worldPos[a2b];
      let r2v = sqrt(x2a * x2a + x2b * x2b);
      let theta2 = atan2(x2b, x2a);
      let core2 = r2v / sqrt(r2v * r2v + xi6 * xi6);
      let phase2v = charge6 * theta2;
      let c2cos = core2 * cos(phase2v);
      let c2sin = core2 * sin(phase2v);
      let nextRe2 = vRe * c2cos - vIm * c2sin;
      let nextIm2 = vRe * c2sin + vIm * c2cos;
      vRe = nextRe2;
      vIm = nextIm2;
    }

    reVal = vRe;
    imVal = vIm;
  } else if (params.initCondition == 7u) {
    // Analog Hawking (waterfall) — detrended for periodic C¹ continuity at wrap.
    //
    //   n(x₀) = n_bg · (1 − Δn · sech²(x₀/L_h))
    //   T     = tanh(L_box / (2·L_h))
    //   φ(x₀) = (m v_max / ℏ) · [ L_h · ln(cosh(x₀/L_h)) − T · x₀² / L_box ]
    //   ⇒ v_s(x₀) = v_max · tanh(x₀/L_h) − v_max · (2x₀/L_box) · T
    //
    // Without the parabolic counter-drift the FFT Strang split sees a jump
    // of 2·v_max·T across the periodic boundary, which the GP nonlinearity
    // amplifies into aliased noise within ~tens of steps. The counter-drift
    // forces v_s(±L_box/2) = 0 exactly so ψ is C¹ at the wrap and the
    // simulation stays well-posed for long runs. φ remains even in x so
    // ψ(+L_box/2) = ψ(−L_box/2).
    //
    // n_bg is inherited from the Thomas-Fermi chemical potential μ so the
    // background density matches the BEC equilibrium at x₀ → ∞ (sech² → 0).
    // packetAmplitude carries μ; interactionStrength carries g̃.
    let mu7 = params.packetAmplitude;
    let g7 = params.interactionStrength;
    let vmax = params.hawkingVmax;
    let lh = max(abs(params.hawkingLh), 1e-4);
    // Matches the uniform writer (canonical) and UI slider cap. Keep all
    // three agreeing — divergence here silently masks out-of-range uniform
    // values that were already clamped upstream.
    let deltaN = clamp(params.hawkingDeltaN, 0.0, 0.6);
    // Physical box length along flow axis 0: L_box = gridSize[0] · spacing[0].
    // Guard against degenerate (empty) grids — degenerate lattices should
    // never reach this kernel, but a 1e-4 floor matches the lh floor so a
    // stray 0 cannot produce NaNs in the detrend term.
    let lBox = max(f32(params.gridSize[0]) * params.spacing[0], 1e-4);
    let T7 = tanh(lBox / (2.0 * lh));
    var V7: f32 = 0.0;
    var x0: f32 = 0.0;
    for (var d7: u32 = 0u; d7 < params.latticeDim; d7++) {
      let pos7 = (f32(coords[d7]) - f32(params.gridSize[d7]) * 0.5 + 0.5) * params.spacing[d7];
      let omega7 = params.harmonicOmega * params.trapAnisotropy[d7];
      V7 += 0.5 * params.mass * omega7 * omega7 * pos7 * pos7;
      if (d7 == 0u) { x0 = pos7; }
    }
    // TF envelope (uses full trap including axis 0). For BEC-analog presets
    // the waterfall preset sets trapOmega ≈ 0 so V7 ≈ 0 and the envelope is
    // flat, giving the uniform background that the physics expects. Non-zero
    // trap is still well-defined and just adds a slow envelope.
    //
    // Guard non-positive g: the TF chemical-potential relation n = (μ − V)/g
    // only makes sense for a repulsive condensate (g > 0). If the preset is
    // misconfigured with g ≤ 0 the 1/g division would blow up, so fall back
    // to a zero TF envelope — the init still runs, the visualization stays
    // bounded, and the misconfiguration is apparent as a dark slab.
    var nTf: f32 = 0.0;
    if (g7 > 0.0) {
      nTf = max(0.0, (mu7 - V7) / g7);
    }
    let u7 = x0 / lh;
    // Periodize the sech density dip with the same parabolic detrend used
    // for the velocity so n'(±L_box/2) = 0 and ψ is C¹ across the FFT wrap.
    let uPeriod7 = u7 - (2.0 * x0 / lBox) * T7;
    let sech = 1.0 / cosh(uPeriod7);
    let n = max(nTf * (1.0 - deltaN * sech * sech), 0.0);
    // Numerically-stable ln(cosh(u)) = |u| − ln(2) + ln(1 + e^{−2|u|}).
    let au = abs(u7);
    let logCosh = au + log(1.0 + exp(-2.0 * au)) - 0.6931471806;
    // coef carries the (m · v_max / ℏ) prefactor; L_h·logCosh is the tanh
    // phase and T·x² / L_box is the counter-drift ensuring ∂_xφ(±L_box/2) = 0.
    let coef = (params.mass * vmax) / max(params.hbar, 1e-10);
    let phi = coef * (lh * logCosh - T7 * (x0 * x0) / lBox);
    let rho = sqrt(n);
    reVal = rho * cos(phi);
    imVal = rho * sin(phi);
  }

  psi[idx] = vec2f(reVal, imVal);
`

/** 1-D variant: linear dispatch + linearToND coord decomposition. Used when latticeDim !== 3. */
export const tdseInitBlock = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> psi: array<vec2f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }
  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);
${TDSE_INIT_BODY}
}
`

/**
 * 3-D variant: @workgroup_size(4, 4, 4) + direct gid.xyz coord read.
 * Saves ~3 shifts + 3 masks per thread (the linearToND decomposition).
 * Host dispatches ceil(gridSize[d]/4) per axis; the kernel early-returns
 * when gid.xyz lies outside the grid (handles non-multiple-of-4 dims).
 */
export const tdseInitBlock3D = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> psi: array<vec2f>;

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= params.gridSize[0] || gid.y >= params.gridSize[1] || gid.z >= params.gridSize[2]) {
    return;
  }
  // Fill the lower 3 coord slots from gid; remaining slots stay zero-initialized.
  // The shared body reads coords[d] for d < latticeDim, which is exactly 3 here.
  var coords: array<u32, 12>;
  coords[0] = gid.x;
  coords[1] = gid.y;
  coords[2] = gid.z;
  // Strides[2] = 1 for row-major 3-D; use direct mul/add instead of linearToND.
  let idx = gid.x * params.strides[0] + gid.y * params.strides[1] + gid.z;
${TDSE_INIT_BODY}
}
`
