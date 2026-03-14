/**
 * Unit tests for the Pauli spinor store slice.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { DEFAULT_PAULI_CONFIG } from '@/lib/geometry/extended/types'

describe('pauliSpinorSlice', () => {
  beforeEach(() => {
    useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
  })

  it('initializes with DEFAULT_PAULI_CONFIG', () => {
    const state = useExtendedObjectStore.getState()
    expect(state.pauliSpinor.dt).toBe(DEFAULT_PAULI_CONFIG.dt)
    expect(state.pauliSpinor.fieldType).toBe(DEFAULT_PAULI_CONFIG.fieldType)
    expect(state.pauliSpinor.fieldView).toBe(DEFAULT_PAULI_CONFIG.fieldView)
  })

  // === Physics setters ===

  it('setPauliDt clamps to [0.0001, 0.1]', () => {
    const { setPauliDt } = useExtendedObjectStore.getState()
    setPauliDt(0.00001) // below min
    expect(useExtendedObjectStore.getState().pauliSpinor.dt).toBe(0.0001)
    setPauliDt(1.0) // above max
    expect(useExtendedObjectStore.getState().pauliSpinor.dt).toBe(0.1)
    setPauliDt(0.01) // valid
    expect(useExtendedObjectStore.getState().pauliSpinor.dt).toBe(0.01)
  })

  it('setPauliStepsPerFrame rounds and clamps to [1, 16]', () => {
    const { setPauliStepsPerFrame } = useExtendedObjectStore.getState()
    setPauliStepsPerFrame(0) // below min
    expect(useExtendedObjectStore.getState().pauliSpinor.stepsPerFrame).toBe(1)
    setPauliStepsPerFrame(100) // above max
    expect(useExtendedObjectStore.getState().pauliSpinor.stepsPerFrame).toBe(16)
    setPauliStepsPerFrame(8)
    expect(useExtendedObjectStore.getState().pauliSpinor.stepsPerFrame).toBe(8)
  })

  it('setPauliHbar clamps to [0.01, 10]', () => {
    const { setPauliHbar } = useExtendedObjectStore.getState()
    setPauliHbar(0.001)
    expect(useExtendedObjectStore.getState().pauliSpinor.hbar).toBe(0.01)
    setPauliHbar(5.0)
    expect(useExtendedObjectStore.getState().pauliSpinor.hbar).toBe(5.0)
  })

  // === Magnetic field setters ===

  it('setPauliFieldType triggers needsReset', () => {
    const { setPauliFieldType, clearPauliNeedsReset } = useExtendedObjectStore.getState()
    clearPauliNeedsReset()
    expect(useExtendedObjectStore.getState().pauliSpinor.needsReset).toBe(false)
    setPauliFieldType('gradient')
    expect(useExtendedObjectStore.getState().pauliSpinor.fieldType).toBe('gradient')
    expect(useExtendedObjectStore.getState().pauliSpinor.needsReset).toBe(true)
  })

  it('setPauliFieldStrength clamps to [0, 50]', () => {
    const { setPauliFieldStrength } = useExtendedObjectStore.getState()
    setPauliFieldStrength(-1)
    expect(useExtendedObjectStore.getState().pauliSpinor.fieldStrength).toBe(0)
    setPauliFieldStrength(100)
    expect(useExtendedObjectStore.getState().pauliSpinor.fieldStrength).toBe(50)
  })

  it('setPauliFieldDirection rejects NaN', () => {
    const { setPauliFieldDirection } = useExtendedObjectStore.getState()
    const before = useExtendedObjectStore.getState().pauliSpinor.fieldDirection
    setPauliFieldDirection([NaN, 0])
    expect(useExtendedObjectStore.getState().pauliSpinor.fieldDirection).toEqual(before)
  })

  // === Initial spin state ===

  it('setPauliInitialSpinDirection triggers needsReset', () => {
    const { setPauliInitialSpinDirection, clearPauliNeedsReset } = useExtendedObjectStore.getState()
    clearPauliNeedsReset()
    setPauliInitialSpinDirection([Math.PI / 4, Math.PI / 2])
    const state = useExtendedObjectStore.getState().pauliSpinor
    expect(state.initialSpinDirection).toEqual([Math.PI / 4, Math.PI / 2])
    expect(state.needsReset).toBe(true)
  })

  // === Grid setters ===

  it('setPauliGridSize rounds to power of 2', () => {
    const { setPauliGridSize } = useExtendedObjectStore.getState()
    setPauliGridSize([30, 50, 100])
    const gridSize = useExtendedObjectStore.getState().pauliSpinor.gridSize
    // 30 → 32, 50 → 64, 100 → 128
    expect(gridSize[0]).toBe(32)
    expect(gridSize[1]).toBe(64)
    expect(gridSize[2]).toBe(128)
  })

  it('setPauliGridSize clamps to [8, 256]', () => {
    const { setPauliGridSize } = useExtendedObjectStore.getState()
    setPauliGridSize([1, 1000, 64])
    const gridSize = useExtendedObjectStore.getState().pauliSpinor.gridSize
    expect(gridSize[0]).toBe(8)
    expect(gridSize[1]).toBe(256)
    expect(gridSize[2]).toBe(64)
  })

  // === Visualization ===

  it('setPauliFieldView updates without needsReset', () => {
    const { setPauliFieldView, clearPauliNeedsReset } = useExtendedObjectStore.getState()
    clearPauliNeedsReset()
    setPauliFieldView('coherence')
    const state = useExtendedObjectStore.getState().pauliSpinor
    expect(state.fieldView).toBe('coherence')
    expect(state.needsReset).toBe(false)
  })

  // === Version counter ===

  it('increments pauliSpinorVersion on state changes', () => {
    const v0 = useExtendedObjectStore.getState().pauliSpinorVersion
    useExtendedObjectStore.getState().setPauliFieldStrength(5.0)
    const v1 = useExtendedObjectStore.getState().pauliSpinorVersion
    expect(v1).toBe(v0 + 1)
  })

  // === Lifecycle ===

  it('resetPauliField restores defaults and sets needsReset', () => {
    const { setPauliFieldStrength, setPauliFieldType, resetPauliField } = useExtendedObjectStore.getState()
    setPauliFieldStrength(42)
    setPauliFieldType('quadrupole')
    resetPauliField()
    const state = useExtendedObjectStore.getState().pauliSpinor
    expect(state.fieldStrength).toBe(DEFAULT_PAULI_CONFIG.fieldStrength)
    expect(state.fieldType).toBe(DEFAULT_PAULI_CONFIG.fieldType)
    expect(state.needsReset).toBe(true)
  })

  it('initializePauliForDimension adjusts gridSize and spacing arrays', () => {
    const { initializePauliForDimension } = useExtendedObjectStore.getState()
    initializePauliForDimension(5)
    const state = useExtendedObjectStore.getState().pauliSpinor
    expect(state.latticeDim).toBe(5)
    expect(state.gridSize).toHaveLength(5)
    expect(state.spacing).toHaveLength(5)
    expect(state.needsReset).toBe(true)
  })

  it('setPauliConfig applies partial overrides', () => {
    const { setPauliConfig } = useExtendedObjectStore.getState()
    setPauliConfig({ fieldStrength: 7.5, potentialType: 'barrier' })
    const state = useExtendedObjectStore.getState().pauliSpinor
    expect(state.fieldStrength).toBe(7.5)
    expect(state.potentialType).toBe('barrier')
    // Other fields unchanged
    expect(state.dt).toBe(DEFAULT_PAULI_CONFIG.dt)
  })
})
