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
    return Array.from(
      { length: dim },
      (_, j) => `    let lk_${j} = lookupEigenfunction(getEigenFuncIdx(${kExpr}, ${j}), xND[${j}]);`
    ).join('\n')
  }

  // Prefix / suffix products over the .x components, matching the WGSL
  // locals emitted below:
  //   prefix_j = lk_0.x * lk_1.x * ... * lk_{j-1}.x     (excludes index j)
  //   suffix_j = lk_j.x * lk_{j+1}.x * ... * lk_{dim-1}.x (INCLUDES index j)
  //   spatial_k (product of all .x) = prefix_dim        (equivalently suffix_0)
  //                                  = prefix_j * lk_j.x * suffix_{j+1}.
  // For the gradient component at axis j we substitute lk_j.y (the derivative
  // factor) into slot j and skip it in the suffix, so the partial product
  // collapses to 2 muls:
  //   partial(j) = prefix_j * lk_j.y * suffix_{j+1}
  // For dim=11 / termCount=8 the saving is ~544 muls per pixel.
  function genPrefixSuffix(): string {
    const lines: string[] = []
    lines.push(`    let prefix_0: f32 = 1.0;`)
    for (let j = 1; j <= dim; j++) {
      lines.push(`    let prefix_${j}: f32 = prefix_${j - 1} * lk_${j - 1}.x;`)
    }
    lines.push(`    let suffix_${dim}: f32 = 1.0;`)
    for (let j = dim - 1; j >= 0; j--) {
      lines.push(`    let suffix_${j}: f32 = suffix_${j + 1} * lk_${j}.x;`)
    }
    return lines.join('\n')
  }

  // Full spatial product, reusing the suffix[0] we already built.
  function spatialProductExpr(): string {
    return `suffix_0`
  }

  // Partial product for gradient component j -- two muls against pre-built chains.
  function partialProductExpr(gradJ: number): string {
    return `prefix_${gradJ} * lk_${gradJ}.y * suffix_${gradJ + 1}`
  }

  // For the unrolled path, generate one complete term block
  function genTerm(k: number, isFirst: boolean): string {
    const lines: string[] = []
    lines.push(`  { // Term ${k}`)
    lines.push(genLoadPhis(String(k)))
    lines.push(genPrefixSuffix())
    lines.push(`    let spatial_k = ${spatialProductExpr()};`)
    lines.push(`    let coeff_k = getCoeff(uniforms, ${k});`)
    lines.push(`    let phase_k = -getEnergy(uniforms, ${k}) * t;`)
    lines.push(`    let tf_k = cexp_i(phase_k);`)
    lines.push(`    let ct_k = cmul(coeff_k, tf_k);`)

    if (isFirst) {
      lines.push(`    psiRe = ct_k.x * spatial_k;`)
      lines.push(`    psiIm = ct_k.y * spatial_k;`)
      // Spatial-only accumulation (no time factor) for correct phase coloring
      lines.push(`    spatRe = coeff_k.x * spatial_k;`)
      lines.push(`    spatIm = coeff_k.y * spatial_k;`)
    } else {
      lines.push(`    psiRe += ct_k.x * spatial_k;`)
      lines.push(`    psiIm += ct_k.y * spatial_k;`)
      lines.push(`    spatRe += coeff_k.x * spatial_k;`)
      lines.push(`    spatIm += coeff_k.y * spatial_k;`)
    }

    // Gradient components for each ND dimension. Each partial product is
    // materialized into a single local so the real and imaginary accumulations
    // share it — don't rely on backend CSE to dedupe the expression.
    for (let j = 0; j < dim; j++) {
      const pp = partialProductExpr(j)
      lines.push(`    let partial_${j} = ${pp};`)
      if (isFirst) {
        lines.push(`    dPsiRe[${j}] = ct_k.x * partial_${j};`)
        lines.push(`    dPsiIm[${j}] = ct_k.y * partial_${j};`)
      } else {
        lines.push(`    dPsiRe[${j}] += ct_k.x * partial_${j};`)
        lines.push(`    dPsiIm[${j}] += ct_k.y * partial_${j};`)
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
  var spatRe = 0.0;
  var spatIm = 0.0;
  var dPsiRe: array<f32, ${dim}>;
  var dPsiIm: array<f32, ${dim}>;`

    const termBlocks = Array.from({ length: tc }, (_, k) => genTerm(k, k === 0)).join('\n')
    termsBlock = initBlock + '\n' + termBlocks
  } else {
    // Runtime loop version
    termsBlock = `  var psiRe = 0.0;
  var psiIm = 0.0;
  var spatRe = 0.0;
  var spatIm = 0.0;
  var dPsiRe: array<f32, ${dim}>;
  var dPsiIm: array<f32, ${dim}>;
  for (var k = 0; k < uniforms.termCount; k++) {
${genLoadPhis('k')}
${genPrefixSuffix()}
    let spatial_k = ${spatialProductExpr()};
    let coeff_k = getCoeff(uniforms, k);
    let phase_k = -getEnergy(uniforms, k) * t;
    let tf_k = cexp_i(phase_k);
    let ct_k = cmul(coeff_k, tf_k);
    psiRe += ct_k.x * spatial_k;
    psiIm += ct_k.y * spatial_k;
    spatRe += coeff_k.x * spatial_k;
    spatIm += coeff_k.y * spatial_k;
${Array.from({ length: dim }, (_, j) => {
  const pp = partialProductExpr(j)
  return `    let partial_${j} = ${pp};\n    dPsiRe[${j}] += ct_k.x * partial_${j};\n    dPsiIm[${j}] += ct_k.y * partial_${j};`
}).join('\n')}
  }`
  }

  // Generate the basis vector back-projection (ND gradient → world-space gradient).
  // PERF: fold 2.0 (from dRhoND = 2·Re(ψ*·∂ψ)) and 1/rho into one reciprocal
  // so each dim does 1 mul instead of 2 (saves D muls per call; 11 at dim=11).
  const basisProjection = `
  // Project ND gradient to 3D world space via basis vectors:
  // ∇_pos(s) = fieldScale · Σ_j dsND[j] · vec3f(basisX[j], basisY[j], basisZ[j])
  var gradWorld = vec3f(0.0);
  ${Array.from({ length: dim }, (_, j) => {
    return `{
    let dsND_${j} = dRhoHalfND_${j} * twoInvRhoEps;
    let bx = getBasisComponent(basis.basisX, ${j});
    let by = getBasisComponent(basis.basisY, ${j});
    let bz = getBasisComponent(basis.basisZ, ${j});
    gradWorld += dsND_${j} * vec3f(bx, by, bz);
  }`
  }).join('\n  ')}
  let gradS = gradWorld * uniforms.fieldScale;`

  // OPT-14: project Re(ψ) and Im(ψ) ND-gradients to world space.
  // These reuse the same basis components already loaded for gradS so the only
  // new ALU is one multiply-add per (dim × component). For dim=3 that's 18 muls
  // total — small change vs. skipping 4 full eigenfunction evals at the nodal
  // band site (hundreds of muls per step in HO-3D termCount=4).
  const basisProjectionPsi = `
  // Project Re(ψ) and Im(ψ) ND-gradients to world space using the same basis.
  var gradPsiReWorld = vec3f(0.0);
  var gradPsiImWorld = vec3f(0.0);
  ${Array.from({ length: dim }, (_, j) => {
    return `{
    let bx = getBasisComponent(basis.basisX, ${j});
    let by = getBasisComponent(basis.basisY, ${j});
    let bz = getBasisComponent(basis.basisZ, ${j});
    let basisVec = vec3f(bx, by, bz);
    gradPsiReWorld += dPsiRe[${j}] * basisVec;
    gradPsiImWorld += dPsiIm[${j}] * basisVec;
  }`
  }).join('\n  ')}
  let gradPsiRe = gradPsiReWorld * uniforms.fieldScale;
  let gradPsiIm = gradPsiImWorld * uniforms.fieldScale;`

  return /* wgsl */ `
// ============================================
// Analytical Gradient from Eigenfunction Cache
// Dimension: ${dim}, Terms: ${useUnrolledTerms ? tc : 'dynamic'}
// ============================================

// Extended sample carrying the density, phase, raw psi, and gradients that the
// analytical nodal-band path needs from the same eigenfunction evaluation.
//
// OPT-14: also carries world-space Re/Im psi gradients so the nodal band can
// be evaluated analytically — replaces 4 tetrahedral psi samples per step.
struct AnalyticalSample {
  rho: f32,
  s: f32,
  phase: f32,
  gradient: vec3f,
  psi: vec2f,
  gradPsiRe: vec3f,
  gradPsiIm: vec3f,
}

// Compute ψ, ∇ψ, ρ, and ∇(log ρ) analytically from cached 1D eigenfunctions.
// Returns TetraSample (same interface as sampleWithTetrahedralGradient).
fn sampleDensityWithAnalyticalGradient(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> TetraSample {
  // Map 3D world position to ND coordinates
  let xND = mapPosToND(pos, uniforms);

${termsBlock}

  // ρ = |ψ|²
  let rho = psiRe * psiRe + psiIm * psiIm;
  let s = log(rho + 1e-8);

  // Spatial phase for coloring (time-independent: coefficient × spatial product, no e^{-iEt})
  let spatialPhase = atan2(spatIm, spatRe);

  // ∂ρ/∂xND[j] = 2 · Re(ψ* · ∂ψ/∂xND[j]) = 2 · (ψ_re · ∂ψ_re/∂xND[j] + ψ_im · ∂ψ_im/∂xND[j])
  // PERF: emit dRhoHalfND (without the 2× factor) and fold 2× into twoInvRhoEps
  // so basisProjection does 1 mul/dim instead of 2.
  let twoInvRhoEps = 2.0 / (rho + 1e-8);
${Array.from({ length: dim }, (_, j) => `  let dRhoHalfND_${j} = psiRe * dPsiRe[${j}] + psiIm * dPsiIm[${j}];`).join('\n')}

${basisProjection}

  return TetraSample(rho, s, spatialPhase, gradS);
}

// Combined density + gradient + raw psi + post-modulation rho/s/phase.
// PERF: replaces per-step pair { sampleDensityWithPhaseAndFlow, ensureGradient }
// in the analytical inline raymarch — eliminates one full eigenfunction eval per
// step when the eigenfunction cache is in use.
//
// Density modulations (hydrogenNDBoost, uncertainty boundary, interference,
// phase shimmer) are applied IDENTICALLY to sampleDensityWithPhaseComponents /
// sampleDensityWithPhaseAndFlow. Gradient is the raw ∇log(ρ_raw) — matching the
// existing computeAnalyticalGradient contract (gradient direction is unchanged
// by the multiplicative density modulations the renderer applies).
fn sampleDensityWithAnalyticalGradientFlow(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> AnalyticalSample {
  let xND = mapPosToND(pos, uniforms);

${termsBlock}

  // Raw |ψ|² from eigenfunction product (used for both gradient and starting rho)
  let psiMag2 = psiRe * psiRe + psiIm * psiIm;
  var rhoMod = psiMag2;

  // Hydrogen ND density boost (matches sampleDensityWithPhaseAndFlow ordering;
  // analytical gradient is HO-only today via useAnalyticalGradient, so this
  // branch is dead in current configs — kept for forward-compat parity).
  if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND) {
    rhoMod *= uniforms.hydrogenNDBoost;
  }

  let spatialPhase = atan2(spatIm, spatRe);

  // Relative phase via the HO formula:
  // relativePhase = atan2(Im(ψ_spatial* · ψ_time), Re(ψ_spatial* · ψ_time))
  let refNorm2 = spatRe * spatRe + spatIm * spatIm;
  var relativePhase = spatialPhase;
  if (refNorm2 > 1e-12 && psiMag2 > 1e-12) {
    let imagPart = spatRe * psiIm - spatIm * psiRe;
    let realPart = spatRe * psiRe + spatIm * psiIm;
    relativePhase = atan2(imagPart, realPart);
  }

  if (FEATURE_UNCERTAINTY_BOUNDARY && !SKIP_DENSITY_EMPHASIS) {
    let boundaryLogRho = log(rhoMod + DENSITY_EPS);
    rhoMod = applyUncertaintyBoundaryEmphasis(rhoMod, boundaryLogRho, uniforms);
  }

  if (FEATURE_INTERFERENCE && uniforms.interferenceEnabled != 0u && uniforms.interferenceAmp > 0.0) {
    let iTime = uniforms.time * uniforms.interferenceSpeed;
    let fringe = 1.0 + uniforms.interferenceAmp * sin(spatialPhase * uniforms.interferenceFreq + iTime);
    rhoMod *= fringe;
    rhoMod = max(rhoMod, 0.0);
  }

  if (uniforms.phaseShimmerEnabled != 0u && uniforms.phaseShimmerStrength > 0.0) {
    let pcfSpeedMod = 1.0 - clamp(rhoMod * 5.0, 0.0, 1.0);
    let pcfTime = uniforms.time * uniforms.phaseShimmerSpeed;
    let pcfOffset = pcfTime * pcfSpeedMod;
    let invPsiLen = inverseSqrt(max(psiMag2, 1e-16));
    let pcfCosP = psiRe * invPsiLen;
    let pcfSinP = psiIm * invPsiLen;
    let pcfNoise = gradientNoise(pos * 2.0 + vec3f(
        pcfOffset + pcfCosP * 0.5,
        pcfSinP * 0.5,
        pcfOffset * 0.7 + pcfCosP * 0.3
    ));
    rhoMod *= (1.0 + pcfNoise * uniforms.phaseShimmerStrength * pcfSpeedMod);
    rhoMod = max(rhoMod, 0.0);
  }

  let sMod = log(rhoMod + DENSITY_EPS);
  let phaseForColor = select(spatialPhase, relativePhase, COLOR_ALGORITHM == 10);
${basisProjectionPsi}

  // Gradient on raw rho (matches existing computeAnalyticalGradient semantics).
  // Reuse projected psi gradients instead of doing a second ND-to-world projection.
  let twoInvRhoEps = 2.0 / (psiMag2 + 1e-8);
  let gradS = (gradPsiRe * psiRe + gradPsiIm * psiIm) * twoInvRhoEps;

  return AnalyticalSample(
    rhoMod, sMod, phaseForColor, gradS, vec2f(psiRe, psiIm),
    gradPsiRe, gradPsiIm
  );
}

// Gradient-only (when density is already known)
fn computeAnalyticalGradient(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> vec3f {
  return sampleDensityWithAnalyticalGradient(pos, t, uniforms).gradient;
}
`
}
