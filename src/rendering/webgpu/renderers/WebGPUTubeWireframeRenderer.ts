/**
 * WebGPU Tube Wireframe Renderer
 *
 * Renders N-dimensional tube wireframes using instanced cylinder geometry.
 * Port of WebGL TubeWireframe to WebGPU.
 *
 * @module rendering/webgpu/renderers/WebGPUTubeWireframeRenderer
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'
import {
  composeTubeWireframeVertexShader,
  composeTubeWireframeFragmentShader,
  type TubeWireframeWGSLShaderConfig,
} from '../shaders/tubewireframe'

/**
 * Tube wireframe renderer configuration.
 */
export interface TubeWireframeRendererConfig {
  /** Dimension of the object (3-11) */
  dimension?: number
  /** Tube radius */
  radius?: number
  /** Number of cylinder segments */
  cylinderSegments?: number
  /** Enable PBR lighting */
  pbr?: boolean
  /** Enable shadows */
  shadows?: boolean
}

/**
 * WebGPU Tube Wireframe Renderer.
 *
 * Renders N-dimensional tube wireframes using instanced cylinder geometry.
 * Each tube connects two N-D vertices and is rendered as a cylinder.
 */
export class WebGPUTubeWireframeRenderer extends WebGPUBasePass {
  private rendererConfig: TubeWireframeRendererConfig
  private shaderConfig: TubeWireframeWGSLShaderConfig

  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Bind groups
  private cameraBindGroup: GPUBindGroup | null = null
  private tubeBindGroup: GPUBindGroup | null = null

  // Uniform buffers
  private cameraUniformBuffer: GPUBuffer | null = null
  private tubeUniformBuffer: GPUBuffer | null = null

  // Geometry buffers
  private cylinderVertexBuffer: GPUBuffer | null = null
  private cylinderIndexBuffer: GPUBuffer | null = null
  private cylinderIndexCount = 0
  private instanceBuffer: GPUBuffer | null = null
  private instanceCount = 0

  // Cylinder segments
  private cylinderSegments: number

  constructor(config?: TubeWireframeRendererConfig) {
    super({
      id: 'tube-wireframe',
      priority: 100,
      inputs: [],
      outputs: [
        { resourceId: 'hdr-color', access: 'write' as const, binding: 0 },
        { resourceId: 'depth-buffer', access: 'write' as const, binding: 1 },
      ],
    })

    this.rendererConfig = {
      dimension: 4,
      radius: 0.02,
      cylinderSegments: 8,
      pbr: true,
      shadows: false,
      ...config,
    }

    this.cylinderSegments = this.rendererConfig.cylinderSegments ?? 8

    this.shaderConfig = {
      shadows: this.rendererConfig.shadows,
      pbr: this.rendererConfig.pbr,
    }
  }

