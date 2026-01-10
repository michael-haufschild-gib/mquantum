/**
 * Style Examples Loader
 *
 * Loads example styles from bundled JSON file and provides them in a format
 * compatible with the menu system.
 */

import stylesData from '@/assets/defaults/styles.json'
import { soundManager } from '@/lib/audio/SoundManager'
import { usePresetManagerStore } from '@/stores/presetManagerStore'

export interface StyleExample {
  id: string
  name: string
  description?: string
  apply: () => void
}

/**
 * Result of style lookup indicating which source the style was found in.
 */
export interface StyleLookupResult {
  id: string
  source: 'saved' | 'example'
}

/**
 * Find a style by name (case-insensitive) across both saved and example styles.
 * Saved styles (user's custom styles) take priority over example styles.
 *
 * @param name - Style name to search for (case-insensitive)
 * @returns Style lookup result if found, null otherwise
 */
export function findStyleByName(name: string): StyleLookupResult | null {
  const lowerName = name.toLowerCase().trim()
  if (!lowerName) {
    return null
  }

  // Search saved styles first (user's custom styles take priority)
  const savedStyles = usePresetManagerStore.getState().savedStyles
  const savedMatch = savedStyles.find((s) => s.name.toLowerCase() === lowerName)
  if (savedMatch) {
    return { id: savedMatch.id, source: 'saved' }
  }

  // Search example styles (bundled with the app)
  const exampleMatch = stylesData.find((s) => s.name.toLowerCase() === lowerName)
  if (exampleMatch) {
    return { id: exampleMatch.id, source: 'example' }
  }

  return null
}

/**
 * Get all example styles from the bundled JSON
 * @returns Array of style examples with apply functions, sorted alphabetically by name
 */
export function getStyleExamples(): StyleExample[] {
  return stylesData
    .map((style) => ({
      id: style.id,
      name: style.name,
      description: `Apply ${style.name} style preset`,
      apply: () => {
        applyStyleExample(style.id)
      },
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Apply a style example by ID
 * @param id - The unique identifier of the style to load
 * @returns True if the style was found and loaded, false otherwise
 */
export function applyStyleExample(id: string): boolean {
  const style = stylesData.find((s) => s.id === id)
  if (!style) {
    console.warn(`Style example with id "${id}" not found`)
    return false
  }

  // Load the style using preset manager
  // We need to temporarily add it to savedStyles, load it, then remove it
  const presetManager = usePresetManagerStore.getState()

  // Check if style is already in savedStyles
  const existingStyle = presetManager.savedStyles.find((s) => s.id === style.id)

  if (!existingStyle) {
    // Temporarily add to savedStyles
    usePresetManagerStore.setState((state) => ({
      savedStyles: [...state.savedStyles, style],
    }))
  }

  // Load the style
  presetManager.loadStyle(style.id)

  // Remove it from savedStyles if we added it temporarily
  if (!existingStyle) {
    setTimeout(() => {
      usePresetManagerStore.setState((state) => ({
        savedStyles: state.savedStyles.filter((s) => s.id !== style.id),
      }))
    }, 100)
  }

  soundManager.playClick()
  return true
}
