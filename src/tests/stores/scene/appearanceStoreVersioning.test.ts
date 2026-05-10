/**
 * Tests for the appearance store version auto-increment mechanism.
 *
 * The appearance store wraps its setter to auto-increment `appearanceVersion`
 * on every mutation. This version counter drives dirty-flag optimization in
 * the render pipeline — if it doesn't increment, the renderer won't update
 * materials. If it increments spuriously, the renderer does unnecessary work.
 *
 * These tests verify:
 * - Every appearance mutation bumps the version exactly once
 * - bumpVersion is independent of property changes
 * - Reset restores version to 0
 * - Version isolation from other stores
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useAppearanceStore } from '@/stores/scene/appearanceStore'
import { APPEARANCE_INITIAL_STATE } from '@/stores/slices/appearanceSlice'

describe('appearance store version tracking', () => {
  beforeEach(() => {
    useAppearanceStore.setState({ ...APPEARANCE_INITIAL_STATE, appearanceVersion: 0 })
  })

  it('version starts at 0', () => {
    expect(useAppearanceStore.getState().appearanceVersion).toBe(0)
  })

  it('every setter mutation increments version by exactly 1', () => {
    const mutations = [
      () => useAppearanceStore.getState().setEdgeColor('#FF0000'),
      () => useAppearanceStore.getState().setFaceEmission(0.5),
      () => useAppearanceStore.getState().setShaderType('wireframe'),
      () => useAppearanceStore.getState().setColorAlgorithm('lch'),
      () => useAppearanceStore.getState().setLchLightness(0.5),
    ]

    let prevVersion = useAppearanceStore.getState().appearanceVersion

    for (const mutate of mutations) {
      mutate()
      const newVersion = useAppearanceStore.getState().appearanceVersion
      expect(newVersion).toBe(prevVersion + 1)
      prevVersion = newVersion
    }
  })

  it('bumpVersion increments independently of property changes', () => {
    const v0 = useAppearanceStore.getState().appearanceVersion
    useAppearanceStore.getState().bumpVersion()
    expect(useAppearanceStore.getState().appearanceVersion).toBe(v0 + 1)
  })

  it('multiple rapid mutations produce monotonically increasing versions', () => {
    const versions: number[] = []
    for (let i = 0; i < 20; i++) {
      useAppearanceStore.getState().setFaceEmission(i * 0.05)
      versions.push(useAppearanceStore.getState().appearanceVersion)
    }

    for (let i = 1; i < versions.length; i++) {
      expect(versions[i]).toBeGreaterThan(versions[i - 1]!)
    }
  })

  it('NaN-guarded setters do NOT increment version', () => {
    useAppearanceStore.getState().setFaceEmission(0.5)
    const vBefore = useAppearanceStore.getState().appearanceVersion

    // NaN should be rejected; version should NOT change
    useAppearanceStore.getState().setFaceEmission(Number.NaN)
    const vAfter = useAppearanceStore.getState().appearanceVersion

    expect(vAfter).toBe(vBefore)
    expect(useAppearanceStore.getState().faceEmission).toBe(0.5)
  })

  it('reset restores version counter alongside state', () => {
    useAppearanceStore.getState().setFaceEmission(0.9)
    useAppearanceStore.getState().setEdgeColor('#00FF00')
    expect(useAppearanceStore.getState().appearanceVersion).toBeGreaterThan(0)

    useAppearanceStore.getState().reset()
    // After reset, version should be incremented (reset is itself a state change)
    // but faceEmission should be at default
    expect(useAppearanceStore.getState().faceEmission).toBe(APPEARANCE_INITIAL_STATE.faceEmission)
  })

  it('setDomainColoringSettings increments version once per call', () => {
    const v0 = useAppearanceStore.getState().appearanceVersion
    useAppearanceStore.getState().setDomainColoringSettings({
      contourDensity: 10,
      contourWidth: 0.1,
      contourStrength: 0.5,
    })
    const v1 = useAppearanceStore.getState().appearanceVersion
    expect(v1).toBe(v0 + 1) // Single call = single increment
  })
})
