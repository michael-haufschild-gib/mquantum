/**
 * Classical-turning-point landmark for SRMT sweep plots.
 *
 * The SRMT conjecture predicts that the scale-factor clock `a` tracks
 * the Hamilton-Jacobi generator only in the classically-allowed region
 * (`U < 0`); past the turning point `a_TP` where `U = 0`, the modular
 * spectrum degenerates away from the HJ spectrum. This module computes
 * the turning-point coordinate in the sweep-axis units so the UI can
 * overlay a vertical reference line on the sweep plot.
 *
 * Three geometries are supported, keyed by the swept clock:
 *
 *  - Clock `'a'` — sweep axis is `srmtCutNormalized`; landmark is
 *    `a_TP(phiRef, m, Λ)` mapped to normalised cut space via
 *    `cut = (a − aMin) / (aMax − aMin)`.
 *  - Clocks `'phi1'` / `'phi2'` — sweep axis is `srmtCutNormalized` on
 *    the φ-axis; the landmark is the φ value where the turning surface
 *    crosses the current `a` slice, i.e. the φ satisfying
 *    `V(φ) = 1 / (K · a_slice²)`. For `V(φ) = ½m²|φ|² + Λ` this has
 *    closed form `|φ_TP| = √((2/m²) · (1/(K · a_slice²) − Λ))` when the
 *    argument is positive.
 *
 * `null` is returned when no real turning point exists (e.g. `V(φ) ≤ 0`
 * for clock `'a'`, or when the cut anchor places the slice outside the
 * Euclidean-crossing range for φ-clocks).
 *
 * Pure functions — no store access, no side effects.
 *
 * @module lib/physics/srmt/turningPointLandmark
 */

import type { WheelerDeWittConfig } from '@/lib/geometry/extended/wheelerDeWitt'
import { WDW_G_PREFACTOR, wdwPotential, wdwTurningA } from '@/lib/physics/wheelerDeWitt/constants'

import type { SrmtSweepLandmark } from './sweepTypes'
import type { SrmtClock } from './types'

/**
 * Inputs that anchor the landmark. Separated from
 * {@link WheelerDeWittConfig} so tests can construct minimal fixtures.
 */
export interface TurningPointLandmarkInputs {
  /** Swept clock — selects which geometry/formula to apply. */
  clock: SrmtClock
  /** Inflaton mass `m`. */
  inflatonMass: number
  /** Cosmological constant `Λ`. */
  cosmologicalConstant: number
  /** Grid scale-factor lower bound. */
  aMin: number
  /** Grid scale-factor upper bound. */
  aMax: number
  /** Half-range of the φ grid, `phi ∈ [-phiExtent, +phiExtent]`. */
  phiExtent: number
  /**
   * Reference φ used in the clock=`'a'` landmark. Required because
   * `V(0) = 0` when `Λ = 0`, which leaves no turning surface; callers
   * pick a non-zero reference to probe the potential.
   */
  phiRef: number
  /**
   * Anchor cut position `∈ [0, 1]`. Used only by φ-clocks to fix the
   * `a_slice` at which the turning-surface intersection is measured.
   * For clock `'a'` it is ignored.
   */
  cutNormalized: number
}

/**
 * Convert a {@link WheelerDeWittConfig} + clock/phiRef/cut into the
 * landmark-inputs shape. Convenience helper for UI callers.
 */
export function landmarkInputsFromConfig(
  config: WheelerDeWittConfig,
  clock: SrmtClock,
  phiRef: number,
  cutNormalized: number
): TurningPointLandmarkInputs {
  return {
    clock,
    inflatonMass: config.inflatonMass,
    cosmologicalConstant: config.cosmologicalConstant,
    aMin: config.aMin,
    aMax: config.aMax,
    phiExtent: config.phiExtent,
    phiRef,
    cutNormalized,
  }
}

/** Clamp `x` into `[lo, hi]`. */
function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

/**
 * Compute the turning-point landmark for a sweep whose horizontal axis
 * is `srmtCutNormalized`. Returns a landmark whose
 * `sweepValueAtLandmark` is the normalised coordinate (`∈ [0, 1]`) or
 * `null` when the turning surface is not reached within the swept
 * range.
 */
