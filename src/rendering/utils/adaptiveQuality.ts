/**
 * Adaptive quality utilities for raymarching renderers.
 * Reduces quality when objects fill the viewport (fill-rate bound scenarios).
 *
 * Used by MandelbulbMesh, QuaternionJuliaMesh, and SchroedingerMesh to prevent
 * framerate drops when zoomed in close to the object surface.
 */

import * as THREE from 'three'

/** Bounding sphere radius used by all raymarching objects */
const BOUND_R = 2.0

/** Screen coverage threshold above which quality reduction begins */
const COVERAGE_THRESHOLD = 0.5

/** Maximum quality reduction factor (60% reduction at full coverage) */
const MAX_REDUCTION = 0.6

/**
 * Calculate screen coverage ratio for an object.
 *
 * @param camera - The perspective camera
 * @param objectRadius - Optional custom radius (defaults to BOUND_R = 2.0)
 * @returns Screen coverage ratio (0 = tiny, 1 = fills screen, >1 = larger than screen)
 */
export function getScreenCoverage(camera: THREE.PerspectiveCamera, objectRadius?: number): number {
  const cameraDistance = camera.position.length()
  if (cameraDistance < 0.01) return 1.0

  const fovRad = (camera.fov * Math.PI) / 180
  const halfFovTan = Math.tan(fovRad / 2)
  const radius = objectRadius ?? BOUND_R
  const projectedSize = radius / cameraDistance

  return projectedSize / halfFovTan
}

/**
 * Apply screen coverage reduction to a quality value.
 * When object fills 50%+ of screen, progressively reduces quality.
 *
 * @param baseValue - Base quality value (samples or multiplier)
 * @param screenCoverage - Screen coverage ratio from getScreenCoverage()
 * @returns Adjusted quality value
 */
export function applyScreenCoverageReduction(baseValue: number, screenCoverage: number): number {
  if (screenCoverage <= COVERAGE_THRESHOLD) {
    return baseValue
  }

  const coverageReduction =
    1.0 - Math.min((screenCoverage - COVERAGE_THRESHOLD) * 0.8, MAX_REDUCTION)
  return baseValue * coverageReduction
}

/**
 * Get effective quality multiplier for SDF raymarching (Mandelbulb/Julia).
 * Applies screen coverage reduction and enforces minimum of 0.25.
 *
 * @param baseMultiplier - Base quality multiplier from RAYMARCH_QUALITY_TO_MULTIPLIER
 * @param camera - The perspective camera
 * @param globalMultiplier - Optional global quality multiplier from performance store
 * @returns Effective quality multiplier (0.25-1.0)
 */
export function getEffectiveSdfQuality(
  baseMultiplier: number,
  camera: THREE.PerspectiveCamera,
  globalMultiplier: number = 1.0
): number {
  const coverage = getScreenCoverage(camera)
  let effective = applyScreenCoverageReduction(baseMultiplier, coverage)
  effective *= globalMultiplier
  return Math.max(effective, 0.25)
}

/**
 * Get effective sample count for volumetric raymarching (Schrodinger).
 * Applies screen coverage reduction and enforces minimum of 16 samples.
 *
 * @param baseSamples - Base sample count from RAYMARCH_QUALITY_TO_SAMPLES
 * @param camera - The perspective camera
 * @param globalMultiplier - Optional global quality multiplier from performance store
 * @returns Effective sample count (integer, minimum 16)
 */
export function getEffectiveVolumeSamples(
  baseSamples: number,
  camera: THREE.PerspectiveCamera,
  globalMultiplier: number = 1.0
): number {
  const coverage = getScreenCoverage(camera)
  let effective = applyScreenCoverageReduction(baseSamples, coverage)
  effective *= globalMultiplier
  return Math.max(Math.floor(effective), 16)
}
