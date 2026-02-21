import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'

const { computeRawKSpaceDataMock, buildKSpaceDisplayTexturesMock } = vi.hoisted(() => ({
  computeRawKSpaceDataMock: vi.fn(() => ({ mock: true })),
  buildKSpaceDisplayTexturesMock: vi.fn(() => ({
    density: new Uint16Array([1, 2, 3, 4]),
    analysis: new Uint16Array([5, 6, 7, 8]),
  })),
}))

vi.mock('@/lib/physics/freeScalar/kSpaceOccupation', () => ({
  computeRawKSpaceData: computeRawKSpaceDataMock,
}))

vi.mock('@/lib/physics/freeScalar/kSpaceDisplayTransforms', () => ({
  buildKSpaceDisplayTextures: buildKSpaceDisplayTexturesMock,
}))

vi.mock('@/lib/physics/freeScalar/vacuumSpectrum', () => ({
  estimateVacuumMaxPhi: vi.fn(() => 1),
  sampleVacuumSpectrum: vi.fn(() => ({ phi: new Float32Array(0), pi: new Float32Array(0) })),
}))

import { FreeScalarFieldComputePass } from '@/rendering/webgpu/passes/FreeScalarFieldComputePass'

function ensureGPUMapMode(): void {
  if (!('GPUMapMode' in globalThis)) {
    ;(globalThis as unknown as { GPUMapMode: Record<string, number> }).GPUMapMode = { READ: 1 }
  }
}

function makeConfig(): FreeScalarConfig {
  return {
    latticeDim: 3,
    gridSize: [8, 8, 8],
    spacing: [1, 1, 1],
    mass: 1,
    dt: 0.01,
    stepsPerFrame: 1,
    initialCondition: 'vacuumNoise',
    packetCenter: [0, 0, 0],
    packetWidth: 0.25,
    packetAmplitude: 1,
    modeK: [0, 0, 0],
    fieldView: 'phi',
    autoScale: true,
    needsReset: false,
    vacuumSeed: 1,
    slicePositions: [],
    kSpaceViz: {
      displayMode: 'raw3d',
      fftShiftEnabled: true,
      lowPercentile: 1,
      highPercentile: 99,
      gamma: 1,
      exposureMode: 'linear',
      broadeningEnabled: false,
      broadeningRadius: 2,
      broadeningSigma: 1,
      radialBinCount: 64,
    },
  }
}

function makeReadbackBuffer(values: number[]) {
  const payload = Float32Array.from(values).buffer
  return {
    mapAsync: vi.fn(async () => {}),
    getMappedRange: vi.fn(() => payload),
    unmap: vi.fn(),
    destroy: vi.fn(),
  }
}

function makeDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('FreeScalarFieldComputePass k-space readback', () => {
  beforeEach(() => {
    ensureGPUMapMode()
    vi.clearAllMocks()
  })

  it('uses readback buffer references captured when readback starts', async () => {
    const pass = new FreeScalarFieldComputePass() as unknown as {
      phiReadbackBuffer: ReturnType<typeof makeReadbackBuffer> | null
      piReadbackBuffer: ReturnType<typeof makeReadbackBuffer> | null
      readbackAndComputeKSpace: (device: { queue: { onSubmittedWorkDone: () => Promise<void> } }, config: FreeScalarConfig) => Promise<void>
    }

    const oldPhi = makeReadbackBuffer([1, 2, 3, 4])
    const oldPi = makeReadbackBuffer([5, 6, 7, 8])
    const newPhi = makeReadbackBuffer([9, 10, 11, 12])
    const newPi = makeReadbackBuffer([13, 14, 15, 16])

    pass.phiReadbackBuffer = oldPhi
    pass.piReadbackBuffer = oldPi

    const gate = makeDeferred<void>()
    const device = {
      queue: {
        onSubmittedWorkDone: vi.fn(() => gate.promise),
      },
    }

    const task = pass.readbackAndComputeKSpace(device, makeConfig())
    pass.phiReadbackBuffer = newPhi
    pass.piReadbackBuffer = newPi
    gate.resolve()
    await task

    expect(oldPhi.mapAsync).toHaveBeenCalledTimes(1)
    expect(oldPi.mapAsync).toHaveBeenCalledTimes(1)
    expect(newPhi.mapAsync).not.toHaveBeenCalled()
    expect(newPi.mapAsync).not.toHaveBeenCalled()
  })

  it('drops stale readback results when epoch advances mid-flight', async () => {
    const pass = new FreeScalarFieldComputePass() as unknown as {
      kSpaceReadbackEpoch?: number
      kSpacePending: boolean
      pendingKSpaceData: { density: Uint16Array; analysis: Uint16Array } | null
      phiReadbackBuffer: ReturnType<typeof makeReadbackBuffer> | null
      piReadbackBuffer: ReturnType<typeof makeReadbackBuffer> | null
      readbackAndComputeKSpace: (device: { queue: { onSubmittedWorkDone: () => Promise<void> } }, config: FreeScalarConfig) => Promise<void>
    }

    pass.kSpaceReadbackEpoch = 0
    pass.kSpacePending = false
    pass.pendingKSpaceData = null
    pass.phiReadbackBuffer = makeReadbackBuffer([1, 2, 3, 4])
    pass.piReadbackBuffer = makeReadbackBuffer([5, 6, 7, 8])

    const gate = makeDeferred<void>()
    const device = {
      queue: {
        onSubmittedWorkDone: vi.fn(() => gate.promise),
      },
    }

    const task = pass.readbackAndComputeKSpace(device, makeConfig())
    pass.kSpaceReadbackEpoch += 1
    gate.resolve()
    await task

    expect(pass.pendingKSpaceData).toBeNull()
    expect(buildKSpaceDisplayTexturesMock).not.toHaveBeenCalled()
  })
})
