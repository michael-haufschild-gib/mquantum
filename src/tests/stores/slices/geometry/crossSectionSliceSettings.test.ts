import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

describe('Schroedinger cross-section slice settings', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('provides pedagogical defaults for cross-section slicing', () => {
    const config = useExtendedObjectStore.getState().schroedinger

    expect(config.crossSectionEnabled).toBe(false)
    expect(config.crossSectionCompositeMode).toBe('overlay')
    expect(config.crossSectionScalar).toBe('density')
    expect(config.crossSectionPlaneMode).toBe('axisAligned')
    expect(config.crossSectionAxis).toBe('z')
    expect(config.crossSectionPlaneNormal).toEqual([0, 0, 1])
    expect(config.crossSectionPlaneOffset).toBe(0)
    expect(config.crossSectionOpacity).toBe(0.75)
    expect(config.crossSectionThickness).toBe(0.02)
    expect(config.crossSectionPlaneColor).toBe('#66ccff')
    expect(config.crossSectionAutoWindow).toBe(true)
  })

  it('clamps numeric controls and keeps window bounds ordered', () => {
    const store = useExtendedObjectStore.getState()

    store.setSchroedingerCrossSectionPlaneOffset(3.0)
    store.setSchroedingerCrossSectionOpacity(-1.0)
    store.setSchroedingerCrossSectionThickness(0.5)
    store.setSchroedingerCrossSectionWindowMin(0.9)
    store.setSchroedingerCrossSectionWindowMax(0.2)

    const config = useExtendedObjectStore.getState().schroedinger
    expect(config.crossSectionPlaneOffset).toBe(1.0)
    expect(config.crossSectionOpacity).toBe(0.0)
    expect(config.crossSectionThickness).toBe(0.2)
    expect(config.crossSectionWindowMax).toBeGreaterThan(config.crossSectionWindowMin)
  })

  it('supports axis presets and normalized free-plane vectors', () => {
    const store = useExtendedObjectStore.getState()

    store.setSchroedingerCrossSectionAxis('x')
    let config = useExtendedObjectStore.getState().schroedinger
    expect(config.crossSectionPlaneMode).toBe('axisAligned')
    expect(config.crossSectionPlaneNormal).toEqual([1, 0, 0])

    store.setSchroedingerCrossSectionPlaneMode('free')
    store.setSchroedingerCrossSectionPlaneNormal([3, 4, 0])
    config = useExtendedObjectStore.getState().schroedinger

    expect(config.crossSectionPlaneMode).toBe('free')
    expect(config.crossSectionPlaneNormal[0]).toBeCloseTo(0.6, 4)
    expect(config.crossSectionPlaneNormal[1]).toBeCloseTo(0.8, 4)
    expect(config.crossSectionPlaneNormal[2]).toBeCloseTo(0.0, 4)
  })

  it('resets normal to match current axis when switching from free to axisAligned', () => {
    const store = useExtendedObjectStore.getState()

    // Set axis to X, then switch to free mode with an arbitrary normal
    store.setSchroedingerCrossSectionAxis('x')
    store.setSchroedingerCrossSectionPlaneNormal([1, 1, 1])
    let config = useExtendedObjectStore.getState().schroedinger
    expect(config.crossSectionPlaneMode).toBe('free')
    expect(config.crossSectionPlaneNormal[0]).toBeCloseTo(0.5774, 3)

    // Switch back to axisAligned — normal must snap to the X axis
    useExtendedObjectStore.getState().setSchroedingerCrossSectionPlaneMode('axisAligned')
    config = useExtendedObjectStore.getState().schroedinger
    expect(config.crossSectionPlaneMode).toBe('axisAligned')
    expect(config.crossSectionPlaneNormal).toEqual([1, 0, 0])
  })

  it('resets normal to default Z axis when switching to axisAligned with no prior axis', () => {
    const store = useExtendedObjectStore.getState()

    // Go to free mode without setting an axis first (default is 'z')
    store.setSchroedingerCrossSectionPlaneNormal([1, 0, 0])
    useExtendedObjectStore.getState().setSchroedingerCrossSectionPlaneMode('axisAligned')
    const config = useExtendedObjectStore.getState().schroedinger
    expect(config.crossSectionPlaneNormal).toEqual([0, 0, 1])
  })
})
