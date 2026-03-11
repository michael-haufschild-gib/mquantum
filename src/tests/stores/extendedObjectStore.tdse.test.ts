import { beforeEach, describe, expect, it } from 'vitest'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/types'

describe('TDSE store slice', () => {
  beforeEach(() => {
    // Reset to default state
    useExtendedObjectStore.setState({
      schroedinger: {
        ...useExtendedObjectStore.getState().schroedinger,
        tdse: { ...DEFAULT_TDSE_CONFIG },
        quantumMode: 'tdseDynamics',
      },
    })
  })

  it('has correct default TDSE config', () => {
    const td = useExtendedObjectStore.getState().schroedinger.tdse
    expect(td.latticeDim).toBe(DEFAULT_TDSE_CONFIG.latticeDim)
    expect(td.mass).toBe(DEFAULT_TDSE_CONFIG.mass)
    expect(td.hbar).toBe(DEFAULT_TDSE_CONFIG.hbar)
    expect(td.initialCondition).toBe(DEFAULT_TDSE_CONFIG.initialCondition)
    expect(td.potentialType).toBe(DEFAULT_TDSE_CONFIG.potentialType)
    expect(td.absorberEnabled).toBe(DEFAULT_TDSE_CONFIG.absorberEnabled)
    expect(td.diagnosticsEnabled).toBe(DEFAULT_TDSE_CONFIG.diagnosticsEnabled)
    expect(td.needsReset).toBe(false)
  })

  it('setTdseLatticeDim clamps to [1, 11]', () => {
    const store = useExtendedObjectStore.getState()
    store.setTdseLatticeDim(0)
    expect(useExtendedObjectStore.getState().schroedinger.tdse.latticeDim).toBe(1)

    store.setTdseLatticeDim(15)
    expect(useExtendedObjectStore.getState().schroedinger.tdse.latticeDim).toBe(11)

    store.setTdseLatticeDim(3)
    expect(useExtendedObjectStore.getState().schroedinger.tdse.latticeDim).toBe(3)
  })

  it('ignores non-finite lattice and grid-size updates', () => {
    const store = useExtendedObjectStore.getState()
    store.setTdseLatticeDim(3)
    store.setTdseGridSize([16, 32, 32])

    const before = useExtendedObjectStore.getState().schroedinger.tdse

    store.setTdseLatticeDim(Number.NaN)
    store.setTdseLatticeDim(Number.POSITIVE_INFINITY)
    store.setTdseLatticeDim(Number.NEGATIVE_INFINITY)
    store.setTdseGridSize([Number.NaN, 32, 32])
    store.setTdseGridSize([16, Number.POSITIVE_INFINITY, 32])
    store.setTdseGridSize([16, 32, Number.NEGATIVE_INFINITY])

    const after = useExtendedObjectStore.getState().schroedinger.tdse
    expect(after.latticeDim).toBe(before.latticeDim)
    expect(after.gridSize).toEqual(before.gridSize)
    expect(after.gridSize.every((v) => Number.isFinite(v))).toBe(true)
  })

  it('setTdseMass clamps to [0.01, 100]', () => {
    const store = useExtendedObjectStore.getState()
    store.setTdseMass(0.001)
    expect(useExtendedObjectStore.getState().schroedinger.tdse.mass).toBe(0.01)

    store.setTdseMass(200)
    expect(useExtendedObjectStore.getState().schroedinger.tdse.mass).toBe(100)
  })

  it('ignores non-finite scalar numeric updates', () => {
    const store = useExtendedObjectStore.getState()
    store.setTdseLatticeDim(4)
    store.setTdseSpacing([0.2, 0.2, 0.2, 0.2])
    store.setTdseMass(2.0)
    store.setTdseHbar(0.8)
    store.setTdseDt(0.01)
    store.setTdseStepsPerFrame(8)
    store.setTdsePacketWidth(0.6)
    store.setTdsePacketAmplitude(1.5)
    store.setTdseBarrierHeight(12)
    store.setTdseBarrierWidth(0.6)
    store.setTdseBarrierCenter(0.5)
    store.setTdseWellDepth(15)
    store.setTdseWellWidth(2.2)
    store.setTdseHarmonicOmega(3.4)
    store.setTdseStepHeight(7)
    store.setTdseDriveFrequency(2.5)
    store.setTdseDriveAmplitude(1.2)
    store.setTdseAbsorberWidth(0.12)
    store.setTdseAbsorberStrength(10)
    store.setTdseDiagnosticsInterval(9)
    store.setTdseSlicePosition(0, 0.4)

    const before = useExtendedObjectStore.getState().schroedinger.tdse

    store.setTdseSpacing([0.2, Number.NaN, 0.2, 0.2])
    store.setTdseMass(Number.NaN)
    store.setTdseHbar(Number.POSITIVE_INFINITY)
    store.setTdseDt(Number.NaN)
    store.setTdseStepsPerFrame(Number.NEGATIVE_INFINITY)
    store.setTdsePacketWidth(Number.NaN)
    store.setTdsePacketAmplitude(Number.POSITIVE_INFINITY)
    store.setTdseBarrierHeight(Number.NaN)
    store.setTdseBarrierWidth(Number.POSITIVE_INFINITY)
    store.setTdseBarrierCenter(Number.NaN)
    store.setTdseWellDepth(Number.POSITIVE_INFINITY)
    store.setTdseWellWidth(Number.NaN)
    store.setTdseHarmonicOmega(Number.POSITIVE_INFINITY)
    store.setTdseStepHeight(Number.NaN)
    store.setTdseDriveFrequency(Number.POSITIVE_INFINITY)
    store.setTdseDriveAmplitude(Number.NaN)
    store.setTdseAbsorberWidth(Number.POSITIVE_INFINITY)
    store.setTdseAbsorberStrength(Number.NaN)
    store.setTdseDiagnosticsInterval(Number.NaN)
    store.setTdseSlicePosition(0, Number.NaN)

    const after = useExtendedObjectStore.getState().schroedinger.tdse
    expect(after.spacing).toEqual(before.spacing)
    expect(after.mass).toBe(before.mass)
    expect(after.hbar).toBe(before.hbar)
    expect(after.dt).toBe(before.dt)
    expect(after.stepsPerFrame).toBe(before.stepsPerFrame)
    expect(after.packetWidth).toBe(before.packetWidth)
    expect(after.packetAmplitude).toBe(before.packetAmplitude)
    expect(after.barrierHeight).toBe(before.barrierHeight)
    expect(after.barrierWidth).toBe(before.barrierWidth)
    expect(after.barrierCenter).toBe(before.barrierCenter)
    expect(after.wellDepth).toBe(before.wellDepth)
    expect(after.wellWidth).toBe(before.wellWidth)
    expect(after.harmonicOmega).toBe(before.harmonicOmega)
    expect(after.stepHeight).toBe(before.stepHeight)
    expect(after.driveFrequency).toBe(before.driveFrequency)
    expect(after.driveAmplitude).toBe(before.driveAmplitude)
    expect(after.absorberWidth).toBe(before.absorberWidth)
    expect(after.absorberStrength).toBe(before.absorberStrength)
    expect(after.diagnosticsInterval).toBe(before.diagnosticsInterval)
    expect(after.slicePositions).toEqual(before.slicePositions)
  })

  it('setTdseDt clamps to [0.0001, 0.05]', () => {
    const store = useExtendedObjectStore.getState()
    store.setTdseDt(0)
    expect(useExtendedObjectStore.getState().schroedinger.tdse.dt).toBe(0.0001)

    store.setTdseDt(5)
    expect(useExtendedObjectStore.getState().schroedinger.tdse.dt).toBe(0.05)
  })

  it('setTdseStepsPerFrame clamps to [1, 16]', () => {
    const store = useExtendedObjectStore.getState()
    store.setTdseStepsPerFrame(0)
    expect(useExtendedObjectStore.getState().schroedinger.tdse.stepsPerFrame).toBe(1)

    store.setTdseStepsPerFrame(200)
    expect(useExtendedObjectStore.getState().schroedinger.tdse.stepsPerFrame).toBe(16)
  })

  it('setTdsePacketWidth clamps to [0.01, 100]', () => {
    const store = useExtendedObjectStore.getState()
    store.setTdsePacketWidth(0)
    expect(useExtendedObjectStore.getState().schroedinger.tdse.packetWidth).toBe(0.01)
  })

  it('setting an initial-condition parameter sets needsReset to true', () => {
    const store = useExtendedObjectStore.getState()
    expect(useExtendedObjectStore.getState().schroedinger.tdse.needsReset).toBe(false)

    store.setTdseInitialCondition('planeWave')
    expect(useExtendedObjectStore.getState().schroedinger.tdse.needsReset).toBe(true)
  })

  it('setting a potential parameter does NOT set needsReset (live update)', () => {
    const store = useExtendedObjectStore.getState()
    expect(useExtendedObjectStore.getState().schroedinger.tdse.needsReset).toBe(false)

    store.setTdsePotentialType('step')
    expect(useExtendedObjectStore.getState().schroedinger.tdse.needsReset).toBe(false)

    store.setTdseBarrierHeight(20)
    expect(useExtendedObjectStore.getState().schroedinger.tdse.needsReset).toBe(false)

    store.setTdseHarmonicOmega(2.0)
    expect(useExtendedObjectStore.getState().schroedinger.tdse.needsReset).toBe(false)
  })

  it('resetTdseField sets needsReset to true', () => {
    const store = useExtendedObjectStore.getState()
    store.resetTdseField()
    expect(useExtendedObjectStore.getState().schroedinger.tdse.needsReset).toBe(true)
  })

  it('clearTdseNeedsReset clears needsReset without version bump', () => {
    const store = useExtendedObjectStore.getState()
    store.setTdseInitialCondition('planeWave') // sets needsReset = true
    const versionBefore = useExtendedObjectStore.getState().schroedingerVersion
    store.clearTdseNeedsReset()
    expect(useExtendedObjectStore.getState().schroedinger.tdse.needsReset).toBe(false)
    expect(useExtendedObjectStore.getState().schroedingerVersion).toBe(versionBefore)
  })

  it('setTdseGridSize snaps to power-of-2 within budget', () => {
    const store = useExtendedObjectStore.getState()
    // For 3D, maxPerDim = 64. Inputs must be power of 2 and <= 64.
    store.setTdseGridSize([16, 32, 32])
    const td = useExtendedObjectStore.getState().schroedinger.tdse
    expect(td.gridSize[0]).toBe(16)
    expect(td.gridSize[1]).toBe(32)
    expect(td.gridSize[2]).toBe(32)
  })

  it('setTdseGridSize clamps non-power-of-2 to nearest power-of-2', () => {
    const store = useExtendedObjectStore.getState()
    store.setTdseGridSize([17, 30, 48])
    const td = useExtendedObjectStore.getState().schroedinger.tdse
    // 17 -> min(maxPerDim, 17)=17, round(log2(17))=4, 2^4=16
    expect(td.gridSize[0]).toBe(16)
    // 30 -> min(maxPerDim, 30)=30, round(log2(30))=5, 2^5=32
    expect(td.gridSize[1]).toBe(32)
    // 48 -> clamped to maxPerDim first (64 after FP fix: round(262144^(1/3))=64), min(64, 48)=48, round(log2(48))=6, 2^6=64, min(64,64)=64
    expect(td.gridSize[2]).toBe(64)
  })

  it('setTdseInitialCondition accepts valid values', () => {
    const store = useExtendedObjectStore.getState()
    store.setTdseInitialCondition('planeWave')
    expect(useExtendedObjectStore.getState().schroedinger.tdse.initialCondition).toBe('planeWave')

    store.setTdseInitialCondition('superposition')
    expect(useExtendedObjectStore.getState().schroedinger.tdse.initialCondition).toBe('superposition')
  })

  it('setTdsePotentialType accepts valid values', () => {
    const store = useExtendedObjectStore.getState()
    for (const type of ['free', 'barrier', 'step', 'finiteWell', 'harmonicTrap', 'driven'] as const) {
      store.setTdsePotentialType(type)
      expect(useExtendedObjectStore.getState().schroedinger.tdse.potentialType).toBe(type)
    }
  })

  it('setTdseAbsorberEnabled toggles absorber', () => {
    const store = useExtendedObjectStore.getState()
    store.setTdseAbsorberEnabled(false)
    expect(useExtendedObjectStore.getState().schroedinger.tdse.absorberEnabled).toBe(false)

    store.setTdseAbsorberEnabled(true)
    expect(useExtendedObjectStore.getState().schroedinger.tdse.absorberEnabled).toBe(true)
  })

  it('setTdseSlicePosition sets value within existing array bounds', () => {
    const store = useExtendedObjectStore.getState()
    // Default slicePositions is [] (latticeDim=3 → 0 extra dims). Expand to 4D first.
    store.setTdseLatticeDim(4)
    // Now slicePositions has length 1 (max(0, 4-3)=1)
    store.setTdseSlicePosition(0, 1.5)
    const sp = useExtendedObjectStore.getState().schroedinger.tdse.slicePositions
    expect(sp).toHaveLength(1)
    // Value is clamped to half-extent of the 4th grid dimension
    expect(typeof sp[0]).toBe('number')
    expect(sp[0]).not.toBe(0)
  })

  it('setTdseBarrierHeight clamps to [0, 100]', () => {
    const store = useExtendedObjectStore.getState()
    store.setTdseBarrierHeight(-5)
    expect(useExtendedObjectStore.getState().schroedinger.tdse.barrierHeight).toBe(0)

    store.setTdseBarrierHeight(200)
    expect(useExtendedObjectStore.getState().schroedinger.tdse.barrierHeight).toBe(100)
  })

  it('bumps schroedingerVersion on parameter changes', () => {
    const v0 = useExtendedObjectStore.getState().schroedingerVersion
    useExtendedObjectStore.getState().setTdseMass(2.0)
    const v1 = useExtendedObjectStore.getState().schroedingerVersion
    expect(v1).toBeGreaterThan(v0)
  })
})
