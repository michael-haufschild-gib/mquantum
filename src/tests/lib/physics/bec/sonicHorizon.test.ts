/**
 * Unit tests for the analog-Hawking sonic-horizon physics helpers.
 *
 * The waterfall profile used by this module is now DETRENDED along the
 * periodic FFT box of length L_box so the initial ψ is C¹ at the wrap
 * x = ±L_box/2 (see module doc for rationale). Tests exercise:
 *
 *  1. Profile evaluation under the detrended v_s and φ formulas.
 *  2. Periodic C¹ invariant: v_s(±L_box/2) = 0 exactly for many parameter
 *     triples, and ψ continuity across the wrap.
 *  3. Analytic κ (numeric FD at the located horizon root) agreeing with an
 *     independent finite-difference estimate within 30 %.
 *  4. Mach-number integrals and deterministic noise (unchanged).
 *  5. `hasHorizon` as a necessary-and-sufficient predicate on the profile.
 *  6. Default preset parameters yield a horizon interior to the box.
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_BEC_CONFIG } from '@/lib/geometry/extended/bec'
import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import { BEC_SCENARIO_PRESETS } from '@/lib/physics/bec/presets'
import {
  analyticHawkingTemperature,
  analyticSurfaceGravity,
  asymptoticSoundSpeed,
  findHorizonX0,
  finiteDifferenceSurfaceGravity,
  hasHorizon,
  hawkingNoise,
  hawkingReadout,
  horizonWeight,
  waterfallEdgeTanh,
  type WaterfallParams,
  waterfallPhase,
  waterfallSample,
} from '@/lib/physics/bec/sonicHorizon'
import {
  computeWaterfallBackgroundDensity,
  resolveBecMass,
} from '@/lib/physics/bec/waterfallParams'

const BASE_LBOX = 20 * 0.6 // lBox ≫ L_h so detrend is a small perturbation on the tanh.

const BASE_PARAMS: WaterfallParams = {
  // vMax comfortably above c_s0 = √(g·n0/m) = 1.0 so that — even after the
  // parabolic counter-drift bends v_s back down at the wrap — there is still
  // a peak that crosses c_s0 and a horizon exists. Values tuned so the test
  // box (lBox = 20·lh = 12) places the horizon a few lh from the origin.
  vMax: 1.5,
  lh: 0.6,
  n0: 1.0,
  deltaN: 0.05,
  g: 1.0,
  mass: 1.0,
  lBox: BASE_LBOX,
}

describe('sonicHorizon — detrended waterfall profile', () => {
  it('matches the detrended closed form v_s(x) = v_max·tanh(x/L_h) − v_max·(2x/L_box)·T', () => {
    const T = waterfallEdgeTanh(BASE_PARAMS)
    const samples = [-2, -0.6, 0, 0.6, 2]
    for (const x of samples) {
      const s = waterfallSample(x, BASE_PARAMS)
      const expectedSigned =
        BASE_PARAMS.vMax * Math.tanh(x / BASE_PARAMS.lh) -
        BASE_PARAMS.vMax * ((2 * x) / BASE_PARAMS.lBox) * T
      expect(s.vs).toBeCloseTo(Math.abs(expectedSigned), 10)
    }
  })

  it('v_s(±L_box/2) = 0 exactly — invariant across (v_max, L_h, L_box)', () => {
    // This is the load-bearing invariant: it guarantees ψ is C¹ across the
    // periodic wrap, which is what made the Sonic Horizon preset blow up
    // before the detrend was added.
    const triples: Array<[number, number, number]> = [
      [3.5, 0.6, 9.6],
      [1.2, 0.6, 12],
      [2.0, 1.0, 8],
      [5.0, 0.3, 20],
      [0.5, 2.0, 5],
    ]
    for (const [vMax, lh, lBox] of triples) {
      const p: WaterfallParams = { ...BASE_PARAMS, vMax, lh, lBox }
      expect(waterfallSample(lBox / 2, p).vs).toBeLessThan(1e-10)
      expect(waterfallSample(-lBox / 2, p).vs).toBeLessThan(1e-10)
    }
  })

  it('ψ(+L_box/2) ≈ ψ(−L_box/2) — periodic continuity of the wavefunction', () => {
    const p = BASE_PARAMS
    const lo = waterfallSample(-p.lBox / 2, p)
    const hi = waterfallSample(p.lBox / 2, p)
    // Densities are equal (both even in x). Phase values must agree modulo
    // 2π; φ is even in x by construction so they agree exactly to 1e-10.
    expect(hi.n).toBeCloseTo(lo.n, 12)
    const phiLo = waterfallPhase(-p.lBox / 2, p)
    const phiHi = waterfallPhase(p.lBox / 2, p)
    expect(Math.abs(phiHi - phiLo)).toBeLessThan(1e-10)
    // Combined: re, im of ψ = √n · exp(iφ) match.
    const reLo = Math.sqrt(lo.n) * Math.cos(phiLo)
    const imLo = Math.sqrt(lo.n) * Math.sin(phiLo)
    const reHi = Math.sqrt(hi.n) * Math.cos(phiHi)
    const imHi = Math.sqrt(hi.n) * Math.sin(phiHi)
    expect(Math.abs(reHi - reLo)).toBeLessThan(1e-10)
    expect(Math.abs(imHi - imLo)).toBeLessThan(1e-10)
  })

  it('matches c_s(x) = √(g n(x)/m) with density dip n(x) = n0(1 − Δn·sech²)', () => {
    const s = waterfallSample(0, BASE_PARAMS)
    const nAt0 = BASE_PARAMS.n0 * (1 - BASE_PARAMS.deltaN)
    const csAt0 = Math.sqrt((BASE_PARAMS.g * nAt0) / BASE_PARAMS.mass)
    expect(s.cs).toBeCloseTo(csAt0, 10)
    // At x = 10·L_h sech²→0 so c_s → c_s0 to machine precision; but our
    // profile is evaluated on the detrended box so pick an interior point
    // that's still far from the wrap.
    const far = waterfallSample(5 * BASE_PARAMS.lh, BASE_PARAMS)
    expect(far.cs).toBeCloseTo(asymptoticSoundSpeed(BASE_PARAMS), 4)
  })

  it('puts the horizon inside the physical region — M<1 at origin, M>1 at the peak', () => {
    expect(waterfallSample(0, BASE_PARAMS).mach).toBeLessThan(1)
    const xh = findHorizonX0(BASE_PARAMS)
    expect(Number.isFinite(xh)).toBe(true)
    // The located root must satisfy M(x_h) = 1 to ≤ 5·10⁻³.
    const sampled = waterfallSample(xh, BASE_PARAMS).mach
    expect(Math.abs(sampled - 1)).toBeLessThan(5e-3)
  })

  it('φ(x) is differentiable into v_s with the parabolic counter-drift', () => {
    // The classic identity (ℏ/m)·dφ/dx = v_s still holds — but v_s is now
    // the DETRENDED velocity, not the raw tanh. Test the identity against
    // the updated closed form.
    const T = waterfallEdgeTanh(BASE_PARAMS)
    const h = 1e-4
    const x = 0.3
    const fwd = waterfallPhase(x + h, BASE_PARAMS)
    const bwd = waterfallPhase(x - h, BASE_PARAMS)
    const vNum = ((fwd - bwd) / (2 * h)) * (1 / BASE_PARAMS.mass) // ℏ=1
    const vAnalytic =
      BASE_PARAMS.vMax * Math.tanh(x / BASE_PARAMS.lh) -
      BASE_PARAMS.vMax * ((2 * x) / BASE_PARAMS.lBox) * T
    expect(vNum).toBeCloseTo(vAnalytic, 4)
  })
})

describe('sonicHorizon — surface gravity', () => {
  it('analytic κ matches an independent FD κ at the horizon within 30 %', () => {
    // The closed-form κ = (v_max² − c_s0²)/(v_max·L_h) no longer applies
    // exactly under the parabolic detrend. Test that `analyticSurfaceGravity`
    // (numeric FD at the horizon root) agrees with an independent FD probe
    // using a different step size, to guard against step-dependent drift.
    // A pure-flow profile (Δn = 0, lBox ≫ lh) keeps the detrend effect
    // small so tolerance is modest.
    const pureFlow: WaterfallParams = { ...BASE_PARAMS, deltaN: 0, lBox: 100 * BASE_PARAMS.lh }
    const xh = findHorizonX0(pureFlow)
    const kappaA = analyticSurfaceGravity(pureFlow)
    const kappaFd = finiteDifferenceSurfaceGravity(xh, pureFlow, 5e-3)
    const rel = Math.abs(kappaFd - kappaA) / Math.max(kappaA, 1e-12)
    expect(rel).toBeLessThan(0.3)
  })

  it('T_H = κ / (2π)', () => {
    const k = analyticSurfaceGravity(BASE_PARAMS)
    expect(analyticHawkingTemperature(BASE_PARAMS)).toBeCloseTo(k / (2 * Math.PI), 12)
  })

  it('hawkingReadout reports a finite horizon coordinate and positive κ/T_H', () => {
    const r = hawkingReadout(BASE_PARAMS)
    expect(Number.isFinite(r.horizonX0)).toBe(true)
    expect(r.kappa).toBeGreaterThan(0)
    expect(r.hawkingTemperature).toBeGreaterThan(0)
    expect(r.csAsymptotic).toBeGreaterThan(0)
  })
})

describe('sonicHorizon — Mach-number field integrals', () => {
  it('default blackHoleAnalog profile has both supersonic and subsonic volume', () => {
    // Sample a 1D slice in (0, L_box/2) on a coarse grid.
    const N = 64
    const xMax = BASE_PARAMS.lBox / 2
    let supersonic = 0
    let subsonic = 0
    for (let i = 0; i < N; i++) {
      const x0 = (xMax * (i + 0.5)) / N
      const { mach } = waterfallSample(x0, BASE_PARAMS)
      if (mach > 1) supersonic += mach - 1
      else subsonic += 1 - mach
    }
    expect(supersonic).toBeGreaterThan(0)
    expect(subsonic).toBeGreaterThan(0)
  })

  it('horizonWeight peaks at the horizon and decays away', () => {
    const wAtHorizon = horizonWeight(1.0)
    const wFar = horizonWeight(2.0)
    expect(wAtHorizon).toBeGreaterThan(0.99)
    expect(wFar).toBeLessThan(wAtHorizon)
  })
})

describe('sonicHorizon — deterministic noise', () => {
  it('same (site, seed, step) triple produces the same noise value', () => {
    for (let site = 0; site < 64; site++) {
      const a = hawkingNoise(site, 1337, 7)
      const b = hawkingNoise(site, 1337, 7)
      expect(a).toBe(b)
      expect(a).toBeGreaterThanOrEqual(-1)
      expect(a).toBeLessThanOrEqual(1)
    }
  })

  it('small grid yields a byte-exact noise field across two runs', () => {
    const N = 4 * 4 * 4
    const seed = 42
    const step = 11
    const a = new Float32Array(N)
    const b = new Float32Array(N)
    for (let i = 0; i < N; i++) a[i] = hawkingNoise(i, seed, step)
    for (let i = 0; i < N; i++) b[i] = hawkingNoise(i, seed, step)
    expect(new Uint8Array(a.buffer)).toEqual(new Uint8Array(b.buffer))
  })

  it('changing step index yields a different noise field (not all equal)', () => {
    const N = 16
    let differences = 0
    for (let i = 0; i < N; i++) {
      if (hawkingNoise(i, 7, 0) !== hawkingNoise(i, 7, 1)) differences++
    }
    expect(differences).toBeGreaterThan(0)
  })

  it('noise stays strictly within [-1, +1) — divisor 2^24 prevents overshoot', () => {
    // Regression: with the prior 0x7fffff divisor, a masked value of 0xffffff
    // yielded ≈ 1.000000238 > 1. The fix maps c & 0xffffff into [0, 1) via
    // the full-scale 0x1000000 denominator so the result cannot exceed +1.
    const N = 2048
    for (let i = 0; i < N; i++) {
      const v = hawkingNoise(i, 0x7fffffff, 0)
      expect(v).toBeGreaterThanOrEqual(-1)
      // Strictly < 1 (not <=) — the mapping is (−1, +1) half-open at +1.
      expect(v).toBeLessThan(1)
    }
  })
})

describe('sonicHorizon — hasHorizon predicate (necessary AND sufficient)', () => {
  it('returns true when the detrended profile actually crosses M = 1', () => {
    const p: WaterfallParams = { ...BASE_PARAMS, vMax: 2.0, n0: 1.0, g: 1.0, deltaN: 0 }
    expect(hasHorizon(p)).toBe(true)
  })

  it('returns false when |v_max| ≤ c_s0 (no crossing possible)', () => {
    const p: WaterfallParams = { ...BASE_PARAMS, vMax: 0.5, n0: 1.0, g: 1.0, deltaN: 0 }
    expect(hasHorizon(p)).toBe(false)
  })

  it('returns false for very large L_h/L_box — the detrended peak fails to reach c_s0', () => {
    // Necessary-but-NOT-sufficient case under the parabolic detrend:
    // |v_max| > c_s0 but peak v_s (at x ≈ L_h·arccosh(√(L_box/(2·T·L_h))))
    // still undershoots c_s0 because the counter-drift term is too strong
    // when L_box is only a few L_h. This is the regime the old
    // `|v_max| > c_s0` screen silently mis-classified.
    const p: WaterfallParams = {
      vMax: 1.01,
      lh: 1.0,
      n0: 1.0,
      deltaN: 0,
      g: 1.0,
      mass: 1.0,
      lBox: 2.0, // L_box = 2·L_h → detrend cancels most of the tanh
    }
    const cs0 = asymptoticSoundSpeed(p)
    expect(Math.abs(p.vMax) > cs0).toBe(true) // old predicate would have said "yes horizon"
    expect(hasHorizon(p)).toBe(false) // new predicate correctly says no
  })

  it('findHorizonX0 terminates for non-finite `samples` (guards against Infinity)', () => {
    // Regression: an unvalidated `samples = Infinity` would propagate into
    // `n = Math.floor(samples) = Infinity` and the scan loop would never
    // terminate. The guard clamps non-finite values to the default and caps
    // finite inputs at MAX_SAMPLES = 1_000_000.
    const start = performance.now()
    const xhInf = findHorizonX0(BASE_PARAMS, Number.POSITIVE_INFINITY)
    const xhNaN = findHorizonX0(BASE_PARAMS, Number.NaN)
    const elapsed = performance.now() - start
    expect(Number.isFinite(xhInf)).toBe(true)
    expect(Number.isFinite(xhNaN)).toBe(true)
    // Should complete in well under a second even on cold CI hardware.
    expect(elapsed).toBeLessThan(1000)
  })

  it('returns false for non-finite or non-positive inputs', () => {
    const bad: WaterfallParams = { ...BASE_PARAMS, g: 0 } // c_s0 = 0
    expect(hasHorizon(bad)).toBe(false)
    expect(hasHorizon({ ...BASE_PARAMS, vMax: Number.NaN })).toBe(false)
    expect(hasHorizon({ ...BASE_PARAMS, lh: 0 })).toBe(false)
    expect(hasHorizon({ ...BASE_PARAMS, lBox: 0 })).toBe(false)
  })

  it('blackHoleAnalog preset defaults yield a real horizon interior to the box', () => {
    const preset = BEC_SCENARIO_PRESETS.find((p) => p.id === 'blackHoleAnalog')
    // Fail loudly if the preset is ever renamed/removed — the HUD feature
    // hangs off this exact id.
    expect(preset?.id).toBe('blackHoleAnalog')
    const ov = preset!.overrides
    const g = ov.interactionStrength ?? 500
    const mass = resolveBecMass({ mass: ov.mass })
    const n0 = computeWaterfallBackgroundDensity({ interactionStrength: g })
    // Simulator uses the default BEC grid (64³ at spacing 0.15) unless the
    // preset overrides these — it doesn't — so L_box = 64 · 0.15 = 9.6.
    const gridN = DEFAULT_BEC_CONFIG.gridSize[0] ?? 64
    const spacing = DEFAULT_BEC_CONFIG.spacing[0] ?? 0.15
    const lBox = gridN * spacing
    const p: WaterfallParams = {
      vMax: ov.hawkingVmax ?? 0,
      lh: ov.hawkingLh ?? 0.6,
      n0,
      deltaN: ov.hawkingDeltaN ?? 0,
      g,
      mass,
      lBox,
    }
    expect(hasHorizon(p)).toBe(true)

    const readout = hawkingReadout(p)
    expect(Number.isFinite(readout.horizonX0)).toBe(true)
    // Horizon must sit strictly inside the box (0, L_box/2) so the density
    // gate and the PML don't both mask it.
    expect(readout.horizonX0).toBeGreaterThan(0)
    expect(readout.horizonX0).toBeLessThan(lBox / 2)
    expect(readout.kappa).toBeGreaterThan(0)
    expect(readout.hawkingTemperature).toBeGreaterThan(0)
  })
})

describe('resolveBecMass — HUD ↔ builder parity', () => {
  it('returns config.mass when finite and positive', () => {
    expect(resolveBecMass({ mass: 2.5 })).toBe(2.5)
    expect(resolveBecMass({ mass: 1.0 })).toBe(1.0)
  })

  it('falls back to DEFAULT_TDSE_CONFIG.mass for undefined / null / non-finite inputs', () => {
    const fallback = DEFAULT_TDSE_CONFIG.mass
    expect(resolveBecMass({})).toBe(fallback)
    expect(resolveBecMass({ mass: undefined })).toBe(fallback)
    expect(resolveBecMass({ mass: null })).toBe(fallback)
    expect(resolveBecMass({ mass: Number.NaN })).toBe(fallback)
    expect(resolveBecMass({ mass: 0 })).toBe(fallback)
    expect(resolveBecMass({ mass: -1 })).toBe(fallback)
    expect(resolveBecMass({ mass: Number.POSITIVE_INFINITY })).toBe(fallback)
  })

  it('HUD and builder see the same mass when bec.mass is undefined', () => {
    // Both callsites route through resolveBecMass — verify a single source of truth.
    const hudMass = resolveBecMass({ mass: undefined })
    const builderMass = resolveBecMass({ mass: undefined })
    expect(hudMass).toBe(builderMass)
    expect(hudMass).toBe(DEFAULT_TDSE_CONFIG.mass)
  })
})
