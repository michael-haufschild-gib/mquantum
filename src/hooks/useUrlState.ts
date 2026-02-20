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
import { DEFAULT_SHADER_TYPE } from '@/stores/defaults/visualDefaults'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useLightingStore } from '@/stores/lightingStore'
import { usePostProcessingStore } from '@/stores/postProcessingStore'
import { usePresetManagerStore } from '@/stores/presetManagerStore'
import { usePBRStore } from '@/stores/pbrStore'
import { useTransformStore } from '@/stores/transformStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
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
    if (urlState.quantumMode !== undefined) {
      // Compute-driven quantum modes require volumetric 3D rendering.
      if (
        (urlState.quantumMode === 'freeScalarField' || urlState.quantumMode === 'tdseDynamics') &&
        useGeometryStore.getState().dimension < 3
      ) {
        useGeometryStore.getState().setDimension(3)
      }
      useExtendedObjectStore.getState().setSchroedingerQuantumMode(urlState.quantumMode)
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[useUrlState] Failed to apply geometry URL state:', error)
    }
    // Continue with defaults - geometry store will use fallback values
  }

  // Apply to transform store
  if (urlState.uniformScale !== undefined) {
    useTransformStore.getState().setUniformScale(urlState.uniformScale)
  }

  // Apply to appearance store
  if (urlState.edgeColor !== undefined) {
    useAppearanceStore.getState().setEdgeColor(urlState.edgeColor)
  }
  if (urlState.backgroundColor !== undefined) {
    useEnvironmentStore.getState().setBackgroundColor(urlState.backgroundColor)
    useAppearanceStore.getState().setBackgroundColor(urlState.backgroundColor)
  }
  if (urlState.skyboxSelection !== undefined) {
    useEnvironmentStore.getState().setSkyboxSelection(urlState.skyboxSelection)
  }
  if (urlState.skyboxIntensity !== undefined) {
    useEnvironmentStore.getState().setSkyboxIntensity(urlState.skyboxIntensity)
  }
  if (urlState.skyboxRotation !== undefined) {
    useEnvironmentStore.getState().setSkyboxRotation(urlState.skyboxRotation)
  }
  if (urlState.skyboxAnimationMode !== undefined) {
    useEnvironmentStore.getState().setSkyboxAnimationMode(urlState.skyboxAnimationMode)
  }
  if (urlState.skyboxAnimationSpeed !== undefined) {
    useEnvironmentStore.getState().setSkyboxAnimationSpeed(urlState.skyboxAnimationSpeed)
  }
  if (urlState.skyboxHighQuality !== undefined) {
    useEnvironmentStore.getState().setSkyboxHighQuality(urlState.skyboxHighQuality)
  }
  if (urlState.shaderType !== undefined) {
    useAppearanceStore.getState().setShaderType(urlState.shaderType)
  }
  if (urlState.shaderSettings !== undefined) {
    const appearance = useAppearanceStore.getState()
    const effectiveShaderType = urlState.shaderType ?? DEFAULT_SHADER_TYPE
    if (effectiveShaderType === 'wireframe') {
      appearance.setWireframeSettings(urlState.shaderSettings.wireframe)
    } else {
      appearance.setSurfaceSettings(urlState.shaderSettings.surface)
    }
  }

  // Apply to lighting store
  if (urlState.toneMappingEnabled !== undefined) {
    useLightingStore.getState().setToneMappingEnabled(urlState.toneMappingEnabled)
  }
  if (urlState.exposure !== undefined) {
    useLightingStore.getState().setExposure(urlState.exposure)
  }
  if (urlState.toneMappingAlgorithm !== undefined) {
    useLightingStore.getState().setToneMappingAlgorithm(urlState.toneMappingAlgorithm)
  }
  if (urlState.specularColor !== undefined) {
    usePBRStore.getState().setFaceSpecularColor(urlState.specularColor)
  }
  // Apply to post-processing store (bloom settings)
  const postProcessing = usePostProcessingStore.getState()
  if (urlState.bloomEnabled !== undefined) {
    postProcessing.setBloomEnabled(urlState.bloomEnabled)
  }
  if (urlState.bloomGain !== undefined) {
    postProcessing.setBloomGain(urlState.bloomGain)
  }
  if (urlState.bloomThreshold !== undefined) {
    postProcessing.setBloomThreshold(urlState.bloomThreshold)
  }
  if (urlState.bloomKnee !== undefined) {
    postProcessing.setBloomKnee(urlState.bloomKnee)
  }
  if (urlState.bloomRadius !== undefined) {
    postProcessing.setBloomRadius(urlState.bloomRadius)
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
 * - Individual params: /?t=schroedinger&d=4&qm=tdseDynamics
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
