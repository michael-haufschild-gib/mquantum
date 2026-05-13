/**
 * Physics-correctness tests for the BTZ (Stage 2A) math helpers.
 *
 * Each assertion answers a specific "what bug would break this?" question:
 *   - `btzMetricF` — would fail if sign of f(r) inside/outside horizon flipped
 *     or if the scaling by 1/L² dropped.
 *   - `btzTemperature` — would fail on wrong 2π, wrong L² denominator, or
 *     missing monotonicity in r₊.
 *   - `btzEntropy` — would fail on missing π, wrong G_N placement, or
 *     non-linearity in r₊.
 *   - `btzMass` — would fail on wrong power of r₊, wrong G_N placement,
 *     or missing 1/L² scaling.
 *   - `btzThermalAmplitude` — would fail on non-zero density inside the
 *     horizon, missing thermal spike near horizon, or negative amplitude.
 */

import { describe, expect, it } from 'vitest'

import {
  BTZ_AMPLITUDE_CEILING,
  btzEntropy,
  btzMass,
  btzMetricF,
  btzScalarDelta,
  btzTemperature,
  btzThermalAmplitude,
  DEFAULT_BTZ_G_NEWTON,
} from '@/lib/physics/antiDeSitter/btz'

describe('btzMetricF', () => {
  it('vanishes exactly at the horizon r = r₊', () => {
    expect(btzMetricF(0.5, 0.5, 1)).toBeCloseTo(0, 12)
    expect(btzMetricF(1.0, 1.0, 2)).toBeCloseTo(0, 12)
  })

  it('is strictly negative inside the horizon (r < r₊)', () => {
    expect(btzMetricF(0.2, 0.5, 1)).toBeLessThan(0)
    expect(btzMetricF(0.0, 1.0, 1)).toBeLessThan(0)
  })

  it('is strictly positive outside the horizon and monotone increasing in r', () => {
    const rp = 0.3
    const L = 1
    let prev = btzMetricF(rp + 0.01, rp, L)
    expect(prev).toBeGreaterThan(0)
    for (let r = rp + 0.05; r <= 5; r += 0.1) {
      const f = btzMetricF(r, rp, L)
      expect(f).toBeGreaterThan(prev)
      prev = f
    }
  })

  it('scales as 1/L²: doubling L at fixed (r, r₊) quarters f(r)', () => {
    const r = 2
    const rp = 0.5
    const fA = btzMetricF(r, rp, 1)
    const fB = btzMetricF(r, rp, 2)
    expect(fB).toBeCloseTo(fA / 4, 12)
  })

  it('returns finite zero for invalid physical domains', () => {
    expect(btzMetricF(Number.NaN, 0.5, 1)).toBe(0)
    expect(btzMetricF(1, Number.POSITIVE_INFINITY, 1)).toBe(0)
    expect(btzMetricF(1, 0.5, 0)).toBe(0)
    expect(btzMetricF(-1, 0.5, 1)).toBe(0)
  })
})

describe('btzTemperature', () => {
  it('matches r₊ / (2π L²) for representative parameters', () => {
    expect(btzTemperature(0.3, 1)).toBeCloseTo(0.3 / (2 * Math.PI), 12)
    expect(btzTemperature(1.0, 2)).toBeCloseTo(1.0 / (8 * Math.PI), 12)
  })

  it('is zero at r₊ = 0 (extremal / massless BTZ limit)', () => {
    expect(btzTemperature(0, 1)).toBe(0)
  })

  it('is strictly monotone increasing in r₊ at fixed L', () => {
    const L = 1
    let prev = btzTemperature(0.05, L)
    for (const rp of [0.1, 0.3, 0.5, 1.0, 2.0]) {
      const T = btzTemperature(rp, L)
      expect(T).toBeGreaterThan(prev)
      prev = T
    }
  })

  it('decreases as L grows (larger AdS radius dilutes the temperature)', () => {
    const rp = 0.5
    expect(btzTemperature(rp, 0.5)).toBeGreaterThan(btzTemperature(rp, 1))
    expect(btzTemperature(rp, 1)).toBeGreaterThan(btzTemperature(rp, 2))
  })

  it('returns finite zero for invalid thermodynamic domains', () => {
    expect(btzTemperature(Number.NaN, 1)).toBe(0)
    expect(btzTemperature(1, Number.POSITIVE_INFINITY)).toBe(0)
    expect(btzTemperature(-0.1, 1)).toBe(0)
    expect(btzTemperature(1, 0)).toBe(0)
  })
})

