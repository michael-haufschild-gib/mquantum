/**
 * Tests for Dirac equation setter functions.
 *
 * Validates grid resizing with power-of-2 constraints, total site limits,
 * mass/hbar/c clamping, and potential parameter setters.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('Dirac setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  const getDirac = () => useExtendedObjectStore.getState().schroedinger.dirac

  it('snaps grid sizes to power-of-2 and respects total site limit', () => {
    const s = useExtendedObjectStore.getState()
    // Try to set grid sizes that exceed the limit (128^3 = 2097152 > 262144)
    s.setDiracGridSize([128, 128, 128])
    const grid = getDirac().gridSize
    const totalSites = grid.reduce((a, b) => a * b, 1)
    expect(totalSites).toBeLessThanOrEqual(262144)
    // Each should be a power of 2
    for (const g of grid) {
      expect(Math.log2(g) % 1).toBe(0)
    }
  })

  it('clamps mass to [0.01, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracMass(0)
    expect(getDirac().mass).toBe(0.01)
    s.setDiracMass(200)
    expect(getDirac().mass).toBe(10)
  })

  it('clamps hbar to [0.01, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracHbar(0)
    expect(getDirac().hbar).toBe(0.01)
    s.setDiracHbar(100)
    expect(getDirac().hbar).toBe(10)
  })

  it('clamps speedOfLight to [0.01, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracSpeedOfLight(0)
    expect(getDirac().speedOfLight).toBe(0.01)
    s.setDiracSpeedOfLight(200)
    expect(getDirac().speedOfLight).toBe(10)
  })

  it('rejects NaN for numeric parameters', () => {
    const s = useExtendedObjectStore.getState()
    const before = getDirac().mass
    s.setDiracMass(NaN)
    expect(getDirac().mass).toBe(before)
  })

  it('clamps stepsPerFrame to integer [1, 16]', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracStepsPerFrame(0)
    expect(getDirac().stepsPerFrame).toBe(1)
    s.setDiracStepsPerFrame(500)
    expect(getDirac().stepsPerFrame).toBe(16)
    s.setDiracStepsPerFrame(3.8)
    expect(getDirac().stepsPerFrame).toBe(4)
  })

  it('clamps potentialStrength to [-100, 100]', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracPotentialStrength(-200)
    expect(getDirac().potentialStrength).toBe(-100)
    s.setDiracPotentialStrength(300)
    expect(getDirac().potentialStrength).toBe(100)
  })

  it('sets potential type', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracPotentialType('harmonic')
    expect(getDirac().potentialType).toBe('harmonic')
  })

  it('sets packet center per axis', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracPacketCenter(0, 1.5)
    expect(getDirac().packetCenter[0]).toBe(1.5)
  })

  it('sets packet momentum per axis', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracPacketMomentum(0, 3.0)
    expect(getDirac().packetMomentum[0]).toBe(3.0)
  })

  it('sets initial condition', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracInitialCondition('gaussian')
    expect(getDirac().initialCondition).toBe('gaussian')
  })

  it('dt is stability-limited', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracDt(1000) // way above CFL limit
    const dt = getDirac().dt
    expect(dt).toBeGreaterThan(0)
    expect(dt).toBeLessThan(1000) // should be clamped down
  })
})
