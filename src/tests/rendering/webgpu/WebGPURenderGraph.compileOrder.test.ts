import { describe, expect, it } from 'vitest'

import type { WebGPURenderPass } from '@/rendering/webgpu/core/types'
import { createMockPass } from '@/tests/factories'

describe('WebGPURenderGraph compile ordering', () => {
  it('sanitizes invalid render sizes at the graph boundary', async () => {
    const { WebGPURenderGraph } = await import('@/rendering/webgpu/graph/WebGPURenderGraph')
    const graph = new WebGPURenderGraph()

    graph.setSize(0, Number.POSITIVE_INFINITY)

    expect(graph.getWidth()).toBe(1)
    expect(graph.getHeight()).toBe(1)
  })

  it('keeps producer passes before dependent consumers even with conflicting priorities', async () => {
    const { WebGPURenderGraph } = await import('@/rendering/webgpu/graph/WebGPURenderGraph')
    const graph = new WebGPURenderGraph()
    const graphInternals = graph as unknown as {
      passes: Map<string, WebGPURenderPass>
      passOrder: string[]
      compiled: boolean
    }

    const tonemap = createMockPass({
      id: 'tonemap',
      priority: 900,
      inputs: [{ resourceId: 'hdr-color', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'ldr-color', access: 'write', binding: 0 }],
    })
    const paper = createMockPass({
      id: 'paper-texture',
      priority: 195,
      inputs: [{ resourceId: 'ldr-color', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'paper-output', access: 'write', binding: 0 }],
    })
    const toScreen = createMockPass({
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
    const { WebGPURenderGraph } = await import('@/rendering/webgpu/graph/WebGPURenderGraph')
    const graph = new WebGPURenderGraph()
    const graphInternals = graph as unknown as {
      passes: Map<string, WebGPURenderPass>
      passOrder: string[]
      compiled: boolean
    }

    const highPriority = createMockPass({
      id: 'priority-100',
      priority: 100,
      inputs: [],
      outputs: [{ resourceId: 'a', access: 'write', binding: 0 }],
    })
    const lowPriority = createMockPass({
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

  it('keeps in-place overlay passes after the scene producer they read', async () => {
    const { WebGPURenderGraph } = await import('@/rendering/webgpu/graph/WebGPURenderGraph')
    const graph = new WebGPURenderGraph()
    const graphInternals = graph as unknown as {
      passes: Map<string, WebGPURenderPass>
      passOrder: string[]
      compiled: boolean
    }

    const scene = createMockPass({
      id: 'scene',
      priority: 100,
      inputs: [],
      outputs: [{ resourceId: 'scene-render', access: 'write', binding: 0 }],
    })
    const measurementOverlay = createMockPass({
      id: 'measurement-point-cloud',
      priority: 0,
      inputs: [{ resourceId: 'scene-render', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'scene-render', access: 'write', binding: 0 }],
    })
    const composite = createMockPass({
      id: 'environment-composite',
      priority: 200,
      inputs: [{ resourceId: 'scene-render', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'hdr-color', access: 'write', binding: 0 }],
    })

    graphInternals.passes = new Map([
      [measurementOverlay.id, measurementOverlay],
      [composite.id, composite],
      [scene.id, scene],
    ])
    graphInternals.compiled = false

    graph.compile()

    expect(graphInternals.passOrder.indexOf('scene')).toBeLessThan(
      graphInternals.passOrder.indexOf('measurement-point-cloud')
    )
    expect(graphInternals.passOrder.indexOf('measurement-point-cloud')).toBeLessThan(
      graphInternals.passOrder.indexOf('environment-composite')
    )
  })
})
