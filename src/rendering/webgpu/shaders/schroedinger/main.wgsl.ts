/**
 * WGSL Schrödinger Main Shader
 *
 * Main volume raymarching loop for quantum wavefunction visualization.
 *
 * Supports two modes:
 * - Volumetric: Uses Beer-Lambert absorption and front-to-back compositing
 * - Isosurface: Finds density threshold surface with PBR lighting
 *
 * Uniform access:
 * - camera: CameraUniforms (Group 0, Binding 0)
 * - lighting: LightingUniforms (Group 1, Binding 0)
 * - material: MaterialUniforms (Group 1, Binding 1)
 * - schroedinger: SchroedingerUniforms (Group 2, Binding 0)
 * - basis: BasisVectors (Group 2, Binding 1)
 *
 * @module rendering/webgpu/shaders/schroedinger/main.wgsl
 */

import { COLOR_ALGORITHM_TO_INT } from '@/lib/colors/palette/types'

import { generateBayerJitterSection, getRayDirSource } from './temporalJitter'

// Phase-dependent color algorithms that require direct wavefunction sampling
// when the bound density grid does not carry phase data (DENSITY_GRID_HAS_PHASE
// = false). Analytic modes (HO / hydrogen) write phase into the grid via the
// `densityGridWithPhaseComputeBlock` shader (forceRgba=true forces rgba16float)
// but report `densityGridHasPhase=undefined` to the composer, so the WGSL
// `loadGridSampleState` short-circuits phase to 0 — for any algorithm that
// reads `phase` from emission.wgsl, the rendering collapses to a constant hue
// unless the algorithm is listed here so `requiresDirectSampling` flips on.
//
// Keep this list in sync with WheelerDeWittAnimationDrawer's
// PHASE_SENSITIVE_COLOR_ALGORITHMS and with every emission.wgsl `case` that
// references the `phase` argument inside its WGSL body. Missing entries
// produce silent no-op renders that are indistinguishable from a broken
// shader; the drift between this list and the one in emission.wgsl is the
// exact failure mode the WdW comment warns about.
export const PHASE_COLOR_ALGS = [
  COLOR_ALGORITHM_TO_INT.phase,
  COLOR_ALGORITHM_TO_INT.mixed,
  COLOR_ALGORITHM_TO_INT.phaseCyclicUniform,
  COLOR_ALGORITHM_TO_INT.phaseDiverging,
  COLOR_ALGORITHM_TO_INT.domainColoringPsi,
  COLOR_ALGORITHM_TO_INT.diverging,
  COLOR_ALGORITHM_TO_INT.relativePhase,
  COLOR_ALGORITHM_TO_INT.phaseDensity,
] as const

/**
 * Generate the WGSL condition testing whether the current colorAlgorithm
 * is a phase-dependent mode requiring direct wavefunction sampling.
 */
function phaseAlgorithmCondition(uniformName: string): string {
  return PHASE_COLOR_ALGS.map((v) => `${uniformName}.colorAlgorithm == ${v}`).join(' ||\n    ')
}

/**
 * Shared options for raymarch call generation across volumetric and temporal paths.
 */
interface RaymarchCallOptions {
  useDensityGrid: boolean
  gridOnly: boolean
  /** Suppress safety fallback to inline when grid returns transparent (density matrix mode). */
  useDensityMatrix?: boolean
}

/**
 * Generate the WGSL raymarch dispatch logic — shared by volumetric and temporal paths.
 *
 * Decision tree:
 * 1. gridOnly → grid call only, no inline fallback compiled
 * 2. useDensityGrid → grid preferred, with inline fallback for phase-dependent modes
 *    and a safety fallback if grid returns transparent (unless density matrix mode)
 * 3. no grid → direct inline raymarch
 */
