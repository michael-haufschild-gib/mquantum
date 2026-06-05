/**
 * Born-Null Weave shader helpers.
 *
 * Deforms analytic raymarch sampling around low-density, high-circulation
 * Born apertures and returns emission/opacity modulation for braided nulls.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/bornNullWeave.wgsl
 */

export const bornNullWeaveBlock = /* wgsl */ `
// ============================================
// Born-Null Weave
// ============================================

struct BornNullWeaveResult {
  position: vec3f,
  emissionGain: f32,
  opacityScale: f32,
  apertureWeight: f32,
}

struct BornNullWeaveRaymarchResult {
  position: vec3f,
  densityInfo: vec3f,
  rawPsi: vec3f,
  emissionGain: f32,
  opacityScale: f32,
}

struct BornNullWeaveHQResult {
  position: vec3f,
  densityInfo: vec3f,
  emissionGain: f32,
  opacityScale: f32,
}

fn isBornNullWeaveActive(uniforms: SchroedingerUniforms) -> bool {
  return uniforms.bornNullWeaveEnabled != 0u
    && uniforms.bornNullWeaveStrength > 0.0
    && uniforms.bornNullWeaveNodeWidth > 0.0
    && uniforms.bornNullWeaveCirculation > 0.0;
}

fn sampleBornNullCurrentWithPsi(
  pos: vec3f,
  t: f32,
  psi: vec2f,
  uniforms: SchroedingerUniforms
) -> vec4f {
  let nodeWidth = clamp(uniforms.bornNullWeaveNodeWidth, 0.0001, 0.2);
  let delta = clamp(max(uniforms.boundingRadius * nodeWidth * 0.35, 0.005), 0.005, 0.12);
  let invDelta = 1.0 / delta;

  let psiPx = evalPsi(mapPosToND(pos + vec3f(delta, 0.0, 0.0), uniforms), t, uniforms);
  let psiPy = evalPsi(mapPosToND(pos + vec3f(0.0, delta, 0.0), uniforms), t, uniforms);
  let psiPz = evalPsi(mapPosToND(pos + vec3f(0.0, 0.0, delta), uniforms), t, uniforms);

  let dPsiDx = (psiPx - psi) * invDelta;
  let dPsiDy = (psiPy - psi) * invDelta;
  let dPsiDz = (psiPz - psi) * invDelta;

  var j = vec3f(
    psi.x * dPsiDx.y - psi.y * dPsiDx.x,
    psi.x * dPsiDy.y - psi.y * dPsiDy.x,
    psi.x * dPsiDz.y - psi.y * dPsiDz.x
  );

  if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND) {
    j *= uniforms.hydrogenNDBoost;
  }

  return vec4f(j, length(j));
}

fn applyBornNullWeave(
  worldPosition: vec3f,
  rayDirection: vec3f,
  densityProxy: f32,
  logDensityProxy: f32,
  phaseProxy: f32,
  localGradient: vec3f,
  psi: vec2f,
  uniforms: SchroedingerUniforms
) -> BornNullWeaveResult {
  if (!isBornNullWeaveActive(uniforms)) {
    return BornNullWeaveResult(worldPosition, 1.0, 1.0, 0.0);
  }

  let peakDensity = max(uniforms.peakDensity, 1e-8);
  let nodeWidth = clamp(uniforms.bornNullWeaveNodeWidth, 0.0001, 0.2);
  let strength = clamp(uniforms.bornNullWeaveStrength, 0.0, 2.0);
  let circulation = clamp(uniforms.bornNullWeaveCirculation, 0.0, 8.0);
  let normalizedRho = densityProxy / peakDensity;
  let nodeGate = 1.0 - smoothstep(nodeWidth, 4.0 * nodeWidth, normalizedRho);
  let vacuumGate = smoothstep(-18.0, -2.0, logDensityProxy);
  // PERF: short-circuit before the 3-psi sampleBornNullCurrentWithPsi call.
  // nodeGate fades to zero at the density peak (where most ray accumulation
  // happens) and vacuumGate fades to zero in the deep tail. Their product is
  // non-zero only in a narrow shell — outside it, currentGate cannot rescue
  // the result, so skipping the gradient-of-psi work is safe.
  let cheapApertureWeight = nodeGate * vacuumGate;
  if (cheapApertureWeight <= 1e-5) {
    return BornNullWeaveResult(worldPosition, 1.0, 1.0, 0.0);
  }
  let currentSample = sampleBornNullCurrentWithPsi(worldPosition, getVolumeTime(uniforms), psi, uniforms);
  let currentMag = currentSample.w;
  let currentGate = 1.0 - exp(-currentMag * circulation / max(densityProxy, 1e-8));
  let apertureWeight = clamp(cheapApertureWeight * currentGate, 0.0, 1.0);

  if (apertureWeight <= 1e-5) {
    return BornNullWeaveResult(worldPosition, 1.0, 1.0, 0.0);
  }

  let j = currentSample.xyz;
  let jMag = max(currentMag, 1e-8);
  let gradMag = length(localGradient);
  let rayN = normalize(rayDirection);
  let apertureNormal = cross(j / jMag, localGradient / max(gradMag, 1e-8));
  let apertureLen = length(apertureNormal);
  let fallbackSeed = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(rayN.x) > 0.9);
  let fallbackTransverse = normalize(cross(rayN, fallbackSeed) + vec3f(1e-6, 0.0, 0.0));
  let transverseDir = select(apertureNormal / max(apertureLen, 1e-8), fallbackTransverse, apertureLen < 1e-6);

  let braidPhase =
    phaseProxy +
    getVolumeTime(uniforms) * (0.7 + 0.11 * circulation) +
    dot(worldPosition, normalize(j + vec3f(1e-6, 0.0, 0.0))) * (1.5 + circulation);
  let braid =
    0.65 * sin(braidPhase) +
    0.35 * sin(braidPhase * 2.17 + dot(worldPosition, localGradient) * 0.07);
  let maxShift = clamp(uniforms.boundingRadius * (0.012 + nodeWidth * 0.55), 0.002, 0.35);
  let displacement = transverseDir * (braid * apertureWeight * strength * maxShift);
  let emissionGain = 1.0 + apertureWeight * strength * (0.65 + 0.35 * abs(braid));
  let opacityScale = clamp(1.0 - apertureWeight * clamp(strength * 0.42, 0.0, 0.72), 0.2, 1.0);

  return BornNullWeaveResult(worldPosition + displacement, emissionGain, opacityScale, apertureWeight);
}

// PERF (OPT-BORN-ANALYTICAL): when the analytical inline raymarch already has
// closed-form psi gradients in hand (AnalyticalSample.gradPsiRe / gradPsiIm),
// reuse them in place of the 3-evalPsi forward-difference inside
// sampleBornNullCurrentWithPsi. Forward-diff is (ψ(x+δ)−ψ(x))/δ ≈ ∂ψ/∂x; the
// analytical gradient is the exact ∂ψ/∂x. They differ by O(δ) truncation error
// — we trade that for ~3× fewer wavefunction evaluations on the Born hot path.
fn sampleBornNullCurrentFromAnalyticalPsi(
  psi: vec2f,
  gradPsiRe: vec3f,
  gradPsiIm: vec3f,
  uniforms: SchroedingerUniforms
) -> vec4f {
  let dPsiDx = vec2f(gradPsiRe.x, gradPsiIm.x);
  let dPsiDy = vec2f(gradPsiRe.y, gradPsiIm.y);
  let dPsiDz = vec2f(gradPsiRe.z, gradPsiIm.z);

  var j = vec3f(
    psi.x * dPsiDx.y - psi.y * dPsiDx.x,
    psi.x * dPsiDy.y - psi.y * dPsiDy.x,
    psi.x * dPsiDz.y - psi.y * dPsiDz.x
  );

  if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND) {
    j *= uniforms.hydrogenNDBoost;
  }

  return vec4f(j, length(j));
}

// Mirror of applyBornNullWeave that consumes analytical psi gradients instead
// of triggering 3 forward-diff evalPsi calls inside sampleBornNullCurrentWithPsi.
// Identical aperture / weave / displacement math; only the current-vector source
// changes. Kept additive so the HQ raymarch (which has no analytical sample)
// can keep using applyBornNullWeave unchanged.
fn applyBornNullWeaveAnalytical(
  worldPosition: vec3f,
  rayDirection: vec3f,
  densityProxy: f32,
  logDensityProxy: f32,
  phaseProxy: f32,
  localGradient: vec3f,
  psi: vec2f,
  gradPsiRe: vec3f,
  gradPsiIm: vec3f,
  uniforms: SchroedingerUniforms
) -> BornNullWeaveResult {
  if (!isBornNullWeaveActive(uniforms)) {
    return BornNullWeaveResult(worldPosition, 1.0, 1.0, 0.0);
  }

  let peakDensity = max(uniforms.peakDensity, 1e-8);
  let nodeWidth = clamp(uniforms.bornNullWeaveNodeWidth, 0.0001, 0.2);
  let strength = clamp(uniforms.bornNullWeaveStrength, 0.0, 2.0);
  let circulation = clamp(uniforms.bornNullWeaveCirculation, 0.0, 8.0);
  let normalizedRho = densityProxy / peakDensity;
  let nodeGate = 1.0 - smoothstep(nodeWidth, 4.0 * nodeWidth, normalizedRho);
  let vacuumGate = smoothstep(-18.0, -2.0, logDensityProxy);
  // PERF: cheap aperture gate kept identical to the forward-diff variant. The
  // analytical helper is much cheaper than 3 evalPsi calls but still O(dim)
  // vector ops, so the early-out is still worth it on rays that miss the
  // narrow node-shell × vacuum-gate intersection.
  let cheapApertureWeight = nodeGate * vacuumGate;
  if (cheapApertureWeight <= 1e-5) {
    return BornNullWeaveResult(worldPosition, 1.0, 1.0, 0.0);
  }
  let currentSample = sampleBornNullCurrentFromAnalyticalPsi(psi, gradPsiRe, gradPsiIm, uniforms);
  let currentMag = currentSample.w;
  let currentGate = 1.0 - exp(-currentMag * circulation / max(densityProxy, 1e-8));
  let apertureWeight = clamp(cheapApertureWeight * currentGate, 0.0, 1.0);

  if (apertureWeight <= 1e-5) {
    return BornNullWeaveResult(worldPosition, 1.0, 1.0, 0.0);
  }

  let j = currentSample.xyz;
  let jMag = max(currentMag, 1e-8);
  let gradMag = length(localGradient);
  let rayN = normalize(rayDirection);
  let apertureNormal = cross(j / jMag, localGradient / max(gradMag, 1e-8));
  let apertureLen = length(apertureNormal);
  let fallbackSeed = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(rayN.x) > 0.9);
  let fallbackTransverse = normalize(cross(rayN, fallbackSeed) + vec3f(1e-6, 0.0, 0.0));
  let transverseDir = select(apertureNormal / max(apertureLen, 1e-8), fallbackTransverse, apertureLen < 1e-6);

  let braidPhase =
    phaseProxy +
    getVolumeTime(uniforms) * (0.7 + 0.11 * circulation) +
    dot(worldPosition, normalize(j + vec3f(1e-6, 0.0, 0.0))) * (1.5 + circulation);
  let braid =
    0.65 * sin(braidPhase) +
    0.35 * sin(braidPhase * 2.17 + dot(worldPosition, localGradient) * 0.07);
  let maxShift = clamp(uniforms.boundingRadius * (0.012 + nodeWidth * 0.55), 0.002, 0.35);
  let displacement = transverseDir * (braid * apertureWeight * strength * maxShift);
  let emissionGain = 1.0 + apertureWeight * strength * (0.65 + 0.35 * abs(braid));
  let opacityScale = clamp(1.0 - apertureWeight * clamp(strength * 0.42, 0.0, 0.72), 0.2, 1.0);

  return BornNullWeaveResult(worldPosition + displacement, emissionGain, opacityScale, apertureWeight);
}

fn computeBornNullWeaveGradient(
  samplePos: vec3f,
  animTime: f32,
  uniforms: SchroedingerUniforms
) -> vec3f {
  if (USE_ANALYTICAL_GRADIENT) {
    return computeAnalyticalGradient(samplePos, animTime, uniforms);
  }
  return computeGradientTetrahedral(samplePos, animTime, 0.05, uniforms);
}

fn applyBornNullWeaveRaymarch(
  bnwActive: bool,
  samplePos: vec3f,
  rayDir: vec3f,
  densityInfo: vec3f,
  rawPsiVec: vec3f,
  uniforms: SchroedingerUniforms
) -> BornNullWeaveRaymarchResult {
  if (!bnwActive || densityInfo.x < EMPTY_SKIP_THRESHOLD) {
    return BornNullWeaveRaymarchResult(samplePos, densityInfo, rawPsiVec, 1.0, 1.0);
  }

  let animTime = getVolumeTime(uniforms);
  let gradient = computeBornNullWeaveGradient(samplePos, animTime, uniforms);
  let bornNullWeave = applyBornNullWeave(
    samplePos, rayDir, densityInfo.x, densityInfo.y, densityInfo.z, gradient, rawPsiVec.xy, uniforms
  );
  if (length(bornNullWeave.position - samplePos) <= 1e-6) {
    return BornNullWeaveRaymarchResult(
      bornNullWeave.position, densityInfo, rawPsiVec, bornNullWeave.emissionGain, bornNullWeave.opacityScale
    );
  }

  let warpedDensityResult = sampleDensityWithPhaseAndFlow(bornNullWeave.position, animTime, uniforms);
  return BornNullWeaveRaymarchResult(
    bornNullWeave.position,
    warpedDensityResult[0],
    warpedDensityResult[1],
    bornNullWeave.emissionGain,
    bornNullWeave.opacityScale
  );
}

fn applyBornNullWeaveRaymarchHQ(
  bnwActive: bool,
  samplePos: vec3f,
  rayDir: vec3f,
  densityInfo: vec3f,
  uniforms: SchroedingerUniforms
) -> BornNullWeaveHQResult {
  if (!bnwActive || densityInfo.x < EMPTY_SKIP_THRESHOLD) {
    return BornNullWeaveHQResult(samplePos, densityInfo, 1.0, 1.0);
  }

  let animTime = getVolumeTime(uniforms);
  let gradient = computeBornNullWeaveGradient(samplePos, animTime, uniforms);
  let psi = evalPsi(mapPosToND(samplePos, uniforms), animTime, uniforms);
  let bornNullWeave = applyBornNullWeave(
    samplePos, rayDir, densityInfo.x, densityInfo.y, densityInfo.z, gradient, psi, uniforms
  );
  if (length(bornNullWeave.position - samplePos) <= 1e-6) {
    return BornNullWeaveHQResult(
      bornNullWeave.position, densityInfo, bornNullWeave.emissionGain, bornNullWeave.opacityScale
    );
  }

  return BornNullWeaveHQResult(
    bornNullWeave.position,
    sampleDensityWithPhase(bornNullWeave.position, animTime, uniforms),
    bornNullWeave.emissionGain,
    bornNullWeave.opacityScale
  );
}
`
