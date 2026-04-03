import { beforeEach, describe, expect, it, vi } from 'vitest'

import scenesData from '@/assets/defaults/scenes.json'
import { findSceneByName, getSceneExamples } from '@/lib/sceneExamples'
import { type SavedScene, usePresetManagerStore } from '@/stores/presetManagerStore'

describe('sceneExamples', () => {
  beforeEach(() => {
    usePresetManagerStore.setState({ savedScenes: [], savedStyles: [] })
  })

  it('findSceneByName prioritizes saved scenes over bundled examples', () => {
    const examples = getSceneExamples()
    expect(examples.length).toBeGreaterThan(0)

    const example = examples[0]!
    usePresetManagerStore.setState({
      savedScenes: [{ id: 'custom-id', name: example.name } as unknown as SavedScene],
    })

    const result = findSceneByName(example.name.toUpperCase())
    expect(result).toEqual({ id: 'custom-id', source: 'saved' })
  })

  it('example apply callbacks stage bundled scenes before invoking loadScene', () => {
    vi.useFakeTimers()
    const examples = getSceneExamples()
    expect(examples.length).toBeGreaterThan(0)

    const example = examples[0]!
    let hadSceneWhenLoadCalled = false
    const originalLoadScene = usePresetManagerStore.getState().loadScene

    usePresetManagerStore.setState({
      loadScene: ((id: string) => {
        hadSceneWhenLoadCalled = usePresetManagerStore
          .getState()
          .savedScenes.some((scene) => scene.id === id)
      }) as typeof originalLoadScene,
    })

    example.apply()
    expect(hadSceneWhenLoadCalled).toBe(true)

    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    usePresetManagerStore.setState({ loadScene: originalLoadScene })
  })

  it('findSceneByName returns null for empty string', () => {
    expect(findSceneByName('')).toBeNull()
  })

  it('findSceneByName returns null for whitespace-only string', () => {
    expect(findSceneByName('   ')).toBeNull()
  })

  it('findSceneByName returns null for nonexistent scene', () => {
    expect(findSceneByName('this scene does not exist 12345')).toBeNull()
  })
})

describe('bundled scenes.json structural validation', () => {
  it('every scene has a unique id', () => {
    const ids = scenesData.map((s) => s.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('every scene has a data object with at least one store key', () => {
    for (const scene of scenesData) {
      expect(
        Object.keys(scene.data).length,
        `Scene "${scene.name}" has empty data`
      ).toBeGreaterThan(0)
    }
  })

  it('no scene has duplicate names (case-insensitive)', () => {
    const lowerNames = scenesData.map((s) => s.name.toLowerCase())
    const uniqueNames = new Set(lowerNames)
    expect(uniqueNames.size).toBe(lowerNames.length)
  })

  it('every scene with geometry data has valid dimension (2-11)', () => {
    for (const scene of scenesData) {
      const geom = (scene.data as Record<string, Record<string, unknown>>).geometry
      if (geom && typeof geom.dimension === 'number') {
        expect(
          geom.dimension,
          `Scene "${scene.name}" has invalid dimension`
        ).toBeGreaterThanOrEqual(2)
        expect(geom.dimension, `Scene "${scene.name}" has invalid dimension`).toBeLessThanOrEqual(
          11
        )
      }
    }
  })
})
