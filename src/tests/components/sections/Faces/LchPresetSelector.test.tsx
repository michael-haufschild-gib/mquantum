/**
 * Tests for LchPresetSelector component
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LchPresetSelector } from '@/components/sections/Faces/LchPresetSelector'
import { LCH_PRESET_OPTIONS } from '@/rendering/shaders/palette'
import { useAppearanceStore } from '@/stores/appearanceStore'

describe('LchPresetSelector', () => {
  beforeEach(() => {
    useAppearanceStore.getState().reset()
    vi.clearAllMocks()
  })

  it('renders a "LCH Preset" label', () => {
    render(<LchPresetSelector />)
    expect(screen.getByText('LCH Preset')).toBeInTheDocument()
  })

  it('shows "Custom" option in the dropdown', () => {
    render(<LchPresetSelector />)
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('shows "Custom" when lch values match no preset', () => {
    // Set values that don't match any preset
    useAppearanceStore.getState().setLchLightness(0.333)
    useAppearanceStore.getState().setLchChroma(0.111)

    render(<LchPresetSelector />)

    const select = screen.getByRole('combobox')
    expect(select).toHaveValue('custom')
  })

  it('matches the correct preset when lch values align', () => {
    const preset = LCH_PRESET_OPTIONS[0]!
    useAppearanceStore.getState().setLchLightness(preset.lightness)
    useAppearanceStore.getState().setLchChroma(preset.chroma)

    render(<LchPresetSelector />)

    const select = screen.getByRole('combobox')
    expect(select).toHaveValue(preset.value)
  })

  it('updates lightness and chroma in store when a preset is selected', async () => {
    const user = userEvent.setup()
    render(<LchPresetSelector />)

    const preset = LCH_PRESET_OPTIONS[1]! // second preset to avoid matching default
    const select = screen.getByRole('combobox')

    await user.selectOptions(select, preset.value)

    const state = useAppearanceStore.getState()
    expect(Math.abs(state.lchLightness - preset.lightness)).toBeLessThan(0.001)
    expect(Math.abs(state.lchChroma - preset.chroma)).toBeLessThan(0.001)
  })

  it('does not update store when "custom" is selected', async () => {
    const user = userEvent.setup()
    const preset = LCH_PRESET_OPTIONS[0]!
    useAppearanceStore.getState().setLchLightness(preset.lightness)
    useAppearanceStore.getState().setLchChroma(preset.chroma)

    render(<LchPresetSelector />)

    const lightnessBefore = useAppearanceStore.getState().lchLightness
    const select = screen.getByRole('combobox')
    await user.selectOptions(select, 'custom')

    expect(useAppearanceStore.getState().lchLightness).toBe(lightnessBefore)
  })

  it('applies optional className to wrapper div', () => {
    render(<LchPresetSelector className="lch-class" />)
    // The wrapper renders the label — find it and check the parent has the class
    const label = screen.getByText('LCH Preset')
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- checking className on wrapper div that has no testid
    expect(label.closest('.lch-class')).toBeInTheDocument()
  })

  it('renders all LCH_PRESET_OPTIONS as select options', () => {
    render(<LchPresetSelector />)
    for (const preset of LCH_PRESET_OPTIONS) {
      expect(screen.getByText(preset.label)).toBeInTheDocument()
    }
  })
})
