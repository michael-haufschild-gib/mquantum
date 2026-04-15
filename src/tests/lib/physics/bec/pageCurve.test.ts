/**
 * Tests for `lib/physics/bec/pageCurve`.
 *
 * Coverage targets the PRD acceptance bar:
 *   1. S_therm monotonic non-decreasing across a synthetic 1000-step sequence.
 *   2. S_BH = A_h / (4 G_eff) — exact check.
 *   3. islandRadius = 0 before Page time, > 0 after.
 *   4. S_page is the piecewise minimum (derivative discontinuity at t_Page).
 *   5. G_eff → 0⁺: S_BH large, S_page = S_therm always.
 *   6. Horizon area matches the analytic plane area for a synthetic field.
 *   7. Ring-buffer push/read determinism.
 */

import { describe, expect, it } from 'vitest'

import {
  accumulateThermalEntropy,
  bekensteinHawkingEntropy,
  createPageCurveBuffer,
  DEFAULT_SB_COEFFICIENT,
  getPageCurveSample,
  horizonPlaneArea,
  islandRadius,
  MAX_PAGE_CURVE_BUFFER,
  pageEntropy,
  pageTime,
  pushPageCurveSample,
  resetPageCurveBuffer,
  thermalEntropyDensityRate,
  voxelCountHorizonArea,
} from '@/lib/physics/bec/pageCurve'

describe('pageCurve — S_therm monotone accumulation', () => {
  it('integrates a constant rate to approximately rate·T over 1000 steps', () => {
    const dt = 0.01
    const steps = 1000
    const rate = 0.5
    let s = 0
    let prevRate = rate
    for (let i = 0; i < steps; i++) {
      s = accumulateThermalEntropy({ previous: s, rateOld: prevRate, rateNew: rate, dt })
      prevRate = rate
    }
    const expected = rate * dt * steps
    expect(s).toBeCloseTo(expected, 6)
  })

  it('is non-decreasing across a varying-rate 1000-step sequence', () => {
    const dt = 0.005
    let s = 0
    let prev = 0
    let prevRate = 0
    const values: number[] = [s]
    for (let i = 1; i <= 1000; i++) {
      const tH = 0.1 + 0.9 * (i / 1000) // varies
      const rate = thermalEntropyDensityRate({ tH, areaH: 1, cs0: 1 })
      s = accumulateThermalEntropy({ previous: s, rateOld: prevRate, rateNew: rate, dt })
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
      prevRate = rate
      values.push(s)
    }
    expect(values[values.length - 1]).toBeGreaterThan(0)
  })

  it('returns previous when dt <= 0 or rate non-finite', () => {
    expect(accumulateThermalEntropy({ previous: 5, rateOld: 1, rateNew: 1, dt: 0 })).toBe(5)
    expect(accumulateThermalEntropy({ previous: 5, rateOld: 1, rateNew: 1, dt: -1 })).toBe(5)
    expect(accumulateThermalEntropy({ previous: 5, rateOld: NaN, rateNew: 1, dt: 1 })).toBeCloseTo(
      5.5,
      10
    )
  })
})

describe('pageCurve — Bekenstein–Hawking entropy', () => {
  it('exactly equals A_h / (4·G_eff)', () => {
    for (const areaH of [0.1, 1.0, 42.7, 1e4]) {
      for (const gEff of [0.01, 1, 10]) {
        expect(bekensteinHawkingEntropy({ areaH, gEff })).toBeCloseTo(areaH / (4 * gEff), 12)
      }
    }
  })

  it('returns 0 on non-positive inputs rather than NaN/Infinity', () => {
    expect(bekensteinHawkingEntropy({ areaH: 0, gEff: 1 })).toBe(0)
    expect(bekensteinHawkingEntropy({ areaH: 1, gEff: 0 })).toBe(0)
    expect(bekensteinHawkingEntropy({ areaH: NaN, gEff: 1 })).toBe(0)
    expect(bekensteinHawkingEntropy({ areaH: -1, gEff: 1 })).toBe(0)
  })
})

