import { describe, expect, it } from 'vitest'

import {
  computeVolumeSlice,
  detectDips,
  evaluateEvansLine,
  fftComplex,
  HP_THETA_MAX,
  HP_VOL_NTHETA,
  HP_VOL_NX,
  HP_VOL_NY,
} from '@/lib/physics/hilbertPolya/evans'
import {
  ensembleComparison,
  intertwinerGram,
  minEigenvalueSym,
  onLinePoints,
  withDoublet,
} from '@/lib/physics/hilbertPolya/intertwiner'
import { RIEMANN_ZEROS, unfoldedZeroSpacings } from '@/lib/physics/riemannZeta'

describe('fftComplex', () => {
  it('matches a direct DFT on random data', () => {
    const n = 64
    const re = new Float64Array(n)
    const im = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      re[i] = Math.sin(3 * i + 1) * Math.cos(i * i * 0.1)
      im[i] = Math.cos(5 * i) * 0.3
    }
    const dRe = new Float64Array(n)
    const dIm = new Float64Array(n)
    for (let m = 0; m < n; m++) {
      for (let k = 0; k < n; k++) {
        const ph = (2 * Math.PI * m * k) / n
        dRe[m] = dRe[m]! + re[k]! * Math.cos(ph) - im[k]! * Math.sin(ph)
        dIm[m] = dIm[m]! + re[k]! * Math.sin(ph) + im[k]! * Math.cos(ph)
      }
    }
    fftComplex(re, im, 1)
    let maxErr = 0
    for (let m = 0; m < n; m++) {
      maxErr = Math.max(maxErr, Math.abs(re[m]! - dRe[m]!), Math.abs(im[m]! - dIm[m]!))
    }
    expect(maxErr).toBeLessThan(1e-10)
  })
})

describe('Evans landscape (rotated contour)', () => {
  it('finds the first Riemann zeros as dips on the real axis at θ_max', () => {
    const line = evaluateEvansLine(HP_THETA_MAX, 0, 60)
    const dips = detectDips(line, 5, 60, 0.3)
    const expected = RIEMANN_ZEROS.filter((t) => t < 60)
    expect(dips.length).toBe(expected.length)
    for (let i = 0; i < expected.length; i++) {
      expect(Math.abs(dips[i]!.x - expected[i]!)).toBeLessThan(0.05)
    }
  })

  it('hides zeros beyond z ≈ 23 at θ = 0 (the Matsubara veil)', () => {
    const line = evaluateEvansLine(0, 0, 60)
    // Above the f64 visibility line the signal is cancellation noise: the
    // true zeros at 30.4, 32.9, … are not recoverable as clean deep dips.
    const dips = detectDips(line, 28, 60, 0.05)
    const nearTrueZeros = dips.filter((d) => RIEMANN_ZEROS.some((t) => Math.abs(t - d.x) < 0.05))
    // γ₁=14.1, γ₂=21.0 are below the veil and outside this window; in the
    // veiled window the matches must be no better than chance (≤ 2 of ~6).
    expect(nearTrueZeros.length).toBeLessThanOrEqual(2)
    // …and the veil mask must report the region as unmeasurable.
    const m = Math.round(45 / line.dx)
    expect(line.absE[m]!).toBeLessThan(100 * line.noiseFloor)
  })

  it('sees the eta-prefactor comb at Im z = −1/2', () => {
    const line = evaluateEvansLine(HP_THETA_MAX, -0.5, 60)
    const dips = detectDips(line, 5, 60, 0.3)
    const comb = [1, 2, 3, 4, 5, 6].map((k) => (2 * Math.PI * k) / Math.LN2)
    for (const xk of comb) {
      const hit = dips.some((d) => Math.abs(d.x - xk) < 0.05)
      expect(hit).toBe(true)
    }
  })

  it('reports no deep dips on off-axis lines away from the eta comb', () => {
    const line = evaluateEvansLine(HP_THETA_MAX, 0.25, 60)
    const dips = detectDips(line, 5, 60, 0.05)
    expect(dips.length).toBe(0)
  })
})

describe('computeVolumeSlice', () => {
  it('produces filaments at zeros on the y=0 row of the top θ-slice', () => {
    const params = { zMax: 60, yExtent: 1 }
    const slice = computeVolumeSlice(HP_VOL_NTHETA - 1, params)
    expect(slice.length).toBe(HP_VOL_NX * HP_VOL_NY * 4)
    const jMid = Math.round((HP_VOL_NY - 1) / 2) // y = 0 row
    const xOf = (i: number): number => 5 + (i / (HP_VOL_NX - 1)) * 55
    // Filament profile as the shader applies it: strength·exp(−½(dist/w)²).
    const w = 0.25
    let onZeroMax = 0
    let offZeroMax = 0
    for (let i = 0; i < HP_VOL_NX; i++) {
      const idx = (jMid * HP_VOL_NX + i) * 4
      const strength = slice[idx]!
      const dist = slice[idx + 2]!
      const v = strength * Math.exp(-0.5 * (dist / w) ** 2)
      const nearZero = RIEMANN_ZEROS.some((t) => Math.abs(t - xOf(i)) < 1.2)
      if (nearZero) onZeroMax = Math.max(onZeroMax, v)
      else offZeroMax = Math.max(offZeroMax, v)
    }
    expect(onZeroMax).toBeGreaterThan(0.8)
    expect(offZeroMax).toBeLessThan(0.3)
  })

  it('marks the veil on the θ=0 slice at high Re z', () => {
    const params = { zMax: 120, yExtent: 1 }
    const slice = computeVolumeSlice(0, params)
    const jMid = Math.round((HP_VOL_NY - 1) / 2)
    // x ≈ 100 is deep inside the unrotated f64 veil.
    const i = Math.round(((100 - 5) / 115) * (HP_VOL_NX - 1))
    expect(slice[(jMid * HP_VOL_NX + i) * 4 + 1]!).toBeGreaterThan(0.9)
  })
})

describe('Weil intertwiner positivity', () => {
  const ordinates = RIEMANN_ZEROS.slice(0, 40)

  it('is positive definite on the true zeros', () => {
    for (const eps of [0.25, 1, 4]) {
      const g = intertwinerGram(onLinePoints(ordinates), eps)
      expect(minEigenvalueSym(g, ordinates.length)).toBeGreaterThan(0)
    }
  })

  it('detects an off-line doublet: λ_min < 0 once ε < |2β−1|', () => {
    const pts = withDoublet(ordinates, 0.7, 60.5)
    const fine = minEigenvalueSym(intertwinerGram(pts, 0.25), pts.length)
    expect(fine).toBeLessThan(0)
    const coarse = minEigenvalueSym(intertwinerGram(pts, 2), pts.length)
    expect(coarse).toBeGreaterThan(0)
  })

  it('GUE repulsion protects positivity: zeros beat Poisson at unit density', () => {
    const spacings = unfoldedZeroSpacings().slice(0, 39)
    const unfolded: number[] = [0]
    for (const s of spacings) unfolded.push(unfolded[unfolded.length - 1]! + s)
    const cmp = ensembleComparison(unfolded, 0.1)
    expect(cmp.zeros).toBeGreaterThan(10 * cmp.poissonMean)
    expect(cmp.picket).toBeGreaterThanOrEqual(cmp.zeros)
  })
})
