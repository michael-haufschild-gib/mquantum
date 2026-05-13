import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SceneFrameLoopDeps } from '@/rendering/webgpu/useSceneFrameLoop'
import { useSceneFrameLoop } from '@/rendering/webgpu/useSceneFrameLoop'

function installQueuedRaf(): { restore: () => void } {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
  let nextId = 1

  globalThis.requestAnimationFrame = vi.fn(() => nextId++)
  globalThis.cancelAnimationFrame = vi.fn()

  return {
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
    interactionTimerRef: { current: null },
    ...overrides,
  }
}

describe('useSceneFrameLoop', () => {
  let raf: { restore: () => void }

  beforeEach(() => {
    raf = installQueuedRaf()
  })

  afterEach(() => {
    raf.restore()
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
})
