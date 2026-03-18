import { describe, expect, it } from 'vitest'

import {
  normalizeAppearanceLoadData,
  normalizePostProcessingLoadData,
} from '@/stores/utils/presetNormalizationVisual'

describe('normalizeAppearanceLoadData', () => {
  it('passes through valid scalar appearance fields', () => {
    const result = normalizeAppearanceLoadData({
      edgeColor: '#ff0000',
      faceColor: '#00ff00',
      lchLightness: 0.5,
      lchChroma: 0.2,
      faceEmission: 1.5,
    })

    expect(result.edgeColor).toBe('#ff0000')
    expect(result.faceColor).toBe('#00ff00')
    expect(result.lchLightness).toBe(0.5)
    expect(result.lchChroma).toBe(0.2)
    expect(result.faceEmission).toBe(1.5)
  })

  it('clamps out-of-range numeric fields', () => {
    const result = normalizeAppearanceLoadData({
      lchLightness: 5.0, // max 1
      lchChroma: -1.0, // min 0
      faceEmission: 10, // max 5
    })

    expect(result.lchLightness).toBe(1)
    expect(result.lchChroma).toBe(0)
    expect(result.faceEmission).toBe(5)
  })

  it('strips non-finite numeric fields', () => {
    const result = normalizeAppearanceLoadData({
      lchLightness: NaN,
      faceEmission: Infinity,
      edgeColor: '#ff0000', // valid field survives
    })

    expect(result).not.toHaveProperty('lchLightness')
    expect(result).not.toHaveProperty('faceEmission')
    expect(result.edgeColor).toBe('#ff0000')
  })

  it('strips non-string color fields', () => {
    const result = normalizeAppearanceLoadData({
      edgeColor: 123 as unknown as string,
      faceColor: null as unknown as string,
    })

    expect(result).not.toHaveProperty('edgeColor')
    expect(result).not.toHaveProperty('faceColor')
  })

  it('strips non-boolean fields', () => {
    const result = normalizeAppearanceLoadData({
      perDimensionColorEnabled: 'yes' as unknown as boolean,
      sssEnabled: 1 as unknown as boolean,
    })

    expect(result).not.toHaveProperty('perDimensionColorEnabled')
    expect(result).not.toHaveProperty('sssEnabled')
  })

  it('strips invalid colorAlgorithm enum', () => {
    const result = normalizeAppearanceLoadData({
      colorAlgorithm: 'notARealAlgorithm',
    })

    expect(result).not.toHaveProperty('colorAlgorithm')
  })

  it('normalizes nested distribution with clamping', () => {
    const result = normalizeAppearanceLoadData({
      distribution: {
        power: 10, // max 4
        cycles: -1, // min 0.5
        offset: 0.5,
      },
    }) as { distribution?: { power: number; cycles: number; offset: number } }

    expect(result.distribution?.power).toBe(4)
    expect(result.distribution?.cycles).toBe(0.5)
    expect(result.distribution?.offset).toBe(0.5)
  })

  it('deletes non-object nested fields', () => {
    const result = normalizeAppearanceLoadData({
      distribution: 'invalid',
      cosineCoefficients: null,
      multiSourceWeights: 42,
    })

    expect(result).not.toHaveProperty('distribution')
    expect(result).not.toHaveProperty('cosineCoefficients')
    expect(result).not.toHaveProperty('multiSourceWeights')
  })

  it('strips keys not in APPEARANCE_LOAD_KEYS', () => {
    const result = normalizeAppearanceLoadData({
      edgeColor: '#ff0000',
      unknownField: 'should be stripped',
      anotherGarbage: 42,
    })

    expect(result.edgeColor).toBe('#ff0000')
    expect(result).not.toHaveProperty('unknownField')
    expect(result).not.toHaveProperty('anotherGarbage')
  })
})

describe('normalizePostProcessingLoadData', () => {
  it('passes through valid post-processing fields', () => {
    const result = normalizePostProcessingLoadData({
      bloomEnabled: true,
      bloomGain: 1.5,
      bloomThreshold: 0.8,
      antiAliasingMethod: 'fxaa',
    })

    expect(result.bloomEnabled).toBe(true)
    expect(result.bloomGain).toBe(1.5)
    expect(result.bloomThreshold).toBe(0.8)
    expect(result.antiAliasingMethod).toBe('fxaa')
  })

  it('clamps out-of-range bloom values', () => {
    const result = normalizePostProcessingLoadData({
      bloomGain: 10, // max 3
      bloomThreshold: -1, // min 0
      bloomRadius: 0.1, // min 0.25
    })

    expect(result.bloomGain).toBe(3)
    expect(result.bloomThreshold).toBe(0)
    expect(result.bloomRadius).toBe(0.25)
  })

  it('strips non-finite numeric values', () => {
    const result = normalizePostProcessingLoadData({
      bloomGain: NaN,
      cinematicVignette: Infinity,
      bloomEnabled: true,
    })

    expect(result).not.toHaveProperty('bloomGain')
    expect(result).not.toHaveProperty('cinematicVignette')
    expect(result.bloomEnabled).toBe(true)
  })

  it('strips invalid antiAliasingMethod enum', () => {
    const result = normalizePostProcessingLoadData({
      antiAliasingMethod: 'msaa',
    })

    expect(result).not.toHaveProperty('antiAliasingMethod')
  })

  it('rounds and clamps paperFoldCount to integer', () => {
    const result = normalizePostProcessingLoadData({
      paperFoldCount: 3.7,
    })

    expect(result.paperFoldCount).toBe(4)
  })

  it('strips non-number paperFoldCount', () => {
    const result = normalizePostProcessingLoadData({
      paperFoldCount: 'many' as unknown as number,
    })

    expect(result).not.toHaveProperty('paperFoldCount')
  })

  it('validates paper quality enum', () => {
    const validResult = normalizePostProcessingLoadData({
      paperQuality: 'high',
    })
    expect(validResult.paperQuality).toBe('high')

    const invalidResult = normalizePostProcessingLoadData({
      paperQuality: 'ultra',
    })
    expect(invalidResult).not.toHaveProperty('paperQuality')
  })

  it('strips keys not in POST_PROCESSING_LOAD_KEYS', () => {
    const result = normalizePostProcessingLoadData({
      bloomEnabled: true,
      hackField: 'should be stripped',
    })

    expect(result.bloomEnabled).toBe(true)
    expect(result).not.toHaveProperty('hackField')
  })
})
