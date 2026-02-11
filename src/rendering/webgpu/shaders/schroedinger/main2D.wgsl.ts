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
  // Map UV [0,1] to centered coordinates [-1,1]
  let centeredUV = input.uv * 2.0 - 1.0;

  // Scale by bounding radius and aspect ratio
  let aspect = camera.resolution.x / camera.resolution.y;
  let physX = centeredUV.x * schroedinger.boundingRadius * aspect;
  let physY = centeredUV.y * schroedinger.boundingRadius;

  // Apply camera pan (model matrix translation)
  let worldPos2D = (camera.modelMatrix * vec4f(physX, physY, 0.0, 1.0)).xyz;

  // Apply camera zoom via inverse model matrix scale
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
  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
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

  // Phase-coherent quantum texture (probability flow animation)
  if (schroedinger.probabilityFlowEnabled != 0u && schroedinger.probabilityFlowStrength > 0.0) {
    let pcfSpeedMod = 1.0 - clamp(rho * 5.0, 0.0, 1.0);
    let pcfTime = schroedinger.time * schroedinger.probabilityFlowSpeed;
    let pcfOffset = pcfTime * pcfSpeedMod;
    let psiLen = max(length(psi), 1e-8);
    let pcfCosP = psi.x / psiLen;
    let pcfSinP = psi.y / psiLen;
    let pcfNoise = gradientNoise(pos * 2.0 + vec3f(
        pcfOffset + pcfCosP * 0.5,
        pcfSinP * 0.5,
        pcfOffset * 0.7 + pcfCosP * 0.3
    ));
    rho *= (1.0 + pcfNoise * schroedinger.probabilityFlowStrength * pcfSpeedMod);
    rho = max(rho, 0.0);
  }

  let s = sFromRho(rho);

  // Compute base color using existing color system
  var baseColor = computeBaseColor(rho, s, spatialPhase, pos, schroedinger);

  // Phase materiality: modulate material appearance based on quantum phase
  if (FEATURE_PHASE_MATERIALITY && schroedinger.phaseMaterialityEnabled != 0u) {
    let phaseMod = fract((spatialPhase + PI) / TAU);
    let plasmaWeight = smoothstep(0.35, 0.65, phaseMod);
    let smokeWeight = 1.0 - plasmaWeight;
    let pmStr = schroedinger.phaseMaterialityStrength;
    let normalizedRho = clamp((s + 8.0) / 8.0, 0.0, 1.0);
    let plasmaColor = blackbody(normalizedRho * 8000.0 + 2000.0);
    let smokeColor = vec3f(0.08, 0.08, 0.25) * max(length(baseColor), 0.1);
    baseColor = mix(baseColor,
      plasmaColor * plasmaWeight + smokeColor * smokeWeight,
      pmStr);
  }

  // Apply emission intensity (ambient-only for 2D — no volumetric lighting)
  var col = baseColor * lighting.ambientColor * lighting.ambientIntensity;

  // HDR Emission Glow
  if (schroedinger.emissionIntensity > 0.0) {
    let normalizedRho = clamp((s + 8.0) / 8.0, 0.0, 1.0);
    if (normalizedRho > schroedinger.emissionThreshold) {
      var emissionFactor = (normalizedRho - schroedinger.emissionThreshold) / (1.0 - schroedinger.emissionThreshold);
      emissionFactor = emissionFactor * emissionFactor;

      var emissionColor = baseColor;
      if (abs(schroedinger.emissionColorShift) > 0.01) {
        var hsl = rgb2hsl(emissionColor);
        if (schroedinger.emissionColorShift > 0.0) {
          hsl.x = mix(hsl.x, 0.08, schroedinger.emissionColorShift * 0.5);
          hsl.y = mix(hsl.y, 1.0, schroedinger.emissionColorShift * 0.3);
        } else {
          hsl.x = mix(hsl.x, 0.6, -schroedinger.emissionColorShift * 0.5);
          hsl.z = mix(hsl.z, 0.9, -schroedinger.emissionColorShift * 0.3);
        }
        emissionColor = hsl2rgb(hsl.x, hsl.y, hsl.z);
      }
      col += emissionColor * schroedinger.emissionIntensity * emissionFactor;
    }
  }

  // Nodal lines (2D equivalent of nodal surfaces)
  if (FEATURE_NODAL && schroedinger.nodalEnabled != 0u && schroedinger.nodalStrength > 0.0) {
    let nodalResult = evaluateNodalLines2D(pos, animTime, schroedinger);
    if (nodalResult.x > 0.0) {
      let nodalAlpha = nodalResult.x * schroedinger.nodalStrength;
      let nodalColor = vec3f(nodalResult.y, nodalResult.z, nodalResult.w);
      col = mix(col, nodalColor, clamp(nodalAlpha, 0.0, 0.95));
    }
  }

  // Alpha from density — use a smooth mapping for 2D
  // Direct density gives good results without volumetric integration losses
  let densityGained = rho * schroedinger.densityGain;
  let alpha = clamp(densityGained * 8.0, 0.0, 1.0);

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
  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
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

  // Phase-coherent quantum texture (probability flow animation)
  if (schroedinger.probabilityFlowEnabled != 0u && schroedinger.probabilityFlowStrength > 0.0) {
    let pcfSpeedMod = 1.0 - clamp(rho * 5.0, 0.0, 1.0);
    let pcfTime = schroedinger.time * schroedinger.probabilityFlowSpeed;
    let pcfOffset = pcfTime * pcfSpeedMod;
    let psiLen = max(length(psi), 1e-8);
    let pcfCosP = psi.x / psiLen;
    let pcfSinP = psi.y / psiLen;
    let pcfNoise = gradientNoise(pos * 2.0 + vec3f(
        pcfOffset + pcfCosP * 0.5,
        pcfSinP * 0.5,
        pcfOffset * 0.7 + pcfCosP * 0.3
    ));
    rho *= (1.0 + pcfNoise * schroedinger.probabilityFlowStrength * pcfSpeedMod);
    rho = max(rho, 0.0);
  }

  let s = sFromRho(rho);

  // Compute heatmap base color
  var baseColor = computeBaseColor(rho, s, spatialPhase, pos, schroedinger);

  // Phase materiality: modulate material appearance based on quantum phase
  if (FEATURE_PHASE_MATERIALITY && schroedinger.phaseMaterialityEnabled != 0u) {
    let phaseMod = fract((spatialPhase + PI) / TAU);
    let plasmaWeight = smoothstep(0.35, 0.65, phaseMod);
    let smokeWeight = 1.0 - plasmaWeight;
    let pmStr = schroedinger.phaseMaterialityStrength;
    let normalizedRho = clamp((s + 8.0) / 8.0, 0.0, 1.0);
    let plasmaColor = blackbody(normalizedRho * 8000.0 + 2000.0);
    let smokeColor = vec3f(0.08, 0.08, 0.25) * max(length(baseColor), 0.1);
    baseColor = mix(baseColor,
      plasmaColor * plasmaWeight + smokeColor * smokeWeight,
      pmStr);
  }

  var col = baseColor * lighting.ambientColor * lighting.ambientIntensity;

  // HDR Emission Glow
  if (schroedinger.emissionIntensity > 0.0) {
    let normalizedRho = clamp((s + 8.0) / 8.0, 0.0, 1.0);
    if (normalizedRho > schroedinger.emissionThreshold) {
      var emissionFactor = (normalizedRho - schroedinger.emissionThreshold) / (1.0 - schroedinger.emissionThreshold);
      emissionFactor = emissionFactor * emissionFactor;
      col += baseColor * schroedinger.emissionIntensity * emissionFactor;
    }
  }

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
      alpha = max(alpha, nodalAlpha);
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
