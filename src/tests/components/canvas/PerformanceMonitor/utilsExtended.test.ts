/**
 * Tests for the PerformanceMonitor formatting / classification helpers.
 *
 * The existing utils.test.ts only covers `formatFpsBound`. The remaining
 * helpers — `formatMetric`, `formatBytes`, `getHealthColor`, `formatShaderName`,
 * `getFpsColorLevel`, `computeSparklinePoints` — drive every visible label
 * and color in the perf panel. A regression silently mislabels metrics
 * (gigabytes shown as kilobytes), miscolors the FPS chip (degraded run looks
 * healthy), or produces a malformed SVG polyline that crashes the panel.
 */

import { describe, expect, it } from 'vitest'

import {
  computeSparklinePoints,
  formatBytes,
  formatMetric,
  formatShaderName,
  FPS_COLORS,
  getFpsColorLevel,
  getHealthColor,
} from '@/components/canvas/PerformanceMonitor/utils'

describe('formatMetric', () => {
  it('returns "0<unit>" for exact zero (zero check is special-cased)', () => {
    expect(formatMetric(0)).toBe('0')
    expect(formatMetric(0, ' fps')).toBe('0 fps')
  })

  it('rounds values < 1000 to nearest integer (no decimals)', () => {
    expect(formatMetric(123.7)).toBe('124')
    expect(formatMetric(999.4)).toBe('999')
  })

  it('formats values in [1k, 1M) with k suffix and 1 default decimal', () => {
    expect(formatMetric(1000)).toBe('1.0k')
    expect(formatMetric(1500)).toBe('1.5k')
    expect(formatMetric(999_999)).toBe('1000.0k')
  })

  it('formats values >= 1M with M suffix', () => {
    expect(formatMetric(1_000_000)).toBe('1.0M')
    expect(formatMetric(2_345_678)).toBe('2.3M')
  })

  it('respects custom decimals parameter', () => {
    expect(formatMetric(1500, '', 0)).toBe('2k')
    expect(formatMetric(1500, '', 2)).toBe('1.50k')
    expect(formatMetric(1_234_567, '', 3)).toBe('1.235M')
  })

  it('appends the unit string for all branches', () => {
    expect(formatMetric(0, ' tris')).toBe('0 tris')
    expect(formatMetric(500, ' tris')).toBe('500 tris')
    expect(formatMetric(2000, ' tris')).toBe('2.0k tris')
    expect(formatMetric(2_000_000, ' tris')).toBe('2.0M tris')
  })

  it('returns a placeholder for non-finite or negative metric values', () => {
    expect(formatMetric(Number.NaN)).toBe('—')
    expect(formatMetric(Infinity)).toBe('—')
    expect(formatMetric(-1)).toBe('—')
  })
})

