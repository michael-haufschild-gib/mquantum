/**
 * Tests for TDSE potential parameter setters.
 *
 * Validates clamping ranges, NaN/Infinity rejection, and drive waveform validation.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('TDSE potential setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  const getTdse = () => useExtendedObjectStore.getState().schroedinger.tdse

  it('clamps barrierHeight to [0, 100]', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseBarrierHeight(-5)
    expect(getTdse().barrierHeight).toBe(0)
    s.setTdseBarrierHeight(200)
    expect(getTdse().barrierHeight).toBe(100)
    s.setTdseBarrierHeight(42)
    expect(getTdse().barrierHeight).toBe(42)
  })

  it('clamps barrierWidth to [0.01, 5]', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseBarrierWidth(0)
    expect(getTdse().barrierWidth).toBe(0.01)
    s.setTdseBarrierWidth(10)
    expect(getTdse().barrierWidth).toBe(5)
  })

  it('clamps harmonicOmega to [0.01, 50]', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseHarmonicOmega(0)
    expect(getTdse().harmonicOmega).toBe(0.01)
    s.setTdseHarmonicOmega(100)
    expect(getTdse().harmonicOmega).toBe(50)
  })

  it('rejects NaN values', () => {
    const s = useExtendedObjectStore.getState()
    const before = getTdse().barrierHeight
    s.setTdseBarrierHeight(NaN)
    expect(getTdse().barrierHeight).toBe(before)
  })

  it('rejects Infinity values', () => {
    const s = useExtendedObjectStore.getState()
    const before = getTdse().wellDepth
    s.setTdseWellDepth(Infinity)
    expect(getTdse().wellDepth).toBe(before)
  })

  it('sets drive enabled boolean', () => {
    const s = useExtendedObjectStore.getState()
    // @ts-expect-error intentional invalid input
    s.setTdseDriveEnabled(true as unknown as number)
    expect(getTdse().driveEnabled).toBe(true)
    // @ts-expect-error intentional invalid input
    s.setTdseDriveEnabled(false as unknown as number)
    expect(getTdse().driveEnabled).toBe(false)
  })

  it('validates drive waveform values', () => {
    const s = useExtendedObjectStore.getState()
    // @ts-expect-error intentional invalid input
    s.setTdseDriveWaveform('sine' as unknown as number)
    expect(getTdse().driveWaveform).toBe('sine')
    // @ts-expect-error intentional invalid input
    s.setTdseDriveWaveform('square' as unknown as number)
    expect(getTdse().driveWaveform).toBe('square')
    // Invalid waveform should not change state
    // @ts-expect-error intentional invalid input
    s.setTdseDriveWaveform('invalid' as unknown as number)
    expect(getTdse().driveWaveform).toBe('square')
  })

  it('clamps double well parameters', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseDoubleWellLambda(-10)
    expect(getTdse().doubleWellLambda).toBe(0)
    s.setTdseDoubleWellLambda(300)
    expect(getTdse().doubleWellLambda).toBe(200)
    s.setTdseDoubleWellSeparation(0)
    expect(getTdse().doubleWellSeparation).toBe(0.1)
  })
})
