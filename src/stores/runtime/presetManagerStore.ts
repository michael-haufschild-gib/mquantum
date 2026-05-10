import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { showConditionalMsgBox } from '@/hooks/useConditionalMsgBox'
import { isComputeQuantumType, isValidObjectType } from '@/lib/geometry/registry'
import type { ObjectType } from '@/lib/geometry/types'
import { logger } from '@/lib/logger'

import { useCoordinateEntanglementStore } from '../diagnostics/coordinateEntanglementStore'
import { useMonitoringSweepStore } from '../diagnostics/monitoringSweepStore'
import { useQuantumnessAtlasStore } from '../diagnostics/quantumnessAtlasStore'
import { DEFAULT_SPEED, useAnimationStore } from '../scene/animationStore'
import { useAppearanceStore } from '../scene/appearanceStore'
import { useCameraStore } from '../scene/cameraStore'
import { useEnvironmentStore } from '../scene/environmentStore'
import { useExtendedObjectStore } from '../scene/extendedObjectStore'
import { useGeometryStore } from '../scene/geometryStore'
import { useLightingStore } from '../scene/lightingStore'
import { usePBRStore } from '../scene/pbrStore'
import { usePostProcessingStore } from '../scene/postProcessingStore'
import { useRotationStore } from '../scene/rotationStore'
import { useTransformStore } from '../scene/transformStore'
import { APPEARANCE_INITIAL_STATE } from '../slices/appearanceSlice'
import { LIGHTING_INITIAL_STATE } from '../slices/lightingSlice'
import { POST_PROCESSING_INITIAL_STATE } from '../slices/postProcessingSlice'
import { SKYBOX_INITIAL_STATE } from '../slices/skyboxSlice'
import { PBR_INITIAL_STATE } from '../slices/visual/pbrSlice'
import { DIALOG_IDS } from '../ui/dismissedDialogsStore'
import { useMsgBoxStore } from '../ui/msgBoxStore'
import { useUIStore } from '../ui/uiStore'
import { mergeExtendedObjectStateForType } from '../utils/mergeWithDefaults'
import {
  parseAndValidateImport,
  SCENE_IMPORT_KEYS,
  STYLE_IMPORT_KEYS,
} from '../utils/presetImportExport'
import {
  normalizeAnimationLoadData,
  normalizeAppearanceLoadData,
  normalizeEnvironmentLoadData,
  normalizeLightingLoadData,
  normalizePbrLoadData,
  normalizePostProcessingLoadData,
  normalizeUiLoadData,
} from '../utils/presetNormalization'
import {
  sanitizeExtendedLoadedState,
  sanitizeLoadedState,
  sanitizeSceneData,
  sanitizeStyleData,
  serializeAnimationState,
  serializeExtendedState,
  serializeRotationState,
  serializeState,
} from '../utils/presetSerialization'
import type { SavedScene, SavedStyle } from '../utils/presetTypes'
import { usePerformanceStore } from './performanceStore'

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

/** Restore style stores (appearance, lighting, post-processing, environment, PBR) from scene or style data. */
function restoreStyleStores(data: SavedStyle['data']): void {
  useAppearanceStore.setState({
    ...APPEARANCE_INITIAL_STATE,
    ...normalizeAppearanceLoadData(sanitizeLoadedState(data.appearance)),
  })
  useLightingStore.setState({
    ...LIGHTING_INITIAL_STATE,
    ...normalizeLightingLoadData(sanitizeLoadedState(data.lighting)),
  })
  usePostProcessingStore.setState({
    ...POST_PROCESSING_INITIAL_STATE,
    ...normalizePostProcessingLoadData(sanitizeLoadedState(data.postProcessing)),
  })

  const envData = normalizeEnvironmentLoadData(sanitizeLoadedState({ ...data.environment }))
  useEnvironmentStore.setState({ ...SKYBOX_INITIAL_STATE, ...envData })

  const pbrData = data.pbr ? sanitizeLoadedState(data.pbr) : ({} as Record<string, unknown>)
  if (Object.keys(pbrData).length > 0) {
    usePBRStore.setState({ ...PBR_INITIAL_STATE, ...normalizePbrLoadData(pbrData) })
  } else {
    usePBRStore.getState().resetPBR()
  }
}

/**
 * Restore geometry and extended object state.
 */
function restoreGeometryAndExtended(data: SavedScene['data']): void {
  const geometryData = sanitizeLoadedState(data.geometry) as {
    dimension?: number
    objectType?: string
  }

  if (geometryData.dimension !== undefined && geometryData.objectType !== undefined) {
    useGeometryStore
      .getState()
      .loadGeometry(geometryData.dimension, geometryData.objectType as ObjectType)
  } else if (geometryData.dimension !== undefined) {
    useGeometryStore.getState().setDimension(geometryData.dimension)
  } else if (geometryData.objectType !== undefined) {
    if (isValidObjectType(geometryData.objectType)) {
      useGeometryStore.getState().setObjectType(geometryData.objectType)
    }
  }

  const loadedObjectType = useGeometryStore.getState().objectType
  useExtendedObjectStore.setState(
    mergeExtendedObjectStateForType(sanitizeExtendedLoadedState(data.extended), loadedObjectType)
  )
}

