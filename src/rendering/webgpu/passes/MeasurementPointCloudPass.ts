/**
 * Measurement Point Cloud Render Pass
 *
 * Renders accumulated measurement positions as glowing billboard sprites.
 * Self-managed: reads measurement data and camera VP matrix from the
 * frame context stores each frame.
 *
 * @module rendering/webgpu/passes/MeasurementPointCloudPass
 */

import { logger } from '@/lib/logger'
import type { MeasurementRecord } from '@/stores/measurementStore'

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBasePass } from '../core/WebGPUBasePass'
import {
  measurementPointCloudFragment,
  measurementPointCloudVertex,
} from '../shaders/measurement/pointCloud.wgsl'

/** Maximum measurement points to render. */
const MAX_POINTS = 1000

/** Billboard size in clip space. */
const POINT_SIZE = 1.5

/** Overall opacity of measurement dots. */
const OPACITY = 0.8

/** Store snapshot shape for measurement state. */
interface MeasurementSnapshot {
  enabled: boolean
  measurements: MeasurementRecord[]
}

/** Store snapshot shape for camera state. */
interface CameraSnapshot {
  viewProjectionMatrix: { elements: Float32Array }
}

/**
 * Render pass for measurement point cloud visualization.
 * Uses additive blending to render glowing dots at measured positions.
 */
export class MeasurementPointCloudPass extends WebGPUBasePass {
  private renderPipeline: GPURenderPipeline | null = null
  private uniformBuffer: GPUBuffer | null = null
  private positionBuffer: GPUBuffer | null = null
  private bindGroup: GPUBindGroup | null = null
  private pointCount = 0

  // Pre-allocated upload buffer
  private readonly uploadData = new Float32Array(MAX_POINTS * 4) // vec4f per point (xyz + age)
  private readonly uniformData = new Float32Array(20) // mat4x4 + 4 scalars

  constructor() {
    super({
      id: 'measurement-point-cloud',
      inputs: [{ resourceId: 'scene-render', access: 'read' as const, binding: 0 }],
      outputs: [{ resourceId: 'scene-render', access: 'write' as const, binding: 0 }],
      enabled: (frame) => {
        const m = frame?.stores?.['measurement'] as MeasurementSnapshot | undefined
        return m?.enabled === true && (m?.measurements?.length ?? 0) > 0
      },
    })
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx
    logger.log('[MeasurementPointCloud] Setup')

    const vertModule = device.createShaderModule({
      label: 'measurement-pc-vert',
      code: measurementPointCloudVertex,
    })
    const fragModule = device.createShaderModule({
      label: 'measurement-pc-frag',
      code: measurementPointCloudFragment,
    })

    const bgl = device.createBindGroupLayout({
      label: 'measurement-pc-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    })

    this.renderPipeline = device.createRenderPipeline({
      label: 'measurement-pc-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
      vertex: { module: vertModule, entryPoint: 'main' },
      fragment: {
        module: fragModule,
        entryPoint: 'main',
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
            writeMask: GPUColorWrite.ALL,
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
      depthStencil: {
        format: 'depth32float',
        depthWriteEnabled: false,
        depthCompare: 'less',
      },
    })

    this.uniformBuffer = device.createBuffer({
      label: 'measurement-pc-uniform',
      size: 80, // mat4x4f (64) + 4 floats (16)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    this.positionBuffer = device.createBuffer({
      label: 'measurement-pc-positions',
      size: MAX_POINTS * 4 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    this.bindGroup = device.createBindGroup({
      layout: bgl,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.positionBuffer } },
      ],
    })
  }

  execute(ctx: WebGPURenderContext): void {
    if (!this.renderPipeline || !this.bindGroup) return

    // Read measurement state from frame context
    const mState = ctx.frame?.stores?.['measurement'] as MeasurementSnapshot | undefined
    if (!mState?.enabled || !mState.measurements.length) return

    // Read camera VP matrix from frame context
    const camera = ctx.frame?.stores?.['camera'] as CameraSnapshot | null
    if (!camera?.viewProjectionMatrix?.elements) return
    const vpMatrix = camera.viewProjectionMatrix.elements

    // Upload positions
    const positions = mState.measurements
    this.pointCount = Math.min(positions.length, MAX_POINTS)

    for (let i = 0; i < this.pointCount; i++) {
      const pos = positions[i]!.position
      const age = i / Math.max(this.pointCount - 1, 1)
      this.uploadData[i * 4] = pos[0] ?? 0
      this.uploadData[i * 4 + 1] = pos[1] ?? 0
      this.uploadData[i * 4 + 2] = pos[2] ?? 0
      this.uploadData[i * 4 + 3] = age
    }
    ctx.device.queue.writeBuffer(this.positionBuffer!, 0, this.uploadData, 0, this.pointCount * 4)

    // Pack uniforms
    this.uniformData.set(vpMatrix, 0)
    this.uniformData[16] = POINT_SIZE
    this.uniformData[17] = OPACITY
    new Uint32Array(this.uniformData.buffer)[18] = this.pointCount
    ctx.device.queue.writeBuffer(this.uniformBuffer!, 0, this.uniformData)

    // Begin render pass with depth attachment
    const outputResource = ctx.getResource('scene-render')
    if (!outputResource?.view) return

    const pass = ctx.beginRenderPass({
      label: 'measurement-point-cloud',
      colorAttachments: [
        {
          view: outputResource.view,
          loadOp: 'load' as const,
          storeOp: 'store' as const,
        },
      ],
      depthStencilAttachment: outputResource.depthView
        ? {
            view: outputResource.depthView,
            depthLoadOp: 'load' as const,
            depthStoreOp: 'store' as const,
          }
        : undefined,
    })

    pass.setPipeline(this.renderPipeline)
    pass.setBindGroup(0, this.bindGroup)
    pass.draw(this.pointCount * 6) // 6 vertices per billboard quad
    pass.end()
  }

  dispose(): void {
    this.uniformBuffer?.destroy()
    this.positionBuffer?.destroy()
    this.uniformBuffer = null
    this.positionBuffer = null
    this.renderPipeline = null
    this.bindGroup = null
  }
}
