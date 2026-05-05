import { beforeAll, describe, expect, it } from 'vitest'

import type { TdseConfig } from '@/lib/geometry/extended/types'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import type { EvolutionResources } from '@/rendering/webgpu/passes/TDSEComputePassEvolution'
import { runStrangEvolution } from '@/rendering/webgpu/passes/TDSEComputePassEvolution'
import type {
  TdseBindGroupResult,
  TdsePipelineResult,
} from '@/rendering/webgpu/passes/TDSEComputePassSetup'
import {
  createStochasticLocState,
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
  } as unknown as TdsePipelineResult

  const bg = {
    diagReduceBG: bindGroup('diag-reduce-bg'),
    diagFinalizeBG: bindGroup('diag-finalize-bg'),
    renormalizeBG: bindGroup('renormalize-bg'),
    initBG: bindGroup('init-bg'),
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

beforeAll(() => {
  if (!('GPUBufferUsage' in globalThis)) {
    Object.defineProperty(globalThis, 'GPUBufferUsage', {
      configurable: true,
      value: {
        COPY_SRC: 0x0004,
        COPY_DST: 0x0008,
        UNIFORM: 0x0040,
        STORAGE: 0x0080,
      },
    })
  }
})

describe('runStrangEvolution curved stochastic branch', () => {
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
})
