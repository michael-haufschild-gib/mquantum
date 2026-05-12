/**
 * Tests for TDSE (Time-Dependent Schrodinger Equation) dynamics setters.
 *
 * Validates latticeDim clamping with array resizing, potential type switching,
 * packet configuration, dt clamping, and constraint enforcement.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

describe('TDSE dynamics setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  const getTdse = () => useExtendedObjectStore.getState().schroedinger.tdse

  it('resizes arrays when latticeDim changes', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseLatticeDim(2)
    const t = getTdse()
    expect(t.latticeDim).toBe(2)
    expect(t.gridSize).toHaveLength(2)
    expect(t.spacing).toHaveLength(2)
    expect(t.packetCenter).toHaveLength(2)
    expect(t.packetMomentum).toHaveLength(2)
  })

  it('clamps latticeDim to [1, 11]', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseLatticeDim(0)
    expect(getTdse().latticeDim).toBe(1)
    s.setTdseLatticeDim(20)
    expect(getTdse().latticeDim).toBe(11)
  })

  it('falls back from doubleSlit to barrier in 1D', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseLatticeDim(2)
    s.setTdsePotentialType('doubleSlit')
    expect(getTdse().potentialType).toBe('doubleSlit')
    s.setTdseLatticeDim(1)
    expect(getTdse().potentialType).toBe('barrier')
  })

  it('sets potential type', () => {
    const s = useExtendedObjectStore.getState()
    // @ts-expect-error intentional invalid input
    s.setTdsePotentialType('harmonic')
    expect(getTdse().potentialType).toBe('harmonic')
    s.setTdsePotentialType('barrier')
    expect(getTdse().potentialType).toBe('barrier')
  })

  it('clamps mass to [0.01, 100]', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseMass(0)
    expect(getTdse().mass).toBe(0.01)
    s.setTdseMass(200)
    expect(getTdse().mass).toBe(100)
  })

  it('clamps hbar to [0.01, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseHbar(0)
    expect(getTdse().hbar).toBe(0.01)
    s.setTdseHbar(100)
    expect(getTdse().hbar).toBe(10)
  })

  it('clamps dt to [0.0001, 0.05]', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseDt(0)
    expect(getTdse().dt).toBe(0.0001)
    s.setTdseDt(1)
    expect(getTdse().dt).toBe(0.05)
  })

  it('setTdseDt CFL bound respects effective spacing under compactification', () => {
    const s = useExtendedObjectStore.getState()
    // Switching one axis to a tight compact dim drops effective spacing far
    // below raw, so the CFL-limited dt must drop below the slider's 0.02 max.
    s.setTdseCompactDim(0, true)
    s.setTdseCompactRadius(0, 0.05)
    expect(getTdse().compactDims[0]).toBe(true)

    s.setTdseDt(0.02)
    const dtAfter = getTdse().dt
    expect(Number.isFinite(dtAfter)).toBe(true)
    expect(dtAfter).toBeGreaterThan(0)
    // Effective CFL with compact spacing drives dt to ~0.005 — strictly below
    // the slider's 0.02 ceiling. If the setter ignored compactification the
    // user could leave dt at 0.02 and crash the integrator.
    expect(dtAfter).toBeLessThan(0.015)
  })

  it('clamps stepsPerFrame to integer [1, 16]', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseStepsPerFrame(0)
    expect(getTdse().stepsPerFrame).toBe(1)
    s.setTdseStepsPerFrame(500)
    expect(getTdse().stepsPerFrame).toBe(16)
    s.setTdseStepsPerFrame(3.7)
    expect(getTdse().stepsPerFrame).toBe(3)
  })

  it('rejects NaN for numeric parameters', () => {
    const s = useExtendedObjectStore.getState()
    const before = getTdse().mass
    s.setTdseMass(NaN)
    expect(getTdse().mass).toBe(before)
  })

  it('sets packet center as array', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseLatticeDim(2)
    s.setTdsePacketCenter([1.5, -0.5])
    const t = getTdse()
    expect(t.packetCenter[0]).toBe(1.5)
    expect(t.packetCenter[1]).toBe(-0.5)
  })

  it('normalizes packet vectors to lattice dimensionality', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseLatticeDim(3)

    s.setTdsePacketCenter([1, 2, 3])
    s.setTdsePacketCenter([4])
    expect(getTdse().packetCenter).toEqual([4, 2, 3])

    s.setTdsePacketMomentum([1, 2, 3, 4])
    expect(getTdse().packetMomentum).toEqual([1, 2, 3])
  })

  it('rejects non-finite packet vectors', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseLatticeDim(3)
    s.setTdsePacketCenter([1, 2, 3])
    s.setTdsePacketMomentum([4, 5, 6])

    s.setTdsePacketCenter([7, Number.NaN, 9])
    expect(getTdse().packetCenter).toEqual([1, 2, 3])

    s.setTdsePacketMomentum([7, Number.POSITIVE_INFINITY, 9])
    expect(getTdse().packetMomentum).toEqual([4, 5, 6])
  })

  it('rejects sparse numeric arrays before they can write NaN', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseLatticeDim(3)
    s.setTdseSpacing([0.2, 0.2, 0.2])
    const before = getTdse().spacing
    const sparse = new Array<number>(3)
    sparse[2] = 0.3

    s.setTdseSpacing(sparse)

    expect(getTdse().spacing).toEqual(before)
  })

  it('sets initial condition type', () => {
    const s = useExtendedObjectStore.getState()
    // @ts-expect-error intentional invalid input
    s.setTdseInitialCondition('gaussian')
    expect(getTdse().initialCondition).toBe('gaussian')
  })

  it('creates slice positions for dims > 3', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseLatticeDim(5)
    expect(getTdse().slicePositions).toHaveLength(2) // 5 - 3 = 2
  })

  it('resetTdseField sets needsReset flag', () => {
    const s = useExtendedObjectStore.getState()
    s.resetTdseField()
    expect(getTdse().needsReset).toBe(true)
  })

  it('returns a settled promise for dynamic preset application', async () => {
    const s = useExtendedObjectStore.getState()
    const result = s.applyTdsePreset('classicTunneling') as unknown

    expect(result).toBeInstanceOf(Promise)
    await result

    expect(getTdse().potentialType).toBe('barrier')
    expect(getTdse().needsReset).toBe(true)
  })
})