describe('btzEntropy', () => {
  it('matches π r₊ / (2 G_N) for G_N = 1', () => {
    expect(btzEntropy(0.5, 1)).toBeCloseTo(Math.PI * 0.25, 12)
    expect(btzEntropy(1.5, 1)).toBeCloseTo(Math.PI * 0.75, 12)
  })

  it('is zero at r₊ = 0', () => {
    expect(btzEntropy(0, 1)).toBe(0)
  })

  it('is linear in r₊ (doubling r₊ doubles S)', () => {
    const sA = btzEntropy(0.25, 1)
    const sB = btzEntropy(0.5, 1)
    expect(sB).toBeCloseTo(2 * sA, 12)
  })

  it('inversely scales with G_N', () => {
    const base = btzEntropy(1, 1)
    expect(btzEntropy(1, 2)).toBeCloseTo(base / 2, 12)
    expect(btzEntropy(1, 0.5)).toBeCloseTo(base * 2, 12)
  })

  it('returns finite zero for invalid entropy domains', () => {
    expect(btzEntropy(Number.POSITIVE_INFINITY, 1)).toBe(0)
    expect(btzEntropy(1, Number.NaN)).toBe(0)
    expect(btzEntropy(-0.1, 1)).toBe(0)
    expect(btzEntropy(1, 0)).toBe(0)
  })
})

describe('btzMass', () => {
  it('matches r₊² / (8 G_N L²) for the default inputs', () => {
    expect(btzMass(0.5, 1, 1)).toBeCloseTo(0.25 / 8, 12)
    expect(btzMass(1.0, 1, 2)).toBeCloseTo(1 / 32, 12)
  })

  it('is zero at r₊ = 0', () => {
    expect(btzMass(0, 1, 1)).toBe(0)
  })

  it('is quadratic in r₊ (doubling r₊ quadruples M)', () => {
    const mA = btzMass(0.2, 1, 1)
    const mB = btzMass(0.4, 1, 1)
    expect(mB).toBeCloseTo(4 * mA, 12)
  })

  it('returns finite zero for invalid mass domains', () => {
    expect(btzMass(Number.NaN, 1, 1)).toBe(0)
    expect(btzMass(1, Number.POSITIVE_INFINITY, 1)).toBe(0)
    expect(btzMass(1, 1, Number.NaN)).toBe(0)
    expect(btzMass(-0.1, 1, 1)).toBe(0)
    expect(btzMass(1, 0, 1)).toBe(0)
  })
})

describe('btzScalarDelta', () => {
  it('massless scalar on AdS₃ reproduces the canonical Δ = 2', () => {
    expect(btzScalarDelta(0)).toBeCloseTo(2, 12)
  })

  it('heavy scalar satisfies Δ = 1 + √(1 + m²L²)', () => {
    expect(btzScalarDelta(1)).toBeCloseTo(1 + Math.sqrt(2), 12)
    expect(btzScalarDelta(2)).toBeCloseTo(1 + Math.sqrt(5), 12)
  })

  it('imaginary-mass slider encoding preserves the BF-safe formula', () => {
    // mL = −√0.5 ⇒ m²L² = −0.5, still above BF bound (−1). Δ = 1 + √0.5.
    expect(btzScalarDelta(-Math.sqrt(0.5))).toBeCloseTo(1 + Math.sqrt(0.5), 12)
  })

  it('returns 1 when below the BF bound rather than NaN', () => {
    expect(btzScalarDelta(-Math.sqrt(2))).toBe(1)
  })

  it('returns a finite BF fallback for non-finite or overflowing masses', () => {
    expect(btzScalarDelta(Number.NaN)).toBe(1)
    expect(btzScalarDelta(Number.POSITIVE_INFINITY)).toBe(1)
    expect(btzScalarDelta(Number.MAX_VALUE)).toBe(1)
  })
})