function generateRaymarchCall(opts: RaymarchCallOptions): string {
  const { useDensityGrid, gridOnly, useDensityMatrix = false } = opts

  if (gridOnly) {
    return `volumeResult = volumeRaymarchGrid(ro, rd, tNear, tFar, schroedinger);`
  }

  if (useDensityGrid) {
    return `let phaseDependentMode =
    ${phaseAlgorithmCondition('schroedinger')} ||
    (FEATURE_PHASE_MATERIALITY && schroedinger.phaseMaterialityEnabled != 0u) ||
    (FEATURE_INTERFERENCE && schroedinger.interferenceEnabled != 0u);

  let probabilityCurrentVolumeMode =
    FEATURE_PROBABILITY_CURRENT &&
    schroedinger.probabilityCurrentEnabled != 0u &&
    (
      schroedinger.probabilityCurrentPlacement == PROBABILITY_CURRENT_PLACEMENT_VOLUME ||
      (
        schroedinger.probabilityCurrentPlacement == PROBABILITY_CURRENT_PLACEMENT_ISOSURFACE &&
        schroedinger.isoEnabled == 0u
      )
    );

  let requiresDirectSampling =
    (phaseDependentMode && !DENSITY_GRID_HAS_PHASE) ||
    probabilityCurrentVolumeMode;

  if (requiresDirectSampling) {
    volumeResult = volumeRaymarch(ro, rd, tNear, tFar, schroedinger);
  } else {
    volumeResult = volumeRaymarchGrid(ro, rd, tNear, tFar, schroedinger);${
      useDensityMatrix
        ? `
    // No inline fallback in density matrix mode: the grid is the authoritative
    // density source (Tr(ρ|x⟩⟨x|)). Falling back to inline single-wavefunction
    // evaluation would produce incorrect density and a visible ring artifact.`
        : `
    // Safety fallback: if grid path yields a fully transparent sample,
    // re-evaluate with direct sampling to avoid blank frames.
    // This can happen when the density grid hasn't been populated yet
    // or when coordinate mapping produces out-of-range lookups.
    // Skip for free scalar: inline HO evaluation is wrong for lattice data.
    if (!IS_FREE_SCALAR && volumeResult.alpha < 0.01) {
      volumeResult = volumeRaymarch(ro, rd, tNear, tFar, schroedinger);
    }`
    }
  }`
  }

  return `volumeResult = volumeRaymarch(ro, rd, tNear, tFar, schroedinger);`
}

/**
 * Configuration for volumetric main block generation.
 */
export interface VolumetricMainBlockConfig {
  /** Use pre-computed density grid for faster raymarching */
  useDensityGrid?: boolean
  /** When true, the grid-only path is guaranteed — no inline wavefunction fallback needed. */
  gridOnly?: boolean
  /** Suppress inline pure-state fallback when the density grid encodes a mixed state. */
  useDensityMatrix?: boolean
}

/**
 * Generator function for volumetric main block.
 * Selects between volumeRaymarch() (fast) and volumeRaymarchHQ() (high quality).
 * @param config
 */
export function generateMainBlockVolumetric(config: VolumetricMainBlockConfig = {}): string {
  const { useDensityGrid = false, gridOnly = false, useDensityMatrix = false } = config

  // When gridOnly=true, the density grid handles ALL rendering — no inline
  // wavefunction fallback is compiled. This dramatically reduces the fragment
  // shader size (removes ~1000 lines of quantum math, inline density sampling,
  // tetrahedral gradient, and both volumeRaymarch/HQ functions), which avoids
  // a GPU occupancy cliff on Apple Silicon's Metal compiler (Safari WebGPU).
  const raymarchCall = generateRaymarchCall({ useDensityGrid, gridOnly, useDensityMatrix })

  return /* wgsl */ `
