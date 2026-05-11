/**
 * Scene Examples Loader
 *
 * Loads example scenes from bundled JSON file and provides them in a format
 * compatible with the menu system.
 */

import { soundManager } from '@/lib/audio/SoundManager'
import { logger } from '@/lib/logger'
import { type SavedScene, usePresetManagerStore } from '@/stores/runtime/presetManagerStore'

const SCENE_EXAMPLE_METADATA = [
  { id: 'af65b7e6-54c2-4a3e-89dc-c3f3ff55d6af', name: '6D Harmonic Oscillator' },
  {
    id: '7cfb4f5b-45fc-4849-b9a5-e58b973f0c24',
    name: '3D Harmonic Oscillator — Nodal Surfaces',
  },
  {
    id: 'a4bf1959-f15c-492a-b23c-08a3fe1fd39c',
    name: '2D Harmonic Oscillator — Nodal Cross Section',
  },
  { id: '27cc4c7e-2582-4996-878c-57f933c43d64', name: '2D Hydrogen Orbital' },
  {
    id: 'f56f3162-d527-4634-bea7-bdb592f6335e',
    name: 'Scalar Field Kasner - Overblowing density',
  },
  { id: 'ca7c1ce7-c3bf-4e69-a1eb-78f7c4ac93c4', name: 'Attractive BEC Collapse' },
  { id: '7fcbcd15-24f7-489d-9de7-1cc4cf634fe4', name: 'Self-Interacting Scalar Field' },
  { id: 'dadde8d8-0944-4c92-b221-bbc17080ad71', name: 'Scalar Field de Sitter' },
  { id: '70227819-0e7f-420d-a9fe-5df416e17f2e', name: 'Quantum Walk' },
  { id: 'ac1fcf3c-dc1c-479a-9fee-9f20105af4d5', name: 'Wave hitting Black Hole Boundary' },
] as const

async function loadSceneData(): Promise<SavedScene[]> {
  const module = await import('@/assets/defaults/scenes.json')
  return module.default as SavedScene[]
}

/**
 * Bundled scene example metadata exposed to UI menus.
 */
export interface SceneExample {
  id: string
  name: string
  description?: string
  apply: () => Promise<boolean>
}

/**
 * Result of scene lookup indicating which source the scene was found in.
 */
export interface SceneLookupResult {
  id: string
  source: 'saved' | 'example'
}

/**
 * Find a scene by name (case-insensitive) across both saved and example scenes.
 * Saved scenes (user's custom scenes) take priority over example scenes.
 *
 * @param name - Scene name to search for (case-insensitive)
 * @returns Scene lookup result if found, null otherwise
 */
export function findSceneByName(name: string): SceneLookupResult | null {
  const lowerName = name.toLowerCase().trim()
  if (!lowerName) {
    return null
  }

  // Search saved scenes first (user's custom scenes take priority)
  const savedScenes = usePresetManagerStore.getState().savedScenes
  const savedMatch = savedScenes.find((s) => s.name.toLowerCase() === lowerName)
  if (savedMatch) {
    return { id: savedMatch.id, source: 'saved' }
  }

  // Search example scenes (bundled with the app)
  const exampleMatch = SCENE_EXAMPLE_METADATA.find((s) => s.name.toLowerCase() === lowerName)
  if (exampleMatch) {
    return { id: exampleMatch.id, source: 'example' }
  }

  return null
}

/**
 * Get all example scenes from the bundled JSON
 * @returns Array of scene examples with apply functions, sorted alphabetically by name
 */
export function getSceneExamples(): SceneExample[] {
  return SCENE_EXAMPLE_METADATA.map((scene) => ({
    id: scene.id,
    name: scene.name,
    description: `Load ${scene.name} example scene`,
    // Reuse the bundled-example path so loading works even when examples
    // are not present in savedScenes.
    apply: () => applySceneExample(scene.id),
  })).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Apply a scene example by ID
 * @param id - The unique identifier of the scene to load
 * @returns True if the scene was found and loaded, false otherwise
 */
export async function applySceneExample(id: string): Promise<boolean> {
  let stagedId: string | null = null

  try {
    const scenesData = await loadSceneData()
    const scene = scenesData.find((s) => s.id === id)
    if (!scene) {
      logger.warn(`Scene example with id "${id}" not found`)
      return false
    }

    const existingScene = usePresetManagerStore
      .getState()
      .savedScenes.some((s) => s.id === scene.id)

    if (!existingScene) {
      usePresetManagerStore.setState((state) => ({
        savedScenes: [...state.savedScenes, scene],
      }))
      stagedId = scene.id
    }

    await usePresetManagerStore.getState().loadScene(scene.id)
    soundManager.playClick()
    return true
  } catch (error) {
    logger.error('[sceneExamples] Failed to apply scene example:', error)
    return false
  } finally {
    if (stagedId) {
      usePresetManagerStore.setState((state) => ({
        savedScenes: state.savedScenes.filter((s) => s.id !== stagedId),
      }))
    }
  }
}