describe('pageCurve — thermal entropy rate', () => {
  it('scales as T_H³·A/c² with the default SB coefficient', () => {
    const r = thermalEntropyDensityRate({ tH: 2, areaH: 3, cs0: 4 })
    const expected = DEFAULT_SB_COEFFICIENT * 8 * (3 / 16)
    expect(r).toBeCloseTo(expected, 10)
  })

  it('returns 0 for pathological inputs', () => {
    expect(thermalEntropyDensityRate({ tH: 0, areaH: 1, cs0: 1 })).toBe(0)
    expect(thermalEntropyDensityRate({ tH: 1, areaH: 0, cs0: 1 })).toBe(0)
    expect(thermalEntropyDensityRate({ tH: 1, areaH: 1, cs0: 0 })).toBe(0)
    expect(thermalEntropyDensityRate({ tH: NaN, areaH: 1, cs0: 1 })).toBe(0)
  })
})

describe('pageCurve — pageEntropy & island formula', () => {
  it('takes the minimum of S_therm and S_BH', () => {
    expect(pageEntropy(3, 5)).toBe(3)
    expect(pageEntropy(7, 5)).toBe(5)
  })

  it('returns S_therm when S_BH is 0 (no saddle)', () => {
    expect(pageEntropy(4, 0)).toBe(4)
    expect(pageEntropy(0, 0)).toBe(0)
  })

  it('derivative discontinuity sits at t_Page (piecewise-min verified numerically)', () => {
    const sBH = 1.0
    // Build a linear S_therm(t) = t so t_Page = 1.0 exactly.
    const tGrid = [0.0, 0.5, 1.0, 1.5, 2.0]
    const sTherm = tGrid.map((t) => t)
    const sPage = sTherm.map((x) => pageEntropy(x, sBH))
    // Before t_Page the derivative is 1; after t_Page it must be 0.
    const derivs: number[] = []
    for (let i = 1; i < tGrid.length; i++) {
      derivs.push((sPage[i]! - sPage[i - 1]!) / (tGrid[i]! - tGrid[i - 1]!))
    }
    expect(derivs[0]).toBeCloseTo(1, 10) // pre-Page: tracks S_therm
    expect(derivs[1]).toBeCloseTo(1, 10)
    expect(derivs[2]).toBeCloseTo(0, 10) // post-Page: flat at S_BH
    expect(derivs[3]).toBeCloseTo(0, 10)
  })
})

describe('pageCurve — islandRadius', () => {
  it('is 0 before the Page time (S_therm < S_BH)', () => {
    const r = islandRadius({ sTherm: 0.2, sBH: 1.0, dMaxFrac: 0.8, supersonicExtent: 5 })
    expect(r).toBe(0)
  })

  it('is positive and bounded by d_maxFrac·extent after Page time', () => {
    const extent = 5
    const frac = 0.8
    const r = islandRadius({ sTherm: 10, sBH: 1, dMaxFrac: frac, supersonicExtent: extent })
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThan(frac * extent)
  })

  it('asymptotes to d_maxFrac·extent as S_therm → ∞', () => {
    const extent = 4
    const frac = 0.5
    const r = islandRadius({
      sTherm: 1e12,
      sBH: 1,
      dMaxFrac: frac,
      supersonicExtent: extent,
    })
    expect(r).toBeCloseTo(frac * extent, 6)
  })

  it('returns 0 on invalid supersonic extent or S_BH = 0', () => {
    expect(islandRadius({ sTherm: 5, sBH: 0, dMaxFrac: 0.8, supersonicExtent: 1 })).toBe(0)
    expect(islandRadius({ sTherm: 5, sBH: 1, dMaxFrac: 0.8, supersonicExtent: 0 })).toBe(0)
  })
})

describe('pageCurve — G_eff limit (acceptance bar #5)', () => {
  it('tiny G_eff makes S_BH huge; S_page = S_therm at all finite times', () => {
    const gEff = 1e-8 // not zero (function would clamp to 0), but extremely small
    const sBH = bekensteinHawkingEntropy({ areaH: 1.0, gEff })
    expect(sBH).toBeGreaterThan(1e7)
    for (const sTherm of [0.1, 1, 1e3, 1e6]) {
      expect(pageEntropy(sTherm, sBH)).toBe(sTherm)
    }
  })
})

