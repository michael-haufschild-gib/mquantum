import { describe, expect, it, vi } from 'vitest'
import type { WebGPUFrameStats } from '@/rendering/webgpu/core/types'
import type { WebGPURenderGraph } from '@/rendering/webgpu/graph/WebGPURenderGraph'
import type { WebGPUStatsCollector } from '@/rendering/webgpu/WebGPUPerformanceCollector'

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

  if (!('GPUBufferUsage' in globalThis)) {
    ;(globalThis as unknown as { GPUBufferUsage: Record<string, number> }).GPUBufferUsage = {
      UNIFORM: 1 << 0,
      COPY_DST: 1 << 1,
      VERTEX: 1 << 2,
      INDEX: 1 << 3,
      STORAGE: 1 << 4,
      COPY_SRC: 1 << 5,
      QUERY_RESOLVE: 1 << 6,
      MAP_READ: 1 << 7,
    }
  }
}

describe('WebGPUScene frame metric collection', () => {
  it('executes graph and forwards frame metrics to the collector', async () => {
    ensureGPUConstants()

    const sceneModule = (await import('@/rendering/webgpu/WebGPUScene')) as unknown as Record<
      string,
      unknown
    >

    expect(typeof sceneModule['executeFrameAndCollectMetrics']).toBe('function')

    const executeFrameAndCollectMetrics = sceneModule['executeFrameAndCollectMetrics'] as (args: {
      graph: WebGPURenderGraph
      collector: WebGPUStatsCollector
      deltaTime: number
      size: { width: number; height: number }
      dpr: number
    }) => WebGPUFrameStats

    const frameStats: WebGPUFrameStats = {
      totalTimeMs: 16.67,
      passTiming: [],
      commandBufferCount: 1,
      vramUsage: 0,
      drawStats: {
        calls: 1,
        triangles: 2,
        vertices: 6,
        lines: 0,
        points: 0,
      },
    }

    const graph = {
      execute: vi.fn(() => frameStats),
    } as unknown as WebGPURenderGraph

    const collector = {
      recordFrame: vi.fn(),
    } as unknown as WebGPUStatsCollector

    const nowSpy = vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1018)

    const result = executeFrameAndCollectMetrics({
      graph,
      collector,
      deltaTime: 1 / 60,
      size: { width: 1920, height: 1080 },
      dpr: 1.5,
    })

    expect(result).toBe(frameStats)
    expect(graph.execute).toHaveBeenCalledWith(1 / 60)
    expect(collector.recordFrame).toHaveBeenCalledTimes(1)
    expect(collector.recordFrame).toHaveBeenCalledWith(
      18,
      frameStats,
      graph,
      { width: 1920, height: 1080 },
      1.5
    )

    nowSpy.mockRestore()
  })
})
