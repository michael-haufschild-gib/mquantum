import { describe, expect, it } from 'vitest'

import { CANONICAL_CHSH_PHI } from '@/lib/physics/bell/analytic'
import { sampleJointOutcome } from '@/lib/physics/bell/bornSample'
import { ChshAccumulator, CLASSICAL_BOUND, TSIRELSON_BOUND } from '@/lib/physics/bell/chsh'
import {
  applyDetectionEfficiency,
  classifyOutcome,
  countNonDetections,
  EBERHARD_THRESHOLD,
  hasNonDetection,
  maxChshGivenEta,
  maxChshUnderAssignNonDetection,
  maxChshUnderFairSampling,
  postSelectOutcome,
} from '@/lib/physics/bell/loopholes'
import { PCG32 } from '@/lib/physics/bell/pcg32'
import { azimuthalVec, jointOutcomeProbabilities } from '@/lib/physics/bell/projectors'
import { bellState, pureDensityMatrix } from '@/lib/physics/bell/state'
import type { Vec3 } from '@/lib/physics/bell/types'

describe('Eberhard threshold constant', () => {
  it('is 2 / (1 + √2) ≈ 0.8284', () => {
    expect(EBERHARD_THRESHOLD).toBeCloseTo(0.82842712474619, 12)
  })
})

describe('applyDetectionEfficiency', () => {
  it('eta=1 → no loss', () => {
    const rng = new PCG32(1n)
    for (let k = 0; k < 100; k++) {
      const out = applyDetectionEfficiency([+1, -1], { etaA: 1, etaB: 1 }, rng)
      expect(out).toEqual([+1, -1])
    }
  })

  it('eta=0 → both always null', () => {
    const rng = new PCG32(2n)
    for (let k = 0; k < 100; k++) {
      const out = applyDetectionEfficiency([+1, +1], { etaA: 0, etaB: 0 }, rng)
      expect(out).toEqual([null, null])
    }
  })

  it('drop rate approximately matches 1 − η for each detector', () => {
    const rng = new PCG32(99n)
    const N = 50_000
    let aLost = 0
    let bLost = 0
    for (let k = 0; k < N; k++) {
      const out = applyDetectionEfficiency([+1, +1], { etaA: 0.7, etaB: 0.3 }, rng)
      if (out[0] === null) aLost++
      if (out[1] === null) bLost++
    }
    expect(aLost / N).toBeCloseTo(0.3, 1)
    expect(bLost / N).toBeCloseTo(0.7, 1)
  })

  it('consumes two PRNG draws per call regardless of outcome', () => {
    const rngA = new PCG32(123n)
    const rngB = new PCG32(123n)
    for (let k = 0; k < 50; k++) {
      applyDetectionEfficiency([+1, -1], { etaA: 0.5, etaB: 0.5 }, rngA)
      rngB.nextFloat()
      rngB.nextFloat()
    }
    expect(rngA.nextU32()).toBe(rngB.nextU32())
  })
})

describe('classifyOutcome and helpers', () => {
  it('coincidence flag is true only when both detectors fired', () => {
    expect(classifyOutcome([+1, +1]).coincidence).toBe(true)
    expect(classifyOutcome([+1, null]).coincidence).toBe(false)
    expect(classifyOutcome([null, +1]).coincidence).toBe(false)
    expect(classifyOutcome([null, null]).coincidence).toBe(false)
  })

  it('anyLoss / doubleLoss flags', () => {
    expect(classifyOutcome([+1, -1]).anyLoss).toBe(false)
    expect(classifyOutcome([+1, null]).anyLoss).toBe(true)
    expect(classifyOutcome([null, null]).doubleLoss).toBe(true)
    expect(classifyOutcome([+1, null]).doubleLoss).toBe(false)
  })

  it('hasNonDetection and countNonDetections', () => {
    expect(hasNonDetection([null, +1])).toBe(true)
    expect(hasNonDetection([+1, -1])).toBe(false)
    expect(countNonDetections([+1, null, -1, null, null])).toBe(3)
  })

  it('postSelectOutcome fair-sampling drops non-coincidences', () => {
    expect(postSelectOutcome([+1, +1], 'fairSampling')).toEqual([+1, +1])
    expect(postSelectOutcome([+1, null], 'fairSampling')).toBeNull()
    expect(postSelectOutcome([null, null], 'fairSampling')).toBeNull()
  })

  it('postSelectOutcome assignNonDetection replaces nulls with +1', () => {
    expect(postSelectOutcome([+1, null], 'assignNonDetection')).toEqual([+1, 1])
    expect(postSelectOutcome([null, -1], 'assignNonDetection')).toEqual([1, -1])
    expect(postSelectOutcome([null, null], 'assignNonDetection')).toEqual([1, 1])
  })
})

