/**
 * hsl2rgb branchless implementation correctness tests.
 *
 * Verifies the branchless triangle-wave hsl2rgb against a reference
 * branchy implementation for known colors, edge cases, and a sweep
 * across all hue sectors.
 *
 * @module tests/rendering/shaders/hsl2rgb
 */

import { describe, expect, it } from 'vitest'

// ── Reference: original branchy hsl2rgb (mirrors the pre-optimization WGSL) ──

function hsl2rgbBranchy(h: number, s: number, l: number): [number, number, number] {
  const hue = (((h % 1) + 1) % 1) * 6 // fract(h) * 6
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 2) % 1) * 2 - 1))
  const m = l - c * 0.5

  let r: number, g: number, b: number
  if (hue < 1) {
    ;[r, g, b] = [c, x, 0]
  } else if (hue < 2) {
    ;[r, g, b] = [x, c, 0]
  } else if (hue < 3) {
    ;[r, g, b] = [0, c, x]
  } else if (hue < 4) {
    ;[r, g, b] = [0, x, c]
  } else if (hue < 5) {
    ;[r, g, b] = [x, 0, c]
  } else {
    ;[r, g, b] = [c, 0, x]
  }

  return [r + m, g + m, b + m]
}

// ── New: branchless hsl2rgb (mirrors the current WGSL implementation) ──

function hsl2rgbBranchless(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const m = l - c * 0.5
  const hue6 = (((h % 1) + 1) % 1) * 6 // fract(h) * 6

  const r = Math.min(Math.max(Math.abs(hue6 - 3) - 1, 0), 1)
  const g = Math.min(Math.max(2 - Math.abs(hue6 - 2), 0), 1)
  const b = Math.min(Math.max(2 - Math.abs(hue6 - 4), 0), 1)

  return [r * c + m, g * c + m, b * c + m]
}

// ── Helpers ──

function expectClose(
  actual: [number, number, number],
  expected: [number, number, number],
  eps = 1e-6
): void {
  expect(actual[0]).toBeCloseTo(expected[0], -Math.log10(eps))
  expect(actual[1]).toBeCloseTo(expected[1], -Math.log10(eps))
  expect(actual[2]).toBeCloseTo(expected[2], -Math.log10(eps))
}

// ── Tests ──

