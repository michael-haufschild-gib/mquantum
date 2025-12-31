import { showConditionalMsgBox } from '@/hooks/useConditionalMsgBox'
import { flushSync } from 'react-dom'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAnimationStore } from './animationStore'
import { useAppearanceStore } from './appearanceStore'
import { useCameraStore } from './cameraStore'
import { DIALOG_IDS } from './dismissedDialogsStore'
import { useEnvironmentStore } from './environmentStore'
import { useExtendedObjectStore } from './extendedObjectStore'
import { useGeometryStore } from './geometryStore'
import { useLightingStore } from './lightingStore'
import { useMsgBoxStore } from './msgBoxStore'
import { usePBRStore } from './pbrStore'
import { usePerformanceStore } from './performanceStore'
import { usePostProcessingStore } from './postProcessingStore'
import { useRotationStore } from './rotationStore'
import { useTransformStore } from './transformStore'
import { useUIStore } from './uiStore'
import { mergeExtendedObjectState } from './utils/mergeWithDefaults'

/**
 * Pending rAF ID for scene load completion.
 * Used to cancel stale callbacks when rapid scene loads occur.
 */
let pendingSceneLoadRafId: number | null = null

/**
 * Schedules scene load completion after React settles.
 * Cancels any pending callback to prevent race conditions.
 */
function scheduleSceneLoadComplete(): void {
  // Cancel any pending callback to prevent premature completion
  if (pendingSceneLoadRafId !== null) {
    cancelAnimationFrame(pendingSceneLoadRafId)
  }

  pendingSceneLoadRafId = requestAnimationFrame(() => {
    pendingSceneLoadRafId = null
    usePerformanceStore.getState().setIsLoadingScene(false)
    usePerformanceStore.getState().setSceneTransitioning(false)
  })
}

// -- Types --

export interface SavedStyle {
  id: string
  name: string
  timestamp: number
  data: {
    appearance: Record<string, unknown>
    lighting: Record<string, unknown>
    postProcessing: Record<string, unknown>
    environment: Record<string, unknown>
    pbr: Record<string, unknown>
  }
}

export interface SavedScene {
  id: string
  name: string
  timestamp: number
  data: {
    // Style components
    appearance: Record<string, unknown>
    lighting: Record<string, unknown>
    postProcessing: Record<string, unknown>
    environment: Record<string, unknown>
    pbr: Record<string, unknown>

    // Scene specific components
    geometry: Record<string, unknown>
    extended: Record<string, unknown>
    transform: Record<string, unknown>
    rotation: Record<string, unknown> // Stores Map as Object/Array
    animation: Record<string, unknown> // Stores Set as Array
    camera: Record<string, unknown>
    ui: Record<string, unknown>
  }
}

export interface PresetManagerState {
  savedStyles: SavedStyle[]
  savedScenes: SavedScene[]

  // Style Actions
  saveStyle: (name: string) => void
  loadStyle: (id: string) => void
  deleteStyle: (id: string) => void
  renameStyle: (id: string, newName: string) => void
  importStyles: (jsonData: string) => boolean
  exportStyles: () => string

  // Scene Actions
  saveScene: (name: string) => void
  loadScene: (id: string) => void
  deleteScene: (id: string) => void
  renameScene: (id: string, newName: string) => void
  importScenes: (jsonData: string) => boolean
  exportScenes: () => string
}

// -- Helpers --

/**
 * Fields that should never be serialized to presets.
 * These are transient runtime states that don't represent user configuration.
 */
