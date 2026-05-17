import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { TdseConfig } from '@/lib/geometry/extended/types'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import type { EvolutionResources } from '@/rendering/webgpu/passes/TDSEComputePassEvolution'
import { runStrangEvolution } from '@/rendering/webgpu/passes/TDSEComputePassEvolution'
import type {
  TdseBindGroupResult,
  TdsePipelineResult,
} from '@/rendering/webgpu/passes/TDSEComputePassSetup'
import {
  computeCSLSubsteps,
  createStochasticLocState,
  maybeDispatchStochasticLoc,
  prepareStochasticStaging,
  rebuildExpectationBindGroups,
  type StochasticLocState,
} from '@/rendering/webgpu/passes/TDSEStochasticLocalization'

interface Labeled {
  label?: string
}

interface RecordedPass extends Labeled {
  end: () => void
  setPipeline: (pipeline: GPUComputePipeline) => void
  setBindGroup: (index: number, bindGroup: GPUBindGroup) => void
  dispatchWorkgroups: (x: number, y?: number, z?: number) => void
}

const pipeline = (label: string): GPUComputePipeline =>
  ({
    label,
  }) as unknown as GPUComputePipeline

const bindGroup = (label: string): GPUBindGroup =>
  ({
    label,
  }) as unknown as GPUBindGroup

const buffer = (label: string): GPUBuffer =>
  ({
    label,
    destroy: () => undefined,
  }) as unknown as GPUBuffer

function labelOf(value: unknown): string {
  return typeof value === 'object' && value !== null && 'label' in value
    ? String((value as Labeled).label)
    : 'unlabeled'
}

function makeContext(events: string[]): WebGPURenderContext {
  const encoder = {
    copyBufferToBuffer: (
      source: GPUBuffer,
      sourceOffset: number,
      destination: GPUBuffer,
      destinationOffset: number,
      size: number
    ) => {
      events.push(
        `copy:${labelOf(source)}:${sourceOffset}:${labelOf(destination)}:${destinationOffset}:${size}`
      )
    },
  } as unknown as GPUCommandEncoder

  const device = {
    queue: {
      writeBuffer: (target: GPUBuffer, offset: number, data: ArrayBuffer) => {
        events.push(`write:${labelOf(target)}:${offset}:${data.byteLength}`)
      },
    },
    createBuffer: (descriptor: GPUBufferDescriptor) => buffer(String(descriptor.label)),
  } as unknown as GPUDevice

  return {
    device,
    encoder,
    beginComputePass: (descriptor?: GPUComputePassDescriptor) => {
      const label = String(descriptor?.label ?? 'unnamed')
      events.push(`begin:${label}`)
      const pass: RecordedPass = {
        label,
        end: () => events.push(`end:${label}`),
        setPipeline: (nextPipeline) => events.push(`setPipeline:${labelOf(nextPipeline)}`),
        setBindGroup: (index, nextBindGroup) =>
          events.push(`setBindGroup:${index}:${labelOf(nextBindGroup)}`),
        dispatchWorkgroups: (x, y = 1, z = 1) => events.push(`dispatchWorkgroups:${x}:${y}:${z}`),
      }
      return pass as unknown as GPUComputePassEncoder
    },
  } as unknown as WebGPURenderContext
}

function makeStochasticState(): StochasticLocState {
  const state = createStochasticLocState()
  state.uniformBuffer = buffer('stochastic-uniform')
  state.pipeline = pipeline('stochastic-loc')
  state.pipeline3D = pipeline('stochastic-loc-3d')
  state.bg = bindGroup('stochastic-loc-bg')
  state.expectReducePipeline = pipeline('stochastic-expect-reduce')
  state.expectReduceBG = bindGroup('stochastic-expect-reduce-bg')
  state.expectFinalizePipeline = pipeline('stochastic-expect-finalize')
  state.expectFinalizeBG = bindGroup('stochastic-expect-finalize-bg')
  return state
}

