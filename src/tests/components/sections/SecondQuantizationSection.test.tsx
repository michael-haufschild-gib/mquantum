import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SecondQuantizationSection } from '@/components/sections/Geometry/SchroedingerControls/SecondQuantizationSection'
import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/types'
import type { SecondQuantizationActions } from '@/components/sections/Geometry/SchroedingerControls/types'

function createMockActions(): SecondQuantizationActions {
  return {
    setEnabled: vi.fn(),
    setMode: vi.fn(),
    setSelectedModeIndex: vi.fn(),
    setFockQuantumNumber: vi.fn(),
    setShowOccupation: vi.fn(),
    setShowUncertainty: vi.fn(),
    setCoherentAlphaRe: vi.fn(),
    setCoherentAlphaIm: vi.fn(),
    setSqueezeR: vi.fn(),
    setSqueezeTheta: vi.fn(),
  }
}

/** Expand the collapsible Section by clicking its header button */
function expandSection() {
  const sectionButton = screen.getByRole('button', { name: /2nd quantization/i })
  fireEvent.click(sectionButton)
}

describe('SecondQuantizationSection', () => {
  let actions: SecondQuantizationActions

  beforeEach(() => {
    actions = createMockActions()
    // Clear persisted section state so expandSection() always opens
    localStorage.removeItem('section-state-2nd-quantization')
  })

  it('renders the section with master toggle', () => {
    render(
      <SecondQuantizationSection
        config={{ ...DEFAULT_SCHROEDINGER_CONFIG }}
        dimension={3}
        actions={actions}
      />
    )
    expandSection()
    expect(screen.getByTestId('sq-layer-section')).toBeInTheDocument()
    expect(screen.getByTestId('sq-layer-toggle')).toBeInTheDocument()
  })

  it('does not show controls when layer is disabled', () => {
    render(
      <SecondQuantizationSection
        config={{ ...DEFAULT_SCHROEDINGER_CONFIG, sqLayerEnabled: false }}
        dimension={3}
        actions={actions}
      />
    )
    expandSection()
    expect(screen.queryByTestId('sq-layer-mode-selector')).not.toBeInTheDocument()
  })

  it('shows mode selector and presets when enabled', () => {
    render(
      <SecondQuantizationSection
        config={{ ...DEFAULT_SCHROEDINGER_CONFIG, sqLayerEnabled: true }}
        dimension={3}
        actions={actions}
      />
    )
    expandSection()
    expect(screen.getByTestId('sq-layer-mode-selector')).toBeInTheDocument()
    expect(screen.getByTestId('sq-preset-vacuum')).toBeInTheDocument()
    expect(screen.getByTestId('sq-preset-coherent')).toBeInTheDocument()
    expect(screen.getByTestId('sq-preset-squeezed')).toBeInTheDocument()
    expect(screen.getByTestId('sq-layer-fock-n')).toBeInTheDocument()
  })

  it('shows coherent controls when mode is coherent', () => {
    render(
      <SecondQuantizationSection
        config={{
          ...DEFAULT_SCHROEDINGER_CONFIG,
          sqLayerEnabled: true,
          sqLayerMode: 'coherent',
        }}
        dimension={3}
        actions={actions}
      />
    )
    expandSection()
    expect(screen.getByTestId('sq-layer-alpha-re')).toBeInTheDocument()
    expect(screen.getByTestId('sq-layer-alpha-im')).toBeInTheDocument()
    expect(screen.queryByTestId('sq-layer-fock-n')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sq-layer-squeeze-r')).not.toBeInTheDocument()
  })

  it('shows squeeze controls when mode is squeezed', () => {
    render(
      <SecondQuantizationSection
        config={{
          ...DEFAULT_SCHROEDINGER_CONFIG,
          sqLayerEnabled: true,
          sqLayerMode: 'squeezed',
        }}
        dimension={3}
        actions={actions}
      />
    )
    expandSection()
    expect(screen.getByTestId('sq-layer-squeeze-r')).toBeInTheDocument()
    expect(screen.getByTestId('sq-layer-squeeze-theta')).toBeInTheDocument()
    expect(screen.queryByTestId('sq-layer-fock-n')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sq-layer-alpha-re')).not.toBeInTheDocument()
  })

  it('uses Fock quantum number for occupation, independent of selected mode index', () => {
    render(
      <SecondQuantizationSection
        config={{
          ...DEFAULT_SCHROEDINGER_CONFIG,
          sqLayerEnabled: true,
          sqLayerMode: 'fock',
          sqLayerSelectedModeIndex: 1,
          sqLayerFockQuantumNumber: 4,
        }}
        dimension={3}
        actions={actions}
      />
    )
    expandSection()
    expect(screen.getByText('Mode k=1 — fock')).toBeInTheDocument()
    expect(screen.getByText('4.000')).toBeInTheDocument()
  })

  it('displays occupation table when enabled', () => {
    render(
      <SecondQuantizationSection
        config={{
          ...DEFAULT_SCHROEDINGER_CONFIG,
          sqLayerEnabled: true,
          sqLayerShowOccupation: true,
        }}
        dimension={3}
        actions={actions}
      />
    )
    expandSection()
    expect(screen.getByTestId('sq-occupation-table')).toBeInTheDocument()
  })

  it('renders probability fills with valid accent token and width matching label percentage', () => {
    render(
      <SecondQuantizationSection
        config={{
          ...DEFAULT_SCHROEDINGER_CONFIG,
          sqLayerEnabled: true,
          sqLayerShowOccupation: true,
          sqLayerMode: 'fock',
          sqLayerFockQuantumNumber: 0,
        }}
        dimension={3}
        actions={actions}
      />
    )

    expandSection()

    const hundredPercentLabel = screen.getByText('100.0%')
    const row = hundredPercentLabel.parentElement
    expect(row).not.toBeNull()

    const fill = row?.querySelector<HTMLDivElement>('div.flex-1 > div')
    expect(fill).toBeTruthy()
    expect(fill?.classList.contains('bg-accent')).toBe(true)
    expect(fill?.classList.contains('bg-accent-cyan')).toBe(false)
    expect(fill).toHaveStyle({ width: '100%' })
  })

  it('displays uncertainty card when enabled', () => {
    render(
      <SecondQuantizationSection
        config={{
          ...DEFAULT_SCHROEDINGER_CONFIG,
          sqLayerEnabled: true,
          sqLayerShowUncertainty: true,
        }}
        dimension={3}
        actions={actions}
      />
    )
    expandSection()
    expect(screen.getByTestId('sq-uncertainty-card')).toBeInTheDocument()
  })

  it('calls setEnabled when toggling the master switch', () => {
    render(
      <SecondQuantizationSection
        config={{ ...DEFAULT_SCHROEDINGER_CONFIG, sqLayerEnabled: false }}
        dimension={3}
        actions={actions}
      />
    )
    expandSection()
    fireEvent.click(screen.getByTestId('sq-layer-toggle'))
    expect(actions.setEnabled).toHaveBeenCalledWith(true)
  })

  it('applies vacuum preset when clicking Vacuum button', () => {
    render(
      <SecondQuantizationSection
        config={{ ...DEFAULT_SCHROEDINGER_CONFIG, sqLayerEnabled: true }}
        dimension={3}
        actions={actions}
      />
    )
    expandSection()
    fireEvent.click(screen.getByTestId('sq-preset-vacuum'))
    expect(actions.setMode).toHaveBeenCalledWith('fock')
    expect(actions.setSelectedModeIndex).toHaveBeenCalledWith(0)
    expect(actions.setFockQuantumNumber).toHaveBeenCalledWith(0)
  })

  it('applies coherent preset when clicking Coherent button', () => {
    render(
      <SecondQuantizationSection
        config={{ ...DEFAULT_SCHROEDINGER_CONFIG, sqLayerEnabled: true }}
        dimension={3}
        actions={actions}
      />
    )
    expandSection()
    fireEvent.click(screen.getByTestId('sq-preset-coherent'))
    expect(actions.setMode).toHaveBeenCalledWith('coherent')
    expect(actions.setCoherentAlphaRe).toHaveBeenCalledWith(1.0)
    expect(actions.setCoherentAlphaIm).toHaveBeenCalledWith(0.0)
  })
})
