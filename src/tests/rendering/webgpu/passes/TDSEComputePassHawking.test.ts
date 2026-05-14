import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import type { TdseConfig } from '@/lib/geometry/extended/types'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import {
  composeBecHawkingInjectShader,
  createHawkingInjectState,
  maybeDispatchHawkingInject,
  runHawkingFrame,
} from '@/rendering/webgpu/passes/TDSEComputePassHawking'

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
  const device = {
    createBindGroup: vi.fn(() => bindGroup),
  } as unknown as GPUDevice
  const ctx = {
    beginComputePass: vi.fn(() => pass),
  } as unknown as WebGPURenderContext
  const state = createHawkingInjectState()
  state.pipeline = {} as GPUComputePipeline
  state.bgl = {} as GPUBindGroupLayout
  const uniformBuffer = {} as GPUBuffer
  const psi = {} as GPUBuffer
  const dispatchCompute = vi.fn()

  return { bindGroup, ctx, device, dispatchCompute, pass, psi, state, uniformBuffer }
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

    // GPUSize32 requires a positive integer; everything else must be rejected
    // before reaching beginComputePass/dispatchCompute.
    const invalidCounts = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      0,
      -1,
      1.5,
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
      dispatchCompute
    )
    expect(state.stepIndex).toBe(41)

    runHawkingFrame(device, ctx, enabledConfig(), state, uniformBuffer, psi, 7, dispatchCompute)
    expect(state.stepIndex).toBe(42)
  })

  it('wraps stepIndex as u32 after dispatch', () => {
    const { ctx, device, dispatchCompute, psi, state, uniformBuffer } = createDispatchHarness()
    state.stepIndex = 0xffffffff

    runHawkingFrame(device, ctx, enabledConfig(), state, uniformBuffer, psi, 7, dispatchCompute)

    expect(state.stepIndex).toBe(0)
  })
})
