/**
 * WheelerDeWittStrategy tests.
 *
 * Primary concerns verified here:
 *   (a) `computeWdwConfigHash` treats render-only animation fields as invariant
 *       — toggling `phaseRotationEnabled`, `phaseRotationSpeed`, `worldlineEnabled`,
 *       `worldlineSpeed`, or `worldlinePulseWidth` must never change the hash.
 *   (b) `executeFrame` re-packs the density texture every frame the worldline
 *       pulse is animating, even when the solver output is unchanged.
 *   (c) No re-pack while the worldline is enabled but playback is paused, and
 *       (b) does not short-circuit when the solver is genuinely dirty.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_WHEELER_DEWITT_CONFIG } from '@/lib/geometry/extended/wheelerDeWitt'
import {
  computeWdwConfigHash,
  WheelerDeWittStrategy,
} from '@/rendering/webgpu/renderers/strategies/WheelerDeWittStrategy'
import { mockWebGPU } from '@/tests/__mocks__/webgpu'

// ---------------------------------------------------------------------------
// (a) Config hash: animation-effect fields must not participate
// ---------------------------------------------------------------------------

describe('computeWdwConfigHash', () => {
  it('hashes identically regardless of render-only animation fields', () => {
    const base = { ...DEFAULT_WHEELER_DEWITT_CONFIG }
    const baseHash = computeWdwConfigHash(base)

    // Toggle every animation-effect field and verify the hash is unchanged.
    expect(
      computeWdwConfigHash({ ...base, phaseRotationEnabled: !base.phaseRotationEnabled })
    ).toBe(baseHash)
    expect(computeWdwConfigHash({ ...base, phaseRotationSpeed: 4.2 })).toBe(baseHash)
    expect(computeWdwConfigHash({ ...base, worldlineEnabled: !base.worldlineEnabled })).toBe(
      baseHash
    )
    expect(computeWdwConfigHash({ ...base, worldlineSpeed: 2.9 })).toBe(baseHash)
    expect(computeWdwConfigHash({ ...base, worldlinePulseWidth: 0.2 })).toBe(baseHash)
  })

  it('hashes differently when a physics field changes', () => {
    const base = { ...DEFAULT_WHEELER_DEWITT_CONFIG }
    const baseHash = computeWdwConfigHash(base)
    expect(computeWdwConfigHash({ ...base, inflatonMass: base.inflatonMass + 0.1 })).not.toBe(
      baseHash
    )
    expect(computeWdwConfigHash({ ...base, gridNa: base.gridNa + 8 })).not.toBe(baseHash)
  })

  it('hashes differently when display-only streamline fields change', () => {
    // These are in the hash today (solver-level caching for trajectory reuse) —
    // documented behavior; captured here so a future change that folds them into
    // the render-only bucket is an explicit decision, not an accidental drop.
    const base = { ...DEFAULT_WHEELER_DEWITT_CONFIG }
    const baseHash = computeWdwConfigHash(base)
    expect(
      computeWdwConfigHash({ ...base, streamlinesEnabled: !base.streamlinesEnabled })
    ).not.toBe(baseHash)
    expect(
      computeWdwConfigHash({ ...base, streamlineDensity: base.streamlineDensity + 1 })
    ).not.toBe(baseHash)
  })
})

// ---------------------------------------------------------------------------
// (b) + (c) executeFrame: repack semantics
// ---------------------------------------------------------------------------

/**
 * Provide the mocked WebGPU device (see src/tests/__mocks__/webgpu.ts) and
 * return a direct handle to its `queue.writeTexture` spy so tests can count
 * repacks across frames.
 */
function makeFakeDevice(): {
  device: GPUDevice
  writeTexture: ReturnType<typeof vi.fn>
} {
  const device = mockWebGPU.device
  const writeTexture = device.queue.writeTexture as unknown as ReturnType<typeof vi.fn>
  writeTexture.mockClear()
  return { device, writeTexture }
}

/**
 * Build a mocked render/setup context. The strategy reads store snapshots
 * from `ctx.frame.stores[key]` (see core/storeAccess.ts) and uses
 * `ctx.device.queue.writeTexture` to upload the packed density grid.
 *
 * Returns a shared mutable `stores` object so the caller can swap snapshots
 * between frames (e.g. to change `isPlaying` or `inflatonMass`).
 */
