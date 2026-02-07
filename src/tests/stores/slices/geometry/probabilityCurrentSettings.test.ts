import { beforeEach, describe, expect, it } from 'vitest'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('Schroedinger probability current settings', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('provides physical probability current defaults', () => {
    const config = useExtendedObjectStore.getState().schroedinger

    expect(config.probabilityCurrentEnabled).toBe(false)
    expect(config.probabilityCurrentStyle).toBe('magnitude')
    expect(config.probabilityCurrentPlacement).toBe('isosurface')
    expect(config.probabilityCurrentColorMode).toBe('magnitude')
    expect(config.probabilityCurrentScale).toBe(1.0)
    expect(config.probabilityCurrentSpeed).toBe(1.0)
    expect(config.probabilityCurrentDensityThreshold).toBe(0.01)
    expect(config.probabilityCurrentMagnitudeThreshold).toBe(0.0)
    expect(config.probabilityCurrentLineDensity).toBe(8.0)
    expect(config.probabilityCurrentStepSize).toBe(0.04)
    expect(config.probabilityCurrentSteps).toBe(20)
    expect(config.probabilityCurrentOpacity).toBe(0.7)
  })

  it('updates and clamps probability current controls', () => {
    const store = useExtendedObjectStore.getState()

    store.setSchroedingerProbabilityCurrentEnabled(true)
    store.setSchroedingerProbabilityCurrentStyle('surfaceLIC')
    store.setSchroedingerProbabilityCurrentPlacement('volume')
    store.setSchroedingerProbabilityCurrentColorMode('direction')

    store.setSchroedingerProbabilityCurrentScale(-3.0)
    expect(useExtendedObjectStore.getState().schroedinger.probabilityCurrentScale).toBe(0.0)

    store.setSchroedingerProbabilityCurrentScale(12.0)
    expect(useExtendedObjectStore.getState().schroedinger.probabilityCurrentScale).toBe(5.0)

    store.setSchroedingerProbabilityCurrentDensityThreshold(-0.5)
    expect(useExtendedObjectStore.getState().schroedinger.probabilityCurrentDensityThreshold).toBe(
      0.0
    )

    store.setSchroedingerProbabilityCurrentMagnitudeThreshold(20.0)
    expect(
      useExtendedObjectStore.getState().schroedinger.probabilityCurrentMagnitudeThreshold
    ).toBe(10.0)

    store.setSchroedingerProbabilityCurrentLineDensity(0.0)
    expect(useExtendedObjectStore.getState().schroedinger.probabilityCurrentLineDensity).toBe(1.0)

    store.setSchroedingerProbabilityCurrentStepSize(0.5)
    expect(useExtendedObjectStore.getState().schroedinger.probabilityCurrentStepSize).toBe(0.2)

    store.setSchroedingerProbabilityCurrentSteps(100)
    expect(useExtendedObjectStore.getState().schroedinger.probabilityCurrentSteps).toBe(64)

    store.setSchroedingerProbabilityCurrentOpacity(2.0)
    expect(useExtendedObjectStore.getState().schroedinger.probabilityCurrentOpacity).toBe(1.0)

    const config = useExtendedObjectStore.getState().schroedinger
    expect(config.probabilityCurrentEnabled).toBe(true)
    expect(config.probabilityCurrentStyle).toBe('surfaceLIC')
    expect(config.probabilityCurrentPlacement).toBe('volume')
    expect(config.probabilityCurrentColorMode).toBe('direction')
  })
})
