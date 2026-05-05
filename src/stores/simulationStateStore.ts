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
import { getQuantumTypeConfigSubKey } from '@/lib/geometry/registry'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { usePerformanceStore } from '@/stores/performanceStore'

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
  /**
   * Free Scalar Field preheating drive reference time captured at the most
   * recent reset. Required so resuming a save resumes at the same phase of
   * the `1 + A·sin(Ω·(clock − ref))` modulation the saved phi/pi buffers
   * were evolved under — otherwise reload re-anchors to phase 0 and the
   * time-dependent Hamiltonian diverges from the field state.
   */
  preheatingReferenceEta?: number
  /**
   * Free Scalar Field Minkowski-path preheating clock at save time. Under
   * cosmology the drive reads `simEta` directly, but with cosmology off the
   * pass advances a separate `preheatingTime` counter; this field carries
   * that counter across save/reload so the Mathieu drive resumes in phase.
   */
  preheatingTime?: number
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
  /** Quantum mode that was active when the save was requested; prevents cross-mode consumption */
  saveRequestedForMode: SaveableQuantumMode | null
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

/** Clear the scene-loading guard after React effects observe the guarded restore. */
function scheduleClearLoadingFlag(): void {
  const clearFlag = () => usePerformanceStore.getState().setIsLoadingScene(false)
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(clearFlag)
  } else {
    setTimeout(clearFlag, 0)
  }
}

/**
 * Zustand store for simulation state save/load operations.
 *
 * @example
 * ```ts
 * useSimulationStateStore.getState().requestSave()
 * ```
 */
export const useSimulationStateStore = create<SimulationStateState>((set, get) => ({
  status: 'idle',
  error: null,
  saveRequested: false,
  saveRequestedForMode: null,
  pendingLoadData: null,
  storeEigenstateRequested: false,
  storedEigenstateCount: 0,

  requestSave: () => {
    const { status, pendingLoadData } = get()
    if (status === 'loading' || pendingLoadData) return

    const objectType = useGeometryStore.getState().objectType
    const mode: SaveableQuantumMode | null =
      objectType === 'pauliSpinor'
        ? 'pauliSpinor'
        : (useExtendedObjectStore.getState().schroedinger?.quantumMode ?? null)
    set({ saveRequested: true, saveRequestedForMode: mode, status: 'saving', error: null })
  },

  loadFromFile: (file: File) => {
    // Block overlapping load attempts. The async deserialize/restore chain
    // below mutates the global isLoadingScene flag and pendingLoadData;
    // letting two loads run interleaved would clear the guard mid-restore
    // and let the second write race the first into the store.
    if (get().status === 'loading') return
    set({ status: 'loading', error: null })
    file
      .arrayBuffer()
      .then(async (data) => {
        const { deserializeSimulationState } = await import('@/lib/export/simulationState')
        const result = await deserializeSimulationState(data)

        // Build a fresh config for the store push WITHOUT mutating
        // `result.config` (which is also stashed on `pendingLoadData` and
        // exposed to consumers). The previous form did `delete` and
        // assignment on the raw deserializer return value, which violated
        // the immutability contract of `pendingLoadData.config`.
        const sourceConfig = result.config
        const { _runtimeMeta: rawMeta, ...restConfig } = sourceConfig as Record<string, unknown> & {
          _runtimeMeta?: unknown
        }

        const runtimeMeta: RuntimeMeta | undefined =
          typeof rawMeta === 'object' && rawMeta !== null ? (rawMeta as RuntimeMeta) : undefined

        const wasLoadingScene = usePerformanceStore.getState().isLoadingScene
        usePerformanceStore.getState().setIsLoadingScene(true)
        try {
          if (result.quantumMode === 'pauliSpinor') {
            // Pauli is a separate object type — switch objectType and apply pauli config.
            useGeometryStore.getState().setObjectType('pauliSpinor')
            const pauliConfig = (restConfig.pauli ?? restConfig) as Partial<PauliConfig>
            useExtendedObjectStore.getState().setPauliConfig({
              ...pauliConfig,
              needsReset: true,
            })
          } else {
            // Compute-mode sub-configs live on `schroedinger.<mode>`, and
            // `setSchroedingerConfig` does a SHALLOW merge. Setting
            // `needsReset: true` at the top level does NOT propagate into the
            // sub-config the compute pass actually checks, so the field
            // buffers keep whatever vacuum data the previous reinit sampled
            // and the loaded wavefunction is silently dropped. Build a new
            // config object with the reset flag forced into the correct
            // sub-config for each compute mode.
            const subKey = getQuantumTypeConfigSubKey(result.quantumMode)
            const subConfig =
              subKey && typeof restConfig[subKey] === 'object' && restConfig[subKey] !== null
                ? { ...(restConfig[subKey] as Record<string, unknown>), needsReset: true }
                : undefined
            const pushed: Record<string, unknown> = {
              ...restConfig,
              quantumMode: result.quantumMode,
              // Preserve the top-level flag too for analytic modes that read it.
              needsReset: true,
              ...(subKey && subConfig ? { [subKey]: subConfig } : {}),
            }
            useExtendedObjectStore.getState().setSchroedingerConfig(pushed)
          }

          set({
            pendingLoadData: {
              quantumMode: result.quantumMode,
              latticeDim: result.latticeDim,
              gridSize: result.gridSize,
              totalSites: result.totalSites,
              // Expose the deserializer's untouched config so consumers see
              // exactly what was on disk, including `_runtimeMeta`.
              config: sourceConfig,
              psiRe: result.psiRe,
              psiIm: result.psiIm,
              runtimeMeta,
            },
          })
        } finally {
          if (!wasLoadingScene) scheduleClearLoadingFlag()
        }
      })
      .catch((err) => {
        set({ status: 'error', error: String(err) })
      })
  },

  clearSaveRequest: () => set({ saveRequested: false, saveRequestedForMode: null }),
  setSaveComplete: () => set({ status: 'done', saveRequested: false, saveRequestedForMode: null }),
  setSaveError: (error) =>
    set({ status: 'error', error, saveRequested: false, saveRequestedForMode: null }),
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
      saveRequestedForMode: null,
      pendingLoadData: null,
      storeEigenstateRequested: false,
      storedEigenstateCount: 0,
    }),
}))
