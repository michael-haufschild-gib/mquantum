import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import type { TdseConfig } from '@/lib/geometry/extended/types'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import {
  composeBecHawkingInjectShader,
  createHawkingInjectState,
  disposeHawkingInject,
  hawkingKickScale,
  maybeDispatchHawkingInject,
  runHawkingFrame,
} from '@/rendering/webgpu/passes/TDSEComputePassHawking'

/** Nominal speed-1 step count: DEFAULT_TDSE_CONFIG.stepsPerFrame. */
const FULL_FRAME_STEPS = DEFAULT_TDSE_CONFIG.stepsPerFrame

function enabledConfig(overrides: Partial<TdseConfig> = {}): TdseConfig {
  return {
    ...DEFAULT_TDSE_CONFIG,
    hawkingPairInjection: true,
    hawkingInjectRate: 0.1,
    ...overrides,
  }
}

function createDispatchHarness() {
  const pass = { end: vi.fn() } as unknown as GPUComputePassEncoder
  const bindGroup = {} as GPUBindGroup
  const createdBuffers: Array<{
    size: number
    usage: number
    label?: string
    destroy: () => void
  }> = []
  const writeBuffer = vi.fn()
  const device = {
    createBindGroup: vi.fn(() => bindGroup),
    createBuffer: vi.fn((desc: GPUBufferDescriptor) => {
      const buf = { size: desc.size, usage: desc.usage, label: desc.label, destroy: vi.fn() }
      createdBuffers.push(buf)
      return buf as unknown as GPUBuffer
    }),
    queue: { writeBuffer },
  } as unknown as GPUDevice
  const copyBufferToBuffer = vi.fn()
  const ctx = {
    beginComputePass: vi.fn(() => pass),
    encoder: { copyBufferToBuffer },
  } as unknown as WebGPURenderContext
  const state = createHawkingInjectState()
  state.pipeline = {} as GPUComputePipeline
  state.bgl = {} as GPUBindGroupLayout
  const uniformBuffer = {} as GPUBuffer
  const psi = { size: 4096 } as GPUBuffer
  const dispatchCompute = vi.fn()

  return {
    bindGroup,
    copyBufferToBuffer,
    createdBuffers,
    ctx,
    device,
    dispatchCompute,
    pass,
    psi,
    state,
    uniformBuffer,
    writeBuffer,
  }
}

describe('composeBecHawkingInjectShader', () => {
  it('clamps dynamic lattice dimension before indexing fixed-size uniform arrays', () => {
    const wgsl = composeBecHawkingInjectShader()
    expect(wgsl).toContain('let activeDim = min(params.latticeDim, 12u);')
    expect(wgsl).toContain('linearToND(idx, params.strides, params.gridSize, activeDim)')
    expect(wgsl).toContain('for (var d: u32 = 0u; d < activeDim; d++)')
  })

  it('guards spacing used by central differences', () => {
    const wgsl = composeBecHawkingInjectShader()
    // Routes NaN/Infinity to the 1e-6 floor via select() rather than relying
    // on min/max NaN handling, which WGSL leaves indeterminate.
    expect(wgsl).toContain('let dxAbs = abs(params.spacing[d]);')
    expect(wgsl).toContain('let safeDx = select(1e-6, dxAbs, dxAbs >= 1e-6);')
    expect(wgsl).toContain('let invDx = 0.5 / safeDx;')
  })
})

describe('maybeDispatchHawkingInject', () => {
  it('does not dispatch when linear workgroup count is invalid', () => {
    const { ctx, device, dispatchCompute, psi, state, uniformBuffer } = createDispatchHarness()

    // GPUSize32 requires a positive integer in the u32 range; everything else
    // (NaN/Infinity, zero/negative, fractional, > 0xffffffff) must be rejected
    // before reaching beginComputePass/dispatchCompute. `0x1_0000_0000` is the
    // first value that overflows u32 and exercises the explicit upper bound.
    const invalidCounts = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      0,
      -1,
      1.5,
      0x1_0000_0000,
    ]
    for (const count of invalidCounts) {
      expect(
        maybeDispatchHawkingInject(
          device,
          ctx,
          enabledConfig(),
          state,
          uniformBuffer,
          psi,
          count,
          FULL_FRAME_STEPS,
          dispatchCompute
        )
      ).toBe(false)
    }

    expect(ctx.beginComputePass).not.toHaveBeenCalled()
    expect(dispatchCompute).not.toHaveBeenCalled()
  })

  it('does not dispatch when hawkingInjectRate is non-finite or non-positive', () => {
    const { ctx, device, dispatchCompute, psi, state, uniformBuffer } = createDispatchHarness()

    // `NaN <= 0` and `Infinity <= 0` both evaluate to `false`, so a bare
    // `<= 0` test would let non-finite rates pass the gate. The runtime must
    // reject them via `Number.isFinite` before dispatching.
    const invalidRates = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -0.1]
    for (const rate of invalidRates) {
      expect(
        maybeDispatchHawkingInject(
          device,
          ctx,
          enabledConfig({ hawkingInjectRate: rate }),
          state,
          uniformBuffer,
          psi,
          7,
          FULL_FRAME_STEPS,
          dispatchCompute
        )
      ).toBe(false)
    }

    expect(ctx.beginComputePass).not.toHaveBeenCalled()
    expect(dispatchCompute).not.toHaveBeenCalled()
  })

  it('dispatches once and reuses the cached bind group for unchanged buffers', () => {
    const { bindGroup, ctx, device, dispatchCompute, pass, psi, state, uniformBuffer } =
      createDispatchHarness()

    expect(
      maybeDispatchHawkingInject(
        device,
        ctx,
        enabledConfig(),
        state,
        uniformBuffer,
        psi,
        7,
        FULL_FRAME_STEPS,
        dispatchCompute
      )
    ).toBe(true)
    expect(
      maybeDispatchHawkingInject(
        device,
        ctx,
        enabledConfig(),
        state,
        uniformBuffer,
        psi,
        7,
        FULL_FRAME_STEPS,
        dispatchCompute
      )
    ).toBe(true)

    expect(device.createBindGroup).toHaveBeenCalledTimes(1)
    expect(dispatchCompute).toHaveBeenCalledTimes(2)
    expect(dispatchCompute).toHaveBeenNthCalledWith(1, pass, state.pipeline, [bindGroup], 7)
    expect(pass.end).toHaveBeenCalledTimes(2)
  })
})

