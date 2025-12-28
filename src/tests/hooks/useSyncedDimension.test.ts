import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSyncedDimension } from '@/hooks/useSyncedDimension'
import { useGeometryStore } from '@/stores/geometryStore'
import { useRotationStore } from '@/stores/rotationStore'
import { useTransformStore } from '@/stores/transformStore'
import { useAnimationStore } from '@/stores/animationStore'
import { usePerformanceStore } from '@/stores/performanceStore'

describe('useSyncedDimension', () => {
  beforeEach(() => {
    // Ensure scene loading is off (this is what the hook checks)
    usePerformanceStore.getState().setIsLoadingScene(false)
    usePerformanceStore.getState().setSceneTransitioning(false)

    // Reset all stores to their defaults
    useGeometryStore.getState().reset() // Sets dimension to 3 (default)
    useRotationStore.setState({ dimension: 3, rotations: new Map(), version: 0 })
    useTransformStore.setState({ dimension: 3, uniformScale: 1, perAxisScale: [1, 1, 1], scaleLocked: true })
    useAnimationStore.getState().reset()
  })

  it('keeps rotation + transform dimensions in sync with geometry dimension', () => {
    // Render the hook
    renderHook(() => useSyncedDimension())

    // Initial sync should have happened (dimension 3)
    expect(useRotationStore.getState().dimension).toBe(3)
    expect(useTransformStore.getState().dimension).toBe(3)

    // Change geometry dimension to 7
    // Note: The geometry store's setDimension syncs all stores directly
    act(() => {
      useGeometryStore.getState().setDimension(7)
    })

    // Stores should be synced immediately by the geometry store's setDimension
    expect(useRotationStore.getState().dimension).toBe(7)
    expect(useTransformStore.getState().dimension).toBe(7)
  })

  it('filters animation planes when geometry dimension changes', () => {
    renderHook(() => useSyncedDimension())

    act(() => {
      useGeometryStore.getState().setDimension(8)
      useAnimationStore.getState().animateAll(8)
    })
    expect(useAnimationStore.getState().animatingPlanes.has('XV')).toBe(true)

    act(() => {
      useGeometryStore.getState().setDimension(4)
    })
    expect(useAnimationStore.getState().animatingPlanes.has('XV')).toBe(false)
  })

  it('resets rotations when object type changes', () => {
    // Start at dimension 4 with hypercube
    act(() => {
      useGeometryStore.getState().setDimension(4)
      useGeometryStore.getState().setObjectType('hypercube')
    })

    // Render the hook after initial setup
    const { rerender } = renderHook(() => useSyncedDimension())

    // Set some rotations (manually, after initial sync happened)
    useRotationStore.getState().setRotation('XY', Math.PI / 4)
    useRotationStore.getState().setRotation('XW', Math.PI / 3)
    expect(useRotationStore.getState().rotations.get('XY')).not.toBe(0)

    // Change object type - this should trigger the hook to reset rotations
    act(() => {
      useGeometryStore.getState().setObjectType('simplex')
    })
    rerender()

    // Rotations should be reset to 0
    for (const [, angle] of useRotationStore.getState().rotations) {
      expect(angle).toBe(0)
    }
  })

  describe('scene loading behavior', () => {
    it('skips rotation reset during scene loading', () => {
      // Start at dimension 4 with hypercube
      act(() => {
        useGeometryStore.getState().setDimension(4)
        useGeometryStore.getState().setObjectType('hypercube')
      })

      const { rerender } = renderHook(() => useSyncedDimension())

      // Set some rotations
      useRotationStore.getState().setRotation('XY', Math.PI / 4)
      useRotationStore.getState().setRotation('XW', Math.PI / 3)
      const initialXY = useRotationStore.getState().rotations.get('XY')
      expect(initialXY).not.toBe(0)

      // Simulate scene loading starting BEFORE changing object type
      usePerformanceStore.getState().setIsLoadingScene(true)

      // Change object type during scene load
      act(() => {
        useGeometryStore.getState().setObjectType('simplex')
      })
      rerender()

      // Rotations should be preserved during scene loading
      expect(useRotationStore.getState().rotations.get('XY')).toBe(initialXY)
    })

    it('skips dimension sync during scene loading', () => {
      // Start with dimension 4
      act(() => {
        useGeometryStore.getState().setDimension(4)
      })

      renderHook(() => useSyncedDimension())

      // Verify dimensions are 4 (synced by geometry store's setDimension)
      expect(useRotationStore.getState().dimension).toBe(4)
      expect(useTransformStore.getState().dimension).toBe(4)

      // Simulate scene loading starting BEFORE changing dimension
      usePerformanceStore.getState().setIsLoadingScene(true)

      // Manually set rotation/transform to 4 (to test the hook skip)
      useRotationStore.setState({ dimension: 4 })
      useTransformStore.setState({ dimension: 4 })

      // Change dimension during scene load via direct setState (not through store action)
      // This simulates what happens during scene loading where stores are restored directly
      useGeometryStore.setState({ dimension: 6 })

      // The hook should have skipped the sync (isLoadingScene=true)
      // So rotation/transform dimensions should still be 4
      expect(useRotationStore.getState().dimension).toBe(4)
      expect(useTransformStore.getState().dimension).toBe(4)
    })

    it('resumes normal sync after scene loading ends', () => {
      // Start with dimension 4
      act(() => {
        useGeometryStore.getState().setDimension(4)
      })

      const { rerender } = renderHook(() => useSyncedDimension())

      // Verify initial sync (geometry store syncs during setDimension)
      expect(useRotationStore.getState().dimension).toBe(4)

      // Simulate scene loading - set stores to different values
      usePerformanceStore.getState().setIsLoadingScene(true)
      useRotationStore.setState({ dimension: 4 })
      useTransformStore.setState({ dimension: 4 })
      useGeometryStore.setState({ dimension: 5 })

      // Verify sync was skipped
      expect(useRotationStore.getState().dimension).toBe(4)

      // End scene loading
      usePerformanceStore.getState().setIsLoadingScene(false)

      // Change dimension again (normal operation - uses store action which syncs directly)
      act(() => {
        useGeometryStore.getState().setDimension(6)
      })
      rerender()

      // Dimension should be 6 (synced by geometry store's setDimension)
      expect(useRotationStore.getState().dimension).toBe(6)
      expect(useTransformStore.getState().dimension).toBe(6)
    })

    it('resets rotations after scene loading when object type changes again', () => {
      // Start with dimension 4 and hypercube
      act(() => {
        useGeometryStore.getState().setDimension(4)
        useGeometryStore.getState().setObjectType('hypercube')
      })

      const { rerender } = renderHook(() => useSyncedDimension())

      // Set rotations
      useRotationStore.getState().setRotation('XY', Math.PI / 2)
      expect(useRotationStore.getState().rotations.get('XY')).not.toBe(0)

      // During scene loading, change to simplex (should preserve rotations)
      usePerformanceStore.getState().setIsLoadingScene(true)

      act(() => {
        useGeometryStore.getState().setObjectType('simplex')
      })
      rerender()

      expect(useGeometryStore.getState().objectType).toBe('simplex')
      expect(useRotationStore.getState().rotations.get('XY')).not.toBe(0)

      // End scene loading
      usePerformanceStore.getState().setIsLoadingScene(false)

      // Now change object type again - should reset rotations
      act(() => {
        useGeometryStore.getState().setObjectType('cross-polytope')
      })
      rerender()

      // Rotations should be reset to 0
      for (const [, angle] of useRotationStore.getState().rotations) {
        expect(angle).toBe(0)
      }
    })
  })
})