  /**
   * Create the rendering pipeline.
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Create bind group layouts
    const cameraBindGroupLayout = device.createBindGroupLayout({
      label: 'tubewireframe-camera-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const },
        },
      ],
    })

    const tubeBindGroupLayout = device.createBindGroupLayout({
      label: 'tubewireframe-object-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const },
        },
      ],
    })

    // Create pipeline layout
    const pipelineLayout = device.createPipelineLayout({
      label: 'tubewireframe-pipeline-layout',
      bindGroupLayouts: [
        cameraBindGroupLayout,
        cameraBindGroupLayout, // placeholder for lighting (group 1)
        cameraBindGroupLayout, // placeholder for material (group 2)
        cameraBindGroupLayout, // placeholder for quality (group 3)
        tubeBindGroupLayout, // tube uniforms (group 4)
      ],
    })

    // Compile shaders
    const vertexShader = composeTubeWireframeVertexShader(this.shaderConfig)
    const { wgsl: fragmentShader } = composeTubeWireframeFragmentShader(this.shaderConfig)

    const vertexModule = this.createShaderModule(device, vertexShader, 'tubewireframe-vertex')
    const fragmentModule = this.createShaderModule(device, fragmentShader, 'tubewireframe-fragment')

    // Create render pipeline
    this.renderPipeline = device.createRenderPipeline({
      label: 'tubewireframe-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: vertexModule,
        entryPoint: 'main',
        buffers: [
          // Cylinder geometry (per-vertex)
          {
            arrayStride: 24, // 3 floats position + 3 floats normal
            stepMode: 'vertex' as const,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' as const }, // position
              { shaderLocation: 1, offset: 12, format: 'float32x3' as const }, // normal
            ],
          },
          // Instance attributes (per-instance)
          {
            arrayStride: 112, // 28 floats * 4 bytes
            stepMode: 'instance' as const,
            attributes: [
              { shaderLocation: 2, offset: 0, format: 'float32x3' as const }, // instanceStart
              { shaderLocation: 3, offset: 12, format: 'float32x3' as const }, // instanceEnd
              { shaderLocation: 4, offset: 24, format: 'float32x4' as const }, // instanceStartExtraA
              { shaderLocation: 5, offset: 40, format: 'float32x4' as const }, // instanceStartExtraB
              { shaderLocation: 6, offset: 56, format: 'float32x4' as const }, // instanceEndExtraA
              { shaderLocation: 7, offset: 72, format: 'float32x4' as const }, // instanceEndExtraB
              // Padding to 112 bytes (28 floats) for alignment - remaining 24 bytes unused
            ],
          },
        ],
      },
      fragment: {
        module: fragmentModule,
        entryPoint: 'fragmentMain',
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-list' as const,
        cullMode: 'back' as const,
      },
      depthStencil: {
        format: 'depth32float',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    })

    // Create uniform buffers
    this.cameraUniformBuffer = this.createUniformBuffer(device, 256, 'tubewireframe-camera')
    this.tubeUniformBuffer = this.createUniformBuffer(device, 512, 'tubewireframe-uniforms')

    // Create bind groups
    this.cameraBindGroup = device.createBindGroup({
      label: 'tubewireframe-camera-bg',
      layout: cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraUniformBuffer } }],
    })

    this.tubeBindGroup = device.createBindGroup({
      label: 'tubewireframe-object-bg',
      layout: tubeBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.tubeUniformBuffer } }],
    })

    // Create cylinder geometry
    this.createCylinderGeometry(device, this.cylinderSegments)
  }

  /**
   * Create cylinder geometry for tube rendering.
   */
  private createCylinderGeometry(device: GPUDevice, segments: number): void {
    // Create a unit cylinder (height 1, radius 1, centered at origin)
    const vertexCount = (segments + 1) * 2 // Top and bottom rings
    const vertices = new Float32Array(vertexCount * 6) // position + normal
    const indices: number[] = []

    // Generate vertices for top and bottom rings
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      const x = Math.cos(angle)
      const z = Math.sin(angle)

      // Bottom ring (y = -0.5)
      const bottomIndex = i * 6
      vertices[bottomIndex + 0] = x // position.x
      vertices[bottomIndex + 1] = -0.5 // position.y
      vertices[bottomIndex + 2] = z // position.z
      vertices[bottomIndex + 3] = x // normal.x
      vertices[bottomIndex + 4] = 0 // normal.y
      vertices[bottomIndex + 5] = z // normal.z

      // Top ring (y = 0.5)
      const topIndex = (segments + 1 + i) * 6
      vertices[topIndex + 0] = x // position.x
      vertices[topIndex + 1] = 0.5 // position.y
      vertices[topIndex + 2] = z // position.z
      vertices[topIndex + 3] = x // normal.x
      vertices[topIndex + 4] = 0 // normal.y
      vertices[topIndex + 5] = z // normal.z
    }

    // Generate indices for the cylinder sides
    for (let i = 0; i < segments; i++) {
      const bottomLeft = i
      const bottomRight = i + 1
      const topLeft = segments + 1 + i
      const topRight = segments + 1 + i + 1

      // Two triangles per segment
      indices.push(bottomLeft, topLeft, bottomRight)
      indices.push(bottomRight, topLeft, topRight)
    }

    const indexArray = new Uint16Array(indices)

