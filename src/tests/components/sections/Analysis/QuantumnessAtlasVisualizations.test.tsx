/**
 * Tests for QuantumnessAtlasVisualizations — erosion curves, scatter plot,
 * triple heatmap, and dimension comparison.
 *
 * @module tests/components/sections/Analysis/QuantumnessAtlasVisualizations
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  DiagnosticScatter,
  DimensionComparison,
  ErosionCurves,
  TripleHeatmap,
} from '@/components/sections/Analysis/QuantumnessAtlasVisualizations'
import type { AtlasPoint } from '@/stores/quantumnessAtlasStore'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAtlasPoint(overrides: Partial<AtlasPoint> = {}): AtlasPoint {
  return {
    lambda: 1,
    dim: 3,
    gamma: 0,
    avgNormalizedEntropy: 0.5,
    varNormalizedEntropy: 0.01,
    avgWignerNegativity: 0.3,
    varWignerNegativity: 0.01,
    avgIPR: 0.2,
    varIPR: 0.01,
    gridSizePerDim: 64,
    totalSamples: 10,
    measurementSamples: 5,
    ...overrides,
  }
}

// ─── ErosionCurves ───────────────────────────────────────────────────────────

describe('ErosionCurves', () => {
  it('renders fallback message when fewer than 2 data points', () => {
    render(<ErosionCurves data={[{ gamma: 0.5, entanglement: 0.5, wigner: 0.3, ipr: 0.2 }]} />)
    expect(screen.getByText(/Need ≥ 2 γ points for curves/)).toBeInTheDocument()
  })

  it('renders SVG chart when given 2+ data points', () => {
    render(
      <ErosionCurves
        data={[
          { gamma: 0.1, entanglement: 0.3, wigner: 0.2, ipr: 0.1 },
          { gamma: 0.5, entanglement: 0.6, wigner: 0.4, ipr: 0.3 },
        ]}
      />
    )
    expect(screen.getByTestId('three-diag-chart')).toBeInTheDocument()
  })

  it('renders the γ axis label', () => {
    render(
      <ErosionCurves
        data={[
          { gamma: 0.1, entanglement: 0.3, wigner: 0.2, ipr: 0.1 },
          { gamma: 0.5, entanglement: 0.6, wigner: 0.4, ipr: 0.3 },
        ]}
      />
    )
    expect(screen.getByText('γ')).toBeInTheDocument()
  })

  it('renders three polylines for the three diagnostics', () => {
    render(
      <ErosionCurves
        data={[
          { gamma: 0.1, entanglement: 0.3, wigner: 0.2, ipr: 0.1 },
          { gamma: 0.5, entanglement: 0.6, wigner: 0.4, ipr: 0.3 },
          { gamma: 1.0, entanglement: 0.9, wigner: 0.7, ipr: 0.5 },
        ]}
      />
    )
    expect(screen.getAllByTestId('diag-polyline').length).toBe(3)
  })

  it('falls back when fewer than 2 finite gamma points are plottable', () => {
    render(
      <ErosionCurves
        data={[
          { gamma: Number.NaN, entanglement: 0.3, wigner: 0.2, ipr: 0.1 },
          { gamma: 0.5, entanglement: 0.6, wigner: 0.4, ipr: 0.3 },
        ]}
      />
    )
    expect(screen.getByText(/Need ≥ 2 γ points for curves/)).toBeInTheDocument()
  })
})

// ─── DiagnosticScatter ───────────────────────────────────────────────────────

describe('DiagnosticScatter', () => {
  it('renders nothing when results are empty', () => {
    const { container } = render(<DiagnosticScatter results={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders SVG scatter for non-empty results', () => {
    render(<DiagnosticScatter results={[makeAtlasPoint(), makeAtlasPoint({ dim: 4 })]} />)
    expect(screen.getByTestId('diagnostic-scatter')).toBeInTheDocument()
  })

  it('renders axis labels for S̄ and N̄_W', () => {
    render(<DiagnosticScatter results={[makeAtlasPoint()]} />)
    // X-axis label
    expect(screen.getByText(/S̄\/log M/)).toBeInTheDocument()
    // Y-axis label
    expect(screen.getByText('N̄_W')).toBeInTheDocument()
  })

  it('renders dimension legend dots for each unique dimension', () => {
    const results = [
      makeAtlasPoint({ dim: 3 }),
      makeAtlasPoint({ dim: 4 }),
      makeAtlasPoint({ dim: 5 }),
    ]
    render(<DiagnosticScatter results={results} />)
    expect(screen.getByText(/● 3D/)).toBeInTheDocument()
    expect(screen.getByText(/● 4D/)).toBeInTheDocument()
    expect(screen.getByText(/● 5D/)).toBeInTheDocument()
  })

  it('skips scatter points with non-finite plotted metrics', () => {
    const results = [
      makeAtlasPoint({ dim: 3, avgNormalizedEntropy: 0.4, avgWignerNegativity: 0.2 }),
      makeAtlasPoint({ dim: 4, avgWignerNegativity: Infinity }),
      makeAtlasPoint({ dim: 5, avgNormalizedEntropy: Number.NaN }),
    ]
    render(<DiagnosticScatter results={results} />)

    const [point] = screen.getAllByTestId('diagnostic-scatter-point') as [HTMLElement]
    expect(point).toHaveAttribute('cx', expect.stringMatching(/^-?(?:\d+|\d*\.\d+)$/))
    expect(point).toHaveAttribute('cy', expect.stringMatching(/^-?(?:\d+|\d*\.\d+)$/))
    expect(screen.getAllByTestId('diagnostic-scatter-point')).toHaveLength(1)
  })
})

// ─── TripleHeatmap ───────────────────────────────────────────────────────────

describe('TripleHeatmap', () => {
  it('renders fallback text when no results match the specified gamma', () => {
    render(<TripleHeatmap results={[makeAtlasPoint({ gamma: 1 })]} gamma={0} />)
    expect(screen.getByText(/No data at γ = 0/)).toBeInTheDocument()
  })

  it('renders three heatmaps (S̄, N̄_W, IPR) for matching gamma', () => {
    const results = [
      makeAtlasPoint({ gamma: 0, lambda: 1, dim: 3 }),
      makeAtlasPoint({ gamma: 0, lambda: 2, dim: 4 }),
    ]
    render(<TripleHeatmap results={results} gamma={0} />)
    expect(screen.getByText('S̄/logM')).toBeInTheDocument()
    expect(screen.getByText('N̄_W')).toBeInTheDocument()
    expect(screen.getByText('IPR')).toBeInTheDocument()
  })

  it('filters out results with non-matching gamma', () => {
    const results = [
      makeAtlasPoint({ gamma: 0, lambda: 1, dim: 3 }),
      makeAtlasPoint({ gamma: 1, lambda: 2, dim: 3 }),
    ]
    render(<TripleHeatmap results={results} gamma={0} />)
    // Only 1 result passes the filter — still renders heatmaps with 3 SVGs
    expect(screen.getByText('S̄/logM')).toBeInTheDocument()
    expect(screen.getByText('N̄_W')).toBeInTheDocument()
    expect(screen.getByText('IPR')).toBeInTheDocument()
  })

  it('skips heatmap cells with non-finite axes or diagnostic values', () => {
    render(
      <TripleHeatmap
        gamma={0}
        results={[
          makeAtlasPoint({ gamma: 0, lambda: 1, dim: 3 }),
          makeAtlasPoint({ gamma: 0, lambda: Number.NaN, dim: 3 }),
          makeAtlasPoint({ gamma: 0, lambda: 2, dim: Infinity }),
          makeAtlasPoint({ gamma: 0, lambda: 3, dim: 4, avgIPR: Number.NaN }),
        ]}
      />
    )

    const rects = screen.getAllByTestId('diag-heatmap-cell')
    expect(rects).toHaveLength(5)
    for (const rect of rects) {
      expect(rect).toHaveAttribute('x', expect.stringMatching(/^-?(?:\d+|\d*\.\d+)$/))
      expect(rect).toHaveAttribute('y', expect.stringMatching(/^-?(?:\d+|\d*\.\d+)$/))
      expect(rect).toHaveAttribute('opacity', expect.stringMatching(/^-?(?:\d+|\d*\.\d+)$/))
    }
  })
})

// ─── DimensionComparison ─────────────────────────────────────────────────────

describe('DimensionComparison', () => {
  it('renders fallback message when fewer than 2 dimension points', () => {
    render(<DimensionComparison data={[{ dim: 3, entanglement: 0.5, wigner: 0.3, ipr: 0.2 }]} />)
    expect(screen.getByText(/Need ≥ 2 dimensions for comparison/)).toBeInTheDocument()
  })

  it('renders SVG chart for 2+ dimension points', () => {
    render(
      <DimensionComparison
        data={[
          { dim: 3, entanglement: 0.4, wigner: 0.2, ipr: 0.1 },
          { dim: 4, entanglement: 0.7, wigner: 0.5, ipr: 0.3 },
        ]}
      />
    )
    expect(screen.getByTestId('three-diag-chart')).toBeInTheDocument()
  })

  it('renders the "dimension N" axis label', () => {
    render(
      <DimensionComparison
        data={[
          { dim: 3, entanglement: 0.4, wigner: 0.2, ipr: 0.1 },
          { dim: 5, entanglement: 0.8, wigner: 0.6, ipr: 0.4 },
        ]}
      />
    )
    expect(screen.getByText('dimension N')).toBeInTheDocument()
  })

  it('renders three polylines for the three diagnostic curves', () => {
    render(
      <DimensionComparison
        data={[
          { dim: 3, entanglement: 0.4, wigner: 0.2, ipr: 0.1 },
          { dim: 4, entanglement: 0.6, wigner: 0.4, ipr: 0.2 },
          { dim: 5, entanglement: 0.8, wigner: 0.6, ipr: 0.4 },
        ]}
      />
    )
    expect(screen.getAllByTestId('diag-polyline').length).toBe(3)
  })

  it('renders tick labels matching each dimension value', () => {
    render(
      <DimensionComparison
        data={[
          { dim: 3, entanglement: 0.3, wigner: 0.2, ipr: 0.1 },
          { dim: 7, entanglement: 0.8, wigner: 0.5, ipr: 0.4 },
        ]}
      />
    )
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('falls back when fewer than 2 finite dimensions are plottable', () => {
    render(
      <DimensionComparison
        data={[
          { dim: Number.NaN, entanglement: 0.3, wigner: 0.2, ipr: 0.1 },
          { dim: 7, entanglement: 0.8, wigner: 0.5, ipr: 0.4 },
        ]}
      />
    )
    expect(screen.getByText(/Need ≥ 2 dimensions for comparison/)).toBeInTheDocument()
  })
})
