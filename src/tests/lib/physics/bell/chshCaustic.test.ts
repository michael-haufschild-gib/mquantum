import { describe, expect, it } from 'vitest'

import { type BellPairAxis, createDefaultBellPairConfig } from '@/lib/geometry/extended/bellPair'
import { TSIRELSON_BOUND, WERNER_VIOLATION_THRESHOLD } from '@/lib/physics/bell/analytic'
import {
  applyChshCausticToDensity,
  CHSH_CAUSTIC_LIMITS,
  computeWernerChsh,
  evaluateChshCaustic,
  sanitizeChshCausticControls,
} from '@/lib/physics/bell/chshCaustic'

function invertAxis(axis: BellPairAxis): BellPairAxis {
  return [Math.PI - axis[0], axis[1] + Math.PI]
}

function expectFiniteNumbers(values: readonly number[]): void {
  for (const value of values) {
    expect(Number.isFinite(value)).toBe(true)
  }
}

describe('CHSH caustic CPU reference', () => {
  it('returns identity density when disabled', () => {
    const cfg = createDefaultBellPairConfig()
    const base = { r: 0.12, g: 0.23, b: 0.34, a: 0.45 }
    const out = applyChshCausticToDensity(base, {
      ...cfg,
      chshCausticEnabled: false,
      chshCausticStrength: 4,
      chshCausticFoldScale: 24,
      chshCausticPhase: Math.PI,
      point: [0.15, -0.2, 0.05],
    })
    expect(out).toEqual(base)
  })

  it('clamps finite controls and replaces non-finite controls with finite defaults', () => {
    const clamped = sanitizeChshCausticControls({
      chshCausticEnabled: true,
      chshCausticStrength: 99,
      chshCausticFoldScale: -1,
      chshCausticPhase: 99,
    })
    expect(clamped.chshCausticEnabled).toBe(true)
    expect(clamped.chshCausticStrength).toBe(CHSH_CAUSTIC_LIMITS.strengthMax)
    expect(clamped.chshCausticFoldScale).toBe(CHSH_CAUSTIC_LIMITS.foldScaleMin)
    expect(clamped.chshCausticPhase).toBe(CHSH_CAUSTIC_LIMITS.phaseMax)

    const finite = sanitizeChshCausticControls({
      chshCausticEnabled: true,
      chshCausticStrength: Number.NaN,
      chshCausticFoldScale: Number.POSITIVE_INFINITY,
      chshCausticPhase: Number.NEGATIVE_INFINITY,
    })
    expectFiniteNumbers([
      finite.chshCausticStrength,
      finite.chshCausticFoldScale,
      finite.chshCausticPhase,
    ])
  })

  it('computes canonical Werner CHSH slack near 1 at visibility 1', () => {
    const cfg = createDefaultBellPairConfig()
    const chsh = computeWernerChsh(cfg)
    expect(chsh.signedS).toBeLessThan(0)
    expect(chsh.absS).toBeCloseTo(TSIRELSON_BOUND, 10)
    expect(chsh.positiveSlack).toBeCloseTo(1, 10)
  })

  it('has zero positive slack below the Werner violation threshold', () => {
    const cfg = { ...createDefaultBellPairConfig(), visibility: WERNER_VIOLATION_THRESHOLD - 0.02 }
    const chsh = computeWernerChsh(cfg)
    expect(chsh.absS).toBeLessThan(2)
    expect(chsh.positiveSlack).toBe(0)
  })

  it('changes ridge value when phase or fold scale changes', () => {
    const cfg = createDefaultBellPairConfig()
    const point = [0.13, -0.18, 0.07] as const
    const base = evaluateChshCaustic({
      ...cfg,
      chshCausticEnabled: true,
      chshCausticStrength: 1,
      chshCausticFoldScale: 6,
      chshCausticPhase: 0,
      point,
    })
    const shiftedPhase = evaluateChshCaustic({
      ...cfg,
      chshCausticEnabled: true,
      chshCausticStrength: 1,
      chshCausticFoldScale: 6,
      chshCausticPhase: 1.25,
      point,
    })
    const shiftedFold = evaluateChshCaustic({
      ...cfg,
      chshCausticEnabled: true,
      chshCausticStrength: 1,
      chshCausticFoldScale: 12,
      chshCausticPhase: 0,
      point,
    })

    expect(Math.abs(base.ridge - shiftedPhase.ridge)).toBeGreaterThan(0.001)
    expect(Math.abs(base.ridge - shiftedFold.ridge)).toBeGreaterThan(0.001)
  })

  it('preserves abs CHSH and positive slack under simultaneous analyzer-axis inversion', () => {
    const cfg = createDefaultBellPairConfig()
    const inverted = {
      ...cfg,
      aliceAxis: invertAxis(cfg.aliceAxis),
      aliceAxisPrime: invertAxis(cfg.aliceAxisPrime),
      bobAxis: invertAxis(cfg.bobAxis),
      bobAxisPrime: invertAxis(cfg.bobAxisPrime),
    }
    const originalChsh = computeWernerChsh(cfg)
    const invertedChsh = computeWernerChsh(inverted)
    expect(invertedChsh.absS).toBeCloseTo(originalChsh.absS, 10)
    expect(invertedChsh.positiveSlack).toBeCloseTo(originalChsh.positiveSlack, 10)
  })

  it('keeps caustic sample outputs finite for hostile inputs', () => {
    const cfg = createDefaultBellPairConfig()
    const sample = evaluateChshCaustic({
      ...cfg,
      visibility: Number.POSITIVE_INFINITY,
      chshCausticEnabled: true,
      chshCausticStrength: 99,
      chshCausticFoldScale: 0,
      chshCausticPhase: 99,
      point: [Number.POSITIVE_INFINITY, Number.NaN, Number.NEGATIVE_INFINITY],
      armOffset: Number.NaN,
    })
    expectFiniteNumbers([
      sample.chsh.signedS,
      sample.chsh.absS,
      sample.chsh.positiveSlack,
      sample.eikonal,
      sample.ridge,
      sample.cusp,
      sample.lens,
      sample.shadow,
      sample.densityGain,
    ])
  })

  it('increases density monotonically with caustic strength at fixed point', () => {
    const cfg = createDefaultBellPairConfig()
    const base = { r: 0.1, g: 0.1, b: 0.1, a: 0.1 }
    const point = [0.2, 0.1, -0.05] as const
    const weak = applyChshCausticToDensity(base, {
      ...cfg,
      chshCausticEnabled: true,
      chshCausticStrength: 0.2,
      point,
    })
    const strong = applyChshCausticToDensity(base, {
      ...cfg,
      chshCausticEnabled: true,
      chshCausticStrength: 1.6,
      point,
    })
    expect(strong.a).toBeGreaterThan(weak.a)
    expect(strong.g).toBeGreaterThan(weak.g)
  })
})