describe('formatBytes', () => {
  it('returns "0 B" for exact zero', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('formats bytes in B for values < 1024', () => {
    expect(formatBytes(500)).toBe('500.0 B')
  })

  it('formats KB at 1024 boundary', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('formats MB at 1024² boundary', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('formats GB at 1024³ boundary', () => {
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB')
    expect(formatBytes(2.5 * 1024 ** 3)).toBe('2.5 GB')
  })

  it('respects custom decimals', () => {
    expect(formatBytes(1024, 3)).toBe('1.000 KB')
    expect(formatBytes(1500, 0)).toBe('1 KB')
  })

  it('formats TB and PB at 1024⁴ / 1024⁵ boundaries', () => {
    expect(formatBytes(1024 ** 4)).toBe('1.0 TB')
    expect(formatBytes(2 * 1024 ** 4)).toBe('2.0 TB')
    expect(formatBytes(1024 ** 5)).toBe('1.0 PB')
  })

  it('clamps multi-petabyte values to PB instead of producing "undefined"', () => {
    // 1 EB = 1024 PB. The previous implementation fell off the size-table
    // and rendered "1.0 undefined" for any value beyond the GB bucket.
    expect(formatBytes(1024 ** 6)).toBe('1024.0 PB')
  })

  it('returns a placeholder for non-finite or negative byte counts', () => {
    expect(formatBytes(Number.NaN)).toBe('—')
    expect(formatBytes(Infinity)).toBe('—')
    expect(formatBytes(-1)).toBe('—')
  })
})

describe('getHealthColor', () => {
  it('returns high color when fps >= high threshold', () => {
    const c = getHealthColor(60, 55, 30)
    expect(c.text).toBe('health-high')
    expect(c.stroke).toContain('high')
  })

  it('returns medium color when low <= fps < high', () => {
    const c = getHealthColor(45, 55, 30)
    expect(c.text).toBe('health-medium')
  })

  it('returns low color when fps < low threshold', () => {
    const c = getHealthColor(20, 55, 30)
    expect(c.text).toBe('health-low')
  })

  it('boundary at "high" threshold goes to high (≥)', () => {
    expect(getHealthColor(55, 55, 30).text).toBe('health-high')
  })

  it('boundary at "low" threshold goes to medium (≥)', () => {
    expect(getHealthColor(30, 55, 30).text).toBe('health-medium')
  })
})

describe('getFpsColorLevel', () => {
  it('returns "high" for fps >= 55', () => {
    expect(getFpsColorLevel(55)).toBe('high')
    expect(getFpsColorLevel(120)).toBe('high')
  })

  it('returns "medium" for 30 <= fps < 55', () => {
    expect(getFpsColorLevel(30)).toBe('medium')
    expect(getFpsColorLevel(40)).toBe('medium')
    expect(getFpsColorLevel(54)).toBe('medium')
  })

  it('returns "low" for fps < 30', () => {
    expect(getFpsColorLevel(29)).toBe('low')
    expect(getFpsColorLevel(0)).toBe('low')
  })

  it('FPS_COLORS exposes a stable record with three documented levels', () => {
    expect(Object.keys(FPS_COLORS).sort()).toEqual(['high', 'low', 'medium'])
    for (const c of Object.values(FPS_COLORS)) {
      expect(c.text).toMatch(/^health-/)
      expect(c.bg).toMatch(/^bg-health-/)
    }
  })
})

describe('formatShaderName', () => {
  it('"object" key uses the objectType for display', () => {
    expect(formatShaderName('object', 'schroedinger')).toBe('Schroedinger')
    expect(formatShaderName('object', 'pauliSpinor')).toBe('Pauli Spinor')
  })

  it('non-object keys are simply title-cased', () => {
    expect(formatShaderName('skybox', 'irrelevant')).toBe('Skybox')
    expect(formatShaderName('bloom', 'irrelevant')).toBe('Bloom')
  })

  // The string-transformation paths (camelCase split, hyphen → space) are
  // exercised by the only multi-word valid object type, 'pauliSpinor', in the
  // test above. No real ObjectType contains hyphens or arbitrary camelCase
  // segments, so the dead-code paths in formatShaderName are not codified
  // here as supported behaviour.
})

describe('computeSparklinePoints', () => {
  it('returns empty string for fewer than 2 data points', () => {
    expect(computeSparklinePoints([], 100, 50, 0, 100)).toBe('')
    expect(computeSparklinePoints([42], 100, 50, 0, 100)).toBe('')
  })

  it('returns flat line at midY when minY === maxY', () => {
    const out = computeSparklinePoints([5, 5, 5, 5], 100, 50, 5, 5)
    expect(out).toBe('0,25 33.333333333333336,25 66.66666666666667,25 100,25')
  })

  it('linearly interpolates X across [0, width]', () => {
    const out = computeSparklinePoints([0, 50, 100], 200, 100, 0, 100)
    // First point at x=0, last at x=200.
    expect(out.startsWith('0,')).toBe(true)
    expect(out.split(' ').at(-1)!.startsWith('200,')).toBe(true)
  })

  it('inverts Y axis (max value → y=0, min value → y=height)', () => {
    const out = computeSparklinePoints([0, 100], 100, 50, 0, 100)
    // 0 → bottom (y=50), 100 → top (y=0)
    expect(out).toBe('0,50 100,0')
  })

  it('clamps values outside [minY, maxY] to the nearest edge', () => {
    const out = computeSparklinePoints([-50, 200], 100, 50, 0, 100)
    // -50 below min → bottom (y=50); 200 above max → top (y=0).
    expect(out).toBe('0,50 100,0')
  })

  it('keeps non-finite samples out of SVG coordinates', () => {
    const out = computeSparklinePoints([0, Number.NaN, 100, Infinity], 100, 50, 0, 100)
    expect(out).toBe('0,50 33.333333333333336,50 66.66666666666667,0 100,50')
    expect(out).not.toContain('NaN')
    expect(out).not.toContain('Infinity')
  })

  it('produces a valid SVG points string format (only digits, commas, dots, minus, spaces)', () => {
    const out = computeSparklinePoints([10, 20, 30, 25, 15], 200, 80, 0, 50)
    expect(out).toMatch(/^[\d.,\s-]+$/)
    // 5 data points → 5 coordinate pairs separated by 4 spaces.
    expect(out.split(' ')).toHaveLength(5)
  })

  it('handles negative ranges (minY > 0, maxY < minY would be zero range — flat line)', () => {
    const out = computeSparklinePoints([10, 5, 0], 100, 50, 100, 50)
    // maxY < minY → range <= 0 → flat at midpoint.
    expect(out.split(' ').every((p) => p.endsWith(',25'))).toBe(true)
  })
})
