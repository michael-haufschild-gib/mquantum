/**
 * Tests for Dirac equation setter functions.
 *
 * Validates grid resizing with power-of-2 constraints, total site limits,
 * mass/hbar/c clamping, and potential parameter setters.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    // @ts-expect-error intentional invalid input
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
    // @ts-expect-error intentional invalid input
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

  it('clamps potentialWidth to [0.01, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracPotentialWidth(0)
    expect(getDirac().potentialWidth).toBe(0.01)
    s.setDiracPotentialWidth(50)
    expect(getDirac().potentialWidth).toBe(10)
  })

  it('clamps potentialCenter to [-10, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracPotentialCenter(-20)
    expect(getDirac().potentialCenter).toBe(-10)
    s.setDiracPotentialCenter(20)
    expect(getDirac().potentialCenter).toBe(10)
  })

  it('clamps harmonicOmega to [0.01, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracHarmonicOmega(0)
    expect(getDirac().harmonicOmega).toBe(0.01)
    s.setDiracHarmonicOmega(500)
    expect(getDirac().harmonicOmega).toBe(10)
  })

  it('clamps coulombZ to [1, 137] (rounded)', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracCoulombZ(0)
    expect(getDirac().coulombZ).toBe(1)
    s.setDiracCoulombZ(200)
    expect(getDirac().coulombZ).toBe(137)
  })

  it('clamps packetWidth to [0.05, 5]', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracPacketWidth(0)
    expect(getDirac().packetWidth).toBe(0.05)
    s.setDiracPacketWidth(100)
    expect(getDirac().packetWidth).toBe(5)
  })

  it('clamps positiveEnergyFraction to [0, 1]', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracPositiveEnergyFraction(-1)
    expect(getDirac().positiveEnergyFraction).toBe(0)
    s.setDiracPositiveEnergyFraction(2)
    expect(getDirac().positiveEnergyFraction).toBe(1)
  })

  it('sets fieldView', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracFieldView('spinDensity')
    expect(getDirac().fieldView).toBe('spinDensity')
  })

  it('sets autoScale boolean', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracAutoScale(false)
    expect(getDirac().autoScale).toBe(false)
    s.setDiracAutoScale(true)
    expect(getDirac().autoScale).toBe(true)
  })

  it('sets showPotential boolean', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracShowPotential(true)
    expect(getDirac().showPotential).toBe(true)
  })

  it('sets absorberEnabled boolean', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracAbsorberEnabled(true)
    expect(getDirac().absorberEnabled).toBe(true)
  })

  it('clamps absorberWidth to [0.05, 0.5]', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracAbsorberWidth(0)
    expect(getDirac().absorberWidth).toBe(0.05)
    s.setDiracAbsorberWidth(1)
    expect(getDirac().absorberWidth).toBe(0.5)
  })

  it('clamps pmlTargetReflection to [1e-12, 0.999]', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracPmlTargetReflection(0)
    expect(getDirac().pmlTargetReflection).toBe(1e-12)
    s.setDiracPmlTargetReflection(2)
    expect(getDirac().pmlTargetReflection).toBe(0.999)
  })

  it('sets spacing array and triggers needsReset', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracSpacing([0.5, 0.5, 0.5])
    const spacing = getDirac().spacing
    expect(spacing[0]).toBe(0.5)
    expect(getDirac().needsReset).toBe(true)
  })

  it('sets spin direction per axis', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracSpinDirection(0, 0.5)
    expect(getDirac().spinDirection[0]).toBe(0.5)
  })

  it('sets particle and antiparticle colors', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracParticleColor([1, 0, 0])
    expect(getDirac().particleColor).toEqual([1, 0, 0])
    s.setDiracAntiparticleColor([0, 1, 0])
    expect(getDirac().antiparticleColor).toEqual([0, 1, 0])
  })

  it('sets diagnosticsEnabled and interval', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracDiagnosticsEnabled(true)
    expect(getDirac().diagnosticsEnabled).toBe(true)
    s.setDiracDiagnosticsInterval(10)
    expect(getDirac().diagnosticsInterval).toBe(10)
  })

  it('clamps diagnosticsInterval to [1, 60]', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracDiagnosticsInterval(0)
    expect(getDirac().diagnosticsInterval).toBe(1)
    s.setDiracDiagnosticsInterval(500)
    expect(getDirac().diagnosticsInterval).toBe(60)
  })

  it('setDiracNeedsReset and clearDiracNeedsReset toggle the flag', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracNeedsReset()
    expect(getDirac().needsReset).toBe(true)
    s.clearDiracNeedsReset()
    expect(getDirac().needsReset).toBe(false)
  })

  it('sets slice position per axis', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracSlicePosition(1, 0.7)
    expect(getDirac().slicePositions[1]).toBe(0.7)
  })

  it('applies a preset and triggers needsReset', async () => {
    // First clear needsReset so we can confirm the preset sets it
    useExtendedObjectStore.setState({
      schroedinger: {
        ...useExtendedObjectStore.getState().schroedinger,
        dirac: { ...getDirac(), needsReset: false, stepsPerFrame: 2 },
      },
    })
    expect(getDirac().needsReset).toBe(false)

    const s = useExtendedObjectStore.getState()
    s.applyDiracPreset('kleinParadox')
    // Preset application uses dynamic import — poll until both postconditions resolve
    await vi.waitFor(() => {
      expect(getDirac().needsReset).toBe(true)
      // kleinParadox preset sets stepsPerFrame: 4 (default is 2)
      expect(getDirac().stepsPerFrame).toBe(4)
    })
  })

  it('rejects NaN for clamped numeric setters', () => {
    const s = useExtendedObjectStore.getState()
    const beforeWidth = getDirac().potentialWidth
    s.setDiracPotentialWidth(NaN)
    expect(getDirac().potentialWidth).toBe(beforeWidth)

    const beforeOmega = getDirac().harmonicOmega
    s.setDiracHarmonicOmega(NaN)
    expect(getDirac().harmonicOmega).toBe(beforeOmega)
  })
})
