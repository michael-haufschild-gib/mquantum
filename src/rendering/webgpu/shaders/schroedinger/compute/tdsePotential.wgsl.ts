/**
 * TDSE Potential Compute Shader
 *
 * Fills the potential buffer V(x) from the selected potential type.
 * For time-dependent (driven) potentials, uses simTime uniform.
 *
 * Potential types:
 *   0 = free (V=0)
 *   1 = barrier (rectangular along first axis)
 *   2 = step (Heaviside along first axis)
 *   3 = finiteWell (symmetric square well along first axis)
 *   4 = harmonicTrap (isotropic harmonic oscillator)
 *   5 = driven (time-dependent barrier with oscillating height)
 *   6 = doubleSlit (barrier wall with two slit openings along axis 1)
 *   7 = periodicLattice (cosine lattice V₀cos²(πx/a) along axis 0)
 *   8 = doubleWell (quartic V(x) = λ(x² − a²)² − εx along axis 0)
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

  let coords = linearToND(idx, params.gridSize, params.latticeDim);

  // Compute physical position along first axis (used for 1-D potentials)
  let pos0 = (f32(coords[0]) - f32(params.gridSize[0]) * 0.5 + 0.5) * params.spacing[0];

  var V: f32 = 0.0;

  if (params.potentialType == 0u) {
    // Free: V = 0
    V = 0.0;
  } else if (params.potentialType == 1u) {
    // Barrier: rectangular barrier centered at barrierCenter along axis 0
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
    // Harmonic trap: V = 0.5 * m * omega^2 * |x|^2
    var r2: f32 = 0.0;
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      let pos = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
      r2 += pos * pos;
    }
    V = 0.5 * params.mass * params.harmonicOmega * params.harmonicOmega * r2;
  } else if (params.potentialType == 5u) {
    // Driven: barrier with time-dependent modulation
    let dist = abs(pos0 - params.barrierCenter);
    var baseV: f32 = 0.0;
    if (dist < params.barrierWidth * 0.5) {
      baseV = params.barrierHeight;
    }

    var drive: f32 = 0.0;
    if (params.driveEnabled == 1u) {
      let t = params.simTime;
      let w = params.driveFrequency;
      let A = params.driveAmplitude;
      if (params.driveWaveform == 0u) {
        // Sine
        drive = A * sin(2.0 * 3.14159265 * w * t);
      } else if (params.driveWaveform == 1u) {
        // Gaussian pulse
        let tau = 1.0 / (w + 0.001);
        drive = A * exp(-t * t / (2.0 * tau * tau));
      } else {
        // Chirp: linearly increasing frequency
        let phase = 2.0 * 3.14159265 * w * t * (1.0 + 0.5 * w * t);
        drive = A * sin(phase);
      }
    }

    V = baseV + drive;
  } else if (params.potentialType == 6u) {
    // Double slit: barrier wall perpendicular to axis 0 with two slit openings along axis 1
    let wallDist = abs(pos0 - params.barrierCenter);
    if (wallDist < params.wallThickness * 0.5) {
      // Start with wall everywhere
      V = params.wallHeight;
      // If latticeDim >= 2, carve out slit openings along axis 1
      if (params.latticeDim >= 2u) {
        let pos1 = (f32(coords[1]) - f32(params.gridSize[1]) * 0.5 + 0.5) * params.spacing[1];
        let halfSep = params.slitSeparation * 0.5;
        let halfWidth = params.slitWidth * 0.5;
        // Upper slit: centered at +halfSep
        if (abs(pos1 - halfSep) < halfWidth) {
          V = 0.0;
        }
        // Lower slit: centered at -halfSep
        if (abs(pos1 + halfSep) < halfWidth) {
          V = 0.0;
        }
      }
    }
  } else if (params.potentialType == 7u) {
    // Periodic lattice: V = V0 * cos^2(pi * x / a) along axis 0
    let phase = 3.14159265 * pos0 / params.latticePeriod;
    let c = cos(phase);
    V = params.latticeDepth * c * c;
  } else if (params.potentialType == 8u) {
    // Double well: V(x) = λ(x² − a²)² − εx
    let a = params.doubleWellSeparation;
    let lam = params.doubleWellLambda;
    let eps = params.doubleWellAsymmetry;
    let x2_minus_a2 = pos0 * pos0 - a * a;
    V = lam * x2_minus_a2 * x2_minus_a2 - eps * pos0;
  }

  potential[idx] = V;
}
`