// ============================================
// Main Fragment Shader - Volumetric Mode
// ============================================

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // Ray setup: transform to model space
  // PERF: cameraPositionModel is CPU-precomputed as inverseModelMatrix * (cameraPosition, 1);
  // matches WebGL: ro = (uInverseModelMatrix * vec4(uCameraPosition, 1.0)).xyz
  let ro = camera.cameraPositionModel;

  // Compute ray direction per-pixel from interpolated world position
  // This matches WebGL: worldRayDir = normalize(vPosition - uCameraPosition)
  let worldRayDir = normalize(input.vPosition - camera.cameraPosition);
  let rd = normalize((camera.inverseModelMatrix * vec4f(worldRayDir, 0.0)).xyz);

  // Intersect with bounding volume (box for free scalar field, sphere otherwise)
  var tSphere: vec2f;
  if (IS_FREE_SCALAR) {
    tSphere = intersectBox(ro, rd, schroedinger.boundingRadius);
  } else {
    tSphere = intersectSphere(ro, rd, schroedinger.boundingRadius);
  }

  // No intersection with bounding volume
  if (tSphere.y < 0.0) {
    discard;
  }

  var tNear = max(0.0, tSphere.x);
  let tFar = tSphere.y;


  // Volumetric raymarching using functions from integration block
  var volumeResult: VolumeResult;

  ${raymarchCall}

  var finalColor = volumeResult.color;
  var finalAlpha = volumeResult.alpha;

  // True nodal-surface ray-hit mode: trace f=0 directly and composite as a crisp surface.
  if (
    finalAlpha >= 0.01 &&
    FEATURE_NODAL &&
    schroedinger.nodalEnabled != 0u &&
    schroedinger.nodalStrength > 0.0 &&
    activeNodalRenderMode(schroedinger) == NODAL_RENDER_MODE_SURFACE
  ) {
    let animTime = getVolumeTime(schroedinger);
    let surfaceStrengthT = clamp(schroedinger.nodalStrength * 0.5, 0.0, 1.0);
    let localSpan = max(
      (tFar - tNear) * mix(0.14, 0.26, surfaceStrengthT),
      mix(0.16, 0.36, surfaceStrengthT)
    );
    let localNear = max(tNear, volumeResult.primaryHitT - localSpan);
    let localFar = min(tFar, volumeResult.primaryHitT + localSpan);
    let nodalHit = findNodalSurfaceHit(ro, rd, localNear, localFar, animTime, schroedinger);
    if (nodalHit.hitMask > 0.0) {
      let nodalColor = selectPhysicalNodalColor(
        schroedinger,
        nodalHit.colorMode,
        nodalHit.signValue
      );
      let facing = max(dot(nodalHit.normal, -rd), 0.0);
      let surfaceLight = 0.35 + 0.65 * facing;
      let overlayColor = nodalColor * surfaceLight;
      let overlayAlpha = clamp(
        (0.45 + 0.55 * nodalHit.hitMask) * schroedinger.nodalStrength,
        0.0,
        0.95
      );
      finalColor = mix(finalColor, overlayColor, overlayAlpha);
      finalAlpha = max(finalAlpha, overlayAlpha);
    }
  }

  let crossSection = evaluateCrossSectionSample(
    ro,
    rd,
    tNear,
    tFar,
    getVolumeTime(schroedinger),
    schroedinger
  );
  if (crossSection.alpha > 0.0) {
    if (schroedinger.crossSectionCompositeMode == CROSS_SECTION_COMPOSITE_SLICE_ONLY) {
      finalColor = crossSection.color;
      finalAlpha = crossSection.alpha;
    } else {
      let crossSectionAlpha = clamp(crossSection.alpha, 0.0, 1.0);
      finalColor = mix(finalColor, crossSection.color, crossSectionAlpha);
      finalAlpha = max(finalAlpha, crossSectionAlpha);
    }
  } else if (
    schroedinger.crossSectionEnabled != 0u &&
    schroedinger.crossSectionCompositeMode == CROSS_SECTION_COMPOSITE_SLICE_ONLY
  ) {
    discard;
  }

  // Discard fully transparent pixels
  if (finalAlpha < 0.01) {
    discard;
  }

  // Note: Powder effect is applied inside computeEmissionLit() in emission.wgsl.ts
  // matching WebGL behavior (inside light loop, not post-process)

  return vec4f(finalColor, finalAlpha);
}
`
}

/**
 * Generator function for isosurface main block.
 */

// Re-export isosurface blocks from dedicated modules
export type { IsosurfaceMainBlockConfig } from './mainIsosurface.wgsl'
export { generateMainBlockIsosurface } from './mainIsosurface.wgsl'
export type { IsosurfaceTemporalMainBlockConfig } from './mainIsosurfaceTemporal.wgsl'
export { generateMainBlockIsosurfaceTemporal } from './mainIsosurfaceTemporal.wgsl'

/**
 *
 */
export interface TemporalMainBlockConfig {
  /** Enable Bayer jitter for quarter-res rendering */
  bayerJitter?: boolean
  /** Use pre-computed density grid for faster raymarching */
  useDensityGrid?: boolean
  /** Density matrix mode — disable inline wavefunction fallback */
  useDensityMatrix?: boolean
  /** When true, the grid-only path is guaranteed — no inline wavefunction fallback compiled. */
  gridOnly?: boolean
}

/**
 * MRT output struct for temporal volumetric rendering.
 * Outputs color + world position for reprojection.
 */
export const temporalMRTOutputBlock = /* wgsl */ `
// Temporal MRT output for volumetric rendering
struct TemporalFragmentOutput {
  @location(0) color: vec4f,       // RGB color + alpha
  @location(1) worldPosition: vec4f, // XYZ world position + ray distance in W
}
`

/**
 * Generator function for temporal volumetric main block.
 * Outputs MRT with color + world position for temporal accumulation.
 *
 * TEMPORAL ACCUMULATION ARCHITECTURE:
 * - Quarter-res rendering: Render target is 1/4 size (1/2 width × 1/2 height)
 * - Bayer jitter: Each frame samples a different sub-pixel within each 2×2 block
 * - Over 4 frames, all sub-pixels are covered for full resolution reconstruction
 *
 * The Bayer offset cycles: [0,0] → [1,1] → [1,0] → [0,1]
 * Each offset determines which sub-pixel position within the 2×2 block to sample.
 *
 * @param config
 */
export function generateMainBlockTemporal(config: TemporalMainBlockConfig = {}): string {
  const {
    bayerJitter = true,
    useDensityGrid = false,
    useDensityMatrix = false,
    gridOnly = false,
  } = config

  const bayerJitterSection = generateBayerJitterSection(bayerJitter)
  const rayDirSource = getRayDirSource(bayerJitter)

  const raymarchCall = generateRaymarchCall({ useDensityGrid, gridOnly, useDensityMatrix })

  return /* wgsl */ `
