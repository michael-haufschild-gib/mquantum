/**
 * Unit tests for the wavefunction slice store.
 *
 * Tests the request/fulfillment pattern for capturing 1D cross-sections
 * of the wavefunction from GPU readback.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useWavefunctionSliceStore } from '@/stores/diagnostics/wavefunctionSliceStore'

describe('wavefunctionSliceStore', () => {
  beforeEach(() => {
    useWavefunctionSliceStore.getState().reset()
  })

  it('initializes with no data and no request', () => {
    const s = useWavefunctionSliceStore.getState()
    expect(s.captureRequested).toBe(false)
    expect(s.hasData).toBe(false)
    expect(s.sliceData).toBeNull()
    expect(s.requestedAxis).toBe('x')
    expect(s.requestedSourceMode).toBeNull()
    expect(s.sliceSourceMode).toBeNull()
  })

  it('requestCapture sets the flag and axis', () => {
    useWavefunctionSliceStore.getState().requestCapture('y', 'tdseDynamics')
    const s = useWavefunctionSliceStore.getState()
    expect(s.captureRequested).toBe(true)
    expect(s.requestedAxis).toBe('y')
    expect(s.requestedSourceMode).toBe('tdseDynamics')
  })

  it('clearRequest removes the flag without affecting data', () => {
    useWavefunctionSliceStore.getState().requestCapture('z')
    useWavefunctionSliceStore.getState().clearRequest()
    const s = useWavefunctionSliceStore.getState()
    expect(s.captureRequested).toBe(false)
    expect(s.requestedAxis).toBe('z') // axis preserved
  })

  it('fulfillCapture delivers slice data without clearing the request flag', () => {
    // Regression: clearing `captureRequested` from `fulfillCapture` would
    // silently drop a NEW request that arrived while the in-flight readback
    // was resolving. The render loop owns flag clearing via
    // `clearRequest`, called only when a capture has actually been
    // scheduled. `fulfillCapture` therefore must NOT touch the flag.
    useWavefunctionSliceStore.getState().requestCapture('x')
    // Render loop schedules — clears the request flag itself.
    useWavefunctionSliceStore.getState().clearRequest()
    // While X readback is mid-flight, user requests Y.
    useWavefunctionSliceStore.getState().requestCapture('y')

    const data = new Float32Array([0.1, 0.5, 0.9, 0.5, 0.1])
    useWavefunctionSliceStore.getState().fulfillCapture({
      sliceData: data,
      axis: 'x',
      gridSize: 5,
      worldBound: 2.0,
    })

    const s = useWavefunctionSliceStore.getState()
    // Y request survives the X fulfillment.
    expect(s.captureRequested).toBe(true)
    expect(s.requestedAxis).toBe('y')
    // X data is delivered.
    expect(s.hasData).toBe(true)
    expect(s.sliceData).toBe(data)
    expect(s.sliceAxis).toBe('x')
    expect(s.sliceSourceMode).toBeNull()
    expect(s.sliceGridSize).toBe(5)
    expect(s.sliceWorldBound).toBe(2.0)
  })

  it('fulfillCapture records the mode that scheduled the readback, not a newer request', () => {
    useWavefunctionSliceStore.getState().requestCapture('x', 'tdseDynamics')
    useWavefunctionSliceStore.getState().clearRequest()
    useWavefunctionSliceStore.getState().requestCapture('y', 'becDynamics')

    useWavefunctionSliceStore.getState().fulfillCapture({
      sliceData: new Float32Array([0.1, 0.2]),
      axis: 'x',
      sourceMode: 'tdseDynamics',
      gridSize: 2,
      worldBound: 1,
    })

    const s = useWavefunctionSliceStore.getState()
    expect(s.captureRequested).toBe(true)
    expect(s.requestedSourceMode).toBe('becDynamics')
    expect(s.sliceAxis).toBe('x')
    expect(s.sliceSourceMode).toBe('tdseDynamics')
  })

  it('reset clears all state', () => {
    useWavefunctionSliceStore.getState().fulfillCapture({
      sliceData: new Float32Array([1, 2, 3]),
      axis: 'y',
      gridSize: 3,
      worldBound: 1.0,
    })

    useWavefunctionSliceStore.getState().reset()
    const s = useWavefunctionSliceStore.getState()
    expect(s.hasData).toBe(false)
    expect(s.sliceData).toBeNull()
    expect(s.captureRequested).toBe(false)
    expect(s.requestedSourceMode).toBeNull()
    expect(s.sliceSourceMode).toBeNull()
    expect(s.sliceGridSize).toBe(0)
  })
})
