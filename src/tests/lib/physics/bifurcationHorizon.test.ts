import { describe, expect, it } from 'vitest'

import {
  BIFURCATION_DEFAULT_LUT,
  BIFURCATION_NT,
  BIFURCATION_NU,
  BIFURCATION_RING_COUNT,
  BIFURCATION_T_MAX,
  BIFURCATION_U_HALF,
  bifurcationHorizonBoundingRadius,
  bifurcationRingHeight,
  bifurcationSoftMode,
  buildLogGasLaplacian,
  generateBifurcationLut,
  jacobiEigenSymmetric,
  sampleBifurcationDensity,
  unfoldZeros,
} from '@/lib/physics/bifurcationHorizon'
import { RIEMANN_ZEROS } from '@/lib/physics/riemannZeta'

/** Generate the default on-line (RH-case) LUT once for the shared assertions. */
const lut = generateBifurcationLut(BIFURCATION_DEFAULT_LUT)

describe('generateBifurcationLut layout', () => {
  it('produces an interleaved Float32Array of length NT*NU*4', () => {
    expect(lut).toBeInstanceOf(Float32Array)
    expect(lut.length).toBe(BIFURCATION_NT * BIFURCATION_NU * 4)
  })

  it('is finite and the density channel is non-negative everywhere', () => {
    for (let i = 0; i < lut.length; i++) {
      expect(Number.isFinite(lut[i]!)).toBe(true)
    }
    for (let cell = 0; cell < BIFURCATION_NT * BIFURCATION_NU; cell++) {
      expect(lut[cell * 4]!).toBeGreaterThanOrEqual(0)
    }
  })

  it('normalises the density channel to unit peak', () => {
    let maxRho = 0
    for (let cell = 0; cell < BIFURCATION_NT * BIFURCATION_NU; cell++) {
      maxRho = Math.max(maxRho, lut[cell * 4]!)
    }
    expect(maxRho).toBeCloseTo(1, 5)
  })
})

describe('throat membrane (bifurcation surface at u=0)', () => {
  it('peaks at u=0 across the wedge axis (away from the rings)', () => {
    // Pick the midpoint between the first two zero-rings so the membrane (not a
    // ring) dominates: the ring Gaussian is negligible (>4σ) there.
    const ringHeights = RIEMANN_ZEROS.slice(0, BIFURCATION_RING_COUNT).map(bifurcationRingHeight)
    const tGap = (ringHeights[0]! + ringHeights[1]!) / 2
    expect(ringHeights.every((h) => Math.abs(h - tGap) > 0.3)).toBe(true)

    const center = sampleBifurcationDensity(lut, tGap, 0)
    const left = sampleBifurcationDensity(lut, tGap, -1.0)
    const right = sampleBifurcationDensity(lut, tGap, 1.0)
    expect(center).toBeGreaterThan(left)
    expect(center).toBeGreaterThan(right)
    expect(center).toBeGreaterThan(0)
  })

  it('would fail if the membrane Gaussian were broken (center must dominate the wedge)', () => {
    const h0 = bifurcationRingHeight(RIEMANN_ZEROS[0]!)
    const h1 = bifurcationRingHeight(RIEMANN_ZEROS[1]!)
    const tGap = (h0 + h1) / 2
    const center = sampleBifurcationDensity(lut, tGap, 0)
    // Far into the wedge the membrane has decayed below the background cut.
    const farWedge = sampleBifurcationDensity(lut, tGap, BIFURCATION_U_HALF * 0.9)
    expect(center).toBeGreaterThan(farWedge + 0.2)
  })
})

describe('zero rings stacked along the throat', () => {
  it('a column at t≈Y_0 (first zero) has a ring peak at u≈0', () => {
    const t0 = bifurcationRingHeight(RIEMANN_ZEROS[0]!)
    // On the throat at the ring height, density is at least the membrane peak
    // (ring + membrane stack), and strictly greater than the same wedge offset.
    const onRing = sampleBifurcationDensity(lut, t0, 0)
    const offRingU = sampleBifurcationDensity(lut, t0, 0.8)
    expect(onRing).toBeGreaterThan(offRingU)
    expect(onRing).toBeGreaterThan(0.5)
  })

  it('ring heights are GUE-spaced (strictly increasing, preserving relative spacing)', () => {
    const heights = RIEMANN_ZEROS.slice(0, BIFURCATION_RING_COUNT).map(bifurcationRingHeight)
    for (let n = 1; n < heights.length; n++) {
      expect(heights[n]!).toBeGreaterThan(heights[n - 1]!)
    }
    // First and last rings sit inside the window with margin.
    expect(heights[0]!).toBeGreaterThan(0)
    expect(heights[heights.length - 1]!).toBeLessThan(BIFURCATION_T_MAX)
  })
})

