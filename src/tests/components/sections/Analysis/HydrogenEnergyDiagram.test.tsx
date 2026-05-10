/**
 * Tests for HydrogenEnergyDiagram — SVG energy level + radial probability chart.
 *
 * Pinned behavior: the chart uses the D-dimensional Coulomb energy shift
 * n_eff = n + (D-3)/2 and marks radial nodes from R_nl. A render-only smoke
 * test would miss both classes of visual lie: showing 3D Balmer labels in
 * higher dimension, or drawing the wrong node count for the selected orbital.
 */

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { HydrogenEnergyDiagram } from '@/components/sections/Analysis/HydrogenEnergyDiagram'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

describe('HydrogenEnergyDiagram', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().reset()
  })

  it('renders the selected orbital state label', () => {
    const ext = useExtendedObjectStore.getState()
    ext.setSchroedingerQuantumMode('hydrogenND')
    ext.setSchroedingerPrincipalQuantumNumber(3)
    ext.setSchroedingerAzimuthalQuantumNumber(1)

    render(<HydrogenEnergyDiagram />)

    expect(screen.getByTestId('hydrogen-energy-diagram')).toBeInTheDocument()
    expect(screen.getByText('n=3, l=1')).toBeInTheDocument()
  })

  it('uses D-dimensional n_eff energy labels instead of always using the 3D Balmer ladder', () => {
    useGeometryStore.getState().setDimension(5)
    const ext = useExtendedObjectStore.getState()
    ext.setSchroedingerQuantumMode('hydrogenND')
    ext.setSchroedingerPrincipalQuantumNumber(3)
    ext.setSchroedingerAzimuthalQuantumNumber(1)

    render(<HydrogenEnergyDiagram />)

    expect(screen.queryByText('-13.6')).not.toBeInTheDocument()
    expect(screen.getByText('-3.4')).toBeInTheDocument()
    expect(screen.getByText('-1.5')).toBeInTheDocument()
    expect(screen.getByText('-0.8')).toBeInTheDocument()
    expect(screen.getByText('-0.5')).toBeInTheDocument()
    expect(screen.getByText('E (eV)')).toBeInTheDocument()
  })

  it('draws one radial node for a 3p state and no radial nodes for a 3d state', () => {
    const ext = useExtendedObjectStore.getState()
    ext.setSchroedingerQuantumMode('hydrogenND')
    ext.setSchroedingerPrincipalQuantumNumber(3)
    ext.setSchroedingerAzimuthalQuantumNumber(1)

    const { rerender } = render(<HydrogenEnergyDiagram />)
    expect(screen.getAllByTestId('hydrogen-node-marker')).toHaveLength(1)

    ext.setSchroedingerAzimuthalQuantumNumber(2)
    rerender(<HydrogenEnergyDiagram />)

    expect(screen.getByText('n=3, l=2')).toBeInTheDocument()
    expect(screen.queryAllByTestId('hydrogen-node-marker')).toHaveLength(0)
  })
})
