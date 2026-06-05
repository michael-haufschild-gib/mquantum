import { describe, expect, it, vi } from 'vitest'

import { FreeScalarFieldComputePass } from '@/rendering/webgpu/passes/FreeScalarFieldComputePass'

interface FlushableFsfPass {
  densityTexture: GPUTexture | null
  analysisTexture: GPUTexture | null
  kSpace: {
    takePendingData: () => {
      density?: Uint16Array
      analysis?: Uint16Array
      totalParticles: number
    } | null
  }
  flushKSpaceData: (device: GPUDevice) => void
}

describe('FreeScalarFieldComputePass k-space texture upload', () => {
  it('drops malformed worker texture payloads instead of inferring a bogus texture size', () => {
    const pass = new FreeScalarFieldComputePass(4) as unknown as FlushableFsfPass
    const writeTexture = vi.fn()

    pass.densityTexture = {} as GPUTexture
    pass.analysisTexture = {} as GPUTexture
    pass.kSpace = {
      takePendingData: () => ({
        density: new Uint16Array(2 * 2 * 2 * 4),
        analysis: new Uint16Array(2 * 2 * 2 * 4),
        totalParticles: 1,
      }),
    }

    pass.flushKSpaceData({ queue: { writeTexture } } as unknown as GPUDevice)

    expect(writeTexture).not.toHaveBeenCalled()
  })
})
