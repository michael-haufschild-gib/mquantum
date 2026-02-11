import { EditorRightPanel } from '@/components/layout/EditorRightPanel'
import { useGeometryStore } from '@/stores/geometryStore'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

describe('EditorRightPanel object tab layout', () => {
  beforeEach(() => {
    useGeometryStore.setState({
      dimension: 3,
      objectType: 'schroedinger',
    })
  })

  it('renders analysis section above quantum effects section above advanced rendering section', () => {
    render(<EditorRightPanel />)

    const analysis = screen.getByTestId('cross-section-slice-section')
    const quantumEffects = screen.getByTestId('quantum-effects-section')
    const advanced = screen.getByTestId('advanced-object-controls')
    const analysisToQuantum = analysis.compareDocumentPosition(quantumEffects)
    const quantumToAdvanced = quantumEffects.compareDocumentPosition(advanced)

    expect(analysisToQuantum & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(quantumToAdvanced & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not render isosurface mode toggle in the right panel surface section', () => {
    render(<EditorRightPanel />)

    expect(screen.queryByTestId('schroedinger-iso-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-iso-threshold')).not.toBeInTheDocument()
  })
})
