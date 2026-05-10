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

  it('sets valid potential type and rejects invalid values', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracPotentialType('coulomb')
    expect(getDirac().potentialType).toBe('coulomb')
    // @ts-expect-error intentional invalid input
    s.setDiracPotentialType('harmonic')
    expect(getDirac().potentialType).toBe('coulomb')
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

  it('sets valid initial condition and rejects invalid values', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracInitialCondition('planeWave')
    expect(getDirac().initialCondition).toBe('planeWave')
    // @ts-expect-error intentional invalid input
    s.setDiracInitialCondition('gaussian')
    expect(getDirac().initialCondition).toBe('planeWave')
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

  it('sets valid fieldView and rejects invalid values', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracFieldView('spinDensity')
    expect(getDirac().fieldView).toBe('spinDensity')
    // @ts-expect-error intentional invalid input
    s.setDiracFieldView('spin')
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

  it('markComputeNeedsReset(dirac) and clearComputeNeedsReset(dirac) toggle the flag', () => {
    const s = useExtendedObjectStore.getState()
    s.markComputeNeedsReset('dirac')
    expect(getDirac().needsReset).toBe(true)
    s.clearComputeNeedsReset('dirac')
    expect(getDirac().needsReset).toBe(false)
  })

  it('sets slice position per axis', () => {
    // Set up a 5-D Dirac config so `slicePositions` has 2 extra-dim slots
    // (dim 3 → index 0, dim 4 → index 1). The default `latticeDim=3` has
    // zero extra dims and zero slicePositions entries by the store
    // convention `max(0, latticeDim - 3)` — a `setDiracSlicePosition(1, ...)`
    // call in that state is a no-op because the setter refuses writes to
    // indices outside the current array length. The pre-fix test passed
    // only because the old default bogus-seeded 12 zeros into the array,
    // letting writes succeed at dims that didn't actually exist.
    useExtendedObjectStore.setState((state) => ({
      schroedinger: {
        ...state.schroedinger,
        dirac: { ...state.schroedinger.dirac, latticeDim: 5, slicePositions: [0, 0] },
      },
    }))
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
    await s.applyDiracPreset('kleinParadox')
    expect(getDirac().needsReset).toBe(true)
    // kleinParadox preset sets stepsPerFrame: 4 (default is 2)
    expect(getDirac().stepsPerFrame).toBe(4)
  })

  it('syncs color algorithm to particleAntiparticle when preset uses split fieldView', async () => {
    const { useAppearanceStore } = await import('@/stores/appearanceStore')
    useAppearanceStore.getState().setColorAlgorithm('blackbody')
    expect(useAppearanceStore.getState().colorAlgorithm).toBe('blackbody')

    const s = useExtendedObjectStore.getState()
    // kleinParadox preset sets fieldView='particleAntiparticleSplit' which requires
    // the matching color algorithm so the renderer reads R/G as upper/lower spinor.
    await s.applyDiracPreset('kleinParadox')

    expect(getDirac().fieldView).toBe('particleAntiparticleSplit')
    expect(useAppearanceStore.getState().colorAlgorithm).toBe('particleAntiparticle')
  })

  it('syncs color algorithm to blackbody when preset uses totalDensity fieldView', async () => {
    const { useAppearanceStore } = await import('@/stores/appearanceStore')
    useAppearanceStore.getState().setColorAlgorithm('viridis')
    expect(useAppearanceStore.getState().colorAlgorithm).toBe('viridis')

    const s = useExtendedObjectStore.getState()
    // diracBarrierTunneling preset uses fieldView='totalDensity', which needs a
    // single-channel density palette after split-view presets have used R/G.
    await s.applyDiracPreset('diracBarrierTunneling')

    expect(getDirac().fieldView).toBe('totalDensity')
    expect(useAppearanceStore.getState().colorAlgorithm).toBe('blackbody')
  })

  it('re-clamps dt when speedOfLight rises above the new CFL ceiling', () => {
    // CFL: dtMax = min(Δx) / (c · √N). Increasing c shrinks dtMax.
    // Bug regression: setDiracSpeedOfLight used to be a plain clamped setter
    // and left a stale dt in place, pushing the lattice past stability.
    const s = useExtendedObjectStore.getState()
    s.setDiracSpacing([0.15, 0.15, 0.15])
    s.setDiracDt(0.05) // safe at c=1: dtMax≈0.0866 → clamps to ~0.078
    const dtBefore = getDirac().dt
    expect(dtBefore).toBeGreaterThan(0.04)

    // Raise c by 5×: new dtMax≈0.01732 → dt must drop below the new ceiling
    s.setDiracSpeedOfLight(5)
    const dtAfter = getDirac().dt
    const newCflCeiling = 0.15 / (5 * Math.sqrt(3))
    expect(dtAfter).toBeLessThanOrEqual(newCflCeiling * 0.9 + 1e-9)
    expect(dtAfter).toBeGreaterThan(0)
    expect(getDirac().speedOfLight).toBe(5)
  })

  it('leaves dt untouched when speedOfLight drops (looser CFL keeps dt valid)', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracSpacing([0.15, 0.15, 0.15])
    s.setDiracSpeedOfLight(5)
    s.setDiracDt(0.01)
    const dtBefore = getDirac().dt

    s.setDiracSpeedOfLight(0.5) // looser CFL — dt is well within bounds
    expect(getDirac().dt).toBe(dtBefore)
  })

  it('re-clamps dt when spacing tightens past the CFL ceiling', () => {
    // dtMax shrinks linearly with min(spacing), so a 5× tighter grid forces dt down.
    const s = useExtendedObjectStore.getState()
    s.setDiracSpacing([0.5, 0.5, 0.5])
    s.setDiracDt(0.2)
    const dtBefore = getDirac().dt
    expect(dtBefore).toBeGreaterThan(0.1)

    s.setDiracSpacing([0.05, 0.05, 0.05])
    const dtAfter = getDirac().dt
    const newCflCeiling = 0.05 / (1 * Math.sqrt(3))
    expect(dtAfter).toBeLessThanOrEqual(newCflCeiling * 0.9 + 1e-9)
    expect(dtAfter).toBeGreaterThan(0)
  })

  it('re-clamps packetWidth when spacing tightens past the lattice-extent ceiling', () => {
    // Tightening spacing shrinks the lattice extent — a wide packet that fits
    // at coarse spacing must be re-bounded so it doesn't wrap around the
    // periodic FFT boundary. Mirrors the formula used by resizeDiracArrays
    // and applyDiracPreset (max σ = 0.4 × min half-extent).
    const s = useExtendedObjectStore.getState()
    s.setDiracSpacing([0.5, 0.5, 0.5])
    s.setDiracPacketWidth(2.0) // safe at spacing=0.5: maxSigma = 64*0.5*0.5*0.4 = 6.4
    const widthBefore = getDirac().packetWidth
    expect(widthBefore).toBe(2.0)

    s.setDiracSpacing([0.01, 0.01, 0.01]) // half-extent shrinks to 0.32 → maxSigma = 0.128
    const widthAfter = getDirac().packetWidth
    expect(widthAfter).toBeLessThanOrEqual(0.128 + 1e-9)
    expect(widthAfter).toBeGreaterThan(0)
  })

  it('leaves packetWidth untouched when spacing widens (lattice extent grows)', () => {
    const s = useExtendedObjectStore.getState()
    s.setDiracSpacing([0.05, 0.05, 0.05])
    s.setDiracPacketWidth(0.5)
    const widthBefore = getDirac().packetWidth
    expect(widthBefore).toBe(0.5)

    s.setDiracSpacing([0.5, 0.5, 0.5]) // looser — looser ceiling, no re-clamp needed
    expect(getDirac().packetWidth).toBe(widthBefore)
  })

  it('re-clamps packetWidth when grid size shrinks past the lattice-extent ceiling', () => {
    // Same invariant as the spacing test, but driven via gridSize instead.
    // setDiracGridSize snaps to power-of-2 so we use [4, 4, 4] (the floor for
    // latticeDim=3 from minDiracGridPerDim).
    const s = useExtendedObjectStore.getState()
    s.setDiracSpacing([0.15, 0.15, 0.15])
    s.setDiracPacketWidth(1.5) // OK at gridSize=64: maxSigma = 64*0.15*0.5*0.4 = 1.92
    const widthBefore = getDirac().packetWidth
    expect(widthBefore).toBe(1.5)

    s.setDiracGridSize([4, 4, 4]) // half-extent shrinks → maxSigma = 4*0.15*0.5*0.4 = 0.12
    const widthAfter = getDirac().packetWidth
    expect(widthAfter).toBeLessThanOrEqual(0.12 + 1e-9)
    expect(widthAfter).toBeGreaterThan(0)
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