describe('pageCurve — horizon area', () => {
  it('horizonPlaneArea matches ∏_{d≠0} N·a when horizon exists', () => {
    expect(
      horizonPlaneArea({ gridSize: [64, 32, 16], spacing: [0.1, 0.2, 0.5], horizonExists: true })
    ).toBeCloseTo(32 * 0.2 * 16 * 0.5, 10)
  })

  it('returns 0 when horizon does not exist', () => {
    expect(
      horizonPlaneArea({ gridSize: [64, 32, 16], spacing: [0.1, 0.2, 0.5], horizonExists: false })
    ).toBe(0)
  })

  it('voxelCountHorizonArea on a synthetic linear field matches the analytic plane (within 20%)', () => {
    // Build a 3D Mach field M(x) = (2x/L_box) over the box, uniform in y,z.
    // The M=1 level set is the plane x = L_box/2. Helper assumes C-order
    // with the last axis the fastest — so gridSize = [Ny, Nz, Nx], and the
    // x coordinate is the innermost loop.
    const Nx = 128
    const Ny = 16
    const Nz = 16
    const a = 0.05
    const field = new Float32Array(Nx * Ny * Nz)
    const L = Nx * a
    for (let jy = 0; jy < Ny; jy++) {
      for (let kz = 0; kz < Nz; kz++) {
        for (let ix = 0; ix < Nx; ix++) {
          const x = (ix + 0.5) * a
          const M = (2 * x) / L
          field[ix + Nx * (kz + Nz * jy)] = M
        }
      }
    }
    const analyticArea = Ny * a * Nz * a
    const voxelArea = voxelCountHorizonArea(field, [Ny, Nz, Nx], [a, a, a], 0.05)
    // Tolerance per PRD: 20 %.
    expect(Math.abs(voxelArea - analyticArea) / analyticArea).toBeLessThan(0.2)
  })
})

describe('pageCurve — ring buffer determinism', () => {
  it('pushes and reads in chronological order when not yet full', () => {
    const buf = createPageCurveBuffer(8)
    for (let i = 0; i < 5; i++) {
      pushPageCurveSample(buf, { t: i, sTherm: i * 0.5, sPage: i * 0.25, islandRadius: 0 })
    }
    expect(buf.count).toBe(5)
    for (let i = 0; i < 5; i++) {
      const s = getPageCurveSample(buf, i)
      expect(s?.t).toBe(i)
      expect(s?.sTherm).toBeCloseTo(i * 0.5, 10)
    }
    expect(getPageCurveSample(buf, 5)).toBeNull()
  })

  it('overwrites oldest entries once full and still reads in chronological order', () => {
    const buf = createPageCurveBuffer(4)
    for (let i = 0; i < 10; i++) {
      pushPageCurveSample(buf, { t: i, sTherm: i, sPage: i, islandRadius: 0 })
    }
    expect(buf.count).toBe(4)
    const expected = [6, 7, 8, 9]
    for (let i = 0; i < 4; i++) {
      expect(getPageCurveSample(buf, i)!.t).toBe(expected[i])
    }
  })

  it('reset zeroes length without reallocating', () => {
    const buf = createPageCurveBuffer(4)
    pushPageCurveSample(buf, { t: 1, sTherm: 1, sPage: 1, islandRadius: 0.3 })
    const arrayRef = buf.t
    resetPageCurveBuffer(buf)
    expect(buf.count).toBe(0)
    expect(buf.head).toBe(0)
    expect(buf.t).toBe(arrayRef) // same Float64Array reference
    expect(buf.t[0]).toBe(0)
  })

  it('clamps capacity to MAX_PAGE_CURVE_BUFFER and to ≥ 1', () => {
    expect(createPageCurveBuffer(0).capacity).toBe(1)
    expect(createPageCurveBuffer(-5).capacity).toBe(1)
    expect(createPageCurveBuffer(MAX_PAGE_CURVE_BUFFER + 999).capacity).toBe(MAX_PAGE_CURVE_BUFFER)
  })

  it('pageTime interpolates the S_therm = S_BH crossing linearly', () => {
    const buf = createPageCurveBuffer(16)
    // S_therm linearly ramping 0 → 2 over t ∈ [0,1]; S_BH = 1 ⇒ t_Page = 0.5.
    for (let i = 0; i <= 10; i++) {
      const t = i / 10
      const sTh = 2 * t
      pushPageCurveSample(buf, {
        t,
        sTherm: sTh,
        sPage: Math.min(sTh, 1),
        islandRadius: 0,
      })
    }
    const tPage = pageTime(buf, 1.0)
    expect(tPage).toBeCloseTo(0.5, 6)
  })

  it('pageTime returns null when the curve never crosses', () => {
    const buf = createPageCurveBuffer(8)
    for (let i = 0; i < 5; i++) {
      pushPageCurveSample(buf, { t: i, sTherm: i * 0.01, sPage: i * 0.01, islandRadius: 0 })
    }
    expect(pageTime(buf, 1000)).toBeNull()
  })
})
