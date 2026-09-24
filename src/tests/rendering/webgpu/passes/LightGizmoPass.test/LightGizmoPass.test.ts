/**
 * LightGizmoPass must clear its output even when it has nothing to draw.
 *
 * Regression: execute() returned before beginning its render pass whenever
 * the light list was empty (MIN_LIGHTS is 0), yet DebugOverlayPass keeps
 * compositing the gizmo texture while gizmos are shown — the last removed
 * light's gizmo stayed frozen on screen.
 *
 * @module tests/rendering/webgpu/passes/LightGizmoPass
 */

import { describe, expect, it } from 'vitest'

import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { LightGizmoPass } from '@/rendering/webgpu/passes/LightGizmoPass'

interface RecordedPass {
  label: string | undefined
  loadOp: GPULoadOp | undefined
  draws: number[]
}

function primePass(): LightGizmoPass {
  const pass = new LightGizmoPass({ outputResource: 'gizmo-texture' })
  const internals = pass as unknown as Record<string, unknown>
  internals['device'] = { queue: { writeBuffer: () => undefined } } as unknown as GPUDevice
  internals['renderPipeline'] = {} as GPURenderPipeline
  internals['uniformBuffer'] = {} as GPUBuffer
  internals['vertexBuffer'] = {} as GPUBuffer
  internals['bindGroup'] = {} as GPUBindGroup
  return pass
}

function makeContext(lights: unknown[], passes: RecordedPass[]): WebGPURenderContext {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  return {
    frame: {
      stores: {
        lighting: { showLightGizmos: true, lights, selectedLightId: null },
        camera: {
          position: [0, 3, 8],
          viewProjectionMatrix: { elements: identity },
          inverseViewMatrix: { elements: identity },
        },
      },
    },
    getWriteTarget: () => ({}) as GPUTextureView,
    beginRenderPass: (desc: GPURenderPassDescriptor) => {
      const attachment = [...desc.colorAttachments][0]
      const record: RecordedPass = { label: desc.label, loadOp: attachment?.loadOp, draws: [] }
      passes.push(record)
      return {
        setPipeline: () => undefined,
        setBindGroup: () => undefined,
        setVertexBuffer: () => undefined,
        draw: (count: number) => record.draws.push(count),
        end: () => undefined,
      } as unknown as GPURenderPassEncoder
    },
  } as unknown as WebGPURenderContext
}

const pointLight = {
  id: 'light-1',
  type: 'point',
  enabled: true,
  color: '#ffffff',
  position: [1, 2, 3],
  rotation: [0, 0, 0],
  range: 0,
  coneAngle: 30,
}

describe('LightGizmoPass output clearing', () => {
  it('draws the gizmo lines while a light exists', () => {
    const passes: RecordedPass[] = []
    primePass().execute(makeContext([pointLight], passes))
    expect(passes).toHaveLength(1)
    expect(passes[0]!.loadOp).toBe('clear')
    expect(passes[0]!.draws).toHaveLength(1)
    expect(passes[0]!.draws[0]! % 2).toBe(0)
    expect(passes[0]!.draws[0]!).toBeGreaterThan(0)
  })

  it('still clears the output (without drawing) once every light is removed', () => {
    const pass = primePass()
    const passes: RecordedPass[] = []
    pass.execute(makeContext([pointLight], passes))
    pass.execute(makeContext([], passes))
    expect(passes).toHaveLength(2)
    expect(passes[1]!.loadOp).toBe('clear')
    expect(passes[1]!.draws).toEqual([])
  })
})
