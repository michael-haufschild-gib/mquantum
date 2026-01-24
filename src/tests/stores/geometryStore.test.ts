import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DIMENSION,
  MAX_DIMENSION,
  MIN_DIMENSION,
  useGeometryStore,
} from '@/stores/geometryStore'
import { useAnimationStore } from '@/stores/animationStore'
import { useRotationStore } from '@/stores/rotationStore'
import { useAppearanceStore } from '@/stores/appearanceStore'

describe('geometryStore (invariants)', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useAnimationStore.getState().reset()
    useRotationStore.getState().setDimension(DEFAULT_DIMENSION)
    useAppearanceStore.getState().reset()
  })

  it('setDimension clamps, floors, and updates rotation/animation stores (filters planes)', () => {
    useGeometryStore.getState().setDimension(4.9)
    expect(useGeometryStore.getState().dimension).toBe(4)
    expect(useRotationStore.getState().dimension).toBe(4)

    useGeometryStore.getState().setDimension(2)
    expect(useGeometryStore.getState().dimension).toBe(MIN_DIMENSION)

    useGeometryStore.getState().setDimension(999)
    expect(useGeometryStore.getState().dimension).toBe(MAX_DIMENSION)

    // Known invariant: animation planes must be filtered for new dimension.
    useGeometryStore.getState().setDimension(8)
    useAnimationStore.getState().animateAll(8)
    expect(useAnimationStore.getState().animatingPlanes.has('XV')).toBe(true)

    useGeometryStore.getState().setDimension(4)
    expect(useAnimationStore.getState().animatingPlanes.has('XV')).toBe(false)
  })

  it('rejects invalid object types and ignores types unavailable for the current dimension', () => {
    // Invalid type throws
    // @ts-expect-error intentional invalid input
    expect(() => useGeometryStore.getState().setObjectType('not-a-real-type')).toThrow(
      /Invalid object type/i
    )

    // Unavailable type is ignored (warns)
    useGeometryStore.getState().setDimension(3)
    useGeometryStore.getState().setObjectType('hypercube')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    useGeometryStore.getState().setObjectType('nested-torus') // requires >= 4
    expect(useGeometryStore.getState().objectType).toBe('hypercube')
    expect(warn).toHaveBeenCalled()
  })

  it('switching to a recommended-dimension object (mandelbulb) updates dimension and filters planes (regression)', () => {
    useGeometryStore.getState().setDimension(8)
    useAnimationStore.getState().animateAll(8)
    expect(useAnimationStore.getState().animatingPlanes.has('XV')).toBe(true)

    useGeometryStore.getState().setObjectType('mandelbulb') // recommended dimension 4
    expect(useGeometryStore.getState().dimension).toBe(4)
    expect(useRotationStore.getState().dimension).toBe(4)
    expect(useAnimationStore.getState().animatingPlanes.has('XV')).toBe(false)
  })

  it('raymarching fractals force facesVisible=true so they can render', () => {
    useAppearanceStore.getState().setFacesVisible(false)
    expect(useAppearanceStore.getState().facesVisible).toBe(false)

    useGeometryStore.getState().setObjectType('mandelbulb')
    expect(useAppearanceStore.getState().facesVisible).toBe(true)
  })
})
