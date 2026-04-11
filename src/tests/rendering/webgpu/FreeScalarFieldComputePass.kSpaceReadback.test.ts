import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_COSMOLOGY_CONFIG } from '@/lib/geometry/extended/freeScalar'
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
  computeRawKSpaceDataFromComplex: computeRawKSpaceDataMock,
}))

vi.mock('@/lib/physics/freeScalar/kSpaceDisplayTransforms', () => ({
  buildKSpaceDisplayTextures: buildKSpaceDisplayTexturesMock,
}))

vi.mock('@/lib/physics/freeScalar/vacuumSpectrum', () => ({
  estimateVacuumMaxPhi: vi.fn(() => 1),
  sampleVacuumSpectrum: vi.fn(() => ({ phi: new Float32Array(0), pi: new Float32Array(0) })),
}))

import { FsfKSpaceManager } from '@/rendering/webgpu/passes/FreeScalarFieldKSpace'

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
    selfInteractionEnabled: false,
    selfInteractionLambda: 0.5,
    selfInteractionVev: 1.0,
    absorberEnabled: false,
    absorberWidth: 0.2,
    pmlTargetReflection: 1e-6,
    diagnosticsEnabled: false,
    diagnosticsInterval: 60,
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
    cosmology: { ...DEFAULT_COSMOLOGY_CONFIG },
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

describe('FsfKSpaceManager readback', () => {
  beforeEach(() => {
    ensureGPUMapMode()
    vi.clearAllMocks()
  })

  it('uses readback buffer references captured when readback starts', async () => {
    const mgr = new FsfKSpaceManager() as unknown as {
      phiReadbackBuffer: ReturnType<typeof makeReadbackBuffer> | null
      piReadbackBuffer: ReturnType<typeof makeReadbackBuffer> | null
      readbackAndComputeKSpace: (
        device: { queue: { onSubmittedWorkDone: () => Promise<void> } },
        config: FreeScalarConfig
      ) => Promise<void>
    }

    const oldPhi = makeReadbackBuffer([1, 2, 3, 4])
    const oldPi = makeReadbackBuffer([5, 6, 7, 8])
    const newPhi = makeReadbackBuffer([9, 10, 11, 12])
    const newPi = makeReadbackBuffer([13, 14, 15, 16])

    mgr.phiReadbackBuffer = oldPhi
    mgr.piReadbackBuffer = oldPi

    const gate = makeDeferred<void>()
    const device = {
      queue: {
        onSubmittedWorkDone: vi.fn(() => gate.promise),
      },
    }

    const task = mgr.readbackAndComputeKSpace(device, makeConfig())
    mgr.phiReadbackBuffer = newPhi
    mgr.piReadbackBuffer = newPi
    gate.resolve()
    await task

    expect(oldPhi.mapAsync).toHaveBeenCalledTimes(1)
    expect(oldPi.mapAsync).toHaveBeenCalledTimes(1)
    expect(newPhi.mapAsync).not.toHaveBeenCalled()
    expect(newPi.mapAsync).not.toHaveBeenCalled()
  })

  it('drops stale readback results when epoch advances mid-flight', async () => {
    const mgr = new FsfKSpaceManager() as unknown as {
      kSpaceReadbackEpoch: number
      kSpacePending: boolean
      pendingKSpaceData: { density: Uint16Array; analysis: Uint16Array } | null
      phiReadbackBuffer: ReturnType<typeof makeReadbackBuffer> | null
      piReadbackBuffer: ReturnType<typeof makeReadbackBuffer> | null
      readbackAndComputeKSpace: (
        device: { queue: { onSubmittedWorkDone: () => Promise<void> } },
        config: FreeScalarConfig
      ) => Promise<void>
    }

    mgr.kSpaceReadbackEpoch = 0
    mgr.kSpacePending = false
    mgr.pendingKSpaceData = null
    mgr.phiReadbackBuffer = makeReadbackBuffer([1, 2, 3, 4])
    mgr.piReadbackBuffer = makeReadbackBuffer([5, 6, 7, 8])

    const gate = makeDeferred<void>()
    const device = {
      queue: {
        onSubmittedWorkDone: vi.fn(() => gate.promise),
      },
    }

    const task = mgr.readbackAndComputeKSpace(device, makeConfig())
    mgr.kSpaceReadbackEpoch += 1
    gate.resolve()
    await task

    expect(mgr.pendingKSpaceData).toBeNull()
    expect(buildKSpaceDisplayTexturesMock).not.toHaveBeenCalled()
  })

  it('invalidateReadbacks clears any already-queued pending k-space data', () => {
    // L7 audit regression: a worker result that landed on the pending queue
    // *before* a cosmology reset must not be uploaded into the texture on
    // the next frame. The previous form only bumped the epoch, leaving any
    // pendingKSpaceData in place — causing one frame of stale k-space pixels
    // after every reset.
    const mgr = new FsfKSpaceManager() as unknown as {
      kSpaceReadbackEpoch: number
      pendingKSpaceData: { density: Uint16Array; analysis: Uint16Array } | null
      invalidateReadbacks(): void
    }

    mgr.kSpaceReadbackEpoch = 0
    mgr.pendingKSpaceData = {
      density: new Uint16Array([1, 2, 3, 4]),
      analysis: new Uint16Array([5, 6, 7, 8]),
    }

    mgr.invalidateReadbacks()

    expect(mgr.pendingKSpaceData).toBeNull()
    // And the epoch is bumped so any in-flight async resolution is dropped.
    expect(mgr.kSpaceReadbackEpoch).toBe(1)
  })
})
