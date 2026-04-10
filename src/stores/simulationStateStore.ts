/**
 * Simulation State Save/Load Store
 *
 * Mediates between UI buttons and the GPU render loop for saving and loading
 * full simulation state (.mqstate files). Uses a request/fulfillment pattern:
 * UI sets a request, the render loop fulfills it asynchronously.
 *
 * Also tracks eigenstate storage requests for Gram-Schmidt orthogonalization.
 *
 * @module stores/simulationStateStore
 */

import { create } from 'zustand'

import type { SaveableQuantumMode } from '@/lib/export/simulationState'
import type { PauliConfig } from '@/lib/geometry/extended/types'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

/** Status of save/load operations */
export type SimulationStateStatus = 'idle' | 'saving' | 'loading' | 'done' | 'error'

/**
 * Mode-agnostic runtime state carried alongside the wavefunction buffers.
 *
 * Modes can serialize auxiliary scalars (e.g. the Free Scalar Field's
 * cosmological simulation time `simEta`) into a sibling `_runtimeMeta`
 * record on the save blob. The deserializer extracts it into
 * `PendingLoadData.runtimeMeta` so compute passes can consume it without
 * routing through `setSchroedingerConfig` (which would pollute the store).
 */
export interface RuntimeMeta {
  /** Free Scalar Field cosmological sim time at save time. */
  simEta?: number
}

/** Loaded wavefunction data pending injection into GPU buffers */
export interface PendingLoadData {
  quantumMode: SaveableQuantumMode
  latticeDim: number
  gridSize: number[]
  totalSites: number
  config: Record<string, unknown>
  psiRe: Float32Array
  psiIm: Float32Array
  /** Optional mode-agnostic runtime state extracted from the save blob. */
  runtimeMeta?: RuntimeMeta
}

interface SimulationStateState {
  status: SimulationStateStatus
  error: string | null

  /** True when UI has requested a save; cleared by the render loop after initiating readback */
  saveRequested: boolean
  /** Loaded data waiting to be injected into GPU buffers */
  pendingLoadData: PendingLoadData | null

  /** True when UI requests storing the current eigenstate for Gram-Schmidt */
  storeEigenstateRequested: boolean
  /** Number of eigenstates currently stored */
  storedEigenstateCount: number

  /** Request saving the current simulation state */
  requestSave: () => void
  /** Load a .mqstate file — reads and parses the file, stores data for GPU injection */
  loadFromFile: (file: File) => void
  /** Called by the render loop after initiating the save readback */
  clearSaveRequest: () => void
  /** Called by the render loop after save completes */
  setSaveComplete: () => void
  /** Called by the render loop after save fails */
  setSaveError: (error: string) => void
  /** Called by the render loop after load data has been injected */
  clearLoadData: () => void
  /** Called by the render loop after load fails */
  setLoadError: (error: string) => void

  /** Request storing the current wavefunction as an eigenstate */
  requestStoreEigenstate: () => void
  /** Called by the render loop after eigenstate is stored */
  clearStoreEigenstateRequest: (newCount: number) => void
  /** Called when eigenstates are cleared (grid rebuild) */
  clearStoredEigenstates: () => void

  /** Reset to idle */
  reset: () => void
}

/**
 * Zustand store for simulation state save/load operations.
 *
 * @example
 * ```ts
 * useSimulationStateStore.getState().requestSave()
 * ```
 */
