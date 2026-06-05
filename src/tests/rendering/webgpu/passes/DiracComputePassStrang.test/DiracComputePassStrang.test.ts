import { describe, expect, it } from 'vitest'

import { DEFAULT_DIRAC_CONFIG, type DiracConfig } from '@/lib/geometry/extended/dirac'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import type { SiteDispatch } from '@/rendering/webgpu/passes/computePassUtils'
import type {
  DiracBindGroupResult,
  DiracPipelineResult,
} from '@/rendering/webgpu/passes/DiracComputePassResources'
import {
  type DispatchComputeFn,
  runBatchedStrangStep,
  runLegacyStrangStep,
} from '@/rendering/webgpu/passes/DiracComputePassStrang'

type Named = { name: string }

function gpu<T>(name: string): T {
  return { name } as T
}

function nameOf(value: unknown): string {
  return (value as Named).name
}

function makeConfig(overrides: Partial<DiracConfig> = {}): DiracConfig {
  return {
    ...DEFAULT_DIRAC_CONFIG,
    latticeDim: 2,
    gridSize: [4, 4, ...DEFAULT_DIRAC_CONFIG.gridSize.slice(2)],
    spacing: [1, 1, ...DEFAULT_DIRAC_CONFIG.spacing.slice(2)],
    absorberEnabled: false,
    ...overrides,
  }
}

function makePipelines(): DiracPipelineResult {
  const p = (name: string) => gpu<GPUComputePipeline>(name)
  const l = (name: string) => gpu<GPUBindGroupLayout>(name)
  return {
    initPipeline: p('initPipeline'),
    initBGL: l('initBGL'),
    potentialPipeline: p('potentialPipeline'),
    potentialBGL: l('potentialBGL'),
    potentialHalfPipeline: p('potentialHalfPipeline'),
    potentialHalfBGL: l('potentialHalfBGL'),
    absorberPipeline: p('absorberPipeline'),
    renormalizePipeline: p('renormalizePipeline'),
    renormalizeBGL: l('renormalizeBGL'),
    packPipeline: p('packPipeline'),
    packBGL: l('packBGL'),
    unpackPipeline: p('unpackPipeline'),
    unpackBGL: l('unpackBGL'),
    fftStagePipeline: p('fftStagePipeline'),
    fftStageBGL: l('fftStageBGL'),
    fftSharedMemPipeline: p('fftSharedMemPipeline'),
    fftSharedMemBGL: l('fftSharedMemBGL'),
    kineticPipeline: p('kineticPipeline'),
    kineticBGL: l('kineticBGL'),
    writeGridPipeline: p('writeGridPipeline'),
    writeGridBGL: l('writeGridBGL'),
    diagReducePipeline: p('diagReducePipeline'),
    diagReduceBGL: l('diagReduceBGL'),
    diagFinalizePipeline: p('diagFinalizePipeline'),
    diagFinalizeBGL: l('diagFinalizeBGL'),
    use3DSiteDispatch: false,
  }
}

function makeBindGroups(componentCount = 2, fftSlots = 4): DiracBindGroupResult {
  const bg = (name: string) => gpu<GPUBindGroup>(name)
  return {
    initBG: bg('initBG'),
    potentialBG: bg('potentialBG'),
    potentialHalfBG: bg('potentialHalfBG'),
    fftStageABBG: bg('fftStageABBG'),
    fftStageBABG: bg('fftStageBABG'),
    fftSharedMemBG: bg('fftSharedMemBG'),
    fftSharedMemBGs: Array.from({ length: fftSlots }, (_, i) => bg(`fftSharedMemBGs[${i}]`)),
    kineticBG: bg('kineticBG'),
    writeGridBG: bg('writeGridBG'),
    diagReduceBG: bg('diagReduceBG'),
    diagFinalizeBG: bg('diagFinalizeBG'),
    renormalizeBG: bg('renormalizeBG'),
    renormalizeUniformBuffer: gpu<GPUBuffer>('renormalizeUniformBuffer'),
    cachedPackBGs: Array.from({ length: componentCount }, (_, i) => bg(`pack${i}`)),
    cachedUnpackBGs: Array.from({ length: componentCount }, (_, i) => bg(`unpack${i}`)),
    cachedUnpackBGsNoNorm: Array.from({ length: componentCount }, (_, i) => bg(`unpackNoNorm${i}`)),
  }
}