export function computeCutLandmark(inputs: TurningPointLandmarkInputs): SrmtSweepLandmark {
  const {
    clock,
    inflatonMass,
    cosmologicalConstant,
    aMin,
    aMax,
    phiExtent,
    phiRef,
    cutNormalized,
  } = inputs

  if (clock === 'a') {
    const aTp = wdwTurningA(phiRef, phiRef, inflatonMass, cosmologicalConstant)
    if (aTp === null) {
      return {
        kind: 'a_turn',
        clock,
        phiRef,
        sweepValueAtLandmark: null,
        absoluteCoordinate: null,
      }
    }
    const span = aMax - aMin
    if (span <= 0) {
      return {
        kind: 'a_turn',
        clock,
        phiRef,
        sweepValueAtLandmark: null,
        absoluteCoordinate: aTp,
      }
    }
    const normalised = (aTp - aMin) / span
    // Outside the swept `a` range → still return the absolute coordinate
    // for UI annotation, but null out the plottable position so the
    // vertical-line renderer skips it.
    const inRange = normalised >= 0 && normalised <= 1
    return {
      kind: 'a_turn',
      clock,
      phiRef,
      sweepValueAtLandmark: inRange ? clamp(normalised, 0, 1) : null,
      absoluteCoordinate: aTp,
    }
  }

  // φ-clocks: landmark is the φ at which the turning surface crosses
  // the anchor `a_slice`. V(φ) = ½ m² φ² + Λ (assuming the other φ is
  // set to the same reference so the radial potential reduces to 1D).
  const aSlice = aMin + cutNormalized * (aMax - aMin)
  if (!(aSlice > 0)) {
    return {
      kind: 'phi_turn',
      clock,
      phiRef,
      sweepValueAtLandmark: null,
      absoluteCoordinate: null,
    }
  }
  const targetV = 1 / (WDW_G_PREFACTOR * aSlice * aSlice)
  // V(phi) = ½m²|phi|² + Λ (evaluated at phi1=phi2=phi_TP so the
  // isotropic inflaton gives V = m²|phi|² + Λ — factor of 2 in the sum).
  // For the visible clock (phi1 or phi2) the *other* axis is held at
  // `phiRef`, so V(phi_TP, phiRef) = ½m²(phi_TP² + phiRef²) + Λ.
  const refV = wdwPotential(phiRef, phiRef, inflatonMass, cosmologicalConstant)
  if (!Number.isFinite(refV)) {
    return {
      kind: 'phi_turn',
      clock,
      phiRef,
      sweepValueAtLandmark: null,
      absoluteCoordinate: null,
    }
  }
  const mSq = inflatonMass * inflatonMass
  if (mSq <= 0) {
    // V is constant in φ → no φ-dependent turning surface.
    return {
      kind: 'phi_turn',
      clock,
      phiRef,
      sweepValueAtLandmark: null,
      absoluteCoordinate: null,
    }
  }
  // Solve ½ m² (phi_TP² + phiRef²) + Λ = targetV
  //   ⇒ phi_TP² = (2 / m²) · (targetV − Λ) − phiRef²
  const rhs = (2 / mSq) * (targetV - cosmologicalConstant) - phiRef * phiRef
  if (!(rhs > 0)) {
    return {
      kind: 'phi_turn',
      clock,
      phiRef,
      sweepValueAtLandmark: null,
      absoluteCoordinate: null,
    }
  }
  const phiTp = Math.sqrt(rhs)
  // Sweep axis is `srmtCutNormalized` on the φ-clock; cut=0 → phi=-phiExtent,
  // cut=1 → phi=+phiExtent. Map φ_TP (positive branch) to normalised.
  if (phiExtent <= 0) {
    return {
      kind: 'phi_turn',
      clock,
      phiRef,
      sweepValueAtLandmark: null,
      absoluteCoordinate: phiTp,
    }
  }
  const normalised = 0.5 + phiTp / (2 * phiExtent)
  const inRange = normalised >= 0 && normalised <= 1
  return {
    kind: 'phi_turn',
    clock,
    phiRef,
    sweepValueAtLandmark: inRange ? clamp(normalised, 0, 1) : null,
    absoluteCoordinate: phiTp,
  }
}
