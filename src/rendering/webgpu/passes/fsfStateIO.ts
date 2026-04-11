/**
 * Free Scalar Field — save/load metadata helpers.
 *
 * Split out of `FreeScalarFieldComputePass.ts` so the save-blob composition
 * lives in one pure place and the hot-path pass file stays focused on GPU
 * dispatch bookkeeping.
 */

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

/**
 * Runtime scalars captured at the save-request site. The three fields must
 * be snapshotted synchronously alongside the GPU buffer copy so the async
 * `getMetadata` callback cannot race the user changing cosmology config
 * mid-save and pair stale clocks with mismatched field data.
 */
export interface FsfSaveRuntime {
  /** Cosmological sim time at save. */
  simEta: number
  /** Preheating drive reference time captured at the most recent reset. */
  preheatingReferenceEta: number
  /** Minkowski-path preheating clock counter at save. */
  preheatingTime: number
}

/**
 * Compose the Free Scalar Field save metadata record that downstream
 * `genericStateSave` serializes into the `.mqstate` blob. Reads the current
 * FSF config from the extended-object store and packages it alongside the
 * captured runtime scalars into the shape the deserializer expects.
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
  // Deep-clone the live FSF config immediately so downstream async
  // serialization cannot race a user edit that mutates the Zustand object
  // mid-save. structuredClone severs every reference into the store and
  // preserves the nested objects (cosmology, preheating, initialCondition).
  const fsfConfigSnapshot = structuredClone(
    useExtendedObjectStore.getState().schroedinger.freeScalar
  )
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
