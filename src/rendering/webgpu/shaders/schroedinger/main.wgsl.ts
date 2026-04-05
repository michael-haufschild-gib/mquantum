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
 * - quality: QualityUniforms (Group 1, Binding 2)
 * - schroedinger: SchroedingerUniforms (Group 2, Binding 0)
 * - basis: BasisVectors (Group 2, Binding 1)
 *
 * @module rendering/webgpu/shaders/schroedinger/main.wgsl
 */

import { COLOR_ALGORITHM_TO_INT } from '@/rendering/shaders/palette/types'

// Phase-dependent color algorithms that require direct wavefunction sampling
// (cannot use pre-computed density grid because they need complex phase information).
export const PHASE_COLOR_ALGS = [
  COLOR_ALGORITHM_TO_INT.phase,
  COLOR_ALGORITHM_TO_INT.mixed,
  COLOR_ALGORITHM_TO_INT.phaseCyclicUniform,
  COLOR_ALGORITHM_TO_INT.phaseDiverging,
  COLOR_ALGORITHM_TO_INT.domainColoringPsi,
  COLOR_ALGORITHM_TO_INT.diverging,
  COLOR_ALGORITHM_TO_INT.relativePhase,
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
 * 3. no grid → direct inline fast/HQ toggle
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
    if (fastMode) {
      volumeResult = volumeRaymarch(ro, rd, tNear, tFar, schroedinger);
    } else {
      volumeResult = volumeRaymarchHQ(ro, rd, tNear, tFar, schroedinger);
    }
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
      if (fastMode) {
        volumeResult = volumeRaymarch(ro, rd, tNear, tFar, schroedinger);
      } else {
        volumeResult = volumeRaymarchHQ(ro, rd, tNear, tFar, schroedinger);
      }
    }`
    }
  }`
  }

  return `if (fastMode) {
    volumeResult = volumeRaymarch(ro, rd, tNear, tFar, schroedinger);
  } else {
    volumeResult = volumeRaymarchHQ(ro, rd, tNear, tFar, schroedinger);
  }`
}

/**
 * Configuration for volumetric main block generation.
 */
export interface VolumetricMainBlockConfig {
  /** Use pre-computed density grid for faster raymarching */
  useDensityGrid?: boolean
  /** When true, the grid-only path is guaranteed — no inline wavefunction fallback needed. */
  gridOnly?: boolean
}

/**
 * Generator function for volumetric main block.
 * Selects between volumeRaymarch() (fast) and volumeRaymarchHQ() (high quality).
 * @param config
 */
export function generateMainBlockVolumetric(config: VolumetricMainBlockConfig = {}): string {
  const { useDensityGrid = false, gridOnly = false } = config

  // When gridOnly=true, the density grid handles ALL rendering — no inline
  // wavefunction fallback is compiled. This dramatically reduces the fragment
  // shader size (removes ~1000 lines of quantum math, inline density sampling,
  // tetrahedral gradient, and both volumeRaymarch/HQ functions), which avoids
  // a GPU occupancy cliff on Apple Silicon's Metal compiler (Safari WebGPU).
  const raymarchCall = generateRaymarchCall({ useDensityGrid, gridOnly })

  return /* wgsl */ `
// ============================================
// Main Fragment Shader - Volumetric Mode
// ============================================

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // Ray setup: transform to model space
  // This matches WebGL: ro = (uInverseModelMatrix * vec4(uCameraPosition, 1.0)).xyz
  let ro = (camera.inverseModelMatrix * vec4f(camera.cameraPosition, 1.0)).xyz;

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
  // Fast mode selection based on quality multiplier
  var volumeResult: VolumeResult;

  // Use quality multiplier < 1.0 as "fast mode" indicator
  let fastMode = quality.qualityMultiplier < 0.75;

  ${raymarchCall}

  var finalColor = volumeResult.color;
  var finalAlpha = volumeResult.alpha;

  // True nodal-surface ray-hit mode: trace f=0 directly and composite as a crisp surface.
  if (
    FEATURE_NODAL &&
    schroedinger.nodalEnabled != 0u &&
    schroedinger.nodalStrength > 0.0 &&
    schroedinger.nodalRenderMode == NODAL_RENDER_MODE_SURFACE
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

  // Bayer jitter section - applies sub-pixel offset for quarter-res rendering
  // NOTE: Unlike the incorrect previous implementation that DISCARDED pixels,
  // this correctly JITTERS the ray direction to sample different sub-pixels.
  // ALL quarter-res pixels render - no discard based on Bayer pattern!
  const bayerJitterSection = bayerJitter
    ? `
  // ============================================
  // Temporal Sub-Pixel Jitter
  // ============================================
  // In quarter-res mode, each pixel covers a 2×2 block of full-res pixels.
  // The Bayer offset determines which sub-pixel within the block we sample.
  // Over 4 frames (with cycling offsets), all sub-pixels are covered.
  //
  // NO DISCARD HERE! All quarter-res pixels must render for proper accumulation.
  // The jitter offsets the ray direction to sample different sub-pixel positions.

  // Compute jitter offset from Bayer pattern
  // bayerOffset is in [0,1], convert to [-0.5, 0.5] for symmetric jitter
  let jitterOffset = camera.bayerOffset - vec2f(0.5);

  // Compute per-pixel view direction and distance
  let viewDir = normalize(input.vPosition - camera.cameraPosition);
  let dist = length(input.vPosition - camera.cameraPosition);

  // Compute world-space pixel sizes at this depth (perspective projection)
  // Note: camera.fov is in radians.
  let pixelSizeY = 2.0 * dist * tan(camera.fov * 0.5) / camera.resolution.y;
  let pixelSizeX = 2.0 * dist * tan(camera.fov * 0.5) * camera.aspectRatio /
                   camera.resolution.x;

  // Use camera basis vectors (stable screen-space axes) for jitter.
  // This avoids per-pixel basis flips that can cause visible seam artifacts.
  let cameraRight = normalize(camera.inverseViewMatrix[0].xyz);
  let cameraUp = normalize(camera.inverseViewMatrix[1].xyz);

  // Apply sub-pixel offset in world space.
  // jitterOffset is in full-pixel units [-0.5, 0.5].
  // NOTE: Screen-space Y grows downward (texture coordinates), while cameraUp
  // points upward in world space, so Y must be inverted to match reconstruction.
  let worldOffset = cameraRight * (jitterOffset.x * pixelSizeX) -
                    cameraUp * (jitterOffset.y * pixelSizeY);
  let jitteredVPosition = input.vPosition + worldOffset;
`
    : ''

  // When jitter is applied, use jitteredVPosition for ray direction
  const rayDirSource = bayerJitter ? 'jitteredVPosition' : 'input.vPosition'

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
  // This matches WebGL: ro = (uInverseModelMatrix * vec4(uCameraPosition, 1.0)).xyz
  let ro = (camera.inverseModelMatrix * vec4f(camera.cameraPosition, 1.0)).xyz;

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
  // Fast mode selection based on quality multiplier
  var volumeResult: VolumeResult;

  // Use quality multiplier < 1.0 as "fast mode" indicator
  let fastMode = quality.qualityMultiplier < 0.75;

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
    FEATURE_NODAL &&
    schroedinger.nodalEnabled != 0u &&
    schroedinger.nodalStrength > 0.0 &&
    schroedinger.nodalRenderMode == NODAL_RENDER_MODE_SURFACE
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
