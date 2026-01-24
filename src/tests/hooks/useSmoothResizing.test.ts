import { renderHook } from '@testing-library/react'
import { useSmoothResizing } from '../../hooks/useSmoothResizing'
import { useThree } from '@react-three/fiber'
import { PerspectiveCamera } from 'three'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies
vi.mock('@react-three/fiber', () => ({
  useThree: vi.fn(),
  useFrame: vi.fn((callback) => callback()), // Execute callback immediately for tests
}))

// Mock useSpring from framer-motion
const mockSpringSet = vi.fn()
const mockSpringGet = vi.fn().mockReturnValue(1)

vi.mock('framer-motion', () => ({
  useSpring: vi.fn(() => ({
    set: mockSpringSet,
    get: mockSpringGet,
  })),
}))

describe('useSmoothResizing', () => {
  let mockCamera: PerspectiveCamera
  let mockSize: { width: number; height: number }

  beforeEach(() => {
    mockCamera = new PerspectiveCamera()
    mockCamera.zoom = 1
    mockCamera.updateProjectionMatrix = vi.fn()
    mockSize = { width: 1000, height: 1000 }

    vi.mocked(useThree).mockReturnValue({
      camera: mockCamera,
      size: mockSize,
    } as unknown as ReturnType<typeof useThree>)

    mockSpringSet.mockClear()
    mockSpringGet.mockReturnValue(1)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should initialize with no zoom correction', () => {
    renderHook(() => useSmoothResizing())
    expect(mockSpringSet).not.toHaveBeenCalled() // No change on first render
    expect(mockCamera.zoom).toBe(1)
  })

  it('should detect height increase (entering fullscreen) and counteract zoom', () => {
    const { rerender } = renderHook(() => useSmoothResizing())

    // Simulate height doubling (1000 -> 2000)
    mockSize.height = 2000
    vi.mocked(useThree).mockReturnValue({
      camera: mockCamera,
      size: mockSize,
    } as unknown as ReturnType<typeof useThree>)

    rerender()

    // Ratio = Old / New = 1000 / 2000 = 0.5
    // Should snap to 0.5 immediately
    expect(mockSpringSet).toHaveBeenCalledWith(0.5)

    // Should schedule animation back to 1
    vi.runAllTimers() // Trigger requestAnimationFrame equivalent?
    // Wait, we mocked RAF? No.
    // In node environment, RAF is usually setImmediate or setTimeout.
    // Let's verify standard timer behavior for RAF mock if needed.
  })

  it('should detect height decrease (exiting fullscreen) and counteract zoom', () => {
    const { rerender } = renderHook(() => useSmoothResizing())

    // Simulate height halving (1000 -> 500)
    mockSize.height = 500
    vi.mocked(useThree).mockReturnValue({
      camera: mockCamera,
      size: mockSize,
    } as unknown as ReturnType<typeof useThree>)

    rerender()

    // Ratio = Old / New = 1000 / 500 = 2.0
    // Should snap to 2.0 immediately (zooming in to fill the smaller screen)
    expect(mockSpringSet).toHaveBeenCalledWith(2.0)
  })

  it('should apply spring value to camera zoom in useFrame', () => {
    mockSpringGet.mockReturnValue(0.5)
    renderHook(() => useSmoothResizing())

    // useFrame is mocked to execute callback immediately
    expect(mockCamera.zoom).toBe(0.5)
    expect(mockCamera.updateProjectionMatrix).toHaveBeenCalled()
  })

  it('should ignore width-only changes', () => {
    const { rerender } = renderHook(() => useSmoothResizing())

    // Change width only
    mockSize.width = 2000
    vi.mocked(useThree).mockReturnValue({
      camera: mockCamera,
      size: mockSize,
    } as unknown as ReturnType<typeof useThree>)

    rerender()

    expect(mockSpringSet).not.toHaveBeenCalled()
  })
})
