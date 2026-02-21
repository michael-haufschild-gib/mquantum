import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCameraStore } from '@/stores/cameraStore'

/** Creates a mock CameraInstance matching the WebGPUCamera interface */
function createMockCamera(
  position: [number, number, number] = [0, 0, 5],
  target: [number, number, number] = [0, 0, 0]
) {
  const state = { position: [...position] as [number, number, number], target: [...target] as [number, number, number] }
  return {
    getState: vi.fn(() => ({ position: [...state.position] as [number, number, number], target: [...state.target] as [number, number, number] })),
    setPosition: vi.fn((x: number, y: number, z: number) => {
      state.position = [x, y, z]
    }),
    setTarget: vi.fn((x: number, y: number, z: number) => {
      state.target = [x, y, z]
    }),
  }
}

describe('useCameraStore', () => {
  beforeEach(() => {
    useCameraStore.setState({ camera: null, pendingState: null })
  })

  describe('registerCamera', () => {
    it('stores the camera instance', () => {
      const camera = createMockCamera()
      useCameraStore.getState().registerCamera(camera)
      expect(useCameraStore.getState().camera).toBe(camera)
    })

    it('clears camera when called with null', () => {
      const camera = createMockCamera()
      useCameraStore.getState().registerCamera(camera)
      useCameraStore.getState().registerCamera(null)
      expect(useCameraStore.getState().camera).toBeNull()
    })

    it('flushes pending state when camera becomes available', () => {
      const pending = { position: [1, 2, 3] as [number, number, number], target: [4, 5, 6] as [number, number, number] }
      useCameraStore.getState().applyState(pending)
      expect(useCameraStore.getState().pendingState).toEqual(pending)

      const camera = createMockCamera()
      useCameraStore.getState().registerCamera(camera)

      expect(camera.setPosition).toHaveBeenCalledWith(1, 2, 3)
      expect(camera.setTarget).toHaveBeenCalledWith(4, 5, 6)
      expect(useCameraStore.getState().pendingState).toBeNull()
    })

    it('does not call setPosition/setTarget when no pending state', () => {
      const camera = createMockCamera()
      useCameraStore.getState().registerCamera(camera)
      expect(camera.setPosition).not.toHaveBeenCalled()
      expect(camera.setTarget).not.toHaveBeenCalled()
    })
  })

  describe('captureState', () => {
    it('returns null when no camera registered', () => {
      expect(useCameraStore.getState().captureState()).toBeNull()
    })

    it('returns camera position and target', () => {
      const camera = createMockCamera([1, 2, 3], [4, 5, 6])
      useCameraStore.getState().registerCamera(camera)

      const state = useCameraStore.getState().captureState()
      expect(state).toEqual({
        position: [1, 2, 3],
        target: [4, 5, 6],
      })
    })

    it('returns a copy, not a reference to camera internal state', () => {
      const camera = createMockCamera([1, 2, 3], [4, 5, 6])
      useCameraStore.getState().registerCamera(camera)

      const state1 = useCameraStore.getState().captureState()!
      const state2 = useCameraStore.getState().captureState()!
      expect(state1.position).not.toBe(state2.position)
      expect(state1.target).not.toBe(state2.target)
    })
  })

  describe('applyState', () => {
    it('queues as pending when camera not registered', () => {
      const state = { position: [1, 2, 3] as [number, number, number], target: [4, 5, 6] as [number, number, number] }
      useCameraStore.getState().applyState(state)
      expect(useCameraStore.getState().pendingState).toEqual(state)
    })

    it('applies immediately when camera is registered', () => {
      const camera = createMockCamera()
      useCameraStore.getState().registerCamera(camera)
      camera.setPosition.mockClear()
      camera.setTarget.mockClear()

      useCameraStore.getState().applyState({
        position: [10, 20, 30],
        target: [1, 2, 3],
      })

      expect(camera.setPosition).toHaveBeenCalledWith(10, 20, 30)
      expect(camera.setTarget).toHaveBeenCalledWith(1, 2, 3)
      expect(useCameraStore.getState().pendingState).toBeNull()
    })
  })

  describe('reset', () => {
    it('resets camera to default position and target', () => {
      const camera = createMockCamera([99, 99, 99], [99, 99, 99])
      useCameraStore.getState().registerCamera(camera)
      camera.setPosition.mockClear()
      camera.setTarget.mockClear()

      useCameraStore.getState().reset()

      expect(camera.setPosition).toHaveBeenCalledWith(0, 3.125, 7.5)
      expect(camera.setTarget).toHaveBeenCalledWith(0, 0, 0)
    })

    it('is a no-op when no camera registered', () => {
      // Should not throw
      useCameraStore.getState().reset()
    })
  })
})
