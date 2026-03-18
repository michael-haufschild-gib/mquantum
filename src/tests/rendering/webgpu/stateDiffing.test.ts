import { describe, expect, it } from 'vitest'

import {
  createVersionTracker,
  isBasisDirty,
  isSchroedingerDirty,
  resetVersionTracker,
  updateBasisVersions,
  updateSchroedingerVersions,
} from '@/rendering/webgpu/renderers/stateDiffing'

describe('createVersionTracker', () => {
  it('initializes all numeric versions to -1 (forces first-frame update)', () => {
    const t = createVersionTracker()
    expect(t.lastSchroedingerVersion).toBe(-1)
    expect(t.lastSchrodingerAppearanceVersion).toBe(-1)
    expect(t.lastSchrodingerPbrVersion).toBe(-1)
    expect(t.lastPauliSpinorVersion).toBe(-1)
    expect(t.lastLightingVersion).toBe(-1)
    expect(t.lastAppearanceVersion).toBe(-1)
    expect(t.lastPbrVersion).toBe(-1)
    expect(t.lastBasisRotationVersion).toBe(-1)
    expect(t.lastBasisSchroedingerVersion).toBe(-1)
    expect(t.lastBasisDimension).toBe(-1)
  })

  it('initializes lastBasisAnimationTime to NaN (always triggers first basis write)', () => {
    const t = createVersionTracker()
    expect(Number.isNaN(t.lastBasisAnimationTime)).toBe(true)
  })

  it('initializes quality signature to empty string', () => {
    const t = createVersionTracker()
    expect(t.lastQualitySignature).toBe('')
  })
})

describe('resetVersionTracker', () => {
  it('resets a mutated tracker back to initial state', () => {
    const t = createVersionTracker()
    t.lastSchroedingerVersion = 5
    t.lastLightingVersion = 3
    t.lastQualitySignature = 'abc'
    t.lastBasisAnimationTime = 1.23

    resetVersionTracker(t)

    expect(t.lastSchroedingerVersion).toBe(-1)
    expect(t.lastLightingVersion).toBe(-1)
    expect(t.lastQualitySignature).toBe('')
    expect(Number.isNaN(t.lastBasisAnimationTime)).toBe(true)
  })

  it('mutates the same object reference', () => {
    const t = createVersionTracker()
    const ref = t
    resetVersionTracker(t)
    expect(t).toBe(ref)
  })
})

describe('isSchroedingerDirty', () => {
  it('reports dirty on fresh tracker (version === -1)', () => {
    const t = createVersionTracker()
    const v = { schroedingerVersion: 0, appearanceVersion: 0, pbrVersion: 0, pauliSpinorVersion: 0 }
    expect(isSchroedingerDirty(t, v)).toBe(true)
  })

  it('reports clean when all versions match', () => {
    const t = createVersionTracker()
    const v = { schroedingerVersion: 3, appearanceVersion: 2, pbrVersion: 1, pauliSpinorVersion: 0 }
    updateSchroedingerVersions(t, v)

    expect(isSchroedingerDirty(t, v)).toBe(false)
  })

  it('reports dirty when any single version changes', () => {
    const t = createVersionTracker()
    const v = { schroedingerVersion: 3, appearanceVersion: 2, pbrVersion: 1, pauliSpinorVersion: 0 }
    updateSchroedingerVersions(t, v)

    expect(isSchroedingerDirty(t, { ...v, schroedingerVersion: 4 })).toBe(true)
    expect(isSchroedingerDirty(t, { ...v, appearanceVersion: 3 })).toBe(true)
    expect(isSchroedingerDirty(t, { ...v, pbrVersion: 2 })).toBe(true)
    expect(isSchroedingerDirty(t, { ...v, pauliSpinorVersion: 1 })).toBe(true)
  })
})

describe('updateSchroedingerVersions', () => {
  it('stamps all four version counters', () => {
    const t = createVersionTracker()
    updateSchroedingerVersions(t, {
      schroedingerVersion: 10,
      appearanceVersion: 5,
      pbrVersion: 3,
      pauliSpinorVersion: 1,
    })

    expect(t.lastSchroedingerVersion).toBe(10)
    expect(t.lastSchrodingerAppearanceVersion).toBe(5)
    expect(t.lastSchrodingerPbrVersion).toBe(3)
    expect(t.lastPauliSpinorVersion).toBe(1)
  })
})

describe('isBasisDirty', () => {
  const baseVersions = {
    rotationVersion: 1,
    schroedingerVersion: 2,
    dimension: 4,
    accumulatedTime: 0,
    requiresTimeDrivenBasis: false,
  }

  it('reports dirty on fresh tracker', () => {
    const t = createVersionTracker()
    expect(isBasisDirty(t, baseVersions)).toBe(true)
  })

  it('reports clean when static inputs match and no time-driven basis', () => {
    const t = createVersionTracker()
    updateBasisVersions(t, baseVersions)
    expect(isBasisDirty(t, baseVersions)).toBe(false)
  })

  it('reports dirty when rotation version changes', () => {
    const t = createVersionTracker()
    updateBasisVersions(t, baseVersions)
    expect(isBasisDirty(t, { ...baseVersions, rotationVersion: 2 })).toBe(true)
  })

  it('reports dirty when dimension changes', () => {
    const t = createVersionTracker()
    updateBasisVersions(t, baseVersions)
    expect(isBasisDirty(t, { ...baseVersions, dimension: 6 })).toBe(true)
  })

  it('reports dirty when time-driven basis has significant time delta', () => {
    const t = createVersionTracker()
    const v = { ...baseVersions, requiresTimeDrivenBasis: true, accumulatedTime: 1.0 }
    updateBasisVersions(t, v)

    // Same time → clean
    expect(isBasisDirty(t, v)).toBe(false)

    // Small delta within epsilon → clean
    expect(isBasisDirty(t, { ...v, accumulatedTime: 1.0 + 1e-7 })).toBe(false)

    // Significant delta → dirty
    expect(isBasisDirty(t, { ...v, accumulatedTime: 1.001 })).toBe(true)
  })

  it('ignores time delta when not time-driven', () => {
    const t = createVersionTracker()
    updateBasisVersions(t, baseVersions)

    // Changing accumulatedTime should not cause dirty when requiresTimeDrivenBasis=false
    expect(isBasisDirty(t, { ...baseVersions, accumulatedTime: 999 })).toBe(false)
  })
})

describe('updateBasisVersions', () => {
  it('stores NaN for animation time when not time-driven', () => {
    const t = createVersionTracker()
    updateBasisVersions(t, {
      rotationVersion: 1,
      schroedingerVersion: 2,
      dimension: 4,
      accumulatedTime: 5.0,
      requiresTimeDrivenBasis: false,
    })
    expect(Number.isNaN(t.lastBasisAnimationTime)).toBe(true)
  })

  it('stores actual time when time-driven', () => {
    const t = createVersionTracker()
    updateBasisVersions(t, {
      rotationVersion: 1,
      schroedingerVersion: 2,
      dimension: 4,
      accumulatedTime: 5.0,
      requiresTimeDrivenBasis: true,
    })
    expect(t.lastBasisAnimationTime).toBe(5.0)
  })
})
