import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { showConditionalMsgBox } from '@/hooks/useConditionalMsgBox'
import { logger } from '@/lib/logger'

import { DEFAULT_SPEED, useAnimationStore } from './animationStore'
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
import { APPEARANCE_INITIAL_STATE } from './slices/appearanceSlice'
import { LIGHTING_INITIAL_STATE } from './slices/lightingSlice'
import { POST_PROCESSING_INITIAL_STATE } from './slices/postProcessingSlice'
import { SKYBOX_INITIAL_STATE } from './slices/skyboxSlice'
import { PBR_INITIAL_STATE } from './slices/visual/pbrSlice'
import { useTransformStore } from './transformStore'
import { useUIStore } from './uiStore'
import { mergeExtendedObjectStateForType } from './utils/mergeWithDefaults'
import {
  isNonEmptyTrimmedString,
  makeUniqueImportedName,
  normalizeAnimationLoadData,
  normalizeAppearanceLoadData,
  normalizeEnvironmentLoadData,
  normalizeLightingLoadData,
  normalizePbrLoadData,
  normalizePostProcessingLoadData,
  normalizeUiLoadData,
} from './utils/presetNormalization'
import {
  sanitizeExtendedLoadedState,
  sanitizeLoadedState,
  sanitizeSceneData,
  sanitizeStyleData,
  serializeAnimationState,
  serializeExtendedState,
  serializeRotationState,
  serializeState,
} from './utils/presetSerialization'
import type { SavedScene, SavedStyle } from './utils/presetTypes'

/**
 * Pending rAF ID for scene load completion.
 * Used to cancel stale callbacks when rapid scene loads occur.
 */
let pendingSceneLoadRafId: number | null = null
let pendingStyleLoadRafId: number | null = null

/**
 * Schedules scene load completion after React settles.
 * Cancels any pending callback to prevent race conditions.
 */
/** Restore rotation state from serialized scene data. */
function restoreRotationState(rotationData: Record<string, unknown>): void {
  const rotState = sanitizeLoadedState({ ...rotationData })
  const rotationUpdates = new Map<string, number>()
  if (rotState.rotations instanceof Map) {
    for (const [plane, angle] of rotState.rotations.entries()) {
      if (typeof angle === 'number') rotationUpdates.set(plane, angle)
    }
  } else if (
    rotState.rotations &&
    typeof rotState.rotations === 'object' &&
    !Array.isArray(rotState.rotations)
  ) {
    for (const [plane, angle] of Object.entries(rotState.rotations as Record<string, unknown>)) {
      if (typeof angle === 'number') rotationUpdates.set(plane, angle)
    }
  }
  const rotationStore = useRotationStore.getState()
  rotationStore.resetAllRotations()
  if (rotationUpdates.size > 0) rotationStore.updateRotations(rotationUpdates)
}

/** Restore animation state from serialized scene data. */
function restoreAnimationState(animationData: Record<string, unknown>): void {
  const animState = normalizeAnimationLoadData(sanitizeLoadedState({ ...animationData }))
  if (Array.isArray(animState.animatingPlanes)) {
    animState.animatingPlanes = new Set(animState.animatingPlanes)
  }
  useAnimationStore.setState({
    isPlaying: true,
    speed: DEFAULT_SPEED,
    direction: 1 as const,
    animatingPlanes: new Set(['XY', 'YZ', 'XZ']),
    accumulatedTime: 0,
    ...animState,
  })
  useAnimationStore.getState().setDimension(useGeometryStore.getState().dimension)
}

/**
 * Cancels any pending scene load rAF callback.
 * Exported for test teardown to prevent stale callbacks firing between tests.
 */
export function cancelPendingSceneLoad(): void {
  if (pendingSceneLoadRafId !== null) {
    cancelAnimationFrame(pendingSceneLoadRafId)
    pendingSceneLoadRafId = null
  }
  if (pendingStyleLoadRafId !== null) {
    cancelAnimationFrame(pendingStyleLoadRafId)
    pendingStyleLoadRafId = null
  }
}

function scheduleSceneLoadComplete(): void {
  cancelPendingSceneLoad()

  pendingSceneLoadRafId = requestAnimationFrame(() => {
    pendingSceneLoadRafId = null
    usePerformanceStore.getState().setIsLoadingScene(false)
    usePerformanceStore.getState().setSceneTransitioning(false)
  })
}

// Re-export preset types for backward compatibility
export type { SavedScene, SavedStyle } from './utils/presetTypes'

