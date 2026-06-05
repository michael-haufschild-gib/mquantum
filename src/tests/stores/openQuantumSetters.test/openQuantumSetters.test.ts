/**
 * Tests for open quantum system setters.
 *
 * Validates rate clamping, NaN rejection, channel toggling,
 * reset token incrementing, and default reset behavior.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

describe('open quantum setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  const getOQ = () => useExtendedObjectStore.getState().schroedinger.openQuantum

  it('clamps dephasingRate to [0, 5]', () => {
    const s = useExtendedObjectStore.getState()
    s.setOpenQuantumDephasingRate(-1)
    expect(getOQ().dephasingRate).toBe(0)
    s.setOpenQuantumDephasingRate(10)
    expect(getOQ().dephasingRate).toBe(5)
    s.setOpenQuantumDephasingRate(2.5)
    expect(getOQ().dephasingRate).toBe(2.5)
  })

  it('clamps relaxationRate to [0, 5]', () => {
    const s = useExtendedObjectStore.getState()
    s.setOpenQuantumRelaxationRate(10)
    expect(getOQ().relaxationRate).toBe(5)
  })

  it('clamps thermalUpRate to [0, 5]', () => {
    const s = useExtendedObjectStore.getState()
    s.setOpenQuantumThermalUpRate(-1)
    expect(getOQ().thermalUpRate).toBe(0)
  })

  it('clamps dt to [0.001, 0.1]', () => {
    const s = useExtendedObjectStore.getState()
    s.setOpenQuantumDt(0)
    expect(getOQ().dt).toBe(0.001)
    s.setOpenQuantumDt(1)
    expect(getOQ().dt).toBe(0.1)
  })

  it('clamps substeps to integer [1, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setOpenQuantumSubsteps(0)
    expect(getOQ().substeps).toBe(1)
    s.setOpenQuantumSubsteps(20)
    expect(getOQ().substeps).toBe(10)
    s.setOpenQuantumSubsteps(3.7)
    expect(getOQ().substeps).toBe(3)
  })

  it('rejects NaN for rate setters', () => {
    const s = useExtendedObjectStore.getState()
    const before = getOQ().dephasingRate
    s.setOpenQuantumDephasingRate(NaN)
    expect(getOQ().dephasingRate).toBe(before)
  })

  it('toggles individual channels', () => {
    const s = useExtendedObjectStore.getState()
    s.setOpenQuantumChannelEnabled('dephasing', false)
    expect(getOQ().dephasingEnabled).toBe(false)
    s.setOpenQuantumChannelEnabled('dephasing', true)
    expect(getOQ().dephasingEnabled).toBe(true)
    s.setOpenQuantumChannelEnabled('relaxation', false)
    expect(getOQ().relaxationEnabled).toBe(false)
    s.setOpenQuantumChannelEnabled('thermal', false)
    expect(getOQ().thermalEnabled).toBe(false)
  })

  it('increments resetToken on state reset request', () => {
    const s = useExtendedObjectStore.getState()
    const before = getOQ().resetToken ?? 0
    s.requestOpenQuantumStateReset()
    expect(getOQ().resetToken).toBe(before + 1)
    s.requestOpenQuantumStateReset()
    expect(getOQ().resetToken).toBe(before + 2)
  })

  it('resets to default values', () => {
    const s = useExtendedObjectStore.getState()
    s.setOpenQuantumDephasingRate(3)
    s.setOpenQuantumSubsteps(8)
    s.resetOpenQuantumToDefault()
    // After reset, values should be back to defaults
    const oq = getOQ()
    expect(oq.substeps).not.toBe(8)
  })

  it('clamps bathTemperature to [0.1, 100000]', () => {
    const s = useExtendedObjectStore.getState()
    s.setOpenQuantumBathTemperature(0)
    expect(getOQ().bathTemperature).toBe(0.1)
    s.setOpenQuantumBathTemperature(200000)
    expect(getOQ().bathTemperature).toBe(100000)
  })

  it('clamps couplingScale to [0.01, 100]', () => {
    const s = useExtendedObjectStore.getState()
    s.setOpenQuantumCouplingScale(0)
    expect(getOQ().couplingScale).toBe(0.01)
    s.setOpenQuantumCouplingScale(200)
    expect(getOQ().couplingScale).toBe(100)
  })

  it('clamps hydrogenBasisMaxN to integer [1, 3]', () => {
    const s = useExtendedObjectStore.getState()
    s.setOpenQuantumHydrogenBasisMaxN(0)
    expect(getOQ().hydrogenBasisMaxN).toBe(1)
    s.setOpenQuantumHydrogenBasisMaxN(5)
    expect(getOQ().hydrogenBasisMaxN).toBe(3)
    s.setOpenQuantumHydrogenBasisMaxN(2.9)
    expect(getOQ().hydrogenBasisMaxN).toBe(2)
  })
})
