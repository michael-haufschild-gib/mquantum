/**
 * Single Basis Function Evaluation
 *
 * Evaluates a single spatial eigenfunction Phi_k(x) for use with the
 * density matrix formulation. The time-dependence is encoded in the
 * CPU-evolved density matrix rho, so no time phase is applied here.
 *
 * Generated per quantum mode to avoid referencing undefined shader symbols.
 *
 * The function accepts pre-computed ND coordinates (from mapPosToND) to
 * avoid redundant basis transforms when evaluating multiple basis states
 * at the same grid point.
 *
 * For hydrogen modes, reads per-basis quantum numbers (n, l, m) from
 * the HydrogenBasisUniforms buffer so each basis state k evaluates
 * a distinct orbital.
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/singleBasis.wgsl
 */

/**
 * Generates WGSL block providing evaluateSingleBasis(xND, t, k, uniforms) -> vec2f.
 *
 * @param quantumMode - Current quantum mode, determines which basis evaluation to emit
 * @param dimension - Spatial dimension (3-11), used for hydrogen extra-dim unrolling
 * @returns WGSL source for the evaluateSingleBasis function
 */
export function generateSingleBasisBlock(
  quantumMode: 'harmonicOscillator' | 'hydrogenND' | 'hydrogenNDCoupled',
  dimension?: number
): string {
  if (quantumMode === 'hydrogenND' || quantumMode === 'hydrogenNDCoupled') {
    const dim = Math.min(Math.max(dimension ?? 3, 2), 11)

    // 2D hydrogen: circular harmonics, |m| as effective l, 2D radius
    if (dim === 2) {
      return /* wgsl */ `
// ============================================
// Single Basis Function Evaluation (Hydrogen 2D - Per-Basis)
// Uses circular harmonics and |m| as effective angular momentum
// ============================================

fn evaluateSingleBasis(xND: array<f32, 11>, t: f32, k: u32, uniforms: SchroedingerUniforms) -> vec2f {
  let kI = i32(k);
  let n_k = getHydrogenBasisQN(hydrogenBasis, kI, 0);
  let l_k = getHydrogenBasisQN(hydrogenBasis, kI, 1);
  let m_k = getHydrogenBasisQN(hydrogenBasis, kI, 2);

  if (n_k <= 0) { return vec2f(0.0, 0.0); }

  // 2D radius
  let r2D = sqrt(xND[0]*xND[0] + xND[1]*xND[1]);

  // In 2D, effective l = |m|
  let effectiveL = abs(m_k);

  // Radial threshold
  let nEff_k = f32(n_k) + f32(2 - 3) * 0.5;
  let threshold = 25.0 * nEff_k * uniforms.bohrRadius * (1.0 + 0.1 * f32(effectiveL));
  if (r2D > threshold) { return vec2f(0.0, 0.0); }

  // Radial part with D=2
  let R = hydrogenRadialND(n_k, effectiveL, r2D, uniforms.bohrRadius, 2);

  // Angular part: circular harmonic
  let phi = atan2(xND[1], xND[0]);
  let Y_complex = evalCircularHarmonic(m_k, phi, uniforms.useRealOrbitals != 0u);

  return vec2f(R * Y_complex.x, R * Y_complex.y);
}
`
    }

    const extraDimCount = dim - 3
    // Pre-fold the dim-dependent half-shift so the WGSL constant is a single
    // literal instead of a runtime f32(dim-3)*0.5 multiply per call. dim is
    // captured at composition time.
    const dimHalfShift = ((dim - 3) * 0.5).toFixed(1)

    // Generate extra-dimension HO product using per-basis quantum numbers
    let extraDimCode = ''
    if (extraDimCount > 0) {
      const lines: string[] = []
      lines.push('  // Extra dimension HO product (per-basis quantum numbers)')
      lines.push('  var extraProduct: f32 = 1.0;')
      for (let i = 0; i < extraDimCount; i++) {
        const coordIdx = i + 3
        const dimQNIdx = i + 3 // dimIdx offset: 0=n, 1=l, 2=m, 3+=extraDimN
        lines.push(`  {`)
        lines.push(`    let extraN_${i} = getHydrogenBasisQN(hydrogenBasis, i32(k), ${dimQNIdx});`)
        lines.push(`    let omega_${i} = getExtraDimOmega(uniforms, ${i});`)
        lines.push(`    let coord_${i} = xND[${coordIdx}];`)
        lines.push(`    let ef_${i} = ho1D(extraN_${i}, coord_${i}, omega_${i});`)
        lines.push(`    extraProduct *= ef_${i};`)
        lines.push(`    if (abs(extraProduct) < 1e-10) { return vec2f(0.0, 0.0); }`)
        lines.push(`  }`)
      }
      extraDimCode = lines.join('\n')
    } else {
      extraDimCode = '  let extraProduct: f32 = 1.0;'
    }

    return /* wgsl */ `
// ============================================
// Single Basis Function Evaluation (Hydrogen ND - Per-Basis)
// Dimension: ${dim}, Extra dims: ${extraDimCount}
// ============================================

fn evaluateSingleBasis(xND: array<f32, 11>, t: f32, k: u32, uniforms: SchroedingerUniforms) -> vec2f {
  // Read per-basis quantum numbers from HydrogenBasisUniforms
  let kI = i32(k);
  let n_k = getHydrogenBasisQN(hydrogenBasis, kI, 0);
  let l_k = getHydrogenBasisQN(hydrogenBasis, kI, 1);
  let m_k = getHydrogenBasisQN(hydrogenBasis, kI, 2);

  // Guard: skip invalid/unused basis states
  if (n_k <= 0) { return vec2f(0.0, 0.0); }

  // 3D radius + inverse via a single inverseSqrt, with r3D = sum * invR.
  // One transcendental instead of sqrt + divide.
  let sum3D = xND[0]*xND[0] + xND[1]*xND[1] + xND[2]*xND[2];
  let invR = inverseSqrt(max(sum3D, 1e-20));
  let r3D = sum3D * invR;

  // Radial threshold with D-dimensional n_eff (per-basis, computed inline).
  // Half-shift (D-3)/2 folded at composition time.
  let nEff_k = f32(n_k) + ${dimHalfShift};
  let threshold = 25.0 * nEff_k * uniforms.bohrRadius * (1.0 + 0.1 * f32(l_k));
  if (r3D > threshold) { return vec2f(0.0, 0.0); }

  // Cartesian unit direction for angular evaluation
  let nx = xND[0] * invR;
  let ny = xND[1] * invR;
  let nz = xND[2] * invR;

  // Radial part: R_nl^(D)(r) with D-dimensional effective potential
  let R = hydrogenRadialND(n_k, l_k, r3D, uniforms.bohrRadius, ${dim});

  // Angular part: Y_lm as vec2f(re, im) — parameterized by per-basis (l, m)
  // evalHydrogenNDAngularCartesian now returns full complex Y_lm for both real
  // and complex orbital modes, preserving azimuthal phase for cross-term interference.
  let Y_complex = evalHydrogenNDAngularCartesian(l_k, m_k, nx, ny, nz, uniforms.useRealOrbitals != 0u);

${extraDimCode}

  // No per-basis boost here: density matrix mode applies a uniform
  // hydrogenNDBoost to the total density after Tr(ρ|x⟩⟨x|) summation,
  // preserving correct relative scaling between cross-terms and diagonals.
  let scale = R * extraProduct;

  return vec2f(scale * Y_complex.x, scale * Y_complex.y);
}
`
  }

  // Harmonic oscillator (default)
  return /* wgsl */ `
// ============================================
// Single Basis Function Evaluation (Harmonic Oscillator)
// ============================================

fn evaluateSingleBasis(xND: array<f32, 11>, t: f32, k: u32, uniforms: SchroedingerUniforms) -> vec2f {
  let phi = hoNDOptimized(xND, i32(k), uniforms);
  return vec2f(phi, 0.0);
}
`
}
