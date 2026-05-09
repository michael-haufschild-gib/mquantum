/**
 * Unit tests for simulationStateStore.
 *
 * Verifies:
 * - requestSave sets status and saveRequested flag
 * - clearSaveRequest / setSaveComplete / setSaveError transitions
 * - loadFromFile parses .mqstate data and sets pendingLoadData
 * - clearLoadData transitions to done
 * - setLoadError transitions to error
 * - Eigenstate storage request/clear cycle
 * - reset clears all state
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type PendingLoadData, useSimulationStateStore } from '@/stores/simulationStateStore'

// Mock target — mutated per test to exercise different quantum modes.
const {
  deserializeMock,
  setSchroedingerConfigSpy,
  setPauliConfigSpy,
  setObjectTypeSpy,
  performanceState,
  setIsLoadingSceneSpy,
} = vi.hoisted(() => {
  const performanceState = { isLoadingScene: false }
  return {
    deserializeMock: vi.fn(),
    setSchroedingerConfigSpy: vi.fn(),
    setPauliConfigSpy: vi.fn(),
    setObjectTypeSpy: vi.fn(),
    performanceState,
    setIsLoadingSceneSpy: vi.fn((loading: boolean) => {
      performanceState.isLoadingScene = loading
    }),
  }
})

// Mock the dynamic imports used by loadFromFile
vi.mock('@/lib/export/simulationState', () => ({
  deserializeSimulationState: deserializeMock,
}))

vi.mock('@/stores/extendedObjectStore', () => ({
  useExtendedObjectStore: {
    getState: () => ({
      setSchroedingerConfig: setSchroedingerConfigSpy,
      setPauliConfig: setPauliConfigSpy,
    }),
  },
}))

vi.mock('@/stores/geometryStore', () => ({
  useGeometryStore: {
    getState: () => ({
      setObjectType: setObjectTypeSpy,
    }),
  },
}))

vi.mock('@/stores/performanceStore', () => ({
  usePerformanceStore: {
    getState: () => ({
      isLoadingScene: performanceState.isLoadingScene,
      setIsLoadingScene: setIsLoadingSceneSpy,
    }),
  },
}))

describe('simulationStateStore', () => {
  beforeEach(() => {
    useSimulationStateStore.getState().reset()
    setSchroedingerConfigSpy.mockClear()
    setPauliConfigSpy.mockClear()
    setObjectTypeSpy.mockClear()
    setIsLoadingSceneSpy.mockClear()
    performanceState.isLoadingScene = false
    // Default mock — individual tests override.
    deserializeMock.mockImplementation(async () => ({
      quantumMode: 'tdseDynamics' as const,
      latticeDim: 1,
      componentCount: 1,
      gridSize: [32],
      totalSites: 32,
      config: { quantumMode: 'tdseDynamics', tdse: { dt: 0.001 } },
      psiRe: new Float32Array(32),
      psiIm: new Float32Array(32),
    }))
  })

  describe('save flow', () => {
    it('requestSave sets status to saving and saveRequested to true', () => {
      useSimulationStateStore.getState().requestSave()

      const state = useSimulationStateStore.getState()
      expect(state.status).toBe('saving')
      expect(state.saveRequested).toBe(true)
      expect(state.error).toBeNull()
    })

    it('clearSaveRequest clears the flag without changing status', () => {
      useSimulationStateStore.getState().requestSave()
      useSimulationStateStore.getState().clearSaveRequest()

      const state = useSimulationStateStore.getState()
      expect(state.saveRequested).toBe(false)
      // Status remains 'saving' — only clearSaveRequest was called
      expect(state.status).toBe('saving')
    })

    it('setSaveComplete transitions to done', () => {
      useSimulationStateStore.getState().requestSave()
      useSimulationStateStore.getState().setSaveComplete()

      const state = useSimulationStateStore.getState()
      expect(state.status).toBe('done')
      expect(state.saveRequested).toBe(false)
    })

    it('setSaveError transitions to error with message', () => {
      useSimulationStateStore.getState().requestSave()
      useSimulationStateStore.getState().setSaveError('GPU readback failed')

      const state = useSimulationStateStore.getState()
      expect(state.status).toBe('error')
      expect(state.error).toBe('GPU readback failed')
      expect(state.saveRequested).toBe(false)
    })
  })

  describe('load flow', () => {
    it('loadFromFile sets status to loading', () => {
      const file = new File([new ArrayBuffer(128)], 'test.mqstate', {
        type: 'application/octet-stream',
      })
      useSimulationStateStore.getState().loadFromFile(file)
      expect(useSimulationStateStore.getState().status).toBe('loading')
    })

    it('clearLoadData transitions to done and clears pendingLoadData', () => {
      const mockLoadData: PendingLoadData = {
        quantumMode: 'tdseDynamics',
        latticeDim: 1,
        gridSize: [32],
        totalSites: 32,
        config: {},
        psiRe: new Float32Array(32),
        psiIm: new Float32Array(32),
      }
      useSimulationStateStore.setState({ pendingLoadData: mockLoadData, status: 'loading' })
      useSimulationStateStore.getState().clearLoadData()

      const state = useSimulationStateStore.getState()
      expect(state.status).toBe('done')
      expect(state.pendingLoadData).toBeNull()
    })

    it('loadFromFile forces freeScalar.needsReset on the FSF sub-config', async () => {
      // setSchroedingerConfig does a SHALLOW merge; writing `needsReset: true`
      // at the top level does NOT propagate to `freeScalar.needsReset`, which
      // is what the compute pass actually checks. The store must write the
      // reset flag into the sub-config for the loaded quantum mode.
      deserializeMock.mockImplementationOnce(async () => ({
        quantumMode: 'freeScalarField' as const,
        latticeDim: 3,
        componentCount: 1,
        gridSize: [8, 8, 8],
        totalSites: 512,
        config: {
          quantumMode: 'freeScalarField',
          // Simulate a saved config whose freeScalar.needsReset was false —
          // the normal live state.
          freeScalar: { dt: 0.01, needsReset: false },
        },
        psiRe: new Float32Array(512),
        psiIm: new Float32Array(512),
      }))

      const file = new File([new ArrayBuffer(128)], 'fsf.mqstate', {
        type: 'application/octet-stream',
      })
      useSimulationStateStore.getState().loadFromFile(file)
      await vi.waitFor(() => {
        expect(setSchroedingerConfigSpy).toHaveBeenCalledTimes(1)
      })
      const pushed = setSchroedingerConfigSpy.mock.calls[0]![0] as {
        freeScalar: { needsReset: boolean }
      }
      expect(pushed.freeScalar.needsReset).toBe(true)
    })

    it('loadFromFile snaps freeScalar grids to the compute power-of-2 invariant', async () => {
      deserializeMock.mockImplementationOnce(async () => ({
        quantumMode: 'freeScalarField' as const,
        latticeDim: 3,
        componentCount: 1,
        gridSize: [48, 48, 48],
        totalSites: 64 * 64 * 64,
        config: {
          quantumMode: 'freeScalarField',
          freeScalar: {
            latticeDim: 3,
            gridSize: [48, 48, 48],
            needsReset: false,
          },
        },
        psiRe: new Float32Array(64 * 64 * 64),
        psiIm: new Float32Array(64 * 64 * 64),
      }))

      const file = new File([new ArrayBuffer(128)], 'fsf_nonpow2.mqstate', {
        type: 'application/octet-stream',
      })
      useSimulationStateStore.getState().loadFromFile(file)
      await vi.waitFor(() => {
        expect(setSchroedingerConfigSpy).toHaveBeenCalledTimes(1)
      })
      const pushed = setSchroedingerConfigSpy.mock.calls[0]![0] as {
        freeScalar: { gridSize: number[]; needsReset: boolean }
      }
      expect(pushed.freeScalar.gridSize).toEqual([64, 64, 64])
      expect(pushed.freeScalar.needsReset).toBe(true)
    })

    it('loadFromFile extracts simEta from _runtimeMeta into pendingLoadData.runtimeMeta', async () => {
      // L7 audit regression: the cosmological FSF save format carries
      // `simEta` in a sibling `_runtimeMeta` record so the compute pass can
      // restore the cosmological clock without polluting the schroedinger
      // store. Verify that:
      //  1. `pendingLoadData.runtimeMeta.simEta` matches what was on disk.
      //  2. `setSchroedingerConfig` is invoked WITHOUT a `_runtimeMeta` field
      //     (otherwise zustand spreads it as a stray top-level state key).
      //  3. The deserializer's untouched config is still exposed via
      //     `pendingLoadData.config` so consumers see the on-disk record.
      deserializeMock.mockImplementationOnce(async () => ({
        quantumMode: 'freeScalarField' as const,
        latticeDim: 3,
        componentCount: 1,
        gridSize: [8, 8, 8],
        totalSites: 512,
        config: {
          quantumMode: 'freeScalarField',
          freeScalar: { dt: 0.005, needsReset: false },
          _runtimeMeta: { simEta: -7.25 },
        },
        psiRe: new Float32Array(512),
        psiIm: new Float32Array(512),
      }))

      const file = new File([new ArrayBuffer(128)], 'fsf_cosmo.mqstate', {
        type: 'application/octet-stream',
      })
      useSimulationStateStore.getState().loadFromFile(file)
      await vi.waitFor(() => {
        expect(setSchroedingerConfigSpy).toHaveBeenCalledTimes(1)
      })

      const pushed = setSchroedingerConfigSpy.mock.calls[0]![0] as Record<string, unknown>
      // The store push must NOT carry _runtimeMeta into the schroedinger
      // state — that field has nowhere to land and would pollute the store.
      expect(pushed).not.toHaveProperty('_runtimeMeta')
      // The sub-config still gets needsReset forced on.
      expect((pushed.freeScalar as { needsReset: boolean }).needsReset).toBe(true)

      // The pending load record carries the runtime meta for the compute
      // pass to consume via setLoadedRuntimeSimEta.
      const pending = useSimulationStateStore.getState().pendingLoadData
      expect(pending?.runtimeMeta?.simEta).toBe(-7.25)
      // And the on-disk config is exposed verbatim — including _runtimeMeta.
      expect(pending?.config).toMatchObject({ _runtimeMeta: { simEta: -7.25 } })
    })

    it('loadFromFile extracts preheating drive state from _runtimeMeta', async () => {
      // Preheating-drive save/reload regression: the saved phi/pi field was
      // evolved under the time-dependent Hamiltonian `m² · (1 + A·sin(Ω·(clock
      // − ref)))`, so the load path must carry `preheatingReferenceEta` and
      // `preheatingTime` through `pendingLoadData.runtimeMeta` to keep the
      // Mathieu modulation in phase with the resumed buffers. Missing either
      // field would re-anchor the drive to phase 0 and produce a physically
      // inconsistent evolution on resume.
      deserializeMock.mockImplementationOnce(async () => ({
        quantumMode: 'freeScalarField' as const,
        latticeDim: 3,
        componentCount: 1,
        gridSize: [8, 8, 8],
        totalSites: 512,
        config: {
          quantumMode: 'freeScalarField',
          freeScalar: { dt: 0.005, needsReset: false },
          _runtimeMeta: {
            simEta: -4.5,
            preheatingReferenceEta: -10,
            preheatingTime: 5.5,
          },
        },
        psiRe: new Float32Array(512),
        psiIm: new Float32Array(512),
      }))

      const file = new File([new ArrayBuffer(128)], 'fsf_preheating.mqstate', {
        type: 'application/octet-stream',
      })
      useSimulationStateStore.getState().loadFromFile(file)
      await vi.waitFor(() => {
        expect(setSchroedingerConfigSpy).toHaveBeenCalledTimes(1)
      })

      const pending = useSimulationStateStore.getState().pendingLoadData
      expect(pending?.runtimeMeta?.simEta).toBe(-4.5)
      expect(pending?.runtimeMeta?.preheatingReferenceEta).toBe(-10)
      expect(pending?.runtimeMeta?.preheatingTime).toBe(5.5)
    })

    it('loadFromFile leaves runtimeMeta undefined when the save predates cosmology', async () => {
      // Files saved before the cosmology feature have no _runtimeMeta. The
      // store must default to `runtimeMeta: undefined` so the compute pass
      // falls back to `config.cosmology.eta0` for the start of the clock.
      deserializeMock.mockImplementationOnce(async () => ({
        quantumMode: 'freeScalarField' as const,
        latticeDim: 3,
        componentCount: 1,
        gridSize: [8, 8, 8],
        totalSites: 512,
        config: {
          quantumMode: 'freeScalarField',
          freeScalar: { dt: 0.005 },
        },
        psiRe: new Float32Array(512),
        psiIm: new Float32Array(512),
      }))

      const file = new File([new ArrayBuffer(128)], 'legacy_fsf.mqstate', {
        type: 'application/octet-stream',
      })
      useSimulationStateStore.getState().loadFromFile(file)
      await vi.waitFor(() => {
        expect(setSchroedingerConfigSpy).toHaveBeenCalledTimes(1)
      })

      const pending = useSimulationStateStore.getState().pendingLoadData
      expect(pending?.runtimeMeta).toBeUndefined()
    })

    it('loadFromFile forces tdse.needsReset on the TDSE sub-config', async () => {
      deserializeMock.mockImplementationOnce(async () => ({
        quantumMode: 'tdseDynamics' as const,
        latticeDim: 2,
        componentCount: 1,
        gridSize: [32, 32],
        totalSites: 1024,
        config: {
          quantumMode: 'tdseDynamics',
          tdse: { dt: 0.001, needsReset: false },
        },
        psiRe: new Float32Array(1024),
        psiIm: new Float32Array(1024),
      }))

      const file = new File([new ArrayBuffer(128)], 'tdse.mqstate', {
        type: 'application/octet-stream',
      })
      useSimulationStateStore.getState().loadFromFile(file)
      await vi.waitFor(() => {
        expect(setSchroedingerConfigSpy).toHaveBeenCalledTimes(1)
      })
      const pushed = setSchroedingerConfigSpy.mock.calls[0]![0] as {
        tdse: { needsReset: boolean }
      }
      expect(pushed.tdse.needsReset).toBe(true)
    })

    it.each([
      ['wheelerDeWitt', 'wheelerDeWitt'],
      ['antiDeSitter', 'antiDeSitter'],
    ] as const)(
      'loadFromFile forces needsReset on the registry sub-config for %s',
      async (quantumMode, subKey) => {
        deserializeMock.mockImplementationOnce(async () => ({
          quantumMode,
          latticeDim: 3,
          componentCount: 1,
          gridSize: [8, 8, 8],
          totalSites: 512,
          config: {
            quantumMode,
            [subKey]: { stepsPerFrame: 2, needsReset: false },
          },
          psiRe: new Float32Array(512),
          psiIm: new Float32Array(512),
        }))

        const file = new File([new ArrayBuffer(128)], `${quantumMode}.mqstate`, {
          type: 'application/octet-stream',
        })
        useSimulationStateStore.getState().loadFromFile(file)
        await vi.waitFor(() => {
          expect(setSchroedingerConfigSpy).toHaveBeenCalledTimes(1)
        })
        const pushed = setSchroedingerConfigSpy.mock.calls[0]![0] as Record<string, unknown>
        expect(pushed.quantumMode).toBe(quantumMode)
        expect((pushed[subKey] as { needsReset: boolean }).needsReset).toBe(true)
      }
    )

    it('guards Pauli mqstate restore so object-type initialization cannot clobber loaded config', async () => {
      setObjectTypeSpy.mockImplementationOnce(() => {
        expect(performanceState.isLoadingScene).toBe(true)
      })
      setPauliConfigSpy.mockImplementationOnce(() => {
        expect(performanceState.isLoadingScene).toBe(true)
      })
      deserializeMock.mockImplementationOnce(async () => ({
        quantumMode: 'pauliSpinor' as const,
        latticeDim: 3,
        componentCount: 2,
        gridSize: [16, 16, 16],
        totalSites: 4096,
        config: {
          pauli: {
            fieldType: 'quadrupole',
            fieldView: 'coherence',
            latticeDim: 3,
            gridSize: [16, 16, 16],
            spacing: [0.2, 0.2, 0.2],
            packetCenter: [1, 2, 3],
            packetMomentum: [4, 5, 6],
            needsReset: false,
          },
        },
        psiRe: new Float32Array(8192),
        psiIm: new Float32Array(8192),
      }))

      const file = new File([new ArrayBuffer(128)], 'pauli.mqstate', {
        type: 'application/octet-stream',
      })
      useSimulationStateStore.getState().loadFromFile(file)

      await vi.waitFor(() => {
        expect(setPauliConfigSpy).toHaveBeenCalledTimes(1)
      })

      const loadingOnOrder = setIsLoadingSceneSpy.mock.invocationCallOrder[0]!
      expect(setIsLoadingSceneSpy.mock.calls[0]).toEqual([true])
      expect(loadingOnOrder).toBeLessThan(setObjectTypeSpy.mock.invocationCallOrder[0]!)
      expect(loadingOnOrder).toBeLessThan(setPauliConfigSpy.mock.invocationCallOrder[0]!)
      expect(setObjectTypeSpy).toHaveBeenCalledWith('pauliSpinor')
      expect(setPauliConfigSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldType: 'quadrupole',
          fieldView: 'coherence',
          gridSize: [16, 16, 16],
          spacing: [0.2, 0.2, 0.2],
          packetCenter: [1, 2, 3],
          packetMomentum: [4, 5, 6],
          needsReset: true,
        })
      )

      await vi.waitFor(() => {
        expect(setIsLoadingSceneSpy).toHaveBeenLastCalledWith(false)
      })
      expect(performanceState.isLoadingScene).toBe(false)
    })

    it('setLoadError transitions to error and clears pendingLoadData', () => {
      const mockLoadData: PendingLoadData = {
        quantumMode: 'tdseDynamics',
        latticeDim: 1,
        gridSize: [32],
        totalSites: 32,
        config: {},
        psiRe: new Float32Array(32),
        psiIm: new Float32Array(32),
      }
      useSimulationStateStore.setState({ pendingLoadData: mockLoadData, status: 'loading' })
      useSimulationStateStore.getState().setLoadError('Parse failed')

      const state = useSimulationStateStore.getState()
      expect(state.status).toBe('error')
      expect(state.error).toBe('Parse failed')
      expect(state.pendingLoadData).toBeNull()
    })
  })

  describe('eigenstate storage', () => {
    it('requestStoreEigenstate sets the flag', () => {
      useSimulationStateStore.getState().requestStoreEigenstate()
      expect(useSimulationStateStore.getState().storeEigenstateRequested).toBe(true)
    })

    it('clearStoreEigenstateRequest clears flag and updates count', () => {
      useSimulationStateStore.getState().requestStoreEigenstate()
      useSimulationStateStore.getState().clearStoreEigenstateRequest(3)

      const state = useSimulationStateStore.getState()
      expect(state.storeEigenstateRequested).toBe(false)
      expect(state.storedEigenstateCount).toBe(3)
    })

    it('clearStoredEigenstates resets count to zero', () => {
      useSimulationStateStore.getState().clearStoreEigenstateRequest(5)
      useSimulationStateStore.getState().clearStoredEigenstates()
      expect(useSimulationStateStore.getState().storedEigenstateCount).toBe(0)
    })
  })

  describe('reset', () => {
    it('resets all state to initial values', () => {
      useSimulationStateStore.setState({
        status: 'error',
        error: 'something',
        saveRequested: true,
        pendingLoadData: {
          quantumMode: 'tdseDynamics',
          latticeDim: 1,
          gridSize: [32],
          totalSites: 32,
          config: {},
          psiRe: new Float32Array(32),
          psiIm: new Float32Array(32),
        },
        storeEigenstateRequested: true,
        storedEigenstateCount: 5,
      })

      useSimulationStateStore.getState().reset()

      const state = useSimulationStateStore.getState()
      expect(state.status).toBe('idle')
      expect(state.error).toBeNull()
      expect(state.saveRequested).toBe(false)
      expect(state.pendingLoadData).toBeNull()
      expect(state.storeEigenstateRequested).toBe(false)
      expect(state.storedEigenstateCount).toBe(0)
    })
  })
})
