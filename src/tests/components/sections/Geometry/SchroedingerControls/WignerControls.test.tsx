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
  it('maps loaded hydrogen-coupled core dimension indices back to the radial option', () => {
    render(
      <WignerControls
        config={{
          ...DEFAULT_SCHROEDINGER_CONFIG,
          quantumMode: 'hydrogenNDCoupled',
          representation: 'wigner',
          wignerDimensionIndex: 2,
        }}
        dimension={5}
        actions={makeActions()}
      />
    )

    expect(screen.getByTestId('wigner-dimension-select')).toHaveValue('0')
  })

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

  it('maps out-of-range hydrogen indices back to the radial option when dimension is 3', () => {
    render(
      <WignerControls
        config={{
          ...DEFAULT_SCHROEDINGER_CONFIG,
          quantumMode: 'hydrogenND',
          representation: 'wigner',
          wignerDimensionIndex: 99,
        }}
        dimension={3}
        actions={makeActions()}
      />
    )

    expect(screen.getByTestId('wigner-dimension-select')).toHaveValue('0')
  })

  it('uses the same minimum Wigner range as store/url normalization', () => {
    render(
      <WignerControls
        config={{
          ...DEFAULT_SCHROEDINGER_CONFIG,
          quantumMode: 'harmonicOscillator',
          representation: 'wigner',
          wignerAutoRange: false,
        }}
        dimension={3}
        actions={makeActions()}
      />
    )

    expect(screen.getByTestId('wigner-x-range-slider-range')).toHaveAttribute('min', '1')
    expect(screen.getByTestId('wigner-p-range-slider-range')).toHaveAttribute('min', '1')
  })

  it('represents arbitrary normalized cache resolutions accepted by store/url state', () => {
    render(
      <WignerControls
        config={{
          ...DEFAULT_SCHROEDINGER_CONFIG,
          quantumMode: 'harmonicOscillator',
          representation: 'wigner',
          wignerCacheResolution: 257,
        }}
        dimension={3}
        actions={makeActions()}
      />
    )

    const range = screen.getByTestId('wigner-cache-resolution-range')
    expect(range).toHaveAttribute('min', '128')
    expect(range).toHaveAttribute('max', '1024')
    expect(range).toHaveAttribute('step', '1')
    expect(range).toHaveValue('257')
  })
})
