/**
 * Factory for the Hilbert–Pólya volume Web Worker.
 *
 * Isolated in its own module so the render-side strategy can import the
 * factory without pulling the worker entry module into the main bundle —
 * Vite resolves the `new URL(...)` pattern into a dedicated worker chunk.
 *
 * @module lib/physics/hilbertPolya/createVolumeWorker
 */

/**
 * Create the module Worker that computes the Evans-landscape volume LUT
 * (`volume.worker.ts`), one transferable θ-slice at a time.
 *
 * @returns A dedicated module Worker ready to receive `HpVolumeJobRequest`s
 */
export function createHilbertPolyaVolumeWorker(): Worker {
  return new Worker(new URL('./volume.worker.ts', import.meta.url), { type: 'module' })
}
