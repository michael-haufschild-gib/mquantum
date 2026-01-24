/**
 * Tests for useCameraMovement hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { MutableRefObject } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

// Mock @react-three/fiber
const mockUseThree = vi.fn()
const mockUseFrame = vi.fn()

vi.mock('@react-three/fiber', () => ({
  useThree: () => mockUseThree(),
  useFrame: (callback: (state: unknown) => void) => mockUseFrame(callback),
}))

// Import after mocking
import {
  useCameraMovement,
  CAMERA_MOVEMENT_SHORTCUTS,
  CAMERA_ROTATION_SHORTCUTS,
  CAMERA_ORIGIN_SHORTCUTS,
} from '@/hooks/useCameraMovement'
import { Vector3, PerspectiveCamera } from 'three'

describe('useCameraMovement', () => {
  let mockCamera: PerspectiveCamera
  let mockControlsRef: MutableRefObject<Partial<OrbitControlsImpl> | null>
  let frameCallback: ((state: { camera: PerspectiveCamera }) => void) | null

  beforeEach(() => {
    // Create mock camera
    mockCamera = new PerspectiveCamera()
    mockCamera.position.set(0, 0, 5)
    mockCamera.lookAt(0, 0, 0)
    mockCamera.up.set(0, 1, 0)

    // Create mock controls ref with target
    mockControlsRef = {
      current: {
        target: new Vector3(0, 0, 0),
      },
    }

    // Set up useThree mock to return camera
    mockUseThree.mockReturnValue({ camera: mockCamera })

    // Capture the frame callback
    frameCallback = null
    mockUseFrame.mockImplementation((callback) => {
      frameCallback = callback
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    frameCallback = null
  })

  it('should register keyboard event listeners when enabled', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    renderHook(() => useCameraMovement({ enabled: true }))

    expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(addEventListenerSpy).toHaveBeenCalledWith('keyup', expect.any(Function))
    expect(addEventListenerSpy).toHaveBeenCalledWith('blur', expect.any(Function))
  })

  it('should not register event listeners when disabled', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    renderHook(() => useCameraMovement({ enabled: false }))

    // Should not have keydown/keyup listeners (useFrame is always registered)
    const keydownCalls = addEventListenerSpy.mock.calls.filter((call) => call[0] === 'keydown')
    expect(keydownCalls.length).toBe(0)
  })

  it('should cleanup event listeners on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useCameraMovement({ enabled: true }))

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('keyup', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('blur', expect.any(Function))
  })

  it('should move camera forward along sight vector when W is pressed', () => {
    renderHook(() =>
      useCameraMovement({
        enabled: true,
        speed: 1,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    // Get initial distance to origin (where camera is looking)
    const initialDistance = mockCamera.position.length()

    // Simulate W key press
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))
    })

    // Trigger frame update
    act(() => {
      if (frameCallback) {
        frameCallback({ camera: mockCamera })
      }
    })

    // Camera should move closer to what it's looking at (origin)
    const newDistance = mockCamera.position.length()
    expect(newDistance).toBeLessThan(initialDistance)
  })

  it('should move camera backward along sight vector when S is pressed', () => {
    renderHook(() =>
      useCameraMovement({
        enabled: true,
        speed: 1,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    // Get initial distance to origin (where camera is looking)
    const initialDistance = mockCamera.position.length()

    // Simulate S key press
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }))
    })

    // Trigger frame update
    act(() => {
      if (frameCallback) {
        frameCallback({ camera: mockCamera })
      }
    })

    // Camera should move further from what it's looking at (origin)
    const newDistance = mockCamera.position.length()
    expect(newDistance).toBeGreaterThan(initialDistance)
  })

  it('should strafe camera left when A is pressed', () => {
    renderHook(() =>
      useCameraMovement({
        enabled: true,
        speed: 1,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    const initialX = mockCamera.position.x

    // Simulate A key press
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    })

    // Trigger frame update
    act(() => {
      if (frameCallback) {
        frameCallback({ camera: mockCamera })
      }
    })

    // Camera should strafe left (negative X)
    expect(mockCamera.position.x).toBeLessThan(initialX)
  })

  it('should strafe camera right when D is pressed', () => {
    renderHook(() =>
      useCameraMovement({
        enabled: true,
        speed: 1,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    const initialX = mockCamera.position.x

    // Simulate D key press
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }))
    })

    // Trigger frame update
    act(() => {
      if (frameCallback) {
        frameCallback({ camera: mockCamera })
      }
    })

    // Camera should strafe right (positive X)
    expect(mockCamera.position.x).toBeGreaterThan(initialX)
  })

  it('should stop moving when key is released', () => {
    renderHook(() =>
      useCameraMovement({
        enabled: true,
        speed: 1,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    // Press W key
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))
    })

    // Release W key
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }))
    })

    // Store position before frame
    const positionBefore = mockCamera.position.z

    // Trigger frame update
    act(() => {
      if (frameCallback) {
        frameCallback({ camera: mockCamera })
      }
    })

    // Camera should not move (no keys pressed)
    expect(mockCamera.position.z).toBe(positionBefore)
  })

  it('should handle multiple keys pressed simultaneously', () => {
    renderHook(() =>
      useCameraMovement({
        enabled: true,
        speed: 1,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    const initialDistance = mockCamera.position.length()
    const initialX = mockCamera.position.x

    // Press W and D together (forward-right diagonal)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }))
    })

    // Trigger frame update
    act(() => {
      if (frameCallback) {
        frameCallback({ camera: mockCamera })
      }
    })

    // Camera should move both forward (closer to target) and right
    expect(mockCamera.position.length()).toBeLessThan(initialDistance) // Forward (closer)
    expect(mockCamera.position.x).toBeGreaterThan(initialX) // Right
  })

  it('should not move camera when typing in input field', () => {
    renderHook(() =>
      useCameraMovement({
        enabled: true,
        speed: 1,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    const initialZ = mockCamera.position.z

    // Create input element and make it the event target
    const input = document.createElement('input')
    document.body.appendChild(input)

    // Simulate W key press with input as target
    const event = new KeyboardEvent('keydown', { key: 'w', bubbles: true })
    Object.defineProperty(event, 'target', { value: input })

    act(() => {
      window.dispatchEvent(event)
    })

    // Trigger frame update
    act(() => {
      if (frameCallback) {
        frameCallback({ camera: mockCamera })
      }
    })

    // Camera should not move
    expect(mockCamera.position.z).toBe(initialZ)

    document.body.removeChild(input)
  })

  it('should update OrbitControls target when camera moves', () => {
    renderHook(() =>
      useCameraMovement({
        enabled: true,
        speed: 1,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    const initialTargetZ = mockControlsRef.current?.target?.z ?? 0

    // Press W key
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))
    })

    // Trigger frame update
    act(() => {
      if (frameCallback) {
        frameCallback({ camera: mockCamera })
      }
    })

    // Target should also move forward
    expect(mockControlsRef.current?.target?.z).toBeLessThan(initialTargetZ)
  })

  it('should clear keys when window loses focus', () => {
    renderHook(() =>
      useCameraMovement({
        enabled: true,
        speed: 1,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    // Press W key
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))
    })

    // Window loses focus
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })

    // Store position before frame
    const positionBefore = mockCamera.position.z

    // Trigger frame update
    act(() => {
      if (frameCallback) {
        frameCallback({ camera: mockCamera })
      }
    })

    // Camera should not move (keys cleared on blur)
    expect(mockCamera.position.z).toBe(positionBefore)
  })

  it('should handle uppercase keys', () => {
    renderHook(() =>
      useCameraMovement({
        enabled: true,
        speed: 1,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    const initialZ = mockCamera.position.z

    // Press W key with caps lock (uppercase)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'W' }))
    })

    // Trigger frame update
    act(() => {
      if (frameCallback) {
        frameCallback({ camera: mockCamera })
      }
    })

    // Camera should still move forward
    expect(mockCamera.position.z).toBeLessThan(initialZ)
  })

  // Shift+WASD Rotation Tests
  it('should rotate camera up when Shift+W is pressed', () => {
    renderHook(() =>
      useCameraMovement({
        enabled: true,
        rotationSpeed: 0.1,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    const initialY = mockCamera.position.y
    const initialDistance = mockCamera.position.length()

    // Press Shift key then W key
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))
    })

    // Trigger frame update
    act(() => {
      if (frameCallback) {
        frameCallback({ camera: mockCamera })
      }
    })

    // Camera should rotate up (Y position increases while maintaining distance)
    expect(mockCamera.position.y).toBeGreaterThan(initialY)
    // Distance should remain approximately the same (rotation, not movement)
    expect(mockCamera.position.length()).toBeCloseTo(initialDistance, 1)
  })

  it('should rotate camera down when Shift+S is pressed', () => {
    // Position camera above the target to have room to rotate down
    mockCamera.position.set(0, 3, 4)
    mockCamera.lookAt(0, 0, 0)

    renderHook(() =>
      useCameraMovement({
        enabled: true,
        rotationSpeed: 0.1,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    const initialY = mockCamera.position.y
    const initialDistance = mockCamera.position.length()

    // Press Shift key then S key
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }))
    })

    // Trigger frame update
    act(() => {
      if (frameCallback) {
        frameCallback({ camera: mockCamera })
      }
    })

    // Camera should rotate down (Y position decreases)
    expect(mockCamera.position.y).toBeLessThan(initialY)
    // Distance should remain approximately the same
    expect(mockCamera.position.length()).toBeCloseTo(initialDistance, 1)
  })

  it('should rotate camera left when Shift+A is pressed', () => {
    renderHook(() =>
      useCameraMovement({
        enabled: true,
        rotationSpeed: 0.1,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    const initialX = mockCamera.position.x
    const initialDistance = mockCamera.position.length()

    // Press Shift key then A key
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    })

    // Trigger frame update
    act(() => {
      if (frameCallback) {
        frameCallback({ camera: mockCamera })
      }
    })

    // Camera should rotate left (X position changes)
    expect(mockCamera.position.x).not.toBe(initialX)
    // Distance should remain approximately the same
    expect(mockCamera.position.length()).toBeCloseTo(initialDistance, 1)
  })

  it('should rotate camera right when Shift+D is pressed', () => {
    renderHook(() =>
      useCameraMovement({
        enabled: true,
        rotationSpeed: 0.1,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    const initialX = mockCamera.position.x
    const initialDistance = mockCamera.position.length()

    // Press Shift key then D key
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }))
    })

    // Trigger frame update
    act(() => {
      if (frameCallback) {
        frameCallback({ camera: mockCamera })
      }
    })

    // Camera should rotate right (X position changes)
    expect(mockCamera.position.x).not.toBe(initialX)
    // Distance should remain approximately the same
    expect(mockCamera.position.length()).toBeCloseTo(initialDistance, 1)
  })

  it('should move camera when Shift is released', () => {
    renderHook(() =>
      useCameraMovement({
        enabled: true,
        speed: 1,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    // Press Shift and W (rotation mode)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))
    })

    // Release Shift (should switch to movement mode)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }))
    })

    const initialDistance = mockCamera.position.length()

    // Trigger frame update - should now move, not rotate
    act(() => {
      if (frameCallback) {
        frameCallback({ camera: mockCamera })
      }
    })

    // Camera should move forward (closer to target)
    expect(mockCamera.position.length()).toBeLessThan(initialDistance)
  })

  it('should clear shift state when window loses focus', () => {
    renderHook(() =>
      useCameraMovement({
        enabled: true,
        speed: 1,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    // Press Shift and W
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))
    })

    // Window loses focus
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })

    const positionBefore = mockCamera.position.clone()

    // Trigger frame update
    act(() => {
      if (frameCallback) {
        frameCallback({ camera: mockCamera })
      }
    })

    // Camera should not move or rotate (all state cleared on blur)
    expect(mockCamera.position.equals(positionBefore)).toBe(true)
  })

  // "0" key tests - Move to origin
  it('should move camera to origin when 0 is pressed', () => {
    mockCamera.position.set(5, 3, 2)

    renderHook(() =>
      useCameraMovement({
        enabled: true,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    // Press 0 key (using code for keyboard-layout independence)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit0', key: '0' }))
    })

    // Camera should be at origin
    expect(mockCamera.position.x).toBeCloseTo(0)
    expect(mockCamera.position.y).toBeCloseTo(0)
    expect(mockCamera.position.z).toBeCloseTo(0)
  })

  it('should update target when camera moves to origin and target is also at origin', () => {
    mockCamera.position.set(5, 3, 2)
    mockControlsRef.current!.target = new Vector3(0, 0, 0)

    renderHook(() =>
      useCameraMovement({
        enabled: true,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    // Press 0 key
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit0', key: '0' }))
    })

    // Target should be moved so camera has something to look at
    const target = mockControlsRef.current?.target
    expect(target).toBeDefined()
    expect(target!.length()).toBeGreaterThan(0)
  })

  // "Shift+0" key tests - Look at origin
  it('should make camera look at origin when Shift+0 is pressed', () => {
    mockCamera.position.set(5, 3, 2)
    mockControlsRef.current!.target = new Vector3(10, 10, 10)

    renderHook(() =>
      useCameraMovement({
        enabled: true,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    // Press Shift+0 (using shiftKey property for keyboard-layout independence)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit0', shiftKey: true }))
    })

    // Target should be at origin
    const target = mockControlsRef.current?.target
    expect(target?.x).toBeCloseTo(0)
    expect(target?.y).toBeCloseTo(0)
    expect(target?.z).toBeCloseTo(0)

    // Camera position should not change
    expect(mockCamera.position.x).toBeCloseTo(5)
    expect(mockCamera.position.y).toBeCloseTo(3)
    expect(mockCamera.position.z).toBeCloseTo(2)
  })

  it('should move camera to default position when at origin and Shift+0 is pressed (edge case)', () => {
    // Camera is at origin
    mockCamera.position.set(0, 0, 0)
    mockControlsRef.current!.target = new Vector3(1, 1, 1)

    renderHook(() =>
      useCameraMovement({
        enabled: true,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    // Press Shift+0
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit0', shiftKey: true }))
    })

    // Camera should be moved to default position (0, 0, 5)
    expect(mockCamera.position.x).toBeCloseTo(0)
    expect(mockCamera.position.y).toBeCloseTo(0)
    expect(mockCamera.position.z).toBeCloseTo(5)

    // Target should be at origin
    const target = mockControlsRef.current?.target
    expect(target?.x).toBeCloseTo(0)
    expect(target?.y).toBeCloseTo(0)
    expect(target?.z).toBeCloseTo(0)
  })

  it('should not trigger 0 key when typing in input field', () => {
    mockCamera.position.set(5, 3, 2)

    renderHook(() =>
      useCameraMovement({
        enabled: true,
        controlsRef: mockControlsRef as MutableRefObject<OrbitControlsImpl | null>,
      })
    )

    // Create input element
    const input = document.createElement('input')
    document.body.appendChild(input)

    // Simulate 0 key press with input as target
    const event = new KeyboardEvent('keydown', { code: 'Digit0', key: '0', bubbles: true })
    Object.defineProperty(event, 'target', { value: input })

    act(() => {
      window.dispatchEvent(event)
    })

    // Camera should not move
    expect(mockCamera.position.x).toBeCloseTo(5)
    expect(mockCamera.position.y).toBeCloseTo(3)
    expect(mockCamera.position.z).toBeCloseTo(2)

    document.body.removeChild(input)
  })
})

describe('CAMERA_MOVEMENT_SHORTCUTS', () => {
  it('should export all WASD shortcuts', () => {
    expect(CAMERA_MOVEMENT_SHORTCUTS).toHaveLength(4)

    const keys = CAMERA_MOVEMENT_SHORTCUTS.map((s) => s.key)
    expect(keys).toContain('w')
    expect(keys).toContain('a')
    expect(keys).toContain('s')
    expect(keys).toContain('d')
  })

  it('should have descriptive labels', () => {
    const wShortcut = CAMERA_MOVEMENT_SHORTCUTS.find((s) => s.key === 'w')
    expect(wShortcut?.description).toContain('forward')

    const aShortcut = CAMERA_MOVEMENT_SHORTCUTS.find((s) => s.key === 'a')
    expect(aShortcut?.description).toContain('left')

    const sShortcut = CAMERA_MOVEMENT_SHORTCUTS.find((s) => s.key === 's')
    expect(sShortcut?.description).toContain('backward')

    const dShortcut = CAMERA_MOVEMENT_SHORTCUTS.find((s) => s.key === 'd')
    expect(dShortcut?.description).toContain('right')
  })
})

describe('CAMERA_ROTATION_SHORTCUTS', () => {
  it('should export all Shift+WASD shortcuts', () => {
    expect(CAMERA_ROTATION_SHORTCUTS).toHaveLength(4)

    const keys = CAMERA_ROTATION_SHORTCUTS.map((s) => s.key)
    expect(keys).toContain('w')
    expect(keys).toContain('a')
    expect(keys).toContain('s')
    expect(keys).toContain('d')
  })

  it('should have shift modifier on all shortcuts', () => {
    CAMERA_ROTATION_SHORTCUTS.forEach((shortcut) => {
      expect(shortcut.shift).toBe(true)
    })
  })

  it('should have descriptive labels for rotation', () => {
    const wShortcut = CAMERA_ROTATION_SHORTCUTS.find((s) => s.key === 'w')
    expect(wShortcut?.description).toContain('up')

    const aShortcut = CAMERA_ROTATION_SHORTCUTS.find((s) => s.key === 'a')
    expect(aShortcut?.description).toContain('left')

    const sShortcut = CAMERA_ROTATION_SHORTCUTS.find((s) => s.key === 's')
    expect(sShortcut?.description).toContain('down')

    const dShortcut = CAMERA_ROTATION_SHORTCUTS.find((s) => s.key === 'd')
    expect(dShortcut?.description).toContain('right')
  })
})

describe('CAMERA_ORIGIN_SHORTCUTS', () => {
  it('should export origin shortcuts', () => {
    expect(CAMERA_ORIGIN_SHORTCUTS).toHaveLength(2)
  })

  it('should have 0 key for move to origin', () => {
    const moveShortcut = CAMERA_ORIGIN_SHORTCUTS.find((s) => s.key === '0' && !('shift' in s))
    expect(moveShortcut).toBeDefined()
    expect(moveShortcut?.description).toContain('origin')
  })

  it('should have Shift+0 for look at origin', () => {
    const lookShortcut = CAMERA_ORIGIN_SHORTCUTS.find(
      (s) => s.key === '0' && 'shift' in s && s.shift
    )
    expect(lookShortcut).toBeDefined()
    expect(lookShortcut?.description).toContain('Look')
    expect(lookShortcut?.description).toContain('origin')
  })
})
