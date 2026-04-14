import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { KKCompactificationSection } from '@/components/sections/Geometry/SchroedingerControls/KKCompactificationSection'
import { DEFAULT_BEC_CONFIG } from '@/lib/geometry/extended/bec'
import { DEFAULT_DIRAC_CONFIG } from '@/lib/geometry/extended/dirac'
import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/schroedinger'
import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

function setMode(quantumMode: string) {
  useExtendedObjectStore.setState((s) => ({
    schroedinger: {
      ...s.schroedinger,
      ...DEFAULT_SCHROEDINGER_CONFIG,
      quantumMode: quantumMode as never,
      tdse: { ...DEFAULT_TDSE_CONFIG },
      bec: { ...DEFAULT_BEC_CONFIG },
      dirac: { ...DEFAULT_DIRAC_CONFIG },
    },
  }))
}

beforeEach(() => {
  useGeometryStore.setState({ dimension: 3 })
  setMode('tdseDynamics')
  // Section defaultOpen=true, so force it open by clearing stored state
  localStorage.removeItem('section-state-kk-compactification')
})

describe('KKCompactificationSection', () => {
  it('returns null for non-TDSE/BEC modes', () => {
    setMode('harmonicOscillator')
    const { container } = render(<KKCompactificationSection />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders section header for tdseDynamics mode', () => {
    render(<KKCompactificationSection />)
    expect(screen.getByRole('button', { name: /KK Compactification/i })).toBeInTheDocument()
  })

  it('renders section header for becDynamics mode', () => {
    setMode('becDynamics')
    render(<KKCompactificationSection />)
    expect(screen.getByRole('button', { name: /KK Compactification/i })).toBeInTheDocument()
  })

  it('renders one compact toggle per lattice dimension (TDSE 3D)', () => {
    // defaultOpen=true so section content is immediately visible
    render(<KKCompactificationSection defaultOpen />)
    expect(screen.getByTestId('kk-compact-0')).toBeInTheDocument()
    expect(screen.getByTestId('kk-compact-1')).toBeInTheDocument()
    expect(screen.getByTestId('kk-compact-2')).toBeInTheDocument()
  })

  it('does not show radius slider when dimension is not compact', () => {
    render(<KKCompactificationSection defaultOpen />)
    expect(screen.queryByTestId('kk-radius-0')).not.toBeInTheDocument()
  })

  it('shows radius slider when a dimension is compact', () => {
    useExtendedObjectStore.setState((s) => ({
      schroedinger: {
        ...s.schroedinger,
        tdse: {
          ...DEFAULT_TDSE_CONFIG,
          compactDims: [true, false, false],
          compactRadii: [0.15, 0.15, 0.15],
        },
      },
    }))
    render(<KKCompactificationSection defaultOpen />)
    expect(screen.getByTestId('kk-radius-0')).toBeInTheDocument()
    expect(screen.queryByTestId('kk-radius-1')).not.toBeInTheDocument()
  })

  it('shows energy diagram when at least one compact dimension is set', () => {
    useExtendedObjectStore.setState((s) => ({
      schroedinger: {
        ...s.schroedinger,
        tdse: {
          ...DEFAULT_TDSE_CONFIG,
          compactDims: [true, false, false],
          compactRadii: [0.15, 0.15, 0.15],
        },
      },
    }))
    render(<KKCompactificationSection defaultOpen />)
    expect(screen.getByTestId('kk-energy-diagram')).toBeInTheDocument()
  })

  it('does not show energy diagram when no compact dims', () => {
    render(<KKCompactificationSection defaultOpen />)
    expect(screen.queryByTestId('kk-energy-diagram')).not.toBeInTheDocument()
  })

  it('calls setTdseCompactDim when compact toggle is clicked in TDSE mode', () => {
    const setTdseCompactDim = vi.fn()
    useExtendedObjectStore.setState((s) => ({
      ...s,
      setTdseCompactDim,
    }))
    render(<KKCompactificationSection defaultOpen />)
    // Switch renders as <label data-testid> wrapping <input type="checkbox" role="switch">
    const switchInput = screen.getByRole('switch', { name: /Compact x/i })
    fireEvent.click(switchInput)
    expect(setTdseCompactDim).toHaveBeenCalledWith(0, true)
  })

  it('calls setBecCompactDim when compact toggle is clicked in BEC mode', () => {
    setMode('becDynamics')
    const setBecCompactDim = vi.fn()
    useExtendedObjectStore.setState((s) => ({
      ...s,
      setBecCompactDim,
    }))
    render(<KKCompactificationSection defaultOpen />)
    const switchInput = screen.getByRole('switch', { name: /Compact x/i })
    fireEvent.click(switchInput)
    expect(setBecCompactDim).toHaveBeenCalledWith(0, true)
  })

  it('respects dimension from geometry store — 4D shows 4 compact toggles', () => {
    useGeometryStore.setState({ dimension: 4 })
    useExtendedObjectStore.setState((s) => ({
      schroedinger: {
        ...s.schroedinger,
        tdse: {
          ...DEFAULT_TDSE_CONFIG,
          latticeDim: 4,
          compactDims: [false, false, false, false],
          compactRadii: [0.15, 0.15, 0.15, 0.15],
        },
      },
    }))
    render(<KKCompactificationSection defaultOpen />)
    expect(screen.getByTestId('kk-compact-0')).toBeInTheDocument()
    expect(screen.getByTestId('kk-compact-1')).toBeInTheDocument()
    expect(screen.getByTestId('kk-compact-2')).toBeInTheDocument()
    expect(screen.getByTestId('kk-compact-3')).toBeInTheDocument()
  })

  it('energy diagram shows KK Spectrum label', () => {
    useExtendedObjectStore.setState((s) => ({
      schroedinger: {
        ...s.schroedinger,
        tdse: {
          ...DEFAULT_TDSE_CONFIG,
          compactDims: [true, false, false],
          compactRadii: [0.2, 0.2, 0.2],
        },
      },
    }))
    render(<KKCompactificationSection defaultOpen />)
    // Text is split across elements: "KK Energy Spectrum" in a <p> tag
    expect(screen.getByText(/KK Energy Spectrum/)).toBeInTheDocument()
  })
})
