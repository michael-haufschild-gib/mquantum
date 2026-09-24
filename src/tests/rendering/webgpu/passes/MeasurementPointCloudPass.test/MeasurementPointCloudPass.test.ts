/**
 * MeasurementPointCloudPass — dots must sit on the rendered density.
 *
 * Regressions:
 *  - positions (object-local lattice coordinates) were projected with the
 *    camera VP only, ignoring the volume's modelMatrix = uniformScale·I + p,
 *    so a scene preset with a non-default object scale/offset moved the
 *    density but not the measurement dots;
 *  - billboard offsets were applied in NDC without aspect correction, so the
 *    dots were drawn as width/height-stretched ellipses.
 *
 * @module tests/rendering/webgpu/passes/MeasurementPointCloudPass
 */

import { describe, expect, it } from 'vitest'

import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { MeasurementPointCloudPass } from '@/rendering/webgpu/passes/MeasurementPointCloudPass'
import { measurementPointCloudVertex } from '@/rendering/webgpu/shaders/measurement/pointCloud.wgsl'

interface Upload {
  buffer: unknown
  data: Float32Array
}

function run(transform: { uniformScale?: number; position?: number[] } | undefined) {
  const pass = new MeasurementPointCloudPass()
  const positionBuffer = { id: 'positions' }
  const uniformBuffer = { id: 'uniforms' }
  const internals = pass as unknown as Record<string, unknown>
  internals['renderPipeline'] = {}
  internals['bindGroup'] = {}
  internals['positionBuffer'] = positionBuffer
  internals['uniformBuffer'] = uniformBuffer

  const uploads: Upload[] = []
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  const ctx = {
    size: { width: 1600, height: 900 },
    device: {
      queue: {
        writeBuffer: (buffer: unknown, _o: number, data: Float32Array) => {
          uploads.push({ buffer, data: new Float32Array(data) })
        },
      },
    },
    frame: {
      stores: {
        measurement: {
          enabled: true,
          measurements: [{ position: [1, -2, 0.5] }, { position: [0.25, 0, -1] }],
        },
        camera: { viewProjectionMatrix: { elements: identity } },
        transform,
      },
    },
    getResource: () => ({ view: {} }),
    beginRenderPass: () => ({
      setPipeline: () => undefined,
      setBindGroup: () => undefined,
      draw: () => undefined,
      end: () => undefined,
    }),
  } as unknown as WebGPURenderContext

  pass.execute(ctx)
  const positions = uploads.find((u) => u.buffer === positionBuffer)!.data
  const uniforms = uploads.find((u) => u.buffer === uniformBuffer)!.data
  return { positions, uniforms }
}

describe('MeasurementPointCloudPass', () => {
  it('applies the object transform used by the volume (scale·p + offset)', () => {
    const { positions } = run({ uniformScale: 2, position: [0.5, 0, -1] })
    expect(Array.from(positions.subarray(0, 3))).toEqual([2.5, -4, 0])
    expect(Array.from(positions.subarray(4, 7))).toEqual([1, 0, -3])
  })

  it('leaves positions unchanged for the default transform', () => {
    const { positions } = run(undefined)
    expect(Array.from(positions.subarray(0, 3))).toEqual([1, -2, 0.5])
  })

  it('uploads the render-target aspect ratio and divides the x offset by it', () => {
    const { uniforms } = run(undefined)
    expect(uniforms[19]).toBeCloseTo(1600 / 900, 6)
    expect(measurementPointCloudVertex).toContain('aspect: f32')
    expect(measurementPointCloudVertex).toContain('vec2f(1.0 / max(uni.aspect, 1e-4), 1.0)')
  })
})
