import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import {
  handleSimulationStateIO,
  type StateSaveLoadPass,
} from '@/rendering/webgpu/renderers/strategies/computeGridUtils'
import { useSimulationStateStore } from '@/stores/runtime/simulationStateStore'

function makePass(scheduleSave: boolean): StateSaveLoadPass {
  return {
    requestStateSave: vi.fn(() => scheduleSave),
    setLoadedWavefunction: vi.fn(),
  }
}

describe('handleSimulationStateIO save request routing', () => {
  beforeEach(() => {
    useSimulationStateStore.setState(useSimulationStateStore.getInitialState(), true)
  })

  it('errors and clears a save request captured for a mode no longer handled by the active strategy', () => {
    const pass = makePass(true)
    useSimulationStateStore.setState({
      status: 'saving',
      saveRequested: true,
      saveRequestedForMode: 'tdseDynamics',
      error: null,
    })

    handleSimulationStateIO({} as WebGPURenderContext, pass, ['diracEquation'])

    expect(pass.requestStateSave).not.toHaveBeenCalled()
    const state = useSimulationStateStore.getState()
    expect(state.status).toBe('error')
    expect(state.saveRequested).toBe(false)
    expect(state.saveRequestedForMode).toBeNull()
    expect(state.error).toContain('tdseDynamics')
  })

  it('keeps a matching save request pending when readback scheduling is still busy', () => {
    const pass = makePass(false)
    useSimulationStateStore.setState({
      status: 'saving',
      saveRequested: true,
      saveRequestedForMode: 'tdseDynamics',
      error: null,
    })

    handleSimulationStateIO({} as WebGPURenderContext, pass, ['tdseDynamics'])

    expect(pass.requestStateSave).toHaveBeenCalledOnce()
    const state = useSimulationStateStore.getState()
    expect(state.status).toBe('saving')
    expect(state.saveRequested).toBe(true)
    expect(state.saveRequestedForMode).toBe('tdseDynamics')
  })
})
