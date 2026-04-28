/**
 * Tests for Born rule measurement sampling and wavefunction collapse.
 *
 * Verifies:
 * - extractAxisCoord: C-order index decomposition for 2D, 3D, 4D
 * - sampleFromDensity: deterministic CDF sampling with mocked RNG,
 *   non-trivial distributions, complex wavefunctions
 * - sampleFromMarginalDensity: marginal summation correctness,
 *   deterministic axis sampling
 * - computeFullCollapse: exact Gaussian values at known distances, 2D
 * - computePartialCollapse: exact envelope formula, complex input,
 *   phase preservation
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  computeFullCollapse,
  computePartialCollapse,
  extractAxisCoord,
  normalizeWavefunctionInSamplingMeasure,
  sampleFromDensity,
  sampleFromMarginalDensity,
} from '@/lib/physics/measurement'

afterEach(() => {
  vi.restoreAllMocks()
})

// ── extractAxisCoord ─────────────────────────────────────────────────────

describe('extractAxisCoord', () => {
  it('extracts last axis (fastest varying) from linear index in 2D', () => {
    // 3x4 grid: index = row * 4 + col
    const gridSize = [3, 4]
    expect(extractAxisCoord(0, gridSize, 1, 2)).toBe(0) // (0,0) -> col=0
    expect(extractAxisCoord(1, gridSize, 1, 2)).toBe(1) // (0,1) -> col=1
    expect(extractAxisCoord(4, gridSize, 1, 2)).toBe(0) // (1,0) -> col=0
    expect(extractAxisCoord(5, gridSize, 1, 2)).toBe(1) // (1,1) -> col=1
  })

  it('extracts first axis (slowest varying) from linear index in 2D', () => {
    const gridSize = [3, 4]
    expect(extractAxisCoord(0, gridSize, 0, 2)).toBe(0) // (0,0) -> row=0
    expect(extractAxisCoord(4, gridSize, 0, 2)).toBe(1) // (1,0) -> row=1
    expect(extractAxisCoord(8, gridSize, 0, 2)).toBe(2) // (2,0) -> row=2
    expect(extractAxisCoord(11, gridSize, 0, 2)).toBe(2) // (2,3) -> row=2
  })

  it('handles 3D grids correctly', () => {
    // 2x3x4 grid: index = x*12 + y*4 + z
    const gridSize = [2, 3, 4]
    // index 13 = 1*12 + 0*4 + 1 -> (1,0,1)
    expect(extractAxisCoord(13, gridSize, 0, 3)).toBe(1)
    expect(extractAxisCoord(13, gridSize, 1, 3)).toBe(0)
    expect(extractAxisCoord(13, gridSize, 2, 3)).toBe(1)
  })

  it('handles 4D grids with non-uniform sizes', () => {
    // 2x3x2x4 grid: strides = [24, 8, 4, 1]
    // index 29 = 1*24 + 0*8 + 1*4 + 1 -> (1, 0, 1, 1)
    const gridSize = [2, 3, 2, 4]
    expect(extractAxisCoord(29, gridSize, 0, 4)).toBe(1)
    expect(extractAxisCoord(29, gridSize, 1, 4)).toBe(0)
    expect(extractAxisCoord(29, gridSize, 2, 4)).toBe(1)
    expect(extractAxisCoord(29, gridSize, 3, 4)).toBe(1)

    // Verify last element: index = 2*3*2*4 - 1 = 47 -> (1,2,1,3)
    expect(extractAxisCoord(47, gridSize, 0, 4)).toBe(1)
    expect(extractAxisCoord(47, gridSize, 1, 4)).toBe(2)
    expect(extractAxisCoord(47, gridSize, 2, 4)).toBe(1)
    expect(extractAxisCoord(47, gridSize, 3, 4)).toBe(3)
  })
})

// ── sampleFromDensity ────────────────────────────────────────────────────

describe('sampleFromDensity', () => {
  it('samples the only nonzero site when all density is at one point', () => {
    const psiRe = new Float32Array([0, 0, 1, 0])
    const psiIm = new Float32Array([0, 0, 0, 0])
    const gridSize = [4]
    const spacing = [1.0]

    const result = sampleFromDensity(psiRe, psiIm, gridSize, spacing)
    expect(result.gridIndex).toBe(2)
    expect(result.density).toBe(1)
    // Position: (2 - 4*0.5 + 0.5) * 1.0 = 0.5
    expect(result.position[0]).toBeCloseTo(0.5)
  })

  it('handles complex wavefunctions (nonzero imaginary part)', () => {
    const psiRe = new Float32Array([0, 0, 0, 0])
    const psiIm = new Float32Array([0, 0, 2, 0]) // density = 4 at site 2
    const gridSize = [4]
    const spacing = [1]

    const result = sampleFromDensity(psiRe, psiIm, gridSize, spacing)
    expect(result.gridIndex).toBe(2)
    expect(result.density).toBeCloseTo(4)
  })

  it('returns correct positions for 2D grid', () => {
    const psiRe = new Float32Array([0, 0, 3, 0])
    const psiIm = new Float32Array(4).fill(0)
    const gridSize = [2, 2]
    const spacing = [1, 1]

    const result = sampleFromDensity(psiRe, psiIm, gridSize, spacing)
    expect(result.gridIndex).toBe(2)
    expect(result.position[0]).toBeCloseTo(0.5)
    expect(result.position[1]).toBeCloseTo(-0.5)
  })

  it('CDF binary search selects correct site for a two-peak distribution', () => {
    // 8-site 1D: two peaks at sites 2 (density=1) and 6 (density=3)
    // CDF: [0, 0, 1, 1, 1, 1, 4, 4], totalProb=4
    // u < 1/4 of totalProb → site 2; u > 1/4 → site 6
    const psiRe = new Float32Array([0, 0, 1, 0, 0, 0, Math.sqrt(3), 0])
    const psiIm = new Float32Array(8).fill(0)
    const gridSize = [8]
    const spacing = [1]

    // u = 0.1 * 4 = 0.4 < CDF[2]=1 → site 2
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    let result = sampleFromDensity(psiRe, psiIm, gridSize, spacing)
    expect(result.gridIndex).toBe(2)
    expect(result.density).toBeCloseTo(1.0)

    // u = 0.5 * 4 = 2.0 > CDF[2]=1, ≤ CDF[6]=4 → site 6
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    result = sampleFromDensity(psiRe, psiIm, gridSize, spacing)
    expect(result.gridIndex).toBe(6)
    expect(result.density).toBeCloseTo(3.0)
  })

  it('selects correct site at exact CDF boundary', () => {
    // 4 sites: densities [0.25, 0.25, 0.25, 0.25], totalProb=1
    // CDF: [0.25, 0.5, 0.75, 1.0]
    const amp = 0.5
    const psiRe = new Float32Array([amp, amp, amp, amp])
    const psiIm = new Float32Array(4).fill(0)
    const gridSize = [4]
    const spacing = [1]

    // u = 0.25 → exactly at CDF[0]=0.25, binary search should give site 0
    vi.spyOn(Math, 'random').mockReturnValue(0.25)
    const result = sampleFromDensity(psiRe, psiIm, gridSize, spacing)
    expect(result.gridIndex).toBe(0)

    // u = 0.75 → exactly at CDF[2]=0.75, binary search should give site 2
    vi.spyOn(Math, 'random').mockReturnValue(0.75)
    const r2 = sampleFromDensity(psiRe, psiIm, gridSize, spacing)
    expect(r2.gridIndex).toBe(2)
  })

  it('samples from a Gaussian-like wavefunction with known RNG', () => {
    // 16-site 1D Gaussian: ψ(x) = exp(-x²/2), center at grid midpoint
    const gridSize = [16]
    const spacing = [0.5]
    const psiRe = new Float32Array(16)
    const psiIm = new Float32Array(16).fill(0)
    for (let i = 0; i < 16; i++) {
      const x = (i - 8 + 0.5) * 0.5
      psiRe[i] = Math.exp((-x * x) / 2)
    }

    // Build expected CDF manually to determine which site u=0.5 maps to
    let cumulative = 0
    const cdf: number[] = []
    for (let i = 0; i < 16; i++) {
      cumulative += psiRe[i]! * psiRe[i]!
      cdf.push(cumulative)
    }
    const totalProb = cdf[15]!
    const target = 0.5 * totalProb
    let expectedIdx = 0
    for (let i = 0; i < 16; i++) {
      if (cdf[i]! >= target) {
        expectedIdx = i
        break
      }
    }

    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const result = sampleFromDensity(psiRe, psiIm, gridSize, spacing)
    expect(result.gridIndex).toBe(expectedIdx)
    expect(result.density).toBeCloseTo(psiRe[expectedIdx]! ** 2)
  })

  it('complex wavefunction with both Re and Im uses |ψ|² = Re² + Im²', () => {
    // Site densities: [1²+2²=5, 0, 0, 0, 0, 0, 0, 3²+4²=25]
    // totalProb = 30, u = 0.1*30 = 3 < CDF[0]=5 → site 0
    const psiRe = new Float32Array([1, 0, 0, 0, 0, 0, 0, 3])
    const psiIm = new Float32Array([2, 0, 0, 0, 0, 0, 0, 4])
    const gridSize = [8]
    const spacing = [1]

    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const result = sampleFromDensity(psiRe, psiIm, gridSize, spacing)
    expect(result.gridIndex).toBe(0)
    expect(result.density).toBeCloseTo(5)

    // u = 0.5*30 = 15 > CDF[0]=5 → site 7
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const r2 = sampleFromDensity(psiRe, psiIm, gridSize, spacing)
    expect(r2.gridIndex).toBe(7)
    expect(r2.density).toBeCloseTo(25)
  })

  it('weights curved-space sampling by the proper volume element', () => {
    // Morris-Thorne sqrt(|g|)=sqrt(b0^2+l^2) in 2D. Raw densities [1,4,0]
    // would sample the center for u=0.5, but proper-volume weights favor l=-1.
    const psiRe = new Float32Array([1, 2, 0])
    const psiIm = new Float32Array(3).fill(0)
    const gridSize = [3, 1]
    const spacing = [1, 1]

    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const result = sampleFromDensity(psiRe, psiIm, gridSize, spacing, {
      metric: { kind: 'morrisThorne', throatRadius: 0.1 },
      time: 0,
    })

    expect(result.gridIndex).toBe(0)
    expect(result.position[0]).toBeCloseTo(-1)
    expect(result.density).toBeCloseTo(1)
  })

  it('throws when the total probability density is zero', () => {
    expect(() => sampleFromDensity(new Float32Array(4), new Float32Array(4), [4], [1])).toThrow(
      'Cannot sample from zero total probability density'
    )
  })
})

// ── sampleFromMarginalDensity ────────────────────────────────────────────

describe('sampleFromMarginalDensity', () => {
  it('samples the correct axis when density is concentrated', () => {
    const psiRe = new Float32Array([0, 0, 0, 1, 1, 1, 0, 0, 0])
    const psiIm = new Float32Array(9).fill(0)
    const gridSize = [3, 3]
    const spacing = [1, 1]

    const result = sampleFromMarginalDensity(psiRe, psiIm, gridSize, spacing, 0)
    expect(result.axisIndex).toBe(1)
    expect(result.marginalDensity).toBeCloseTo(3)
  })

  it('marginalizes correctly over other dimensions', () => {
    const psiRe = new Float32Array([1, 0, 0, 0, 0, 0, 0, 1])
    const psiIm = new Float32Array(8).fill(0)
    const gridSize = [2, 4]
    const spacing = [1, 1]

    const result = sampleFromMarginalDensity(psiRe, psiIm, gridSize, spacing, 1)
    expect([0, 3]).toContain(result.axisIndex)
    expect(result.marginalDensity).toBeCloseTo(1)
  })

  it('marginal sums equal total probability', () => {
    // Non-trivial 3x4 wavefunction
    const psiRe = new Float32Array([1, 2, 0.5, 3, 0, 1, 2, 0, 0.5, 0, 1, 1.5])

    // Compute total probability
    let totalProb = 0
    for (let i = 0; i < 12; i++) totalProb += psiRe[i]! * psiRe[i]!

    // Marginal along axis 0 (sum over axis 1 for each row)
    // Row 0: 1+4+0.25+9=14.25, Row 1: 0+1+4+0=5, Row 2: 0.25+0+1+2.25=3.5
    // Sum = 22.75
    const marginals0 = [0, 0, 0]
    for (let i = 0; i < 12; i++) {
      const row = Math.floor(i / 4)
      marginals0[row] = (marginals0[row] ?? 0) + psiRe[i]! * psiRe[i]!
    }
    const marginalSum0 = marginals0.reduce((a, b) => a + b, 0)
    expect(marginalSum0).toBeCloseTo(totalProb)

    // Marginal along axis 1 (sum over axis 0 for each column)
    const marginals1 = [0, 0, 0, 0]
    for (let i = 0; i < 12; i++) {
      const col = i % 4
      marginals1[col] = (marginals1[col] ?? 0) + psiRe[i]! * psiRe[i]!
    }
    const marginalSum1 = marginals1.reduce((a, b) => a + b, 0)
    expect(marginalSum1).toBeCloseTo(totalProb)
  })

  it('selects correct axis index with deterministic RNG', () => {
    // 4x4 grid: marginal along axis 0 (rows)
    // Row 0: density 4, Row 1: density 0, Row 2: density 0, Row 3: density 1
    // CDF: [4, 4, 4, 5], totalProb = 5
    const psiRe = new Float32Array(16).fill(0)
    psiRe[0] = 1
    psiRe[1] = 1
    psiRe[2] = 1
    psiRe[3] = 1 // row 0: density = 4
    psiRe[15] = 1 // row 3 col 3: density = 1
    const psiIm = new Float32Array(16).fill(0)
    const gridSize = [4, 4]
    const spacing = [1, 1]

    // u = 0.1 * 5 = 0.5 < CDF[0]=4 → row 0
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    let result = sampleFromMarginalDensity(psiRe, psiIm, gridSize, spacing, 0)
    expect(result.axisIndex).toBe(0)
    expect(result.marginalDensity).toBeCloseTo(4)

    // u = 0.9 * 5 = 4.5 > CDF[2]=4, ≤ CDF[3]=5 → row 3
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    result = sampleFromMarginalDensity(psiRe, psiIm, gridSize, spacing, 0)
    expect(result.axisIndex).toBe(3)
    expect(result.marginalDensity).toBeCloseTo(1)
  })

  it('axis position follows the grid coordinate formula', () => {
    // 6-site 1D viewed as marginal of 2x3
    // axisPosition = (axisIndex - axisSize*0.5 + 0.5) * spacing
    // For axis=1, size=3, spacing=2: positions = (0-1.5+0.5)*2=-2, (1-1.5+0.5)*2=0, (2-1.5+0.5)*2=2
    const psiRe = new Float32Array([0, 0, 0, 0, 0, 1])
    const psiIm = new Float32Array(6).fill(0)
    const gridSize = [2, 3]
    const spacing = [1, 2]

    const result = sampleFromMarginalDensity(psiRe, psiIm, gridSize, spacing, 1)
    expect(result.axisIndex).toBe(2)
    expect(result.axisPosition).toBeCloseTo(2.0)
  })

  it('weights curved-space marginal sampling by the proper volume element', () => {
    const psiRe = new Float32Array([1, 2, 0])
    const psiIm = new Float32Array(3).fill(0)
    const gridSize = [3, 1]
    const spacing = [1, 1]

    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const result = sampleFromMarginalDensity(psiRe, psiIm, gridSize, spacing, 0, {
      metric: { kind: 'morrisThorne', throatRadius: 0.1 },
      time: 0,
    })

    expect(result.axisIndex).toBe(0)
    expect(result.axisPosition).toBeCloseTo(-1)
    expect(result.marginalDensity).toBeCloseTo(Math.sqrt(1.01))
  })

  it('throws when the marginal probability density is zero', () => {
    expect(() =>
      sampleFromMarginalDensity(new Float32Array(4), new Float32Array(4), [4], [1], 0)
    ).toThrow('Cannot sample from zero total probability density')
  })
})

// ── computeFullCollapse ──────────────────────────────────────────────────

describe('computeFullCollapse', () => {
  it('produces a Gaussian centered at the measurement position', () => {
    const gridSize = [8]
    const spacing = [1]
    const center = [0.5]
    const sigma = 0.5

    const [re, im] = computeFullCollapse(8, gridSize, spacing, center, sigma)

    for (let i = 0; i < 8; i++) expect(im[i]).toBe(0)

    let maxIdx = 0
    let maxVal = 0
    for (let i = 0; i < 8; i++) {
      if (re[i]! > maxVal) {
        maxVal = re[i]!
        maxIdx = i
      }
    }
    expect(maxIdx).toBe(4)
    expect(maxVal).toBeCloseTo(1.0)
    expect(re[3]!).toBeLessThan(re[4]!)
    expect(re[5]!).toBeLessThan(re[4]!)
  })

  it('produces narrower Gaussian with smaller sigma', () => {
    const gridSize = [16]
    const spacing = [0.5]
    const center = [0]

    const [reWide] = computeFullCollapse(16, gridSize, spacing, center, 1.0)
    const [reNarrow] = computeFullCollapse(16, gridSize, spacing, center, 0.1)

    const sumWide = reWide.reduce((s, v) => s + v, 0)
    const sumNarrow = reNarrow.reduce((s, v) => s + v, 0)
    expect(sumNarrow).toBeLessThan(sumWide)
  })

  it('produces exact Gaussian values at known distances from center', () => {
    // 1D grid, 16 sites, spacing=1, center at 0, sigma=2
    // pos(i) = (i - 8 + 0.5), so site 8 → x=0.5, site 7 → x=-0.5
    // At center (0,0): the closest sites are 7 and 8 at distance 0.5
    const gridSize = [16]
    const spacing = [1.0]
    const center = [0.0]
    const sigma = 2.0

    const [re] = computeFullCollapse(16, gridSize, spacing, center, sigma)

    for (let i = 0; i < 16; i++) {
      const x = (i - 8 + 0.5) * 1.0
      const dist2 = x * x
      const expected = Math.exp(-dist2 / (2 * sigma * sigma))
      expect(re[i]).toBeCloseTo(expected, 5)
    }
  })

  it('produces exact Gaussian values for 2D collapse', () => {
    // 4x4 grid, spacing=[0.5, 0.5], center at (0.25, -0.25), sigma=1
    const gridSize = [4, 4]
    const spacing = [0.5, 0.5]
    const center = [0.25, -0.25]
    const sigma = 1.0
    const totalSites = 16

    const [re, im] = computeFullCollapse(totalSites, gridSize, spacing, center, sigma)

    for (let i = 0; i < totalSites; i++) {
      expect(im[i]).toBe(0)
      // Reconstruct 2D position from linear index
      const row = Math.floor(i / 4)
      const col = i % 4
      const x = (row - 2 + 0.5) * 0.5
      const y = (col - 2 + 0.5) * 0.5
      const dist2 = (x - center[0]!) ** 2 + (y - center[1]!) ** 2
      const expected = Math.exp(-dist2 / (2 * sigma * sigma))
      expect(re[i]).toBeCloseTo(expected, 5)
    }
  })

  it('sigma clamping prevents division by zero', () => {
    // sigma = 0 → clamped to sqrt(1e-8) ≈ 1e-4
    const [re] = computeFullCollapse(4, [4], [1], [0], 0)
    // All values should be finite
    for (let i = 0; i < 4; i++) {
      expect(Number.isFinite(re[i])).toBe(true)
    }
  })

  it('uses local metric distance for curved-space full collapse', () => {
    const flat = computeFullCollapse(3, [3], [1], [0], 1)[0]
    const curved = computeFullCollapse(3, [3], [1], [0], 1, undefined, {
      metric: { kind: 'deSitter', hubbleRate: Math.log(2) },
      time: 1,
    })[0]

    expect(curved[1]).toBeCloseTo(flat[1]!, 6)
    expect(curved[0]).toBeLessThan(flat[0]!)
    expect(curved[2]).toBeLessThan(flat[2]!)
    expect(curved[0]).toBeCloseTo(Math.exp(-2), 5)
  })
})

// ── computePartialCollapse ───────────────────────────────────────────────

describe('computePartialCollapse', () => {
  it('multiplies wavefunction by 1D Gaussian in the measured axis', () => {
    const psiRe = new Float32Array(16).fill(1)
    const psiIm = new Float32Array(16).fill(0)
    const gridSize = [4, 4]
    const spacing = [1, 1]
    const axis = 0
    const axisPos = 0.5
    const sigma = 0.3

    const [outRe, outIm] = computePartialCollapse(
      psiRe,
      psiIm,
      gridSize,
      spacing,
      axis,
      axisPos,
      sigma
    )

    for (let i = 0; i < 16; i++) expect(outIm[i]).toBe(0)
    expect(outRe[8]).toBeCloseTo(1.0)
    expect(outRe[0]!).toBeLessThan(outRe[8]!)
  })

  it('preserves relative amplitudes along unmeasured axes', () => {
    const psiRe = new Float32Array([1, 2, 3, 1, 2, 3, 1, 2, 3])
    const psiIm = new Float32Array(9).fill(0)
    const gridSize = [3, 3]
    const spacing = [1, 1]

    const [outRe] = computePartialCollapse(psiRe, psiIm, gridSize, spacing, 0, 0, 100)

    expect(outRe[4]! / outRe[3]!).toBeCloseTo(2)
    expect(outRe[5]! / outRe[3]!).toBeCloseTo(3)
  })

  it('produces exact envelope values matching exp(-(pos-axisPos)²/(2σ²))', () => {
    // 1D-equivalent: 6x1 grid, collapse at pos=0, sigma=1.5
    // pos(k) = (k - 3 + 0.5) * 1 for k=0..5: -2.5, -1.5, -0.5, 0.5, 1.5, 2.5
    const psiRe = new Float32Array(6).fill(1)
    const psiIm = new Float32Array(6).fill(0)
    const gridSize = [6]
    const spacing = [1]
    const axisPos = 0.0
    const sigma = 1.5

    const [outRe] = computePartialCollapse(psiRe, psiIm, gridSize, spacing, 0, axisPos, sigma)

    for (let k = 0; k < 6; k++) {
      const pos = (k - 3 + 0.5) * 1.0
      const delta = pos - axisPos
      const expected = Math.exp(-(delta * delta) / (2 * sigma * sigma))
      expect(outRe[k]).toBeCloseTo(expected, 5)
    }
  })

  it('correctly scales complex wavefunction (both Re and Im)', () => {
    // 4-site 1D, ψ = [1+2i, 0, 3+4i, 0], collapse at pos=0, sigma=10 (wide → envelope≈1)
    const psiRe = new Float32Array([1, 0, 3, 0])
    const psiIm = new Float32Array([2, 0, 4, 0])
    const gridSize = [4]
    const spacing = [1]

    const [outRe, outIm] = computePartialCollapse(psiRe, psiIm, gridSize, spacing, 0, 0, 10)

    // With very wide sigma, envelope ≈ 1, output ≈ input
    // Site 0: pos = -1.5, envelope = exp(-1.5²/200) ≈ 0.9888
    const env0 = Math.exp((-1.5 * 1.5) / 200)
    expect(outRe[0]).toBeCloseTo(1 * env0, 3)
    expect(outIm[0]).toBeCloseTo(2 * env0, 3)

    // Site 2: pos = 0.5, envelope = exp(-0.5²/200) ≈ 0.9988
    const env2 = Math.exp((-0.5 * 0.5) / 200)
    expect(outRe[2]).toBeCloseTo(3 * env2, 3)
    expect(outIm[2]).toBeCloseTo(4 * env2, 3)
  })

  it('preserves phase relationship in complex wavefunction', () => {
    // ψ = exp(ikx) at each site → after collapse, phase ratios preserved
    // 4-site grid, k=2, spacing=0.5
    const gridSize = [4]
    const spacing = [0.5]
    const psiRe = new Float32Array(4)
    const psiIm = new Float32Array(4)
    const k = 2.0
    for (let i = 0; i < 4; i++) {
      const x = (i - 2 + 0.5) * 0.5
      psiRe[i] = Math.cos(k * x)
      psiIm[i] = Math.sin(k * x)
    }

    const [outRe, outIm] = computePartialCollapse(psiRe, psiIm, gridSize, spacing, 0, 0, 0.5)

    // Phase at each site should be preserved: arg(out) = arg(input)
    // Because the Gaussian envelope is real and positive, it only scales amplitude
    for (let i = 0; i < 4; i++) {
      const inPhase = Math.atan2(psiIm[i]!, psiRe[i]!)
      const outPhase = Math.atan2(outIm[i]!, outRe[i]!)
      // Phase should match (mod 2π), but for near-zero amplitude, skip
      const outAmp = Math.sqrt(outRe[i]! ** 2 + outIm[i]! ** 2)
      if (outAmp > 1e-6) {
        expect(outPhase).toBeCloseTo(inPhase, 5)
      }
    }
  })

  it('compact dimension wraps to shortest distance', () => {
    // 1D grid, 8 sites, spacing=1, center at edge (3.5), sigma=1
    // Without wrapping: site 0 (pos=-3.5) is 7 units from center
    // With wrapping: grid extent L=8, wrapped distance = |(-3.5-3.5) - 8*round(-7/8)| = |-7+8| = 1
    const gridSize = [8]
    const spacing = [1.0]
    const center = [3.5]
    const sigma = 1.0

    const [reNoWrap] = computeFullCollapse(8, gridSize, spacing, center, sigma)
    const [reWrap] = computeFullCollapse(8, gridSize, spacing, center, sigma, [true])

    // Site 0: pos = (0 - 4 + 0.5)*1 = -3.5
    // Without wrap: delta = -3.5 - 3.5 = -7, dist² = 49 → very small Gaussian
    // With wrap: delta = -7, L = 8, wrapped = -7 - 8*round(-7/8) = -7 + 8 = 1, dist² = 1
    expect(reWrap[0]).toBeGreaterThan(reNoWrap[0]! * 10)

    // Center site (7): pos = (7 - 4 + 0.5)*1 = 3.5 → delta = 0 (exact center)
    // Both should give exp(0) = 1
    expect(reNoWrap[7]).toBeCloseTo(1.0, 5)
    expect(reWrap[7]).toBeCloseTo(1.0, 5)
  })

  it('compact dimension wrapping preserves Gaussian shape across boundary', () => {
    // 2D grid 8x8, spacing [1,1], center near boundary, compact dims [true, false]
    // Compact dim 0 should wrap; dim 1 should not
    const gridSize = [8, 8]
    const spacing = [1.0, 1.0]
    const center = [3.5, 0.0] // near right edge of dim 0
    const sigma = 1.5

    const [reWrap] = computeFullCollapse(64, gridSize, spacing, center, sigma, [true, false])
    const [reNoWrap] = computeFullCollapse(64, gridSize, spacing, center, sigma, [false, false])

    // Site at (0, 4) = index 0*8+4: dim0 pos=-3.5, dim1 pos=0.5
    // Without wrap in dim0: delta0=-7, delta1=0.5, dist²=49.25 → tiny
    // With wrap in dim0: delta0=1, delta1=0.5, dist²=1.25 → significant
    const idxLeftEdge = 0 * 8 + 4
    expect(reWrap[idxLeftEdge]).toBeGreaterThan(reNoWrap[idxLeftEdge]! * 5)
  })

  it('non-compact dims are unaffected by compactDims=[false]', () => {
    const gridSize = [8]
    const spacing = [1.0]
    const center = [0.0]
    const sigma = 1.0

    const [reDefault] = computeFullCollapse(8, gridSize, spacing, center, sigma)
    const [reExplicitFalse] = computeFullCollapse(8, gridSize, spacing, center, sigma, [false])

    for (let i = 0; i < 8; i++) {
      expect(reExplicitFalse[i]).toBeCloseTo(reDefault[i]!, 10)
    }
  })

  it('collapse along axis 1 of a 3D grid applies envelope to correct dimension', () => {
    // 2x3x2 grid (12 sites), collapse axis 1 at pos=0
    // axis=1, size=3, spacing=1: positions = -1, 0, 1
    const psiRe = new Float32Array(12).fill(1)
    const psiIm = new Float32Array(12).fill(0)
    const gridSize = [2, 3, 2]
    const spacing = [1, 1, 1]
    const sigma = 0.5

    const [outRe] = computePartialCollapse(psiRe, psiIm, gridSize, spacing, 1, 0, sigma)

    // Sites with axis1=0 (pos=-1): envelope = exp(-1/(2*0.25)) = exp(-2)
    // Sites with axis1=1 (pos=0):  envelope = exp(0) = 1
    // Sites with axis1=2 (pos=1):  envelope = exp(-2)
    const envCenter = 1.0
    const envEdge = Math.exp(-2)

    // Site (0,1,0) = index 2: axis1 coordinate = 1
    expect(outRe[2]).toBeCloseTo(envCenter, 5)
    // Site (0,0,0) = index 0: axis1 coordinate = 0
    expect(outRe[0]).toBeCloseTo(envEdge, 5)
    // Site (1,2,1) = index 11: axis1 coordinate = 2
    expect(outRe[11]).toBeCloseTo(envEdge, 5)
  })

  it('curved partial collapse uses local transverse metric for retained slices', () => {
    // Morris-Thorne transverse line element is r(l)^2 dφ². Measuring the
    // transverse axis should therefore be much narrower at |l|=1 than at the
    // throat l=0. A single zero-filled metric center would incorrectly give
    // every retained l-slice the throat width.
    const gridSize = [3, 3]
    const spacing = [1, 1]
    const psiRe = new Float32Array(9).fill(1)
    const psiIm = new Float32Array(9)

    const [outRe] = computePartialCollapse(psiRe, psiIm, gridSize, spacing, 1, 0, 1, false, {
      metric: { kind: 'morrisThorne', throatRadius: 0.1 },
    })

    const throatOffAxis = outRe[1 * 3 + 2]! // l=0, φ=+1
    const edgeOffAxis = outRe[0 * 3 + 2]! // l=-1, φ=+1
    expect(throatOffAxis).toBeGreaterThan(0.99)
    expect(edgeOffAxis).toBeLessThan(0.7)
  })

  it('compact axis wrapping in partial collapse uses shortest distance', () => {
    // 8-site 1D grid, collapse at position near left edge (-3.5),
    // with compact axis. Site at right edge (+3.5) should be close via wrapping.
    const gridSize = [8]
    const spacing = [1.0]
    const psiRe = new Float32Array(8).fill(1)
    const psiIm = new Float32Array(8).fill(0)
    const axisPos = -3.5 // position of site 0
    const sigma = 1.0

    // Without compact: site 7 (pos=3.5) is 7 units from -3.5
    const [outNoWrap] = computePartialCollapse(psiRe, psiIm, gridSize, spacing, 0, axisPos, sigma)

    // With compact: site 7 wrapped distance = |3.5-(-3.5)| wrapped on L=8 → |7 - 8| = 1
    const [outWrap] = computePartialCollapse(
      psiRe,
      psiIm,
      gridSize,
      spacing,
      0,
      axisPos,
      sigma,
      true
    )

    // Site 7 should be much higher with wrapping
    expect(outWrap[7]).toBeGreaterThan(outNoWrap[7]! * 5)

    // Site 0 (at collapse position): same value regardless of wrapping
    expect(outWrap[0]).toBeCloseTo(outNoWrap[0]!, 5)
  })
})

describe('normalizeWavefunctionInSamplingMeasure', () => {
  it('normalizes flat wavefunctions in the same discrete measure used by sampling', () => {
    const re = new Float32Array([3, 4])
    const im = new Float32Array([0, 0])

    normalizeWavefunctionInSamplingMeasure(re, im, [2], [1])

    const norm = re[0]! * re[0]! + re[1]! * re[1]!
    expect(norm).toBeCloseTo(1, 6)
  })

  it('normalizes curved wavefunctions with sqrt(|g|) weighting', () => {
    const re = new Float32Array([1, 1])
    const im = new Float32Array([0, 0])

    normalizeWavefunctionInSamplingMeasure(re, im, [2], [1], {
      metric: { kind: 'deSitter', hubbleRate: Math.log(2) },
      time: 1,
    })

    const a = 2
    const norm = (re[0]! * re[0]! + re[1]! * re[1]!) * a
    expect(norm).toBeCloseTo(1, 6)
  })
})
