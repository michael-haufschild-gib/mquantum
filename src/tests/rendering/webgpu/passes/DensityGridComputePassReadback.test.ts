/**
 * Regression test for the readback-state propagation bug.
 *
 * Background: `startPendingReadback` schedules a microtask that mutates the
 * passed-in `DensityReadbackState` snapshot in `.finally`. The pass calls
 * `applyReadbackState` synchronously *before* the microtask runs, so
 * mutations made inside the microtask were orphaned — `readbackInFlight`
 * stayed at `true` forever and every subsequent
 * `refreshDensityDistribution` was silently skipped, freezing the
 * confidence-mass threshold at frame-0 density values.
 *
 * The fix wires an `applyState` callback through `startPendingReadback` so
 * the microtask reapplies the state to the pass after `mapAsync` resolves.
 */

import { describe, expect, it, vi } from 'vitest'

import type { DensityDistributionAnalyzer } from '@/rendering/webgpu/passes/DensityDistributionAnalysis'
import { sanitizeDensityGridSize } from '@/rendering/webgpu/passes/DensityGridComputePass'
import type { DensityReadbackState } from '@/rendering/webgpu/passes/DensityGridComputePassResources'
import {
  selectGridTextureFormat,
  startPendingReadback,
} from '@/rendering/webgpu/passes/DensityGridComputePassResources'

function createMockState(): DensityReadbackState {
  const fakeBuffer = {
    mapAsync: vi.fn(() => Promise.resolve()),
    getMappedRange: vi.fn(() => new ArrayBuffer(8)),
    unmap: vi.fn(),
  } as unknown as GPUBuffer

  const analyzer = {
    buildDistribution: vi.fn(),
  } as unknown as DensityDistributionAnalyzer

  return {
    densityTexture: {} as GPUTexture,
    densityReadbackBuffer: fakeBuffer,
    readbackBytesPerRow: 256,
    readbackBytesPerTexel: 8,
    readbackTexelStrideHalfs: 4,
    readbackInFlight: true,
    readbackPendingSubmit: true,
    shouldRefreshDistribution: false,
    gridSize: 1,
    worldBound: 2,
    analyzer,
  }
}

async function flushMicrotasks(): Promise<void> {
  // queueMicrotask + mapAsync.then + .finally span ~5 microtask hops; loop
  // until either applyState fires or we've given up.
  for (let i = 0; i < 32; i++) {
    await Promise.resolve()
  }
}

describe('startPendingReadback applyState propagation', () => {
  it('invokes applyState after mapAsync resolves with readbackInFlight cleared', async () => {
    const state = createMockState()
    const fakeDevice = {} as GPUDevice
    const applyState = vi.fn()

    startPendingReadback(state, fakeDevice, applyState)

    await flushMicrotasks()

    expect(applyState).toHaveBeenCalled()
    const passedState = applyState.mock.calls[0]![0] as DensityReadbackState
    expect(passedState.readbackInFlight).toBe(false)
  })

  it('still invokes applyState after a mapAsync rejection', async () => {
    const state = createMockState()
    ;(state.densityReadbackBuffer!.mapAsync as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      Promise.reject(new Error('map failed'))
    )
    const fakeDevice = {} as GPUDevice
    const applyState = vi.fn()

    startPendingReadback(state, fakeDevice, applyState)

    await flushMicrotasks()

    expect(applyState).toHaveBeenCalled()
    const passedState = applyState.mock.calls[0]![0] as DensityReadbackState
    expect(passedState.readbackInFlight).toBe(false)
    expect(passedState.shouldRefreshDistribution).toBe(true)
  })

  it('skips when readbackPendingSubmit is false (no microtask scheduled)', () => {
    const state = createMockState()
    state.readbackPendingSubmit = false
    const fakeDevice = {} as GPUDevice
    const applyState = vi.fn()

    startPendingReadback(state, fakeDevice, applyState)

    expect(state.densityReadbackBuffer!.mapAsync).not.toHaveBeenCalled()
    expect(applyState).not.toHaveBeenCalled()
  })

  it('skips when device is null', () => {
    const state = createMockState()
    const applyState = vi.fn()

    startPendingReadback(state, null, applyState)

    expect(state.densityReadbackBuffer!.mapAsync).not.toHaveBeenCalled()
    expect(applyState).not.toHaveBeenCalled()
  })
})

describe('density grid resource config sanitization', () => {
  it('clamps density grid size to the active device texture limit', () => {
    expect(sanitizeDensityGridSize(4096, 512)).toBe(512)
    expect(sanitizeDensityGridSize(1024, 2048)).toBe(1024)
    expect(sanitizeDensityGridSize(Number.NaN, 512)).toBe(64)
    expect(sanitizeDensityGridSize(Number.NaN, 32)).toBe(32)
    expect(sanitizeDensityGridSize(undefined, 0.5)).toBe(1)
  })

  it('treats non-boolean density-grid resource flags as disabled', async () => {
    const destroy = vi.fn()
    const device = {
      pushErrorScope: vi.fn(),
      createTexture: vi.fn(() => ({ destroy })),
      popErrorScope: vi.fn(() => Promise.resolve(null)),
    } as unknown as GPUDevice

    const format = await selectGridTextureFormat(device, {
      dimension: 3,
      useDensityMatrix: 'false' as never,
      forceRgba: 'false' as never,
    })

    expect(format).toBe('r16float')
    expect(device.createTexture).toHaveBeenCalled()
    expect(destroy).toHaveBeenCalled()
  })
})
