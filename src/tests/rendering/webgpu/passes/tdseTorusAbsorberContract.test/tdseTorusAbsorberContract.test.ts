import { describe, expect, it } from 'vitest'

import type { TdseConfig } from '@/lib/geometry/extended/types'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import type { EvolutionResources } from '@/rendering/webgpu/passes/TDSEComputePassEvolution'
import { runStrangEvolution } from '@/rendering/webgpu/passes/TDSEComputePassEvolution'
import type {
  TdseBindGroupResult,
  TdsePipelineResult,
} from '@/rendering/webgpu/passes/TDSEComputePassSetup'

interface Labeled {
  label?: string
}

const pipeline = (label: string): GPUComputePipeline =>
  ({
    label,
  }) as unknown as GPUComputePipeline

const bindGroup = (label: string): GPUBindGroup =>
  ({
    label,
  }) as unknown as GPUBindGroup

function labelOf(value: unknown): string {
  return typeof value === 'object' && value !== null && 'label' in value
    ? String((value as Labeled).label)
    : 'unlabeled'
}

function makeContext(events: string[]): WebGPURenderContext {
  return {
    device: {} as GPUDevice,
    encoder: {} as GPUCommandEncoder,
    beginComputePass: (descriptor?: GPUComputePassDescriptor) => {
      const label = String(descriptor?.label ?? 'unnamed')
      events.push(`begin:${label}`)
      return {
        label,
        end: () => events.push(`end:${label}`),
      } as unknown as GPUComputePassEncoder
    },
  } as unknown as WebGPURenderContext
}

function makeResources(events: string[]): EvolutionResources {
  const pl = {
    diagReducePipeline: pipeline('diag-reduce'),
    diagFinalizePipeline: pipeline('diag-finalize'),
    renormalizePipeline: pipeline('renormalize'),
    absorberPipeline: pipeline('absorber'),
    absorberPipeline3D: pipeline('absorber-3d'),
    fusedPotentialPackPipeline: pipeline('fused-potential-pack'),
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
    kineticBG: bindGroup('kinetic-bg'),
    fusedUnpackPotentialBG: bindGroup('fused-unpack-potential-bg'),
    fftSharedMemBGs: [],
  } as unknown as TdseBindGroupResult

  return {
    pl,
    bg,
    totalSites: 16,
    diagNumWorkgroups: 1,
    ifftSlotOffset: 1,
    gsState: { gsEigenstates: [] } as unknown as EvolutionResources['gsState'],
    stochasticState: null,
    boundingRadius: 2,
    hellerState: null,
    wormholePipeline: null,
    wormholeBG: null,
    siteDispatch: { x: 1, y: 1, z: 1, use3D: false },
    dc: (pass, nextPipeline, _bindGroups, x, y = 1, z = 1) => {
      events.push(`dispatch:${labelOf(pass)}:${labelOf(nextPipeline)}:${x}:${y}:${z}`)
    },
    dispatchFFTAxis: (_ctx, axisDim, slotOffset) => {
      events.push(`fft:${axisDim}:${slotOffset}`)
      return slotOffset + 1
    },
    dispatchFFTAxisInPass: () => undefined,
  }
}

function run(config: Partial<TdseConfig>): string[] {
  const events: string[] = []
  const fullConfig = {
    metric: { kind: 'flat' },
    absorberEnabled: true,
    imaginaryTimeEnabled: false,
    stochasticEnabled: false,
    stochasticGamma: 0,
    dt: 0.02,
    stepsPerFrame: 1,
    latticeDim: 1,
    gridSize: [16],
    spacing: [0.1],
    wormholeCouplingEnabled: false,
    ...config,
  } as unknown as TdseConfig

  runStrangEvolution(
    makeContext(events),
    fullConfig,
    1,
    { simTime: 0, stepAccumulator: 0 },
    makeResources(events)
  )
  return events
}

describe('TDSE torus absorber contract', () => {
  it('dispatches PML absorber on noncompact flat metrics when enabled', () => {
    const events = run({ metric: { kind: 'flat' } })

    expect(events).toContain('begin:tdse-absorber-0')
    expect(events).toContain('dispatch:tdse-absorber-0:absorber:1:1:1')
  })

  it.each([
    { stochasticEnabled: false, stochasticGamma: 0 },
    { stochasticEnabled: true, stochasticGamma: 2 },
  ])('suppresses PML absorber dispatch for periodic torus metrics: %o', (stochasticConfig) => {
    const events = run({
      metric: { kind: 'torus', torusPeriod: [1, 1, 1] },
      ...stochasticConfig,
    })

    expect(events.some((event) => event.includes('absorber'))).toBe(false)
    expect(events).toContain('begin:tdse-renorm-reduce-0')
  })
})
