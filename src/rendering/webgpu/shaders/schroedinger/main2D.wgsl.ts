/**
 * WGSL 2D Fragment Shader Entry Points
 *
 * Provides flat heatmap and isoline rendering modes for dimension=2.
 * Instead of volumetric raymarching, evaluates the wavefunction directly
 * at each pixel by mapping UV → physical (x,y) coordinates.
 *
 * @module rendering/webgpu/shaders/schroedinger/main2D
 */

/**
 * Shared WGSL body for 2D modes: UV → physical coords, wavefunction evaluation,
 * density effects (hydrogen boost, uncertainty boundary, interference, phase shimmer),
 * color computation (base color, phase materiality, ambient lighting, HDR emission).
 *
 * Produces local variables available to the caller:
 *   pos (vec3f), animTime (f32), rho (f32), s (f32), spatialPhase (f32),
 *   baseColor (vec3f), col (vec3f)
 */
function generate2DCommonBody(): string {
  return `
  // Map UV [0,1] to centered coordinates [-1,1]
  let centeredUV = input.uv * 2.0 - 1.0;

  // Scale by bounding radius and aspect ratio
  let aspect = camera.resolution.x / camera.resolution.y;
  let physX = centeredUV.x * schroedinger.boundingRadius * aspect;
  let physY = centeredUV.y * schroedinger.boundingRadius;

  // Apply camera pan (model matrix translation)
  let worldPos2D = (camera.modelMatrix * vec4f(physX, physY, 0.0, 1.0)).xyz;
  let pos = vec3f(worldPos2D.x, worldPos2D.y, 0.0);

  // Map 3D position (with z=0) to ND coordinates
  let xND = mapPosToND(pos, schroedinger);

  // Get animation time
  let animTime = schroedinger.time * schroedinger.timeScale;

  // Evaluate wavefunction with spatial phase
  let psiResult = evalPsiWithSpatialPhase(xND, animTime, schroedinger);
  let psi = psiResult.xy;
  let spatialPhase = psiResult.z;

  var rho = rhoFromPsi(psi);

  // Hydrogen ND density boost
  if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND) {
    rho *= schroedinger.hydrogenNDBoost;
  }

  // Uncertainty boundary emphasis
  if (FEATURE_UNCERTAINTY_BOUNDARY) {
    let boundaryLogRho = sFromRho(rho);
    rho = applyUncertaintyBoundaryEmphasis(rho, boundaryLogRho, schroedinger);
  }

  // Interference fringing
  if (FEATURE_INTERFERENCE && schroedinger.interferenceEnabled != 0u && schroedinger.interferenceAmp > 0.0) {
    let iTime = schroedinger.time * schroedinger.interferenceSpeed;
    let fringe = 1.0 + schroedinger.interferenceAmp * sin(spatialPhase * schroedinger.interferenceFreq + iTime);
    rho *= fringe;
    rho = max(rho, 0.0);
  }

  // Phase shimmer — density-modulated flow-noise animation
  if (schroedinger.phaseShimmerEnabled != 0u && schroedinger.phaseShimmerStrength > 0.0) {
    let shimmerSpeed = 1.0 - clamp(rho * 5.0, 0.0, 1.0);
    let shimmerTime = schroedinger.time * schroedinger.phaseShimmerSpeed;
    let shimmerOffset = shimmerTime * shimmerSpeed;
    let psiLen = max(length(psi), 1e-8);
    let shimmerCosP = psi.x / psiLen;
    let shimmerSinP = psi.y / psiLen;
    let shimmerNoise = gradientNoise(pos * 2.0 + vec3f(
        shimmerOffset + shimmerCosP * 0.5,
        shimmerSinP * 0.5,
        shimmerOffset * 0.7 + shimmerCosP * 0.3
    ));
    rho *= (1.0 + shimmerNoise * schroedinger.phaseShimmerStrength * shimmerSpeed);
    rho = max(rho, 0.0);
  }

  let s = sFromRho(rho);

  // Compute base color using existing color system
  var baseColor = computeBaseColor(rho, s, spatialPhase, pos, schroedinger);

  // Phase materiality (shared helper)
  if (FEATURE_PHASE_MATERIALITY && schroedinger.phaseMaterialityEnabled != 0u) {
    baseColor = applyPhaseMateriality(baseColor, spatialPhase, s, schroedinger);
  }

  // Apply emission intensity (ambient-only for 2D — no volumetric lighting)
  var col = baseColor * lighting.ambientColor * lighting.ambientIntensity;

  // HDR Emission Glow (shared helper)
  col = applyHDREmissionGlow(col, baseColor, s, schroedinger);
`
}