describe('btzThermalAmplitude', () => {
  const rplus = 0.3
  const L = 1
  const omega = 1.0
  const delta = 2
  const T = btzTemperature(rplus, L)
  const beta = 1 / T

  it('is exactly zero inside the horizon (r < r₊)', () => {
    expect(btzThermalAmplitude(rplus - 0.01, 0, rplus, L, omega, delta, 0, beta)).toBe(0)
    expect(btzThermalAmplitude(0.0, 1.3, rplus, L, omega, delta, 0, beta)).toBe(0)
  })

  it('is exactly zero at the horizon itself (guard against spec ambiguity)', () => {
    expect(btzThermalAmplitude(rplus, 0, rplus, L, omega, delta, 0, beta)).toBe(0)
  })

  it('is non-negative, finite, and bounded by the amplitude ceiling everywhere outside', () => {
    for (const r of [rplus + 0.005, rplus + 0.05, rplus + 0.5, 5 * rplus, 20 * rplus]) {
      for (const phi of [0, 1, Math.PI, -2.5]) {
        const amp = btzThermalAmplitude(r, phi, rplus, L, omega, delta, 1, beta)
        expect(amp).toBeGreaterThanOrEqual(0)
        expect(amp).toBeLessThanOrEqual(BTZ_AMPLITUDE_CEILING)
        expect(Number.isFinite(amp)).toBe(true)
      }
    }
  })

  it('peaks near the horizon and decays toward the boundary', () => {
    const ampNear = btzThermalAmplitude(rplus + 0.01, 0, rplus, L, omega, delta, 0, beta)
    const ampFar = btzThermalAmplitude(10 * rplus, 0, rplus, L, omega, delta, 0, beta)
    expect(ampNear).toBeGreaterThan(ampFar)
  })

  it('angular harmonic cos²(m_A φ) nulls at the zeros of cos', () => {
    // m_A = 1 ⇒ cos²(φ) zeros at φ = ±π/2. Away from there amplitude is non-zero.
    const r = rplus + 0.5
    const ampZero = btzThermalAmplitude(r, Math.PI / 2, rplus, L, omega, delta, 1, beta)
    const ampPeak = btzThermalAmplitude(r, 0, rplus, L, omega, delta, 1, beta)
    expect(ampZero).toBeCloseTo(0, 10)
    expect(ampPeak).toBeGreaterThan(0)
  })

  it('m_A = 0 is φ-independent', () => {
    const r = rplus + 0.2
    const amp0 = btzThermalAmplitude(r, 0, rplus, L, omega, delta, 0, beta)
    const amp1 = btzThermalAmplitude(r, 1.2345, rplus, L, omega, delta, 0, beta)
    const amp2 = btzThermalAmplitude(r, -2.9, rplus, L, omega, delta, 0, beta)
    expect(amp0).toBeCloseTo(amp1, 10)
    expect(amp0).toBeCloseTo(amp2, 10)
  })

  it('is scale-invariant at fixed fractional radius when the f-floor is inactive', () => {
    const rSmall = 0.2
    const rLarge = 1.0
    const betaSmall = 1 / btzTemperature(rSmall, L)
    const betaLarge = 1 / btzTemperature(rLarge, L)
    // BTZ has T_H ∝ r₊ and f(r₊·q) ∝ r₊², so β·ω·√f and (r₊/r)^{2Δ}
    // cancel at fixed q when epsilonF is not active.
    const ampSmall = btzThermalAmplitude(rSmall * 1.2, 0, rSmall, L, omega, delta, 0, betaSmall)
    const ampLarge = btzThermalAmplitude(rLarge * 1.2, 0, rLarge, L, omega, delta, 0, betaLarge)
    expect(ampSmall).toBeCloseTo(ampLarge, 12)
  })

  it('rejects non-finite inputs without throwing', () => {
    expect(btzThermalAmplitude(Number.NaN, 0, rplus, L, omega, delta, 0, beta)).toBe(0)
    expect(btzThermalAmplitude(1, Number.POSITIVE_INFINITY, rplus, L, omega, delta, 0, beta)).toBe(
      0
    )
    expect(btzThermalAmplitude(1, 0, Number.NaN, L, omega, delta, 0, beta)).toBe(0)
    expect(btzThermalAmplitude(1, 0, rplus, Number.POSITIVE_INFINITY, omega, delta, 0, beta)).toBe(
      0
    )
    expect(btzThermalAmplitude(1, 0, rplus, L, Number.NaN, delta, 0, beta)).toBe(0)
    expect(btzThermalAmplitude(1, 0, rplus, L, omega, Number.POSITIVE_INFINITY, 0, beta)).toBe(0)
    expect(btzThermalAmplitude(1, 0, rplus, L, omega, delta, Number.NaN, beta)).toBe(0)
    expect(btzThermalAmplitude(1, 0, rplus, L, omega, delta, 0, Number.NaN)).toBe(0)
    expect(btzThermalAmplitude(1, 0, rplus, L, omega, delta, 0, beta, Number.NaN)).toBe(0)
  })
})

describe('default constants', () => {
  it('DEFAULT_BTZ_G_NEWTON matches spec (sim units = 1)', () => {
    expect(DEFAULT_BTZ_G_NEWTON).toBe(1)
  })

  it('BTZ_AMPLITUDE_CEILING is a positive finite number', () => {
    expect(BTZ_AMPLITUDE_CEILING).toBeGreaterThan(0)
    expect(Number.isFinite(BTZ_AMPLITUDE_CEILING)).toBe(true)
  })
})
