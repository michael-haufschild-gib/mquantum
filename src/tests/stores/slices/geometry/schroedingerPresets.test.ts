import { beforeEach, describe, expect, it } from 'vitest'

import { SCHROEDINGER_NAMED_PRESETS } from '@/lib/geometry/extended/schroedinger/presets'
import { useAppearanceStore } from '@/stores/scene/appearanceStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { APPEARANCE_INITIAL_STATE } from '@/stores/slices/appearanceSlice'

describe('Schroedinger Store Presets', () => {
  beforeEach(() => {
    useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
    useAppearanceStore.setState(APPEARANCE_INITIAL_STATE)
  })

  it('should update configuration parameters when preset is selected', () => {
    const store = useExtendedObjectStore.getState()
    const presetName = 'highEnergy'
    const presetConfig = SCHROEDINGER_NAMED_PRESETS[presetName]

    // Verify we have a valid preset to test against
    expect(presetConfig).toHaveProperty('seed')
    if (!presetConfig) throw new Error('presetConfig not found')

    // Apply the preset
    store.setSchroedingerPresetName(presetName)

    // Get updated state
    const config = useExtendedObjectStore.getState().schroedinger

    // Verify preset name was set
    expect(config.presetName).toBe(presetName)

    // Verify parameters were updated to match preset
    expect(config.seed).toBe(presetConfig.seed)
    expect(config.termCount).toBe(presetConfig.termCount)
    expect(config.maxQuantumNumber).toBe(presetConfig.maxN)
    expect(config.frequencySpread).toBe(presetConfig.frequencySpread)
  })

  it('should switch to custom when seed changes after selecting a named preset', () => {
    const store = useExtendedObjectStore.getState()

    store.setSchroedingerPresetName('groundState')
    const selectedPreset = useExtendedObjectStore.getState().schroedinger
    const updatedSeed = selectedPreset.seed + 1

    store.setSchroedingerSeed(updatedSeed)

    const config = useExtendedObjectStore.getState().schroedinger
    expect(config.seed).toBe(updatedSeed)
    expect(config.presetName).toBe('custom')
  })

  it('should not update parameters when switching to custom', () => {
    const store = useExtendedObjectStore.getState()

    // First set a known state via preset
    store.setSchroedingerPresetName('groundState')
    let config = useExtendedObjectStore.getState().schroedinger
    const groundStateSeed = config.seed

    // Now switch to custom
    store.setSchroedingerPresetName('custom')

    // Get updated state
    config = useExtendedObjectStore.getState().schroedinger

    // Verify preset name is custom
    expect(config.presetName).toBe('custom')

    // Verify parameters retained their previous values (didn't reset or clear)
    expect(config.seed).toBe(groundStateSeed)
  })

  it('should allow frequency spread up to 0.5', () => {
    const store = useExtendedObjectStore.getState()

    // Set a high value
    store.setSchroedingerFrequencySpread(0.45)

    expect(useExtendedObjectStore.getState().schroedinger.frequencySpread).toBe(0.45)

    // Try to set beyond max
    store.setSchroedingerFrequencySpread(0.6)
    expect(useExtendedObjectStore.getState().schroedinger.frequencySpread).toBe(0.5)
  })

  it('applies Fock Lantern Cathedral as an exact HO parity-lantern scenario', () => {
    const presetConfig = SCHROEDINGER_NAMED_PRESETS.fockLanternCathedral
    if (!presetConfig) throw new Error('fockLanternCathedral preset not found')

    expect(presetConfig.name).toBe('Fock Lantern Cathedral')
    expect(presetConfig.quantumNumbers).toEqual([
      [6, 0, 0],
      [0, 6, 0],
      [0, 0, 6],
      [4, 4, 0],
      [4, 0, 4],
      [0, 4, 4],
    ])
    expect(presetConfig.colorAlgorithm).toBe('phaseDensity')

    useExtendedObjectStore.getState().setSchroedingerPresetName('fockLanternCathedral')
    const config = useExtendedObjectStore.getState().schroedinger

    expect(config.presetName).toBe('fockLanternCathedral')
    expect(config.termCount).toBe(6)
    expect(config.maxQuantumNumber).toBe(6)
    expect(config.frequencySpread).toBe(0)
    expect(config.fockLanternEnabled).toBe(true)
    expect(config.densityGain).toBeCloseTo(3.6)
    expect(config.densityContrast).toBeCloseTo(3.1)
    expect(config.phaseMaterialityEnabled).toBe(true)
    expect(config.interferenceEnabled).toBe(true)
    expect(useAppearanceStore.getState().colorAlgorithm).toBe('phaseDensity')
  })

  it('resets Fock Lantern renderer gate when switching to a different named HO preset', () => {
    useExtendedObjectStore.getState().setSchroedingerPresetName('fockLanternCathedral')
    expect(useExtendedObjectStore.getState().schroedinger.fockLanternEnabled).toBe(true)

    useExtendedObjectStore.getState().setSchroedingerPresetName('groundState')

    const config = useExtendedObjectStore.getState().schroedinger
    expect(config.presetName).toBe('groundState')
    expect(config.fockLanternEnabled).toBe(false)
  })

  it('applies Hermite Cocycle Inflation as exact branch-obstruction scenarios', () => {
    const preset3D = SCHROEDINGER_NAMED_PRESETS.hermiteCocycleInflation3D
    const preset4D = SCHROEDINGER_NAMED_PRESETS.hermiteCocycleBulk4D
    if (!preset3D || !preset4D) throw new Error('Hermite cocycle presets not found')

    expect(preset3D.quantumNumbers).toEqual([
      [6, 1, 4],
      [1, 5, 2],
      [4, 2, 6],
      [3, 6, 1],
      [5, 3, 5],
    ])
    expect(preset4D.quantumNumbers?.[0]).toEqual([6, 0, 4, 2])
    expect(preset3D.colorAlgorithm).toBe('phaseDensity')
    expect(preset4D.colorAlgorithm).toBe('phaseDensity')

    useExtendedObjectStore.getState().setSchroedingerPresetName('hermiteCocycleInflation3D')
    const config3D = useExtendedObjectStore.getState().schroedinger

    expect(config3D.presetName).toBe('hermiteCocycleInflation3D')
    expect(config3D.termCount).toBe(5)
    expect(config3D.maxQuantumNumber).toBe(6)
    expect(config3D.frequencySpread).toBe(0)
    expect(config3D.hermiteCocycleInflationEnabled).toBe(true)
    expect(config3D.hermiteCocycleInflationStrength).toBeCloseTo(1.15)
    expect(config3D.hermiteCocycleShellRadius).toBeCloseTo(0.72)
    expect(config3D.hermiteCocycleInflationTwist).toBeCloseTo(3.7)

    useExtendedObjectStore.getState().setSchroedingerPresetName('hermiteCocycleBulk4D')
    const config4D = useExtendedObjectStore.getState().schroedinger

    expect(config4D.presetName).toBe('hermiteCocycleBulk4D')
    expect(config4D.hermiteCocycleInflationEnabled).toBe(true)
    expect(config4D.hermiteCocycleInflationStrength).toBeCloseTo(1.3)
    expect(config4D.hermiteCocycleShellRadius).toBeCloseTo(0.82)
    expect(config4D.hermiteCocycleInflationTwist).toBeCloseTo(5.1)
    expect(useAppearanceStore.getState().colorAlgorithm).toBe('phaseDensity')
  })

  it('resets Hermite Cocycle Inflation gate when switching to a different named HO preset', () => {
    useExtendedObjectStore.getState().setSchroedingerPresetName('hermiteCocycleInflation3D')
    expect(useExtendedObjectStore.getState().schroedinger.hermiteCocycleInflationEnabled).toBe(true)

    useExtendedObjectStore.getState().setSchroedingerPresetName('groundState')

    const config = useExtendedObjectStore.getState().schroedinger
    expect(config.presetName).toBe('groundState')
    expect(config.hermiteCocycleInflationEnabled).toBe(false)
  })
})
