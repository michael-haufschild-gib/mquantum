import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WignerControls } from '@/components/sections/Geometry/SchroedingerControls/WignerControls'
import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/types'

function makeActions() {
  return {
    setDimensionIndex: vi.fn(),
    setAutoRange: vi.fn(),
    setXRange: vi.fn(),
    setPRange: vi.fn(),
    setCrossTermsEnabled: vi.fn(),
    setQuadPoints: vi.fn(),
    setCacheResolution: vi.fn(),
  }
}

describe('WignerControls', () => {
  it('maps loaded hydrogen core dimension indices back to the radial option', () => {
    render(
      <WignerControls
        config={{
          ...DEFAULT_SCHROEDINGER_CONFIG,
          quantumMode: 'hydrogenND',
          representation: 'wigner',
          wignerDimensionIndex: 2,
        }}
        dimension={5}
        actions={makeActions()}
      />
    )

    expect(screen.getByTestId('wigner-dimension-select')).toHaveValue('0')
  })
})