    // Create vertex buffer
    this.cylinderVertexBuffer = device.createBuffer({
      label: 'tubewireframe-cylinder-vertices',
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(
      this.cylinderVertexBuffer,
      0,
      vertices.buffer as ArrayBuffer,
      vertices.byteOffset,
      vertices.byteLength
    )

    // Create index buffer
    this.cylinderIndexBuffer = device.createBuffer({
      label: 'tubewireframe-cylinder-indices',
      size: indexArray.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(
      this.cylinderIndexBuffer,
      0,
      indexArray.buffer as ArrayBuffer,
      indexArray.byteOffset,
      indexArray.byteLength
    )
    this.cylinderIndexCount = indices.length
  }

  /**
   * Set the dimension of the object.
   */
  setDimension(dimension: number): void {
    this.rendererConfig.dimension = dimension
  }

  /**
   * Set the tube radius.
   */
  setRadius(radius: number): void {
    this.rendererConfig.radius = radius
  }

  /**
   * Update tube instances (edges).
   * Each edge is defined by two N-D vertices.
   */
  updateInstances(
    device: GPUDevice,
    edges: Array<{
      start: {
        x: number
        y: number
        z: number
        extraA?: [number, number, number, number]
        extraB?: [number, number, number, number]
      }
      end: {
        x: number
        y: number
        z: number
        extraA?: [number, number, number, number]
        extraB?: [number, number, number, number]
      }
    }>
  ): void {
    if (edges.length === 0) {
      this.instanceCount = 0
      return
    }

    // Clean up old buffer
    if (this.instanceBuffer) {
      this.instanceBuffer.destroy()
    }

    // Pack instance data: 28 floats per instance
    // start (3) + end (3) + startExtraA (4) + startExtraB (4) + endExtraA (4) + endExtraB (4) + padding (6) = 28
    const instanceData = new Float32Array(edges.length * 28)

    edges.forEach((edge, i) => {
      const offset = i * 28

      // Start position
      instanceData[offset + 0] = edge.start.x
      instanceData[offset + 1] = edge.start.y
      instanceData[offset + 2] = edge.start.z

      // End position
      instanceData[offset + 3] = edge.end.x
      instanceData[offset + 4] = edge.end.y
      instanceData[offset + 5] = edge.end.z

      // Start extra dimensions
      const startExtraA = edge.start.extraA ?? [0, 0, 0, 0]
      instanceData[offset + 6] = startExtraA[0]
      instanceData[offset + 7] = startExtraA[1]
      instanceData[offset + 8] = startExtraA[2]
      instanceData[offset + 9] = startExtraA[3]

      const startExtraB = edge.start.extraB ?? [0, 0, 0, 0]
      instanceData[offset + 10] = startExtraB[0]
      instanceData[offset + 11] = startExtraB[1]
      instanceData[offset + 12] = startExtraB[2]
      instanceData[offset + 13] = startExtraB[3]

      // End extra dimensions
      const endExtraA = edge.end.extraA ?? [0, 0, 0, 0]
      instanceData[offset + 14] = endExtraA[0]
      instanceData[offset + 15] = endExtraA[1]
      instanceData[offset + 16] = endExtraA[2]
      instanceData[offset + 17] = endExtraA[3]

      const endExtraB = edge.end.extraB ?? [0, 0, 0, 0]
      instanceData[offset + 18] = endExtraB[0]
      instanceData[offset + 19] = endExtraB[1]
      instanceData[offset + 20] = endExtraB[2]
      instanceData[offset + 21] = endExtraB[3]

      // Padding (6 floats to reach 28)
      // instanceData[offset + 22] through [offset + 27] remain 0
    })

    // Create new instance buffer
    this.instanceBuffer = device.createBuffer({
      label: 'tubewireframe-instances',
      size: instanceData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(
      this.instanceBuffer,
      0,
      instanceData.buffer as ArrayBuffer,
      instanceData.byteOffset,
      instanceData.byteLength
    )
    this.instanceCount = edges.length
  }

  /**
   * Update camera uniforms.
   */
  private updateCameraUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.cameraUniformBuffer) return

    // Get camera data from stores
    const camera = ctx.frame?.stores?.['camera'] as {
      viewMatrix?: { elements: number[] }
      projectionMatrix?: { elements: number[] }
      viewProjectionMatrix?: { elements: number[] }
      position?: { x: number; y: number; z: number }
      near?: number
      far?: number
      fov?: number
    }
    if (!camera) return

    // Pack camera uniforms
    const data = new Float32Array(64)

    if (camera.viewMatrix) {
      data.set(camera.viewMatrix.elements, 0)
    }
    if (camera.projectionMatrix) {
      data.set(camera.projectionMatrix.elements, 16)
    }
    if (camera.viewProjectionMatrix) {
      data.set(camera.viewProjectionMatrix.elements, 32)
    }
    if (camera.position) {
      data[48] = camera.position.x
      data[49] = camera.position.y
      data[50] = camera.position.z
    }
    data[51] = camera.near ?? 0.1
    data[52] = camera.far ?? 1000
    data[53] = camera.fov ?? 50
    data[54] = ctx.size.width
    data[55] = ctx.size.height
    data[56] = ctx.size.width / ctx.size.height
    data[57] = ctx.frame?.time ?? 0
    data[58] = ctx.frame?.delta ?? 0.016
    data[59] = ctx.frame?.frameNumber ?? 0

    this.writeUniformBuffer(this.device, this.cameraUniformBuffer, data)
  }

  /**
   * Update tube uniforms.
   */
  updateTubeUniforms(
    uniforms: {
      rotationMatrix4D?: number[]
      extraRotationCols?: number[]
      depthRowSums?: number[]
      baseColor?: [number, number, number]
      opacity?: number
      roughness?: number
      metalness?: number
      ambientIntensity?: number
      emissiveIntensity?: number
    } = {}
  ): void {
    if (!this.device || !this.tubeUniformBuffer) return

    // Tube uniform layout (must match TubeWireframeUniforms struct)
    const data = new Float32Array(128) // 512 bytes

    // rotationMatrix4D (16 floats, offset 0)
    if (uniforms.rotationMatrix4D) {
      for (let i = 0; i < 16 && i < uniforms.rotationMatrix4D.length; i++) {
        const value = uniforms.rotationMatrix4D[i]
        if (value !== undefined) data[i] = value
      }
    } else {
      // Identity matrix
      data[0] = 1
      data[5] = 1
      data[10] = 1
      data[15] = 1
    }

    // dimension, uniformScale, projectionDistance, depthNormFactor (offset 16)
    const dimension = this.rendererConfig.dimension ?? 4
    data[16] = dimension
    data[17] = 1.0 // uniformScale
    data[18] = 5.0 // projectionDistance (default)
    data[19] = dimension > 4 ? Math.sqrt(dimension - 3) : 1.0 // depthNormFactor

    // radius + padding (offset 20)
    data[20] = this.rendererConfig.radius ?? 0.02
    data[21] = 0
    data[22] = 0
    data[23] = 0

    // baseColor + opacity (offset 24)
    const baseColor = uniforms.baseColor ?? [1.0, 1.0, 1.0]
    data[24] = baseColor[0]
    data[25] = baseColor[1]
    data[26] = baseColor[2]
    data[27] = uniforms.opacity ?? 1.0

    // extraRotCols (7 * 4 = 28 floats, offset 28)
    if (uniforms.extraRotationCols) {
      for (let i = 0; i < 28 && i < uniforms.extraRotationCols.length; i++) {
        const value = uniforms.extraRotationCols[i]
        if (value !== undefined) data[28 + i] = value
      }
    }

    // depthRowSums (12 floats for alignment, offset 56)
    if (uniforms.depthRowSums) {
      for (let i = 0; i < 11 && i < uniforms.depthRowSums.length; i++) {
        const value = uniforms.depthRowSums[i]
        if (value !== undefined) data[56 + i] = value
      }
    }

    // PBR (offset 68)
    data[68] = uniforms.roughness ?? 0.5
    data[69] = uniforms.metalness ?? 0.0
    data[70] = uniforms.ambientIntensity ?? 0.3
    data[71] = uniforms.emissiveIntensity ?? 0.0

    this.writeUniformBuffer(this.device, this.tubeUniformBuffer, data)
  }

  /**
   * Execute the render pass.
   */
  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.renderPipeline ||
      !this.cylinderVertexBuffer ||
      !this.cylinderIndexBuffer ||
      !this.cameraBindGroup ||
      !this.tubeBindGroup ||
      !this.instanceBuffer ||
      this.instanceCount === 0
    ) {
      return
    }

    // Update uniforms
    this.updateCameraUniforms(ctx)

    // Get render targets
    const colorView = ctx.getWriteTarget('hdr-color')
    const depthView = ctx.getWriteTarget('depth-buffer')

    if (!colorView || !depthView) return

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'tubewireframe-render',
      colorAttachments: [
        {
          view: colorView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
      depthStencilAttachment: {
        view: depthView,
        depthLoadOp: 'clear' as const,
        depthStoreOp: 'store' as const,
        depthClearValue: 1.0,
      },
    })

    passEncoder.setPipeline(this.renderPipeline)
    passEncoder.setBindGroup(0, this.cameraBindGroup)
    passEncoder.setBindGroup(1, this.cameraBindGroup) // placeholder
    passEncoder.setBindGroup(2, this.cameraBindGroup) // placeholder
    passEncoder.setBindGroup(3, this.cameraBindGroup) // placeholder
    passEncoder.setBindGroup(4, this.tubeBindGroup)

    passEncoder.setVertexBuffer(0, this.cylinderVertexBuffer)
    passEncoder.setVertexBuffer(1, this.instanceBuffer)
    passEncoder.setIndexBuffer(this.cylinderIndexBuffer, 'uint16' as const)

    // Draw instanced cylinders
    passEncoder.drawIndexed(this.cylinderIndexCount, this.instanceCount)

    passEncoder.end()
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.renderPipeline = null
    this.cameraBindGroup = null
    this.tubeBindGroup = null

    this.cameraUniformBuffer?.destroy()
    this.tubeUniformBuffer?.destroy()
    this.cylinderVertexBuffer?.destroy()
    this.cylinderIndexBuffer?.destroy()
    this.instanceBuffer?.destroy()

    this.cameraUniformBuffer = null
    this.tubeUniformBuffer = null
    this.cylinderVertexBuffer = null
    this.cylinderIndexBuffer = null
    this.instanceBuffer = null

    super.dispose()
  }
}
