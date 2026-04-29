import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PauliVisualizationControls } from '@/components/sections/Geometry/PauliSpinorControls/PauliVisualizationControls'

describe('PauliVisualizationControls', () => {
  it('exposes spin helicity as a field view', () => {
    render(<PauliVisualizationControls fieldView="spinDensity" onFieldViewChange={vi.fn()} />)

    expect(screen.getByRole('radio', { name: 'Spin Helicity' })).toBeInTheDocument()
  })

  it('exposes Berry curvature as a field view', () => {
    render(<PauliVisualizationControls fieldView="spinDensity" onFieldViewChange={vi.fn()} />)

    expect(screen.getByRole('radio', { name: 'Berry Curvature' })).toBeInTheDocument()
  })
})
