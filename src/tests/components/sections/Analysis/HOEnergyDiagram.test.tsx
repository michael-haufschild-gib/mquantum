/**
 * Tests for HOEnergyDiagram — dual-axis SVG combining 1D HO energy ladder
 * and dim-0 marginal probability density.
 *
 * Pinned behavior: the diagram is intentionally a *1D marginal* of the
 * multi-D HO state, restricted to dimension 0. Both the energy ladder rungs
 * and the active-term lines must live in the dim-0 ω-units to keep the
 * picture self-consistent. The previous implementation drew active-term
 * lines at the multi-D total energy Σ_j ω_j(n_kj+½) on a ladder spaced by
 * ω_0(n+½), which made any line for a state like |0,2,3⟩ visually appear
 * "at n=6" even though the dim-0 quantum number is 0.
 *
 * Dimension terminology note: physics/store indexing is 0-based (dim 0 is
 * the first spatial dimension), but the diagram caption displays labels
 * *1-indexed* for human readers (e.g. internal dim 0 is rendered as
 * "dim 1"). Assertions in this file match the 1-indexed display text.
 */

import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { HOEnergyDiagram } from '@/components/sections/Analysis/HOEnergyDiagram'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

describe('HOEnergyDiagram', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().reset()
  })

  it('renders without crashing in HO mode', () => {
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
    expect(() => render(<HOEnergyDiagram />)).not.toThrow()
    expect(screen.getByTestId('ho-energy-diagram')).toBeInTheDocument()
  })

  it('shows the "dim 1 marginal" disclaimer so viewers know which dimension is plotted', () => {
    useGeometryStore.getState().setDimension(3)
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
    render(<HOEnergyDiagram />)
    // The disclaimer is the visual signal that the chart is showing a
    // single-dimension marginal — clarifies for the viewer that the
    // ladder rungs are dim-0 ω₀(n+½), not multi-dim total energies.
    // mquantum's MIN_DIMENSION is 2 so the chart is always a marginal
    // of a multi-dim state and the disclaimer must always be present.
    expect(screen.getByText(/dim 1 marginal/i)).toBeInTheDocument()
  })

  it('renders the n=0 ladder rung label using the dim-0 ladder', () => {
    useGeometryStore.getState().setDimension(3)
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
    render(<HOEnergyDiagram />)

    // Ladder rungs are labelled with the integer n via SVG <text> nodes.
    // Scoping the query to `<text>` prevents unrelated DOM nodes (buttons,
    // counters, form inputs) from matching the '0' literal and giving a
    // false positive — only the ladder label should count toward the check.
    const zeroLabels = screen.getAllByText(
      (_, element) => element?.tagName === 'text' && element.textContent === '0'
    )
    expect(zeroLabels.length).toBeGreaterThan(0)
  })

  it('caps displayed ladder rungs at 12 even for high-quantum-number presets', () => {
    useGeometryStore.getState().setDimension(3)
    const ext = useExtendedObjectStore.getState()
    ext.setSchroedingerQuantumMode('harmonicOscillator')
    ext.setSchroedingerPresetName('nodalStructure') // single highly-excited term, maxN=6
    render(<HOEnergyDiagram />)

    // Reject any ladder rung labelled with n > 12 regardless of value.
    // Scope to SVG `<text>` nodes within the diagram subtree so unrelated
    // DOM can't interfere, and parse the content as an integer so a
    // regression that displays n=17 (or any value above the cap) fails
    // loudly instead of slipping past a hardcoded ['13'..'16'] list.
    const diagram = screen.getByTestId('ho-energy-diagram')
    const rungLabels = within(diagram).queryAllByText((_, element) => {
      if (element?.tagName !== 'text') return false
      const text = element.textContent?.trim() ?? ''
      return /^\d+$/.test(text)
    })
    for (const node of rungLabels) {
      const n = Number.parseInt(node.textContent ?? '', 10)
      expect(n).toBeLessThanOrEqual(12)
    }
    // Sanity-check: the ladder always renders at least one rung, so an
    // empty selection would mean the query is broken (silent pass).
    expect(rungLabels.length).toBeGreaterThan(0)
  })
})
