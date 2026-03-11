import { beforeEach, describe, expect, it } from 'vitest'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { DEFAULT_DIRAC_CONFIG } from '@/lib/geometry/extended/types'

describe('Dirac store slice', () => {
  beforeEach(() => {
    useExtendedObjectStore.setState({
      schroedinger: {
        ...useExtendedObjectStore.getState().schroedinger,
        dirac: { ...DEFAULT_DIRAC_CONFIG },
        quantumMode: 'diracEquation',
      },
    })
  })

  it('has correct default Dirac config', () => {
    const d = useExtendedObjectStore.getState().schroedinger.dirac
    expect(d.latticeDim).toBe(3)
    expect(d.mass).toBe(1.0)
    expect(d.speedOfLight).toBe(1.0)
    expect(d.hbar).toBe(1.0)
    expect(d.initialCondition).toBe('gaussianPacket')
    expect(d.fieldView).toBe('totalDensity')
    expect(d.potentialType).toBe('step')
    expect(d.absorberEnabled).toBe(true)
    expect(d.diagnosticsEnabled).toBe(true)
    expect(d.needsReset).toBe(true)
  })

  it('setDiracMass clamps to [0.01, 10]', () => {
    const store = useExtendedObjectStore.getState()
    store.setDiracMass(5)
    expect(useExtendedObjectStore.getState().schroedinger.dirac.mass).toBe(5)

    store.setDiracMass(0)
    expect(useExtendedObjectStore.getState().schroedinger.dirac.mass).toBe(0.01)

    store.setDiracMass(99)
    expect(useExtendedObjectStore.getState().schroedinger.dirac.mass).toBe(10)
  })

  it('setDiracSpeedOfLight clamps to [0.01, 10]', () => {
    const store = useExtendedObjectStore.getState()
    store.setDiracSpeedOfLight(2)
    expect(useExtendedObjectStore.getState().schroedinger.dirac.speedOfLight).toBe(2)

    store.setDiracSpeedOfLight(0)
    expect(useExtendedObjectStore.getState().schroedinger.dirac.speedOfLight).toBe(0.01)

    store.setDiracSpeedOfLight(99)
    expect(useExtendedObjectStore.getState().schroedinger.dirac.speedOfLight).toBe(10)
  })

  it('setDiracFieldView changes view', () => {
    const store = useExtendedObjectStore.getState()
    store.setDiracFieldView('particleDensity')
    expect(useExtendedObjectStore.getState().schroedinger.dirac.fieldView).toBe('particleDensity')

    store.setDiracFieldView('antiparticleDensity')
    expect(useExtendedObjectStore.getState().schroedinger.dirac.fieldView).toBe('antiparticleDensity')
  })

  it('setDiracInitialCondition changes condition', () => {
    const store = useExtendedObjectStore.getState()
    store.setDiracInitialCondition('planeWave')
    expect(useExtendedObjectStore.getState().schroedinger.dirac.initialCondition).toBe('planeWave')
  })

  it('setDiracPotentialType changes type', () => {
    const store = useExtendedObjectStore.getState()
    store.setDiracPotentialType('coulomb')
    expect(useExtendedObjectStore.getState().schroedinger.dirac.potentialType).toBe('coulomb')
  })

  it('setDiracAbsorberEnabled toggles absorber', () => {
    const store = useExtendedObjectStore.getState()
    store.setDiracAbsorberEnabled(false)
    expect(useExtendedObjectStore.getState().schroedinger.dirac.absorberEnabled).toBe(false)

    store.setDiracAbsorberEnabled(true)
    expect(useExtendedObjectStore.getState().schroedinger.dirac.absorberEnabled).toBe(true)
  })

  it('setDiracDt clamps to valid range', () => {
    const store = useExtendedObjectStore.getState()
    store.setDiracDt(0.01)
    expect(useExtendedObjectStore.getState().schroedinger.dirac.dt).toBe(0.01)
  })

  it('setDiracGridSize updates grid array', () => {
    const store = useExtendedObjectStore.getState()
    store.setDiracGridSize([32, 32, 32])
    expect(useExtendedObjectStore.getState().schroedinger.dirac.gridSize[0]).toBe(32)
  })

  it('setDiracSpacing updates spacing array', () => {
    const store = useExtendedObjectStore.getState()
    store.setDiracSpacing([0.25, 0.25, 0.25])
    expect(useExtendedObjectStore.getState().schroedinger.dirac.spacing[1]).toBe(0.25)
  })

  it('setDiracNeedsReset sets needsReset flag', () => {
    const store = useExtendedObjectStore.getState()
    // Reset first
    useExtendedObjectStore.setState({
      schroedinger: {
        ...useExtendedObjectStore.getState().schroedinger,
        dirac: { ...useExtendedObjectStore.getState().schroedinger.dirac, needsReset: false },
      },
    })
    expect(useExtendedObjectStore.getState().schroedinger.dirac.needsReset).toBe(false)

    store.setDiracNeedsReset()
    expect(useExtendedObjectStore.getState().schroedinger.dirac.needsReset).toBe(true)
  })

  it('ignores non-finite mass updates', () => {
    const store = useExtendedObjectStore.getState()
    store.setDiracMass(2)
    expect(useExtendedObjectStore.getState().schroedinger.dirac.mass).toBe(2)

    store.setDiracMass(NaN)
    expect(useExtendedObjectStore.getState().schroedinger.dirac.mass).toBe(2)

    store.setDiracMass(Infinity)
    expect(useExtendedObjectStore.getState().schroedinger.dirac.mass).toBe(2)
  })

  it('switching to diracEquation mode forces position representation', () => {
    // Set to non-position first
    useExtendedObjectStore.setState({
      schroedinger: {
        ...useExtendedObjectStore.getState().schroedinger,
        representation: 'momentum',
        quantumMode: 'harmonicOscillator',
      },
    })

    const store = useExtendedObjectStore.getState()
    store.setSchroedingerQuantumMode('diracEquation')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')
  })
})
