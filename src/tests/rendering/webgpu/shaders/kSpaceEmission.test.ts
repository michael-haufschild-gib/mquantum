import { describe, expect, it } from 'vitest'

import {
  ALGO_BRANCH,
  COLOR_ALG_NAMES,
} from '@/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl'

describe('k-Space Occupation emission shader (algorithm 15)', () => {
  it('ALGO_BRANCH[15] contains sampleAnalysisFromGrid call', () => {
    expect(ALGO_BRANCH[15]).toContain('sampleAnalysisFromGrid')
  })

  it('ALGO_BRANCH[15] uses hsl2rgb for viridis-like colormap', () => {
    expect(ALGO_BRANCH[15]).toContain('hsl2rgb')
  })

  it('ALGO_BRANCH[15] reads occupation number from analysis.r', () => {
    expect(ALGO_BRANCH[15]).toContain('analysis.r')
  })

  it('COLOR_ALG_NAMES[15] exists with correct label', () => {
    expect(COLOR_ALG_NAMES[15]).toBe('k-Space Occupation')
  })

  it('has entries for all 16 algorithms (0-15)', () => {
    expect(Object.keys(ALGO_BRANCH).length).toBeGreaterThanOrEqual(16)
    expect(Object.keys(COLOR_ALG_NAMES).length).toBeGreaterThanOrEqual(16)
    for (let i = 0; i <= 15; i++) {
      expect(ALGO_BRANCH[i]!.length).toBeGreaterThan(0)
      expect(COLOR_ALG_NAMES[i]!.length).toBeGreaterThan(0)
    }
  })
})
