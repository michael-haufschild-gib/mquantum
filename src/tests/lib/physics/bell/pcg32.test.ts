import { describe, expect, it } from 'vitest'

import { createPcg32, PCG32 } from '@/lib/physics/bell/pcg32'

describe('PCG32', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new PCG32(42n)
    const b = new PCG32(42n)
    const seqA: number[] = []
    const seqB: number[] = []
    for (let i = 0; i < 100; i++) {
      seqA.push(a.nextU32())
      seqB.push(b.nextU32())
    }
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    const a = new PCG32(1n)
    const b = new PCG32(2n)
    let differences = 0
    for (let i = 0; i < 100; i++) {
      if (a.nextU32() !== b.nextU32()) differences++
    }
    // At least 90 of 100 draws should differ — two distinct sequences from
    // a well-behaved PRNG should not coincide on more than a handful of draws.
    expect(differences).toBeGreaterThan(90)
  })

  it('nextFloat is in [0, 1)', () => {
    const rng = new PCG32(12345n)
    for (let i = 0; i < 10_000; i++) {
      const x = rng.nextFloat()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  it('nextFloat is approximately uniform over [0, 1)', () => {
    const rng = new PCG32(99n)
    const buckets = new Uint32Array(10)
    const N = 100_000
    for (let i = 0; i < N; i++) {
      const x = rng.nextFloat()
      buckets[Math.floor(x * 10)]!++
    }
    const expected = N / 10
    // Each bucket within ±5% of expected — Bernoulli stddev is ≈ 95, so
    // 5% (≈ 500) is well above noise. Crude but catches gross brokenness.
    for (let i = 0; i < 10; i++) {
      expect(Math.abs((buckets[i] ?? 0) - expected) / expected).toBeLessThan(0.05)
    }
  })

  it('nextFloat53 is in [0, 1)', () => {
    const rng = new PCG32(7n)
    for (let i = 0; i < 1000; i++) {
      const x = rng.nextFloat53()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  it('different streams give independent sequences from the same seed', () => {
    const a = new PCG32(42n, 0n)
    const b = new PCG32(42n, 1n)
    let differences = 0
    for (let i = 0; i < 100; i++) {
      if (a.nextU32() !== b.nextU32()) differences++
    }
    expect(differences).toBeGreaterThan(90)
  })

  it('createPcg32 factory accepts a u32 seed', () => {
    const a = createPcg32(0x12345678)
    const b = new PCG32(BigInt(0x12345678))
    for (let i = 0; i < 10; i++) {
      expect(a.nextU32()).toBe(b.nextU32())
    }
  })

  it('nextBool with p=0 always false, p=1 always true', () => {
    const rng = new PCG32(1n)
    for (let i = 0; i < 100; i++) {
      expect(rng.nextBool(0)).toBe(false)
      expect(rng.nextBool(1)).toBe(true)
    }
  })
})
