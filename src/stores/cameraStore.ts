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

export interface CameraState {
  position: [number, number, number]
  target: [number, number, number]
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
      if (pendingState) {
        camera.setPosition(...pendingState.position)
        camera.setTarget(...pendingState.target)
        set({ pendingState: null })
        if (import.meta.env.DEV) {
          console.log('[cameraStore] Applied pending camera state after camera registered')
        }
      }
    }
  },

  captureState: () => {
    const { camera } = get()
    if (!camera) return null

    const state = camera.getState()
    return {
      position: [...state.position],
      target: [...state.target],
    }
  },

  applyState: (state) => {
    const { camera } = get()

    // If camera isn't available yet, store as pending state
    // This handles the race condition when scene loads before WebGPUScene mounts
    if (!camera) {
      set({ pendingState: state })
      if (import.meta.env.DEV) {
        console.log('[cameraStore] Camera not ready, storing pending camera state')
      }
      return
    }

    camera.setPosition(...state.position)
    camera.setTarget(...state.target)
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
