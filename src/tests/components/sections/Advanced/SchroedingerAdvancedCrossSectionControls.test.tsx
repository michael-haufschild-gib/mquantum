import { CrossSectionAnalysisContent } from '@/components/sections/Advanced/SchroedingerCrossSectionSection'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

describe('CrossSectionAnalysisContent controls', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
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
      screen.getByText('Slice scalar colors use the active Faces color algorithm and palette settings.')
    ).toBeInTheDocument()
  })
})
