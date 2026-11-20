import { detectorChart, horizonPhases } from '@/lib/physics/modularHorizon'
import { DISPLAY_RADIUS } from '@/lib/physics/modularHorizon/exterior'

import type { WebGPURenderContext, WebGPUSetupContext } from '../../../core/types'
import type { SchroedingerWGSLShaderConfig } from '../../../shaders/schroedinger/compose'
import { CAMERA_UNIFORMS_LAYOUT } from '../../cameraLayout'
import { type ExtendedStoreSnapshot, getStoreSnapshot } from '../../schrodingerRendererTypes'
import type { ModeFrameContext, ModeSetupResult, QuantumModeStrategy } from '../types'
import { horizonProjection } from './picking'

const SIZE = 512

/** Owns the cusp atlas and rotates the angular chart or exterior volume with the scene. */
export class ModularHorizonStrategy implements QuantumModeStrategy {
  readonly isComputeMode = false
  private texture?: GPUTexture
  private uniform?: GPUBuffer
  private pending?: AbortController
  private data = new Float32Array(32)
  private pin?: [number, number]
  configureShader(shader: SchroedingerWGSLShaderConfig) {
    shader.isModularHorizon = true
  }
  computeBoundingRadius() {
    return DISPLAY_RADIUS
  }
  setup({ device }: WebGPUSetupContext): ModeSetupResult {
    this.dispose()
    const texture = device.createTexture({
      label: 'horizon basis and second moments',
      size: [SIZE, SIZE, 3],
      format: 'rgba16float',
      mipLevelCount: 10,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    })
    this.texture = texture
    const sampler = device.createSampler({
      label: 'modular horizon atlas sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      maxAnisotropy: 4,
    })
    const uniform = device.createBuffer({
      label: 'horizon parameters',
      size: this.data.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.uniform = uniform
    const entries = [
      { binding: 2, resource: texture.createView({ dimension: '2d-array' }) },
      { binding: 3, resource: sampler },
      { binding: 4, resource: { buffer: uniform } },
    ]
    const controller = new AbortController()
    this.pending = controller
    const load = async () => {
      const response = await fetch(import.meta.env.BASE_URL + 'data/modular-horizon/basis.atlas', {
        signal: controller.signal,
      })
      if (!response.ok || !response.body) throw new Error('Could not load modular horizon basis')
      const bytes = await new Response(
        response.body.pipeThrough(new DecompressionStream('gzip'))
      ).arrayBuffer()
      if (controller.signal.aborted) return
      let offset = 0
      for (let level = 0; level < 10; level++) {
        const n = SIZE >> level
        device.queue.writeTexture(
          { texture, mipLevel: level },
          bytes,
          { offset, bytesPerRow: 8 * n, rowsPerImage: n },
          [n, n, 3]
        )
        offset += n * n * 24
      }
    }
    return {
      initPromises: [
        load().catch((err: unknown) => {
          if (!controller.signal.aborted) throw err
        }),
      ],
      additionalLayoutEntries: [
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { viewDimension: '2d-array' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' },
        },
      ],
      getBindGroupEntries: () => entries,
    }
  }
  executeFrame(ctx: WebGPURenderContext, shared: ModeFrameContext) {
    const state = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')?.schroedinger
    const cfg = state?.modularHorizon
    if (!cfg || !this.uniform) return
    const data = this.data
    if (this.pin !== cfg.pin) {
      const chart = detectorChart(cfg.pin)
      data[4] = chart.x
      data[5] = chart.y
      data.set(chart.matrix, 8)
      this.pin = cfg.pin
    }
    const total = cfg.weights[0] + cfg.weights[1] + cfg.weights[2]
    const clock =
      getStoreSnapshot<{ accumulatedTime: number }>(ctx, 'animation')?.accumulatedTime ??
      ctx.frame?.time ??
      0
    const t = Math.max(0, clock * (state?.timeScale ?? 1))
    const phases = horizonPhases(cfg.weights, t)
    for (let j = 0; j < 3; j++) {
      const population = cfg.weights[j]! / total
      const amplitude = Math.sqrt(population)
      const k = (j + 1) % 3
      data[j] = population
      data[20 + j] = amplitude * Math.cos(phases[j]!)
      data[24 + j] = amplitude * Math.sin(phases[j]!)
      data[28 + j] =
        2 * amplitude * Math.sqrt(cfg.weights[k]! / total) * Math.cos(phases[j]! - phases[k]!)
      data[12 + j] = DISPLAY_RADIUS * shared.basisUniformData[j * 12]!
      data[16 + j] = DISPLAY_RADIUS * shared.basisUniformData[j * 12 + 1]!
    }
    if (shared.rendererConfig.dimension === 2 && shared.cameraUniformData) {
      // The chart is face-on in 2D. Keep its XY spin in the camera's right/up frame.
      const view = CAMERA_UNIFORMS_LAYOUT.index.inverseViewMatrix
      for (const axis of [12, 16]) {
        const right = data[axis]!,
          up = data[axis + 1]!
        for (let j = 0; j < 3; j++)
          data[axis + j] =
            right * shared.cameraUniformData[view + j]! +
            up * shared.cameraUniformData[view + 4 + j]!
      }
    } else {
      const tilt = -Math.PI / 3
      for (let j = 0; j < 3; j++) {
        const v = shared.basisUniformData[j * 12 + 1]!
        const n = shared.basisUniformData[j * 12 + 2]!
        data[16 + j] = DISPLAY_RADIUS * (v * Math.cos(tilt) + n * Math.sin(tilt))
      }
    }
    data[15] = Number(shared.rendererConfig.dimension !== 2)
    data[19] = cfg.probeRadius
    data[23] = Number(cfg.cutaway)
    data[27] = cfg.weights.findIndex((weight) => weight > 0)
    data[3] = cfg.raw ? Math.exp(-t) : 1
    data[6] = cfg.width
    data[7] = Number(cfg.tessellation)
    shared.device.queue.writeBuffer(this.uniform, 0, data)
    if (shared.cameraUniformData) {
      horizonProjection.camera = shared.cameraUniformData
      horizonProjection.axes = this.data
    }
  }
  dispose() {
    this.pending?.abort()
    this.texture?.destroy()
    this.uniform?.destroy()
    if (horizonProjection.axes === this.data) {
      horizonProjection.axes = undefined
      horizonProjection.camera = undefined
    }
    this.pin = undefined
  }
}
