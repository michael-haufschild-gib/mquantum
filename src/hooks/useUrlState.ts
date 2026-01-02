/**
 * URL State Hook
 *
 * Initializes app state from URL parameters on mount.
 * Uses the state serializer to parse URL and applies to stores.
 *
 * Supports loading scene presets via `?scene=<name>` parameter with
 * case-insensitive matching against both saved and example scenes.
 */

import { applySceneExample, findSceneByName } from '@/lib/sceneExamples'
import { parseCurrentUrl, type ShareableState } from '@/lib/url/state-serializer'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useLightingStore } from '@/stores/lightingStore'
import { usePostProcessingStore } from '@/stores/postProcessingStore'
import { usePresetManagerStore } from '@/stores/presetManagerStore'
import { useEffect, useRef } from 'react'

/**
 * Apply individual URL state parameters to stores.
 * @param urlState - Parsed URL state to apply
 */
function applyUrlStateParams(urlState: Partial<ShareableState>): void {
  // Apply to geometry store
  // IMPORTANT: Set dimension FIRST (enables more object types), then objectType
  // Wrap in try/catch to handle validation errors gracefully
  try {
    if (urlState.dimension !== undefined) {
      useGeometryStore.getState().setDimension(urlState.dimension)
    }
    if (urlState.objectType !== undefined) {
      useGeometryStore.getState().setObjectType(urlState.objectType)
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[useUrlState] Failed to apply geometry URL state:', error)
    }
    // Continue with defaults - geometry store will use fallback values
  }

  // Apply to appearance store
  if (urlState.facesVisible !== undefined) {
    useAppearanceStore.getState().setFacesVisible(urlState.facesVisible)
  }
  if (urlState.edgesVisible !== undefined) {
    useAppearanceStore.getState().setEdgesVisible(urlState.edgesVisible)
  }
  if (urlState.edgeColor !== undefined) {
    useAppearanceStore.getState().setEdgeColor(urlState.edgeColor)
  }
  if (urlState.backgroundColor !== undefined) {
    useAppearanceStore.getState().setBackgroundColor(urlState.backgroundColor)
  }
  if (urlState.shaderType !== undefined) {
    useAppearanceStore.getState().setShaderType(urlState.shaderType)
  }

  // Apply to lighting store
  if (urlState.toneMappingEnabled !== undefined) {
    useLightingStore.getState().setToneMappingEnabled(urlState.toneMappingEnabled)
  }
  if (urlState.exposure !== undefined) {
    useLightingStore.getState().setExposure(urlState.exposure)
  }
  if (urlState.shadowEnabled !== undefined) {
    useLightingStore.getState().setShadowEnabled(urlState.shadowEnabled)
  }

  // Apply to post-processing store (bloom settings moved here from lighting)
  if (urlState.bloomEnabled !== undefined) {
    usePostProcessingStore.getState().setBloomEnabled(urlState.bloomEnabled)
  }
  if (urlState.bloomIntensity !== undefined) {
    usePostProcessingStore.getState().setBloomIntensity(urlState.bloomIntensity)
  }
  if (urlState.bloomThreshold !== undefined) {
    usePostProcessingStore.getState().setBloomThreshold(urlState.bloomThreshold)
  }

  // Apply to extended object store for mandelbulb settings
  // Note: These use the mandelbulb config-based setters

  // Apply uniformScale if present
  if (urlState.uniformScale !== undefined) {
    // Scale is applied to the polytope config
    useExtendedObjectStore.getState().setPolytopeScale(urlState.uniformScale)
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
      // Load saved scene directly from preset manager
      usePresetManagerStore.getState().loadScene(result.id)
      if (import.meta.env.DEV) {
        console.log(`[useUrlState] Loaded saved scene: "${sceneName}"`)
      }
    } else {
      // Load example scene (handles temporary add/remove from savedScenes)
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
 * Only runs once on mount - does not react to URL changes.
 *
 * Parses URL search params and applies them to the appropriate stores.
 *
 * URL formats supported:
 * - Individual params: /?t=hypercube&d=4&fv=1&ev=0
 * - Scene preset: /?scene=schroedinger%20bloom
 *
 * When `scene` param is present, it takes priority and other params are ignored
 * since scene presets contain complete application state.
 */
export function useUrlState(): void {
  const initialized = useRef(false)

  useEffect(() => {
    // Only initialize once
    if (initialized.current) return
    initialized.current = true

    // Parse URL state
    const urlState = parseCurrentUrl()

    // Skip if no URL params
    if (Object.keys(urlState).length === 0) return

    // Handle scene parameter - mutually exclusive with other params
    if (urlState.scene) {
      const sceneName = urlState.scene

      // Check if preset manager store has hydrated from localStorage
      // This is critical: saved scenes are loaded asynchronously from localStorage
      // If we try to look them up before hydration completes, we'll miss user's saved scenes
      if (usePresetManagerStore.persist.hasHydrated()) {
        // Already hydrated - load immediately
        loadSceneByName(sceneName)
      } else {
        // Wait for hydration to complete before looking up saved scenes
        // Example scenes (bundled JSON) are always available, but we still wait
        // to give saved scenes priority in case of name collision
        usePresetManagerStore.persist.onFinishHydration(() => {
          loadSceneByName(sceneName)
        })
      }

      // Scene param is mutually exclusive - skip other params
      return
    }

    // Apply individual URL parameters
    applyUrlStateParams(urlState)
  }, [])
}