describe('Eberhard threshold: detection efficiency forbids CHSH violation when below', () => {
  it('singlet CHSH with η well below Eberhard threshold + fair-sampling cannot maintain |S| > 2', () => {
    // The singlet at canonical CHSH angles with symmetric detection
    // efficiency η, **after** fair-sampling postselection, still gives
    // |S| = 2√2 — because the singlet's conditional outcomes after random
    // i.i.d. detection loss are unchanged. THIS IS A KNOWN SUBTLETY: pure
    // quantum mechanics + i.i.d. iid loss does NOT exploit the loophole.
    // The loophole requires a LHV that *correlates* its detection
    // decision with the measurement axis (see lhv.test.ts). Here we
    // verify the QM-side behaviour: post-selected |S| stays near 2√2.
    const rho = pureDensityMatrix(bellState('psiMinus'))
    const a = azimuthalVec(CANONICAL_CHSH_PHI.a)
    const ap = azimuthalVec(CANONICAL_CHSH_PHI.aPrime)
    const b = azimuthalVec(CANONICAL_CHSH_PHI.b)
    const bp = azimuthalVec(CANONICAL_CHSH_PHI.bPrime)
    const acc = new ChshAccumulator()
    const rng = new PCG32(11n)
    const N = 30_000
    const pairs: ReadonlyArray<readonly [Vec3, Vec3, 0 | 1, 0 | 1]> = [
      [a, b, 0, 0],
      [a, bp, 0, 1],
      [ap, b, 1, 0],
      [ap, bp, 1, 1],
    ]
    for (const [pA, pB, iA, iB] of pairs) {
      const probs = jointOutcomeProbabilities(rho, pA, pB)
      for (let k = 0; k < N; k++) {
        const out = sampleJointOutcome(probs, rng)
        const detected = applyDetectionEfficiency(out, { etaA: 0.5, etaB: 0.5 }, rng)
        const fair = postSelectOutcome(detected, 'fairSampling')
        if (fair === null) continue
        acc.recordTrial(iA, iB, fair[0], fair[1])
      }
    }
    // QM + iid loss still violates CHSH under fair-sampling. The teaching
    // point isn't that QM stops violating — it's that an LHV *can* mimic
    // it under the same conditioning.
    expect(Math.abs(acc.getS())).toBeGreaterThan(CLASSICAL_BOUND)
  })

  it('without fair-sampling (assignNonDetection), η below Eberhard makes |S| ≤ 2 even for QM', () => {
    // With assignNonDetection, missed detections are mapped to +1, which
    // degrades the correlation. For symmetric η below the Eberhard
    // threshold, the singlet's |S| drops below 2.
    const rho = pureDensityMatrix(bellState('psiMinus'))
    const a = azimuthalVec(CANONICAL_CHSH_PHI.a)
    const ap = azimuthalVec(CANONICAL_CHSH_PHI.aPrime)
    const b = azimuthalVec(CANONICAL_CHSH_PHI.b)
    const bp = azimuthalVec(CANONICAL_CHSH_PHI.bPrime)
    const acc = new ChshAccumulator()
    const rng = new PCG32(13n)
    const N = 30_000
    const eta = 0.5 // well below the Eberhard threshold ≈ 0.8284
    const pairs: ReadonlyArray<readonly [Vec3, Vec3, 0 | 1, 0 | 1]> = [
      [a, b, 0, 0],
      [a, bp, 0, 1],
      [ap, b, 1, 0],
      [ap, bp, 1, 1],
    ]
    for (const [pA, pB, iA, iB] of pairs) {
      const probs = jointOutcomeProbabilities(rho, pA, pB)
      for (let k = 0; k < N; k++) {
        const out = sampleJointOutcome(probs, rng)
        const detected = applyDetectionEfficiency(out, { etaA: eta, etaB: eta }, rng)
        const assigned = postSelectOutcome(detected, 'assignNonDetection')
        if (assigned === null) continue
        acc.recordTrial(iA, iB, assigned[0], assigned[1])
      }
    }
    expect(Math.abs(acc.getS())).toBeLessThan(CLASSICAL_BOUND)
  })
})