describe('u-symmetry of the on-line (RH-case) field', () => {
  it('F(t,u) ≈ F(t,−u) when offLine = 0 (modular mirror s ↦ 1−s̄)', () => {
    const t0 = bifurcationRingHeight(RIEMANN_ZEROS[1]!)
    for (const u of [0.3, 0.7, 1.2, 1.8]) {
      const plus = sampleBifurcationDensity(lut, t0, u)
      const minus = sampleBifurcationDensity(lut, t0, -u)
      expect(plus).toBeCloseTo(minus, 5)
    }
  })

  it('breaks u-symmetry when offLine > 0 (rings displaced off the throat)', () => {
    const offLut = generateBifurcationLut({ ...BIFURCATION_DEFAULT_LUT, offLine: 0.5 })
    const t0 = bifurcationRingHeight(RIEMANN_ZEROS[0]!) // even ring → +0.5 offset
    const plus = sampleBifurcationDensity(offLut, t0, 0.5)
    const minus = sampleBifurcationDensity(offLut, t0, -0.5)
    expect(Math.abs(plus - minus)).toBeGreaterThan(0.1)
  })
})

describe('density vanishes outside the LUT window', () => {
  it('returns exactly 0 outside [0,tMax] × [−uHalf,uHalf]', () => {
    expect(sampleBifurcationDensity(lut, -0.5, 0)).toBe(0)
    expect(sampleBifurcationDensity(lut, BIFURCATION_T_MAX + 1, 0)).toBe(0)
    expect(sampleBifurcationDensity(lut, 1, BIFURCATION_U_HALF + 0.5)).toBe(0)
    expect(sampleBifurcationDensity(lut, 1, -BIFURCATION_U_HALF - 0.5)).toBe(0)
  })
})

describe('bifurcationHorizonBoundingRadius', () => {
  it('is finite, positive, and capped at 14', () => {
    const r = bifurcationHorizonBoundingRadius(undefined, 3)
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThanOrEqual(14)
    // Default tMax = 12 → 12*0.55 + 1 = 7.6.
    expect(r).toBeCloseTo(BIFURCATION_T_MAX * 0.55 + 1.0, 5)
  })

  it('caps very large throat heights at 14', () => {
    expect(bifurcationHorizonBoundingRadius({ tMax: 100 }, 3)).toBe(14)
  })
})

/* ────────────────────────────────────────────────────────────── */
/*  Living log-gas: soft-mode / type-II₁ gaplessness               */
/* ────────────────────────────────────────────────────────────── */

describe('unfoldZeros', () => {
  it('applies the smooth Riemann–von Mangoldt count (mean spacing → 1)', () => {
    const x = unfoldZeros(RIEMANN_ZEROS.slice(0, 40))
    // Strictly increasing and unit mean spacing by construction.
    for (let i = 1; i < x.length; i++) expect(x[i]!).toBeGreaterThan(x[i - 1]!)
    const meanSpacing = (x[x.length - 1]! - x[0]!) / (x.length - 1)
    expect(meanSpacing).toBeCloseTo(1, 1)
  })
})

describe('buildLogGasLaplacian', () => {
  const unfolded = unfoldZeros(RIEMANN_ZEROS.slice(0, 40))
  const n = unfolded.length
  const M = buildLogGasLaplacian(unfolded)

  it('is symmetric: M_ik === M_ki', () => {
    for (let i = 0; i < n; i++) {
      for (let k = i + 1; k < n; k++) {
        expect(M[i * n + k]!).toBe(M[k * n + i]!)
      }
    }
  })

  it('has zero row-sums (uniform vector is the λ=0 rigid-shift mode)', () => {
    let maxAbsEntry = 0
    for (let i = 0; i < M.length; i++) maxAbsEntry = Math.max(maxAbsEntry, Math.abs(M[i]!))
    for (let i = 0; i < n; i++) {
      let sum = 0
      for (let k = 0; k < n; k++) sum += M[i * n + k]!
      expect(Math.abs(sum)).toBeLessThan(1e-6 * maxAbsEntry)
    }
  })

  it('has strictly positive diagonal stiffness K_i', () => {
    for (let i = 0; i < n; i++) expect(M[i * n + i]!).toBeGreaterThan(0)
  })
})

