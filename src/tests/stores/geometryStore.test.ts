import { beforeEach, describe, expect, it } from 'vitest'
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

  it('ignores non-finite dimension updates', () => {
    useGeometryStore.getState().setDimension(5)
    useGeometryStore.getState().setDimension(Number.NaN)

    expect(useGeometryStore.getState().dimension).toBe(5)
    expect(useRotationStore.getState().dimension).toBe(5)
  })

  it('rejects invalid object types', () => {
    // Invalid type throws
    // @ts-expect-error intentional invalid input
    expect(() => useGeometryStore.getState().setObjectType('not-a-real-type')).toThrow(
      /Invalid object type/i
    )
  })

  it('setObjectType accepts schroedinger', () => {
    useGeometryStore.getState().setObjectType('schroedinger')
    expect(useGeometryStore.getState().objectType).toBe('schroedinger')
  })

  it('appearance store no longer exposes faces visibility toggle', () => {
    expect('facesVisible' in useAppearanceStore.getState()).toBe(false)
  })
})