export const useSimulationStateStore = create<SimulationStateState>((set) => ({
  status: 'idle',
  error: null,
  saveRequested: false,
  pendingLoadData: null,
  storeEigenstateRequested: false,
  storedEigenstateCount: 0,

  requestSave: () => set({ saveRequested: true, status: 'saving', error: null }),

  loadFromFile: (file: File) => {
    set({ status: 'loading', error: null })
    file
      .arrayBuffer()
      .then(async (data) => {
        const { deserializeSimulationState } = await import('@/lib/export/simulationState')
        const result = await deserializeSimulationState(data)

        // Apply config immediately so mode/grid changes trigger pipeline rebuild
        // before the strategy checks pendingLoadData for wavefunction injection.
        // Force needsReset on the mode sub-config so the compute pass reinitializes
        // with the loaded grid parameters.
        const loadedConfig = result.config as Record<string, unknown>

        // Extract and strip mode-agnostic runtime state BEFORE the config is
        // pushed into the schroedinger store — otherwise `_runtimeMeta`
        // would be spread into the state as a stray field.
        const rawMeta = loadedConfig._runtimeMeta
        delete loadedConfig._runtimeMeta
        const runtimeMeta: RuntimeMeta | undefined =
          typeof rawMeta === 'object' && rawMeta !== null ? (rawMeta as RuntimeMeta) : undefined

        if (result.quantumMode === 'pauliSpinor') {
          // Pauli is a separate object type — switch objectType and apply pauli config
          useGeometryStore.getState().setObjectType('pauliSpinor')
          const pauliConfig = (loadedConfig.pauli ?? loadedConfig) as Partial<PauliConfig>
          useExtendedObjectStore.getState().setPauliConfig({
            ...pauliConfig,
            needsReset: true,
          })
        } else {
          // Compute-mode sub-configs live on `schroedinger.<mode>`, and
          // `setSchroedingerConfig` does a SHALLOW merge. Setting
          // `needsReset: true` at the top level does not propagate into the
          // sub-config the compute pass actually checks, so the field
          // buffers keep whatever vacuum data the previous reinit sampled
          // and the loaded wavefunction is silently dropped. Force the
          // reset flag onto the correct sub-config for each compute mode.
          const MODE_TO_SUBCONFIG_KEY: Record<string, string> = {
            freeScalarField: 'freeScalar',
            tdseDynamics: 'tdse',
            becDynamics: 'bec',
            diracEquation: 'dirac',
            quantumWalk: 'quantumWalk',
          }
          const subKey = MODE_TO_SUBCONFIG_KEY[result.quantumMode]
          if (subKey && typeof loadedConfig[subKey] === 'object' && loadedConfig[subKey] !== null) {
            loadedConfig[subKey] = {
              ...(loadedConfig[subKey] as Record<string, unknown>),
              needsReset: true,
            }
          }
          // Preserve the top-level flag too for analytic modes that read it.
          loadedConfig.needsReset = true
          useExtendedObjectStore.getState().setSchroedingerConfig({
            quantumMode: result.quantumMode,
            ...loadedConfig,
          })
        }

        set({
          pendingLoadData: {
            quantumMode: result.quantumMode,
            latticeDim: result.latticeDim,
            gridSize: result.gridSize,
            totalSites: result.totalSites,
            config: result.config,
            psiRe: result.psiRe,
            psiIm: result.psiIm,
            runtimeMeta,
          },
        })
      })
      .catch((err) => {
        set({ status: 'error', error: String(err) })
      })
  },

  clearSaveRequest: () => set({ saveRequested: false }),
  setSaveComplete: () => set({ status: 'done', saveRequested: false }),
  setSaveError: (error) => set({ status: 'error', error, saveRequested: false }),
  clearLoadData: () => set({ pendingLoadData: null, status: 'done' }),
  setLoadError: (error) => set({ status: 'error', error, pendingLoadData: null }),

  requestStoreEigenstate: () => set({ storeEigenstateRequested: true }),
  clearStoreEigenstateRequest: (newCount) =>
    set({ storeEigenstateRequested: false, storedEigenstateCount: newCount }),
  clearStoredEigenstates: () => set({ storedEigenstateCount: 0 }),

  reset: () =>
    set({
      status: 'idle',
      error: null,
      saveRequested: false,
      pendingLoadData: null,
      storeEigenstateRequested: false,
      storedEigenstateCount: 0,
    }),
}))
