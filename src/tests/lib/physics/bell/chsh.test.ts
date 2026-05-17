import { describe, expect, it } from 'vitest'

import {
  CANONICAL_CHSH_PHI,
  maxChshForWerner,
  singletCorrelation,
  WERNER_VIOLATION_THRESHOLD,
  wernerCorrelation,
} from '@/lib/physics/bell/analytic'
import { sampleJointOutcome } from '@/lib/physics/bell/bornSample'
import { ChshAccumulator, CLASSICAL_BOUND, TSIRELSON_BOUND } from '@/lib/physics/bell/chsh'
import { PCG32 } from '@/lib/physics/bell/pcg32'
import { azimuthalVec, jointOutcomeProbabilities } from '@/lib/physics/bell/projectors'
import { bellState, pureDensityMatrix, wernerDensityMatrix } from '@/lib/physics/bell/state'

describe('ChshAccumulator basics', () => {
  it('records and computes E for a single bin', () => {
    const acc = new ChshAccumulator()
    acc.recordTrial(0, 0, +1, +1)
    acc.recordTrial(0, 0, +1, -1)
    acc.recordTrial(0, 0, -1, +1)
    acc.recordTrial(0, 0, -1, -1)
    expect(acc.getCorrelations().E_ab.count).toBe(4)
    expect(acc.getCorrelations().E_ab.mean).toBe(0) // sum of products = 0
  })

  it('getS returns NaN if any bin is empty', () => {
    const acc = new ChshAccumulator()
    acc.recordTrial(0, 0, +1, +1)
    expect(acc.getS()).toBeNaN()
  })

  it('reset clears all bins', () => {
    const acc = new ChshAccumulator()
    acc.recordTrial(0, 0, +1, +1)
    acc.recordTrial(1, 1, -1, -1)
    acc.reset()
    expect(acc.totalCount).toBe(0)
    expect(acc.getS()).toBeNaN()
  })

  it('recordBatch matches per-trial accumulation', () => {
    const accA = new ChshAccumulator()
    const accB = new ChshAccumulator()
    const buf = Int8Array.of(+1, +1, +1, -1, -1, +1, -1, -1)
    accB.recordBatch(0, 0, buf)
    for (let k = 0; k < 4; k++) {
      accA.recordTrial(0, 0, buf[2 * k] as 1 | -1, buf[2 * k + 1] as 1 | -1)
    }
    expect(accA.getCorrelations().E_ab.count).toBe(accB.getCorrelations().E_ab.count)
    expect(accA.getCorrelations().E_ab.mean).toBeCloseTo(accB.getCorrelations().E_ab.mean, 12)
  })
})

describe('CHSH at canonical singlet angles converges to 2√2', () => {
  it('|S| → 2√2 for 100k trials per bin, fixed seed', () => {
    const rho = pureDensityMatrix(bellState('psiMinus'))
    const a = azimuthalVec(CANONICAL_CHSH_PHI.a)
    const ap = azimuthalVec(CANONICAL_CHSH_PHI.aPrime)
    const b = azimuthalVec(CANONICAL_CHSH_PHI.b)
    const bp = azimuthalVec(CANONICAL_CHSH_PHI.bPrime)

    const acc = new ChshAccumulator()
    const rng = new PCG32(20240515n)
    const N = 25_000 // per bin → 100k total trials

    const samplePairs = (
      pA: Parameters<typeof azimuthalVec> extends never[]
        ? never
        : Awaited<ReturnType<typeof azimuthalVec>>,
      pB: typeof a,
      idxA: 0 | 1,
      idxB: 0 | 1
    ): void => {
      const probs = jointOutcomeProbabilities(rho, pA, pB)
      for (let k = 0; k < N; k++) {
        const [oA, oB] = sampleJointOutcome(probs, rng)
        acc.recordTrial(idxA, idxB, oA as 1 | -1, oB as 1 | -1)
      }
    }
    samplePairs(a, b, 0, 0)
    samplePairs(a, bp, 0, 1)
    samplePairs(ap, b, 1, 0)
    samplePairs(ap, bp, 1, 1)

    const S = acc.getS()
    // Sample mean of E per bin is unbiased; the Tsirelson value for the
    // canonical angles (Alice=0,π/2; Bob=π/4,3π/4) with the singlet is −2√2.
    // The Monte Carlo estimate must be within ~4σ of the population mean.
    // Var(E_ij) ≤ (1−E²)/N ≤ 1/N. Var(S) ≤ 4/N. σ(S) ≤ 2/√N = 0.0063 at N=100k.
    const expected = -TSIRELSON_BOUND
    expect(S).toBeGreaterThan(expected - 0.05)
    expect(S).toBeLessThan(expected + 0.05)
    expect(Math.abs(S)).toBeGreaterThan(CLASSICAL_BOUND) // violation confirmed
  })

  it('confidence interval at 95 % covers the analytic value', () => {
    const rho = pureDensityMatrix(bellState('psiMinus'))
    const a = azimuthalVec(CANONICAL_CHSH_PHI.a)
    const ap = azimuthalVec(CANONICAL_CHSH_PHI.aPrime)
    const b = azimuthalVec(CANONICAL_CHSH_PHI.b)
    const bp = azimuthalVec(CANONICAL_CHSH_PHI.bPrime)
    const acc = new ChshAccumulator()
    const rng = new PCG32(7n)
    const N = 5_000

    for (const [pA, pB, iA, iB] of [
      [a, b, 0, 0],
      [a, bp, 0, 1],
      [ap, b, 1, 0],
      [ap, bp, 1, 1],
    ] as const) {
      const probs = jointOutcomeProbabilities(rho, pA, pB)
      for (let k = 0; k < N; k++) {
        const [oA, oB] = sampleJointOutcome(probs, rng)
        acc.recordTrial(iA, iB, oA as 1 | -1, oB as 1 | -1)
      }
    }

    const ci = acc.getSConfidenceInterval()
    const expected = -TSIRELSON_BOUND
    expect(ci.lo).toBeLessThan(expected)
    expect(ci.hi).toBeGreaterThan(expected)
    expect(ci.halfWidth).toBeGreaterThan(0)
    expect(ci.halfWidth).toBeLessThan(0.1)
  })
})

