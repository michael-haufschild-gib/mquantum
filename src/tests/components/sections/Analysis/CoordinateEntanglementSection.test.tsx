/**
 * Tests for CoordinateEntanglementSection — entanglement diagnostics UI.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { CoordinateEntanglementSection } from '@/components/sections/Analysis/CoordinateEntanglementSection'
import { useCoordinateEntanglementStore } from '@/stores/coordinateEntanglementStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

function setTdseMode() {
  useExtendedObjectStore.setState((s) => ({
    ...s,
    schroedinger: { ...s.schroedinger, quantumMode: 'tdseDynamics' },
  }))
}

function resetAll() {
  useExtendedObjectStore.getState().reset()
  useCoordinateEntanglementStore.setState({
    enabled: false,
    computePairwiseMI: false,
    computeBipartitions: false,
    computeWignerNegativity: false,
  })
  localStorage.clear()
}

beforeEach(() => {
  resetAll()
})

describe('CoordinateEntanglementSection', () => {
  it('shows UnavailableSection when not in tdseDynamics mode', () => {
    render(<CoordinateEntanglementSection />)
    expect(screen.getByText('Coordinate Entanglement')).toBeInTheDocument()
    expect(screen.getByText(/Available in TDSE Dynamics mode/)).toBeInTheDocument()
  })

  it('renders Section with Coordinate Entanglement title in tdseDynamics mode', () => {
    setTdseMode()
    render(<CoordinateEntanglementSection />)
    expect(screen.getByTestId('coordinate-entanglement-section')).toBeInTheDocument()
  })

  it('opens and shows Enable toggle in tdseDynamics mode', () => {
    setTdseMode()
    render(<CoordinateEntanglementSection defaultOpen={true} />)
    expect(screen.getByText('Enable')).toBeInTheDocument()
  })

  it('does NOT show diagnostics toggles when disabled', () => {
    setTdseMode()
    render(<CoordinateEntanglementSection defaultOpen={true} />)
    // enabled=false → no Pairwise MI, Bipartitions, or Wigner toggles
    expect(screen.queryByText('Pairwise MI')).not.toBeInTheDocument()
    expect(screen.queryByText('Bipartitions')).not.toBeInTheDocument()
  })

  it('shows diagnostic toggles when enabled', () => {
    setTdseMode()
    useCoordinateEntanglementStore.setState({ enabled: true })
    render(<CoordinateEntanglementSection defaultOpen={true} />)
    expect(screen.getByText('Pairwise MI')).toBeInTheDocument()
    expect(screen.getByText('Bipartitions')).toBeInTheDocument()
    expect(screen.getByText('Wigner negativity')).toBeInTheDocument()
  })

  it('shows entropy stats when enabled', () => {
    setTdseMode()
    useCoordinateEntanglementStore.setState({
      enabled: true,
      currentAverageEntropy: 0.1234,
      currentNormalizedEntropy: 0.5,
    })
    render(<CoordinateEntanglementSection defaultOpen={true} />)
    expect(screen.getByText(/S̄ = 0\.1234/)).toBeInTheDocument()
  })

  it('toggles enabled when Enable switch is clicked', async () => {
    setTdseMode()
    const user = userEvent.setup()
    render(<CoordinateEntanglementSection defaultOpen={true} />)
    const toggle = screen.getByRole('switch', { name: /Enable/i })
    await user.click(toggle)
    expect(useCoordinateEntanglementStore.getState().enabled).toBe(true)
  })

  it('shows Start λ×N Sweep button when enabled and sweep is idle', () => {
    setTdseMode()
    useCoordinateEntanglementStore.setState({ enabled: true, sweepStatus: 'idle' })
    render(<CoordinateEntanglementSection defaultOpen={true} />)
    expect(screen.getByText('Start λ×N Sweep')).toBeInTheDocument()
  })

  it('shows Abort button when sweep is running', () => {
    setTdseMode()
    useCoordinateEntanglementStore.setState({
      enabled: true,
      sweepStatus: 'running',
      sweepProgress: 0.5,
    })
    render(<CoordinateEntanglementSection defaultOpen={true} />)
    expect(screen.getByText('Abort')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('shows long-time average stats when longTimeAverage > 0', () => {
    setTdseMode()
    useCoordinateEntanglementStore.setState({
      enabled: true,
      longTimeAverage: 0.9876,
      longTimeVariance: 0.0004,
    })
    render(<CoordinateEntanglementSection defaultOpen={true} />)
    expect(screen.getByText(/⟨S̄⟩ = 0\.9876/)).toBeInTheDocument()
  })
})