function makeContext(
  device: GPUDevice,
  stores: Record<string, unknown>
): {
  setupCtx: Parameters<WheelerDeWittStrategy['setup']>[0]
  renderCtx: Parameters<WheelerDeWittStrategy['executeFrame']>[0]
} {
  const ctxShape = {
    device,
    frame: { stores },
  } as unknown as Parameters<WheelerDeWittStrategy['setup']>[0] &
    Parameters<WheelerDeWittStrategy['executeFrame']>[0]
  return { setupCtx: ctxShape, renderCtx: ctxShape }
}

/** Fresh wdw config with worldline enabled and a modest grid to keep solver fast. */
function smallWdwConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...DEFAULT_WHEELER_DEWITT_CONFIG,
    gridNa: 24,
    gridNphi: 12,
    needsReset: false,
    streamlinesEnabled: true,
    streamlineDensity: 3,
    ...overrides,
  }
}

describe('WheelerDeWittStrategy.executeFrame', () => {
  let strategy: WheelerDeWittStrategy
  let device: GPUDevice
  let writeTexture: ReturnType<typeof vi.fn>

  beforeEach(() => {
    strategy = new WheelerDeWittStrategy()
    ;({ device, writeTexture } = makeFakeDevice())
  })

  function setup(
    wdw: Record<string, unknown>,
    isPlaying: boolean
  ): {
    render: (overrides?: { accumulatedTime?: number }) => void
  } {
    const clearWdwNeedsReset = vi.fn()
    const stores: Record<string, unknown> = {
      extended: {
        schroedinger: { quantumMode: 'wheelerDeWitt', wheelerDeWitt: wdw },
        clearWdwNeedsReset,
      },
      animation: { isPlaying, accumulatedTime: 1.25 },
    }
    const { setupCtx, renderCtx } = makeContext(device, stores)
    strategy.setup(setupCtx, {} as never)
    // Clear the initial zero-fill write so we only count executeFrame writes.
    writeTexture.mockClear()
    return {
      render: (overrides) => {
        if (overrides?.accumulatedTime !== undefined) {
          stores.animation = {
            isPlaying,
            accumulatedTime: overrides.accumulatedTime,
          }
        }
        strategy.executeFrame(renderCtx, {} as never)
      },
    }
  }

  it('re-packs the texture when worldline is animating (enabled + playing) with no solver change', () => {
    const wdw = smallWdwConfig({ worldlineEnabled: true })
    const { render } = setup(wdw, /* isPlaying */ true)

    // First frame: solver runs + initial pack.
    render()
    const firstFrameWrites = writeTexture.mock.calls.length
    expect(firstFrameWrites).toBeGreaterThanOrEqual(1)

    // Second frame: solver is cached (hash unchanged, needsReset false),
    // but the worldline pulse is animating — expect a fresh repack.
    render()
    expect(writeTexture.mock.calls.length).toBeGreaterThan(firstFrameWrites)
  })

  it('does NOT re-pack when worldline is enabled but playback is paused', () => {
    const wdw = smallWdwConfig({ worldlineEnabled: true })
    const { render } = setup(wdw, /* isPlaying */ false)

    // First frame: solver runs + initial pack + one-shot worldline-toggle repack.
    render()
    const settledWrites = writeTexture.mock.calls.length
    expect(settledWrites).toBeGreaterThanOrEqual(1)

    // Subsequent paused frames: no repack — solver clean, not animating,
    // and worldlineEnabled has not changed.
    render()
    render()
    expect(writeTexture.mock.calls.length).toBe(settledWrites)
  })

  it('re-packs when solver is dirty regardless of worldline state', () => {
    const wdw = smallWdwConfig({ worldlineEnabled: false })
    const { render } = setup(wdw, /* isPlaying */ true)

    render()
    const firstFrameWrites = writeTexture.mock.calls.length

    // Mutate a physics field so the hash changes on the next frame.
    wdw.inflatonMass = (wdw.inflatonMass as number) + 0.05
    render()
    expect(writeTexture.mock.calls.length).toBeGreaterThan(firstFrameWrites)
  })
})
