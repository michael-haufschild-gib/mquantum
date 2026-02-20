import { describe, expect, it } from 'vitest'

import {
  ALGO_BRANCH,
  COLOR_ALG_NAMES,
} from '@/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl'

describe('k-Space Occupation emission shader (algorithm 15)', () => {
  it('ALGO_BRANCH[15] contains sampleAnalysisFromGrid call', () => {
    expect(ALGO_BRANCH[15]).toBeDefined()
    expect(ALGO_BRANCH[15]).toContain('sampleAnalysisFromGrid')
  })

  it('ALGO_BRANCH[15] uses hsl2rgb for viridis-like colormap', () => {
    expect(ALGO_BRANCH[15]).toContain('hsl2rgb')
  })

  it('ALGO_BRANCH[15] reads occupation number from analysis.r', () => {
    expect(ALGO_BRANCH[15]).toContain('analysis.r')
  })

  it('ALGO_BRANCH[15] reads |k| normalization from analysis.g', () => {
    expect(ALGO_BRANCH[15]).toContain('analysis.g')
  })

  it('ALGO_BRANCH[15] reads omega normalization from analysis.b', () => {
    expect(ALGO_BRANCH[15]).toContain('analysis.b')
  })

  it('COLOR_ALG_NAMES[15] exists with correct label', () => {
    expect(COLOR_ALG_NAMES[15]).toBe('k-Space Occupation')
  })

  it('has entries for all 16 algorithms (0-15)', () => {
    for (let i = 0; i <= 15; i++) {
      expect(ALGO_BRANCH[i]).toBeDefined()
      expect(COLOR_ALG_NAMES[i]).toBeDefined()
    }
  })
})