function makeResources(events: string[], stochasticState: StochasticLocState): EvolutionResources {
  const pl = {
    diagReducePipeline: pipeline('diag-reduce'),
    diagFinalizePipeline: pipeline('diag-finalize'),
    renormalizePipeline: pipeline('renormalize'),
    absorberPipeline: pipeline('absorber'),
    absorberPipeline3D: pipeline('absorber-3d'),
    fusedPotentialPackPipeline: pipeline('fused-potential-pack'),
    fftSharedMemPipeline: pipeline('fft-shared-mem'),
    kineticPipeline: pipeline('kinetic'),
    kineticPipeline3D: pipeline('kinetic-3d'),
    fusedUnpackPotentialPipeline: pipeline('fused-unpack-potential'),
  } as unknown as TdsePipelineResult

  const bg = {
    diagReduceBG: bindGroup('diag-reduce-bg'),
    diagFinalizeBG: bindGroup('diag-finalize-bg'),
    renormalizeBG: bindGroup('renormalize-bg'),
    initBG: bindGroup('init-bg'),
    fusedPotentialPackBG: bindGroup('fused-potential-pack-bg'),
    fftSharedMemBGs: [
      bindGroup('fft-shared-mem-fwd-0'),
      bindGroup('fft-shared-mem-inv-0'),
      bindGroup('fft-shared-mem-fwd-1'),
      bindGroup('fft-shared-mem-inv-1'),
    ],
    kineticBG: bindGroup('kinetic-bg'),
    fusedUnpackPotentialBG: bindGroup('fused-unpack-potential-bg'),
  } as unknown as TdseBindGroupResult

  return {
    pl,
    bg,
    totalSites: 16,
    diagNumWorkgroups: 1,
    ifftSlotOffset: 0,
    gsState: { gsEigenstates: [] } as unknown as EvolutionResources['gsState'],
    stochasticState,
    boundingRadius: 2,
    hellerState: null,
    wormholePipeline: null,
    wormholeBG: null,
    siteDispatch: { x: 1, y: 1, z: 1, use3D: false },
    dc: (pass, nextPipeline, _bindGroups, x, y = 1, z = 1) => {
      events.push(`dispatch:${labelOf(pass)}:${labelOf(nextPipeline)}:${x}:${y}:${z}`)
    },
    dispatchFFTAxis: (_ctx, _axisDim, slotOffset) => slotOffset + 1,
    dispatchFFTAxisInPass: () => undefined,
    dispatchCurvedRK4: () => events.push('curved-rk4'),
  }
}

const hadGPUBufferUsage = 'GPUBufferUsage' in globalThis

beforeAll(() => {
  if (!hadGPUBufferUsage) {
    Object.defineProperty(globalThis, 'GPUBufferUsage', {
      configurable: true,
      value: {
        MAP_READ: 0x0001,
        MAP_WRITE: 0x0002,
        COPY_SRC: 0x0004,
        COPY_DST: 0x0008,
        INDEX: 0x0010,
        VERTEX: 0x0020,
        UNIFORM: 0x0040,
        STORAGE: 0x0080,
        INDIRECT: 0x0100,
        QUERY_RESOLVE: 0x0200,
      },
    })
  }
})

afterAll(() => {
  if (!hadGPUBufferUsage) {
    delete (globalThis as Record<string, unknown>).GPUBufferUsage
  }
})

