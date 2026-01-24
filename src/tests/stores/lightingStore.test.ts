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
})
