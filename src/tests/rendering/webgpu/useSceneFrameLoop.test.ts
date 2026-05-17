import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SceneFrameLoopDeps } from '@/rendering/webgpu/useSceneFrameLoop'
import { useSceneFrameLoop } from '@/rendering/webgpu/useSceneFrameLoop'

function installQueuedRaf(): { restore: () => void; runNextFrame: () => void } {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
  let nextId = 1
  const callbacks = new Map<number, FrameRequestCallback>()

  globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = nextId++
    callbacks.set(id, callback)
    return id
  })
  globalThis.cancelAnimationFrame = vi.fn((id: number) => {
    callbacks.delete(id)
  })

  return {
    runNextFrame: () => {
      const next = callbacks.entries().next()
      if (next.done) throw new Error('No queued animation frame')
      const [id, callback] = next.value
      callbacks.delete(id)
      callback(performance.now())
    },
    restore: () => {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    },
  }
}

function createDeps(overrides: Partial<SceneFrameLoopDeps> = {}): SceneFrameLoopDeps {
  return {
    maxFps: 60,
    advanceSceneStateByDelta: vi.fn(),
    executeSceneFrame: vi.fn(),
    tickExport: vi.fn(() => false),
    cleanupExport: vi.fn(),
    ...overrides,
  }
}

describe('useSceneFrameLoop', () => {
  let raf: { restore: () => void; runNextFrame: () => void }

  beforeEach(() => {
    raf = installQueuedRaf()
  })

  afterEach(() => {
    raf.restore()
    vi.restoreAllMocks()
  })

  it('does not tear down export runtime when frame-loop dependencies change', () => {
    const cleanupExport = vi.fn()
    const stableDeps = createDeps({ cleanupExport })
    const { rerender, unmount } = renderHook(
      ({ maxFps }) => useSceneFrameLoop({ ...stableDeps, maxFps }),
      { initialProps: { maxFps: 60 } }
    )

    rerender({ maxFps: 30 })

    expect(cleanupExport).not.toHaveBeenCalled()

    unmount()

    expect(cleanupExport).toHaveBeenCalledOnce()
  })

  it('does not fold export wall-clock time into the next live-frame delta', () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)

    let exporting = true
    const advanceSceneStateByDelta = vi.fn()
    const executeSceneFrame = vi.fn()
    renderHook(() =>
      useSceneFrameLoop(
        createDeps({
          maxFps: 60,
          tickExport: vi.fn(() => exporting),
          advanceSceneStateByDelta,
          executeSceneFrame,
        })
      )
    )

    for (const t of [100, 1000, 2000, 3000]) {
      now = t
      raf.runNextFrame()
    }
    expect(advanceSceneStateByDelta).not.toHaveBeenCalled()
    expect(executeSceneFrame).not.toHaveBeenCalled()

    exporting = false
    now = 3016
    raf.runNextFrame()

    expect(advanceSceneStateByDelta).toHaveBeenCalledTimes(1)
    expect(advanceSceneStateByDelta).toHaveBeenCalledWith(0.016)
    expect(executeSceneFrame).toHaveBeenCalledWith(0.016)
  })
})
