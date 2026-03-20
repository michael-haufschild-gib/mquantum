import { describe, expect, it } from 'vitest'

import {
  clampToRange,
  normalizeLightingLoadData,
  normalizePbrLoadData,
} from '@/stores/utils/presetNormalization'

describe('normalizeLightingLoadData', () => {
  it('clamps lightHorizontalAngle to [0, 360) wrapping', () => {
    const result = normalizeLightingLoadData({ lightHorizontalAngle: -30 })
    expect(result.lightHorizontalAngle).toBe(330)
  })

  it('clamps lightHorizontalAngle modulo 360', () => {
    const result = normalizeLightingLoadData({ lightHorizontalAngle: 400 })
    expect(result.lightHorizontalAngle).toBe(40)
  })

  it('deletes non-finite lightHorizontalAngle', () => {
    const result = normalizeLightingLoadData({ lightHorizontalAngle: NaN })
    expect(result).not.toHaveProperty('lightHorizontalAngle')
  })

  it('clamps lightVerticalAngle to [-90, 90]', () => {
    expect(normalizeLightingLoadData({ lightVerticalAngle: -100 }).lightVerticalAngle).toBe(-90)
    expect(normalizeLightingLoadData({ lightVerticalAngle: 100 }).lightVerticalAngle).toBe(90)
    expect(normalizeLightingLoadData({ lightVerticalAngle: 45 }).lightVerticalAngle).toBe(45)
  })

  it('clamps ambientIntensity to [0, 1]', () => {
    expect(normalizeLightingLoadData({ ambientIntensity: -0.5 }).ambientIntensity).toBe(0)
    expect(normalizeLightingLoadData({ ambientIntensity: 1.5 }).ambientIntensity).toBe(1)
    expect(normalizeLightingLoadData({ ambientIntensity: 0.7 }).ambientIntensity).toBe(0.7)
  })

  it('clamps lightStrength to [0, 3]', () => {
    expect(normalizeLightingLoadData({ lightStrength: 5 }).lightStrength).toBe(3)
    expect(normalizeLightingLoadData({ lightStrength: -1 }).lightStrength).toBe(0)
  })

  it('clamps exposure to [0.1, 3]', () => {
    expect(normalizeLightingLoadData({ exposure: 0.05 }).exposure).toBe(0.1)
    expect(normalizeLightingLoadData({ exposure: 5 }).exposure).toBe(3)
  })

  it('deletes non-numeric scalar fields', () => {
    const result = normalizeLightingLoadData({
      lightHorizontalAngle: 'bad',
      ambientIntensity: null,
      exposure: undefined,
    })
    expect(result).not.toHaveProperty('lightHorizontalAngle')
    expect(result).not.toHaveProperty('ambientIntensity')
    expect(result).not.toHaveProperty('exposure')
  })

  it('validates transformMode enum', () => {
    expect(normalizeLightingLoadData({ transformMode: 'translate' }).transformMode).toBe(
      'translate'
    )
    expect(normalizeLightingLoadData({ transformMode: 'rotate' }).transformMode).toBe('rotate')
    const result = normalizeLightingLoadData({ transformMode: 'invalid' })
    expect(result).not.toHaveProperty('transformMode')
  })

  it('validates boolean fields', () => {
    expect(normalizeLightingLoadData({ showLightGizmos: true }).showLightGizmos).toBe(true)
    expect(normalizeLightingLoadData({ showLightGizmos: 'yes' })).not.toHaveProperty(
      'showLightGizmos'
    )
    expect(normalizeLightingLoadData({ isDraggingLight: 1 })).not.toHaveProperty('isDraggingLight')
  })

  it('strips unknown keys', () => {
    const result = normalizeLightingLoadData({
      lightStrength: 1,
      unknownField: 'should be stripped',
    })
    expect(result).not.toHaveProperty('unknownField')
    expect(result.lightStrength).toBe(1)
  })

  it('handles empty input', () => {
    const result = normalizeLightingLoadData({})
    expect(result).toEqual({})
  })

  it('deletes invalid lights array', () => {
    const result = normalizeLightingLoadData({ lights: 'not-an-array' })
    expect(result).not.toHaveProperty('lights')
  })

  it('deletes lights array with no valid entries', () => {
    const result = normalizeLightingLoadData({ lights: [null, 42, 'bad'] })
    expect(result).not.toHaveProperty('lights')
  })
})

describe('clampToRange', () => {
  it('clamps below min', () => {
    expect(clampToRange(-5, 0, 10)).toBe(0)
  })

  it('clamps above max', () => {
    expect(clampToRange(15, 0, 10)).toBe(10)
  })

  it('returns value within range', () => {
    expect(clampToRange(5, 0, 10)).toBe(5)
  })
})

describe('normalizePbrLoadData', () => {
  it('handles empty input without crashing', () => {
    const result = normalizePbrLoadData({})
    expect(result).toEqual({})
  })

  it('clamps roughness to [0.04, 1.0]', () => {
    const result = normalizePbrLoadData({ face: { roughness: 0.01 } })
    const face = result.face as Record<string, number>
    expect(face.roughness).toBe(0.04)
  })
})
