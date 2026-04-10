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

    // Reject any rung labelled with n > 12. Scope the query to the diagram
    // subtree and to SVG `<text>` nodes only — otherwise an unrelated node
    // somewhere in the wider render tree could fail this test even when
    // the ladder cap is correct.
    const diagram = screen.getByTestId('ho-energy-diagram')
    for (const tooHigh of ['13', '14', '15', '16']) {
      const found = within(diagram).queryAllByText(
        (_, element) => element?.tagName === 'text' && element.textContent === tooHigh
      )
      expect(found).toEqual([])
    }
  })
})
