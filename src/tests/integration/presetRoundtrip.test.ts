/**
 * Cross-store preset save/load roundtrip integration test.
 *
 * Verifies that saving a style preset captures all visual state from
 * multiple stores and that loading it restores every field correctly.
 * This catches bugs where a store field is added but not included
 * in the serialization chain, or where normalization corrupts valid data.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppearanceStore } from '@/stores/appearanceStore'
import { useLightingStore } from '@/stores/lightingStore'
import { usePostProcessingStore } from '@/stores/postProcessingStore'
import { usePresetManagerStore } from '@/stores/presetManagerStore'

// Mock msgBoxStore to prevent dialog calls
vi.mock('@/stores/msgBoxStore', () => ({
  useMsgBoxStore: {
    getState: () => ({
      showMsgBox: vi.fn(),
      closeMsgBox: vi.fn(),
    }),
  },
}))

// Mock the conditional message box hook to prevent hydration checks
vi.mock('@/hooks/useConditionalMsgBox', () => ({
  showConditionalMsgBox: vi.fn(),
  useConditionalMsgBox: vi.fn(),
}))

describe('style preset save/load roundtrip', () => {
  beforeEach(() => {
    usePresetManagerStore.setState({ savedStyles: [], savedScenes: [] })
    useAppearanceStore.getState().reset()
    useLightingStore.getState().reset()
  })

  it('appearance store fields survive save/load roundtrip', () => {
    // Set non-default appearance values
    useAppearanceStore.getState().setEdgeColor('#FF00FF')
    useAppearanceStore.getState().setFaceEmission(0.75)

    const edgeBefore = useAppearanceStore.getState().edgeColor
    const emissionBefore = useAppearanceStore.getState().faceEmission

    // Save
    usePresetManagerStore.getState().saveStyle('Test Appearance')
    const [saved] = usePresetManagerStore.getState().savedStyles
    expect(saved?.name).toBe('Test Appearance')

    // Reset to defaults
    useAppearanceStore.getState().reset()
    expect(useAppearanceStore.getState().edgeColor).not.toBe(edgeBefore)

    // Load
    usePresetManagerStore.getState().loadStyle(saved!.id)

    // Verify restoration
    expect(useAppearanceStore.getState().edgeColor).toBe(edgeBefore)
    expect(useAppearanceStore.getState().faceEmission).toBeCloseTo(emissionBefore)
  })

  it('lighting store fields survive save/load roundtrip', () => {
    // Set non-default lighting values
    useLightingStore.getState().setLightStrength(2.0)
    useLightingStore.getState().setExposure(1.5)
    useLightingStore.getState().setAmbientIntensity(0.7)

    const strengthBefore = useLightingStore.getState().lightStrength
    const exposureBefore = useLightingStore.getState().exposure
    const ambientBefore = useLightingStore.getState().ambientIntensity

    // Save
    usePresetManagerStore.getState().saveStyle('Test Lighting')
    const [saved] = usePresetManagerStore.getState().savedStyles

    // Reset
    useLightingStore.getState().reset()

    // Load
    usePresetManagerStore.getState().loadStyle(saved!.id)

    // Verify
    expect(useLightingStore.getState().lightStrength).toBeCloseTo(strengthBefore)
    expect(useLightingStore.getState().exposure).toBeCloseTo(exposureBefore)
    expect(useLightingStore.getState().ambientIntensity).toBeCloseTo(ambientBefore)
  })

  it('post-processing store fields survive save/load roundtrip', () => {
    usePostProcessingStore.getState().setBloomEnabled(true)
    usePostProcessingStore.getState().setBloomGain(0.8)
    usePostProcessingStore.getState().setBloomThreshold(0.3)

    const bloomEnabledBefore = usePostProcessingStore.getState().bloomEnabled
    const bloomGainBefore = usePostProcessingStore.getState().bloomGain
    const bloomThresholdBefore = usePostProcessingStore.getState().bloomThreshold

    // Save
    usePresetManagerStore.getState().saveStyle('Test PostProcessing')
    const [saved] = usePresetManagerStore.getState().savedStyles

    // Change to different values (simulate "reset" without calling .reset())
    usePostProcessingStore.getState().setBloomEnabled(false)
    usePostProcessingStore.getState().setBloomGain(0.1)
    usePostProcessingStore.getState().setBloomThreshold(0.9)
    expect(usePostProcessingStore.getState().bloomEnabled).not.toBe(bloomEnabledBefore)

    // Load
    usePresetManagerStore.getState().loadStyle(saved!.id)

    // Verify
    expect(usePostProcessingStore.getState().bloomEnabled).toBe(bloomEnabledBefore)
    expect(usePostProcessingStore.getState().bloomGain).toBeCloseTo(bloomGainBefore)
    expect(usePostProcessingStore.getState().bloomThreshold).toBeCloseTo(bloomThresholdBefore)
  })

  it('saves and loads back-to-back without cross-contamination', () => {
    // Save style A
    useAppearanceStore.getState().setEdgeColor('#FF0000')
    usePresetManagerStore.getState().saveStyle('Style A')

    // Save style B with different values
    useAppearanceStore.getState().setEdgeColor('#00FF00')
    usePresetManagerStore.getState().saveStyle('Style B')

    const styles = usePresetManagerStore.getState().savedStyles
    expect(styles).toHaveLength(2)

    // Load style A
    usePresetManagerStore.getState().loadStyle(styles[0]!.id)
    expect(useAppearanceStore.getState().edgeColor).toBe('#FF0000')

    // Load style B
    usePresetManagerStore.getState().loadStyle(styles[1]!.id)
    expect(useAppearanceStore.getState().edgeColor).toBe('#00FF00')

    // Load A again to confirm no contamination
    usePresetManagerStore.getState().loadStyle(styles[0]!.id)
    expect(useAppearanceStore.getState().edgeColor).toBe('#FF0000')
  })

  it('export/import roundtrip preserves style data', () => {
    useAppearanceStore.getState().setEdgeColor('#ABCDEF')
    useLightingStore.getState().setLightStrength(2.5)

    usePresetManagerStore.getState().saveStyle('Export Test')
    const exported = usePresetManagerStore.getState().exportStyles()

    // Clear all styles
    usePresetManagerStore.setState({ savedStyles: [] })
    expect(usePresetManagerStore.getState().savedStyles).toHaveLength(0)

    // Import
    const result = usePresetManagerStore.getState().importStyles(exported)
    expect(result).toBe(true)
    expect(usePresetManagerStore.getState().savedStyles).toHaveLength(1)

    // Load and verify
    const [imported] = usePresetManagerStore.getState().savedStyles
    useAppearanceStore.getState().reset()
    useLightingStore.getState().reset()

    usePresetManagerStore.getState().loadStyle(imported!.id)
    expect(useAppearanceStore.getState().edgeColor).toBe('#ABCDEF')
    expect(useLightingStore.getState().lightStrength).toBeCloseTo(2.5)
  })

  it('delete removes style and prevents future load', () => {
    usePresetManagerStore.getState().saveStyle('To Delete')
    const [saved] = usePresetManagerStore.getState().savedStyles
    const id = saved!.id

    usePresetManagerStore.getState().deleteStyle(id)
    expect(usePresetManagerStore.getState().savedStyles).toHaveLength(0)

    // Attempting to load deleted style should be a no-op
    useAppearanceStore.getState().setEdgeColor('#BEFORE')
    usePresetManagerStore.getState().loadStyle(id)
    expect(useAppearanceStore.getState().edgeColor).toBe('#BEFORE')
  })

  it('rename changes name without affecting data', () => {
    useAppearanceStore.getState().setEdgeColor('#RENAMED')
    usePresetManagerStore.getState().saveStyle('Original Name')
    const [saved] = usePresetManagerStore.getState().savedStyles

    usePresetManagerStore.getState().renameStyle(saved!.id, 'New Name')
    const [renamed] = usePresetManagerStore.getState().savedStyles
    expect(renamed!.name).toBe('New Name')

    // Data should be unchanged
    useAppearanceStore.getState().reset()
    usePresetManagerStore.getState().loadStyle(renamed!.id)
    expect(useAppearanceStore.getState().edgeColor).toBe('#RENAMED')
  })
})
