/**
 * Bell atlas sweep must not keep running after the scene leaves Bell mode.
 *
 * Regression: the sweep advances through a setTimeout(0) chain that only stops
 * when `sweepStatus` leaves 'running'. Switching the object type unmounted the
 * panel but nothing aborted the sweep (it is not part of useAnySweepRunning or
 * the explorer's abort list), so up to 50k trials × 32² cells kept computing on
 * the main thread behind the new mode.
 */

import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { BellSweepPanel } from '@/components/sections/Analysis/BellSweepPanel'
import { useBellExperimentStore } from '@/stores/diagnostics/bellExperimentStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

describe('BellSweepPanel unmount', () => {
  beforeEach(() => {
    useGeometryStore.getState().loadGeometry(3, 'bellPair')
    useBellExperimentStore.getState().setSweepStatus('running')
  })

  it('aborts a running sweep when unmounted because the scene left Bell mode', () => {
    const { unmount } = render(<BellSweepPanel />)
    useGeometryStore.getState().loadGeometry(4, 'schroedinger')
    unmount()
    expect(useBellExperimentStore.getState().sweepStatus).toBe('idle')
  })

  it('keeps the sweep running when the panel closes while still in Bell mode', () => {
    const { unmount } = render(<BellSweepPanel />)
    unmount()
    expect(useBellExperimentStore.getState().sweepStatus).toBe('running')
  })
})
