/**
 * Per-column Stage-2 WKB state for the Wheeler–DeWitt solver.
 *
 * Tracks the analytic turning surface `a_turn(φ)`, the Airy prefactor
 * `α = ∂_a U|_{a_turn}`, and the per-column match coefficient that
 * connects the explicit-leapfrog transition band to the analytic
 * deep-band propagator. See `./solver` module docstring for the
 * Stage-2 physics; this file is a pure refactor of internal helpers
 * with no behaviour change.
 *
 * @module lib/physics/wheelerDeWitt/columnWkb
 */

import { WDW_C_U, wdwEuclideanWkbAction, wdwTurningA } from './constants'
import { WDW_EUCLIDEAN_ABSORBER_ETA, WDW_WKB_MATCH_PHASE_THRESHOLD } from './solverConstants'
import { BandKind, type ColumnWkbState, type ComplexPair } from './solverTypes'

/**
 * Compute the dimensionless WKB phase since the turning surface at a
 * given `a`, used to classify cells as transition-band vs deep-band.
 */
export function wkbPhaseSinceTurning(a: number, aTurn: number, alpha: number): number {
  const da = a - aTurn
  if (da <= 0) return 0
  return (2 / 3) * Math.sqrt(alpha) * Math.pow(da, 1.5)
}

/**
 * Apply the soft Euclidean absorber multiplicatively to a complex pair
 * when `U > 0`. Returns the damped pair unchanged in the Lorentzian
 * region, so callers can apply unconditionally inside the transition
 * band. Deep-band cells bypass this entirely (they are overwritten by
 * the analytic WKB propagator).
 */
export function applyTransitionAbsorber(
  nextRe: number,
  nextIm: number,
  U: number,
  da: number
): ComplexPair {
  if (U > 0) {
    const damp = Math.exp(-WDW_EUCLIDEAN_ABSORBER_ETA * Math.sqrt(U) * da)
    return { re: nextRe * damp, im: nextIm * damp }
  }
  return { re: nextRe, im: nextIm }
}

/**
 * Overwrite a cell's χ value with the analytic 1D WKB propagator from
 * the captured match coefficient.
 *
 *   χ(a) = χ_match · (U_match / U(a))^{1/4} · exp(−(S(a) − S_match))
 */
export function propagateWkbTail(state: ColumnWkbState, S: number, U: number): ComplexPair {
  const uPrefactorAtA = Math.pow(Math.abs(U), 0.25)
  if (uPrefactorAtA === 0) {
    return { re: state.chiReAtMatch, im: state.chiImAtMatch }
  }
  const prefactorRatio = state.uPrefactorAtMatch / uPrefactorAtA
  const damp = Math.exp(-(S - state.sEucAtMatch))
  return {
    re: state.chiReAtMatch * prefactorRatio * damp,
    im: state.chiImAtMatch * prefactorRatio * damp,
  }
}

/**
 * Allocate the per-column Stage-2 state array for a given φ-grid at
 * fixed `(m, Λ)`.
 */
export function initColumnWkbStates(
  Nphi: number,
  phiExtent: number,
  m: number,
  lambda: number,
  asymmetry: number = 1
): ColumnWkbState[] {
  const states: ColumnWkbState[] = new Array(Nphi * Nphi)
  const dphi = Nphi > 1 ? (2 * phiExtent) / (Nphi - 1) : 0
  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = -phiExtent + i1 * dphi
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = -phiExtent + i2 * dphi
      const aTurn = wdwTurningA(phi1, phi2, m, lambda, asymmetry)
      const alpha = aTurn !== null ? 2 * WDW_C_U * aTurn : null
      states[i1 * Nphi + i2] = {
        aTurn,
        alpha,
        matched: false,
        sEucAtMatch: 0,
        uPrefactorAtMatch: 0,
        chiReAtMatch: 0,
        chiImAtMatch: 0,
      }
    }
  }
  return states
}

/**
 * Classify a single cell's band without mutating state. Pure read.
 * Wrapped as a named function so the call-site inside the leapfrog loop
 * reads cleanly.
 */
export function classifyCellBand(state: ColumnWkbState, a: number, U: number): BandKind {
  if (U <= 0) return BandKind.Lorentzian
  if (state.aTurn === null || state.alpha === null) return BandKind.EuclideanTransition
  const phase = wkbPhaseSinceTurning(a, state.aTurn, state.alpha)
  if (phase < WDW_WKB_MATCH_PHASE_THRESHOLD) return BandKind.EuclideanTransition
  return BandKind.EuclideanDeep
}

/**
 * Freeze the per-column match coefficient. Called exactly once per
 * column (guarded by `state.matched`), on the first deep-band slab. The
 * captured χ is written to the output grid unchanged; all deeper slabs
 * receive the analytic propagator output computed from this match.
 */
export function captureMatch(
  state: ColumnWkbState,
  a: number,
  phi1: number,
  phi2: number,
  m: number,
  lambda: number,
  asymmetry: number,
  U: number,
  chiRe: number,
  chiIm: number
): void {
  if (state.matched) return
  state.matched = true
  state.sEucAtMatch = wdwEuclideanWkbAction(a, phi1, phi2, m, lambda, asymmetry)
  state.uPrefactorAtMatch = Math.pow(Math.abs(U), 0.25)
  state.chiReAtMatch = chiRe
  state.chiImAtMatch = chiIm
}