describe('hsl2rgb branchless correctness', () => {
  describe('known CSS colors', () => {
    it('pure red: h=0, s=1, l=0.5 → (1, 0, 0)', () => {
      expectClose(hsl2rgbBranchless(0, 1, 0.5), [1, 0, 0])
    })

    it('pure green: h=1/3, s=1, l=0.5 → (0, 1, 0)', () => {
      expectClose(hsl2rgbBranchless(1 / 3, 1, 0.5), [0, 1, 0])
    })

    it('pure blue: h=2/3, s=1, l=0.5 → (0, 0, 1)', () => {
      expectClose(hsl2rgbBranchless(2 / 3, 1, 0.5), [0, 0, 1])
    })

    it('yellow: h=1/6, s=1, l=0.5 → (1, 1, 0)', () => {
      expectClose(hsl2rgbBranchless(1 / 6, 1, 0.5), [1, 1, 0])
    })

    it('cyan: h=0.5, s=1, l=0.5 → (0, 1, 1)', () => {
      expectClose(hsl2rgbBranchless(0.5, 1, 0.5), [0, 1, 1])
    })

    it('magenta: h=5/6, s=1, l=0.5 → (1, 0, 1)', () => {
      expectClose(hsl2rgbBranchless(5 / 6, 1, 0.5), [1, 0, 1])
    })

    it('white: h=0, s=0, l=1 → (1, 1, 1)', () => {
      expectClose(hsl2rgbBranchless(0, 0, 1), [1, 1, 1])
    })

    it('black: h=0, s=0, l=0 → (0, 0, 0)', () => {
      expectClose(hsl2rgbBranchless(0, 0, 0), [0, 0, 0])
    })

    it('50% gray: h=0, s=0, l=0.5 → (0.5, 0.5, 0.5)', () => {
      expectClose(hsl2rgbBranchless(0, 0, 0.5), [0.5, 0.5, 0.5])
    })
  })

  describe('edge cases', () => {
    it('h=1.0 wraps to same as h=0.0 (red)', () => {
      expectClose(hsl2rgbBranchless(1.0, 1, 0.5), hsl2rgbBranchless(0.0, 1, 0.5))
    })

    it('h=0.999... is near-red (wraps smoothly)', () => {
      const result = hsl2rgbBranchless(0.999, 1, 0.5)
      // Should be very close to pure red
      expect(result[0]).toBeGreaterThan(0.99)
      expect(result[1]).toBeLessThan(0.02)
      expect(result[2]).toBeLessThan(0.02)
    })

    it('negative hue wraps correctly', () => {
      expectClose(hsl2rgbBranchless(-0.5, 1, 0.5), hsl2rgbBranchless(0.5, 1, 0.5))
    })

    it('hue > 1.0 wraps correctly', () => {
      expectClose(hsl2rgbBranchless(1.5, 1, 0.5), hsl2rgbBranchless(0.5, 1, 0.5))
    })

    it('s=0 always produces gray regardless of hue', () => {
      for (const h of [0, 0.1, 0.33, 0.5, 0.66, 0.9]) {
        const [r, g, b] = hsl2rgbBranchless(h, 0, 0.7)
        expect(r).toBeCloseTo(0.7, 5)
        expect(g).toBeCloseTo(0.7, 5)
        expect(b).toBeCloseTo(0.7, 5)
      }
    })

    it('l=0 always produces black regardless of hue/saturation', () => {
      for (const h of [0, 0.25, 0.5, 0.75]) {
        expectClose(hsl2rgbBranchless(h, 1, 0), [0, 0, 0])
      }
    })

    it('l=1 always produces white regardless of hue/saturation', () => {
      for (const h of [0, 0.25, 0.5, 0.75]) {
        expectClose(hsl2rgbBranchless(h, 1, 1), [1, 1, 1])
      }
    })
  })

  describe('matches branchy reference across hue sectors', () => {
    // Sweep through hue at 1-degree resolution
    const hueSteps = 360
    const saturations = [0, 0.25, 0.5, 0.75, 1.0]
    const lightnesses = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0]

    it(`matches branchy across ${hueSteps} hue steps × ${saturations.length}S × ${lightnesses.length}L`, () => {
      let maxDelta = 0
      let worstCase = ''

      for (let hi = 0; hi < hueSteps; hi++) {
        const h = hi / hueSteps
        for (const s of saturations) {
          for (const l of lightnesses) {
            const ref = hsl2rgbBranchy(h, s, l)
            const test = hsl2rgbBranchless(h, s, l)

            for (let ch = 0; ch < 3; ch++) {
              const delta = Math.abs(ref[ch]! - test[ch]!)
              if (delta > maxDelta) {
                maxDelta = delta
                worstCase = `h=${h.toFixed(4)} s=${s} l=${l} ch=${ch} ref=${ref[ch]!.toFixed(6)} test=${test[ch]!.toFixed(6)}`
              }
            }
          }
        }
      }

      // Branchless and branchy must produce identical results (within f64 precision)
      expect(maxDelta).toBeLessThan(1e-10)
      if (maxDelta > 0) {
        // Log worst case for debugging if it ever drifts
        console.log(`hsl2rgb worst-case delta: ${maxDelta.toExponential(3)} at ${worstCase}`)
      }
    })
  })

  describe('output range', () => {
    it('all RGB channels are in [0, 1] for random inputs', () => {
      // Deterministic pseudo-random sweep
      for (let i = 0; i < 1000; i++) {
        const h = (((i * 0.618033988749895) % 1) + 1) % 1
        const s = (i % 11) / 10
        const l = (i % 13) / 12
        const [r, g, b] = hsl2rgbBranchless(h, s, l)
        expect(r).toBeGreaterThanOrEqual(-1e-10)
        expect(r).toBeLessThanOrEqual(1 + 1e-10)
        expect(g).toBeGreaterThanOrEqual(-1e-10)
        expect(g).toBeLessThanOrEqual(1 + 1e-10)
        expect(b).toBeGreaterThanOrEqual(-1e-10)
        expect(b).toBeLessThanOrEqual(1 + 1e-10)
      }
    })
  })
})
