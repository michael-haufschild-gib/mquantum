/**
 * Style Examples Loader
 *
 * Loads example styles from bundled JSON file and provides them in a format
 * compatible with the menu system.
 */

import { soundManager } from '@/lib/audio/SoundManager'
import { logger } from '@/lib/logger'
import { type SavedStyle, usePresetManagerStore } from '@/stores/runtime/presetManagerStore'

const STYLE_EXAMPLE_METADATA = [
  { id: '5915b891-95f3-4675-9182-4e8802d66614', name: 'Aquarell' },
  { id: '12373cde-c7fa-4f6a-881d-24d2324b0b79', name: 'Default' },
] as const

async function loadStyleData(): Promise<SavedStyle[]> {
  const module = await import('@/assets/defaults/styles.json')
  return module.default as SavedStyle[]
}

/** Built-in style preset examples for the preset manager. */
export interface StyleExample {
  id: string
  name: string
  description?: string
  apply: () => Promise<boolean>
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
  const exampleMatch = STYLE_EXAMPLE_METADATA.find((s) => s.name.toLowerCase() === lowerName)
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
  return STYLE_EXAMPLE_METADATA.map((style) => ({
    id: style.id,
    name: style.name,
    description: `Apply ${style.name} style preset`,
    apply: () => applyStyleExample(style.id),
  })).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Apply a style example by ID
 * @param id - The unique identifier of the style to load
 * @returns True if the style was found and loaded, false otherwise
 */
export async function applyStyleExample(id: string): Promise<boolean> {
  const stylesData = await loadStyleData()
  const style = stylesData.find((s) => s.id === id)
  if (!style) {
    logger.warn(`Style example with id "${id}" not found`)
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

  // Load the style (synchronous — reads from savedStyles then applies state)
  presetManager.loadStyle(style.id)

  // Remove it from savedStyles immediately after load completes.
  // loadStyle is synchronous, so the style data has already been read
  // and applied by the time we reach this line.
  if (!existingStyle) {
    usePresetManagerStore.setState((state) => ({
      savedStyles: state.savedStyles.filter((s) => s.id !== style.id),
    }))
  }

  soundManager.playClick()
  return true
}
