import { describe, expect, it } from 'vitest'

import {
  applyTransitionAbsorber,
  captureMatch,
  classifyCellBand,
  initColumnWkbStates,
  propagateWkbTail,
  wkbPhaseSinceTurning,
} from '@/lib/physics/wheelerDeWitt/columnWkb'
import { WDW_C_U, wdwEuclideanWkbAction, wdwTurningA } from '@/lib/physics/wheelerDeWitt/constants'
import {
  WDW_EUCLIDEAN_ABSORBER_ETA,
  WDW_WKB_MATCH_PHASE_THRESHOLD,
} from '@/lib/physics/wheelerDeWitt/solverConstants'
import { BandKind, type ColumnWkbState } from '@/lib/physics/wheelerDeWitt/solverTypes'

describe('Wheeler-DeWitt column WKB helpers', () => {
  it('computes zero phase before the turning surface and the closed-form phase after it', () => {
    expect(wkbPhaseSinceTurning(1.9, 2, 8)).toBe(0)
    expect(wkbPhaseSinceTurning(2, 2, 8)).toBe(0)
    expect(wkbPhaseSinceTurning(2.5, 2, -8)).toBe(0)
    expect(wkbPhaseSinceTurning(2.5, 2, NaN)).toBe(0)

    const observed = wkbPhaseSinceTurning(2.5, 2, 8)
    const expected = (2 / 3) * Math.sqrt(8) * Math.pow(0.5, 1.5)
    expect(observed).toBeCloseTo(expected, 12)
  })

  it('damps transition-band cells only in the Euclidean region', () => {
    const damped = applyTransitionAbsorber(3, -4, 9, 0.2)
    const factor = Math.exp(-WDW_EUCLIDEAN_ABSORBER_ETA * Math.sqrt(9) * 0.2)

    expect(damped.re).toBeCloseTo(3 * factor, 12)
    expect(damped.im).toBeCloseTo(-4 * factor, 12)
    expect(applyTransitionAbsorber(3, -4, 0, 0.2)).toEqual({ re: 3, im: -4 })
    expect(applyTransitionAbsorber(3, -4, -1, 0.2)).toEqual({ re: 3, im: -4 })
    expect(applyTransitionAbsorber(3, -4, NaN, 0.2)).toEqual({ re: 3, im: -4 })
    expect(applyTransitionAbsorber(3, -4, 9, NaN)).toEqual({ re: 3, im: -4 })
  })

  it('propagates a matched WKB tail by prefactor ratio and Euclidean action damping', () => {
    const state: ColumnWkbState = {
      aTurn: 1,
      alpha: 2,
      matched: true,
      sEucAtMatch: 1.25,
      uPrefactorAtMatch: 2,
      chiReAtMatch: 0.5,
      chiImAtMatch: -0.25,
    }

    const propagated = propagateWkbTail(state, 2.5, 16)
    const expectedScale = (2 / Math.pow(16, 0.25)) * Math.exp(-(2.5 - 1.25))

    expect(propagated.re).toBeCloseTo(0.5 * expectedScale, 12)
    expect(propagated.im).toBeCloseTo(-0.25 * expectedScale, 12)
    expect(propagateWkbTail(state, 99, 0)).toEqual({ re: 0.5, im: -0.25 })
    expect(propagateWkbTail(state, NaN, 16)).toEqual({ re: 0.5, im: -0.25 })
    expect(propagateWkbTail(state, 99, NaN)).toEqual({ re: 0.5, im: -0.25 })
  })

  it('initializes one WKB state per phi column with the analytic turning surface', () => {
    const states = initColumnWkbStates(3, 0.4, 0.25, 0.1)

    expect(states).toHaveLength(9)
    const center = states[4]!
    const expectedTurn = wdwTurningA(0, 0, 0.25, 0.1)
    expect(center.aTurn).toBeCloseTo(expectedTurn!, 12)
    expect(center.alpha).toBeCloseTo(2 * WDW_C_U * expectedTurn!, 12)
    expect(center.matched).toBe(false)
  })

  it('classifies Lorentzian, transition, and deep Euclidean cells by U and WKB phase', () => {
    const transitionState: ColumnWkbState = {
      aTurn: 1,
      alpha: 1,
      matched: false,
      sEucAtMatch: 0,
      uPrefactorAtMatch: 0,
      chiReAtMatch: 0,
      chiImAtMatch: 0,
    }

    expect(classifyCellBand(transitionState, 2, -0.01)).toBe(BandKind.Lorentzian)
    expect(classifyCellBand(transitionState, 2, NaN)).toBe(BandKind.Lorentzian)
    expect(classifyCellBand({ ...transitionState, aTurn: null, alpha: null }, 2, 1)).toBe(
      BandKind.EuclideanTransition
    )
    expect(classifyCellBand({ ...transitionState, alpha: NaN }, 3, 1)).toBe(
      BandKind.EuclideanTransition
    )

    const thresholdA = 1 + Math.pow((1.5 * WDW_WKB_MATCH_PHASE_THRESHOLD) / Math.sqrt(1), 2 / 3)
    expect(classifyCellBand(transitionState, thresholdA - 1e-6, 1)).toBe(
      BandKind.EuclideanTransition
    )
    expect(classifyCellBand(transitionState, thresholdA + 1e-6, 1)).toBe(BandKind.EuclideanDeep)
  })

  it('captures the match coefficient exactly once from the current cell state', () => {
    const state: ColumnWkbState = {
      aTurn: 1,
      alpha: 2,
      matched: false,
      sEucAtMatch: 0,
      uPrefactorAtMatch: 0,
      chiReAtMatch: 0,
      chiImAtMatch: 0,
    }

    captureMatch(state, 1.8, 0.1, -0.2, 0.5, 0.3, 1.2, 9, -2, 4)

    const first = {
      sEucAtMatch: state.sEucAtMatch,
      uPrefactorAtMatch: state.uPrefactorAtMatch,
      chiReAtMatch: state.chiReAtMatch,
      chiImAtMatch: state.chiImAtMatch,
    }

    captureMatch(state, 9.9, 1, 1, 1, 1, 1, 16, 123, 456)

    expect(state.matched).toBe(true)
    expect(first.sEucAtMatch).toBeCloseTo(wdwEuclideanWkbAction(1.8, 0.1, -0.2, 0.5, 0.3, 1.2))
    expect(first.uPrefactorAtMatch).toBeCloseTo(Math.pow(9, 0.25), 12)
    expect(first.chiReAtMatch).toBe(-2)
    expect(first.chiImAtMatch).toBe(4)
    expect(state.sEucAtMatch).toBe(first.sEucAtMatch)
    expect(state.uPrefactorAtMatch).toBe(first.uPrefactorAtMatch)
    expect(state.chiReAtMatch).toBe(first.chiReAtMatch)
    expect(state.chiImAtMatch).toBe(first.chiImAtMatch)
  })

  it('does not capture a deep-band match from non-finite inputs', () => {
    const state: ColumnWkbState = {
      aTurn: 1,
      alpha: 2,
      matched: false,
      sEucAtMatch: 0,
      uPrefactorAtMatch: 0,
      chiReAtMatch: 0,
      chiImAtMatch: 0,
    }

    captureMatch(state, 1.8, 0.1, -0.2, 0.5, 0.3, 1.2, NaN, 2, 3)
    expect(state.matched).toBe(false)

    captureMatch(state, 1.8, 0.1, -0.2, 0.5, 0.3, 1.2, 9, NaN, 3)
    expect(state.matched).toBe(false)
  })
})