/**
 * Preset manager store state and actions.
 */
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
          logger.warn('Cannot save style with empty name')
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

        // Restore states: spread defaults first, then override with loaded data.
        // This ensures fields missing from older presets reset to defaults instead
        // of retaining whatever the current store value happens to be.
        useAppearanceStore.setState({
          ...APPEARANCE_INITIAL_STATE,
          ...normalizeAppearanceLoadData(sanitizeLoadedState(style.data.appearance)),
        })
        useLightingStore.setState({
          ...LIGHTING_INITIAL_STATE,
          ...normalizeLightingLoadData(sanitizeLoadedState(style.data.lighting)),
        })
        usePostProcessingStore.setState({
          ...POST_PROCESSING_INITIAL_STATE,
          ...normalizePostProcessingLoadData(sanitizeLoadedState(style.data.postProcessing)),
        })

        // Handle legacy environment data and keep unified skybox fields canonical.
        const envData = normalizeEnvironmentLoadData(
          sanitizeLoadedState({ ...style.data.environment })
        )
        useEnvironmentStore.setState({ ...SKYBOX_INITIAL_STATE, ...envData })

        // Restore PBR settings (legacy imports without pbr should reset to defaults)
        const stylePbrData = style.data.pbr
          ? sanitizeLoadedState(style.data.pbr)
          : ({} as Record<string, unknown>)
        if (Object.keys(stylePbrData).length > 0) {
          usePBRStore.setState({ ...PBR_INITIAL_STATE, ...normalizePbrLoadData(stylePbrData) })
        } else {
          usePBRStore.getState().resetPBR()
        }

        // Bump version counters to trigger re-renders after direct setState calls
        // This is necessary because setState bypasses the wrapped setters that auto-increment versions
        useAppearanceStore.getState().bumpVersion()
        useLightingStore.getState().bumpVersion()

        useEnvironmentStore.getState().bumpAllVersions()
        usePBRStore.getState().bumpVersion()

        // Increment preset load version to trigger material recreation in renderers
        // This ensures material properties (transparent, depthWrite) match loaded state
        usePerformanceStore.getState().incrementPresetLoadVersion()

        if (pendingStyleLoadRafId !== null) {
          cancelAnimationFrame(pendingStyleLoadRafId)
        }
        pendingStyleLoadRafId = requestAnimationFrame(() => {
          pendingStyleLoadRafId = null
          usePerformanceStore.getState().setSceneTransitioning(false)
        })
      },

      deleteStyle: (id) => {
        set((state) => ({ savedStyles: state.savedStyles.filter((s) => s.id !== id) }))
      },

      renameStyle: (id, newName) => {
        const trimmedName = newName.trim()
        if (!trimmedName) {
          logger.warn('Cannot rename style to empty name')
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
              isNonEmptyTrimmedString(i.name) &&
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
          const usedNames = new Set(get().savedStyles.map((s) => s.name))
          const processedStyles = imported.map((style) => {
            // Always generate a new ID to ensure uniqueness
            const newId = crypto.randomUUID()
            const rawName = style.name.trim()
            const newName = makeUniqueImportedName(rawName, usedNames)
            usedNames.add(newName)
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
          logger.error('Failed to import styles', e)
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
          logger.warn('Cannot save scene with empty name')
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
        // Only serialize the extended config for the current object type
        // This prevents irrelevant configs from being saved/overwritten
        const currentObjectType = useGeometryStore.getState().objectType
        const extended = serializeExtendedState(
          useExtendedObjectStore.getState(),
          currentObjectType
        )
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

        // All store updates execute synchronously and are batched by React 18's automatic batching
        // Set both flags: isLoadingScene prevents hook-based rotation reset,
        // sceneTransitioning enables progressive refinement for visual quality
        usePerformanceStore.getState().setIsLoadingScene(true)
        usePerformanceStore.getState().setSceneTransitioning(true)

        // Restore style components: spread defaults first, then override with loaded data.
        // This ensures fields missing from older presets reset to defaults instead
        // of retaining whatever the current store value happens to be.
        useAppearanceStore.setState({
          ...APPEARANCE_INITIAL_STATE,
          ...normalizeAppearanceLoadData(sanitizeLoadedState(scene.data.appearance)),
        })
        useLightingStore.setState({
          ...LIGHTING_INITIAL_STATE,
          ...normalizeLightingLoadData(sanitizeLoadedState(scene.data.lighting)),
        })
        usePostProcessingStore.setState({
          ...POST_PROCESSING_INITIAL_STATE,
          ...normalizePostProcessingLoadData(sanitizeLoadedState(scene.data.postProcessing)),
        })

        // Handle legacy environment data and keep unified skybox fields canonical.
        const envData = normalizeEnvironmentLoadData(
          sanitizeLoadedState({ ...scene.data.environment })
        )
        useEnvironmentStore.setState({ ...SKYBOX_INITIAL_STATE, ...envData })

        // Restore PBR settings (legacy imports without pbr should reset to defaults)
        const scenePbrData = scene.data.pbr
          ? sanitizeLoadedState(scene.data.pbr)
          : ({} as Record<string, unknown>)
        if (Object.keys(scenePbrData).length > 0) {
          usePBRStore.setState({ ...PBR_INITIAL_STATE, ...normalizePbrLoadData(scenePbrData) })
        } else {
          usePBRStore.getState().resetPBR()
        }

        // Restore Geometry atomically using loadGeometry
        // This sets both dimension and objectType without auto-adjustments
        const geometryData = sanitizeLoadedState(scene.data.geometry) as {
          dimension?: number
          objectType?: string
        }
        // Determine the object type for loading (either from saved data or keep current)
        const loadedObjectType = (geometryData.objectType ??
          useGeometryStore.getState().objectType) as import('@/lib/geometry/types').ObjectType

        if (geometryData.dimension !== undefined && geometryData.objectType !== undefined) {
          useGeometryStore
            .getState()
            .loadGeometry(
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

        // Restore only the extended config for the loaded object type
        // This prevents overwriting configs for other object types
        // mergeExtendedObjectStateForType merges with defaults and only touches the relevant config
        useExtendedObjectStore.setState(
          mergeExtendedObjectStateForType(
            sanitizeExtendedLoadedState(scene.data.extended),
            loadedObjectType
          )
        )
        // Restore transform via store actions to preserve invariants tied to geometry dimension.
        const transformData = sanitizeLoadedState(scene.data.transform) as {
          uniformScale?: unknown
          perAxisScale?: unknown
          scaleLocked?: unknown
        }
        const transformStore = useTransformStore.getState()
        transformStore.resetAll()
        if (typeof transformData.scaleLocked === 'boolean') {
          transformStore.setScaleLocked(transformData.scaleLocked)
        }
        if (typeof transformData.uniformScale === 'number') {
          transformStore.setUniformScale(transformData.uniformScale)
        }
        if (
          !useTransformStore.getState().scaleLocked &&
          Array.isArray(transformData.perAxisScale)
        ) {
          for (let axis = 0; axis < transformData.perAxisScale.length; axis++) {
            const axisScale = transformData.perAxisScale[axis]
            if (typeof axisScale === 'number') {
              useTransformStore.getState().setAxisScale(axis, axisScale)
            }
          }
        }

        // UI payloads are intentionally narrow: keep only canonical, non-transient fields.
        const uiData = normalizeUiLoadData(
          sanitizeLoadedState(scene.data.ui) as Record<string, unknown>
        )
        useUIStore.setState(uiData)

        // Special handling for Rotation
        if (scene.data.rotation) {
          restoreRotationState(scene.data.rotation)
        }

        // Special handling for Animation (Array -> Set)
        if (scene.data.animation) {
          restoreAnimationState(scene.data.animation)
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

        // Post-load invariants for compute modes.
        // loadGeometry + setState bypass setSchroedingerQuantumMode's enforcement,
        // so we must normalize here to prevent stale/incompatible state from leaking
        // into the renderer (e.g. representation='momentum' or crossSectionEnabled=true
        // would corrupt the GPU uniform buffer for density-grid-based pipelines).
        const qm = useExtendedObjectStore.getState().schroedinger?.quantumMode
        const isComputeQm =
          qm === 'freeScalarField' ||
          qm === 'tdseDynamics' ||
          qm === 'becDynamics' ||
          qm === 'diracEquation'
        if (isComputeQm) {
          if (useGeometryStore.getState().dimension < 3) {
            useGeometryStore.getState().setDimension(3)
          }
          const sch = useExtendedObjectStore.getState().schroedinger
          const computePatches: Record<string, unknown> = {}
          if (sch?.representation !== 'position') {
            computePatches.representation = 'position'
          }
          if (sch?.crossSectionEnabled) {
            computePatches.crossSectionEnabled = false
          }
          if (Object.keys(computePatches).length > 0) {
            useExtendedObjectStore.setState({
              schroedinger: { ...sch, ...computePatches },
            })
          }
        }

        // Bump version counters to trigger re-renders after direct setState calls
        // This is necessary because setState bypasses the wrapped setters that auto-increment versions
        useAppearanceStore.getState().bumpVersion()
        useLightingStore.getState().bumpVersion()

        useEnvironmentStore.getState().bumpAllVersions()
        usePBRStore.getState().bumpVersion()
        useRotationStore.getState().bumpVersion()
        useExtendedObjectStore.getState().bumpAllVersions()

        // Increment preset load version to trigger material recreation in renderers
        // This ensures material properties (transparent, depthWrite) match loaded state
        logger.log('[loadScene] incrementPresetLoadVersion')
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
          logger.warn('Cannot rename scene to empty name')
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
              isNonEmptyTrimmedString(i.name) &&
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
          const usedNames = new Set(get().savedScenes.map((s) => s.name))
          const processedScenes = imported.map((scene) => {
            // Always generate a new ID to ensure uniqueness
            const newId = crypto.randomUUID()
            const rawName = scene.name.trim()
            const newName = makeUniqueImportedName(rawName, usedNames)
            usedNames.add(newName)
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
          logger.error('Failed to import scenes', e)
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
      name: 'mquantum-preset-manager',
    }
  )
)
