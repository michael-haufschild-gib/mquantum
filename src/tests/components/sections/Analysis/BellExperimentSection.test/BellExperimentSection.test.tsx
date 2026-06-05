import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { BellExperimentSection } from '@/components/sections/Analysis/BellExperimentSection'
import { useBellExperimentStore } from '@/stores/diagnostics/bellExperimentStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

beforeEach(() => {
  useBellExperimentStore.getState().reset()
  useExtendedObjectStore.getState().reset()
})

describe('BellExperimentSection — smoke', () => {
  it('renders with canonical defaults and headline readouts', () => {
    render(<BellExperimentSection />)
    expect(screen.getByTestId('bell-experiment-section')).toBeInTheDocument()
    expect(screen.getByTestId('bell-experiment-content')).toBeInTheDocument()
    expect(screen.getByTestId('bell-total-trials')).toHaveTextContent('0 trials')
    // QM and LHV |S| readouts are present even before any trials run.
    expect(screen.getByTestId('bell-qm-s')).toBeInTheDocument()
    expect(screen.getByTestId('bell-lhv-s')).toBeInTheDocument()
  })

  it('loophole budget reports Werner threshold "forbids" for v=0.5', () => {
    // Drive visibility through the store; the panel subscribes via useShallow
    // and re-renders with the updated Werner status text.
    useExtendedObjectStore.getState().setBellVisibility(0.5)
    expect(useExtendedObjectStore.getState().bellPair.visibility).toBeCloseTo(0.5, 5)
    render(<BellExperimentSection />)
    expect(screen.getByTestId('bell-werner-status')).toHaveTextContent('forbids')
  })

  it('Run button toggles isRunning in the diag store', async () => {
    const user = userEvent.setup()
    render(<BellExperimentSection />)
    expect(useBellExperimentStore.getState().isRunning).toBe(false)
    const runButton = screen.getByTestId('bell-run-toggle')
    await user.click(runButton)
    expect(useBellExperimentStore.getState().isRunning).toBe(true)
    await user.click(runButton)
    expect(useBellExperimentStore.getState().isRunning).toBe(false)
  })

  it('Reset button clears accumulator state', async () => {
    const user = userEvent.setup()
    // Pre-populate some trial state.
    useBellExperimentStore
      .getState()
      .processTrialBatch(useExtendedObjectStore.getState().bellPair, 500)
    expect(useBellExperimentStore.getState().totalTrials).toBe(500)
    render(<BellExperimentSection />)
    await user.click(screen.getByTestId('bell-reset'))
    expect(useBellExperimentStore.getState().totalTrials).toBe(0)
  })

  it('Randomize-seed sets a fresh u32 seed and resets the diag store', async () => {
    const user = userEvent.setup()
    render(<BellExperimentSection />)
    const beforeSeed = useExtendedObjectStore.getState().bellPair.seed
    await user.click(screen.getByTestId('bell-randomize-seed'))
    const afterSeed = useExtendedObjectStore.getState().bellPair.seed
    // It is *extremely* unlikely the random seed equals the prior value.
    expect(afterSeed).not.toBe(beforeSeed)
    expect(useBellExperimentStore.getState().totalTrials).toBe(0)
  })

  it('displays "CHSH violated" after a converging QM run', () => {
    const cfg = useExtendedObjectStore.getState().bellPair
    // Run enough trials to comfortably exceed |S| = 2 with high probability.
    useBellExperimentStore.getState().processTrialBatch(cfg, 50_000)
    render(<BellExperimentSection />)
    expect(screen.getByTestId('bell-violated')).toBeInTheDocument()
  })

  it('labels the sparkline as S(t) when precession fields are active', () => {
    useExtendedObjectStore.getState().setBellFieldA([0, 0, 0.5])
    const cfg = useExtendedObjectStore.getState().bellPair
    useBellExperimentStore.getState().processTrialBatch(cfg, cfg.trialsPerFrame)
    useBellExperimentStore.getState().processTrialBatch(cfg, cfg.trialsPerFrame)

    render(<BellExperimentSection />)

    expect(screen.getByText(/\|S\|\(t\)/)).toBeInTheDocument()
  })

  it('LHV strategy dropdown updates the config', async () => {
    const user = userEvent.setup()
    render(<BellExperimentSection />)
    const select = screen.getByTestId('bell-lhv-strategy') as HTMLSelectElement
    await user.selectOptions(select, 'noisyClassical')
    expect(useExtendedObjectStore.getState().bellPair.lhvStrategyId).toBe('noisyClassical')
  })
})