// ============================================
// Main Fragment Shader - Temporal Volumetric Mode
// ============================================
// Outputs MRT: color + world position for temporal accumulation
// Uses Bayer jitter for sub-pixel sampling across 4-frame cycles

@fragment
fn fragmentMain(input: VertexOutput) -> TemporalFragmentOutput {
  var output: TemporalFragmentOutput;
${bayerJitterSection}
  // Ray setup: transform to model space
  // PERF: cameraPositionModel is CPU-precomputed as inverseModelMatrix * (cameraPosition, 1);
  // matches WebGL: ro = (uInverseModelMatrix * vec4(uCameraPosition, 1.0)).xyz
  let ro = camera.cameraPositionModel;

  // Compute ray direction per-pixel from interpolated world position
  // In temporal mode, use jittered position for sub-pixel sampling
  // This matches WebGL's approach: screenCoord = floor(fragCoord) * 2 + bayerOffset + 0.5
  let worldRayDir = normalize(${rayDirSource} - camera.cameraPosition);
  let rd = normalize((camera.inverseModelMatrix * vec4f(worldRayDir, 0.0)).xyz);

  // Intersect with bounding volume (box for free scalar field, sphere otherwise)
  var tSphere: vec2f;
  if (IS_FREE_SCALAR) {
    tSphere = intersectBox(ro, rd, schroedinger.boundingRadius);
  } else {
    tSphere = intersectSphere(ro, rd, schroedinger.boundingRadius);
  }

  // No intersection with bounding volume
  if (tSphere.y < 0.0) {
    discard;
  }

  var tNear = max(0.0, tSphere.x);
  let tFar = tSphere.y;

  // Volumetric raymarching using functions from integration block
  var volumeResult: VolumeResult;

  ${raymarchCall}

  let crossSection = evaluateCrossSectionSample(
    ro,
    rd,
    tNear,
    tFar,
    getVolumeTime(schroedinger),
    schroedinger
  );

  var finalColor = volumeResult.color;
  var finalAlpha = volumeResult.alpha;
  var hitT = volumeResult.primaryHitT;

  // True nodal-surface ray-hit mode: trace f=0 directly and composite as a crisp surface.
  if (
    finalAlpha >= 0.01 &&
    FEATURE_NODAL &&
    schroedinger.nodalEnabled != 0u &&
    schroedinger.nodalStrength > 0.0 &&
    activeNodalRenderMode(schroedinger) == NODAL_RENDER_MODE_SURFACE
  ) {
    let animTime = getVolumeTime(schroedinger);
    let surfaceStrengthT = clamp(schroedinger.nodalStrength * 0.5, 0.0, 1.0);
    let localSpan = max(
      (tFar - tNear) * mix(0.14, 0.26, surfaceStrengthT),
      mix(0.16, 0.36, surfaceStrengthT)
    );
    let localNear = max(tNear, volumeResult.primaryHitT - localSpan);
    let localFar = min(tFar, volumeResult.primaryHitT + localSpan);
    let nodalHit = findNodalSurfaceHit(ro, rd, localNear, localFar, animTime, schroedinger);
    if (nodalHit.hitMask > 0.0) {
      let nodalColor = selectPhysicalNodalColor(
        schroedinger,
        nodalHit.colorMode,
        nodalHit.signValue
      );
      let facing = max(dot(nodalHit.normal, -rd), 0.0);
      let surfaceLight = 0.35 + 0.65 * facing;
      let overlayColor = nodalColor * surfaceLight;
      let overlayAlpha = clamp(
        (0.45 + 0.55 * nodalHit.hitMask) * schroedinger.nodalStrength,
        0.0,
        0.95
      );
      finalColor = mix(finalColor, overlayColor, overlayAlpha);
      finalAlpha = max(finalAlpha, overlayAlpha);
      hitT = nodalHit.t;
    }
  }

  if (crossSection.alpha > 0.0) {
    if (schroedinger.crossSectionCompositeMode == CROSS_SECTION_COMPOSITE_SLICE_ONLY) {
      finalColor = crossSection.color;
      finalAlpha = crossSection.alpha;
      hitT = crossSection.hitT;
    } else {
      let crossSectionAlpha = clamp(crossSection.alpha, 0.0, 1.0);
      finalColor = mix(finalColor, crossSection.color, crossSectionAlpha);
      finalAlpha = max(finalAlpha, crossSectionAlpha);
      if (hitT < 0.0) {
        hitT = crossSection.hitT;
      }
    }
  } else if (
    schroedinger.crossSectionEnabled != 0u &&
    schroedinger.crossSectionCompositeMode == CROSS_SECTION_COMPOSITE_SLICE_ONLY
  ) {
    discard;
  }

  // Discard fully transparent pixels
  if (finalAlpha < 0.01) {
    discard;
  }

  // Note: Powder effect is applied inside computeEmissionLit() in emission.wgsl.ts
  // matching WebGL behavior (inside light loop, not post-process)

  // Compute hit position for temporal reprojection
  if (hitT < 0.0) {
    hitT = (tNear + tFar) * 0.5;
  }
  let hitPosModel = ro + rd * hitT;

  // Transform hit position to world space for reprojection
  let hitPosWorld = (camera.modelMatrix * vec4f(hitPosModel, 1.0)).xyz;

  // Output color
  output.color = vec4f(finalColor, finalAlpha);

  // Output world position (xyz) and model-space ray distance (w) for reprojection
  // The ray distance in W is used for temporal depth optimization
  output.worldPosition = vec4f(hitPosWorld, hitT);

  return output;
}
`
}
