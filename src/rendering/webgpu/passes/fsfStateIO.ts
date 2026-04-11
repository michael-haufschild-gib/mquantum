/**
 * Free Scalar Field — save/load metadata helpers.
 *
 * Split out of `FreeScalarFieldComputePass.ts` so the save-blob composition
 * lives in one pure place and the hot-path pass file stays focused on GPU
 * dispatch bookkeeping.
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'

/**
 * Runtime scalars captured at the save-request site. The three fields must
 * be snapshotted synchronously alongside the GPU buffer copy so the async
 * `getMetadata` callback cannot race the user changing cosmology config
 * mid-save and pair stale clocks with mismatched field data.
 */
export interface FsfSaveRuntime {
  /**
   * Live FSF configuration snapshot. The caller (the compute pass at the
   * save-request site) is responsible for severing the reference from the
   * Zustand store BEFORE invoking this helper — typically via
   * `structuredClone(useExtendedObjectStore.getState().schroedinger.freeScalar)`.
   * Making the snapshot an explicit input rather than an implicit store
   * read inside this function removes the last place an async race could
   * pair saved field buffers with a newer config.
   */
  freeScalar: FreeScalarConfig
  /** Cosmological sim time at save. */
  simEta: number
  /** Preheating drive reference time captured at the most recent reset. */
  preheatingReferenceEta: number
  /** Minkowski-path preheating clock counter at save. */
  preheatingTime: number
}

/**
 * Compose the Free Scalar Field save metadata record that downstream
 * `genericStateSave` serializes into the `.mqstate` blob. Packages the
 * caller-provided config snapshot alongside the captured runtime scalars
 * into the shape the deserializer expects.
 *
 * This function is pure — it does not read any Zustand store. The caller
 * must pass a freshly-cloned `freeScalar` snapshot (see `FsfSaveRuntime`
 * doc), so metadata composition can execute anywhere in the async save
 * pipeline without racing a mid-save config mutation.
 *
 * The `_runtimeMeta` record carries `simEta` and the preheating drive
 * clocks so reload can resume both the cosmological clock and the Mathieu
 * `1 + A·sin(Ω·(clock − ref))` modulation in phase with the saved buffers.
 * Always written even when preheating is disabled so the save blob is
 * self-contained; the load path ignores them on disabled configs.
 */
export function composeFsfSaveMetadata(runtime: FsfSaveRuntime): {
  quantumMode: 'freeScalarField'
  config: Record<string, unknown>
  gridSize: number[]
  componentCount: number
} {
  const fsfConfigSnapshot = runtime.freeScalar
  const gridSize = fsfConfigSnapshot.gridSize?.slice(0, fsfConfigSnapshot.latticeDim ?? 3) ?? [64]
  return {
    quantumMode: 'freeScalarField',
    config: {
      quantumMode: 'freeScalarField',
      freeScalar: fsfConfigSnapshot,
      _runtimeMeta: {
        simEta: runtime.simEta,
        preheatingReferenceEta: runtime.preheatingReferenceEta,
        preheatingTime: runtime.preheatingTime,
      },
    } as Record<string, unknown>,
    gridSize,
    componentCount: 1,
  }
}
