import { describe, expect, it } from 'vitest'

import { CANONICAL_CHSH_PHI } from '@/lib/physics/bell/analytic'
import { ChshAccumulator, CLASSICAL_BOUND } from '@/lib/physics/bell/chsh'
import {
  LHV_STRATEGIES,
  lhvCos2Probabilistic,
  lhvDeterministicBell,
  makeDetectionLoopholeLhv,
} from '@/lib/physics/bell/lhv'
import { PCG32 } from '@/lib/physics/bell/pcg32'
import { azimuthalVec } from '@/lib/physics/bell/projectors'
import type { Vec3 } from '@/lib/physics/bell/types'

/** Run one CHSH experiment with the given LHV strategy at canonical angles. */
function runLhvChsh(strategy: typeof lhvDeterministicBell, perBin: number, seed: bigint): number {
  const a = azimuthalVec(CANONICAL_CHSH_PHI.a)
  const ap = azimuthalVec(CANONICAL_CHSH_PHI.aPrime)
  const b = azimuthalVec(CANONICAL_CHSH_PHI.b)
  const bp = azimuthalVec(CANONICAL_CHSH_PHI.bPrime)
  const acc = new ChshAccumulator()
  const rng = new PCG32(seed)
  const pairs: ReadonlyArray<readonly [Vec3, Vec3, 0 | 1, 0 | 1]> = [
    [a, b, 0, 0],
    [a, bp, 0, 1],
    [ap, b, 1, 0],
    [ap, bp, 1, 1],
  ]
  for (const [pA, pB, iA, iB] of pairs) {
    for (let k = 0; k < perBin; k++) {
      const [oA, oB] = strategy.sampleOutcome(pA, pB, rng)
      if (oA === null || oB === null) continue // fair-sampling: drop non-detections
      acc.recordTrial(iA, iB, oA, oB)
    }
  }
  return acc.getS()
}

describe('LHV: deterministic Bell never violates CHSH at canonical angles', () => {
  it('mean |S| across many seeds is consistent with the classical bound', () => {
    // The deterministic Bell strategy hits the classical bound exactly:
    // ⟨A·B⟩ = (2θ − π)/π, which at canonical angles gives S = ±2 in the
    // limit N → ∞. Single-seed realizations sit on either side of 2 with
    // stddev σ(S) ≈ 4/√(Nperbin·4) — so the right physics statement is
    // about the *mean* over many seeds, not about every realization.
    const seeds = Array.from({ length: 30 }, (_, i) => BigInt(i + 1))
    let sumAbsS = 0
    let maxAbsS = 0
    for (const seed of seeds) {
      const S = runLhvChsh(lhvDeterministicBell, 10_000, seed)
      sumAbsS += Math.abs(S)
      maxAbsS = Math.max(maxAbsS, Math.abs(S))
    }
    const meanAbsS = sumAbsS / seeds.length
    // With Nperbin=10k, σ(S) ≈ 4/√10000 = 0.04. Mean over 30 seeds has
    // stddev ≈ 0.04/√30 ≈ 0.007. A 5σ envelope around the population
    // mean (= 2) is 2 ± 0.035.
    expect(meanAbsS).toBeLessThan(CLASSICAL_BOUND + 0.04)
    // Sanity: the mean is close to 2 (not far below) — confirms the
    // strategy actually saturates the bound rather than sitting below.
    expect(meanAbsS).toBeGreaterThan(CLASSICAL_BOUND - 0.04)
    // Single-seed worst case: at 5σ the realization can exceed 2 by ~0.20.
    // We allow this because it is a property of finite-sample noise, not
    // a violation of the inequality.
    expect(maxAbsS).toBeLessThan(CLASSICAL_BOUND + 0.25)
  })
})

describe('LHV: noisy classical never violates CHSH', () => {
  it('|S| stays well below the classical bound (it should be substantially less)', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => BigInt(i + 100))
    for (const seed of seeds) {
      const S = runLhvChsh(lhvCos2Probabilistic, 4_000, seed)
      // Probabilistic LHV is strictly weaker than deterministic Bell;
      // empirically |S| stays around 1, well below 2.
      expect(Math.abs(S)).toBeLessThan(CLASSICAL_BOUND)
    }
  })
})

describe('LHV: detection-loophole can mimic CHSH violation under fair-sampling', () => {
  it('with aggressive cutoff and fair-sampling, |S| > 2 is achievable', () => {
    const exploit = makeDetectionLoopholeLhv({ projectionCutoff: 0.85 })
    // Try a few seeds; the exploit succeeds frequently with strong cutoff.
    const seeds = Array.from({ length: 12 }, (_, i) => BigInt(i + 200))
    let successes = 0
    for (const seed of seeds) {
      const S = runLhvChsh(exploit, 8_000, seed)
      if (Number.isFinite(S) && Math.abs(S) > CLASSICAL_BOUND) successes++
    }
    // Robust expectation: most seeds produce a violation. We require at
    // least 8 of 12 to be tolerant of finite-sample variance.
    expect(successes).toBeGreaterThanOrEqual(8)
  })

  it('without fair-sampling (assignNonDetection mode), |S| stays bounded by 2', () => {
    // Assign null → +1 outcomes. Equivalent to a full-outcome LHV.
    const exploit = makeDetectionLoopholeLhv({ projectionCutoff: 0.85 })
    const a = azimuthalVec(CANONICAL_CHSH_PHI.a)
    const ap = azimuthalVec(CANONICAL_CHSH_PHI.aPrime)
    const b = azimuthalVec(CANONICAL_CHSH_PHI.b)
    const bp = azimuthalVec(CANONICAL_CHSH_PHI.bPrime)
    const acc = new ChshAccumulator()
    const rng = new PCG32(999n)
    const pairs: ReadonlyArray<readonly [Vec3, Vec3, 0 | 1, 0 | 1]> = [
      [a, b, 0, 0],
      [a, bp, 0, 1],
      [ap, b, 1, 0],
      [ap, bp, 1, 1],
    ]
    for (const [pA, pB, iA, iB] of pairs) {
      for (let k = 0; k < 8_000; k++) {
        const [oA, oB] = exploit.sampleOutcome(pA, pB, rng)
        // Map nulls → +1 (Clauser-Horne convention)
        const aOut: 1 | -1 = oA ?? 1
        const bOut: 1 | -1 = oB ?? 1
        acc.recordTrial(iA, iB, aOut, bOut)
      }
    }
    expect(Math.abs(acc.getS())).toBeLessThanOrEqual(CLASSICAL_BOUND + 0.05)
  })
})

describe('LHV registry', () => {
  it('exposes at least three strategies with stable ids', () => {
    expect(LHV_STRATEGIES.length).toBeGreaterThanOrEqual(3)
    const ids = LHV_STRATEGIES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length) // unique
  })

  it('every strategy returns outcomes in the allowed set', () => {
    const rng = new PCG32(7n)
    for (const strat of LHV_STRATEGIES) {
      for (let k = 0; k < 200; k++) {
        const [oA, oB] = strat.sampleOutcome([1, 0, 0], [0, 1, 0], rng)
        for (const o of [oA, oB]) {
          expect(o === null || o === 1 || o === -1).toBe(true)
        }
      }
    }
  })
})
