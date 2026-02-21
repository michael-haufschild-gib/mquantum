import { beforeEach, describe, expect, it } from 'vitest'
import { useLightingStore } from '@/stores/lightingStore'
import { MAX_LIGHTS, MIN_LIGHTS } from '@/rendering/lights/types'

describe('lightingStore (invariants)', () => {
  beforeEach(() => {
    useLightingStore.getState().reset()
  })

  it('addLight selects the newly added light, respects MAX_LIGHTS, and increments version', () => {
    const initial = useLightingStore.getState()
    const initialVersion = initial.version
    const initialCount = initial.lights.length

    const id = useLightingStore.getState().addLight('point')
    const afterAdd = useLightingStore.getState()
    expect(id).not.toBeNull()
    expect(afterAdd.lights.length).toBe(initialCount + 1)
    expect(afterAdd.selectedLightId).toBe(id)
    expect(afterAdd.version).toBeGreaterThan(initialVersion)

    // Fill to max and verify further additions are rejected.
    while (useLightingStore.getState().lights.length < MAX_LIGHTS) {
      useLightingStore.getState().addLight('point')
    }
    const beforeRejectCount = useLightingStore.getState().lights.length
    const rejected = useLightingStore.getState().addLight('point')
    expect(rejected).toBeNull()
    expect(useLightingStore.getState().lights.length).toBe(beforeRejectCount)
  })

  it('removeLight is a no-op when at MIN_LIGHTS, and clears selection when removing selected', () => {
    // Ensure we can remove down to MIN_LIGHTS.
    while (useLightingStore.getState().lights.length > MIN_LIGHTS) {
      const id = useLightingStore.getState().lights[0]!.id
      useLightingStore.getState().removeLight(id)
    }
    expect(useLightingStore.getState().lights.length).toBe(MIN_LIGHTS)

    // No-op at min.
    useLightingStore.getState().removeLight('does-not-exist')
    expect(useLightingStore.getState().lights.length).toBe(MIN_LIGHTS)

    // Add one, select it, then remove it => selection clears.
    const added = useLightingStore.getState().addLight('spot')
    expect(added).not.toBeNull()
    useLightingStore.getState().selectLight(added)
    useLightingStore.getState().removeLight(added!)
    expect(useLightingStore.getState().selectedLightId).toBeNull()
  })

  it('updateLight clamps intensity/coneAngle/penumbra and normalizes rotation into [-π, π)', () => {
    const id = useLightingStore.getState().addLight('spot')
    expect(id).not.toBeNull()

    useLightingStore.getState().updateLight(id!, {
      intensity: 999,
      coneAngle: 999,
      penumbra: -5,
      rotation: [100 * Math.PI, -100 * Math.PI, 0],
    })

    const light = useLightingStore.getState().lights.find((l) => l.id === id)!
    expect(light.intensity).toBe(3)
    expect(light.coneAngle).toBe(120)
    expect(light.penumbra).toBe(0)

    // Signed normalization: each component should be within [-π, π)
    expect(light.rotation[0]).toBeGreaterThanOrEqual(-Math.PI)
    expect(light.rotation[0]).toBeLessThan(Math.PI)
    expect(light.rotation[1]).toBeGreaterThanOrEqual(-Math.PI)
    expect(light.rotation[1]).toBeLessThan(Math.PI)
  })

  it('updateLight ignores non-finite numeric and rotation updates while applying valid fields', () => {
    const id = useLightingStore.getState().addLight('spot')
    expect(id).not.toBeNull()

    useLightingStore.getState().updateLight(id!, {
      intensity: 1.6,
      coneAngle: 40,
      penumbra: 0.35,
      rotation: [0.2, -0.3, 0.1],
      color: '#ABCDEF',
    })

    const before = useLightingStore.getState().lights.find((l) => l.id === id)!

    useLightingStore.getState().updateLight(id!, {
      intensity: Number.NaN,
      coneAngle: Number.POSITIVE_INFINITY,
      penumbra: Number.NEGATIVE_INFINITY,
      rotation: [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
      color: '#00FF00',
    })

    const after = useLightingStore.getState().lights.find((l) => l.id === id)!
    expect(after.intensity).toBe(before.intensity)
    expect(after.coneAngle).toBe(before.coneAngle)
    expect(after.penumbra).toBe(before.penumbra)
    expect(after.rotation).toEqual(before.rotation)
    expect(after.color).toBe('#00FF00')
  })

  it('ignores non-finite updates for core numeric lighting controls', () => {
    const store = useLightingStore.getState()
    store.setLightHorizontalAngle(45)
    store.setLightVerticalAngle(25)
    store.setAmbientIntensity(0.35)
    store.setLightStrength(1.2)
    store.setExposure(1.1)

    const before = useLightingStore.getState()

    store.setLightHorizontalAngle(Number.NaN)
    store.setLightHorizontalAngle(Number.POSITIVE_INFINITY)
    store.setLightVerticalAngle(Number.NaN)
    store.setLightVerticalAngle(Number.NEGATIVE_INFINITY)
    store.setAmbientIntensity(Number.NaN)
    store.setAmbientIntensity(Number.POSITIVE_INFINITY)
    store.setLightStrength(Number.NaN)
    store.setLightStrength(Number.POSITIVE_INFINITY)
    store.setExposure(Number.NaN)
    store.setExposure(Number.NEGATIVE_INFINITY)

    const after = useLightingStore.getState()
    expect(after.lightHorizontalAngle).toBe(before.lightHorizontalAngle)
    expect(after.lightVerticalAngle).toBe(before.lightVerticalAngle)
    expect(after.ambientIntensity).toBe(before.ambientIntensity)
    expect(after.lightStrength).toBe(before.lightStrength)
    expect(after.exposure).toBe(before.exposure)
  })
})
