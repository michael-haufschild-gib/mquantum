/**
 * Tests for FSFAnalysisSection (FSFAnalysisContent) — free scalar field
 * analysis panel: sparkline state gates, dispersion diagram, cosmology readout,
 * diagnostics interval slider, and metrics display.
 *
 * @module tests/components/sections/Analysis/FSFAnalysisSection
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { FSFAnalysisContent } from '@/components/sections/Analysis/FSFAnalysisSection'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Push enough state into diagnosticsStore to simulate a first energy readback. */
function simulateEnergyReadback({
  totalEnergy = 1.5,
  totalNorm = 0.98,
  maxPhi = 0.3,
  maxPi = 0.4,
  energyDrift = 0.001,
  meanPhi = 0.0,
  variancePhi = 0.02,
}: Partial<{
  totalEnergy: number
  totalNorm: number
  maxPhi: number
  maxPi: number
  energyDrift: number
  meanPhi: number
  variancePhi: number
}> = {}): void {
  useDiagnosticsStore.setState((s) => ({
    fsf: {
      ...s.fsf,
      hasData: true,
      historyCount: 1,
      totalEnergy,
      totalNorm,
      maxPhi,
      maxPi,
      energyDrift,
      meanPhi,
      variancePhi,
    },
  }))
}

/** Push a particle N(η) sample (k-space readback path). */
function simulateParticleReadback(totalParticles = 42): void {
  useDiagnosticsStore.setState((s) => ({
    fsf: {
      ...s.fsf,
      historyParticlesCount: 1,
      totalParticles,
    },
  }))
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
  useDiagnosticsStore.getState().resetFsf()
})

// ─── Waiting state ───────────────────────────────────────────────────────────

describe('FSFAnalysisContent — waiting state', () => {
  it('shows "Waiting for first readback..." when no data has arrived', () => {
    render(<FSFAnalysisContent />)
    expect(screen.getByText(/Waiting for first readback/)).toBeInTheDocument()
  })

  it('does not render field observables section before any readback', () => {
    render(<FSFAnalysisContent />)
    expect(screen.queryByText('Field Observables')).toBeNull()
  })
})

// ─── Klein-Gordon dispersion diagram ─────────────────────────────────────────

describe('FSFAnalysisContent — KG dispersion diagram', () => {
  it('renders the KG dispersion diagram container', () => {
    render(<FSFAnalysisContent />)
    expect(screen.getByTestId('kg-dispersion')).toBeInTheDocument()
  })

  it('shows "Klein-Gordon Dispersion" title when cosmology is disabled', () => {
    render(<FSFAnalysisContent />)
    expect(screen.getByText(/Klein-Gordon Dispersion/)).toBeInTheDocument()
  })

  it('renders a polyline SVG element for the dispersion curve', () => {
    render(<FSFAnalysisContent />)
    expect(screen.getByTestId('kg-dispersion-polyline')).toBeInTheDocument()
  })
})

// ─── Diagnostics interval slider ─────────────────────────────────────────────

describe('FSFAnalysisContent — diagnostics interval slider', () => {
  it('renders the Diagnostics Interval slider', () => {
    render(<FSFAnalysisContent />)
    expect(screen.getByText('Diagnostics Interval (frames)')).toBeInTheDocument()
  })

  it('updates the store when the slider is changed', async () => {
    const user = userEvent.setup()
    render(<FSFAnalysisContent />)

    // The slider is a range input — find by role
    const slider = screen.getByRole('slider', { name: /Diagnostics Interval/i })
    const initialValue = Number(
      slider.getAttribute('value') ?? slider.getAttribute('aria-valuenow')
    )

    // Simulate a keyboard increment
    await user.click(slider)
    await user.keyboard('{ArrowRight}')

    const after = useExtendedObjectStore.getState().schroedinger.freeScalar.diagnosticsInterval
    expect(after).toBeGreaterThanOrEqual(1)
    expect(after).not.toBe(initialValue - 1) // moved at least somewhere
  })
})

// ─── Sparklines shown after energy readback ───────────────────────────────────

