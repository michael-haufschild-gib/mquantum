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

  it('renders cross-section slice section above advanced rendering section', () => {
    render(<EditorRightPanel />)

    const crossSection = screen.getByTestId('cross-section-slice-section')
    const advanced = screen.getByTestId('advanced-object-controls')
    const relativePosition = crossSection.compareDocumentPosition(advanced)

    expect(relativePosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
