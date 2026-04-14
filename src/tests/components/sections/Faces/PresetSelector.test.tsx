/**
 * Tests for PresetSelector component
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PresetSelector } from '@/components/sections/Faces/PresetSelector'
import { COSINE_PRESET_OPTIONS } from '@/rendering/shaders/palette'
import { useAppearanceStore } from '@/stores/appearanceStore'

describe('PresetSelector', () => {
  beforeEach(() => {
    useAppearanceStore.getState().reset()
    vi.clearAllMocks()
  })

  it('renders a "Palette Preset" label', () => {
    render(<PresetSelector />)
    expect(screen.getByText('Palette Preset')).toBeInTheDocument()
  })

  it('shows "Custom" option in the dropdown', () => {
    render(<PresetSelector />)
    // Select component renders options — find the custom option label
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('displays "Custom" as selected when cosine coefficients do not match any preset', () => {
    // Set coefficients that match no preset
    useAppearanceStore.getState().setCosineCoefficients({
      a: [0.123, 0.456, 0.789],
      b: [0.111, 0.222, 0.333],
      c: [0.444, 0.555, 0.666],
      d: [0.777, 0.888, 0.999],
    })

    render(<PresetSelector />)

    // The select value should show Custom
    const select = screen.getByRole('combobox')
    expect(select).toHaveValue('custom')
  })

  it('updates store when a known preset is selected', async () => {
    const user = userEvent.setup()
    render(<PresetSelector />)

    const select = screen.getByRole('combobox')
    const firstPreset = COSINE_PRESET_OPTIONS[0]!

    await user.selectOptions(select, firstPreset.value)

    const state = useAppearanceStore.getState()
    expect(state.cosineCoefficients.a).toEqual(firstPreset.coefficients.a)
    expect(state.cosineCoefficients.b).toEqual(firstPreset.coefficients.b)
  })

  it('matches the first preset name when its coefficients are active', () => {
    const firstPreset = COSINE_PRESET_OPTIONS[0]!
    useAppearanceStore.getState().setCosineCoefficients(firstPreset.coefficients)

    render(<PresetSelector />)

    const select = screen.getByRole('combobox')
    expect(select).toHaveValue(firstPreset.value)
  })

  it('does not update store when "custom" is selected', async () => {
    const user = userEvent.setup()
    // Set a known preset first
    const firstPreset = COSINE_PRESET_OPTIONS[0]!
    useAppearanceStore.getState().setCosineCoefficients(firstPreset.coefficients)

    render(<PresetSelector />)

    const select = screen.getByRole('combobox')
    // Select custom — store should remain unchanged
    const stateBefore = useAppearanceStore.getState().cosineCoefficients
    await user.selectOptions(select, 'custom')

    const stateAfter = useAppearanceStore.getState().cosineCoefficients
    expect(stateAfter.a).toEqual(stateBefore.a)
  })

  it('applies optional className prop to wrapper', () => {
    render(<PresetSelector className="test-class" />)
    expect(screen.getByTestId('palette-preset-selector')).toHaveClass('test-class')
  })
})
