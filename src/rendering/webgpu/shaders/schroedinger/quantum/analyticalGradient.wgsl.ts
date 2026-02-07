/**
 * WGSL Analytical Gradient from Cached 1D Eigenfunctions
 *
 * Replaces tetrahedral finite-difference gradient (4× full psi evaluation)
 * with exact analytical gradient from the product rule:
 *
 *   ∂ψ/∂xND[j] = Σ_k c_k · e^{-iE_k·t} · φ'_{n_kj}(xND[j]) · ∏_{i≠j} φ_{n_ki}(xND[i])
 *
 * The gradient in ND space is projected back to 3D world space:
 *   ∇_pos(s) = fieldScale · Σ_j (∂s/∂xND[j]) · vec3f(bX[j], bY[j], bZ[j])
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/analyticalGradient.wgsl
 */

/**
 * Generate the analytical gradient block for a specific dimension.
 * Unrolled loops for compile-time dimension specialization.
 *
 * @param dimension - The dimension (3-11)
 * @param termCount - Number of superposition terms (1-8), or undefined for runtime loop
 * @returns WGSL code for analytical gradient computation
 */
export function generateAnalyticalGradientBlock(dimension: number, termCount?: number): string {
  const dim = Math.min(Math.max(dimension, 3), 11)
  const useUnrolledTerms = termCount !== undefined && termCount >= 1 && termCount <= 8
  const tc = useUnrolledTerms ? Math.min(Math.max(termCount!, 1), 8) : 0

  // Generate unrolled phi loading for all dims
  function genLoadPhis(kExpr: string): string {
    return Array.from({ length: dim }, (_, j) =>
      `    let lk_${j} = lookupEigenfunction(getEigenFuncIdx(${kExpr}, ${j}), xND[${j}]);`
    ).join('\n')
  }

  // Generate the full spatial product expression
  function genSpatialProduct(): string {
    return Array.from({ length: dim }, (_, j) => `lk_${j}.x`).join(' * ')
  }

  // Generate partial product for gradient component j (φ_j replaced by φ'_j)
  function genPartialProduct(gradJ: number): string {
    return Array.from({ length: dim }, (_, i) =>
      i === gradJ ? `lk_${i}.y` : `lk_${i}.x`
    ).join(' * ')
  }

  // For the unrolled path, generate one complete term block
  function genTerm(k: number, isFirst: boolean): string {
    const lines: string[] = []
    lines.push(`  { // Term ${k}`)
    lines.push(genLoadPhis(String(k)))
    lines.push(`    let spatial_k = ${genSpatialProduct()};`)
    lines.push(`    let coeff_k = getCoeff(uniforms, ${k});`)
    lines.push(`    let phase_k = -getEnergy(uniforms, ${k}) * t;`)
    lines.push(`    let tf_k = cexp_i(phase_k);`)
    lines.push(`    let ct_k = cmul(coeff_k, tf_k);`)

    if (isFirst) {
      lines.push(`    psiRe = ct_k.x * spatial_k;`)
      lines.push(`    psiIm = ct_k.y * spatial_k;`)
    } else {
      lines.push(`    psiRe += ct_k.x * spatial_k;`)
      lines.push(`    psiIm += ct_k.y * spatial_k;`)
    }

    // Gradient components for each ND dimension
    for (let j = 0; j < dim; j++) {
      const pp = genPartialProduct(j)
      if (isFirst) {
        lines.push(`    dPsiRe[${j}] = ct_k.x * ${pp};`)
        lines.push(`    dPsiIm[${j}] = ct_k.y * ${pp};`)
      } else {
        lines.push(`    dPsiRe[${j}] += ct_k.x * ${pp};`)
        lines.push(`    dPsiIm[${j}] += ct_k.y * ${pp};`)
      }
    }

    lines.push(`  }`)
    return lines.join('\n')
  }

  // Build the terms computation
  let termsBlock: string
  if (useUnrolledTerms) {
    const initBlock = `  var psiRe = 0.0;
  var psiIm = 0.0;
  var dPsiRe: array<f32, ${dim}>;
  var dPsiIm: array<f32, ${dim}>;`

    const termBlocks = Array.from({ length: tc }, (_, k) => genTerm(k, k === 0)).join('\n')
    termsBlock = initBlock + '\n' + termBlocks
  } else {
    // Runtime loop version
    termsBlock = `  var psiRe = 0.0;
  var psiIm = 0.0;
  var dPsiRe: array<f32, ${dim}>;
  var dPsiIm: array<f32, ${dim}>;
  for (var k = 0; k < uniforms.termCount; k++) {
${genLoadPhis('k')}
    let spatial_k = ${genSpatialProduct()};
    let coeff_k = getCoeff(uniforms, k);
    let phase_k = -getEnergy(uniforms, k) * t;
    let tf_k = cexp_i(phase_k);
    let ct_k = cmul(coeff_k, tf_k);
    psiRe += ct_k.x * spatial_k;
    psiIm += ct_k.y * spatial_k;
${Array.from({ length: dim }, (_, j) => {
  const pp = genPartialProduct(j).replace(/\bk\b/g, 'k')
  return `    dPsiRe[${j}] += ct_k.x * ${pp};\n    dPsiIm[${j}] += ct_k.y * ${pp};`
}).join('\n')}
  }`
  }

  // Generate the basis vector back-projection (ND gradient → world-space gradient)
  const basisProjection = `
  // Project ND gradient to 3D world space via basis vectors:
  // ∇_pos(s) = fieldScale · Σ_j dsND[j] · vec3f(basisX[j], basisY[j], basisZ[j])
  var gradWorld = vec3f(0.0);
  ${Array.from({ length: dim }, (_, j) => {
    return `{
    let dsND_${j} = dRhoND_${j} * invRhoEps;
    let bx = getBasisComponent(basis.basisX, ${j});
    let by = getBasisComponent(basis.basisY, ${j});
    let bz = getBasisComponent(basis.basisZ, ${j});
    gradWorld += dsND_${j} * vec3f(bx, by, bz);
  }`
  }).join('\n  ')}
  let gradS = gradWorld * uniforms.fieldScale;`

  return /* wgsl */ `
// ============================================
// Analytical Gradient from Eigenfunction Cache
// Dimension: ${dim}, Terms: ${useUnrolledTerms ? tc : 'dynamic'}
// ============================================

// Compute ψ, ∇ψ, ρ, and ∇(log ρ) analytically from cached 1D eigenfunctions.
// Returns TetraSample (same interface as sampleWithTetrahedralGradient).
fn sampleDensityWithAnalyticalGradient(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> TetraSample {
  // Map 3D world position to ND coordinates
  let xND = mapPosToND(pos, uniforms);

${termsBlock}

  // ρ = |ψ|²
  let rho = psiRe * psiRe + psiIm * psiIm;
  let s = log(rho + 1e-8);

  // Spatial phase for coloring
  let spatialPhase = atan2(psiIm, psiRe);

  // ∂ρ/∂xND[j] = 2 · Re(ψ* · ∂ψ/∂xND[j]) = 2 · (ψ_re · ∂ψ_re/∂xND[j] + ψ_im · ∂ψ_im/∂xND[j])
  let invRhoEps = 1.0 / (rho + 1e-8);
${Array.from({ length: dim }, (_, j) => `  let dRhoND_${j} = 2.0 * (psiRe * dPsiRe[${j}] + psiIm * dPsiIm[${j}]);`).join('\n')}

${basisProjection}

  return TetraSample(rho, s, spatialPhase, gradS);
}

// Gradient-only (when density is already known)
fn computeAnalyticalGradient(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> vec3f {
  return sampleDensityWithAnalyticalGradient(pos, t, uniforms).gradient;
}
`
}
