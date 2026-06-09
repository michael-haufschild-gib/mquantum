import { describe, expect, it } from 'vitest'

import {
  catStateDensity,
  coherenceHorizonBoundingRadius,
  coherenceVisibility,
  criticalImpactParameter,
  l1BranchCoherence,
  photonSphereRadius,
  tangherliniHorizonRadius,
  tangherliniMetricF,
} from '@/lib/physics/coherenceHorizon'

describe('coherenceVisibility / l1BranchCoherence', () => {
  it('is 1 at full coherence and exactly 0 at full decoherence', () => {
    expect(coherenceVisibility(0)).toBe(1)
    expect(coherenceVisibility(1)).toBe(0)
    expect(l1BranchCoherence(1)).toBe(0)
  })

  it('clamps out-of-range and non-finite decoherence', () => {
    expect(coherenceVisibility(-3)).toBe(1)
    expect(coherenceVisibility(7)).toBe(0)
    expect(coherenceVisibility(Number.NaN)).toBe(1)
  })
})

describe('tangherliniHorizonRadius', () => {
  it('vanishes exactly at delta = 1 in every dimension', () => {
    for (let d = 3; d <= 11; d++) {
      expect(tangherliniHorizonRadius(1, 0.5, d)).toBe(0)
    }
  })

  it('equals horizonScale at full coherence', () => {
    for (let d = 3; d <= 11; d++) {
      expect(tangherliniHorizonRadius(0, 0.5, d)).toBeCloseTo(0.5, 12)
    }
  })

  it('is strictly decreasing in delta (d=3 and d=7)', () => {
    for (const d of [3, 7]) {
      let prev = Number.POSITIVE_INFINITY
      for (let i = 0; i <= 10; i++) {
        const rh = tangherliniHorizonRadius(i / 10, 0.5, d)
        expect(rh, `d=${d}, delta=${i / 10}`).toBeLessThan(prev)
        prev = rh
      }
    }
  })

  it('d=3 scales linearly in coherence; higher d compresses toward horizonScale', () => {
    // d=3: r_h = hs * v. At v=0.5 → 0.25.
    expect(tangherliniHorizonRadius(0.5, 0.5, 3)).toBeCloseTo(0.25, 12)
    // d=11: r_h = hs * v^(1/9). At v=0.5 → 0.5 * 0.5^(1/9) ≈ 0.4628.
    expect(tangherliniHorizonRadius(0.5, 0.5, 11)).toBeCloseTo(0.5 * Math.pow(0.5, 1 / 9), 12)
    // The high-d horizon persists longer under decoherence than the 3D one.
    expect(tangherliniHorizonRadius(0.5, 0.5, 11)).toBeGreaterThan(
      tangherliniHorizonRadius(0.5, 0.5, 3)
    )
  })
})

describe('tangherliniMetricF', () => {
  it('is exactly 0 at the horizon and approaches 1 far away', () => {
    for (const d of [3, 5, 9]) {
      expect(tangherliniMetricF(0.5, 0.5, d)).toBeCloseTo(0, 12)
      expect(tangherliniMetricF(1e6, 0.5, d)).toBeCloseTo(1, 6)
    }
  })

  it('is negative inside the horizon and 1 when no horizon exists', () => {
    expect(tangherliniMetricF(0.25, 0.5, 3)).toBeLessThan(0)
    expect(tangherliniMetricF(0.25, 0, 3)).toBe(1)
  })

  it('falls off faster in higher dimensions (sharper lensing wall)', () => {
    // At r = 2 r_h: f_3 = 1 - 1/2 = 0.5; f_6 = 1 - (1/2)^4 = 0.9375.
    expect(tangherliniMetricF(1.0, 0.5, 3)).toBeCloseTo(0.5, 12)
    expect(tangherliniMetricF(1.0, 0.5, 6)).toBeCloseTo(1 - 0.5 ** 4, 12)
  })
})

