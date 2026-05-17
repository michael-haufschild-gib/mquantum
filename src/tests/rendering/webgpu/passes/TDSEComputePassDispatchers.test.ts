import { describe, expect, it } from 'vitest'

import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import type { FFTAxisSharedMemParams } from '@/rendering/webgpu/passes/TDSEComputePassDispatchers'
import { dispatchFFTAxisSharedMem } from '@/rendering/webgpu/passes/TDSEComputePassDispatchers'

describe('TDSE shared-memory FFT dispatch', () => {
  it('rejects axis dimensions larger than the shader shared-memory arrays', () => {
    expect(() =>
      dispatchFFTAxisSharedMem({} as WebGPURenderContext, 256, 0, {} as FFTAxisSharedMemParams)
    ).toThrow(/TDSE FFT.*max 128/)
  })
})
