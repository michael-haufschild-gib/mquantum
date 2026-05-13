/**
 * Version tracking and dirty-flag helpers for the Schrodinger renderer.
 *
 * Consolidates the 12+ version-tracking properties into a single data bag
 * and provides pure check/update functions for each uniform category.
 *
 * @module rendering/webgpu/renderers/stateDiffing
 */

// ---------------------------------------------------------------------------
// Version tracker
// ---------------------------------------------------------------------------

/** Consolidates all dirty-flag version counters for uniform update skipping. */
export interface VersionTracker {
  // Schroedinger uniform buffer versions
  lastSchroedingerVersion: number
  lastSchroedingerAppearanceVersion: number
  lastSchroedingerPbrVersion: number
  lastPauliSpinorVersion: number
  lastSchroedingerQualitySignature: number

  // Lighting uniform buffer
  lastLightingVersion: number

  // Material (appearance + PBR stores)
  lastAppearanceVersion: number
  lastPbrVersion: number

  // Quality (signature-based)
  lastQualitySignature: number

  // Basis vectors
  lastBasisRotationVersion: number
  lastBasisSchroedingerVersion: number
  lastBasisDimension: number
  lastBasisAnimationTime: number
}

/** Create a fresh version tracker with all versions set to "needs full update". */
export function createVersionTracker(): VersionTracker {
  return {
    lastSchroedingerVersion: -1,
    lastSchroedingerAppearanceVersion: -1,
    lastSchroedingerPbrVersion: -1,
    lastPauliSpinorVersion: -1,
    lastSchroedingerQualitySignature: -1,
    lastLightingVersion: -1,
    lastAppearanceVersion: -1,
    lastPbrVersion: -1,
    lastQualitySignature: -1,
    lastBasisRotationVersion: -1,
    lastBasisSchroedingerVersion: -1,
    lastBasisDimension: -1,
    lastBasisAnimationTime: Number.NaN,
  }
}

/** Reset all version counters — forces full uniform writes on next frame. */
export function resetVersionTracker(tracker: VersionTracker): void {
  Object.assign(tracker, createVersionTracker())
}

// ---------------------------------------------------------------------------
// Schroedinger dirty check
// ---------------------------------------------------------------------------

/** Version counters for the Schroedinger uniform buffer dirty check. */
export interface SchroedingerVersions {
  schroedingerVersion: number
  appearanceVersion: number
  pbrVersion: number
  pauliSpinorVersion: number
  qualitySignature: number
}

/**
 * Check whether the Schroedinger uniform buffer needs a full rewrite.
 * Returns `false` when only the time field needs a partial update.
 */
export function isSchroedingerDirty(tracker: VersionTracker, v: SchroedingerVersions): boolean {
  // A fresh tracker starts at `lastSchroedingerVersion === -1`. Zustand
  // version counters start at 0, so a first-frame check with any real
  // incoming version already returns dirty via the first comparison
  // (`0 !== -1`). No explicit "fresh tracker" branch needed — the
  // `-1` sentinel is strictly less than every real version.
  return (
    v.schroedingerVersion !== tracker.lastSchroedingerVersion ||
    v.appearanceVersion !== tracker.lastSchroedingerAppearanceVersion ||
    v.pbrVersion !== tracker.lastSchroedingerPbrVersion ||
    v.pauliSpinorVersion !== tracker.lastPauliSpinorVersion ||
    v.qualitySignature !== tracker.lastSchroedingerQualitySignature
  )
}

/** Stamp the tracker after a full Schroedinger buffer write. */
export function updateSchroedingerVersions(tracker: VersionTracker, v: SchroedingerVersions): void {
  tracker.lastSchroedingerVersion = v.schroedingerVersion
  tracker.lastSchroedingerAppearanceVersion = v.appearanceVersion
  tracker.lastSchroedingerPbrVersion = v.pbrVersion
  tracker.lastPauliSpinorVersion = v.pauliSpinorVersion
  tracker.lastSchroedingerQualitySignature = v.qualitySignature
}

// ---------------------------------------------------------------------------
// Basis dirty check
// ---------------------------------------------------------------------------

/** Version counters for the basis uniform buffer dirty check. */
export interface BasisVersions {
  rotationVersion: number
  schroedingerVersion: number
  dimension: number
  accumulatedTime: number
  requiresTimeDrivenBasis: boolean
}

/**
 * Check whether the basis uniform buffer needs rewriting.
 * Static inputs (rotation, dimension, schroedinger version) use version comparison.
 * Time-driven basis (slice animation) additionally checks accumulated time delta.
 */
export function isBasisDirty(tracker: VersionTracker, v: BasisVersions): boolean {
  const staticUnchanged =
    v.rotationVersion === tracker.lastBasisRotationVersion &&
    v.schroedingerVersion === tracker.lastBasisSchroedingerVersion &&
    v.dimension === tracker.lastBasisDimension

  if (staticUnchanged) {
    if (!v.requiresTimeDrivenBasis) return false
    if (Math.abs(v.accumulatedTime - tracker.lastBasisAnimationTime) < 1e-6) return false
  }

  return true
}

/** Stamp the tracker after a basis buffer write. */
export function updateBasisVersions(tracker: VersionTracker, v: BasisVersions): void {
  tracker.lastBasisRotationVersion = v.rotationVersion
  tracker.lastBasisSchroedingerVersion = v.schroedingerVersion
  tracker.lastBasisDimension = v.dimension
  tracker.lastBasisAnimationTime = v.requiresTimeDrivenBasis ? v.accumulatedTime : Number.NaN
}
