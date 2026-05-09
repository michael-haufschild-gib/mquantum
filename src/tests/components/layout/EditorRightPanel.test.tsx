import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { EditorRightPanel } from '@/components/layout/EditorRightPanel'
import { useGeometryStore } from '@/stores/geometryStore'

describe('EditorRightPanel tab layout', () => {
  beforeEach(() => {
    useGeometryStore.setState({
      dimension: 3,
      objectType: 'schroedinger',
    })
  })

  it('renders Object tab with appearance sections, not analysis sections', () => {
    render(<EditorRightPanel />)

    // Object tab is default — should contain appearance/rendering sections
    expect(screen.getByTestId('section-faces')).toBeInTheDocument()
    expect(screen.getByTestId('advanced-object-controls')).toBeInTheDocument()

    // Analysis sections should NOT be mounted (Analysis tab not yet activated)
    expect(screen.queryByTestId('analysis-section')).not.toBeInTheDocument()
    expect(screen.queryByTestId('quantum-effects-section')).not.toBeInTheDocument()
  })

  it('renders Analysis tab with analysis, decoherence, entanglement, and quantum effects sections', async () => {
    const user = userEvent.setup()
    render(<EditorRightPanel />)

    // Switch to Analysis tab
    const analysisTab = screen.getByRole('tab', { name: /analysis/i })
    await user.click(analysisTab)

    // Both sections lazy-mount after the tab click. Use findByTestId for
    // both — under worker-pool contention the second section may render
    // slightly after the first, causing a sync getByTestId here to flake.
    expect(
      await screen.findByTestId('analysis-section', undefined, { timeout: 5000 })
    ).toBeInTheDocument()
    expect(
      await screen.findByTestId('quantum-effects-section', undefined, { timeout: 5000 })
    ).toBeInTheDocument()
  })

  it('does not render isosurface mode toggle in the right panel surface section', () => {
    render(<EditorRightPanel />)

    expect(screen.queryByTestId('schroedinger-iso-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-iso-threshold')).not.toBeInTheDocument()
  })
})
