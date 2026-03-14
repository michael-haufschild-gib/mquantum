/**
 * Integration tests for pauliSpinor registry, geometry store, and component loader.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { hasControlsComponent } from '@/lib/geometry/registry/components'
import { isExtendedObjectType } from '@/lib/geometry/types'
import { useGeometryStore } from '@/stores/geometryStore'

describe('pauliSpinor integration', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
  })

  it('isExtendedObjectType accepts pauliSpinor', () => {
    expect(isExtendedObjectType('pauliSpinor')).toBe(true)
  })

  it('isExtendedObjectType rejects unknown types', () => {
    expect(isExtendedObjectType('notReal')).toBe(false)
  })

  it('hasControlsComponent returns true for PauliSpinorControls', () => {
    expect(hasControlsComponent('PauliSpinorControls')).toBe(true)
  })

  it('hasControlsComponent returns false for unknown key', () => {
    expect(hasControlsComponent('NonExistent')).toBe(false)
  })

  it('geometryStore accepts pauliSpinor as objectType', () => {
    useGeometryStore.getState().setObjectType('pauliSpinor')
    expect(useGeometryStore.getState().objectType).toBe('pauliSpinor')
  })

  it('switching to pauliSpinor sets recommended dimension (3)', () => {
    useGeometryStore.getState().setDimension(5)
    useGeometryStore.getState().setObjectType('pauliSpinor')
    expect(useGeometryStore.getState().objectType).toBe('pauliSpinor')
    expect(useGeometryStore.getState().dimension).toBe(3)
  })
})