describe('photonSphereRadius / criticalImpactParameter', () => {
  it('reproduces Schwarzschild r_ph = 1.5 r_h at d=3', () => {
    expect(photonSphereRadius(0.5, 3)).toBeCloseTo(0.75, 12)
  })

  it('reproduces the Tangherlini photon sphere (d/2)^(1/(d-2)) in higher d', () => {
    // d=4: r_ph = r_h * sqrt(2)
    expect(photonSphereRadius(0.5, 4)).toBeCloseTo(0.5 * Math.SQRT2, 12)
  })

  it('photon sphere maximizes the effective potential f(r)/r^2', () => {
    for (const d of [3, 5, 8]) {
      const rh = 0.5
      const rPh = photonSphereRadius(rh, d)
      const V = (r: number) => tangherliniMetricF(r, rh, d) / (r * r)
      expect(V(rPh)).toBeGreaterThan(V(rPh * 1.01))
      expect(V(rPh)).toBeGreaterThan(V(rPh * 0.99))
    }
  })

  it('critical impact parameter is b_c = r_ph / sqrt(f(r_ph)) (= 1.5*sqrt(3)*r_h at d=3)', () => {
    expect(criticalImpactParameter(0.5, 3)).toBeCloseTo(0.5 * 1.5 * Math.sqrt(3), 12)
    expect(criticalImpactParameter(0, 3)).toBe(0)
  })
})

describe('catStateDensity', () => {
  const base = { separation: 1.6, width: 0.45, waveNumber: 5, decoherence: 0 }

  it('diagonal part is invariant under decoherence at every sampled point', () => {
    for (const u of [-2, -1.6, -0.5, 0, 0.5, 1.6, 2]) {
      for (const perpSq of [0, 0.25, 1]) {
        const coherent = catStateDensity(u, perpSq, { ...base, decoherence: 0 })
        const decohered = catStateDensity(u, perpSq, { ...base, decoherence: 1 })
        expect(decohered.diagonal).toBeCloseTo(coherent.diagonal, 12)
      }
    }
  })

  it('cross term vanishes exactly at delta = 1', () => {
    const sample = catStateDensity(0.1, 0, { ...base, decoherence: 1 })
    expect(sample.cross).toBe(0)
    expect(sample.total).toBeCloseTo(sample.diagonal, 12)
  })

  it('total density is non-negative even at fringe minima', () => {
    for (let i = 0; i <= 200; i++) {
      const u = -2.5 + (5 * i) / 200
      const { total } = catStateDensity(u, 0, base)
      expect(total, `u=${u}`).toBeGreaterThanOrEqual(0)
    }
  })

  it('fringes oscillate with period pi/k along the axis', () => {
    const period = Math.PI / base.waveNumber
    const a = catStateDensity(0.05, 0, base)
    const b = catStateDensity(0.05 + period, 0, base)
    // Same fringe phase one period later — cross terms agree up to the
    // slowly-varying Gaussian envelope (within a few percent at the center).
    expect(Math.sign(a.cross)).toBe(Math.sign(b.cross))
  })

  it('peaks at the branch centers ±s', () => {
    const atLobe = catStateDensity(base.separation, 0, base)
    const offLobe = catStateDensity(base.separation + 1, 0, base)
    expect(atLobe.total).toBeGreaterThan(offLobe.total)
  })
})

describe('coherenceHorizonBoundingRadius', () => {
  const config = { decoherence: 0, separation: 1.6, width: 0.45, horizonScale: 0.5 }

  it('contains the cat cloud (s + 3.5 w) and never shrinks below 2', () => {
    expect(coherenceHorizonBoundingRadius(config, 3)).toBeGreaterThanOrEqual(1.6 + 3.5 * 0.45)
    expect(
      coherenceHorizonBoundingRadius(
        { decoherence: 1, separation: 0.5, width: 0.15, horizonScale: 0 },
        3
      )
    ).toBe(2)
  })

  it('does not pump while the decoherence slider animates', () => {
    const coherent = coherenceHorizonBoundingRadius({ ...config, decoherence: 0 }, 3)
    const half = coherenceHorizonBoundingRadius({ ...config, decoherence: 0.5 }, 3)
    const full = coherenceHorizonBoundingRadius({ ...config, decoherence: 1 }, 3)
    expect(half).toBe(coherent)
    expect(full).toBe(coherent)
  })
})
