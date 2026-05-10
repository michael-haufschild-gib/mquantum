import { beforeEach, describe, expect, it } from 'vitest'

import {
  createWormholeCoherenceBuffer,
  getWormholeSample,
  pushWormholeSample,
  resetWormholeBuffer,
  useWormholeCoherenceStore,
} from '@/stores/diagnostics/wormholeCoherenceStore'

describe('wormholeCoherenceStore — ring buffer determinism', () => {
  beforeEach(() => {
    useWormholeCoherenceStore.getState().clear()
    useWormholeCoherenceStore.getState().setBufferSize(512)
  })

  it('pushSample stores (t, I) in insertion order while under capacity', () => {
    const store = useWormholeCoherenceStore.getState()
    store.pushSample(0.1, 0.5, 0, 1.0)
    store.pushSample(0.2, 0.75, 0, 1.0)
    store.pushSample(0.3, 0.25, 0, 1.0)

    const buf = useWormholeCoherenceStore.getState().buffer
    expect(buf.count).toBe(3)
    expect(getWormholeSample(buf, 0)).toEqual({ t: 0.1, I: 0.5 })
    expect(getWormholeSample(buf, 1)).toEqual({ t: 0.2, I: 0.75 })
    expect(getWormholeSample(buf, 2)).toEqual({ t: 0.3, I: 0.25 })
  })

  it('evicts the oldest sample once capacity is reached', () => {
    const buf = createWormholeCoherenceBuffer(3)
    pushWormholeSample(buf, 1.0, 0.1)
    pushWormholeSample(buf, 2.0, 0.2)
    pushWormholeSample(buf, 3.0, 0.3)
    pushWormholeSample(buf, 4.0, 0.4) // evicts the 1.0 entry
    expect(buf.count).toBe(3)
    expect(getWormholeSample(buf, 0)).toEqual({ t: 2.0, I: 0.2 })
    expect(getWormholeSample(buf, 1)).toEqual({ t: 3.0, I: 0.3 })
    expect(getWormholeSample(buf, 2)).toEqual({ t: 4.0, I: 0.4 })
  })

  it('clamps I to [0, 1] on push', () => {
    const store = useWormholeCoherenceStore.getState()
    store.pushSample(0.1, 2.5, 0, 1.0)
    store.pushSample(0.2, -0.3, 0, 1.0)
    const buf = useWormholeCoherenceStore.getState().buffer
    expect(getWormholeSample(buf, 0)!.I).toBe(1)
    expect(getWormholeSample(buf, 1)!.I).toBe(0)
  })

  it('rejects non-finite samples silently (no buffer write, no version bump)', () => {
    const before = useWormholeCoherenceStore.getState().version
    useWormholeCoherenceStore.getState().pushSample(NaN, 0.5, 0, 1.0)
    useWormholeCoherenceStore.getState().pushSample(0.2, Infinity, 0, 1.0)
    expect(useWormholeCoherenceStore.getState().buffer.count).toBe(0)
    expect(useWormholeCoherenceStore.getState().version).toBe(before)
  })

  it('setBufferSize allocates a fresh buffer and zeroes samples', () => {
    const store = useWormholeCoherenceStore.getState()
    store.pushSample(0.1, 0.5, 0, 1.0)
    expect(useWormholeCoherenceStore.getState().buffer.count).toBe(1)
    store.setBufferSize(16)
    const buf = useWormholeCoherenceStore.getState().buffer
    expect(buf.capacity).toBe(16)
    expect(buf.count).toBe(0)
    expect(buf.simTime.length).toBe(16)
  })

  it('clear resets count but keeps capacity', () => {
    const store = useWormholeCoherenceStore.getState()
    store.pushSample(0.1, 0.5, 0, 1.0)
    store.clear()
    expect(useWormholeCoherenceStore.getState().buffer.count).toBe(0)
    expect(useWormholeCoherenceStore.getState().lastCoherence).toBe(0)
  })

  it('resetWormholeBuffer zeroes head/count without losing storage', () => {
    const buf = createWormholeCoherenceBuffer(4)
    pushWormholeSample(buf, 1, 0.1)
    pushWormholeSample(buf, 2, 0.2)
    resetWormholeBuffer(buf)
    expect(buf.count).toBe(0)
    expect(buf.head).toBe(0)
    expect(buf.capacity).toBe(4)
  })

  it('getWormholeSample returns null for out-of-range indices', () => {
    const buf = createWormholeCoherenceBuffer(4)
    expect(getWormholeSample(buf, 0)).toBeNull()
    pushWormholeSample(buf, 1, 0.5)
    expect(getWormholeSample(buf, 1)).toBeNull()
    expect(getWormholeSample(buf, -1)).toBeNull()
  })

  it('getSnapshot returns null before any push, then the latest sample', () => {
    expect(useWormholeCoherenceStore.getState().getSnapshot()).toBeNull()
    useWormholeCoherenceStore.getState().pushSample(1.5, 0.42, 1, 2.0)
    const snap = useWormholeCoherenceStore.getState().getSnapshot()
    expect(snap).toEqual({ t: 1.5, I: 0.42 })
  })
})