describe('CHSH convergence rate', () => {
  it('|S − S_true| shrinks like 1/√N (empirical sanity check)', () => {
    // Compare estimator error at N1=2.5k vs N2=40k samples per bin.
    // Expected ratio of errors: √(N2/N1) = 4. We allow a generous window
    // [2.0, 9.0] to account for one-realization variance in the test.
    const rho = pureDensityMatrix(bellState('psiMinus'))
    const a = azimuthalVec(CANONICAL_CHSH_PHI.a)
    const ap = azimuthalVec(CANONICAL_CHSH_PHI.aPrime)
    const b = azimuthalVec(CANONICAL_CHSH_PHI.b)
    const bp = azimuthalVec(CANONICAL_CHSH_PHI.bPrime)
    const truth = -TSIRELSON_BOUND

    const errAt = (perBin: number, seed: bigint): number => {
      const acc = new ChshAccumulator()
      const rng = new PCG32(seed)
      for (const [pA, pB, iA, iB] of [
        [a, b, 0, 0],
        [a, bp, 0, 1],
        [ap, b, 1, 0],
        [ap, bp, 1, 1],
      ] as const) {
        const probs = jointOutcomeProbabilities(rho, pA, pB)
        for (let k = 0; k < perBin; k++) {
          const [oA, oB] = sampleJointOutcome(probs, rng)
          acc.recordTrial(iA, iB, oA as 1 | -1, oB as 1 | -1)
        }
      }
      return Math.abs(acc.getS() - truth)
    }

    // Average over a few seeds to suppress single-realization noise but keep
    // the test fast. With 8 seeds at N1=2.5k vs N2=40k the empirical ratio
    // is reliably near 4 (within a factor of ~2 either side).
    const seeds = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n]
    let sumErr1 = 0
    let sumErr2 = 0
    for (const s of seeds) {
      sumErr1 += errAt(2500, s)
      sumErr2 += errAt(40000, s + 1000n)
    }
    const ratio = sumErr1 / seeds.length / (sumErr2 / seeds.length)
    expect(ratio).toBeGreaterThan(2.0)
    expect(ratio).toBeLessThan(9.0)
  })
})

describe('Werner state CHSH threshold', () => {
  it('cannot violate CHSH for v ≤ 1/√2', () => {
    // Analytical: the Werner state achieves |S| ≤ v · 2√2, so v ≤ 1/√2
    // implies |S| ≤ 2 exactly.
    expect(maxChshForWerner(WERNER_VIOLATION_THRESHOLD)).toBeCloseTo(CLASSICAL_BOUND, 12)
    expect(maxChshForWerner(WERNER_VIOLATION_THRESHOLD - 0.01)).toBeLessThan(CLASSICAL_BOUND)
  })

  it('empirical estimator at canonical angles stays ≤ classical bound for v = 1/√2', () => {
    const v = WERNER_VIOLATION_THRESHOLD - 0.01 // just below threshold
    const rho = wernerDensityMatrix(v)
    const a = azimuthalVec(CANONICAL_CHSH_PHI.a)
    const ap = azimuthalVec(CANONICAL_CHSH_PHI.aPrime)
    const b = azimuthalVec(CANONICAL_CHSH_PHI.b)
    const bp = azimuthalVec(CANONICAL_CHSH_PHI.bPrime)
    const acc = new ChshAccumulator()
    const rng = new PCG32(123n)
    const N = 25_000
    for (const [pA, pB, iA, iB] of [
      [a, b, 0, 0],
      [a, bp, 0, 1],
      [ap, b, 1, 0],
      [ap, bp, 1, 1],
    ] as const) {
      const probs = jointOutcomeProbabilities(rho, pA, pB)
      for (let k = 0; k < N; k++) {
        const [oA, oB] = sampleJointOutcome(probs, rng)
        acc.recordTrial(iA, iB, oA as 1 | -1, oB as 1 | -1)
      }
    }
    expect(Math.abs(acc.getS())).toBeLessThan(CLASSICAL_BOUND)
  })

  it('analytic singletCorrelation = −cos(θ) and wernerCorrelation scales by v', () => {
    expect(singletCorrelation(0)).toBeCloseTo(-1, 12)
    expect(singletCorrelation(Math.PI)).toBeCloseTo(1, 12)
    expect(singletCorrelation(Math.PI / 2)).toBeCloseTo(0, 12)
    expect(wernerCorrelation(0, 0.5)).toBeCloseTo(-0.5, 12)
    expect(wernerCorrelation(Math.PI, 0.5)).toBeCloseTo(0.5, 12)
  })
})

describe('seed determinism', () => {
  it('same seed → bit-identical CHSH trace', () => {
    const rho = pureDensityMatrix(bellState('psiMinus'))
    const probs = jointOutcomeProbabilities(rho, azimuthalVec(0), azimuthalVec(Math.PI / 4))

    const collect = (seed: bigint, n: number): readonly (1 | -1)[] => {
      const rng = new PCG32(seed)
      const out: (1 | -1)[] = []
      for (let k = 0; k < n; k++) {
        out.push(...(sampleJointOutcome(probs, rng) as readonly (1 | -1)[]))
      }
      return out
    }

    const a = collect(42n, 100)
    const b = collect(42n, 100)
    expect(a).toEqual(b)
  })
})