/** Restore transform state via store actions to preserve invariants. */
function restoreTransformState(data: Record<string, unknown>): void {
  const transformData = sanitizeLoadedState(data) as {
    uniformScale?: unknown
    perAxisScale?: unknown
    scaleLocked?: unknown
  }
  const store = useTransformStore.getState()
  store.resetAll()
  if (typeof transformData.scaleLocked === 'boolean') {
    store.setScaleLocked(transformData.scaleLocked)
  }
  if (typeof transformData.uniformScale === 'number') {
    store.setUniformScale(transformData.uniformScale)
  }
  if (!useTransformStore.getState().scaleLocked && Array.isArray(transformData.perAxisScale)) {
    for (let axis = 0; axis < transformData.perAxisScale.length; axis++) {
      const axisScale = transformData.perAxisScale[axis]
      if (typeof axisScale === 'number') {
        useTransformStore.getState().setAxisScale(axis, axisScale)
      }
    }
  }
}

/** Restore camera position and target from serialized data. */
function restoreCameraState(data: Record<string, unknown>): void {
  if (Object.keys(data).length === 0) return
  const cameraData = sanitizeLoadedState(data) as {
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

/**
 * Enforce post-load invariants for compute quantum modes.
 * Compute modes require dimension >= 3, position representation, and no cross-section.
 */
function enforceComputeModeInvariants(): void {
  const qm = useExtendedObjectStore.getState().schroedinger?.quantumMode
  if (!qm || !isComputeQuantumType(qm)) return

  if (useGeometryStore.getState().dimension < 3) {
    useGeometryStore.getState().setDimension(3)
  }
  const sch = useExtendedObjectStore.getState().schroedinger
  const patches: Record<string, unknown> = {}
  if (sch?.representation !== 'position') patches.representation = 'position'
  if (sch?.crossSectionEnabled) patches.crossSectionEnabled = false
  if (Object.keys(patches).length > 0) {
    useExtendedObjectStore.setState({ schroedinger: { ...sch, ...patches } })
  }
}

/**
 * Bump version counters for the style-side stores (appearance, lighting,
 * environment, PBR). Direct setState calls bypass the wrapped setters that
 * auto-increment versions — renderers need these bumps to re-pick material
 * state after a preset load.
 */
function bumpStyleVersionCounters(): void {
  useAppearanceStore.getState().bumpVersion()
  useLightingStore.getState().bumpVersion()
  useEnvironmentStore.getState().bumpAllVersions()
  usePBRStore.getState().bumpVersion()
}

/** Bump all version counters (style + scene-specific) after a full scene load. */
function bumpAllVersionCounters(): void {
  bumpStyleVersionCounters()
  useRotationStore.getState().bumpVersion()
  useExtendedObjectStore.getState().bumpAllVersions()
}

// Re-export preset types for backward compatibility
export type { SavedScene, SavedStyle } from '../utils/presetTypes'

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

        usePerformanceStore.getState().setSceneTransitioning(true)

        restoreStyleStores(style.data)
        bumpStyleVersionCounters()

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
        const existingNames = new Set(get().savedStyles.map((s) => s.name))
        const result = parseAndValidateImport<SavedStyle['data'], SavedStyle>(
          jsonData,
          existingNames,
          STYLE_IMPORT_KEYS,
          sanitizeStyleData,
          'styles'
        )
        if (!result.success) {
          useMsgBoxStore
            .getState()
            .showMsgBox(
              result.error.startsWith('Failed') ? 'Import Error' : 'Import Failed',
              result.error,
              'error'
            )
          return false
        }
        set((state) => ({
          savedStyles: [...state.savedStyles, ...result.items],
        }))
        return true
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

        // Abort any running sweeps so their disabled UI controls re-enable before state changes
        useCoordinateEntanglementStore.getState().abortSweep()
        useMonitoringSweepStore.getState().abort()
        useQuantumnessAtlasStore.getState().abortSweep()

        usePerformanceStore.getState().setIsLoadingScene(true)
        usePerformanceStore.getState().setSceneTransitioning(true)

        restoreStyleStores(scene.data)
        restoreGeometryAndExtended(scene.data)
        restoreTransformState(scene.data.transform)

        const uiData = normalizeUiLoadData(
          sanitizeLoadedState(scene.data.ui) as Record<string, unknown>
        )
        useUIStore.setState(uiData)

        if (scene.data.rotation) restoreRotationState(scene.data.rotation)
        if (scene.data.animation) restoreAnimationState(scene.data.animation)
        if (scene.data.camera) restoreCameraState(scene.data.camera)

        enforceComputeModeInvariants()
        bumpAllVersionCounters()

        logger.log('[loadScene] incrementPresetLoadVersion')
        usePerformanceStore.getState().incrementPresetLoadVersion()

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
        const existingNames = new Set(get().savedScenes.map((s) => s.name))
        const result = parseAndValidateImport<SavedScene['data'], SavedScene>(
          jsonData,
          existingNames,
          SCENE_IMPORT_KEYS,
          sanitizeSceneData,
          'scenes'
        )
        if (!result.success) {
          useMsgBoxStore
            .getState()
            .showMsgBox(
              result.error.startsWith('Failed') ? 'Import Error' : 'Import Failed',
              result.error,
              'error'
            )
          return false
        }
        set((state) => ({
          savedScenes: [...state.savedScenes, ...result.items],
        }))
        return true
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