describe('runHawkingFrame', () => {
  it('advances stepIndex only after a submitted dispatch', () => {
    const { ctx, device, dispatchCompute, psi, state, uniformBuffer } = createDispatchHarness()
    state.stepIndex = 41

    runHawkingFrame(
      device,
      ctx,
      enabledConfig({ hawkingPairInjection: false }),
      state,
      uniformBuffer,
      psi,
      7,
      FULL_FRAME_STEPS,
      dispatchCompute
    )
    expect(state.stepIndex).toBe(41)

    runHawkingFrame(
      device,
      ctx,
      enabledConfig(),
      state,
      uniformBuffer,
      psi,
      7,
      FULL_FRAME_STEPS,
      dispatchCompute
    )
    expect(state.stepIndex).toBe(42)
  })

  it('wraps stepIndex as u32 after dispatch', () => {
    const { ctx, device, dispatchCompute, psi, state, uniformBuffer } = createDispatchHarness()
    state.stepIndex = 0xffffffff

    runHawkingFrame(
      device,
      ctx,
      enabledConfig(),
      state,
      uniformBuffer,
      psi,
      7,
      FULL_FRAME_STEPS,
      dispatchCompute
    )

    expect(state.stepIndex).toBe(0)
  })
})

// ─── Race-free snapshot + speed-independent kick cadence ─────────────────
//
// Regressions:
//  1. The kernel read neighbour ψ from the same buffer it rewrote in place,
//     so an invocation could see a neighbour that another workgroup had
//     already rotated — the Mach estimate / horizon weight depended on
//     dispatch order. Neighbours are now read from a pre-dispatch snapshot.
//  2. The kick fired on every playing frame, including fractional-speed
//     frames that advanced zero Strang steps, so at speed 0.25 the horizon
//     received ~4× the phase noise per simulated step. The kick now skips
//     idle frames and scales by √(stepsTaken / stepsPerFrame).

describe('hawkingKickScale', () => {
  it('is exactly 1 for a speed-1 frame', () => {
    expect(hawkingKickScale(4, 4)).toBe(1)
  })

  it('keeps the injected variance per simulated step speed-independent', () => {
    const stepsPerFrame = 4
    const varianceAtSpeed1 = hawkingKickScale(4, stepsPerFrame) ** 2 / 4
    // Speed 0.25: one step per frame.
    expect(hawkingKickScale(1, stepsPerFrame) ** 2 / 1).toBeCloseTo(varianceAtSpeed1, 15)
    // Speed 2: eight steps per frame.
    expect(hawkingKickScale(8, stepsPerFrame) ** 2 / 8).toBeCloseTo(varianceAtSpeed1, 15)
    expect(hawkingKickScale(1, stepsPerFrame)).toBe(0.5)
  })

  it('suppresses idle frames and unusable inputs', () => {
    expect(hawkingKickScale(0, 4)).toBe(0)
    expect(hawkingKickScale(-1, 4)).toBe(0)
    expect(hawkingKickScale(1.5, 4)).toBe(0)
    expect(hawkingKickScale(Number.NaN, 4)).toBe(0)
    expect(hawkingKickScale(2, 0)).toBe(0)
    expect(hawkingKickScale(2, Number.NaN)).toBe(0)
  })
})

