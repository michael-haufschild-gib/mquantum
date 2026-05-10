import { beforeEach, describe, expect, it } from 'vitest'

import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/common'
import { isExportRuntimeActive } from '@/rendering/webgpu/sceneExportRuntime'
import { resetWaveEvolution } from '@/rendering/webgpu/useExportRuntime'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

type ExtendedObjectStoreState = ReturnType<typeof useExtendedObjectStore.getState>

describe('WebGPUScene export runtime state', () => {
  beforeEach(() => {
    useGeometryStore.setState(useGeometryStore.getInitialState())
    useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
  })

  it('treats fully idle runtime state as inactive', () => {
    expect(
      isExportRuntimeActive({
        starting: false,
        started: false,
        processing: false,
        finishing: false,
        canceling: false,
      })
    ).toBe(false)
  })

  it('treats each individual active phase as active', () => {
    const phases = ['starting', 'started', 'processing', 'finishing', 'canceling'] as const

    for (const phase of phases) {
      const runtime = {
        starting: false,
        started: false,
        processing: false,
        finishing: false,
        canceling: false,
      }
      runtime[phase] = true

      expect(isExportRuntimeActive(runtime), `${phase}=true should be active`).toBe(true)
    }
  })

  it('treats multiple simultaneous active phases as active', () => {
    expect(
      isExportRuntimeActive({
        starting: true,
        started: true,
        processing: true,
        finishing: false,
        canceling: false,
      })
    ).toBe(true)
  })
})

describe('resetWaveEvolution', () => {
  beforeEach(() => {
    useGeometryStore.setState(useGeometryStore.getInitialState())
    useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
  })

  it.each(['harmonicOscillator', 'hydrogenND', 'hydrogenNDCoupled'] as const)(
    'resets analytic mode parameters and open-quantum state for %s',
    (mode) => {
      useGeometryStore.setState({ objectType: 'schroedinger' })
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerQuantumMode(mode)
      store.setSchroedingerParameterValues([1, -1, 0.5])
      const resetTokenBefore = store.schroedinger.openQuantum.resetToken ?? 0

      resetWaveEvolution()

      const state = useExtendedObjectStore.getState().schroedinger
      expect(state.parameterValues).toEqual([0, 0, 0])
      expect(state.openQuantum.resetToken).toBe(resetTokenBefore + 1)
    }
  )

  it.each([
    {
      mode: 'freeScalarField',
      clear: (state: ExtendedObjectStoreState) => state.clearComputeNeedsReset('freeScalar'),
      read: (state: ExtendedObjectStoreState) => state.schroedinger.freeScalar.needsReset,
    },
    {
      mode: 'tdseDynamics',
      clear: (state: ExtendedObjectStoreState) => state.clearComputeNeedsReset('tdse'),
      read: (state: ExtendedObjectStoreState) => state.schroedinger.tdse.needsReset,
    },
    {
      mode: 'becDynamics',
      clear: (state: ExtendedObjectStoreState) => state.clearComputeNeedsReset('bec'),
      read: (state: ExtendedObjectStoreState) => state.schroedinger.bec.needsReset,
    },
    {
      mode: 'diracEquation',
      clear: (state: ExtendedObjectStoreState) => state.clearComputeNeedsReset('dirac'),
      read: (state: ExtendedObjectStoreState) => state.schroedinger.dirac.needsReset,
    },
    {
      mode: 'quantumWalk',
      clear: (state: ExtendedObjectStoreState) => state.clearComputeNeedsReset('quantumWalk'),
      read: (state: ExtendedObjectStoreState) => state.schroedinger.quantumWalk.needsReset,
    },
    {
      mode: 'wheelerDeWitt',
      clear: (state: ExtendedObjectStoreState) => state.clearComputeNeedsReset('wheelerDeWitt'),
      read: (state: ExtendedObjectStoreState) => state.schroedinger.wheelerDeWitt.needsReset,
    },
    {
      mode: 'antiDeSitter',
      clear: (state: ExtendedObjectStoreState) => state.clearComputeNeedsReset('antiDeSitter'),
      read: (state: ExtendedObjectStoreState) => state.schroedinger.antiDeSitter.needsReset,
    },
  ] satisfies {
    mode: SchroedingerQuantumMode
    clear: (state: ExtendedObjectStoreState) => void
    read: (state: ExtendedObjectStoreState) => boolean
  }[])('sets the mode reset flag for $mode', ({ mode, clear, read }) => {
    useGeometryStore.setState({ objectType: 'schroedinger' })
    useExtendedObjectStore.getState().setSchroedingerQuantumMode(mode)
    clear(useExtendedObjectStore.getState())
    expect(read(useExtendedObjectStore.getState())).toBe(false)

    resetWaveEvolution()

    expect(read(useExtendedObjectStore.getState())).toBe(true)
  })

  it('resets Pauli field when Pauli spinor is the active object type', () => {
    useGeometryStore.setState({ objectType: 'pauliSpinor' })
    const store = useExtendedObjectStore.getState()
    store.clearComputeNeedsReset('pauliSpinor')
    expect(useExtendedObjectStore.getState().pauliSpinor.needsReset).toBe(false)

    resetWaveEvolution()

    expect(useExtendedObjectStore.getState().pauliSpinor.needsReset).toBe(true)
  })
})
