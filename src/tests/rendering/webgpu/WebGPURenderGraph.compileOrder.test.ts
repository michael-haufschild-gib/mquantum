import { describe, expect, it, vi } from 'vitest'
import type { WebGPURenderPass, WebGPURenderPassConfig } from '@/rendering/webgpu/core/types'

function createPass(config: WebGPURenderPassConfig): WebGPURenderPass {
  return {
    id: config.id,
    config,
    initialize: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn(),
    dispose: vi.fn(),
  }
}

function ensureGPUConstants(): void {
  if (!('GPUTextureUsage' in globalThis)) {
    ;(globalThis as unknown as { GPUTextureUsage: Record<string, number> }).GPUTextureUsage = {
      TEXTURE_BINDING: 1 << 0,
      RENDER_ATTACHMENT: 1 << 1,
      COPY_SRC: 1 << 2,
      COPY_DST: 1 << 3,
      STORAGE_BINDING: 1 << 4,
    }
  }
}

describe('WebGPURenderGraph compile ordering', () => {
  it('keeps producer passes before dependent consumers even with conflicting priorities', async () => {
    ensureGPUConstants()
    const { WebGPURenderGraph } = await import('@/rendering/webgpu/graph/WebGPURenderGraph')
    const graph = new WebGPURenderGraph()
    const graphInternals = graph as unknown as {
      passes: Map<string, WebGPURenderPass>
      passOrder: string[]
      compiled: boolean
    }

    const tonemap = createPass({
      id: 'tonemap',
      priority: 900,
      inputs: [{ resourceId: 'hdr-color', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'ldr-color', access: 'write', binding: 0 }],
    })
    const paper = createPass({
      id: 'paper-texture',
      priority: 195,
      inputs: [{ resourceId: 'ldr-color', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'paper-output', access: 'write', binding: 0 }],
    })
    const toScreen = createPass({
      id: 'to-screen',
      priority: 1000,
      inputs: [{ resourceId: 'paper-output', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'screen', access: 'write', binding: 0 }],
    })

    graphInternals.passes = new Map([
      [paper.id, paper],
      [toScreen.id, toScreen],
      [tonemap.id, tonemap],
    ])
    graphInternals.compiled = false

    graph.compile()

    const tonemapIndex = graphInternals.passOrder.indexOf('tonemap')
    const paperIndex = graphInternals.passOrder.indexOf('paper-texture')
    const toScreenIndex = graphInternals.passOrder.indexOf('to-screen')

    expect(tonemapIndex).toBeGreaterThanOrEqual(0)
    expect(paperIndex).toBeGreaterThanOrEqual(0)
    expect(toScreenIndex).toBeGreaterThanOrEqual(0)
    expect(tonemapIndex).toBeLessThan(paperIndex)
    expect(paperIndex).toBeLessThan(toScreenIndex)
  })

  it('uses priority order for independent passes', async () => {
    ensureGPUConstants()
    const { WebGPURenderGraph } = await import('@/rendering/webgpu/graph/WebGPURenderGraph')
    const graph = new WebGPURenderGraph()
    const graphInternals = graph as unknown as {
      passes: Map<string, WebGPURenderPass>
      passOrder: string[]
      compiled: boolean
    }

    const highPriority = createPass({
      id: 'priority-100',
      priority: 100,
      inputs: [],
      outputs: [{ resourceId: 'a', access: 'write', binding: 0 }],
    })
    const lowPriority = createPass({
      id: 'priority-300',
      priority: 300,
      inputs: [],
      outputs: [{ resourceId: 'b', access: 'write', binding: 0 }],
    })

    graphInternals.passes = new Map([
      [lowPriority.id, lowPriority],
      [highPriority.id, highPriority],
    ])
    graphInternals.compiled = false

    graph.compile()

    expect(graphInternals.passOrder.indexOf('priority-100')).toBeLessThan(
      graphInternals.passOrder.indexOf('priority-300')
    )
  })
})
