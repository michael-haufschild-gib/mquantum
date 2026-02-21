import { beforeEach, describe, expect, it } from 'vitest'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/types'

describe('extendedObjectStore (invariants)', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('schroedinger scale setting updates config', () => {
    useExtendedObjectStore.getState().setSchroedingerScale(1.5)
    expect(useExtendedObjectStore.getState().schroedinger.scale).toBe(1.5)
  })

  it('ignores non-finite schroedinger scale updates', () => {
    useExtendedObjectStore.getState().setSchroedingerScale(1.5)

    useExtendedObjectStore.getState().setSchroedingerScale(Number.NaN)
    useExtendedObjectStore.getState().setSchroedingerScale(Number.POSITIVE_INFINITY)
    useExtendedObjectStore.getState().setSchroedingerScale(Number.NEGATIVE_INFINITY)

    expect(useExtendedObjectStore.getState().schroedinger.scale).toBe(1.5)
  })

  it('schroedinger quality preset updates related settings together', () => {
    useExtendedObjectStore.getState().setSchroedingerQualityPreset('draft')
    const draft = useExtendedObjectStore.getState().schroedinger
    expect(draft.qualityPreset).toBe('draft')

    useExtendedObjectStore.getState().setSchroedingerQualityPreset('ultra')
    const ultra = useExtendedObjectStore.getState().schroedinger
    expect(ultra.qualityPreset).toBe('ultra')
  })

  it('updates representation and momentum display settings', () => {
    useExtendedObjectStore.getState().setSchroedingerRepresentation('momentum')
    useExtendedObjectStore.getState().setSchroedingerMomentumDisplayUnits('p')

    const config = useExtendedObjectStore.getState().schroedinger
    expect(config.representation).toBe('momentum')
    expect(config.momentumDisplayUnits).toBe('p')
  })

  it('clamps momentum scale and hbar ranges', () => {
    useExtendedObjectStore.getState().setSchroedingerMomentumScale(99)
    useExtendedObjectStore.getState().setSchroedingerMomentumHbar(0)

    let config = useExtendedObjectStore.getState().schroedinger
    expect(config.momentumScale).toBe(4.0)
    expect(config.momentumHbar).toBe(0.01)

    useExtendedObjectStore.getState().setSchroedingerMomentumScale(-1)
    useExtendedObjectStore.getState().setSchroedingerMomentumHbar(99)

    config = useExtendedObjectStore.getState().schroedinger
    expect(config.momentumScale).toBe(0.1)
    expect(config.momentumHbar).toBe(10.0)
  })

  it('ignores non-finite discrete Wigner and probability-current step updates', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerWignerDimensionIndex(3)
    store.setSchroedingerWignerQuadPoints(20)
    store.setSchroedingerWignerCacheResolution(512)
    store.setSchroedingerProbabilityCurrentSteps(24)

    store.setSchroedingerWignerDimensionIndex(Number.NaN)
    store.setSchroedingerWignerDimensionIndex(Number.POSITIVE_INFINITY)
    store.setSchroedingerWignerQuadPoints(Number.NaN)
    store.setSchroedingerWignerQuadPoints(Number.NEGATIVE_INFINITY)
    store.setSchroedingerWignerCacheResolution(Number.NaN)
    store.setSchroedingerWignerCacheResolution(Number.POSITIVE_INFINITY)
    store.setSchroedingerProbabilityCurrentSteps(Number.NaN)
    store.setSchroedingerProbabilityCurrentSteps(Number.NEGATIVE_INFINITY)

    const config = useExtendedObjectStore.getState().schroedinger
    expect(config.wignerDimensionIndex).toBe(3)
    expect(config.wignerQuadPoints).toBe(20)
    expect(config.wignerCacheResolution).toBe(512)
    expect(config.probabilityCurrentSteps).toBe(24)
  })

  it('ignores non-finite top-level schroedinger numeric updates', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerExtent(2.2)
    store.setSchroedingerSeed(123)
    store.setSchroedingerTermCount(4)
    store.setSchroedingerMaxQuantumNumber(5)
    store.setSchroedingerFrequencySpread(0.2)
    store.setSchroedingerBohrRadiusScale(1.4)
    store.setSchroedingerExtraDimOmega(0, 1.3)
    store.setSchroedingerExtraDimOmegaAll([1.1, 1.2, 1.3, 1.4, 1.5, 1.1, 1.2, 1.3])
    store.setSchroedingerExtraDimFrequencySpread(0.25)
    store.setSchroedingerCrossSectionWindowMin(-1.2)
    store.setSchroedingerCrossSectionWindowMax(1.8)

    const before = useExtendedObjectStore.getState().schroedinger

    store.setSchroedingerExtent(Number.NaN)
    store.setSchroedingerSeed(Number.POSITIVE_INFINITY)
    store.setSchroedingerTermCount(Number.NaN)
    store.setSchroedingerMaxQuantumNumber(Number.POSITIVE_INFINITY)
    store.setSchroedingerFrequencySpread(Number.NaN)
    store.setSchroedingerBohrRadiusScale(Number.NEGATIVE_INFINITY)
    store.setSchroedingerExtraDimOmega(0, Number.NaN)
    store.setSchroedingerExtraDimOmegaAll([1.1, Number.NaN, 1.3, 1.4, 1.5, 1.1, 1.2, 1.3])
    store.setSchroedingerExtraDimFrequencySpread(Number.POSITIVE_INFINITY)
    store.setSchroedingerCrossSectionWindowMin(Number.NaN)
    store.setSchroedingerCrossSectionWindowMax(Number.POSITIVE_INFINITY)

    const after = useExtendedObjectStore.getState().schroedinger
    expect(after.extent).toBe(before.extent)
    expect(after.seed).toBe(before.seed)
    expect(after.termCount).toBe(before.termCount)
    expect(after.maxQuantumNumber).toBe(before.maxQuantumNumber)
    expect(after.frequencySpread).toBe(before.frequencySpread)
    expect(after.bohrRadiusScale).toBe(before.bohrRadiusScale)
    expect(after.extraDimOmega).toEqual(before.extraDimOmega)
    expect(after.extraDimFrequencySpread).toBe(before.extraDimFrequencySpread)
    expect(after.crossSectionWindowMin).toBe(before.crossSectionWindowMin)
    expect(after.crossSectionWindowMax).toBe(before.crossSectionWindowMax)
  })

  it('ignores non-finite resolution, axis, parameter, and quantum-number updates', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerResolution(64)
    store.setSchroedingerVisualizationAxis(0, 2)
    store.setSchroedingerParameterValues([0.4, -0.3, 0.2])
    store.setSchroedingerParameterValue(1, 0.5)
    store.setSchroedingerPrincipalQuantumNumber(4)
    store.setSchroedingerAzimuthalQuantumNumber(2)
    store.setSchroedingerMagneticQuantumNumber(1)
    store.setSchroedingerExtraDimQuantumNumber(0, 3)
    store.setSchroedingerExtraDimQuantumNumbers([1, 2, 3, 4, 5, 6, 0, 1])

    const before = useExtendedObjectStore.getState().schroedinger

    store.setSchroedingerResolution(Number.NaN)
    store.setSchroedingerVisualizationAxis(0, Number.NaN)
    store.setSchroedingerParameterValue(1, Number.NaN)
    store.setSchroedingerParameterValues([0.2, Number.NaN, 0.1])
    store.setSchroedingerPrincipalQuantumNumber(Number.NaN)
    store.setSchroedingerAzimuthalQuantumNumber(Number.POSITIVE_INFINITY)
    store.setSchroedingerMagneticQuantumNumber(Number.NaN)
    store.setSchroedingerExtraDimQuantumNumber(0, Number.NaN)
    store.setSchroedingerExtraDimQuantumNumbers([1, 2, Number.NaN, 4, 5, 6, 0, 1])

    const after = useExtendedObjectStore.getState().schroedinger
    expect(after.resolution).toBe(before.resolution)
    expect(after.visualizationAxes).toEqual(before.visualizationAxes)
    expect(after.parameterValues).toEqual(before.parameterValues)
    expect(after.principalQuantumNumber).toBe(before.principalQuantumNumber)
    expect(after.azimuthalQuantumNumber).toBe(before.azimuthalQuantumNumber)
    expect(after.magneticQuantumNumber).toBe(before.magneticQuantumNumber)
    expect(after.extraDimQuantumNumbers).toEqual(before.extraDimQuantumNumbers)
  })

  it('reset restores defaults', () => {
    useExtendedObjectStore.getState().setSchroedingerScale(5)
    useExtendedObjectStore.getState().setSchroedingerQualityPreset('ultra')

    useExtendedObjectStore.getState().reset()
    expect(useExtendedObjectStore.getState().schroedinger).toEqual({
      ...DEFAULT_SCHROEDINGER_CONFIG,
    })
  })
})
