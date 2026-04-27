/**
 * TDSE Potential Compute Shader
 *
 * Fills the potential buffer V(x) from the selected potential type.
 * For time-dependent (driven) potentials, uses simTime uniform.
 *
 * Potential types:
 *   0 = free (V=0)
 *   1 = barrier (slab barrier along axis 0)
 *   2 = step (Heaviside step along axis 0)
 *   3 = finiteWell (symmetric square well along axis 0)
 *   4 = harmonicTrap (isotropic harmonic oscillator — radial)
 *   5 = driven (time-dependent slab barrier along axis 0)
 *   6 = doubleSlit (barrier wall along axis 0 with slit openings along axis 1)
 *   7 = periodicLattice (cosine lattice V₀cos²(πx/a) along axis 0)
 *   8 = doubleWell (radial quartic V(r) = λ(r² − a²)² − εr — bubble nucleation)
 *   9 = becTrap (anisotropic harmonic trap for BEC — radial)
 *  10 = radialDoubleWell (V(r) = λ(r−r₁)²(r−r₂)² − ε·r — bubble nucleation)
 *  13 = coupledAnharmonic (V = ½Σω²x² + λΣ_{i<j} x_i²x_j² — chaotic for most λ)
 *  14 = blackHoleRingdown (Regge–Wheeler V_ℓ^s(r*) on Schwarzschild background)
 *
 * Requires tdseUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * Two variants: tdsePotentialBlock (1-D, workgroup_size(64), linearToND)
 * and tdsePotentialBlock3D (3-D, workgroup_size(4,4,4), gid.xyz). See
 * pickSiteDispatch in computePassUtils for the selection rule.
 *
 * @workgroup_size(64) (1-D variant) | @workgroup_size(4, 4, 4) (3-D variant)
 * @module
 */