describe('maybeDispatchHawkingInject — snapshot and cadence', () => {
  it('does not dispatch, copy, or consume a noise step on a frame with no evolution step', () => {
    const h = createDispatchHarness()
    h.state.stepIndex = 9
    expect(
      maybeDispatchHawkingInject(
        h.device,
        h.ctx,
        enabledConfig({ stepsPerFrame: 4 }),
        h.state,
        h.uniformBuffer,
        h.psi,
        7,
        0,
        h.dispatchCompute
      )
    ).toBe(false)
    runHawkingFrame(
      h.device,
      h.ctx,
      enabledConfig({ stepsPerFrame: 4 }),
      h.state,
      h.uniformBuffer,
      h.psi,
      7,
      0,
      h.dispatchCompute
    )
    expect(h.state.stepIndex).toBe(9)
    expect(h.ctx.beginComputePass).not.toHaveBeenCalled()
    expect(h.copyBufferToBuffer).not.toHaveBeenCalled()
    expect(h.writeBuffer).not.toHaveBeenCalled()
  })

  it('snapshots ψ before the pass and binds the snapshot + scaled kick', () => {
    const h = createDispatchHarness()
    expect(
      maybeDispatchHawkingInject(
        h.device,
        h.ctx,
        enabledConfig({ stepsPerFrame: 4 }),
        h.state,
        h.uniformBuffer,
        h.psi,
        7,
        1,
        h.dispatchCompute
      )
    ).toBe(true)

    const snapshot = h.state.psiSnapshot as unknown as { size: number; usage: number }
    expect(snapshot.size).toBe(h.psi.size)
    expect(snapshot.usage).toBe(GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST)
    expect(h.copyBufferToBuffer).toHaveBeenCalledWith(h.psi, 0, h.state.psiSnapshot, 0, h.psi.size)
    // The copy must be recorded before the compute pass that consumes it.
    const copyOrder = h.copyBufferToBuffer.mock.invocationCallOrder[0]!
    const passOrder = (h.ctx.beginComputePass as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0]!
    expect(copyOrder).toBeLessThan(passOrder)

    const [target, offset, data] = h.writeBuffer.mock.calls[0]! as [GPUBuffer, number, Float32Array]
    expect(target).toBe(h.state.kickParams)
    expect(offset).toBe(0)
    expect(data[0]).toBe(0.5) // √(1 / 4)

    const bgDesc = (h.device.createBindGroup as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as GPUBindGroupDescriptor
    const entries = Array.from(bgDesc.entries) as Array<{
      binding: number
      resource: { buffer: GPUBuffer }
    }>
    expect(entries.map((e) => e.binding)).toEqual([0, 1, 2, 3])
    expect(entries[1]!.resource.buffer).toBe(h.psi)
    expect(entries[2]!.resource.buffer).toBe(h.state.psiSnapshot)
    expect(entries[3]!.resource.buffer).toBe(h.state.kickParams)
  })

  it('reallocates the snapshot and rebinds when the ψ buffer size changes', () => {
    const h = createDispatchHarness()
    const run = (psi: GPUBuffer) =>
      maybeDispatchHawkingInject(
        h.device,
        h.ctx,
        enabledConfig({ stepsPerFrame: 4 }),
        h.state,
        h.uniformBuffer,
        psi,
        7,
        4,
        h.dispatchCompute
      )
    expect(run(h.psi)).toBe(true)
    const first = h.state.psiSnapshot as unknown as { destroy: ReturnType<typeof vi.fn> }
    const bigger = { size: 8192 } as GPUBuffer
    expect(run(bigger)).toBe(true)
    expect(first.destroy).toHaveBeenCalledTimes(1)
    expect((h.state.psiSnapshot as unknown as { size: number }).size).toBe(8192)
    expect(h.device.createBindGroup).toHaveBeenCalledTimes(2)
  })

  it('destroys the buffers it owns on dispose', () => {
    const h = createDispatchHarness()
    maybeDispatchHawkingInject(
      h.device,
      h.ctx,
      enabledConfig({ stepsPerFrame: 4 }),
      h.state,
      h.uniformBuffer,
      h.psi,
      7,
      4,
      h.dispatchCompute
    )
    const owned = [...h.createdBuffers]
    expect(owned.length).toBe(2)
    disposeHawkingInject(h.state)
    for (const buf of owned) expect(buf.destroy).toHaveBeenCalledTimes(1)
    expect(h.state.psiSnapshot).toBeNull()
    expect(h.state.kickParams).toBeNull()
  })
})

describe('composeBecHawkingInjectShader — race-free stencil', () => {
  it('reads the stencil from the snapshot and scales the kick', () => {
    const wgsl = composeBecHawkingInjectShader()
    expect(wgsl).toContain('@group(0) @binding(2) var<storage, read> psiPrev: array<vec2f>;')
    expect(wgsl).toContain('@group(0) @binding(3) var<uniform> kick: vec4f;')
    expect(wgsl).toContain('let zC = psiPrev[idx];')
    expect(wgsl).toContain('let zF = psiPrev[fwdIdx];')
    expect(wgsl).toContain('let zB = psiPrev[bwdIdx];')
    expect(wgsl).not.toMatch(/=\s*psi\[(fwdIdx|bwdIdx|idx)\]/)
    expect(wgsl).toContain('params.hawkingInjectRate * kick.x * w * eta')
  })
})
