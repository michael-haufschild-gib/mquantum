import { beforeEach, describe, expect, it } from 'vitest'

import { useCarpetStore } from '@/stores/carpetStore'

describe('carpetStore', () => {
  beforeEach(() => {
    useCarpetStore.setState(useCarpetStore.getInitialState())
  })

  it('starts disabled with correct defaults', () => {
    const state = useCarpetStore.getState()
    expect(state.enabled).toBe(false)
    expect(state.sliceAxis).toBe(0)
    expect(state.slicePositionY).toBe(0.5)
    expect(state.slicePositionZ).toBe(0.5)
    expect(state.colormap).toBe('viridis')
    expect(state.logScale).toBe(false)
    expect(state.historyLength).toBe(512)
    expect(state.writeHead).toBe(0)
    expect(state.totalFrames).toBe(0)
    expect(state.carpetData).toBe(null)
  })

  it('setEnabled toggles the enabled flag', () => {
    useCarpetStore.getState().setEnabled(true)
    expect(useCarpetStore.getState().enabled).toBe(true)
    useCarpetStore.getState().setEnabled(false)
    expect(useCarpetStore.getState().enabled).toBe(false)
  })

  it('advanceHead wraps at historyLength', () => {
    const store = useCarpetStore.getState()
    store.setEnabled(true)

    // Advance to one before wrap
    for (let i = 0; i < 511; i++) {
      useCarpetStore.getState().advanceHead(0.01)
    }
    expect(useCarpetStore.getState().writeHead).toBe(511)
    expect(useCarpetStore.getState().totalFrames).toBe(511)

    // Advance past wrap point
    useCarpetStore.getState().advanceHead(0.01)
    expect(useCarpetStore.getState().writeHead).toBe(0) // wraps to 0
    expect(useCarpetStore.getState().totalFrames).toBe(512)
  })

  it('setSliceAxis clamps to non-negative integer and resets state', () => {
    // Accumulate some frames first
    useCarpetStore.getState().advanceHead(0.01)
    useCarpetStore.getState().advanceHead(0.01)
    expect(useCarpetStore.getState().totalFrames).toBe(2)

    // Change axis — should reset writeHead, totalFrames, carpetData
    useCarpetStore.getState().setSliceAxis(1)
    expect(useCarpetStore.getState().sliceAxis).toBe(1)
    expect(useCarpetStore.getState().writeHead).toBe(0)
    expect(useCarpetStore.getState().totalFrames).toBe(0)
    expect(useCarpetStore.getState().carpetData).toBe(null)

    // Negative values clamp to 0
    useCarpetStore.getState().setSliceAxis(-5)
    expect(useCarpetStore.getState().sliceAxis).toBe(0)

    // Fractional values are floored
    useCarpetStore.getState().setSliceAxis(1.7)
    expect(useCarpetStore.getState().sliceAxis).toBe(1)
  })

  it('clear resets writeHead, totalFrames, and carpetData', () => {
    const store = useCarpetStore.getState()
    store.advanceHead(0.01)
    store.advanceHead(0.01)
    store.advanceHead(0.01)
    useCarpetStore.getState().setCarpetData(new Float32Array(10), 96, 0, 1)

    expect(useCarpetStore.getState().totalFrames).toBe(3)
    expect(useCarpetStore.getState().carpetData).not.toBe(null)

    useCarpetStore.getState().clear()
    expect(useCarpetStore.getState().writeHead).toBe(0)
    expect(useCarpetStore.getState().totalFrames).toBe(0)
    expect(useCarpetStore.getState().carpetData).toBe(null)
  })

  it('setSlicePositionY clamps to [0, 1]', () => {
    useCarpetStore.getState().setSlicePositionY(-0.5)
    expect(useCarpetStore.getState().slicePositionY).toBe(0)

    useCarpetStore.getState().setSlicePositionY(1.5)
    expect(useCarpetStore.getState().slicePositionY).toBe(1)

    useCarpetStore.getState().setSlicePositionY(0.3)
    expect(useCarpetStore.getState().slicePositionY).toBe(0.3)
  })

  it('setHistoryLength resets accumulation state', () => {
    useCarpetStore.getState().advanceHead(0.01)
    useCarpetStore.getState().advanceHead(0.01)

    useCarpetStore.getState().setHistoryLength(1024)
    expect(useCarpetStore.getState().historyLength).toBe(1024)
    expect(useCarpetStore.getState().writeHead).toBe(0)
    expect(useCarpetStore.getState().totalFrames).toBe(0)
    expect(useCarpetStore.getState().carpetData).toBe(null)
  })

  it('advanceHead records dtPerFrame', () => {
    useCarpetStore.getState().advanceHead(0.005)
    expect(useCarpetStore.getState().dtPerFrame).toBe(0.005)

    useCarpetStore.getState().advanceHead(0.01)
    expect(useCarpetStore.getState().dtPerFrame).toBe(0.01)
  })

  it('setCarpetData stores Float32Array and gridSize', () => {
    const data = new Float32Array([1, 2, 3, 4])
    useCarpetStore.getState().setCarpetData(data, 48, 0, 1)
    expect(useCarpetStore.getState().carpetData).toBe(data)
    expect(useCarpetStore.getState().gridSize).toBe(48)
  })
})
