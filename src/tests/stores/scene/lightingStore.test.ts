import { beforeEach, describe, expect, it } from 'vitest'

import { type LightType, MAX_LIGHTS, MIN_LIGHTS } from '@/lib/lighting/lightSource'
import { DEFAULT_LIGHTS } from '@/stores/defaults/visualDefaults'
import { useLightingStore } from '@/stores/scene/lightingStore'

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
    expect(afterAdd.lights).toHaveLength(initialCount + 1)
    expect(afterAdd.lights.find((l) => l.id === id)?.type).toBe('point')
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
    const added = useLightingStore.getState().addLight('spot')!
    expect(useLightingStore.getState().lights.find((l) => l.id === added)?.type).toBe('spot')
    useLightingStore.getState().selectLight(added)
    useLightingStore.getState().removeLight(added)
    expect(useLightingStore.getState().selectedLightId).toBeNull()
  })

  it('updateLight clamps intensity/coneAngle/penumbra and normalizes rotation into [-π, π)', () => {
    const id = useLightingStore.getState().addLight('spot')!
    expect(useLightingStore.getState().lights.find((l) => l.id === id)?.type).toBe('spot')

    useLightingStore.getState().updateLight(id, {
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

  it('updateLight clamps range and decay to valid bounds', () => {
    const id = useLightingStore.getState().addLight('point')!

    useLightingStore.getState().updateLight(id, {
      range: -10,
      decay: 9,
    })

    let light = useLightingStore.getState().lights.find((l) => l.id === id)!
    expect(light.range).toBe(1)
    expect(light.decay).toBe(3)

    useLightingStore.getState().updateLight(id, {
      range: 150,
      decay: -2,
    })

    light = useLightingStore.getState().lights.find((l) => l.id === id)!
    expect(light.range).toBe(100)
    expect(light.decay).toBe(0)
  })

  it('updateLight preserves explicit range=0 sentinel (infinite range)', () => {
    const id = useLightingStore.getState().addLight('point')!

    useLightingStore.getState().updateLight(id, {
      range: 0,
    })

    const light = useLightingStore.getState().lights.find((l) => l.id === id)!
    expect(light.range).toBe(0)
  })

  it('updateLight preserves explicit decay=0 sentinel (no distance falloff power)', () => {
    const id = useLightingStore.getState().addLight('point')!

    useLightingStore.getState().updateLight(id, {
      decay: 0,
    })

    const light = useLightingStore.getState().lights.find((l) => l.id === id)!
    expect(light.decay).toBe(0)
  })

  it('updateLight ignores non-finite numeric and rotation updates while applying valid fields', () => {
    const id = useLightingStore.getState().addLight('spot')!

    useLightingStore.getState().updateLight(id, {
      intensity: 1.6,
      coneAngle: 40,
      penumbra: 0.35,
      rotation: [0.2, -0.3, 0.1],
      color: '#ABCDEF',
    })

    const before = useLightingStore.getState().lights.find((l) => l.id === id)!

    useLightingStore.getState().updateLight(id, {
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

  it('updateLight ignores non-finite range/decay updates while applying valid fields', () => {
    const id = useLightingStore.getState().addLight('point')!

    useLightingStore.getState().updateLight(id, {
      range: 42,
      decay: 1.7,
      color: '#ABCDEF',
    })

    const before = useLightingStore.getState().lights.find((l) => l.id === id)!

    useLightingStore.getState().updateLight(id, {
      range: Number.NaN,
      decay: Number.POSITIVE_INFINITY,
      color: '#00FF00',
    })

    const after = useLightingStore.getState().lights.find((l) => l.id === id)!
    expect(after.range).toBe(before.range)
    expect(after.decay).toBe(before.decay)
    expect(after.color).toBe('#00FF00')
  })

  it('updateLight ignores malformed position updates and only bumps version for valid fields', () => {
    const id = useLightingStore.getState().addLight('point')!

    useLightingStore.getState().updateLight(id, {
      position: [1, 2, 3],
      color: '#ABCDEF',
    })

    const before = useLightingStore.getState()
    const beforeLight = before.lights.find((l) => l.id === id)!

    useLightingStore.getState().updateLight(id, {
      position: [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
    })

    let after = useLightingStore.getState()
    let light = after.lights.find((l) => l.id === id)!
    expect(light.position).toEqual(beforeLight.position)
    expect(after.version).toBe(before.version)

    useLightingStore.getState().updateLight(id, {
      position: [4, 5] as unknown as [number, number, number],
      color: '#00FF00',
    })

    after = useLightingStore.getState()
    light = after.lights.find((l) => l.id === id)!
    expect(light.position).toEqual(beforeLight.position)
    expect(light.color).toBe('#00FF00')
    expect(after.version).toBe(before.version + 1)
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

  it('initializes and resets with mutation-isolated light defaults', () => {
    useLightingStore.getState().reset()

    const firstState = useLightingStore.getState()
    const firstLight = firstState.lights[0]!
    const defaultLight = DEFAULT_LIGHTS[0]!
    expect(firstState.lights).not.toBe(DEFAULT_LIGHTS)
    expect(firstLight).not.toBe(defaultLight)
    expect(firstLight.position).not.toBe(defaultLight.position)

    firstLight.position[0] = 999
    firstLight.rotation[1] = 999
    expect(defaultLight.position[0]).not.toBe(999)
    expect(defaultLight.rotation[1]).not.toBe(999)

    useLightingStore.getState().reset()
    const resetLight = useLightingStore.getState().lights[0]!
    expect(resetLight.position).toEqual(defaultLight.position)
    expect(resetLight.rotation).toEqual(defaultLight.rotation)
    expect(resetLight.position).not.toBe(defaultLight.position)
    expect(resetLight.rotation).not.toBe(defaultLight.rotation)
  })

  it('rejects malformed runtime booleans and enum updates', () => {
    const store = useLightingStore.getState()
    const id = store.addLight('spot')!
    store.setLightEnabled(true)
    store.setAmbientEnabled(true)
    store.setShowLightIndicator(false)
    store.setToneMappingEnabled(true)
    store.setToneMappingAlgorithm('aces')
    store.setTransformMode('translate')
    store.setShowLightGizmos(false)
    store.setIsDraggingLight(false)

    const before = useLightingStore.getState()
    const beforeLight = before.lights.find((light) => light.id === id)!

    expect(store.addLight('area' as unknown as LightType)).toBeNull()
    store.setLightEnabled('false' as unknown as boolean)
    store.setAmbientEnabled(1 as unknown as boolean)
    store.setShowLightIndicator('yes' as unknown as boolean)
    store.setToneMappingEnabled('true' as unknown as boolean)
    store.setToneMappingAlgorithm('filmic' as unknown as typeof before.toneMappingAlgorithm)
    store.setTransformMode('scale' as unknown as typeof before.transformMode)
    store.setShowLightGizmos('yes' as unknown as boolean)
    store.setIsDraggingLight('yes' as unknown as boolean)
    store.updateLight(id, {
      enabled: 'yes' as unknown as boolean,
      type: 'area' as unknown as LightType,
      name: 42 as unknown as string,
      color: 7 as unknown as string,
      intensity: 1.7,
    })

    const after = useLightingStore.getState()
    const afterLight = after.lights.find((light) => light.id === id)!
    expect(after.lightEnabled).toBe(before.lightEnabled)
    expect(after.ambientEnabled).toBe(before.ambientEnabled)
    expect(after.showLightIndicator).toBe(before.showLightIndicator)
    expect(after.toneMappingEnabled).toBe(before.toneMappingEnabled)
    expect(after.toneMappingAlgorithm).toBe(before.toneMappingAlgorithm)
    expect(after.transformMode).toBe(before.transformMode)
    expect(after.showLightGizmos).toBe(before.showLightGizmos)
    expect(after.isDraggingLight).toBe(before.isDraggingLight)
    expect(afterLight.enabled).toBe(beforeLight.enabled)
    expect(afterLight.type).toBe(beforeLight.type)
    expect(afterLight.name).toBe(beforeLight.name)
    expect(afterLight.color).toBe(beforeLight.color)
    expect(afterLight.intensity).toBe(1.7)
  })
})