const TRANSIENT_FIELDS = new Set([
  // Skybox - runtime texture object and loading state
  'classicCubeTexture',
  'skyboxLoading',
  // Lighting - UI interaction state and gizmo visibility
  'isDraggingLight',
  'showLightGizmos',
  // Camera - runtime THREE.js control objects
  'controls',
  'savedState',
  // UI - helper visibility (excluded per user specification)
  'showAxisHelper',
  // UI - performance monitor state (user-specific, not scene/style config)
  'showPerfMonitor',
  'perfMonitorExpanded',
  'perfMonitorTab',

  // Version counters - internal dirty-flag optimization state
  // These are auto-incremented for render optimization and should never be persisted
  'appearanceVersion',
  'iblVersion',
  'groundVersion',
  'skyboxVersion',
  'version', // Used by rotationStore and lightingSlice
  'gravityVersion',
  'pbrVersion',
  'polytopeVersion',
  'blackholeVersion',
  'schroedingerVersion',
  'mandelbulbVersion',
  'quaternionJuliaVersion',
])

/**
 * Deep clones state and removes functions and transient fields to ensure JSON serializability.
 * Prevents reference mutation issues where saved presets would change when store changes.
 * Also handles non-serializable THREE.js objects by excluding them.
 * @param state - The state object to serialize.
 * @returns A JSON-serializable version of the state.
 */
const serializeState = <T extends object>(state: T): Record<string, unknown> => {
  // 1. Create a shallow copy first to filter functions and transient fields
  const clean: Record<string, unknown> = {}
  for (const key in state) {
    // Skip functions
    if (typeof state[key] === 'function') continue
    // Skip transient fields that shouldn't be persisted
    if (TRANSIENT_FIELDS.has(key)) continue
    clean[key] = state[key]
  }

  // 2. Deep clone via JSON to break references
  return JSON.parse(JSON.stringify(clean))
}

/**
 * Serializes Animation store (Set -> Array)
 * @param state - The animation state to serialize.
 * @returns A JSON-serializable version of the animation state.
 */
const serializeAnimationState = <T extends object>(state: T) => {
  const clean = serializeState(state)
  if ('animatingPlanes' in state && state.animatingPlanes instanceof Set) {
    clean.animatingPlanes = Array.from(state.animatingPlanes)
  }
  return clean
}

/**
 * Serializes Rotation store (Map -> Object)
 * @param state - The rotation state to serialize.
 * @returns A JSON-serializable version of the rotation state.
 */
const serializeRotationState = <T extends object>(state: T) => {
  const clean = serializeState(state)
  if ('rotations' in state && state.rotations instanceof Map) {
    // Convert Map to Object for JSON serialization
    clean.rotations = Object.fromEntries(state.rotations as Map<string, unknown>)
  }
  return clean
}

/**
 * Strips transient/internal fields from loaded data.
 * Ensures legacy presets containing version fields don't overwrite current state.
 * @param state - The state object loaded from a preset.
 * @returns A sanitized copy with transient fields removed.
 */
const sanitizeLoadedState = <T extends Record<string, unknown>>(state: T): T => {
  const clean = { ...state }
  for (const field of TRANSIENT_FIELDS) {
    delete clean[field]
  }
  return clean
}

/**
 * Recursively sanitizes all data sections of a saved style.
 * Removes transient fields from each store's data.
 * @param data - The SavedStyle data object.
 * @returns Sanitized data object.
 */
const sanitizeStyleData = (data: SavedStyle['data']): SavedStyle['data'] => ({
  appearance: sanitizeLoadedState(data.appearance),
  lighting: sanitizeLoadedState(data.lighting),
  postProcessing: sanitizeLoadedState(data.postProcessing),
  environment: sanitizeLoadedState(data.environment),
  pbr: sanitizeLoadedState(data.pbr),
})

/**
 * Recursively sanitizes all data sections of a saved scene.
 * Removes transient fields from each store's data.
 * @param data - The SavedScene data object.
 * @returns Sanitized data object.
 */
const sanitizeSceneData = (data: SavedScene['data']): SavedScene['data'] => ({
  appearance: sanitizeLoadedState(data.appearance),
  lighting: sanitizeLoadedState(data.lighting),
  postProcessing: sanitizeLoadedState(data.postProcessing),
  environment: sanitizeLoadedState(data.environment),
  pbr: sanitizeLoadedState(data.pbr),
  geometry: sanitizeLoadedState(data.geometry),
  extended: sanitizeLoadedState(data.extended),
  transform: sanitizeLoadedState(data.transform),
  rotation: sanitizeLoadedState(data.rotation),
  animation: sanitizeLoadedState(data.animation),
  camera: sanitizeLoadedState(data.camera),
  ui: sanitizeLoadedState(data.ui),
})