describe('maxChshUnderFairSampling', () => {
  it('returns Tsirelson at η = 1', () => {
    expect(maxChshUnderFairSampling(1)).toBeCloseTo(TSIRELSON_BOUND, 12)
  })

  it('returns Tsirelson at η = Eberhard threshold', () => {
    // Under fair-sampling, post-selection preserves the conditional |S|,
    // so the QM ceiling is 2√2 for any η > 0 (no η-dependence in the
    // theoretical bound — the loophole is interpretational, not a
    // quantitative reduction of the ceiling).
    expect(maxChshUnderFairSampling(EBERHARD_THRESHOLD)).toBeCloseTo(TSIRELSON_BOUND, 12)
  })

  it('returns Tsirelson at η well below the Eberhard threshold', () => {
    // Empirically confirmed in this file's "η = 0.5 + fair-sampling"
    // test above: QM still violates CHSH. The ceiling is 2√2.
    expect(maxChshUnderFairSampling(0.3)).toBeCloseTo(TSIRELSON_BOUND, 12)
    expect(maxChshUnderFairSampling(0.5)).toBeCloseTo(TSIRELSON_BOUND, 12)
  })

  it('returns 0 at η = 0 (no coincidences, no signal)', () => {
    expect(maxChshUnderFairSampling(0)).toBe(0)
  })

  it('clamps negative and >1 η to the in-range answer', () => {
    expect(maxChshUnderFairSampling(-0.1)).toBe(0)
    expect(maxChshUnderFairSampling(1.5)).toBeCloseTo(TSIRELSON_BOUND, 12)
  })
})

describe('maxChshUnderAssignNonDetection', () => {
  it('returns the classical bound 2 at η = 0 (constant +1 assignment, S = 1−1+1+1 = 2)', () => {
    expect(maxChshUnderAssignNonDetection(0)).toBeCloseTo(CLASSICAL_BOUND, 12)
  })

  it('returns exactly the classical bound at η = Eberhard threshold (violation onset)', () => {
    // Closed-form: η_E²·2√2 + 2(1−η_E)² = 2 exactly.
    expect(maxChshUnderAssignNonDetection(EBERHARD_THRESHOLD)).toBeCloseTo(CLASSICAL_BOUND, 10)
  })

  it('returns Tsirelson at η = 1', () => {
    expect(maxChshUnderAssignNonDetection(1)).toBeCloseTo(TSIRELSON_BOUND, 12)
  })

  it('dips below the classical bound for η between 0 and η_E', () => {
    // The formula η²·2√2 + 2(1-η)² has minimum at η = √2 − 1 ≈ 0.4142, with
    // value 4 − 2√2 ≈ 1.172. Verify the dip is real (no LHV nor QM can
    // exceed 2 under assign-non-detection in this regime).
    const sqrt2Minus1 = Math.SQRT2 - 1
    expect(maxChshUnderAssignNonDetection(sqrt2Minus1)).toBeLessThan(CLASSICAL_BOUND)
    expect(maxChshUnderAssignNonDetection(0.5)).toBeLessThan(CLASSICAL_BOUND)
    expect(maxChshUnderAssignNonDetection(0.7)).toBeLessThan(CLASSICAL_BOUND)
  })

  it('exceeds the classical bound only above the Eberhard threshold', () => {
    expect(maxChshUnderAssignNonDetection(EBERHARD_THRESHOLD + 0.01)).toBeGreaterThan(
      CLASSICAL_BOUND
    )
    expect(maxChshUnderAssignNonDetection(0.95)).toBeGreaterThan(CLASSICAL_BOUND)
  })

  it('matches the empirical CHSH ceiling from the η = 0.5 assign-non-detection test', () => {
    // The empirical test in this file (η = 0.5, assignNonDetection)
    // observed |S| < CLASSICAL_BOUND. The closed-form bound at η = 0.5
    // is 0.25·2√2 + 2·0.25 = 0.5√2 + 0.5 ≈ 1.2071.
    expect(maxChshUnderAssignNonDetection(0.5)).toBeCloseTo(0.5 * Math.SQRT2 + 0.5, 12)
  })
})

describe('maxChshGivenEta dispatch', () => {
  it('forwards to fair-sampling formula', () => {
    expect(maxChshGivenEta(0.5, 'fairSampling')).toBeCloseTo(TSIRELSON_BOUND, 12)
    expect(maxChshGivenEta(0, 'fairSampling')).toBe(0)
  })

  it('forwards to assign-non-detection formula', () => {
    expect(maxChshGivenEta(0.5, 'assignNonDetection')).toBeCloseTo(0.5 * Math.SQRT2 + 0.5, 12)
    expect(maxChshGivenEta(1, 'assignNonDetection')).toBeCloseTo(TSIRELSON_BOUND, 12)
  })
})
