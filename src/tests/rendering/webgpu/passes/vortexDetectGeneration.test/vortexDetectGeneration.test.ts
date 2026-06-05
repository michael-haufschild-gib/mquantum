/**
 * Pin: TDSEVortexDetect's async readback closure must NOT clear
 * `state.mappingInFlight` after a rebuild has bumped the generation.
 *
 * Background: dispatchAndReadbackVortexDetect captures `staging` and
 * `state.mappingInFlight = true` at dispatch time, then schedules an
 * async chain via `device.queue.onSubmittedWorkDone().then(...)`. If the
 * caller rebuilds (or disposes) the pass between dispatch and the
 * .then() firing, the closure would otherwise call
 * `state.mappingInFlight = false` AFTER the rebuild had already started
 * a fresh dispatch — letting the next call think no mapping is in
 * flight and issue a parallel `mapAsync` on the new staging buffer,
 * causing a WebGPU mapping conflict.
 *
 * Fix: increment a `generation` counter on dispose, capture it at
 * dispatch time, and only clear `mappingInFlight` when the closure's
 * captured generation still matches the current one. The test below
 * exercises a synthetic version of this race against the public state
 * shape — no real GPU device required.
 */

import { describe, expect, it } from 'vitest'

import {
  createVortexDetectState,
  disposeVortexDetect,
} from '@/rendering/webgpu/passes/TDSEVortexDetect'

describe('VortexDetectState generation invariants', () => {
  it('starts at generation 0 and mappingInFlight false', () => {
    const state = createVortexDetectState()
    expect(state.generation).toBe(0)
    expect(state.mappingInFlight).toBe(false)
  })

  it('disposeVortexDetect bumps generation and clears mappingInFlight', () => {
    const state = createVortexDetectState()
    // Simulate an in-flight dispatch.
    state.mappingInFlight = true
    const genBefore = state.generation

    disposeVortexDetect(state)

    expect(state.generation).toBe(genBefore + 1)
    expect(state.mappingInFlight).toBe(false)
    expect(state.initialized).toBe(false)
    expect(state.stagingBuffer).toBeNull()
  })

  it('a stale-generation closure cannot un-set mappingInFlight after a rebuild', () => {
    // Reproduces the race the fix is designed to prevent. The "stale
    // closure" is the async chain captured at the moment dispatchA
    // ran. dispatchA's staging buffer was destroyed by dispose, the new
    // state has a fresh dispatch (B) in flight, and we expect dispatchA's
    // .then() to be a no-op rather than clearing dispatchB's flag.
    const state = createVortexDetectState()
    state.mappingInFlight = true
    const dispatchAGen = state.generation

    // Rebuild bumps generation; clears mappingInFlight to false.
    disposeVortexDetect(state)

    // dispatchB starts: claims the flag.
    state.mappingInFlight = true

    // Now simulate dispatchA's stale .then() / .catch() trying to clear
    // the flag. With the fix, the closure compares its captured
    // generation against the current one and bails out.
    const clearIfCurrent = (): void => {
      if (state.generation === dispatchAGen) {
        state.mappingInFlight = false
      }
    }
    clearIfCurrent()

    // dispatchB's flag must still be set.
    expect(state.mappingInFlight).toBe(true)
  })
})
