import { describe, expect, it } from 'vitest'
import { fcos, fsin } from '@/lib/math/trig'

describe('fsin', () => {
  it('returns 0 at x = 0', () => {
    expect(fsin(0)).toBeCloseTo(0, 10)
  })

  it('returns 1 at x = PI/2', () => {
    expect(fsin(Math.PI / 2)).toBeCloseTo(1, 10)
  })

  it('returns 0 at x = PI', () => {
    expect(fsin(Math.PI)).toBeCloseTo(0, 5)
  })

  it('returns -1 at x = 3*PI/2', () => {
    expect(fsin((3 * Math.PI) / 2)).toBeCloseTo(-1, 5)
  })

  it('stays within max error ~0.056 across a full cycle', () => {
    const maxError = 0.06
    const steps = 360
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * 2 * Math.PI
      const approx = fsin(angle)
      const exact = Math.sin(angle)
      expect(Math.abs(approx - exact)).toBeLessThan(maxError)
    }
  })

  it('normalizes large inputs correctly', () => {
    const x = 100 * Math.PI + Math.PI / 2
    expect(fsin(x)).toBeCloseTo(Math.sin(x), 0)
  })

  it('normalizes negative inputs correctly', () => {
    const x = -7 * Math.PI / 3
    expect(Math.abs(fsin(x) - Math.sin(x))).toBeLessThan(0.06)
  })

  it('output is clamped to [-1, 1]', () => {
    for (let i = 0; i < 1000; i++) {
      const x = (i - 500) * 0.1
      const result = fsin(x)
      expect(result).toBeGreaterThanOrEqual(-1)
      expect(result).toBeLessThanOrEqual(1)
    }
  })

  it('is periodic with period 2*PI', () => {
    const angles = [0.3, 1.0, 2.5, -1.7, 4.2]
    for (const x of angles) {
      expect(fsin(x)).toBeCloseTo(fsin(x + 2 * Math.PI), 10)
    }
  })
})

describe('fcos', () => {
  it('returns 1 at x = 0', () => {
    expect(fcos(0)).toBeCloseTo(1, 10)
  })

  it('returns 0 at x = PI/2', () => {
    expect(fcos(Math.PI / 2)).toBeCloseTo(0, 5)
  })

  it('satisfies cos(x) = sin(x + PI/2) identity', () => {
    const angles = [0, 0.5, 1.0, Math.PI, -1.2, 3.7, 10.0]
    for (const x of angles) {
      expect(fcos(x)).toBeCloseTo(fsin(x + Math.PI / 2), 10)
    }
  })

  it('stays within max error ~0.056 across a full cycle', () => {
    const maxError = 0.06
    const steps = 360
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * 2 * Math.PI
      const approx = fcos(angle)
      const exact = Math.cos(angle)
      expect(Math.abs(approx - exact)).toBeLessThan(maxError)
    }
  })
})
