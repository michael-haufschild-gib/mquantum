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
 *
 * Requires tdseUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const tdsePotentialBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> potential: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);

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
        if (params.driveWaveform == 0u) {
          drive = A * sin(2.0 * 3.14159265 * w * t);
        } else if (params.driveWaveform == 1u) {
          let tau = 1.0 / (w + 0.001);
          drive = A * exp(-t * t / (2.0 * tau * tau));
        } else {
          let phase = 2.0 * 3.14159265 * w * t * (1.0 + 0.5 * w * t);
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
    // Periodic lattice: directional — V = V0 * cos^2(pi * x / a) along axis 0
    let phase = 3.14159265 * pos0 / params.latticePeriod;
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
  }

  potential[idx] = V;
}
`
