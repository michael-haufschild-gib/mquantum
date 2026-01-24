import { renderHook, waitFor } from '@testing-library/react'
import { useGeometryGenerator } from '@/hooks/useGeometryGenerator'
import { useGeometryStore } from '@/stores/geometryStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { describe, it, expect, beforeEach } from 'vitest'
import { act, type ReactNode } from 'react'
import { DEFAULT_ROOT_SYSTEM_CONFIG } from '@/lib/geometry/extended'
import { ToastProvider } from '@/contexts/ToastContext'

// Wrapper component that provides ToastProvider context
const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>

// We will use the real stores, but we need to reset them
// Since they are persistent, we might need to manually set them to defaults

describe('useGeometryGenerator', () => {
  beforeEach(() => {
    // Reset stores to default state
    act(() => {
      useGeometryStore.setState({
        dimension: 3,
        objectType: 'hypercube',
      })
      useExtendedObjectStore.setState({
        // Reset extended object configs if needed, though defaults are usually fine
      })
    })
  })

  it('should return GeometryGeneratorResult with correct shape', () => {
    const { result } = renderHook(() => useGeometryGenerator(), { wrapper })

    // Check the return type has all expected properties
    expect(result.current).toHaveProperty('geometry')
    expect(result.current).toHaveProperty('dimension')
    expect(result.current).toHaveProperty('objectType')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('progress')
    expect(result.current).toHaveProperty('stage')
    expect(result.current).toHaveProperty('warnings')
  })

  it('should generate initial geometry (3D hypercube)', () => {
    const { result } = renderHook(() => useGeometryGenerator(), { wrapper })

    expect(result.current.dimension).toBe(3)
    expect(result.current.objectType).toBe('hypercube')
    expect(result.current.isLoading).toBe(false) // Sync generation is immediate
    expect(result.current.geometry).not.toBeNull()
    expect(result.current.geometry?.type).toBe('hypercube')
    expect(result.current.geometry?.vertices.length).toBe(8) // 2^3
  })

  it('should update geometry when dimension changes', () => {
    const { result } = renderHook(() => useGeometryGenerator(), { wrapper })

    act(() => {
      useGeometryStore.setState({ dimension: 4 })
    })

    expect(result.current.dimension).toBe(4)
    expect(result.current.geometry?.vertices.length).toBe(16) // 2^4
  })

  it('should update geometry when object type changes', () => {
    const { result } = renderHook(() => useGeometryGenerator(), { wrapper })

    act(() => {
      useGeometryStore.setState({ objectType: 'simplex', dimension: 3 })
    })

    expect(result.current.objectType).toBe('simplex')
    expect(result.current.geometry?.type).toBe('simplex')
    expect(result.current.geometry?.vertices.length).toBe(4) // n+1
  })

  it('should use extended object params', async () => {
    // This tests that the hook correctly pulls from extendedObjectStore
    // Root system is now worker-based (async), so we need to wait for geometry
    const { result } = renderHook(() => useGeometryGenerator(), { wrapper })

    act(() => {
      useGeometryStore.setState({ objectType: 'root-system', dimension: 3 })
      useExtendedObjectStore.setState({
        rootSystem: { ...DEFAULT_ROOT_SYSTEM_CONFIG, rootType: 'A', scale: 2.0 },
      })
    })

    expect(result.current.objectType).toBe('root-system')

    // Wait for async geometry generation to complete
    await waitFor(
      () => {
        expect(result.current.geometry).not.toBeNull()
      },
      { timeout: 5000 }
    )

    // Root system generates vertices for the selected root type
    expect(result.current.geometry?.vertices.length).toBeGreaterThan(0)
    expect(result.current.geometry?.type).toBe('root-system')
  })

  it('should not be loading for sync geometry types', async () => {
    const { result } = renderHook(() => useGeometryGenerator(), { wrapper })

    // For hypercube (sync), loading should be false
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.progress).toBe(100)
    expect(result.current.stage).toBe('complete')
  })
})
