import { beforeEach, describe, expect, it } from 'vitest'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('Schroedinger nodal settings', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('provides physical nodal defaults for research workflows', () => {
    const nodal = useExtendedObjectStore.getState().schroedinger

    expect(nodal.nodalDefinition).toBe('psiAbs')
    expect(nodal.nodalTolerance).toBe(0.02)
    expect(nodal.nodalFamilyFilter).toBe('all')
    expect(nodal.nodalLobeColoringEnabled).toBe(false)
    expect(nodal.nodalColorReal).toBe('#00ffff')
    expect(nodal.nodalColorImag).toBe('#ff66ff')
    expect(nodal.nodalColorPositive).toBe('#22c55e')
    expect(nodal.nodalColorNegative).toBe('#ef4444')
  })

  it('clamps nodal tolerance and updates the physical definition mode', () => {
    const store = useExtendedObjectStore.getState()

    store.setSchroedingerNodalDefinition('complexIntersection')
    store.setSchroedingerNodalTolerance(-1.0)
    expect(useExtendedObjectStore.getState().schroedinger.nodalTolerance).toBe(0.00001)

    store.setSchroedingerNodalTolerance(2.0)
    expect(useExtendedObjectStore.getState().schroedinger.nodalTolerance).toBe(0.5)
    expect(useExtendedObjectStore.getState().schroedinger.nodalDefinition).toBe(
      'complexIntersection'
    )
  })

  it('updates nodal family filter and lobe/phase coloring controls', () => {
    const store = useExtendedObjectStore.getState()

    store.setSchroedingerNodalFamilyFilter('radial')
    store.setSchroedingerNodalLobeColoringEnabled(true)
    store.setSchroedingerNodalColorReal('#123456')
    store.setSchroedingerNodalColorImag('#654321')
    store.setSchroedingerNodalColorPositive('#00ff00')
    store.setSchroedingerNodalColorNegative('#ff0000')

    const nodal = useExtendedObjectStore.getState().schroedinger
    expect(nodal.nodalFamilyFilter).toBe('radial')
    expect(nodal.nodalLobeColoringEnabled).toBe(true)
    expect(nodal.nodalColorReal).toBe('#123456')
    expect(nodal.nodalColorImag).toBe('#654321')
    expect(nodal.nodalColorPositive).toBe('#00ff00')
    expect(nodal.nodalColorNegative).toBe('#ff0000')
  })
})
