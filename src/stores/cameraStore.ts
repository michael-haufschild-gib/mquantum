/**
 * Camera Store
 *
 * Bridges the WebGPU camera instance with the React/preset ecosystem.
 * Provides camera state capture/restore for presets and keyboard shortcuts.
 *
 * @module stores/cameraStore
 */

import { create } from 'zustand'

/** Default camera position and target (matches WebGPUCamera constructor defaults) */
const DEFAULT_POSITION: [number, number, number] = [0, 3.125, 7.5]
const DEFAULT_TARGET: [number, number, number] = [0, 0, 0]

/**
 * Minimal camera interface for the store bridge.
 * Implemented by WebGPUCamera in rendering/webgpu/core.
 */
interface CameraInstance {
  getState(): { position: [number, number, number]; target: [number, number, number] }
  setPosition(x: number, y: number, z: number): void
  setTarget(x: number, y: number, z: number): void
}

/**
 * Serializable camera position/target tuple used by presets and URL scene loads.
 */
export interface CameraState {
  position: [number, number, number]
  target: [number, number, number]
}

function isFiniteVec3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => typeof component === 'number' && Number.isFinite(component))
  )
}

function normalizeCameraState(state: CameraState | null | undefined): CameraState | null {
  if (!state || !isFiniteVec3(state.position) || !isFiniteVec3(state.target)) {
    return null
  }
  return {
    position: [state.position[0], state.position[1], state.position[2]],
    target: [state.target[0], state.target[1], state.target[2]],
  }
}

interface CameraStore {
  /** Reference to the active WebGPU camera instance */
  camera: CameraInstance | null
  /** Pending camera state to apply when camera becomes available (race condition fix) */
  pendingState: CameraState | null

  /** Register the WebGPU camera instance. Flushes any pending state. */
  registerCamera: (camera: CameraInstance | null) => void
  /** Capture current camera position and target. Returns null if camera not registered. */
  captureState: () => CameraState | null
  /** Apply camera state. Queues as pending if camera not yet registered. */
  applyState: (state: CameraState) => void
  /** Reset camera to default position and target. */
  reset: () => void
}

export const useCameraStore = create<CameraStore>((set, get) => ({
  camera: null,
  pendingState: null,

  registerCamera: (camera) => {
    set({ camera })

    // Apply any pending camera state that was set before camera was available
    // This fixes the race condition when loading scenes via URL parameter
    if (camera) {
      const { pendingState } = get()
      const normalized = normalizeCameraState(pendingState)
      if (normalized) {
        camera.setPosition(...normalized.position)
        camera.setTarget(...normalized.target)
        set({ pendingState: null })
        if (import.meta.env.DEV) {
          console.log('[cameraStore] Applied pending camera state after camera registered')
        }
      } else if (pendingState) {
        set({ pendingState: null })
        if (import.meta.env.DEV) {
          console.warn('[cameraStore] Dropped invalid pending camera state')
        }
      }
    }
  },

  captureState: () => {
    const { camera } = get()
    if (!camera) return null

    const state = camera.getState()
    const normalized = normalizeCameraState(state)
    if (!normalized) {
      if (import.meta.env.DEV) {
        console.warn('[cameraStore] captureState received invalid camera coordinates')
      }
      return null
    }
    return normalized
  },

  applyState: (state) => {
    const { camera } = get()
    const normalized = normalizeCameraState(state)

    if (!normalized) {
      set({ pendingState: null })
      if (import.meta.env.DEV) {
        console.warn('[cameraStore] Ignoring invalid camera state')
      }
      return
    }

    // If camera isn't available yet, store as pending state
    // This handles the race condition when scene loads before WebGPUScene mounts
    if (!camera) {
      set({ pendingState: normalized })
      if (import.meta.env.DEV) {
        console.log('[cameraStore] Camera not ready, storing pending camera state')
      }
      return
    }

    camera.setPosition(...normalized.position)
    camera.setTarget(...normalized.target)
    set({ pendingState: null })
  },

  reset: () => {
    const { camera } = get()
    if (camera) {
      camera.setPosition(...DEFAULT_POSITION)
      camera.setTarget(...DEFAULT_TARGET)
    }
  },
}))