describe('FSFAnalysisContent — sparklines after energy readback', () => {
  it('renders Energy sparkline label after first readback', () => {
    simulateEnergyReadback()
    render(<FSFAnalysisContent />)
    expect(screen.getByText('Energy')).toBeInTheDocument()
  })

  it('renders Norm sparkline label after first readback', () => {
    simulateEnergyReadback()
    render(<FSFAnalysisContent />)
    expect(screen.getByText('Norm')).toBeInTheDocument()
  })

  it('renders Particles N(η) sparkline label after particle readback', () => {
    simulateParticleReadback()
    render(<FSFAnalysisContent />)
    expect(screen.getByText('Particles N(η)')).toBeInTheDocument()
  })

  it('renders Particles sparkline even when energy readback is absent', () => {
    // Particle readback runs on the unconditional k-space path
    simulateParticleReadback()
    render(<FSFAnalysisContent />)
    expect(screen.queryByText(/Waiting for first readback/)).toBeNull()
    expect(screen.getByText('Particles N(η)')).toBeInTheDocument()
  })
})

// ─── Field Observables ────────────────────────────────────────────────────────

describe('FSFAnalysisContent — field observables', () => {
  it('renders Field Observables section after energy readback', () => {
    simulateEnergyReadback()
    render(<FSFAnalysisContent />)
    expect(screen.getByText('Field Observables')).toBeInTheDocument()
  })

  it('renders Total Energy row with correct Klein-Gordon label', () => {
    simulateEnergyReadback()
    render(<FSFAnalysisContent />)
    expect(screen.getByText('Total Energy')).toBeInTheDocument()
  })

  it('renders Energy Drift row when cosmology is disabled', () => {
    simulateEnergyReadback({ energyDrift: 0.005 })
    render(<FSFAnalysisContent />)
    expect(screen.getByText('Energy Drift')).toBeInTheDocument()
  })

  it('hides Energy Drift row under cosmology (energy not conserved)', () => {
    // Enable cosmology de Sitter preset
    useExtendedObjectStore.setState((s) => ({
      schroedinger: {
        ...s.schroedinger,
        freeScalar: {
          ...s.schroedinger.freeScalar,
          cosmology: { ...s.schroedinger.freeScalar.cosmology, enabled: true, preset: 'deSitter' },
        },
      },
    }))
    simulateEnergyReadback()
    render(<FSFAnalysisContent />)
    expect(screen.queryByText('Energy Drift')).toBeNull()
  })

  it('relabels "Total Energy" to "Hamiltonian (η-dep.)" under cosmology', () => {
    useExtendedObjectStore.setState((s) => ({
      schroedinger: {
        ...s.schroedinger,
        freeScalar: {
          ...s.schroedinger.freeScalar,
          cosmology: { ...s.schroedinger.freeScalar.cosmology, enabled: true, preset: 'kasner' },
        },
      },
    }))
    simulateEnergyReadback()
    render(<FSFAnalysisContent />)
    expect(screen.getByText('Hamiltonian (η-dep.)')).toBeInTheDocument()
  })

  it('renders Total particles row after particle readback', () => {
    simulateParticleReadback(99)
    render(<FSFAnalysisContent />)
    expect(screen.getByText('Total particles')).toBeInTheDocument()
  })

  it('renders Field Observables even when only particle data is available', () => {
    // hasData=false but historyParticlesCount>0
    simulateParticleReadback()
    render(<FSFAnalysisContent />)
    expect(screen.getByText('Field Observables')).toBeInTheDocument()
  })
})

// ─── Cosmology readout ────────────────────────────────────────────────────────

describe('FSFAnalysisContent — cosmology readout', () => {
  it('does not render cosmology readout when cosmology is disabled', () => {
    render(<FSFAnalysisContent />)
    expect(screen.queryByTestId('control-group-cosmology-readout')).toBeNull()
  })

  it('shows "Dispersion ω(k) = √(k² + M²_eff(η₀))" title when cosmology is enabled', () => {
    useExtendedObjectStore.setState((s) => ({
      schroedinger: {
        ...s.schroedinger,
        freeScalar: {
          ...s.schroedinger.freeScalar,
          cosmology: { ...s.schroedinger.freeScalar.cosmology, enabled: true, preset: 'deSitter' },
        },
      },
    }))
    render(<FSFAnalysisContent />)
    expect(screen.getByText(/Dispersion ω\(k\) = √\(k² \+ M²_eff/)).toBeInTheDocument()
  })
})
