/**
 * Tests for EntanglementVisualizations — SVG-based quantum entanglement charts.
 *
 * Covers: PerDimensionBars, SpectrumBars, MutualInfoHeatmap, AtlasHeatmap —
 * empty-state early returns, conditional rendering branches, and numeric
 * content correctness.
 *
 * @module tests/components/sections/Analysis/EntanglementVisualizations
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  AtlasHeatmap,
  MutualInfoHeatmap,
  PerDimensionBars,
  SpectrumBars,
} from '@/components/sections/Analysis/EntanglementVisualizations'

// ─── PerDimensionBars ────────────────────────────────────────────────────────

describe('PerDimensionBars', () => {
  it('renders nothing when entropies array is empty', () => {
    const { container } = render(<PerDimensionBars entropies={[]} maxEntropies={[]} />)
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- checking for null render output (no accessible element to query)
    expect(container.firstChild).toBeNull()
  })

  it('renders the per-dimension label', () => {
    render(<PerDimensionBars entropies={[0.5, 0.3]} maxEntropies={[1.0, 1.0]} />)
    expect(screen.getByText(/Per-dimension S_d \/ S_max/)).toBeInTheDocument()
  })

  it('renders N/A text for null entropy entries', () => {
    render(<PerDimensionBars entropies={[null, 0.5]} maxEntropies={[null, 1.0]} />)
    const naTexts = screen.getAllByText('N/A')
    expect(naTexts.length).toBe(1)
  })

  it('renders dimension index labels as SVG text nodes', () => {
    render(<PerDimensionBars entropies={[0.8, 0.6, 0.4]} maxEntropies={[1, 1, 1]} />)
    // dimension labels 0, 1, 2 appear as accessible text
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders a bar even when maxEntropy is 0 (zero-division guard)', () => {
    // Should not throw — fraction clamps to 0 instead of NaN/Infinity
    expect(() => render(<PerDimensionBars entropies={[0.5]} maxEntropies={[0]} />)).not.toThrow()
  })
})

// ─── SpectrumBars ────────────────────────────────────────────────────────────

describe('SpectrumBars', () => {
  it('renders nothing for empty spectrum', () => {
    const { container } = render(<SpectrumBars spectrum={[]} />)
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- checking for null render output
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when all eigenvalues are below threshold (≤ 1e-6)', () => {
    const { container } = render(<SpectrumBars spectrum={[1e-7, 0, 1e-9]} />)
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- checking for null render output
    expect(container.firstChild).toBeNull()
  })

  it('renders the spectrum label with non-zero count', () => {
    render(<SpectrumBars spectrum={[0.8, 0.4, 0.1, 1e-8]} />)
    // 3 non-zero significant values (> 1e-6)
    expect(screen.getByText(/ρ₁ spectrum \(3 non-zero\)/)).toBeInTheDocument()
  })

  it('caps displayed bars at 16 for long spectra', () => {
    const spectrum = Array.from({ length: 20 }, (_, i) => 1 / (i + 1))
    render(<SpectrumBars spectrum={spectrum} />)
    // The label shows all significant eigenvalues (20), but only 16 bars are drawn
    expect(screen.getByText(/ρ₁ spectrum \(20 non-zero\)/)).toBeInTheDocument()
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- SVG rect elements have no accessible name/role for bar chart data
    const rects = screen
      .getByText(/ρ₁ spectrum/)
      .closest('div')!
      .querySelectorAll('svg rect')
    expect(rects.length).toBe(16)
  })
})

// ─── MutualInfoHeatmap ───────────────────────────────────────────────────────

describe('MutualInfoHeatmap', () => {
  it('renders the heatmap label', () => {
    const matrix = new Float64Array([0, 0.5, 0.5, 0])
    render(<MutualInfoHeatmap matrix={matrix} N={2} />)
    expect(screen.getByText(/Pairwise mutual information/)).toBeInTheDocument()
  })

  it('renders N² rect cells for an N×N matrix', () => {
    const N = 3
    const matrix = new Float64Array(N * N).fill(0.1)
    render(<MutualInfoHeatmap matrix={matrix} N={N} />)
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- SVG rect elements for heatmap cells have no accessible role
    const rects = screen
      .getByText(/Pairwise mutual information/)
      .closest('div')!
      .querySelectorAll('svg rect')
    expect(rects.length).toBe(N * N)
  })

  it('renders dimension axis labels 0..N-1', () => {
    const N = 2
    const matrix = new Float64Array([0, 0.3, 0.3, 0])
    render(<MutualInfoHeatmap matrix={matrix} N={N} />)
    // Row and column labels for dim 0 and 1 (rendered twice each: row + col)
    const zeroLabels = screen.getAllByText('0')
    const oneLabels = screen.getAllByText('1')
    expect(zeroLabels.length).toBeGreaterThanOrEqual(2)
    expect(oneLabels.length).toBeGreaterThanOrEqual(2)
  })

  it('handles NaN matrix entries without throwing', () => {
    const matrix = new Float64Array([NaN, 0.5, 0.5, NaN])
    expect(() => render(<MutualInfoHeatmap matrix={matrix} N={2} />)).not.toThrow()
  })
})

// ─── AtlasHeatmap ────────────────────────────────────────────────────────────

describe('AtlasHeatmap', () => {
  const minimalResults = [
    { lambda: 1, dim: 3, entropy: 0.4 },
    { lambda: 2, dim: 3, entropy: 0.7 },
    { lambda: 1, dim: 4, entropy: 0.3 },
    { lambda: 2, dim: 4, entropy: 0.9 },
  ]

  it('renders nothing when results array is empty', () => {
    const { container } = render(<AtlasHeatmap results={[]} />)
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- checking for null render output
    expect(container.firstChild).toBeNull()
  })

  it('renders the Entanglement Atlas heading', () => {
    render(<AtlasHeatmap results={minimalResults} />)
    expect(screen.getByText('Entanglement Atlas')).toBeInTheDocument()
  })

  it('shows the total result point count', () => {
    render(<AtlasHeatmap results={minimalResults} />)
    expect(screen.getByText('4 pts')).toBeInTheDocument()
  })

  it('renders dimension labels on the Y-axis', () => {
    render(<AtlasHeatmap results={minimalResults} />)
    expect(screen.getByText('3D')).toBeInTheDocument()
    expect(screen.getByText('4D')).toBeInTheDocument()
  })

  it('renders the Coupling (λ) axis label', () => {
    render(<AtlasHeatmap results={minimalResults} />)
    expect(screen.getByText(/Coupling \(λ\)/)).toBeInTheDocument()
  })

  it('renders low/high legend labels', () => {
    render(<AtlasHeatmap results={minimalResults} />)
    expect(screen.getByText('low')).toBeInTheDocument()
    expect(screen.getByText('high')).toBeInTheDocument()
  })

  it('renders auto-insight text referencing peak lambda', () => {
    render(<AtlasHeatmap results={minimalResults} />)
    // atlasInsight always generates text containing "Peak at λ="
    expect(screen.getByText(/Peak at λ=/)).toBeInTheDocument()
  })

  it('shows floating tooltip with entropy label on cell hover', async () => {
    const user = userEvent.setup()
    render(<AtlasHeatmap results={minimalResults} />)

    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- SVG g.cursor-crosshair cells have no accessible role for heatmap interaction
    const cells = document.querySelectorAll('svg g.cursor-crosshair')
    expect(cells.length).toBeGreaterThan(0)

    await user.hover(cells[0]!)

    // Tooltip should appear showing λ/N coordinates and entropy label
    expect(screen.getByText(/S̄\/S_max =/)).toBeInTheDocument()
  })

  it('hides floating tooltip after mouse leave', async () => {
    const user = userEvent.setup()
    render(<AtlasHeatmap results={minimalResults} />)

    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- SVG heatmap cells
    const cells = document.querySelectorAll('svg g.cursor-crosshair')
    await user.hover(cells[0]!)
    await user.unhover(cells[0]!)

    expect(screen.queryByText(/S̄\/S_max =/)).toBeNull()
  })

  it('renders "Collecting data" insight with a single result point', () => {
    render(<AtlasHeatmap results={[{ lambda: 1, dim: 3, entropy: 0.5 }]} />)
    expect(screen.getByText(/Collecting data/)).toBeInTheDocument()
  })

  it('displays entropy level label in tooltip matching entropyLabel thresholds', async () => {
    const user = userEvent.setup()
    // entropy = 0.05 → "Nearly separable"
    render(
      <AtlasHeatmap
        results={[
          { lambda: 1, dim: 3, entropy: 0.05 },
          { lambda: 2, dim: 3, entropy: 0.06 },
        ]}
      />
    )
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- SVG heatmap cells
    const cells = document.querySelectorAll('svg g.cursor-crosshair')
    await user.hover(cells[0]!)
    expect(screen.getByText(/Nearly separable/)).toBeInTheDocument()
  })
})
