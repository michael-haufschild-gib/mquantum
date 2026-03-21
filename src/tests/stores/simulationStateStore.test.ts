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

// Mock the dynamic imports used by loadFromFile
vi.mock('@/lib/export/simulationState', () => ({
  deserializeSimulationState: vi.fn(async () => ({
    quantumMode: 'tdseDynamics' as const,
    latticeDim: 1,
    componentCount: 1,
    gridSize: [32],
    totalSites: 32,
    config: { quantumMode: 'tdseDynamics', tdse: { dt: 0.001 } },
    psiRe: new Float32Array(32),
    psiIm: new Float32Array(32),
  })),
}))

vi.mock('@/stores/extendedObjectStore', () => ({
  useExtendedObjectStore: {
    getState: () => ({
      setSchroedingerConfig: vi.fn(),
    }),
  },
}))

describe('simulationStateStore', () => {
  beforeEach(() => {
    useSimulationStateStore.getState().reset()
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
