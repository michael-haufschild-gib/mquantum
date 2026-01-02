/**
 * Scene Examples Loader
 *
 * Loads example scenes from bundled JSON file and provides them in a format
 * compatible with the menu system.
 */

import scenesData from '@/assets/defaults/scenes.json'
import { soundManager } from '@/lib/audio/SoundManager'
import { usePresetManagerStore } from '@/stores/presetManagerStore'

export interface SceneExample {
  id: string
  name: string
  description?: string
  apply: () => void
}

/**
 * Get all example scenes from the bundled JSON
 * @returns Array of scene examples with apply functions, sorted alphabetically by name
 */
export function getSceneExamples(): SceneExample[] {
  return scenesData
    .map((scene) => ({
      id: scene.id,
      name: scene.name,
      description: `Load ${scene.name} example scene`,
      apply: () => {
        // Use the preset manager's loadScene function with the scene data
        usePresetManagerStore.getState().loadScene(scene.id)
      },
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Apply a scene example by ID
 * @param id - The unique identifier of the scene to load
 * @returns True if the scene was found and loaded, false otherwise
 */
export function applySceneExample(id: string): boolean {
  const scene = scenesData.find((s) => s.id === id)
  if (!scene) {
    console.warn(`Scene example with id "${id}" not found`)
    return false
  }

  // Load the scene using preset manager
  // We need to temporarily add it to savedScenes, load it, then remove it
  const presetManager = usePresetManagerStore.getState()

  // Check if scene is already in savedScenes
  const existingScene = presetManager.savedScenes.find((s) => s.id === scene.id)

  if (!existingScene) {
    // Temporarily add to savedScenes
    usePresetManagerStore.setState((state) => ({
      savedScenes: [...state.savedScenes, scene],
    }))
  }

  // Load the scene
  presetManager.loadScene(scene.id)

  // Remove it from savedScenes if we added it temporarily
  if (!existingScene) {
    setTimeout(() => {
      usePresetManagerStore.setState((state) => ({
        savedScenes: state.savedScenes.filter((s) => s.id !== scene.id),
      }))
    }, 100)
  }

  soundManager.playClick()
  return true
}
