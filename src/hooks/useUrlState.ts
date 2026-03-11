/**
 * URL State Hook
 *
 * Initializes app state from URL parameters on mount.
 * Supports loading scene presets via `?scene=<name>` or
 * object type via `?t=schroedinger&d=5&qm=hydrogenND`.
 *
 * INTENTIONAL SCOPE LIMIT: Only basic scene identification params are
 * restored from URLs. Detailed state (quantum numbers, visual settings,
 * etc.) requires scene presets. See state-serializer.ts for rationale.
 */

import { applySceneExample, findSceneByName } from '@/lib/sceneExamples'
import { parseCurrentUrl, type ParsedShareableState } from '@/lib/url/state-serializer'
import { useGeometryStore } from '@/stores/geometryStore'
import { usePresetManagerStore } from '@/stores/presetManagerStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useEffect, useRef } from 'react'

/**
 * Apply individual URL state parameters to stores.
 * @param urlState - Parsed URL state to apply
 */
function applyUrlStateParams(urlState: ParsedShareableState): void {
  try {
    // Set dimension FIRST (enables more object types), then objectType
    if (urlState.dimension !== undefined) {
      useGeometryStore.getState().setDimension(urlState.dimension)
    }
    if (urlState.objectType !== undefined) {
      useGeometryStore.getState().setObjectType(urlState.objectType)
    }
    if (urlState.quantumMode !== undefined) {
      // Dimension enforcement is handled by setSchroedingerQuantumMode in the store
      useExtendedObjectStore.getState().setSchroedingerQuantumMode(urlState.quantumMode)
    }
    // Apply open-quantum settings if present in URL
    if (urlState.openQuantumEnabled !== undefined) {
      const ext = useExtendedObjectStore.getState()
      ext.setOpenQuantumEnabled(urlState.openQuantumEnabled)
      if (urlState.openQuantumDephasingRate !== undefined) {
        ext.setOpenQuantumDephasingRate(urlState.openQuantumDephasingRate)
      }
      if (urlState.openQuantumRelaxationRate !== undefined) {
        ext.setOpenQuantumRelaxationRate(urlState.openQuantumRelaxationRate)
      }
      if (urlState.openQuantumThermalUpRate !== undefined) {
        ext.setOpenQuantumThermalUpRate(urlState.openQuantumThermalUpRate)
      }
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[useUrlState] Failed to apply URL state:', error)
    }
  }
}

/**
 * Attempt to load a scene by name.
 * Searches both saved scenes (user's custom) and example scenes (bundled).
 * @param sceneName - Scene name to search for (case-insensitive)
 */
function loadSceneByName(sceneName: string): void {
  const result = findSceneByName(sceneName)

  if (result) {
    if (result.source === 'saved') {
      usePresetManagerStore.getState().loadScene(result.id)
      if (import.meta.env.DEV) {
        console.log(`[useUrlState] Loaded saved scene: "${sceneName}"`)
      }
    } else {
      applySceneExample(result.id)
      if (import.meta.env.DEV) {
        console.log(`[useUrlState] Loaded example scene: "${sceneName}"`)
      }
    }
  } else {
    console.warn(`[useUrlState] Scene "${sceneName}" not found in saved or example scenes`)
  }
}

/**
 * Hook to initialize app state from URL parameters.
 * Only runs once on mount — does not react to URL changes.
 *
 * URL formats:
 * - Scene preset: `/?scene=schroedinger%20bloom`
 * - Object type:  `/?t=schroedinger&d=4&qm=tdseDynamics`
 *
 * When `scene` param is present, it takes priority and other params are ignored.
 */
export function useUrlState(): void {
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const urlState = parseCurrentUrl()
    if (Object.keys(urlState).length === 0) return

    // Scene parameter is mutually exclusive with other params
    if (urlState.scene) {
      const sceneName = urlState.scene

      if (usePresetManagerStore.persist.hasHydrated()) {
        loadSceneByName(sceneName)
      } else {
        usePresetManagerStore.persist.onFinishHydration(() => {
          loadSceneByName(sceneName)
        })
      }
      return
    }

    applyUrlStateParams(urlState)
  }, [])
}
