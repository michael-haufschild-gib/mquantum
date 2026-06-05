import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { CrossSectionAnalysisContent } from '@/components/sections/Analysis/SchroedingerCrossSectionSection'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

describe('CrossSectionAnalysisContent controls', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().reset()
  })

  it('reveals cross-section controls only when enabled', () => {
    render(<CrossSectionAnalysisContent />)

    expect(screen.queryByTestId('schroedinger-cross-section-scalar')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('schroedinger-cross-section-toggle'))

    expect(screen.getByTestId('schroedinger-cross-section-composite-mode')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-cross-section-scalar')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-cross-section-axis')).toBeInTheDocument()
  })

  it('updates scalar and compositing mode in store', () => {
    render(<CrossSectionAnalysisContent />)
    fireEvent.click(screen.getByTestId('schroedinger-cross-section-toggle'))

    fireEvent.change(screen.getByTestId('schroedinger-cross-section-composite-mode'), {
      target: { value: 'sliceOnly' },
    })
    fireEvent.change(screen.getByTestId('schroedinger-cross-section-scalar'), {
      target: { value: 'imag' },
    })

    const config = useExtendedObjectStore.getState().schroedinger
    expect(config.crossSectionCompositeMode).toBe('sliceOnly')
    expect(config.crossSectionScalar).toBe('imag')
  })

  it('switches between axis-aligned and free-plane controls', () => {
    render(<CrossSectionAnalysisContent />)
    fireEvent.click(screen.getByTestId('schroedinger-cross-section-toggle'))

    expect(screen.getByTestId('schroedinger-cross-section-axis')).toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-cross-section-normal-x')).not.toBeInTheDocument()

    fireEvent.change(screen.getByTestId('schroedinger-cross-section-plane-mode'), {
      target: { value: 'free' },
    })

    expect(screen.queryByTestId('schroedinger-cross-section-axis')).not.toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-cross-section-normal-x')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-cross-section-normal-y')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-cross-section-normal-z')).toBeInTheDocument()
  })

  it('shows manual window controls only when auto window is off', () => {
    render(<CrossSectionAnalysisContent />)
    fireEvent.click(screen.getByTestId('schroedinger-cross-section-toggle'))

    expect(screen.queryByTestId('schroedinger-cross-section-window-min')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-cross-section-window-max')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('schroedinger-cross-section-auto-window-toggle'))

    expect(screen.getByTestId('schroedinger-cross-section-window-min')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-cross-section-window-max')).toBeInTheDocument()
  })

  it('shows plane color picker while Faces controls remain the scalar color source', () => {
    render(<CrossSectionAnalysisContent />)
    fireEvent.click(screen.getByTestId('schroedinger-cross-section-toggle'))

    expect(screen.getByTestId('schroedinger-cross-section-plane-color')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Slice scalar colors use the active Faces color algorithm and palette settings.'
      )
    ).toBeInTheDocument()
  })

  it.each([
    ['hydrogenND', 'hydrogen-energy-diagram'],
    ['hydrogenNDCoupled', 'hydrogen-energy-diagram'],
    ['hydrogenND', 'control-group-radial-probability'],
    ['hydrogenNDCoupled', 'control-group-radial-probability'],
  ] as const)('%s mode shows %s', (quantumMode, testId) => {
    useExtendedObjectStore.setState({
      schroedinger: {
        ...useExtendedObjectStore.getState().schroedinger,
        quantumMode,
      },
    })
    render(<CrossSectionAnalysisContent />)
    expect(screen.getByTestId(testId)).toBeInTheDocument()
  })

  // ────────────────────────────────────────────────────────────────────
  // Negative-path mode gating
  // ────────────────────────────────────────────────────────────────────
  //
  // The positive cases above only check that hydrogen modes render their
  // hydrogen-specific elements. Without these symmetric negative tests, a
  // regression that makes `<HydrogenEnergyDiagram />` or the
  // Radial Probability `ControlGroup` unconditional (or gates them on the
  // wrong `quantumMode` comparison) would slip past the existing suite:
  // the hydrogen-positive cases still pass, and HO mode would silently grow
  // controls that only work for hydrogen eigenstates.

  it('harmonicOscillator mode does NOT render the hydrogen-energy-diagram', () => {
    useExtendedObjectStore.setState({
      schroedinger: {
        ...useExtendedObjectStore.getState().schroedinger,
        quantumMode: 'harmonicOscillator',
      },
    })
    render(<CrossSectionAnalysisContent />)
    expect(screen.queryByTestId('hydrogen-energy-diagram')).not.toBeInTheDocument()
  })

  it('harmonicOscillator mode does NOT render the radial-probability control group', () => {
    useExtendedObjectStore.setState({
      schroedinger: {
        ...useExtendedObjectStore.getState().schroedinger,
        quantumMode: 'harmonicOscillator',
      },
    })
    render(<CrossSectionAnalysisContent />)
    expect(screen.queryByTestId('control-group-radial-probability')).not.toBeInTheDocument()
  })

  it('harmonicOscillator mode renders the HO energy diagram (positive symmetry)', () => {
    // Balances the hydrogen-positive cases above so the HO branch has an
    // explicit positive test too. Without this, a future "ho-energy-diagram
    // gone missing" regression would still pass the negative-only HO tests.
    useExtendedObjectStore.setState({
      schroedinger: {
        ...useExtendedObjectStore.getState().schroedinger,
        quantumMode: 'harmonicOscillator',
      },
    })
    render(<CrossSectionAnalysisContent />)
    expect(screen.getByTestId('ho-energy-diagram')).toBeInTheDocument()
  })

  it.each([['hydrogenND'], ['hydrogenNDCoupled']] as const)(
    '%s mode does NOT render the HO energy diagram',
    (quantumMode) => {
      useExtendedObjectStore.setState({
        schroedinger: {
          ...useExtendedObjectStore.getState().schroedinger,
          quantumMode,
        },
      })
      render(<CrossSectionAnalysisContent />)
      expect(screen.queryByTestId('ho-energy-diagram')).not.toBeInTheDocument()
    }
  )
})
