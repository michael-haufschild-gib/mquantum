/**
 * Single Basis Function Evaluation
 *
 * Evaluates a single spatial eigenfunction Phi_k(x) for use with the
 * density matrix formulation. The time-dependence is encoded in the
 * CPU-evolved density matrix rho, so no time phase is applied here.
 *
 * Generated per quantum mode to avoid referencing undefined shader symbols.
 *
 * For hydrogen modes, reads per-basis quantum numbers (n, l, m) from
 * the HydrogenBasisUniforms buffer so each basis state k evaluates
 * a distinct orbital.
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/singleBasis.wgsl
 */

/**
 * Generates WGSL block providing evaluateSingleBasis(pos, t, k, uniforms) -> vec2f.
 *
 * @param quantumMode - Current quantum mode, determines which basis evaluation to emit
 * @param dimension - Spatial dimension (3-11), used for hydrogen extra-dim unrolling
 * @returns WGSL source for the evaluateSingleBasis function
 */
export function generateSingleBasisBlock(
  quantumMode: 'harmonicOscillator' | 'hydrogenND',
  dimension?: number,
): string {
  if (quantumMode === 'hydrogenND') {
    const dim = Math.min(Math.max(dimension ?? 3, 3), 11)
    const extraDimCount = dim - 3

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

fn evaluateSingleBasis(pos: vec3f, t: f32, k: u32, uniforms: SchroedingerUniforms) -> vec2f {
  // Read per-basis quantum numbers from HydrogenBasisUniforms
  let n_k = getHydrogenBasisQN(hydrogenBasis, i32(k), 0);
  let l_k = getHydrogenBasisQN(hydrogenBasis, i32(k), 1);
  let m_k = getHydrogenBasisQN(hydrogenBasis, i32(k), 2);

  // Guard: skip invalid/unused basis states
  if (n_k <= 0) { return vec2f(0.0, 0.0); }

  let xND = mapPosToND(pos, uniforms);

  // 3D radius
  let r3D = sqrt(xND[0]*xND[0] + xND[1]*xND[1] + xND[2]*xND[2]);

  // Radial threshold (per-basis, computed inline)
  let threshold = 25.0 * f32(n_k) * uniforms.bohrRadius * (1.0 + 0.1 * f32(l_k));
  if (r3D > threshold) { return vec2f(0.0, 0.0); }

  // Cartesian unit direction for angular evaluation
  let invR = 1.0 / max(r3D, 1e-10);
  let nx = xND[0] * invR;
  let ny = xND[1] * invR;
  let nz = xND[2] * invR;

  // Radial part: R_nl(r) — parameterized by per-basis (n, l)
  let R = hydrogenRadial(n_k, l_k, r3D, uniforms.bohrRadius);

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

fn evaluateSingleBasis(pos: vec3f, t: f32, k: u32, uniforms: SchroedingerUniforms) -> vec2f {
  let xND = mapPosToND(pos, uniforms);
  let phi = hoNDOptimized(xND, i32(k), uniforms);
  return vec2f(phi, 0.0);
}
`
}
