/**
 * Tests for DecoherenceSection — CSL controls and branch visualization.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { DecoherenceSection } from '@/components/sections/Analysis/DecoherenceSection'
import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/types'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

function setTdseMode() {
  useExtendedObjectStore.setState((state) => ({
    ...state,
    schroedinger: {
      ...state.schroedinger,
      quantumMode: 'tdseDynamics',
      tdse: { ...DEFAULT_TDSE_CONFIG },
    },
  }))
}

/** Open the Decoherence Section and wait for content to appear. */
async function openSection(user: ReturnType<typeof userEvent.setup>) {
  const btn = screen.getByRole('button', { name: /decoherence/i })
  await user.click(btn)
}

beforeEach(() => {
  useExtendedObjectStore.getState().reset()
  localStorage.clear()
})

describe('DecoherenceSection', () => {
  it('shows UnavailableSection when not in tdseDynamics mode', () => {
    render(<DecoherenceSection />)
    expect(screen.getByText('Decoherence')).toBeInTheDocument()
    expect(screen.getByText(/Available in TDSE Dynamics mode/)).toBeInTheDocument()
  })

  it('shows UnavailableSection for blackHoleRingdown potential', () => {
    setTdseMode()
    useExtendedObjectStore.setState((state) => ({
      ...state,
      schroedinger: {
        ...state.schroedinger,
        tdse: { ...DEFAULT_TDSE_CONFIG, potentialType: 'blackHoleRingdown' },
      },
    }))
    render(<DecoherenceSection />)
    expect(screen.getByText(/Not applicable to Regge/)).toBeInTheDocument()
  })

  it('renders Enable Decoherence toggle after opening section', async () => {
    setTdseMode()
    const user = userEvent.setup()
    render(<DecoherenceSection />)
    await openSection(user)
    expect(screen.getByText('Enable Decoherence')).toBeInTheDocument()
  })

  it('does NOT show CSL sliders when stochasticEnabled is false (after opening)', async () => {
    setTdseMode()
    const user = userEvent.setup()
    render(<DecoherenceSection />)
    await openSection(user)
    expect(screen.queryByText(/Monitoring rate/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Localization width/)).not.toBeInTheDocument()
  })

  it('shows CSL parameter sliders after opening when stochasticEnabled is true', async () => {
    setTdseMode()
    useExtendedObjectStore.getState().setTdseStochasticEnabled(true)
    const user = userEvent.setup()
    render(<DecoherenceSection />)
    await openSection(user)
    expect(screen.getByText(/Monitoring rate \(γ\)/)).toBeInTheDocument()
    expect(screen.getByText(/Localization width \(σ\)/)).toBeInTheDocument()
    expect(screen.getByText(/Collapse sites\/step/)).toBeInTheDocument()
  })

  it('shows branching toggle after opening when stochasticEnabled is true', async () => {
    setTdseMode()
    useExtendedObjectStore.getState().setTdseStochasticEnabled(true)
    const user = userEvent.setup()
    render(<DecoherenceSection />)
    await openSection(user)
    // Wait for CSL sliders (confirms Section content is rendered), then check branching toggle
    expect(await screen.findByText(/Monitoring rate \(γ\)/)).toBeInTheDocument()
    expect(screen.getByTestId('decoherence-branching-toggle')).toBeInTheDocument()
  })

  it('does NOT show branch plane when branchingEnabled is false (after opening)', async () => {
    setTdseMode()
    useExtendedObjectStore.getState().setTdseStochasticEnabled(true)
    const user = userEvent.setup()
    render(<DecoherenceSection />)
    await openSection(user)
    expect(await screen.findByText(/Monitoring rate \(γ\)/)).toBeInTheDocument()
    expect(screen.queryByText(/Branch plane/)).not.toBeInTheDocument()
  })

  it('shows branch plane slider and color pickers when branchingEnabled is true and groups opened', async () => {
    setTdseMode()
    useExtendedObjectStore.getState().setTdseStochasticEnabled(true)
    useExtendedObjectStore.getState().setTdseBranchingEnabled(true)
    const user = userEvent.setup()
    render(<DecoherenceSection />)
    await openSection(user)
    // Wait for Section content, then open the Show branches sub-group (defaultOpen=false)
    expect(await screen.findByText(/Monitoring rate \(γ\)/)).toBeInTheDocument()
    await user.click(screen.getByTestId('control-group-decoherence-show-branches-header'))
    expect(await screen.findByText(/Branch plane/)).toBeInTheDocument()
    expect(screen.getByText('Branch A')).toBeInTheDocument()
    expect(screen.getByText('Branch B')).toBeInTheDocument()
  })

  it('toggles stochasticEnabled via the Enable Decoherence switch', async () => {
    setTdseMode()
    const user = userEvent.setup()
    render(<DecoherenceSection />)
    await openSection(user)
    const toggle = screen.getByRole('switch', { name: /Enable Decoherence/i })
    await user.click(toggle)
    expect(useExtendedObjectStore.getState().schroedinger.tdse?.stochasticEnabled).toBe(true)
  })
})
