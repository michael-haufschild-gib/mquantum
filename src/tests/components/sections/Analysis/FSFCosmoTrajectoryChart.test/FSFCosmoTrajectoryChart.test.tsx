/**
 * Tests for FSFCosmoTrajectoryChart.
 *
 * Covers: null renders for empty/invalid trajectories, polyline rendering,
 * marker line for currentEta, axis labels, and edge-case filtering.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FSFCosmoTrajectoryChart } from '@/components/sections/Analysis/FSFCosmoTrajectoryChart'

describe('FSFCosmoTrajectoryChart — null/empty inputs', () => {
  it('renders nothing for empty trajectory', () => {
    const { container } = render(
      <FSFCosmoTrajectoryChart trajectory={{ etas: [], entropies: [] }} currentEta={-1} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when all etas are zero', () => {
    const { container } = render(
      <FSFCosmoTrajectoryChart
        trajectory={{ etas: [0, 0, 0], entropies: [1, 2, 3] }}
        currentEta={0}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when all entropies are non-finite', () => {
    const { container } = render(
      <FSFCosmoTrajectoryChart
        trajectory={{ etas: [-1, -2, -3], entropies: [NaN, Infinity, -Infinity] }}
        currentEta={-1}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when all etas are non-finite', () => {
    const { container } = render(
      <FSFCosmoTrajectoryChart
        trajectory={{ etas: [NaN, Infinity], entropies: [1, 2] }}
        currentEta={-1}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when entropies array is shorter than etas and no valid samples remain', () => {
    const { container } = render(
      <FSFCosmoTrajectoryChart trajectory={{ etas: [-1, -2, -3], entropies: [] }} currentEta={-1} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('FSFCosmoTrajectoryChart — valid trajectory', () => {
  const validTrajectory = {
    etas: [-0.1, -1.0, -10.0, -100.0],
    entropies: [0.5, 1.0, 1.5, 2.0],
  }

  it('renders the section title', () => {
    render(<FSFCosmoTrajectoryChart trajectory={validTrajectory} currentEta={-1.0} />)
    expect(screen.getByText(/Cosmological trajectory S\(L_A, η\)/i)).toBeInTheDocument()
  })

  it('renders an SVG element', () => {
    render(<FSFCosmoTrajectoryChart trajectory={validTrajectory} currentEta={-1.0} />)
    expect(screen.getByTestId('fsf-cosmo-trajectory-svg')).toBeInTheDocument()
  })

  it('renders a polyline for the trajectory data with non-empty points', () => {
    render(<FSFCosmoTrajectoryChart trajectory={validTrajectory} currentEta={-1.0} />)
    const polyline = screen.getByTestId('fsf-cosmo-trajectory-polyline')
    const points = polyline.getAttribute('points') ?? ''
    // Each sample produces an "x,y" token; 4 samples → 4 tokens separated by spaces.
    expect(points.split(/\s+/).filter(Boolean).length).toBe(validTrajectory.etas.length)
  })

  it('renders log|η| axis label', () => {
    render(<FSFCosmoTrajectoryChart trajectory={validTrajectory} currentEta={-1.0} />)
    expect(screen.getByText('log |η|')).toBeInTheDocument()
  })

  it('renders S(L_A, η) axis label', () => {
    render(<FSFCosmoTrajectoryChart trajectory={validTrajectory} currentEta={-1.0} />)
    expect(screen.getByText('S(L_A, η)')).toBeInTheDocument()
  })
})

describe('FSFCosmoTrajectoryChart — marker line', () => {
  const trajectory = {
    etas: [-0.1, -1.0, -10.0, -100.0],
    entropies: [0.5, 1.0, 1.5, 2.0],
  }

  it('renders marker line when currentEta is within range', () => {
    render(<FSFCosmoTrajectoryChart trajectory={trajectory} currentEta={-1.0} />)
    expect(screen.getByTestId('fsf-cosmo-trajectory-marker')).toBeInTheDocument()
  })

  it('does not render marker line when currentEta is zero', () => {
    render(<FSFCosmoTrajectoryChart trajectory={trajectory} currentEta={0} />)
    expect(screen.queryByTestId('fsf-cosmo-trajectory-marker')).not.toBeInTheDocument()
  })

  it('does not render marker line when currentEta is outside trajectory range', () => {
    render(<FSFCosmoTrajectoryChart trajectory={trajectory} currentEta={-1e-6} />)
    expect(screen.queryByTestId('fsf-cosmo-trajectory-marker')).not.toBeInTheDocument()
  })

  it('does not render marker line when currentEta is non-finite', () => {
    render(<FSFCosmoTrajectoryChart trajectory={trajectory} currentEta={NaN} />)
    expect(screen.queryByTestId('fsf-cosmo-trajectory-marker')).not.toBeInTheDocument()
  })
})

describe('FSFCosmoTrajectoryChart — partial validity', () => {
  it('filters out zero-eta samples and renders remaining valid ones', () => {
    render(
      <FSFCosmoTrajectoryChart
        trajectory={{ etas: [0, -1, -10, -100], entropies: [99, 1.0, 1.5, 2.0] }}
        currentEta={-1}
      />
    )
    expect(screen.getByText(/Cosmological trajectory/)).toBeInTheDocument()
  })

  it('handles entropies array shorter than etas by ignoring tail', () => {
    render(
      <FSFCosmoTrajectoryChart
        trajectory={{ etas: [-1, -10, -100, -1000], entropies: [1.0, 2.0] }}
        currentEta={-1}
      />
    )
    expect(screen.getByText(/Cosmological trajectory/)).toBeInTheDocument()
  })
})
