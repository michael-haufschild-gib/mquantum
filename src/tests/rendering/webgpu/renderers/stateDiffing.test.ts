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
  it('initializes all versions to -1 (forces full update on first frame)', () => {
    const tracker = createVersionTracker()
    expect(tracker.lastSchroedingerVersion).toBe(-1)
    expect(tracker.lastSchroedingerAppearanceVersion).toBe(-1)
    expect(tracker.lastSchroedingerPbrVersion).toBe(-1)
    expect(tracker.lastPauliSpinorVersion).toBe(-1)
    expect(tracker.lastLightingVersion).toBe(-1)
    expect(tracker.lastAppearanceVersion).toBe(-1)
    expect(tracker.lastPbrVersion).toBe(-1)
    expect(tracker.lastQualitySignature).toBe('')
    expect(tracker.lastBasisRotationVersion).toBe(-1)
    expect(tracker.lastBasisSchroedingerVersion).toBe(-1)
    expect(tracker.lastBasisDimension).toBe(-1)
    expect(Number.isNaN(tracker.lastBasisAnimationTime)).toBe(true)
  })
})

describe('isSchroedingerDirty / updateSchroedingerVersions', () => {
  it('detects dirty on fresh tracker', () => {
    const tracker = createVersionTracker()
    const versions = {
      schroedingerVersion: 0,
      appearanceVersion: 0,
      pbrVersion: 0,
      pauliSpinorVersion: 0,
    }
    expect(isSchroedingerDirty(tracker, versions)).toBe(true)
  })

  it('reports clean after stamping matching versions', () => {
    const tracker = createVersionTracker()
    const versions = {
      schroedingerVersion: 5,
      appearanceVersion: 3,
      pbrVersion: 1,
      pauliSpinorVersion: 2,
    }
    updateSchroedingerVersions(tracker, versions)
    expect(isSchroedingerDirty(tracker, versions)).toBe(false)
  })

  it('detects dirty when schroedingerVersion changes', () => {
    const tracker = createVersionTracker()
    const v1 = {
      schroedingerVersion: 1,
      appearanceVersion: 1,
      pbrVersion: 1,
      pauliSpinorVersion: 1,
    }
    updateSchroedingerVersions(tracker, v1)

    const v2 = { ...v1, schroedingerVersion: 2 }
    expect(isSchroedingerDirty(tracker, v2)).toBe(true)
  })

  it('detects dirty when pbrVersion changes', () => {
    const tracker = createVersionTracker()
    const v1 = {
      schroedingerVersion: 1,
      appearanceVersion: 1,
      pbrVersion: 1,
      pauliSpinorVersion: 1,
    }
    updateSchroedingerVersions(tracker, v1)

    const v2 = { ...v1, pbrVersion: 2 }
    expect(isSchroedingerDirty(tracker, v2)).toBe(true)
  })
})

describe('resetVersionTracker', () => {
  it('makes previously clean tracker dirty again', () => {
    const tracker = createVersionTracker()
    const versions = {
      schroedingerVersion: 5,
      appearanceVersion: 3,
      pbrVersion: 1,
      pauliSpinorVersion: 2,
    }
    updateSchroedingerVersions(tracker, versions)
    expect(isSchroedingerDirty(tracker, versions)).toBe(false)

    resetVersionTracker(tracker)
    expect(isSchroedingerDirty(tracker, versions)).toBe(true)
  })
})

describe('isBasisDirty / updateBasisVersions', () => {
  it('detects dirty on fresh tracker', () => {
    const tracker = createVersionTracker()
    expect(
      isBasisDirty(tracker, {
        rotationVersion: 0,
        schroedingerVersion: 0,
        dimension: 3,
        accumulatedTime: 0,
        requiresTimeDrivenBasis: false,
      })
    ).toBe(true)
  })

  it('reports clean after stamping static basis versions', () => {
    const tracker = createVersionTracker()
    const v = {
      rotationVersion: 1,
      schroedingerVersion: 2,
      dimension: 4,
      accumulatedTime: 0,
      requiresTimeDrivenBasis: false,
    }
    updateBasisVersions(tracker, v)
    expect(isBasisDirty(tracker, v)).toBe(false)
  })

  it('detects dirty when dimension changes', () => {
    const tracker = createVersionTracker()
    const v1 = {
      rotationVersion: 1,
      schroedingerVersion: 2,
      dimension: 4,
      accumulatedTime: 0,
      requiresTimeDrivenBasis: false,
    }
    updateBasisVersions(tracker, v1)

    const v2 = { ...v1, dimension: 5 }
    expect(isBasisDirty(tracker, v2)).toBe(true)
  })

  it('detects dirty for time-driven basis when time changes', () => {
    const tracker = createVersionTracker()
    const v1 = {
      rotationVersion: 1,
      schroedingerVersion: 2,
      dimension: 4,
      accumulatedTime: 1.0,
      requiresTimeDrivenBasis: true,
    }
    updateBasisVersions(tracker, v1)

    const v2 = { ...v1, accumulatedTime: 1.1 }
    expect(isBasisDirty(tracker, v2)).toBe(true)
  })

  it('ignores time delta below epsilon when static inputs unchanged', () => {
    const tracker = createVersionTracker()
    const v1 = {
      rotationVersion: 1,
      schroedingerVersion: 2,
      dimension: 4,
      accumulatedTime: 1.0,
      requiresTimeDrivenBasis: true,
    }
    updateBasisVersions(tracker, v1)

    // Negligible time change (< 1e-6)
    const v2 = { ...v1, accumulatedTime: 1.0000005 }
    expect(isBasisDirty(tracker, v2)).toBe(false)
  })
})