function makeContext(calls: string[]): WebGPURenderContext {
  return {
    beginComputePass: ({ label }: GPUComputePassDescriptor = {}) => {
      calls.push(`begin:${label ?? ''}`)
      return {
        setPipeline: (pipeline: GPUComputePipeline) =>
          calls.push(`setPipeline:${nameOf(pipeline)}`),
        setBindGroup: (index: number, bindGroup: GPUBindGroup) =>
          calls.push(`setBindGroup:${index}:${nameOf(bindGroup)}`),
        dispatchWorkgroups: (x: number, y?: number, z?: number) =>
          calls.push(`fftDispatch:${x}:${y ?? ''}:${z ?? ''}`),
        end: () => calls.push('end'),
      } as unknown as GPUComputePassEncoder
    },
  } as WebGPURenderContext
}

function makeDispatch(calls: string[]): DispatchComputeFn {
  return (_pass, pipeline, bindGroups, x, y, z) => {
    calls.push(`compute:${nameOf(pipeline)}:${nameOf(bindGroups[0])}:${x}:${y ?? ''}:${z ?? ''}`)
  }
}

const siteDispatch: SiteDispatch = { x: 5, y: 1, z: 1, use3D: false }

describe('DiracComputePassStrang', () => {
  it('dispatches every spinor component in batched Strang order', () => {
    const calls: string[] = []
    runBatchedStrangStep({
      ctx: makeContext(calls),
      pl: makePipelines(),
      bg: makeBindGroups(),
      config: makeConfig(),
      step: 3,
      S: 2,
      linearWG: 9,
      siteDispatch,
      dispatchCompute: makeDispatch(calls),
      ifftSlotOffset: 2,
      totalSites: 16,
    })

    expect(calls).toEqual([
      'begin:dirac-strang-3',
      'compute:potentialHalfPipeline:potentialHalfBG:9::',
      'compute:packPipeline:pack0:9::',
      'setPipeline:fftSharedMemPipeline',
      'setBindGroup:0:fftSharedMemBGs[0]',
      'fftDispatch:4::',
      'setBindGroup:0:fftSharedMemBGs[1]',
      'fftDispatch:4::',
      'compute:unpackPipeline:unpackNoNorm0:9::',
      'compute:packPipeline:pack1:9::',
      'setPipeline:fftSharedMemPipeline',
      'setBindGroup:0:fftSharedMemBGs[0]',
      'fftDispatch:4::',
      'setBindGroup:0:fftSharedMemBGs[1]',
      'fftDispatch:4::',
      'compute:unpackPipeline:unpackNoNorm1:9::',
      'compute:kineticPipeline:kineticBG:5:1:1',
      'compute:packPipeline:pack0:9::',
      'setPipeline:fftSharedMemPipeline',
      'setBindGroup:0:fftSharedMemBGs[2]',
      'fftDispatch:4::',
      'setBindGroup:0:fftSharedMemBGs[3]',
      'fftDispatch:4::',
      'compute:unpackPipeline:unpack0:9::',
      'compute:packPipeline:pack1:9::',
      'setPipeline:fftSharedMemPipeline',
      'setBindGroup:0:fftSharedMemBGs[2]',
      'fftDispatch:4::',
      'setBindGroup:0:fftSharedMemBGs[3]',
      'fftDispatch:4::',
      'compute:unpackPipeline:unpack1:9::',
      'compute:potentialHalfPipeline:potentialHalfBG:9::',
      'end',
    ])
  })

  it('fails before opening a batched compute pass when component bind groups are incomplete', () => {
    const calls: string[] = []
    const bg = makeBindGroups()
    bg.cachedUnpackBGsNoNorm = [bg.cachedUnpackBGsNoNorm[0]!]

    expect(() =>
      runBatchedStrangStep({
        ctx: makeContext(calls),
        pl: makePipelines(),
        bg,
        config: makeConfig(),
        step: 0,
        S: 2,
        linearWG: 1,
        siteDispatch,
        dispatchCompute: makeDispatch(calls),
        ifftSlotOffset: 2,
        totalSites: 16,
      })
    ).toThrow('[Dirac] Missing BG cachedUnpackBGsNoNorm[1]')
    expect(calls).toEqual([])
  })

  it('fails before opening a legacy compute pass when shared FFT bind group is missing', () => {
    const calls: string[] = []
    const bg = makeBindGroups()
    bg.fftSharedMemBG = null

    expect(() =>
      runLegacyStrangStep({
        ctx: makeContext(calls),
        pl: makePipelines(),
        bg,
        config: makeConfig(),
        step: 0,
        S: 2,
        linearWG: 1,
        siteDispatch,
        dispatchCompute: makeDispatch(calls),
        fwdStageCount: 2,
        dispatchFFTAxisDelegated: () => 0,
      })
    ).toThrow('[Dirac] Missing BG fftSharedMemBG')
    expect(calls).toEqual([])
  })
})
