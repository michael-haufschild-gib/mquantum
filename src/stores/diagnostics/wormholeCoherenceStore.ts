/**
 * Wormhole coherence store — HUD time series for `I(L:R)(t)`.
 *
 * Holds a pre-allocated ring buffer of `(simTime, coherence)` samples plus
 * small cached scalars (current value and the mirror-axis / coupling used
 * to generate the latest sample). Mirrors the page-curve store pattern:
 * writes mutate the same `Float64Array`s in place; a monotonic `version`
 * counter lets React subscribers re-render without reading the buffers on
 * every keystroke.
 *
 * @module stores/wormholeCoherenceStore
 */

import { create } from 'zustand'

/** Default ring-buffer capacity — 512 samples at the diagnostic cadence. */
export const DEFAULT_WORMHOLE_COHERENCE_CAPACITY = 512
const MAX_WORMHOLE_COHERENCE_CAPACITY = 1 << 16

/**
 * Struct-of-arrays ring buffer for wormhole coherence samples. `head` is
 * the next write slot; `count` saturates at `capacity` once wrapped.
 */
export interface WormholeCoherenceBuffer {
  simTime: Float64Array
  coherence: Float64Array
  capacity: number
  head: number
  count: number
}

/**
 * Create a fresh buffer of the given capacity (rounded to integer,
 * clamped to `[1, MAX]`).
 */
export function createWormholeCoherenceBuffer(capacity: number): WormholeCoherenceBuffer {
  const raw = Number.isFinite(capacity) ? Math.floor(capacity) : DEFAULT_WORMHOLE_COHERENCE_CAPACITY
  const cap = Math.max(1, Math.min(MAX_WORMHOLE_COHERENCE_CAPACITY, raw))
  return {
    simTime: new Float64Array(cap),
    coherence: new Float64Array(cap),
    capacity: cap,
    head: 0,
    count: 0,
  }
}

/**
 * Push a single sample into the ring buffer. Oldest sample is evicted
 * when full.
 */
export function pushWormholeSample(
  buffer: WormholeCoherenceBuffer,
  simTime: number,
  coherence: number
): void {
  buffer.simTime[buffer.head] = simTime
  buffer.coherence[buffer.head] = coherence
  buffer.head = (buffer.head + 1) % buffer.capacity
  if (buffer.count < buffer.capacity) buffer.count++
}

/**
 * Read the sample at logical index `i ∈ [0, count)`. Index `0` is the
 * oldest sample currently in the buffer, index `count-1` the newest.
 * Returns `null` if `i` is out of range.
 */
export function getWormholeSample(
  buffer: WormholeCoherenceBuffer,
  i: number
): { t: number; I: number } | null {
  if (i < 0 || i >= buffer.count) return null
  const physical = buffer.count < buffer.capacity ? i : (buffer.head + i) % buffer.capacity
  return { t: buffer.simTime[physical]!, I: buffer.coherence[physical]! }
}

/** Zero the sample counters without deallocating storage. */
export function resetWormholeBuffer(buffer: WormholeCoherenceBuffer): void {
  buffer.head = 0
  buffer.count = 0
}

/** Public snapshot shape consumed by the HUD. */
export interface WormholeCoherenceSnapshot {
  readonly t: number
  readonly I: number
}

/** Shape of the wormhole coherence Zustand store. */
export interface WormholeCoherenceState {
  /**
   * Ring buffer of samples (struct-of-arrays). The reference is swapped by
   * {@link WormholeCoherenceState.setBufferSize}; sample columns are mutated
   * in place by pushSample. Subscribe to {@link WormholeCoherenceState.version}
   * to observe changes.
   */
  buffer: WormholeCoherenceBuffer
  /** Latest coherence value `I(L:R)` ∈ `[0, 1]`. */
  lastCoherence: number
  /** Latest simulation time associated with `lastCoherence`. */
  lastT: number
  /** Last mirror-axis index used (for HUD header badge). */
  lastAxis: 0 | 1 | 2
  /** Last coupling `g` used (for HUD header badge). */
  lastG: number
  /** Monotonic push counter — increments on each push for render observers. */
  version: number

  /** Push a new `(simTime, coherence)` sample. */
  pushSample: (simTime: number, coherence: number, axis: 0 | 1 | 2, g: number) => void
  /** Clear the ring buffer and cached scalars. */
  clear: () => void
  /** Resize the ring buffer (also clears). */
  setBufferSize: (capacity: number) => void
  /** Immutable snapshot of the last sample — `null` until first push. */
  getSnapshot: () => WormholeCoherenceSnapshot | null
}

/**
 * Create the wormhole coherence Zustand store. The buffer is allocated
 * once and reused; `setBufferSize` is the only operation that reallocates.
 */
export const useWormholeCoherenceStore = create<WormholeCoherenceState>((set, get) => {
  const buffer = createWormholeCoherenceBuffer(DEFAULT_WORMHOLE_COHERENCE_CAPACITY)
  return {
    buffer,
    lastCoherence: 0,
    lastT: 0,
    lastAxis: 0,
    lastG: 0,
    version: 0,

    pushSample: (simTime, coherence, axis, g) => {
      if (!Number.isFinite(simTime) || !Number.isFinite(coherence)) return
      const clamped = Math.max(0, Math.min(1, coherence))
      pushWormholeSample(get().buffer, simTime, clamped)
      set((s) => ({
        lastCoherence: clamped,
        lastT: simTime,
        lastAxis: axis,
        lastG: g,
        version: s.version + 1,
      }))
    },

    clear: () => {
      resetWormholeBuffer(get().buffer)
      set((s) => ({
        lastCoherence: 0,
        lastT: 0,
        lastAxis: 0,
        lastG: 0,
        version: s.version + 1,
      }))
    },

    setBufferSize: (capacity) => {
      const fresh = createWormholeCoherenceBuffer(capacity)
      set((s) => ({
        buffer: fresh,
        lastCoherence: 0,
        lastT: 0,
        lastAxis: 0,
        lastG: 0,
        version: s.version + 1,
      }))
    },

    getSnapshot: () => {
      const s = get()
      if (s.buffer.count === 0) return null
      return { t: s.lastT, I: s.lastCoherence }
    },
  }
})