/**
 * Generate the 2D heatmap fragment shader main block.
 *
 * Maps UV → physical (x,y), evaluates wavefunction, applies color.
 * Equivalent of volumetric mode for 3D but with direct evaluation.
 *
 * @returns WGSL fragment shader code for 2D heatmap
 */
export function generateMainBlock2D(): string {
  return /* wgsl */ `
// ============================================
// Main Fragment Shader - 2D Heatmap Mode
// ============================================

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
${generate2DCommonBody()}
  // Alpha from density — use a smooth mapping for 2D.
  // Direct density gives good results without volumetric integration losses.
  // Must be computed BEFORE the nodal block so the nodal overlay can bump
  // alpha above the discard threshold; nodal lines live where ψ=0, i.e.
  // exactly where density is near zero, and would be silently culled by
  // the discard below if alpha stayed density-only.
  let densityGained = rho * schroedinger.densityGain;
  var alpha = clamp(densityGained * 8.0, 0.0, 1.0);

  // Nodal lines (2D equivalent of nodal surfaces). Mirror the isoline
  // entry point: mix the color AND bump alpha so nodal-line pixels
  // survive the transparency cull below.
  if (FEATURE_NODAL && schroedinger.nodalEnabled != 0u && schroedinger.nodalStrength > 0.0) {
    let nodalResult = evaluateNodalLines2D(pos, animTime, schroedinger);
    if (nodalResult.x > 0.0) {
      let nodalAlpha = nodalResult.x * schroedinger.nodalStrength;
      let nodalColor = vec3f(nodalResult.y, nodalResult.z, nodalResult.w);
      col = mix(col, nodalColor, clamp(nodalAlpha, 0.0, 0.95));
      alpha = clamp(max(alpha, nodalAlpha), 0.0, 1.0);
    }
  }

  // Discard fully transparent pixels
  if (alpha < 0.005) {
    discard;
  }

  return vec4f(col, alpha);
}
`
}

/**
 * Generate the 2D isolines fragment shader main block.
 *
 * Same as heatmap but overlays anti-aliased contour lines at density thresholds.
 * 2D equivalent of isosurface mode.
 *
 * @returns WGSL fragment shader code for 2D isolines
 */
export function generateMainBlock2DIsolines(): string {
  return /* wgsl */ `
// ============================================
// Main Fragment Shader - 2D Isolines Mode
// ============================================

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
${generate2DCommonBody()}
  // Alpha from density
  let densityGained = rho * schroedinger.densityGain;
  var alpha = clamp(densityGained * 8.0, 0.0, 1.0);

  // Overlay anti-aliased isolines
  let isolineResult = evaluateIsolines2D(pos, rho, s, schroedinger);
  if (isolineResult.x > 0.0) {
    let isolineAlpha = isolineResult.x;
    let isolineColor = vec3f(isolineResult.y, isolineResult.z, isolineResult.w);
    col = mix(col, isolineColor, clamp(isolineAlpha, 0.0, 0.95));
    alpha = max(alpha, isolineAlpha * 0.8);
  }

  // Nodal lines
  if (FEATURE_NODAL && schroedinger.nodalEnabled != 0u && schroedinger.nodalStrength > 0.0) {
    let nodalResult = evaluateNodalLines2D(pos, animTime, schroedinger);
    if (nodalResult.x > 0.0) {
      let nodalAlpha = nodalResult.x * schroedinger.nodalStrength;
      let nodalColor = vec3f(nodalResult.y, nodalResult.z, nodalResult.w);
      col = mix(col, nodalColor, clamp(nodalAlpha, 0.0, 0.95));
      alpha = clamp(max(alpha, nodalAlpha), 0.0, 1.0);
    }
  }

  // Discard fully transparent pixels
  if (alpha < 0.005) {
    discard;
  }

  return vec4f(col, alpha);
}
`
}
