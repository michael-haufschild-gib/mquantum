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
    expect(t.lastSchroedingerAppearanceVersion).toBe(-1)
    expect(t.lastSchroedingerPbrVersion).toBe(-1)
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

  it('mutates the same object reference (no reallocation)', () => {
    const t = createVersionTracker()
    const ref = t
    resetVersionTracker(t)
    expect(t).toBe(ref)
  })

  it('makes a previously clean tracker dirty again', () => {
    const t = createVersionTracker()
    const versions = {
      schroedingerVersion: 5,
      appearanceVersion: 3,
      pbrVersion: 1,
      pauliSpinorVersion: 2,
    }
    updateSchroedingerVersions(t, versions)
    expect(isSchroedingerDirty(t, versions)).toBe(false)

    resetVersionTracker(t)
    expect(isSchroedingerDirty(t, versions)).toBe(true)
  })
})

describe('isSchroedingerDirty', () => {
  it('reports dirty on a fresh tracker (version === -1)', () => {
    const t = createVersionTracker()
    const v = { schroedingerVersion: 0, appearanceVersion: 0, pbrVersion: 0, pauliSpinorVersion: 0 }
    expect(isSchroedingerDirty(t, v)).toBe(true)
  })

  it('reports clean after stamping matching versions', () => {
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
    expect(t.lastSchroedingerAppearanceVersion).toBe(5)
    expect(t.lastSchroedingerPbrVersion).toBe(3)
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

  it('reports dirty on a fresh tracker', () => {
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

  it('reports dirty when time-driven basis has a significant time delta', () => {
    const t = createVersionTracker()
    const v = { ...baseVersions, requiresTimeDrivenBasis: true, accumulatedTime: 1.0 }
    updateBasisVersions(t, v)

    expect(isBasisDirty(t, v)).toBe(false)
    expect(isBasisDirty(t, { ...v, accumulatedTime: 1.0 + 1e-7 })).toBe(false)
    expect(isBasisDirty(t, { ...v, accumulatedTime: 1.001 })).toBe(true)
  })

  it('ignores time delta below epsilon when static inputs unchanged', () => {
    const t = createVersionTracker()
    const v1 = { ...baseVersions, requiresTimeDrivenBasis: true, accumulatedTime: 1.0 }
    updateBasisVersions(t, v1)

    // Negligible time change (< 1e-6)
    const v2 = { ...v1, accumulatedTime: 1.0000005 }
    expect(isBasisDirty(t, v2)).toBe(false)
  })

  it('ignores time delta entirely when not time-driven', () => {
    const t = createVersionTracker()
    updateBasisVersions(t, baseVersions)
    // requiresTimeDrivenBasis=false — time changes must not trigger dirty
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

  it('stores the actual accumulated time when time-driven', () => {
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