describe('jacobiEigenSymmetric', () => {
  it('diagonalises a known 2×2 symmetric matrix (deterministic, sorted)', () => {
    // [[2,1],[1,2]] has eigenvalues 1 and 3.
    const M = new Float64Array([2, 1, 1, 2])
    const { values } = jacobiEigenSymmetric(M, 2)
    expect(values[0]!).toBeCloseTo(1, 9)
    expect(values[1]!).toBeCloseTo(3, 9)
    // Reproducible: a second call returns bit-identical eigenvalues.
    const again = jacobiEigenSymmetric(new Float64Array([2, 1, 1, 2]), 2)
    expect(again.values).toEqual(values)
  })

  it('returns unit-norm eigenvectors as columns satisfying M·v = λ·v', () => {
    const M = new Float64Array([2, 1, 1, 2])
    const { values, vectors } = jacobiEigenSymmetric(M, 2)
    for (let j = 0; j < 2; j++) {
      const v0 = vectors[0]![j]!
      const v1 = vectors[1]![j]!
      // Unit norm.
      expect(Math.hypot(v0, v1)).toBeCloseTo(1, 9)
      // Eigen relation M·v = λ·v.
      const mv0 = M[0]! * v0 + M[1]! * v1
      const mv1 = M[2]! * v0 + M[3]! * v1
      expect(mv0).toBeCloseTo(values[j]! * v0, 9)
      expect(mv1).toBeCloseTo(values[j]! * v1, 9)
    }
  })
})

describe('bifurcationSoftMode — type-II₁ gaplessness', () => {
  const sm = bifurcationSoftMode(RIEMANN_ZEROS, 40)

  it('full spectrum is PSD (every eigenvalue ≥ −1e-9)', () => {
    for (const lambda of sm.lambdas) expect(lambda).toBeGreaterThanOrEqual(-1e-9)
  })

  it('the soft mode is ⟂ the uniform mode (≈ zero mean)', () => {
    const mean = sm.mode.reduce((a, b) => a + b, 0) / sm.mode.length
    expect(Math.abs(mean)).toBeLessThan(1e-9)
  })

  it('the soft mode is unit-normalised', () => {
    const norm2 = sm.mode.reduce((a, b) => a + b * b, 0)
    expect(norm2).toBeCloseTo(1, 9)
  })

  it('every per-ring stiffness K_i is positive', () => {
    for (const k of sm.stiffness) expect(k).toBeGreaterThan(0)
  })

  it('λ₁ deepens with N: λ₁(40) < λ₁(20) (gaplessness ~ N⁻¹)', () => {
    const lambda20 = bifurcationSoftMode(RIEMANN_ZEROS, 20).lambda1
    const lambda40 = bifurcationSoftMode(RIEMANN_ZEROS, 40).lambda1
    expect(lambda40).toBeGreaterThan(0)
    expect(lambda40).toBeLessThan(lambda20)
  })

  it('memoises on count (returns the same object for the default zeros)', () => {
    expect(bifurcationSoftMode(RIEMANN_ZEROS, 40)).toBe(bifurcationSoftMode(RIEMANN_ZEROS, 40))
  })
})

describe('generateBifurcationLut — living log-gas offsets', () => {
  it('ringOffsets shift a ring along the throat (density follows the offset)', () => {
    const t0 = bifurcationRingHeight(RIEMANN_ZEROS[0]!)
    const offsets = new Array<number>(BIFURCATION_RING_COUNT).fill(0)
    const shift = 0.5
    offsets[0] = shift
    const shifted = generateBifurcationLut({ ...BIFURCATION_DEFAULT_LUT, ringOffsets: offsets })
    // The shifted ring is denser at t0 + shift than the static LUT there.
    const atShiftedStatic = sampleBifurcationDensity(lut, t0 + shift, 0)
    const atShiftedMoved = sampleBifurcationDensity(shifted, t0 + shift, 0)
    expect(atShiftedMoved).toBeGreaterThan(atShiftedStatic)
  })

  it('ringAmpScale of 0 removes ring 0 (but keeps the membrane)', () => {
    const amp = new Array<number>(BIFURCATION_RING_COUNT).fill(1)
    amp[0] = 0
    const dimmed = generateBifurcationLut({ ...BIFURCATION_DEFAULT_LUT, ringAmpScale: amp })
    const t0 = bifurcationRingHeight(RIEMANN_ZEROS[0]!)
    // With ring 0 removed, the on-throat density at t0 drops vs the full LUT.
    expect(sampleBifurcationDensity(dimmed, t0, 0)).toBeLessThan(
      sampleBifurcationDensity(lut, t0, 0)
    )
  })

  it('absent offsets/ampScale reproduce the legacy LUT exactly', () => {
    const baseline = generateBifurcationLut(BIFURCATION_DEFAULT_LUT)
    expect(baseline).toEqual(lut)
  })
})