describe('runStrangEvolution curved stochastic branch', () => {
  it.each([
    { gamma: Number.NaN, dt: 0.02 },
    { gamma: Number.POSITIVE_INFINITY, dt: 0.02 },
    { gamma: 2, dt: Number.NaN },
    { gamma: 2, dt: 0 },
  ])('treats invalid CSL substep inputs as one safe substep: %o', ({ gamma, dt }) => {
    expect(computeCSLSubsteps(gamma, dt)).toBe(1)
  })

  it('does not stage stochastic uniforms when gamma or dt is non-finite', () => {
    for (const invalid of [
      { stochasticGamma: Number.NaN, dt: 0.02 },
      { stochasticGamma: Number.POSITIVE_INFINITY, dt: 0.02 },
      { stochasticGamma: 2, dt: Number.NaN },
    ]) {
      const events: string[] = []
      const ctx = makeContext(events)
      const stochasticState = makeStochasticState()
      const config = {
        stochasticEnabled: true,
        stochasticGamma: invalid.stochasticGamma,
        stochasticSigma: 1,
        stochasticNumSites: 2,
        stochasticSeed: 1234,
        dt: invalid.dt,
        latticeDim: 1,
        gridSize: [16],
        spacing: [0.1],
      } as unknown as TdseConfig

      prepareStochasticStaging(ctx.device, config, stochasticState, 1, 2)

      expect(events).toEqual([])
      expect(stochasticState.stagingBuffer).toBeNull()
    }
  })

  it('clears staged slot availability when fractional frame steps floor to zero', () => {
    const events: string[] = []
    const ctx = makeContext(events)
    const stochasticState = makeStochasticState()
    stochasticState.stagingBuffer = buffer('previous-staging')
    stochasticState.stagingSlotCount = 4
    const config = {
      stochasticEnabled: true,
      stochasticGamma: 2,
      stochasticSigma: 1,
      stochasticNumSites: 2,
      stochasticSeed: 1234,
      dt: 0.02,
      latticeDim: 1,
      gridSize: [16],
      spacing: [0.1],
    } as unknown as TdseConfig

    prepareStochasticStaging(ctx.device, config, stochasticState, 0.5, 2)

    expect(events).toEqual([])
    expect(stochasticState.stagingSlotCount).toBe(0)
  })

  it('does not dispatch stale capacity slots beyond prepared stochastic uniforms', () => {
    const events: string[] = []
    const ctx = makeContext(events)
    const stochasticState = makeStochasticState()
    const config = {
      stochasticEnabled: true,
      stochasticGamma: 0.2,
      stochasticSigma: 1,
      stochasticNumSites: 2,
      stochasticSeed: 1234,
      dt: 0.02,
      latticeDim: 1,
      gridSize: [16],
      spacing: [0.1],
    } as unknown as TdseConfig

    prepareStochasticStaging(ctx.device, config, stochasticState, 1, 2)

    expect(stochasticState.stagingCapacity).toBeGreaterThan(stochasticState.stagingSlotCount)
    expect(stochasticState.stagingSlotCount).toBe(1)
    events.length = 0

    maybeDispatchStochasticLoc(
      ctx.device,
      ctx,
      config,
      stochasticState,
      { x: 1, y: 1, z: 1, use3D: false },
      16,
      1,
      (pass, nextPipeline, _bindGroups, x, y = 1, z = 1) => {
        events.push(`dispatch:${labelOf(pass)}:${labelOf(nextPipeline)}:${x}:${y}:${z}`)
      }
    )

    expect(events).toEqual([])
  })

  it('does not apply CSL when expectation centering resources are unavailable', () => {
    const events: string[] = []
    const ctx = makeContext(events)
    const stochasticState = makeStochasticState()
    const config = {
      stochasticEnabled: true,
      stochasticGamma: 0.2,
      stochasticSigma: 1,
      stochasticNumSites: 2,
      stochasticSeed: 1234,
      dt: 0.02,
      latticeDim: 1,
      gridSize: [16],
      spacing: [0.1],
    } as unknown as TdseConfig

    prepareStochasticStaging(ctx.device, config, stochasticState, 1, 2)
    stochasticState.expectReduceBG = null
    events.length = 0

    maybeDispatchStochasticLoc(
      ctx.device,
      ctx,
      config,
      stochasticState,
      { x: 1, y: 1, z: 1, use3D: false },
      16,
      0,
      (pass, nextPipeline, _bindGroups, x, y = 1, z = 1) => {
        events.push(`dispatch:${labelOf(pass)}:${labelOf(nextPipeline)}:${x}:${y}:${z}`)
      }
    )

    expect(events).toEqual([])
  })

  it('rejects invalid stochastic dispatch dimensions before copying uniforms', () => {
    const events: string[] = []
    const ctx = makeContext(events)
    const stochasticState = makeStochasticState()
    const config = {
      stochasticEnabled: true,
      stochasticGamma: 0.2,
      stochasticSigma: 1,
      stochasticNumSites: 2,
      stochasticSeed: 1234,
      dt: 0.02,
      latticeDim: 1,
      gridSize: [16],
      spacing: [0.1],
    } as unknown as TdseConfig

    prepareStochasticStaging(ctx.device, config, stochasticState, 1, 2)
    events.length = 0

    for (const [siteDispatch, totalSites] of [
      [{ x: 0, y: 1, z: 1, use3D: false }, 16],
      [{ x: 1, y: Number.NaN, z: 1, use3D: false }, 16],
      [{ x: 1, y: 1, z: 1, use3D: false }, 0],
      [{ x: 1, y: 1, z: 1, use3D: false }, Number.POSITIVE_INFINITY],
    ] as const) {
      maybeDispatchStochasticLoc(
        ctx.device,
        ctx,
        config,
        stochasticState,
        siteDispatch,
        totalSites,
        0,
        (pass, nextPipeline, _bindGroups, x, y = 1, z = 1) => {
          events.push(`dispatch:${labelOf(pass)}:${labelOf(nextPipeline)}:${x}:${y}:${z}`)
        }
      )
    }

    expect(events).toEqual([])
  })

  it('clears expectation bind groups when rebuild receives invalid workgroup counts', () => {
    const events: string[] = []
    const stochasticState = makeStochasticState()
    stochasticState.expectReduceBGL = {
      label: 'expect-reduce-bgl',
    } as unknown as GPUBindGroupLayout
    stochasticState.expectFinalizeBGL = {
      label: 'expect-finalize-bgl',
    } as unknown as GPUBindGroupLayout
    stochasticState.expectResultBuffer = buffer('expect-result')
    stochasticState.expectPartialBuffer = buffer('old-partial')
    stochasticState.expectFinalizeUniformBuffer = buffer('old-finalize-uniform')
    stochasticState.expectReduceBG = bindGroup('old-reduce-bg')
    stochasticState.expectFinalizeBG = bindGroup('old-finalize-bg')
    const device = {
      queue: {
        writeBuffer: () => events.push('writeBuffer'),
      },
      createBuffer: (descriptor: GPUBufferDescriptor) => {
        events.push(`createBuffer:${String(descriptor.label)}:${descriptor.size}`)
        return buffer(String(descriptor.label))
      },
      createBindGroup: (descriptor: GPUBindGroupDescriptor) => {
        events.push(`createBindGroup:${String(descriptor.label)}`)
        return bindGroup(String(descriptor.label))
      },
    } as unknown as GPUDevice

    rebuildExpectationBindGroups(device, stochasticState, buffer('uniform'), buffer('psi'), 0)

    expect(events).toEqual([])
    expect(stochasticState.expectPartialBuffer).toBeNull()
    expect(stochasticState.expectFinalizeUniformBuffer).toBeNull()
    expect(stochasticState.expectReduceBG).toBeNull()
    expect(stochasticState.expectFinalizeBG).toBeNull()
  })

  it('sanitizes malformed lattice geometry before staging collapse centers', () => {
    const writes: ArrayBuffer[] = []
    const device = {
      queue: {
        writeBuffer: (_target: GPUBuffer, _offset: number, data: ArrayBuffer) => {
          writes.push(data.slice(0))
        },
      },
      createBuffer: (descriptor: GPUBufferDescriptor) => buffer(String(descriptor.label)),
    } as unknown as GPUDevice
    const stochasticState = makeStochasticState()
    const config = {
      stochasticEnabled: true,
      stochasticGamma: 2,
      stochasticSigma: 1,
      stochasticNumSites: 2,
      stochasticSeed: 1234,
      dt: 0.02,
      latticeDim: Number.POSITIVE_INFINITY,
      gridSize: [16, Number.NaN],
      spacing: [0.1, Number.POSITIVE_INFINITY],
    } as unknown as TdseConfig

    prepareStochasticStaging(device, config, stochasticState, 1, Number.NaN)

    expect(writes).toHaveLength(1)
    const staged = new Float32Array(writes[0]!)
    for (const value of staged) {
      expect(Number.isFinite(value)).toBe(true)
    }
  })

  it('dispatches CSL localization before curved stochastic renormalization', () => {
    const events: string[] = []
    const ctx = makeContext(events)
    const stochasticState = makeStochasticState()
    const config = {
      metric: { kind: 'morrisThorne', throatRadius: 0.5 },
      absorberEnabled: false,
      imaginaryTimeEnabled: false,
      stochasticEnabled: true,
      stochasticGamma: 2,
      stochasticSigma: 1,
      stochasticNumSites: 2,
      stochasticSeed: 1234,
      dt: 0.02,
      stepsPerFrame: 1,
      latticeDim: 2,
      gridSize: [4, 4],
      spacing: [0.1, 0.1],
      wormholeCouplingEnabled: false,
    } as unknown as TdseConfig

    runStrangEvolution(
      ctx,
      config,
      1,
      { simTime: 0, stepAccumulator: 0 },
      makeResources(events, stochasticState)
    )

    expect(events.some((e) => e.startsWith('write:tdse-stochastic-staging:0:'))).toBe(true)
    expect(events).toContain('begin:tdse-stochastic-loc-step0')
    expect(events).toContain('begin:tdse-stochastic-loc-step3')

    const rk4Index = events.indexOf('curved-rk4')
    const expectReduceIndex = events.indexOf('begin:tdse-stochastic-expect-reduce-0')
    const locStep0Index = events.indexOf('begin:tdse-stochastic-loc-step0')
    const locStep3Index = events.indexOf('begin:tdse-stochastic-loc-step3')
    const renormIndex = events.indexOf('begin:tdse-curved-renorm-reduce-0')
    expect(rk4Index).toBeGreaterThanOrEqual(0)
    expect(expectReduceIndex).toBeGreaterThan(rk4Index)
    expect(locStep0Index).toBeGreaterThan(expectReduceIndex)
    expect(locStep3Index).toBeGreaterThan(locStep0Index)
    expect(renormIndex).toBeGreaterThan(locStep3Index)
  })

  it('routes a dimension-degenerate metric through the flat Strang path', () => {
    const events: string[] = []
    const ctx = makeContext(events)
    const stochasticState = makeStochasticState()
    const config = {
      metric: { kind: 'morrisThorne', throatRadius: 0.5 },
      absorberEnabled: false,
      imaginaryTimeEnabled: false,
      stochasticEnabled: false,
      stochasticGamma: 0,
      dt: 0.02,
      stepsPerFrame: 1,
      latticeDim: 1,
      gridSize: [16],
      spacing: [0.1],
      wormholeCouplingEnabled: false,
    } as unknown as TdseConfig

    runStrangEvolution(
      ctx,
      config,
      1,
      { simTime: 0, stepAccumulator: 0 },
      makeResources(events, stochasticState)
    )

    expect(events).not.toContain('curved-rk4')
    expect(events).toContain('begin:tdse-strang-0')
  })
})
