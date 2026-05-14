import { assembleShaderBlocks, type ShaderBlock } from '../../shared/compose-helpers'
import { volumeRaymarchHQBlock } from './volumeRaymarchHQ.wgsl'

/**
 * Volume Raymarching Functions
 *
 * Main raymarching loop and HQ variant extracted from integration.wgsl.ts.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/volumeRaymarch.wgsl
 */

/**
 * Main volume raymarching block.
 */
const volumeRaymarchMainBlock: ShaderBlock = {
  name: 'Volume Raymarch Main',
  content: /* wgsl */ `
/**
 * Main volume raymarching function.
 * Supports lighting (matched to Mandelbulb behavior).
 * Returns: VolumeResult with color, alpha, and iteration count.
 *
 * Fixed sample counts: uses uniforms.sampleCount
 */
fn volumeRaymarch(
  rayOrigin: vec3f,
  rayDir: vec3f,
  tNear: f32,
  tFar: f32,
  uniforms: SchroedingerUniforms
) -> VolumeResult {
  var accColor = vec3f(0.0);

  // Iteration counter for debug visualization
  var iterCount: i32 = 0;

  // Primary hit tracking for temporal reprojection
  var primaryHitT: f32 = -1.0;
  let primaryHitThreshold: f32 = 0.01; // Alpha threshold to consider a "hit"

  // Sample count scaled by per-pixel path length to keep step SIZE constant.
  // Glancing rays traverse less volume → fewer steps, same sampling density.
  let safeBoundingRadius = max(abs(uniforms.boundingRadius), 1e-4);
  let maxPathLen = 2.0 * safeBoundingRadius;
  let sampleCount = max(i32(f32(max(uniforms.sampleCount, 1)) * (tFar - tNear) / maxPathLen), 4);

  let stepLen = (tFar - tNear) / f32(sampleCount);
  // Hoist 1/stepLen so compositeOverlay can skip its per-call division
  // (up to ~60-80 active calls per ray in the probCurrent/radialProb paths).
  let invStepLen = 1.0 / max(stepLen, 1e-5);
  var t = tNear;

  // Time for animation
  let animTime = getVolumeTime(uniforms);
  let viewDir = -rayDir;
  let ambientLight = lighting.ambientColor * lighting.ambientIntensity;

  // Transmittance
  var transmittance: f32 = 1.0;

  // PERF: Hoist loop-invariant bounding radius computation
  let boundR2 = safeBoundingRadius * safeBoundingRadius;
  // sqrt(0.85)≈0.92: outer 8% shell is deep exponential tail for HO/hydrogen wavefunctions.
  let boundR2Skip = boundR2 * 0.85;

  // PERF: Hoist uniform-only feature gates out of the 128-iteration loop body.
  // Every read here would otherwise hit the uniform cache on every iteration.
  let nodalBandEnabled =
    FEATURE_NODAL &&
    uniforms.nodalEnabled != 0u &&
    uniforms.nodalStrength > 0.0 &&
    activeNodalRenderMode(uniforms) == NODAL_RENDER_MODE_BAND;
  let probCurrentEnabled =
    FEATURE_PROBABILITY_CURRENT &&
    uniforms.probabilityCurrentEnabled != 0u &&
    uniforms.probabilityCurrentScale > 0.0;
  let probCurrentDensityThreshold = max(uniforms.probabilityCurrentDensityThreshold, 0.0);
  let radialProbEnabled = FEATURE_RADIAL_PROBABILITY && uniforms.radialProbabilityEnabled != 0u;
  let momentumRepresentation = uniforms.representationMode == REPRESENTATION_MOMENTUM;
  let backreactionActive = isQuantumBackreactionActive(uniforms)
    && FEATURE_QUANTUM_BACKREACTION_LENSING;
  let bilocalBridgeActive = isBilocalERBridgeActive(uniforms) && FEATURE_BILOCAL_ER_BRIDGE;
  let entropyShearActive = isEntropicTimeShearActive(uniforms) && FEATURE_ENTROPIC_TIME_SHEAR;
  let spectralFlowActive = isSpectralDimensionFlowActive(uniforms) && FEATURE_SPECTRAL_DIMENSION_FLOW;
  let vacuumBubbleActive = isVacuumBubbleLensActive(uniforms) && FEATURE_VACUUM_BUBBLE_LENS;
  let bornNullWeaveActive = isBornNullWeaveActive(uniforms);

  // PERF (OPT-NODAL-DEDUP): when nodal band + analytical-gradient mode is
  // active (the dominant HO 3D-11D path), we drive the per-step density sample
  // through sampleDensityWithAnalyticalGradientFlow up front. This populates
  // analyticalAtSamplePos / gradCache in one call instead of paying for a
  // sampleDensityWithPhaseAndFlow eigenfunction sum AND a second analytical
  // eigenfunction sum at the lazy nodal block below. Loop-invariant: depends
  // on hoisted feature gates and the compile-time USE_ANALYTICAL_GRADIENT flag.
  let useAnalyticalDensitySample = USE_ANALYTICAL_GRADIENT && nodalBandEnabled;

  for (var i: i32 = 0; i < MAX_VOLUME_SAMPLES; i++) {
    if (i >= sampleCount) { break; }
    iterCount = i + 1;  // Track iteration count

    // PERF: cache tFar - t once per iter — used by shouldTerminateRay,
    // skipDistance ceiling, and adaptiveStep.
    let remaining = tFar - t;
    if (shouldTerminateRay(transmittance, uniforms.densityGain, max(remaining, 0.0))) { break; }

    let pos = rayOrigin + rayDir * t;

    // PERF: per-step gradient cache. Backreaction, entropy shear, spectral flow,
    // born-null weave, and the final emission lighting all want a density
    // gradient. Without sharing, each is a separate computeAnalyticalGradient
    // call (full eigenfunction eval in cached mode) or 4× tetrahedral psi
    // samples. The cache invalidates whenever a warp moves samplePos because
    // pos-equality is exact float compare on a freshly-rebound vec3f.
    var gradCache: GradientCache;
    gradCache.valid = false;

    // PERFORMANCE: Gaussian envelope early-skip for deep tail region.
    // The outer ~15% shell of the bounding sphere is exponentially low density
    // for HO/hydrogen wavefunctions (Gaussian/exponential decay).
    // Free scalar fields use a cubic lattice with no radial falloff — skip is invalid.
    if (!IS_FREE_SCALAR) {
      let r2 = dot(pos, pos);
      if (r2 > boundR2Skip) {
        // 8× step in tail shell: at r>0.92R, HO/hydrogen ρ is exponentially small.
        t += stepLen * 8.0;
        continue;
      }
    }

    // Sample density with phase AND raw ψ for probability current reuse. When
    // useAnalyticalDensitySample is true (nodal band + analytical-gradient HO
    // path), drive the sample through the combined analytical function — it
    // returns rho/s/phase/gradient/psi/∇ψ in one eigenfunction sum, eliminating
    // the duplicate eigenfunction evaluation the lazy nodal block used to do.
    var densityInfo: vec3f;
    var rawPsiVec: vec3f;
    var analyticalAtSamplePos: AnalyticalSample;
    var hasAnalytical = false;
    if (useAnalyticalDensitySample) {
      let analytical = sampleDensityWithAnalyticalGradientFlow(pos, animTime, uniforms);
      densityInfo = vec3f(analytical.rho, analytical.s, analytical.phase);
      rawPsiVec = vec3f(analytical.psi.x, analytical.psi.y, 0.0);
      gradCache.gradient = analytical.gradient;
      gradCache.pos = pos;
      gradCache.valid = true;
      analyticalAtSamplePos = analytical;
      hasAnalytical = true;
    } else {
      let densityResult = sampleDensityWithPhaseAndFlow(pos, animTime, uniforms);
      densityInfo = densityResult[0];
      rawPsiVec = densityResult[1];
    }
    var rho = densityInfo.x;
    var sCenter = densityInfo.y;
    var phase = densityInfo.z;

    if (rho < EMPTY_SKIP_THRESHOLD) {
      let skipDistance = min(stepLen * EMPTY_SKIP_FACTOR, max(remaining, 0.0));
      if (skipDistance > stepLen) {
        let probeMid = sampleDensity(pos + rayDir * (skipDistance * 0.5), animTime, uniforms);
        let probeFar = sampleDensity(pos + rayDir * skipDistance, animTime, uniforms);
        if (probeMid < EMPTY_SKIP_THRESHOLD && probeFar < EMPTY_SKIP_THRESHOLD) {
          t += skipDistance;
          continue;
        }
      }
    }

    var samplePos = pos;
    var bridgeGain = 1.0;
    if (bilocalBridgeActive && rho >= EMPTY_SKIP_THRESHOLD) {
      let remoteEndpoint = vec3f(-pos.x, pos.y, pos.z);
      let remoteDensityInfo = sampleDensityWithPhase(remoteEndpoint, animTime, uniforms);
      let bridge = applyBilocalERBridgeTopology(
        pos,
        rayDir,
        rho,
        sCenter,
        phase,
        remoteDensityInfo.x,
        remoteDensityInfo.y,
        remoteDensityInfo.z,
        uniforms
      );
      samplePos = bridge.position;
      bridgeGain = bridge.gain;
      if (length(samplePos - pos) > 1e-6) {
        if (useAnalyticalDensitySample) {
          let analytical = sampleDensityWithAnalyticalGradientFlow(samplePos, animTime, uniforms);
          densityInfo = vec3f(analytical.rho, analytical.s, analytical.phase);
          rawPsiVec = vec3f(analytical.psi.x, analytical.psi.y, 0.0);
          gradCache.gradient = analytical.gradient;
          gradCache.pos = samplePos;
          gradCache.valid = true;
          analyticalAtSamplePos = analytical;
          hasAnalytical = true;
        } else {
          let warpedDensityResult = sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms);
          densityInfo = warpedDensityResult[0];
          rawPsiVec = warpedDensityResult[1];
          gradCache.valid = false;
          hasAnalytical = false;
        }
        rho = densityInfo.x;
        sCenter = densityInfo.y;
        phase = densityInfo.z;
      }
    }

    var causticMultiplier = 1.0;
    if (backreactionActive && rho >= EMPTY_SKIP_THRESHOLD) {
      let metricGradient = ensureGradient(samplePos, animTime, uniforms, &gradCache);
      let beforeBackreaction = samplePos;
      let metric = applyQuantumBackreactionMetric(
        beforeBackreaction, rayDir, rho, sCenter, metricGradient, uniforms
      );
      samplePos = metric.position;
      causticMultiplier = metric.caustic;
      if (length(samplePos - beforeBackreaction) > 1e-6) {
        if (useAnalyticalDensitySample) {
          let analytical = sampleDensityWithAnalyticalGradientFlow(samplePos, animTime, uniforms);
          densityInfo = vec3f(analytical.rho, analytical.s, analytical.phase);
          rawPsiVec = vec3f(analytical.psi.x, analytical.psi.y, 0.0);
          gradCache.gradient = analytical.gradient;
          gradCache.pos = samplePos;
          gradCache.valid = true;
          analyticalAtSamplePos = analytical;
          hasAnalytical = true;
        } else {
          let warpedDensityResult = sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms);
          densityInfo = warpedDensityResult[0];
          rawPsiVec = warpedDensityResult[1];
          gradCache.valid = false;
          hasAnalytical = false;
        }
        rho = densityInfo.x;
        sCenter = densityInfo.y;
        phase = densityInfo.z;
      }
    }

    var entropyGain = 0.0;
    if (entropyShearActive && rho >= EMPTY_SKIP_THRESHOLD) {
      let entropyGradient = ensureGradient(samplePos, animTime, uniforms, &gradCache);
      let beforeEntropyShear = samplePos;
      let entropyShear = applyEntropicTimeShear(
        samplePos, rayDir, rho, sCenter, phase, entropyGradient, uniforms
      );
      samplePos = entropyShear.position;
      entropyGain = entropyShear.entropyGain;
      if (length(samplePos - beforeEntropyShear) > 1e-6) {
        if (useAnalyticalDensitySample) {
          let analytical = sampleDensityWithAnalyticalGradientFlow(samplePos, animTime, uniforms);
          densityInfo = vec3f(analytical.rho, analytical.s, analytical.phase);
          rawPsiVec = vec3f(analytical.psi.x, analytical.psi.y, 0.0);
          gradCache.gradient = analytical.gradient;
          gradCache.pos = samplePos;
          gradCache.valid = true;
          analyticalAtSamplePos = analytical;
          hasAnalytical = true;
        } else {
          let warpedDensityResult = sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms);
          densityInfo = warpedDensityResult[0];
          rawPsiVec = warpedDensityResult[1];
          gradCache.valid = false;
          hasAnalytical = false;
        }
        rho = densityInfo.x;
        sCenter = densityInfo.y;
        phase = densityInfo.z;
      }
    }

    var spectralEmissionGain = 1.0;
    var spectralOpacityScale = 1.0;
    if (spectralFlowActive && rho >= EMPTY_SKIP_THRESHOLD) {
      let spectralGradient = ensureGradient(samplePos, animTime, uniforms, &gradCache);
      let beforeSpectralFlow = samplePos;
      let spectralFlow = applySpectralDimensionFlow(
        samplePos, rayDir, rho, sCenter, spectralGradient, uniforms
      );
      samplePos = spectralFlow.position;
      spectralEmissionGain = spectralFlow.emissionGain;
      spectralOpacityScale = spectralFlow.opacityScale;
      if (length(samplePos - beforeSpectralFlow) > 1e-6) {
        if (useAnalyticalDensitySample) {
          let analytical = sampleDensityWithAnalyticalGradientFlow(samplePos, animTime, uniforms);
          densityInfo = vec3f(analytical.rho, analytical.s, analytical.phase);
          rawPsiVec = vec3f(analytical.psi.x, analytical.psi.y, 0.0);
          gradCache.gradient = analytical.gradient;
          gradCache.pos = samplePos;
          gradCache.valid = true;
          analyticalAtSamplePos = analytical;
          hasAnalytical = true;
        } else {
          let warpedDensityResult = sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms);
          densityInfo = warpedDensityResult[0];
          rawPsiVec = warpedDensityResult[1];
          gradCache.valid = false;
          hasAnalytical = false;
        }
        rho = densityInfo.x;
        sCenter = densityInfo.y;
        phase = densityInfo.z;
      }
    }

    var vacuumBubbleEmissionGain = 1.0;
    var vacuumBubbleOpacityScale = 1.0;
    if (vacuumBubbleActive && rho >= EMPTY_SKIP_THRESHOLD) {
      let beforeVacuumBubble = samplePos;
      let vacuumBubble = applyVacuumBubbleLens(samplePos, rayDir, uniforms);
      samplePos = vacuumBubble.position;
      vacuumBubbleEmissionGain = vacuumBubble.emissionGain;
      vacuumBubbleOpacityScale = vacuumBubble.opacityScale;
      if (length(samplePos - beforeVacuumBubble) > 1e-6) {
        if (useAnalyticalDensitySample) {
          let analytical = sampleDensityWithAnalyticalGradientFlow(samplePos, animTime, uniforms);
          densityInfo = vec3f(analytical.rho, analytical.s, analytical.phase);
          rawPsiVec = vec3f(analytical.psi.x, analytical.psi.y, 0.0);
          gradCache.gradient = analytical.gradient;
          gradCache.pos = samplePos;
          gradCache.valid = true;
          analyticalAtSamplePos = analytical;
          hasAnalytical = true;
        } else {
          let warpedDensityResult = sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms);
          densityInfo = warpedDensityResult[0];
          rawPsiVec = warpedDensityResult[1];
          gradCache.valid = false;
          hasAnalytical = false;
        }
        rho = densityInfo.x;
        sCenter = densityInfo.y;
        phase = densityInfo.z;
      }
    }

    // PERF: external gate. Without it the function call still happens every step
    // (early-returns inside, but the call itself is not free in WGSL ABI).
    // PERF: gradient sourced from the shared cache when available so we don't
    // recompute when no upstream warp moved samplePos.
    var bornNullEmissionGain: f32 = 1.0;
    var bornNullOpacityScale: f32 = 1.0;
    if (bornNullWeaveActive && rho >= EMPTY_SKIP_THRESHOLD) {
      let bornGradient = ensureGradient(samplePos, animTime, uniforms, &gradCache);
      // PERF (OPT-BORN-ANALYTICAL): when the analytical sample at samplePos is
      // fresh (set by the upstream useAnalyticalDensitySample path or any of the
      // warp-and-resample blocks above), reuse its closed-form psi gradients
      // instead of paying for 3 forward-difference evalPsi calls inside Born.
      // hasAnalytical is the same scalar predicate the surrounding code uses to
      // gate analytical resampling, so this branch stays in lockstep with the
      // analytical hot path.
      var bornNullWeave: BornNullWeaveResult;
      if (hasAnalytical) {
        bornNullWeave = applyBornNullWeaveAnalytical(
          samplePos, rayDir, rho, sCenter, phase, bornGradient,
          analyticalAtSamplePos.psi,
          analyticalAtSamplePos.gradPsiRe,
          analyticalAtSamplePos.gradPsiIm,
          uniforms
        );
      } else {
        bornNullWeave = applyBornNullWeave(
          samplePos, rayDir, rho, sCenter, phase, bornGradient, rawPsiVec.xy, uniforms
        );
      }
      bornNullEmissionGain = bornNullWeave.emissionGain;
      bornNullOpacityScale = bornNullWeave.opacityScale;
      let beforeBornNullWeave = samplePos;
      samplePos = bornNullWeave.position;
      if (length(samplePos - beforeBornNullWeave) > 1e-6) {
        if (useAnalyticalDensitySample) {
          let analytical = sampleDensityWithAnalyticalGradientFlow(samplePos, animTime, uniforms);
          densityInfo = vec3f(analytical.rho, analytical.s, analytical.phase);
          rawPsiVec = vec3f(analytical.psi.x, analytical.psi.y, 0.0);
          gradCache.gradient = analytical.gradient;
          gradCache.pos = samplePos;
          gradCache.valid = true;
          analyticalAtSamplePos = analytical;
          hasAnalytical = true;
        } else {
          let warpedDensityResult = sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms);
          densityInfo = warpedDensityResult[0];
          rawPsiVec = warpedDensityResult[1];
          gradCache.valid = false;
          hasAnalytical = false;
        }
        rho = densityInfo.x;
        sCenter = densityInfo.y;
        phase = densityInfo.z;
      }
    }

    let adaptiveStep = computeAdaptiveStep(sCenter, stepLen, remaining);

    // Two-stage nodal band gate:
    // 1. density/log-density gate rejects invisible low-amplitude samples.
    // 2. nodal-only sample gates color/composite work by faded band intensity.
    // Density gradient stays lazy and is computed later only if emission survives.
    if (nodalBandEnabled && sCenter > -10.0) {
      // OPT-14: in analytical-cached mode (HO 3D-11D, the dominant hot path)
      // the analytical sample at samplePos already carries Re/Im psi-gradients,
      // so we can compute the nodal band intensity without 4 tetrahedral psi
      // samples. Hydrogen family-filter is a runtime-only consideration not
      // exposed in this fast path; analytical gradient is HO-only today.
      if (USE_ANALYTICAL_GRADIENT) {
        if (!hasAnalytical) {
          let analytical = sampleDensityWithAnalyticalGradientFlow(samplePos, animTime, uniforms);
          densityInfo = vec3f(analytical.rho, analytical.s, analytical.phase);
          rawPsiVec = vec3f(analytical.psi.x, analytical.psi.y, 0.0);
          rho = densityInfo.x;
          sCenter = densityInfo.y;
          phase = densityInfo.z;
          gradCache.gradient = analytical.gradient;
          gradCache.pos = samplePos;
          gradCache.valid = true;
          analyticalAtSamplePos = analytical;
          hasAnalytical = true;
        }
        let nodalSample = computeNodalFromAnalyticalPsi(
          analyticalAtSamplePos.psi,
          analyticalAtSamplePos.gradPsiRe,
          analyticalAtSamplePos.gradPsiIm,
          uniforms
        );
        let nodalBandIntensity = nodalSample.intensity * nodalSample.envelopeWeight;
        if (nodalBandIntensity > 1e-4) {
          let nodalColor = selectPhysicalNodalColor(uniforms, nodalSample.colorMode, nodalSample.signValue);
          compositeNodalBand(
            nodalBandIntensity, uniforms.nodalStrength, nodalColor,
            min(adaptiveStep, stepLen * 1.5), ambientLight,
            &transmittance, &accColor
          );
        }
        // gradCache is populated by the lazy analytical nodal sample above;
        // emission lighting reuses it.
      } else {
        let nodalSample = computePhysicalNodalField(samplePos, animTime, uniforms);
        let nodalBandIntensity = nodalSample.intensity * nodalSample.envelopeWeight;
        if (nodalBandIntensity > 1e-4) {
          let nodalColor = selectPhysicalNodalColor(uniforms, nodalSample.colorMode, nodalSample.signValue);
          compositeNodalBand(
            nodalBandIntensity, uniforms.nodalStrength, nodalColor,
            min(adaptiveStep, stepLen * 1.5), ambientLight,
            &transmittance, &accColor
          );
        }
      }
    }

    // Hoisted feature gates are used below. sampleProbabilityCurrentWithPsi uses
    // 3 forward-diff evalPsi calls (was 7 central). The center psi is reused from
    // the density pass above (rawPsiVec).
    let momentumOverlaySubsample = momentumRepresentation && (i & 3) != 0;
    if (
      probCurrentEnabled &&
      !momentumOverlaySubsample &&
      rho >= probCurrentDensityThreshold
    ) {
      let normalProxy = normalize(samplePos + vec3f(1e-6, 0.0, 0.0));
      let currentSample = sampleProbabilityCurrentWithPsi(samplePos, animTime, rawPsiVec.xy, uniforms);
      let currentOverlay = computeProbabilityCurrentOverlay(
        samplePos, currentSample, rho, normalProxy, viewDir, uniforms
      );
      compositeOverlay(currentOverlay, adaptiveStep, invStepLen, 0.45, &transmittance, &accColor);
    }

    // Radial probability overlay (hydrogen P(r) shells)
    if (radialProbEnabled) {
      let rProbOverlay = computeRadialProbabilityOverlay(samplePos, uniforms);
      compositeOverlay(rProbOverlay, adaptiveStep, invStepLen, 0.5, &transmittance, &accColor);
    }

    let effectiveRho = computeEffectiveDensity(
      rho * spectralOpacityScale * vacuumBubbleOpacityScale * bornNullOpacityScale,
      phase,
      transmittance,
      uniforms
    );
    let alpha = computeAlpha(effectiveRho, adaptiveStep, uniforms.densityGain);

    if (alpha > 0.001) {
      // Track primary hit for temporal reprojection
      if (primaryHitT < 0.0 && alpha > primaryHitThreshold) {
        primaryHitT = t;
      }

      // Compute gradient for emission lighting. The cache may already be populated
      // by analytical density sampling or spacetime effects; otherwise this remains
      // lazy until alpha survives.
      let gradient = ensureGradient(samplePos, animTime, uniforms, &gradCache);

      // Compute emission with lighting (pass pre-computed log-density to avoid redundant log())
      let emission = computeEmissionLit(rho, sCenter, phase, samplePos, gradient, viewDir, uniforms)
        * causticMultiplier * bridgeGain * spectralEmissionGain * vacuumBubbleEmissionGain
        * bornNullEmissionGain;
      let entropyEmissionGain =
        1.0 + uniforms.entropicTimeShearStrength * max(entropyGain, 0.0) * 0.35;

      // Front-to-back compositing (scalar path)
      accColor += transmittance * alpha * emission * entropyEmissionGain;
      transmittance *= (1.0 - alpha);
    }

    t += adaptiveStep;
  }

  // Final alpha
  let finalAlpha = 1.0 - transmittance;

  // If no primary hit found, use midpoint of ray segment
  if (primaryHitT < 0.0) {
    primaryHitT = (tNear + tFar) * 0.5;
  }

  return VolumeResult(accColor, finalAlpha, iterCount, primaryHitT);
}

`,
}

const volumeRaymarchBlocks: ShaderBlock[] = [
  volumeRaymarchMainBlock,
  { name: 'Volume Raymarch HQ', content: volumeRaymarchHQBlock },
]

/**
 * Volume raymarching and HQ raymarching blocks.
 * Included after volumeIntegrationBlock in the shader assembly.
 */
export const volumeRaymarchBlock: string = assembleShaderBlocks(volumeRaymarchBlocks).wgsl
