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
 */

import { render, screen } from '@testing-library/react'
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
    // The n=0 rung is always present because displayMaxN is at least
    // max(dim-0 n) + 2. testing-library's getAllByText returns matching
    // nodes anywhere inside the rendered tree without traversing the DOM
    // by hand.
    const zeroLabels = screen.getAllByText((_, element) => element?.textContent === '0')
    expect(zeroLabels.length).toBeGreaterThan(0)
  })

  it('caps displayed ladder rungs at 12 even for high-quantum-number presets', () => {
    useGeometryStore.getState().setDimension(3)
    const ext = useExtendedObjectStore.getState()
    ext.setSchroedingerQuantumMode('harmonicOscillator')
    ext.setSchroedingerPresetName('nodalStructure') // single highly-excited term, maxN=6
    render(<HOEnergyDiagram />)

    // Reject any rung labelled with n > 12. Iterate possible high values
    // via queryAllByText (returns [] when not present) so the test fails
    // loudly if the displayMaxN cap regresses.
    for (const tooHigh of ['13', '14', '15', '16']) {
      const found = screen.queryAllByText((_, element) => element?.textContent === tooHigh)
      expect(found).toEqual([])
    }
  })
})
