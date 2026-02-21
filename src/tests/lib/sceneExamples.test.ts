import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findSceneByName, getSceneExamples } from '@/lib/sceneExamples'
import { usePresetManagerStore, type SavedScene } from '@/stores/presetManagerStore'

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
})
