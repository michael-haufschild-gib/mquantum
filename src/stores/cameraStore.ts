import { create } from 'zustand'
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

interface CameraState {
  position: [number, number, number]
  target: [number, number, number]
}

interface CameraStore {
  controls: OrbitControlsImpl | null
  savedState: CameraState | null
  /** Pending camera state to apply when controls become available (race condition fix) */
  pendingState: CameraState | null

  registerControls: (controls: OrbitControlsImpl | null) => void
  captureState: () => CameraState | null
  applyState: (state: CameraState) => void
  reset: () => void
}

export const useCameraStore = create<CameraStore>((set, get) => ({
  controls: null,
  savedState: null,
  pendingState: null,

  registerControls: (controls) => {
    set({ controls })

    // Apply any pending camera state that was set before controls were available
    // This fixes the race condition when loading scenes via URL parameter
    if (controls) {
      const { pendingState } = get()
      if (pendingState) {
        controls.object.position.set(...pendingState.position)
        controls.target.set(...pendingState.target)
        controls.update()
        set({ pendingState: null })
        if (import.meta.env.DEV) {
          console.log('[cameraStore] Applied pending camera state after controls registered')
        }
      }
    }
  },

  captureState: () => {
    const { controls } = get()
    if (!controls) return null

    const position: [number, number, number] = [
      controls.object.position.x,
      controls.object.position.y,
      controls.object.position.z,
    ]

    const target: [number, number, number] = [
      controls.target.x,
      controls.target.y,
      controls.target.z,
    ]

    return { position, target }
  },

  applyState: (state) => {
    const { controls } = get()

    // If controls aren't available yet, store as pending state
    // This handles the race condition when scene loads before CameraController mounts
    if (!controls) {
      set({ pendingState: state })
      if (import.meta.env.DEV) {
        console.log('[cameraStore] Controls not ready, storing pending camera state')
      }
      return
    }

    controls.object.position.set(...state.position)
    controls.target.set(...state.target)
    controls.update()
    set({ pendingState: null }) // Clear any pending state
  },

  reset: () => {
    const { controls } = get()
    if (controls) {
      controls.reset()
    }
  },
}))
