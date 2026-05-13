import { describe, expect, it, vi } from 'vitest'

import type { WebGPURenderPass } from '@/rendering/webgpu/core/types'
import { WebGPUResourcePool } from '@/rendering/webgpu/core/WebGPUResourcePool'
import { handleDisabledPassthrough } from '@/rendering/webgpu/graph/disabledPassthrough'
import { createMockCommandEncoder, mockWebGPU } from '@/tests/__mocks__/webgpu'

function makePass(
  id: string,
  inputId: string,
  outputId: string,
  skipPassthrough = false
): WebGPURenderPass {
  return {
    id,
    config: {
      id,
      inputs: [{ resourceId: inputId, access: 'read', binding: 0 }],
      outputs: [{ resourceId: outputId, access: 'write', binding: 0 }],
      skipPassthrough,
    },
    initialize: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn(),
    dispose: vi.fn(),
  }
}

describe('handleDisabledPassthrough', () => {
  it('copies from resolved alias source when disabled passes form a chain', () => {
    const pool = new WebGPUResourcePool()
    pool.initialize(mockWebGPU.device)
    pool.setSize(16, 16)

    for (const id of ['a', 'b', 'c']) {
      pool.addResource({
        id,
        type: 'renderTarget',
        size: { mode: 'fixed', width: 16, height: 16 },
        format: 'rgba8unorm',
      })
    }

    const sourceTexture = pool.getTexture('a')
    const staleIntermediateTexture = pool.getTexture('b')
    const outputTexture = pool.getTexture('c')
    expect(sourceTexture).not.toBe(staleIntermediateTexture)

    const resourceAliases = new Map<string, string>([['b', 'a']])
    const encoder = createMockCommandEncoder()
    const passTimings = new Map<string, number>()

    handleDisabledPassthrough(
      pool,
      resourceAliases,
      makePass('disabled-copy', 'b', 'c'),
      'disabled-copy',
      encoder,
      passTimings,
      new Set(),
      false
    )

    expect(encoder.copyTextureToTexture).toHaveBeenCalledWith(
      { texture: sourceTexture },
      { texture: outputTexture },
      { width: 16, height: 16 }
    )
    expect(encoder.copyTextureToTexture).not.toHaveBeenCalledWith(
      { texture: staleIntermediateTexture },
      { texture: outputTexture },
      { width: 16, height: 16 }
    )
    expect(resourceAliases.has('c')).toBe(false)
    expect(passTimings.get('disabled-copy')).toBe(0)
  })

  it('flattens explicit skip passthrough aliases through existing chains', () => {
    const pool = new WebGPUResourcePool()
    const resourceAliases = new Map<string, string>([
      ['b', 'a'],
      ['a', 'source'],
    ])

    handleDisabledPassthrough(
      pool,
      resourceAliases,
      makePass('disabled-skip', 'b', 'c', true),
      'disabled-skip',
      createMockCommandEncoder(),
      new Map(),
      new Set(),
      false
    )

    expect(resourceAliases.get('c')).toBe('source')
  })
})
