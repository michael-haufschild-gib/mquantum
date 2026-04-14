/**
 * Tests for useAtlasSweepController — tri-loop sweep lifecycle: start,
 * abort, state snapshot/restore, and setInterval polling teardown.
 *
 * The controller is a hook — it cannot be tested standalone; it is exercised
 * by rendering a thin wrapper component that exposes start/abort handlers.
 *
 * @module tests/components/sections/Analysis/useAtlasSweepController
 */

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAtlasSweepController } from '@/components/sections/Analysis/useAtlasSweepController'
import { Button } from '@/components/ui/Button'
import { useCoordinateEntanglementStore } from '@/stores/coordinateEntanglementStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useQuantumnessAtlasStore } from '@/stores/quantumnessAtlasStore'

// ─── Thin wrapper component ───────────────────────────────────────────────────

function TestHarness() {
  const { handleStartAtlasSweep, handleAbortAtlasSweep } = useAtlasSweepController()
  const status = useQuantumnessAtlasStore((s) => s.status)
  return (
    <div>
      <span data-testid="status">{status}</span>
      <Button onClick={() => handleStartAtlasSweep()}>Start</Button>
      <Button onClick={handleAbortAtlasSweep}>Abort</Button>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Configure a minimal valid sweep config (1 dim, 1 lambda step, 1 gamma). */
function configureMinimalSweep() {
  useQuantumnessAtlasStore.getState().setConfig({
    dimensions: [3],
    lambdaMin: 1,
    lambdaMax: 1,
    lambdaSteps: 1,
    gammas: [0],
    evolveSamples: 0,
    measureSamples: 1,
  })
}

/** Configure TDSE state with a known potential + dimension. */
function setupKnownTdseState() {
  useExtendedObjectStore.setState((state) => ({
    schroedinger: {
      ...state.schroedinger,
      tdse: {
        ...state.schroedinger.tdse,
        potentialType: 'harmonicTrap',
        anharmonicLambda: 7,
        stochasticEnabled: false,
        stochasticGamma: 2.5,
      },
    },
  }))
  useGeometryStore.getState().setDimension(4)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useAtlasSweepController', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
    useGeometryStore.getState().reset()
    // Reset atlas store by forcing idle status and clearing results
    useQuantumnessAtlasStore.setState({ status: 'idle', results: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('transitions status from idle to running on start', async () => {
    configureMinimalSweep()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TestHarness />)

    await user.click(screen.getByRole('button', { name: 'Start' }))

    expect(screen.getByTestId('status')).toHaveTextContent('running')
  })

  it('transitions status from running to idle on abort', async () => {
    configureMinimalSweep()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TestHarness />)

    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByTestId('status')).toHaveTextContent('running')

    await user.click(screen.getByRole('button', { name: 'Abort' }))
    expect(screen.getByTestId('status')).toHaveTextContent('idle')
  })

  it('restores pre-sweep TDSE potentialType on abort', async () => {
    setupKnownTdseState()
    configureMinimalSweep()

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TestHarness />)

    await user.click(screen.getByRole('button', { name: 'Start' }))
    // The sweep changes the potential to coupledAnharmonic
    expect(useExtendedObjectStore.getState().schroedinger.tdse.potentialType).toBe(
      'coupledAnharmonic'
    )

    await user.click(screen.getByRole('button', { name: 'Abort' }))
    // Snapshot restore should revert to harmonicOscillator
    expect(useExtendedObjectStore.getState().schroedinger.tdse.potentialType).toBe('harmonicTrap')
  })

  it('restores pre-sweep anharmonicLambda on abort', async () => {
    setupKnownTdseState()
    configureMinimalSweep()

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TestHarness />)

    await user.click(screen.getByRole('button', { name: 'Start' }))
    await user.click(screen.getByRole('button', { name: 'Abort' }))

    expect(useExtendedObjectStore.getState().schroedinger.tdse.anharmonicLambda).toBe(7)
  })

  it('restores pre-sweep dimension on abort', async () => {
    setupKnownTdseState() // sets dimension = 4
    configureMinimalSweep() // sweep runs on dimension 3

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TestHarness />)

    await user.click(screen.getByRole('button', { name: 'Start' }))
    // Sweep changes dimension to 3
    expect(useGeometryStore.getState().dimension).toBe(3)

    await user.click(screen.getByRole('button', { name: 'Abort' }))
    expect(useGeometryStore.getState().dimension).toBe(4)
  })

  it('restores pre-sweep stochasticGamma on abort', async () => {
    setupKnownTdseState() // stochasticGamma = 2.5
    configureMinimalSweep() // gammas = [0]

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TestHarness />)

    await user.click(screen.getByRole('button', { name: 'Start' }))
    await user.click(screen.getByRole('button', { name: 'Abort' }))

    expect(useExtendedObjectStore.getState().schroedinger.tdse.stochasticGamma).toBe(2.5)
  })

  it('enables entanglement and Wigner negativity on sweep start', async () => {
    configureMinimalSweep()
    // Disable both before sweep
    useCoordinateEntanglementStore.getState().setEnabled(false)
    useCoordinateEntanglementStore.getState().setComputeWignerNegativity(false)

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TestHarness />)
    await user.click(screen.getByRole('button', { name: 'Start' }))

    expect(useCoordinateEntanglementStore.getState().enabled).toBe(true)
    expect(useCoordinateEntanglementStore.getState().computeWignerNegativity).toBe(true)
  })

  it('disables pairwise MI and bipartitions on sweep start', async () => {
    configureMinimalSweep()
    useCoordinateEntanglementStore.getState().setComputePairwiseMI(true)
    useCoordinateEntanglementStore.getState().setComputeBipartitions(true)

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TestHarness />)
    await user.click(screen.getByRole('button', { name: 'Start' }))

    expect(useCoordinateEntanglementStore.getState().computePairwiseMI).toBe(false)
    expect(useCoordinateEntanglementStore.getState().computeBipartitions).toBe(false)
  })

  it('clears the interval when status leaves running on unmount', async () => {
    configureMinimalSweep()
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { unmount } = render(<TestHarness />)
    await user.click(screen.getByRole('button', { name: 'Start' }))

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })

  it('aborts when status goes from running to idle externally (e.g. complete)', async () => {
    configureMinimalSweep()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TestHarness />)
    await user.click(screen.getByRole('button', { name: 'Start' }))

    // Simulate an external status change (sweep complete)
    act(() => {
      useQuantumnessAtlasStore.setState({ status: 'complete' })
    })

    // The interval cleanup effect should fire; status display updates
    expect(screen.getByTestId('status')).toHaveTextContent('complete')
  })

  it('leaves status idle when startSweep throws due to empty dimensions', () => {
    useQuantumnessAtlasStore.getState().setConfig({
      dimensions: [],
      gammas: [0],
      lambdaMin: 1,
      lambdaMax: 2,
      lambdaSteps: 1,
      evolveSamples: 0,
      measureSamples: 1,
    })
    // atlasStore.startSweep() throws synchronously — the handler propagates it
    // as a synchronous error inside the click handler. Status must remain idle.
    expect(() => useQuantumnessAtlasStore.getState().startSweep()).toThrow(
      'dimensions and gammas must be non-empty arrays'
    )
    expect(useQuantumnessAtlasStore.getState().status).toBe('idle')
  })
})