/** Shared kernel body. Expects 'idx' and 'coords' to be defined by the prologue. */
const TDSE_POTENTIAL_BODY = /* wgsl */ `
  // Axis-0 position (used by directional potentials)
  let pos0 = (f32(coords[0]) - f32(params.gridSize[0]) * 0.5 + 0.5) * params.spacing[0];

  var V: f32 = 0.0;

  if (params.potentialType == 0u) {
    // Free: V = 0
    V = 0.0;
  } else if (params.potentialType == 1u) {
    // Barrier: slab barrier centered at barrierCenter along axis 0
    let dist = abs(pos0 - params.barrierCenter);
    if (dist < params.barrierWidth * 0.5) {
      V = params.barrierHeight;
    }
  } else if (params.potentialType == 2u) {
    // Step: Heaviside step at barrierCenter along axis 0
    if (pos0 > params.barrierCenter) {
      V = params.stepHeight;
    }
  } else if (params.potentialType == 3u) {
    // Finite well: symmetric square well centered at origin along axis 0
    let dist = abs(pos0);
    if (dist < params.wellWidth * 0.5) {
      V = -params.wellDepth;
    }
  } else if (params.potentialType == 4u) {
    // Harmonic trap: V = 0.5 * m * omega^2 * |x|^2 (radial)
    var r2h: f32 = 0.0;
    for (var dh: u32 = 0u; dh < params.latticeDim; dh++) {
      let posh = (f32(coords[dh]) - f32(params.gridSize[dh]) * 0.5 + 0.5) * params.spacing[dh];
      r2h += posh * posh;
    }
    let omega2 = params.harmonicOmega * params.harmonicOmega;
    V = 0.5 * params.mass * omega2 * r2h;
  } else if (params.potentialType == 5u) {
    // Driven: slab barrier with time-dependent height modulation along axis 0
    let dist = abs(pos0 - params.barrierCenter);
    if (dist < params.barrierWidth * 0.5) {
      var drive: f32 = 0.0;
      if (params.driveEnabled == 1u) {
        let t = params.simTime;
        let w = params.driveFrequency;
        let A = params.driveAmplitude;
        const TAU_DRIVE: f32 = 6.28318530717958647692;
        if (params.driveWaveform == 0u) {
          drive = A * sin(TAU_DRIVE * w * t);
        } else if (params.driveWaveform == 1u) {
          // 0.5 / tau² = 0.5 · (w + 0.001)² — skip the reciprocal cancellation.
          let wShift = w + 0.001;
          let invTwoTau2 = 0.5 * wShift * wShift;
          drive = A * exp(-t * t * invTwoTau2);
        } else {
          let phase = TAU_DRIVE * w * t * (1.0 + 0.5 * w * t);
          drive = A * sin(phase);
        }
      }
      V = params.barrierHeight + drive;
    }
  } else if (params.potentialType == 6u) {
    // Double slit: wall perpendicular to axis 0, slits along axis 1
    let wallDist = abs(pos0 - params.barrierCenter);
    if (wallDist < params.wallThickness * 0.5) {
      V = params.wallHeight;
      if (params.latticeDim >= 2u) {
        let pos1 = (f32(coords[1]) - f32(params.gridSize[1]) * 0.5 + 0.5) * params.spacing[1];
        let halfSep = params.slitSeparation * 0.5;
        let halfWidth = params.slitWidth * 0.5;
        if (abs(pos1 - halfSep) < halfWidth) {
          V = 0.0;
        }
        if (abs(pos1 + halfSep) < halfWidth) {
          V = 0.0;
        }
      }
    }
  } else if (params.potentialType == 7u) {
    // Periodic lattice: directional — V = V0 * cos²(π · x / a) along axis 0
    const PI_LATTICE: f32 = 3.14159265358979323846;
    let phase = PI_LATTICE * pos0 / max(params.latticePeriod, 1e-6);
    let c = cos(phase);
    V = params.latticeDepth * c * c;
  } else if (params.potentialType == 8u) {
    // Double well: directional V(x) = λ(x² − a²)² − ε·x along axis 0
    let a = params.doubleWellSeparation;
    let lam = params.doubleWellLambda;
    let eps = params.doubleWellAsymmetry;
    let x2_minus_a2 = pos0 * pos0 - a * a;
    V = lam * x2_minus_a2 * x2_minus_a2 - eps * pos0;
  } else if (params.potentialType == 9u) {
    // Anisotropic BEC trap: V = 0.5 * m * Σ(ω_d² * x_d²)
    let omega0 = params.harmonicOmega;
    var r2a: f32 = 0.0;
    for (var da: u32 = 0u; da < params.latticeDim; da++) {
      let posa = (f32(coords[da]) - f32(params.gridSize[da]) * 0.5 + 0.5) * params.spacing[da];
      let omega_d = omega0 * params.trapAnisotropy[da];
      r2a += omega_d * omega_d * posa * posa;
    }
    V = 0.5 * params.mass * r2a;
  } else if (params.potentialType == 10u) {
    // Radial double well: V(r) = λ(r − r₁)²(r − r₂)² − ε·r
    var r2rdw: f32 = 0.0;
    for (var drdw: u32 = 0u; drdw < params.latticeDim; drdw++) {
      let posrdw = (f32(coords[drdw]) - f32(params.gridSize[drdw]) * 0.5 + 0.5) * params.spacing[drdw];
      r2rdw += posrdw * posrdw;
    }
    let rrdw = sqrt(r2rdw);
    let r1 = params.radialWellInner;
    let r2 = params.radialWellOuter;
    let lam = params.radialWellDepth;
    let eps = params.radialWellTilt;
    let dr1 = rrdw - r1;
    let dr2 = rrdw - r2;
    V = lam * dr1 * dr1 * dr2 * dr2 - eps * rrdw;
  } else if (params.potentialType == 13u) {
    // Coupled anharmonic: V = ½Σω²x_d² + λΣ_{i<j} x_i²x_j²
    // Identity:  Σ_{i<j} x_i²x_j² = ½·((Σx_i²)² − Σx_i⁴),
    // so the cross term needs no inner pair loop and no scratch array —
    // a single O(D) sweep collects Σx² and Σx⁴ together. Drops the
    // D(D−1)/2 pair iterations (55 at D=11) and the array<f32,12> temp.
    let omega2ca = params.harmonicOmega * params.harmonicOmega;
    var posSqSum: f32 = 0.0;
    var posQuadSum: f32 = 0.0;
    for (var dca: u32 = 0u; dca < params.latticeDim; dca++) {
      let p = (f32(coords[dca]) - f32(params.gridSize[dca]) * 0.5 + 0.5) * params.spacing[dca];
      let pSq = p * p;
      posSqSum += pSq;
      posQuadSum += pSq * pSq;
    }
    let harmonic = 0.5 * params.mass * omega2ca * posSqSum;
    let coupling = 0.5 * (posSqSum * posSqSum - posQuadSum);
    V = harmonic + params.anharmonicLambda * coupling;
  } else if (params.potentialType == 14u) {
    // Black-hole Regge–Wheeler ringdown barrier V_ℓ^s(r*) on a Schwarzschild
    // background. The TDSE axis-0 position is interpreted as the tortoise
    // coordinate r*; we invert r*(r) via Newton iteration in u = r − 2M
    // coordinates so the (r → 2M) limit is numerically stable in f32.
    //
    // g(u)  = u + 2M·ln(u/2M) − (r* − 2M)
    // g'(u) = 1 + 2M/u
    // V(r) = (u/r) · [ℓ(ℓ+1)/r² + (1 − s²)·(2M/r³)]
    //   where (u/r) replaces the subtractive (1 − 2M/r) form that would
    //   cancel to 0 in f32 for u ≪ 2M.
    let M = max(params.bhMass, 1e-4);
    let ell = params.bhMultipoleL;
    let s = params.bhSpin;
    let twoM = 2.0 * M;
    // f32 can only resolve u = r − 2M down to ~2e−6·M before log(u/2M)
    // saturates; clamp to that floor. Below that u, V is ≲ 1e−6 regardless.
    let uFloor = twoM * 1.0e-6;
    let rStar = pos0;
    let rStarMinusTwoM = rStar - twoM;

    // Asymptotic initial guess: far-field u ≈ r* − 2M; near-horizon u ≈ 2M·exp((r* − 2M)/2M).
    var u: f32 = rStarMinusTwoM;
    if (rStar <= twoM) {
      u = twoM * exp(rStarMinusTwoM / twoM);
    }
    if (u < uFloor) { u = uFloor; }

    for (var it: u32 = 0u; it < 5u; it++) {
      let g = u + twoM * log(u / twoM) - rStarMinusTwoM;
      let gp = 1.0 + twoM / u;
      u = u - g / gp;
      if (u < uFloor) { u = uFloor; }
    }

    let r = twoM + u;
    // (1 − 2M/r) = u/r, numerically stable at the horizon.
    let oneMinusRs = u / r;
    let centrifugal = ell * (ell + 1.0) / (r * r);
    let spinTerm = (1.0 - s * s) * twoM / (r * r * r);
    V = oneMinusRs * (centrifugal + spinTerm);
  }

  potential[idx] = V;
`

/** 1-D variant: linear dispatch + linearToND coord decomposition. Used when latticeDim !== 3. */
export const tdsePotentialBlock = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> potential: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }
  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);
${TDSE_POTENTIAL_BODY}
}
`

/** 3-D variant: workgroup_size(4,4,4) + direct gid.xyz coord read. Used when latticeDim === 3. */
export const tdsePotentialBlock3D = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> potential: array<f32>;

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
${TDSE_POTENTIAL_BODY}
}
`
