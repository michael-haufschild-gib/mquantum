/**
 * Tests for HydrogenEnergyDiagram — SVG energy level + radial probability chart.
 */

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { HydrogenEnergyDiagram } from '@/components/sections/Advanced/HydrogenEnergyDiagram'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

describe('HydrogenEnergyDiagram', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().reset()
  })

  it('renders without crashing in hydrogen mode', () => {
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('hydrogenND')
    expect(() => render(<HydrogenEnergyDiagram />)).not.toThrow()
  })

  it('renders without crashing in non-hydrogen mode', () => {
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
    expect(() => render(<HydrogenEnergyDiagram />)).not.toThrow()
  })

  it('renders energy level text labels', () => {
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('hydrogenND')
    render(<HydrogenEnergyDiagram />)
    // The chart displays energy values containing "eV"
    const evLabels = screen.getAllByText(/eV/i)
    expect(evLabels.length).toBeGreaterThan(0)
  })
})
