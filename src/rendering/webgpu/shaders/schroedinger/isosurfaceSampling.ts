/**
 * Isosurface Density Sampling Helpers
 *
 * Shared TypeScript generators for conditional WGSL density sampling blocks
 * used by both mainIsosurface.wgsl.ts and mainIsosurfaceTemporal.wgsl.ts.
 *
 * Each function returns a WGSL code snippet that either samples from the
 * pre-computed density grid (when useDensityGrid=true) or evaluates inline
 * (when false), with appropriate uncertainty boundary emphasis handling.
 *
 * @module rendering/webgpu/shaders/schroedinger/isosurfaceSampling
 */

/**
 * Generate the march-loop density sample block.
 *
 * Reads `pos` (vec3f) and writes `rho` (f32, already multiplied by isoGain).
 *
 * @param useDensityGrid - When true, samples from the density grid with dual-channel and UB support
 */
export function generateDensitySample(useDensityGrid: boolean): string {
  if (useDensityGrid) {
    return `if (USE_DENSITY_GRID) {
      let gridVal = sampleDensityFromGrid(pos, schroedinger);
      rho = select(gridVal.r, gridVal.r + gridVal.g, IS_DUAL_CHANNEL);
      if (FEATURE_UNCERTAINTY_BOUNDARY && !IS_DUAL_CHANNEL) { rho = applyUncertaintyBoundaryEmphasis(rho, sFromRho(rho), schroedinger); }
      rho *= isoGain;
    } else {
      rho = sampleDensity(pos, animTime, schroedinger) * isoGain;
    }`
  }
  return `rho = sampleDensity(pos, animTime, schroedinger) * isoGain;`
}

/**
 * Generate the seed sample block for adaptive ray marching.
 *
 * Reads `ro`, `rd`, `tNear` and produces `prevS` (f32) — the initial
 * log-density directional derivative seed.
 *
 * @param useDensityGrid - When true, seeds from the density grid
 */
export function generateSeedSample(useDensityGrid: boolean): string {
  if (useDensityGrid) {
    return `var seedRho: f32;
  if (USE_DENSITY_GRID) {
    let seedGrid = sampleDensityFromGrid(ro + rd * tNear, schroedinger);
    seedRho = select(seedGrid.r, seedGrid.r + seedGrid.g, IS_DUAL_CHANNEL);
    if (FEATURE_UNCERTAINTY_BOUNDARY && !IS_DUAL_CHANNEL) { seedRho = applyUncertaintyBoundaryEmphasis(seedRho, sFromRho(seedRho), schroedinger); }
    seedRho *= isoGain;
  } else {
    seedRho = sampleDensity(ro + rd * tNear, animTime, schroedinger) * isoGain;
  }
  var prevS = sFromRho(seedRho);`
  }
  return `var prevS = sFromRho(sampleDensity(ro + rd * tNear, animTime, schroedinger) * isoGain);`
}

/**
 * Generate the binary search refinement sample block.
 *
 * Reads `midPos` (vec3f) and produces `midS` (f32) — the log-density at
 * the bisection midpoint.
 *
 * @param useDensityGrid - When true, samples from the density grid
 */
export function generateBinarySearchSample(useDensityGrid: boolean): string {
  if (useDensityGrid) {
    return `var midRho: f32;
        if (USE_DENSITY_GRID) {
          let midGrid = sampleDensityFromGrid(midPos, schroedinger);
          midRho = select(midGrid.r, midGrid.r + midGrid.g, IS_DUAL_CHANNEL);
          if (FEATURE_UNCERTAINTY_BOUNDARY && !IS_DUAL_CHANNEL) { midRho = applyUncertaintyBoundaryEmphasis(midRho, sFromRho(midRho), schroedinger); }
          midRho *= isoGain;
        } else {
          midRho = sampleDensity(midPos, animTime, schroedinger) * isoGain;
        }
        let midS = sFromRho(midRho);`
  }
  return `let midS = sFromRho(sampleDensity(midPos, animTime, schroedinger) * isoGain);`
}

/**
 * Generate the gradient computation block.
 *
 * Reads `p` (vec3f) and writes `rawGrad` (vec3f) — the density gradient
 * at the isosurface hit point.
 *
 * @param useDensityGrid - When true, prefers grid gradient with analytical/tetrahedral fallback
 */
export function generateGradientCompute(useDensityGrid: boolean): string {
  if (useDensityGrid) {
    return `if (USE_DENSITY_GRID) {
    rawGrad = computeGradientFromGrid(p, schroedinger);
  } else if (USE_ANALYTICAL_GRADIENT) {
    rawGrad = computeAnalyticalGradient(p, animTime, schroedinger);
  } else {
    rawGrad = computeGradientTetrahedral(p, animTime, schroedinger.boundingRadius * 0.005, schroedinger);
  }`
  }
  return `if (USE_ANALYTICAL_GRADIENT) {
    rawGrad = computeAnalyticalGradient(p, animTime, schroedinger);
  } else {
    rawGrad = computeGradientTetrahedral(p, animTime, schroedinger.boundingRadius * 0.005, schroedinger);
  }`
}

/**
 * Generate the surface color sampling block.
 *
 * Reads `p` (vec3f) and produces `rhoSurface`, `dualSecondary`, `phase` (all f32)
 * for isosurface coloring.
 *
 * @param useDensityGrid - When true, samples color from grid with phase channel support
 */
export function generateColorSample(useDensityGrid: boolean): string {
  if (useDensityGrid) {
    return `var rhoSurface: f32;
  var dualSecondary: f32 = 0.0;
  var phase: f32;
  if (USE_DENSITY_GRID && DENSITY_GRID_HAS_PHASE) {
    let gridColor = sampleDensityFromGrid(p, schroedinger);
    rhoSurface = gridColor.r * isoGain;
    if (IS_DUAL_CHANNEL) {
      dualSecondary = gridColor.g;
    }
    phase = select(gridColor.b, gridColor.a, COLOR_ALGORITHM == 10);
  } else {
    let densityInfo = sampleDensityWithPhase(p, animTime, schroedinger);
    rhoSurface = densityInfo.x * isoGain;
    phase = densityInfo.z;
  }`
  }
  return `let densityInfo = sampleDensityWithPhase(p, animTime, schroedinger);
  let rhoSurface = densityInfo.x * isoGain;
  let phase = densityInfo.z;
  let dualSecondary: f32 = 0.0;`
}
