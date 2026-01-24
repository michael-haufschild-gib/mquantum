import { describe, it, expect } from 'vitest'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { SCHROEDINGER_NAMED_PRESETS } from '@/lib/geometry/extended/schroedinger/presets'

describe('Schroedinger Store Presets', () => {
  it('should update configuration parameters when preset is selected', () => {
    const store = useExtendedObjectStore.getState()
    const presetName = 'highEnergy'
    const presetConfig = SCHROEDINGER_NAMED_PRESETS[presetName]

    // Verify we have a valid preset to test against
    expect(presetConfig).toBeDefined()
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
})
