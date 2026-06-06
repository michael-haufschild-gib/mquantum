import { describe, expect, it } from 'vitest'

import { DEFAULT_DIRAC_CONFIG, type DiracConfig } from '@/lib/geometry/extended/dirac'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import type { SiteDispatch } from '@/rendering/webgpu/passes/computePassUtils'
import { diracSharedMemFFTWorkgroupCount } from '@/rendering/webgpu/passes/DiracComputePassDispatchers'
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
    absorberNormalizePipeline: p('absorberNormalizePipeline'),
    renormalizePipeline: p('renormalizePipeline'),
    renormalizeBGL: l('renormalizeBGL'),
    packPipeline: p('packPipeline'),
    packBGL: l('packBGL'),
    unpackPipeline: p('unpackPipeline'),
    unpackBGL: l('unpackBGL'),
    spinorScalePipeline: p('spinorScalePipeline'),
    spinorScaleBGL: l('spinorScaleBGL'),
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
    cachedSpinorFFTBGs: Array.from({ length: componentCount }, (_, c) =>
      Array.from({ length: fftSlots }, (_, i) => bg(`spinorFFT${c}[${i}]`))
    ),
    cachedSpinorScaleBGs: Array.from({ length: componentCount }, (_, i) => bg(`scale${i}`)),
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

describe('Dirac shared-memory FFT dispatch sizing', () => {
  it('batches small axes into the same 64-thread workgroup contract as the shader', () => {
    expect(diracSharedMemFFTWorkgroupCount(8 * 8, 8)).toBe(1)
    expect(diracSharedMemFFTWorkgroupCount(9 * 8, 8)).toBe(2)
    expect(diracSharedMemFFTWorkgroupCount(4 * 16, 16)).toBe(1)
    expect(diracSharedMemFFTWorkgroupCount(5 * 16, 16)).toBe(2)
    expect(diracSharedMemFFTWorkgroupCount(2 * 32, 32)).toBe(1)
    expect(diracSharedMemFFTWorkgroupCount(3 * 32, 32)).toBe(2)
    expect(diracSharedMemFFTWorkgroupCount(64, 64)).toBe(1)
    expect(diracSharedMemFFTWorkgroupCount(2 * 64, 64)).toBe(2)
  })

  it('rounds up partial multi-pencil workgroups', () => {
    expect(diracSharedMemFFTWorkgroupCount(16, 4)).toBe(1)
    expect(diracSharedMemFFTWorkgroupCount(144, 16)).toBe(3)
    expect(diracSharedMemFFTWorkgroupCount(256, 32)).toBe(4)
    expect(diracSharedMemFFTWorkgroupCount(512, 128)).toBe(4)
  })
})

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
      'fftDispatch:1::',
      'setBindGroup:0:fftSharedMemBGs[1]',
      'fftDispatch:1::',
      'compute:unpackPipeline:unpackNoNorm0:9::',
      'compute:packPipeline:pack1:9::',
      'setPipeline:fftSharedMemPipeline',
      'setBindGroup:0:fftSharedMemBGs[0]',
      'fftDispatch:1::',
      'setBindGroup:0:fftSharedMemBGs[1]',
      'fftDispatch:1::',
      'compute:unpackPipeline:unpackNoNorm1:9::',
      'compute:kineticPipeline:kineticBG:5:1:1',
      'compute:packPipeline:pack0:9::',
      'setPipeline:fftSharedMemPipeline',
      'setBindGroup:0:fftSharedMemBGs[2]',
      'fftDispatch:1::',
      'setBindGroup:0:fftSharedMemBGs[3]',
      'fftDispatch:1::',
      'compute:unpackPipeline:unpack0:9::',
      'compute:packPipeline:pack1:9::',
      'setPipeline:fftSharedMemPipeline',
      'setBindGroup:0:fftSharedMemBGs[2]',
      'fftDispatch:1::',
      'setBindGroup:0:fftSharedMemBGs[3]',
      'fftDispatch:1::',
      'compute:unpackPipeline:unpack1:9::',
      'compute:potentialHalfPipeline:potentialHalfBG:9::',
      'end',
    ])
  })

  it('uses in-place spinor FFT bind groups for direct batched Strang', () => {
    const calls: string[] = []
    runBatchedStrangStep({
      ctx: makeContext(calls),
      pl: makePipelines(),
      bg: makeBindGroups(1),
      config: makeConfig(),
      step: 4,
      S: 1,
      linearWG: 9,
      applyPotentialHalf: false,
      siteDispatch,
      dispatchCompute: makeDispatch(calls),
      ifftSlotOffset: 2,
      totalSites: 16,
      useDirectSpinorFFT: true,
    })

    expect(calls).toEqual([
      'begin:dirac-strang-4',
      'setPipeline:fftSharedMemPipeline',
      'setBindGroup:0:spinorFFT0[0]',
      'fftDispatch:1::',
      'setBindGroup:0:spinorFFT0[1]',
      'fftDispatch:1::',
      'compute:kineticPipeline:kineticBG:5:1:1',
      'setPipeline:fftSharedMemPipeline',
      'setBindGroup:0:spinorFFT0[2]',
      'fftDispatch:1::',
      'setBindGroup:0:spinorFFT0[3]',
      'fftDispatch:1::',
      'compute:spinorScalePipeline:scale0:9::',
      'end',
    ])
  })

  it('folds direct inverse-FFT normalization into the absorber pass when requested', () => {
    const calls: string[] = []
    runBatchedStrangStep({
      ctx: makeContext(calls),
      pl: makePipelines(),
      bg: makeBindGroups(1),
      config: makeConfig({ absorberEnabled: true }),
      step: 5,
      S: 1,
      linearWG: 9,
      applyPotentialHalf: false,
      normalizeInAbsorber: true,
      siteDispatch,
      dispatchCompute: makeDispatch(calls),
      ifftSlotOffset: 2,
      totalSites: 16,
      useDirectSpinorFFT: true,
    })

    expect(calls).toEqual([
      'begin:dirac-strang-5',
      'setPipeline:fftSharedMemPipeline',
      'setBindGroup:0:spinorFFT0[0]',
      'fftDispatch:1::',
      'setBindGroup:0:spinorFFT0[1]',
      'fftDispatch:1::',
      'compute:kineticPipeline:kineticBG:5:1:1',
      'setPipeline:fftSharedMemPipeline',
      'setBindGroup:0:spinorFFT0[2]',
      'fftDispatch:1::',
      'setBindGroup:0:spinorFFT0[3]',
      'fftDispatch:1::',
      'compute:absorberNormalizePipeline:initBG:5:1:1',
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
