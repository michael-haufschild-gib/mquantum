import { describe, it, expect } from 'vitest'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('Schroedinger SQ Layer — dimension change clamping', () => {
  it('clamps sqLayerSelectedModeIndex when dimension decreases', () => {
    const store = useExtendedObjectStore.getState()

    // Set mode index to 5 (valid for 11D, max index = 10)
    store.setSchroedingerSqLayerSelectedModeIndex(5)
    expect(useExtendedObjectStore.getState().schroedinger.sqLayerSelectedModeIndex).toBe(5)

    // Reinitialize for 3D — max valid index is 2
    store.initializeSchroedingerForDimension(3)
    const config = useExtendedObjectStore.getState().schroedinger
    expect(config.sqLayerSelectedModeIndex).toBeLessThanOrEqual(2)
  })

  it('preserves sqLayerSelectedModeIndex when dimension is large enough', () => {
    const store = useExtendedObjectStore.getState()

    // Set mode index to 2
    store.setSchroedingerSqLayerSelectedModeIndex(2)
    expect(useExtendedObjectStore.getState().schroedinger.sqLayerSelectedModeIndex).toBe(2)

    // Reinitialize for 5D — max valid index is 4, so 2 should be preserved
    store.initializeSchroedingerForDimension(5)
    const config = useExtendedObjectStore.getState().schroedinger
    expect(config.sqLayerSelectedModeIndex).toBe(2)
  })

  it('clamps sqLayerFockQuantumNumber to configured bounds', () => {
    const store = useExtendedObjectStore.getState()

    store.setSchroedingerSqLayerFockQuantumNumber(-3)
    expect(useExtendedObjectStore.getState().schroedinger.sqLayerFockQuantumNumber).toBe(0)

    store.setSchroedingerSqLayerFockQuantumNumber(99)
    expect(useExtendedObjectStore.getState().schroedinger.sqLayerFockQuantumNumber).toBe(10)
  })
})
