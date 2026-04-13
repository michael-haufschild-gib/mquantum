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
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- checking null render output
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when all etas are zero', () => {
    const { container } = render(
      <FSFCosmoTrajectoryChart
        trajectory={{ etas: [0, 0, 0], entropies: [1, 2, 3] }}
        currentEta={0}
      />
    )
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- checking null render output
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when all entropies are non-finite', () => {
    const { container } = render(
      <FSFCosmoTrajectoryChart
        trajectory={{ etas: [-1, -2, -3], entropies: [NaN, Infinity, -Infinity] }}
        currentEta={-1}
      />
    )
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- checking null render output
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when all etas are non-finite', () => {
    const { container } = render(
      <FSFCosmoTrajectoryChart
        trajectory={{ etas: [NaN, Infinity], entropies: [1, 2] }}
        currentEta={-1}
      />
    )
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- checking null render output
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when entropies array is shorter than etas and no valid samples remain', () => {
    const { container } = render(
      <FSFCosmoTrajectoryChart trajectory={{ etas: [-1, -2, -3], entropies: [] }} currentEta={-1} />
    )
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- checking null render output
    expect(container.firstChild).toBeNull()
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
    const title = screen.getByText(/Cosmological trajectory S\(L_A, η\)/i)
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- verifying SVG existence
    expect(title.closest('div')!.querySelector('svg')).toBeInTheDocument()
  })

  it('renders a polyline for the trajectory data', () => {
    render(<FSFCosmoTrajectoryChart trajectory={validTrajectory} currentEta={-1.0} />)
    const title = screen.getByText(/Cosmological trajectory S\(L_A, η\)/i)
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- SVG polyline has no accessible role
    const polyline = title.closest('div')!.querySelector('polyline')
    expect(polyline).toBeInTheDocument()
    expect(polyline!).toHaveAttribute('points')
    expect(polyline!.getAttribute('points')).not.toBe('') // eslint-disable-line project-rules/prefer-jest-dom-matchers -- need to check non-empty string value, toHaveAttribute only checks existence
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
    const title = screen.getByText(/Cosmological trajectory/)
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- SVG line elements for markers have no accessible role
    const lines = title.closest('div')!.querySelectorAll('line')
    const markerLine = Array.from(lines).find((l) => l.getAttribute('stroke-dasharray') === '2,3')
    expect(markerLine).not.toBeUndefined()
  })

  it('does not render marker line when currentEta is zero', () => {
    render(<FSFCosmoTrajectoryChart trajectory={trajectory} currentEta={0} />)
    const title = screen.getByText(/Cosmological trajectory/)
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- SVG line elements
    const lines = title.closest('div')!.querySelectorAll('line')
    const markerLine = Array.from(lines).find((l) => l.getAttribute('stroke-dasharray') === '2,3')
    expect(markerLine).toBeUndefined()
  })

  it('does not render marker line when currentEta is outside trajectory range', () => {
    render(<FSFCosmoTrajectoryChart trajectory={trajectory} currentEta={-1e-6} />)
    const title = screen.getByText(/Cosmological trajectory/)
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- SVG line elements
    const lines = title.closest('div')!.querySelectorAll('line')
    const markerLine = Array.from(lines).find((l) => l.getAttribute('stroke-dasharray') === '2,3')
    expect(markerLine).toBeUndefined()
  })

  it('does not render marker line when currentEta is non-finite', () => {
    render(<FSFCosmoTrajectoryChart trajectory={trajectory} currentEta={NaN} />)
    const title = screen.getByText(/Cosmological trajectory/)
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- SVG line elements
    const lines = title.closest('div')!.querySelectorAll('line')
    const markerLine = Array.from(lines).find((l) => l.getAttribute('stroke-dasharray') === '2,3')
    expect(markerLine).toBeUndefined()
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