export const usePresetManagerStore = create<PresetManagerState>()(
  persist(
    (set, get) => ({
      savedStyles: [],
      savedScenes: [],

      // --- Style Actions ---

      saveStyle: (name) => {
        // Validate and sanitize name
        const trimmedName = name.trim()
        if (!trimmedName) {
          console.warn('Cannot save style with empty name')
          return
        }

        // Deep clone all states to prevent reference sharing
        const appearance = serializeState(useAppearanceStore.getState())
        const lighting = serializeState(useLightingStore.getState())
        const postProcessing = serializeState(usePostProcessingStore.getState())
        const environment = serializeState(useEnvironmentStore.getState())
        const pbr = serializeState(usePBRStore.getState())

        const newStyle: SavedStyle = {
          id: crypto.randomUUID(),
          name: trimmedName,
          timestamp: Date.now(),
          data: {
            appearance,
            lighting,
            postProcessing,
            environment,
            pbr,
          },
        }

        set((state) => ({ savedStyles: [...state.savedStyles, newStyle] }))

        // Show localStorage warning (can be dismissed permanently)
        showConditionalMsgBox(
          DIALOG_IDS.PRESET_SAVE_STYLE_WARNING,
          'Style Saved Locally',
          "Your style preset is stored in your browser's localStorage. This data may be lost if you clear browser data or use private browsing.\n\nFor permanent backup, use the Export function to save your styles as a JSON file.",
          'info',
          [
            {
              label: 'Got it',
              variant: 'primary',
              onClick: () => useMsgBoxStore.getState().closeMsgBox(),
            },
          ]
        )
      },

      loadStyle: (id) => {
        const style = get().savedStyles.find((s) => s.id === id)
        if (!style) return

        // Signal scene transition start
        usePerformanceStore.getState().setSceneTransitioning(true)

        // Restore states with transient fields stripped
        // This ensures legacy presets with version fields don't corrupt current counters
        useAppearanceStore.setState(sanitizeLoadedState(style.data.appearance))
        useLightingStore.setState(sanitizeLoadedState(style.data.lighting))
        usePostProcessingStore.setState(sanitizeLoadedState(style.data.postProcessing))

        // Handle legacy environment data (fallback to no skybox)
        const envData = sanitizeLoadedState({ ...style.data.environment })
        if (envData.skyboxEnabled === undefined) {
          envData.skyboxEnabled = false
        }
        useEnvironmentStore.setState(envData)

        // Restore PBR settings (handle legacy presets without pbr)
        if (style.data.pbr) {
          usePBRStore.setState(sanitizeLoadedState(style.data.pbr))
        }

        // Bump version counters to trigger re-renders after direct setState calls
        // This is necessary because setState bypasses the wrapped setters that auto-increment versions
        useAppearanceStore.getState().bumpVersion()
        useLightingStore.getState().bumpVersion()
        usePostProcessingStore.getState().bumpGravityVersion()
        useEnvironmentStore.getState().bumpAllVersions()
        usePBRStore.getState().bumpVersion()

        // Increment preset load version to trigger material recreation in renderers
        // This ensures material properties (transparent, depthWrite) match loaded state
        usePerformanceStore.getState().incrementPresetLoadVersion()

        requestAnimationFrame(() => {
          usePerformanceStore.getState().setSceneTransitioning(false)
        })
      },

      deleteStyle: (id) => {
        set((state) => ({ savedStyles: state.savedStyles.filter((s) => s.id !== id) }))
      },

      renameStyle: (id, newName) => {
        const trimmedName = newName.trim()
        if (!trimmedName) {
          console.warn('Cannot rename style to empty name')
          return
        }
        set((state) => ({
          savedStyles: state.savedStyles.map((s) =>
            s.id === id ? { ...s, name: trimmedName } : s
          ),
        }))
      },

      importStyles: (jsonData) => {
        try {
          const imported = JSON.parse(jsonData)
          if (!Array.isArray(imported)) {
            useMsgBoxStore
              .getState()
              .showMsgBox('Import Failed', 'Invalid format: expected an array of styles.', 'error')
            return false
          }
          // Comprehensive validation: Check all required SavedStyle fields
          const valid = imported.every(
            (i) =>
              i.id &&
              i.name &&
              i.timestamp &&
              i.data &&
              i.data.appearance &&
              i.data.lighting &&
              i.data.postProcessing &&
              i.data.environment
          )
          if (!valid) {
            useMsgBoxStore
              .getState()
              .showMsgBox(
                'Import Failed',
                'The style data is corrupted or incompatible. Styles must contain appearance, lighting, postProcessing, and environment data.',
                'error'
              )
            return false
          }

          // Regenerate IDs to prevent duplicates and sanitize data
          const existingNames = get().savedStyles.map((s) => s.name)
          const processedStyles = imported.map((style) => {
            // Always generate a new ID to ensure uniqueness
            const newId = crypto.randomUUID()
            // Check if this is a name duplicate and append "(imported)" if so
            const newName = existingNames.includes(style.name)
              ? `${style.name} (imported)`
              : style.name
            return {
              ...style,
              id: newId,
              name: newName,
              timestamp: Date.now(), // Update timestamp to import time
              // Sanitize data to remove any transient fields (version counters, etc.)
              data: sanitizeStyleData(style.data),
            }
          })

          set((state) => ({ savedStyles: [...state.savedStyles, ...processedStyles] }))
          return true
        } catch (e) {
          console.error('Failed to import styles', e)
          useMsgBoxStore
            .getState()
            .showMsgBox(
              'Import Error',
              `Failed to parse JSON data: ${e instanceof Error ? e.message : 'Unknown error'}`,
              'error'
            )
          return false
        }
      },

      exportStyles: () => {
        return JSON.stringify(get().savedStyles, null, 2)
      },

      // --- Scene Actions ---

      saveScene: (name) => {
        // Validate and sanitize name
        const trimmedName = name.trim()
        if (!trimmedName) {
          console.warn('Cannot save scene with empty name')
          return
        }

        // Style components
        const appearance = serializeState(useAppearanceStore.getState())
        const lighting = serializeState(useLightingStore.getState())
        const postProcessing = serializeState(usePostProcessingStore.getState())
        const environment = serializeState(useEnvironmentStore.getState())
        const pbr = serializeState(usePBRStore.getState())

        // Scene components
        const geometry = serializeState(useGeometryStore.getState())
        const extended = serializeState(useExtendedObjectStore.getState())
        const transform = serializeState(useTransformStore.getState())
        const ui = serializeState(useUIStore.getState())

        // Special handling
        const animation = serializeAnimationState(useAnimationStore.getState())
        const rotation = serializeRotationState(useRotationStore.getState())

        const cameraState = useCameraStore.getState().captureState()
        const camera = cameraState ? serializeState(cameraState) : {}

        const newScene: SavedScene = {
          id: crypto.randomUUID(),
          name: trimmedName,
          timestamp: Date.now(),
          data: {
            appearance,
            lighting,
            postProcessing,
            environment,
            pbr,
            geometry,
            extended,
            transform,
            ui,
            rotation,
            animation,
            camera,
          },
        }

        set((state) => ({ savedScenes: [...state.savedScenes, newScene] }))

        // Show localStorage warning (can be dismissed permanently)
        showConditionalMsgBox(
          DIALOG_IDS.PRESET_SAVE_SCENE_WARNING,
          'Scene Saved Locally',
          "Your scene preset is stored in your browser's localStorage. This data may be lost if you clear browser data or use private browsing.\n\nFor permanent backup, use the Export function to save your scenes as a JSON file.",
          'info',
          [
            {
              label: 'Got it',
              variant: 'primary',
              onClick: () => useMsgBoxStore.getState().closeMsgBox(),
            },
          ]
        )
      },

      loadScene: (id) => {
        const scene = get().savedScenes.find((s) => s.id === id)
        if (!scene) return

        // Batch all store updates atomically to prevent intermediate renders
        flushSync(() => {
          // Set both flags: isLoadingScene prevents hook-based rotation reset,
          // sceneTransitioning enables progressive refinement for visual quality
          usePerformanceStore.getState().setIsLoadingScene(true)
          usePerformanceStore.getState().setSceneTransitioning(true)

          // Restore Style components with transient fields stripped
          // This ensures legacy presets with version fields don't corrupt current counters
          useAppearanceStore.setState(sanitizeLoadedState(scene.data.appearance))
          useLightingStore.setState(sanitizeLoadedState(scene.data.lighting))
          usePostProcessingStore.setState(sanitizeLoadedState(scene.data.postProcessing))

          // Handle legacy environment data
          const envData = sanitizeLoadedState({ ...scene.data.environment })
          if (envData.skyboxEnabled === undefined) {
            envData.skyboxEnabled = false
          }
          useEnvironmentStore.setState(envData)

          // Restore PBR settings (handle legacy presets without pbr)
          if (scene.data.pbr) {
            usePBRStore.setState(sanitizeLoadedState(scene.data.pbr))
          }

          // Restore Geometry atomically using loadGeometry
          // This sets both dimension and objectType without auto-adjustments
          // (e.g., won't auto-switch to "recommended" dimension for fractals)
          const geometryData = sanitizeLoadedState(scene.data.geometry) as {
            dimension?: number
            objectType?: string
          }
          if (geometryData.dimension !== undefined && geometryData.objectType !== undefined) {
            useGeometryStore.getState().loadGeometry(
              geometryData.dimension,
              geometryData.objectType as import('@/lib/geometry/types').ObjectType
            )
          } else if (geometryData.dimension !== undefined) {
            useGeometryStore.getState().setDimension(geometryData.dimension)
          } else if (geometryData.objectType !== undefined) {
            useGeometryStore
              .getState()
              .setObjectType(geometryData.objectType as import('@/lib/geometry/types').ObjectType)
          }

          // Restore other scene components with transient fields stripped
          // Merge with defaults to ensure new parameters added after scene was saved get default values
          useExtendedObjectStore.setState(
            mergeExtendedObjectState(sanitizeLoadedState(scene.data.extended))
          )
          useTransformStore.setState(sanitizeLoadedState(scene.data.transform))

          // Sanitize UI data (already strips transient fields)
          useUIStore.setState(sanitizeLoadedState(scene.data.ui))

          // Special handling for Rotation (Object -> Map)
          if (scene.data.rotation) {
            const rotState = sanitizeLoadedState({ ...scene.data.rotation })
            if (
              rotState.rotations &&
              typeof rotState.rotations === 'object' &&
              !Array.isArray(rotState.rotations)
            ) {
              // Convert Object back to Map
              rotState.rotations = new Map(
                Object.entries(rotState.rotations as Record<string, number>)
              )
            }
            useRotationStore.setState(rotState)
          }

          // Special handling for Animation (Array -> Set)
          if (scene.data.animation) {
            const animState = sanitizeLoadedState({ ...scene.data.animation })
            if (Array.isArray(animState.animatingPlanes)) {
              animState.animatingPlanes = new Set(animState.animatingPlanes)
            }
            useAnimationStore.setState(animState)
          }

          // Special handling for Camera
          if (scene.data.camera && Object.keys(scene.data.camera).length > 0) {
            const cameraData = sanitizeLoadedState(scene.data.camera) as {
              position?: [number, number, number]
              target?: [number, number, number]
            }
            if (cameraData.position && cameraData.target) {
              useCameraStore.getState().applyState({
                position: cameraData.position,
                target: cameraData.target,
              })
            }
          }
        })

        // Bump version counters to trigger re-renders after direct setState calls
        // This is necessary because setState bypasses the wrapped setters that auto-increment versions
        useAppearanceStore.getState().bumpVersion()
        useLightingStore.getState().bumpVersion()
        usePostProcessingStore.getState().bumpGravityVersion()
        useEnvironmentStore.getState().bumpAllVersions()
        usePBRStore.getState().bumpVersion()
        useRotationStore.getState().bumpVersion()
        useExtendedObjectStore.getState().bumpAllVersions()

        // Increment preset load version to trigger material recreation in renderers
        // This ensures material properties (transparent, depthWrite) match loaded state
        console.log(
          '[loadScene] incrementPresetLoadVersion, faceOpacity:',
          useAppearanceStore.getState().shaderSettings?.surface?.faceOpacity
        )
        usePerformanceStore.getState().incrementPresetLoadVersion()

        // Signal load complete after React settles - uses helper to prevent race conditions
        scheduleSceneLoadComplete()
      },

      deleteScene: (id) => {
        set((state) => ({ savedScenes: state.savedScenes.filter((s) => s.id !== id) }))
      },

      renameScene: (id, newName) => {
        const trimmedName = newName.trim()
        if (!trimmedName) {
          console.warn('Cannot rename scene to empty name')
          return
        }
        set((state) => ({
          savedScenes: state.savedScenes.map((s) =>
            s.id === id ? { ...s, name: trimmedName } : s
          ),
        }))
      },

      importScenes: (jsonData) => {
        try {
          const imported = JSON.parse(jsonData)
          if (!Array.isArray(imported)) {
            useMsgBoxStore
              .getState()
              .showMsgBox('Import Failed', 'Invalid format: expected an array of scenes.', 'error')
            return false
          }
          // Comprehensive validation: Check all required SavedScene fields
          const valid = imported.every(
            (i) =>
              i.id &&
              i.name &&
              i.timestamp &&
              i.data &&
              // Style components
              i.data.appearance &&
              i.data.lighting &&
              i.data.postProcessing &&
              i.data.environment &&
              // Scene components
              i.data.geometry &&
              i.data.extended &&
              i.data.transform &&
              i.data.rotation &&
              i.data.animation &&
              i.data.camera &&
              i.data.ui
          )
          if (!valid) {
            useMsgBoxStore
              .getState()
              .showMsgBox(
                'Import Failed',
                'The scene data is corrupted or incompatible. Scenes must contain all required data fields (geometry, appearance, lighting, etc.).',
                'error'
              )
            return false
          }

          // Regenerate IDs to prevent duplicates and sanitize data
          const existingNames = get().savedScenes.map((s) => s.name)
          const processedScenes = imported.map((scene) => {
            // Always generate a new ID to ensure uniqueness
            const newId = crypto.randomUUID()
            // Check if this is a name duplicate and append "(imported)" if so
            const newName = existingNames.includes(scene.name)
              ? `${scene.name} (imported)`
              : scene.name
            return {
              ...scene,
              id: newId,
              name: newName,
              timestamp: Date.now(), // Update timestamp to import time
              // Sanitize data to remove any transient fields (version counters, etc.)
              data: sanitizeSceneData(scene.data),
            }
          })

          set((state) => ({ savedScenes: [...state.savedScenes, ...processedScenes] }))
          return true
        } catch (e) {
          console.error('Failed to import scenes', e)
          useMsgBoxStore
            .getState()
            .showMsgBox(
              'Import Error',
              `Failed to parse JSON data: ${e instanceof Error ? e.message : 'Unknown error'}`,
              'error'
            )
          return false
        }
      },

      exportScenes: () => {
        return JSON.stringify(get().savedScenes, null, 2)
      },
    }),
    {
      name: 'mdimension-preset-manager',
    }
  )
)
