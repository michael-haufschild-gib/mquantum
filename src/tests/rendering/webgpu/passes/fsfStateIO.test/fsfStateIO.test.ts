import { describe, expect, it } from 'vitest'

import { DEFAULT_FREE_SCALAR_CONFIG, type FreeScalarConfig } from '@/lib/geometry/extended/types'
import { composeFsfSaveMetadata } from '@/rendering/webgpu/passes/fsfStateIO'

describe('composeFsfSaveMetadata', () => {
  it('serializes the sanitized free-scalar grid used by compute shaders', () => {
    const metadata = composeFsfSaveMetadata({
      freeScalar: {
        ...DEFAULT_FREE_SCALAR_CONFIG,
        initialCondition: 'singleMode',
        latticeDim: 3,
        gridSize: [48, 48, 48],
      },
      simEta: 0,
      preheatingReferenceEta: 0,
      preheatingTime: 0,
    })

    const savedConfig = metadata.config.freeScalar as FreeScalarConfig
    expect(metadata.gridSize).toEqual([64, 64, 64])
    expect(savedConfig.gridSize).toEqual([64, 64, 64])
  })
})
