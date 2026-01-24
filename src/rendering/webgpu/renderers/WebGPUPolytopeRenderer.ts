/**
 * WebGPU Polytope Renderer
 *
 * Renders N-dimensional polytopes with faces and edges.
 * Uses mesh-based rendering with N-D vertex transformations.
 *
 * @module rendering/webgpu/renderers/WebGPUPolytopeRenderer
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'
import {
  composeFaceVertexShader,
  composeFaceFragmentShader,
  composeEdgeVertexShader,
  composeEdgeFragmentShader,
  type PolytopeWGSLShaderConfig,
} from '../shaders/polytope'

/**
 * Polytope renderer configuration.
 */
export interface PolytopeRendererConfig {
  /** Dimension of the polytope (3-11) */
  dimension?: number
  /** Render faces */
  faces?: boolean
  /** Render edges */
  edges?: boolean
  /** Flat shading for faces */
  flatShading?: boolean
}

/**
 * WebGPU Polytope Renderer.
 *
 * Renders N-dimensional polytopes using separate pipelines for faces and edges.
 * Unlike raymarched renderers, this uses actual mesh geometry with N-D vertex transformations.
 */
export class WebGPUPolytopeRenderer extends WebGPUBasePass {
  private rendererConfig: PolytopeRendererConfig
  private shaderConfig: PolytopeWGSLShaderConfig

  // Pipelines
  private facePipeline: GPURenderPipeline | null = null
  private edgePipeline: GPURenderPipeline | null = null

  // Bind groups
  private cameraBindGroup: GPUBindGroup | null = null
  private polytopeBindGroup: GPUBindGroup | null = null

  // Uniform buffers
  private cameraUniformBuffer: GPUBuffer | null = null
  private polytopeUniformBuffer: GPUBuffer | null = null
  private basisUniformBuffer: GPUBuffer | null = null

  // Geometry buffers (provided externally or created from polytope data)
  private faceVertexBuffer: GPUBuffer | null = null
  private faceIndexBuffer: GPUBuffer | null = null
  private faceIndexCount = 0
  private edgeVertexBuffer: GPUBuffer | null = null
  private edgeIndexBuffer: GPUBuffer | null = null
  private edgeIndexCount = 0

  constructor(config?: PolytopeRendererConfig) {
    super({
      id: 'polytope',
      priority: 100,
      inputs: [],
      outputs: [
        { resourceId: 'hdr-color', access: 'write' as const, binding: 0 },
        { resourceId: 'depth-buffer', access: 'write' as const, binding: 1 },
      ],
    })

    this.rendererConfig = {
      dimension: 4,
      faces: true,
      edges: true,
      flatShading: false,
      ...config,
    }

    this.shaderConfig = {
      dimension: this.rendererConfig.dimension!,
      mode: 'face',
      flatShading: this.rendererConfig.flatShading,
    }
  }

  /**
   * Create rendering pipelines for faces and edges.
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Create bind group layouts
    const cameraBindGroupLayout = device.createBindGroupLayout({
      label: 'polytope-camera-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const },
        },
      ],
    })

    const polytopeBindGroupLayout = device.createBindGroupLayout({
      label: 'polytope-object-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const },
        }, // Polytope uniforms
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' as const },
        }, // Basis vectors
      ],
    })

    // Create pipeline layout for faces (camera + polytope bind groups)
    const facePipelineLayout = device.createPipelineLayout({
      label: 'polytope-face-pipeline-layout',
      bindGroupLayouts: [
        cameraBindGroupLayout,
        cameraBindGroupLayout, // placeholder for lighting (group 1)
        cameraBindGroupLayout, // placeholder for material (group 2)
        cameraBindGroupLayout, // placeholder for quality (group 3)
        polytopeBindGroupLayout, // polytope object (group 4)
      ],
    })

    // Create pipeline layout for edges
    const edgePipelineLayout = device.createPipelineLayout({
      label: 'polytope-edge-pipeline-layout',
      bindGroupLayouts: [
        cameraBindGroupLayout,
        cameraBindGroupLayout,
        cameraBindGroupLayout,
        cameraBindGroupLayout,
        polytopeBindGroupLayout,
      ],
    })

    // Create face pipeline if enabled
    if (this.rendererConfig.faces) {
      const faceVertexShader = composeFaceVertexShader(this.shaderConfig)
      const { wgsl: faceFragmentShader } = composeFaceFragmentShader(this.shaderConfig)

      const faceVertexModule = this.createShaderModule(
        device,
        faceVertexShader,
        'polytope-face-vertex'
      )
      const faceFragmentModule = this.createShaderModule(
        device,
        faceFragmentShader,
        'polytope-face-fragment'
      )

      this.facePipeline = device.createRenderPipeline({
        label: 'polytope-face-pipeline',
        layout: facePipelineLayout,
        vertex: {
          module: faceVertexModule,
          entryPoint: 'main',
          buffers: [
            {
              // Face vertex buffer: position (3) + normal (3) + extraDims0_3 (4) + extraDims4_7 (4)
              arrayStride: 56, // 14 floats * 4 bytes
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x3' as const }, // position
                { shaderLocation: 1, offset: 12, format: 'float32x3' as const }, // normal
                { shaderLocation: 2, offset: 24, format: 'float32x4' as const }, // extraDims0_3
                { shaderLocation: 3, offset: 40, format: 'float32x4' as const }, // extraDims4_7
              ],
            },
          ],
        },
        fragment: {
          module: faceFragmentModule,
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
    }

    // Create edge pipeline if enabled
    if (this.rendererConfig.edges) {
      const edgeVertexShader = composeEdgeVertexShader(this.shaderConfig)
      const { wgsl: edgeFragmentShader } = composeEdgeFragmentShader(this.shaderConfig)

      const edgeVertexModule = this.createShaderModule(
        device,
        edgeVertexShader,
        'polytope-edge-vertex'
      )
      const edgeFragmentModule = this.createShaderModule(
        device,
        edgeFragmentShader,
        'polytope-edge-fragment'
      )

      this.edgePipeline = device.createRenderPipeline({
        label: 'polytope-edge-pipeline',
        layout: edgePipelineLayout,
        vertex: {
          module: edgeVertexModule,
          entryPoint: 'main',
          buffers: [
            {
              // Edge vertex buffer: position (3) + extraDims0_3 (4) + extraDims4_7 (4)
              arrayStride: 44, // 11 floats * 4 bytes
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x3' as const }, // position
                { shaderLocation: 1, offset: 12, format: 'float32x4' as const }, // extraDims0_3
                { shaderLocation: 2, offset: 28, format: 'float32x4' as const }, // extraDims4_7
              ],
            },
          ],
        },
        fragment: {
          module: edgeFragmentModule,
          entryPoint: 'fragmentMain',
          targets: [{ format }],
        },
        primitive: {
          topology: 'line-list' as const,
          cullMode: 'none' as const,
        },
        depthStencil: {
          format: 'depth32float',
          depthWriteEnabled: true,
          depthCompare: 'less',
        },
      })
    }

    // Create uniform buffers
    this.cameraUniformBuffer = this.createUniformBuffer(device, 256, 'polytope-camera')
    this.polytopeUniformBuffer = this.createUniformBuffer(device, 128, 'polytope-uniforms')
    this.basisUniformBuffer = this.createUniformBuffer(device, 256, 'polytope-basis')

    // Create bind groups
    this.cameraBindGroup = device.createBindGroup({
      label: 'polytope-camera-bg',
      layout: cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraUniformBuffer } }],
    })

    this.polytopeBindGroup = device.createBindGroup({
      label: 'polytope-object-bg',
      layout: polytopeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.polytopeUniformBuffer } },
        { binding: 1, resource: { buffer: this.basisUniformBuffer } },
      ],
    })
  }

  /**
   * Set the dimension of the polytope.
   */
  setDimension(dimension: number): void {
    this.rendererConfig.dimension = dimension
    this.shaderConfig.dimension = dimension
  }

  /**
   * Update polytope geometry.
   * Called when the polytope vertices, faces, or edges change.
   */
  updateGeometry(
    device: GPUDevice,
    faceData?: {
      vertices: Float32Array
      indices: Uint16Array | Uint32Array
    },
    edgeData?: {
      vertices: Float32Array
      indices: Uint16Array | Uint32Array
    }
  ): void {
    // Update face geometry
    if (faceData && this.rendererConfig.faces) {
      // Clean up old buffers
      if (this.faceVertexBuffer) {
        this.faceVertexBuffer.destroy()
      }
      if (this.faceIndexBuffer) {
        this.faceIndexBuffer.destroy()
      }

      // Create new vertex buffer
      this.faceVertexBuffer = device.createBuffer({
        label: 'polytope-face-vertices',
        size: faceData.vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      })
      device.queue.writeBuffer(
        this.faceVertexBuffer,
        0,
        faceData.vertices.buffer as ArrayBuffer,
        faceData.vertices.byteOffset,
        faceData.vertices.byteLength
      )

      // Create new index buffer
      this.faceIndexBuffer = device.createBuffer({
        label: 'polytope-face-indices',
        size: faceData.indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      })
      device.queue.writeBuffer(
        this.faceIndexBuffer,
        0,
        faceData.indices.buffer as ArrayBuffer,
        faceData.indices.byteOffset,
        faceData.indices.byteLength
      )
      this.faceIndexCount = faceData.indices.length
    }

    // Update edge geometry
    if (edgeData && this.rendererConfig.edges) {
      // Clean up old buffers
      if (this.edgeVertexBuffer) {
        this.edgeVertexBuffer.destroy()
      }
      if (this.edgeIndexBuffer) {
        this.edgeIndexBuffer.destroy()
      }

      // Create new vertex buffer
      this.edgeVertexBuffer = device.createBuffer({
        label: 'polytope-edge-vertices',
        size: edgeData.vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      })
      device.queue.writeBuffer(
        this.edgeVertexBuffer,
        0,
        edgeData.vertices.buffer as ArrayBuffer,
        edgeData.vertices.byteOffset,
        edgeData.vertices.byteLength
      )

      // Create new index buffer
      this.edgeIndexBuffer = device.createBuffer({
        label: 'polytope-edge-indices',
        size: edgeData.indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      })
      device.queue.writeBuffer(
        this.edgeIndexBuffer,
        0,
        edgeData.indices.buffer as ArrayBuffer,
        edgeData.indices.byteOffset,
        edgeData.indices.byteLength
      )
      this.edgeIndexCount = edgeData.indices.length
    }
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

    // Pack camera uniforms (must match shader struct layout)
    const data = new Float32Array(64) // 256 bytes / 4

    // viewMatrix (16 floats)
    if (camera.viewMatrix) {
      data.set(camera.viewMatrix.elements, 0)
    }
    // projectionMatrix (16 floats)
    if (camera.projectionMatrix) {
      data.set(camera.projectionMatrix.elements, 16)
    }
    // viewProjectionMatrix (16 floats)
    if (camera.viewProjectionMatrix) {
      data.set(camera.viewProjectionMatrix.elements, 32)
    }
    // cameraPosition (3 floats) + near (1 float)
    if (camera.position) {
      data[48] = camera.position.x
      data[49] = camera.position.y
      data[50] = camera.position.z
    }
    data[51] = camera.near || 0.1

    // far, fov, resolution, aspectRatio, time, deltaTime, frameNumber
    data[52] = camera.far || 1000
    data[53] = camera.fov || 50
    data[54] = ctx.size.width
    data[55] = ctx.size.height
    data[56] = ctx.size.width / ctx.size.height
    data[57] = ctx.frame?.time || 0
    data[58] = ctx.frame?.delta || 0.016
    // frameNumber as uint - we'll treat it as float for simplicity
    data[59] = ctx.frame?.frameNumber || 0

    this.writeUniformBuffer(this.device, this.cameraUniformBuffer, data)
  }

  /**
   * Update polytope uniforms.
   */
  updatePolytopeUniforms(
    uniforms: {
      baseColor?: [number, number, number]
      opacity?: number
      edgeColor?: [number, number, number]
      edgeWidth?: number
      roughness?: number
      metalness?: number
      ambientIntensity?: number
      emissiveIntensity?: number
    } = {}
  ): void {
    if (!this.device || !this.polytopeUniformBuffer) return

    // Polytope uniform layout (matches PolytopeUniforms struct):
    // dimension: i32, _pad1-3: f32 (16 bytes)
    // baseColor: vec3f, opacity: f32 (16 bytes)
    // edgeColor: vec3f, edgeWidth: f32 (16 bytes)
    // roughness, metalness, ambientIntensity, emissiveIntensity: f32 (16 bytes)
    // Total: 64 bytes

    const data = new Float32Array(16)

    // dimension + padding (use default of 4 if not set)
    const dimension = this.rendererConfig.dimension ?? 4
    data[0] = dimension
    data[1] = 0
    data[2] = 0
    data[3] = 0

    // baseColor + opacity
    const baseColor = uniforms.baseColor ?? [0.7, 0.7, 0.9]
    data[4] = baseColor[0]
    data[5] = baseColor[1]
    data[6] = baseColor[2]
    data[7] = uniforms.opacity ?? 1.0

    // edgeColor + edgeWidth
    const edgeColor = uniforms.edgeColor ?? [1.0, 1.0, 1.0]
    data[8] = edgeColor[0]
    data[9] = edgeColor[1]
    data[10] = edgeColor[2]
    data[11] = uniforms.edgeWidth ?? 1.0

    // Material properties
    data[12] = uniforms.roughness ?? 0.5
    data[13] = uniforms.metalness ?? 0.0
    data[14] = uniforms.ambientIntensity ?? 0.3
    data[15] = uniforms.emissiveIntensity ?? 0.0

    this.writeUniformBuffer(this.device, this.polytopeUniformBuffer, data)
  }

  /**
   * Update basis vectors for N-D projection.
   */
  updateBasisVectors(basisX: number[], basisY: number[], basisZ: number[], origin: number[]): void {
    if (!this.device || !this.basisUniformBuffer) return

    // Basis vectors layout (matches BasisVectors struct):
    // basisX: array<f32, 11> (44 bytes, aligned to 48)
    // basisY: array<f32, 11> (44 bytes, aligned to 48)
    // basisZ: array<f32, 11> (44 bytes, aligned to 48)
    // origin: array<f32, 11> (44 bytes, aligned to 48)
    // Total: 192 bytes (with alignment)

    // For simplicity, we'll use a padded layout
    const data = new Float32Array(64) // 256 bytes total

    // Copy basis vectors with padding
    const maxDims = 11
    for (let i = 0; i < maxDims && i < basisX.length; i++) {
      const value = basisX[i]
      if (value !== undefined) data[i] = value
    }
    for (let i = 0; i < maxDims && i < basisY.length; i++) {
      const value = basisY[i]
      if (value !== undefined) data[16 + i] = value
    }
    for (let i = 0; i < maxDims && i < basisZ.length; i++) {
      const value = basisZ[i]
      if (value !== undefined) data[32 + i] = value
    }
    for (let i = 0; i < maxDims && i < origin.length; i++) {
      const value = origin[i]
      if (value !== undefined) data[48 + i] = value
    }

    this.writeUniformBuffer(this.device, this.basisUniformBuffer, data)
  }

  /**
   * Execute the render pass.
   */
  execute(ctx: WebGPURenderContext): void {
    if (!this.device || !this.cameraBindGroup || !this.polytopeBindGroup) {
      return
    }

    // Update uniforms
    this.updateCameraUniforms(ctx)

    // Get render targets
    const colorView = ctx.getWriteTarget('hdr-color')
    const depthView = ctx.getWriteTarget('depth-buffer')

    if (!colorView || !depthView) return

    // Render faces
    if (
      this.rendererConfig.faces &&
      this.facePipeline &&
      this.faceVertexBuffer &&
      this.faceIndexBuffer &&
      this.faceIndexCount > 0
    ) {
      const facePassEncoder = ctx.beginRenderPass({
        label: 'polytope-face-render',
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

      facePassEncoder.setPipeline(this.facePipeline)
      facePassEncoder.setBindGroup(0, this.cameraBindGroup)
      facePassEncoder.setBindGroup(1, this.cameraBindGroup) // placeholder
      facePassEncoder.setBindGroup(2, this.cameraBindGroup) // placeholder
      facePassEncoder.setBindGroup(3, this.cameraBindGroup) // placeholder
      facePassEncoder.setBindGroup(4, this.polytopeBindGroup)

      facePassEncoder.setVertexBuffer(0, this.faceVertexBuffer)
      facePassEncoder.setIndexBuffer(this.faceIndexBuffer, 'uint16' as const)
      facePassEncoder.drawIndexed(this.faceIndexCount)

      facePassEncoder.end()
    }

    // Render edges (on top of faces)
    if (
      this.rendererConfig.edges &&
      this.edgePipeline &&
      this.edgeVertexBuffer &&
      this.edgeIndexBuffer &&
      this.edgeIndexCount > 0
    ) {
      const edgePassEncoder = ctx.beginRenderPass({
        label: 'polytope-edge-render',
        colorAttachments: [
          {
            view: colorView,
            loadOp: 'load' as const, // Don't clear, render on top
            storeOp: 'store' as const,
          },
        ],
        depthStencilAttachment: {
          view: depthView,
          depthLoadOp: 'load' as const, // Preserve depth from faces
          depthStoreOp: 'store' as const,
        },
      })

      edgePassEncoder.setPipeline(this.edgePipeline)
      edgePassEncoder.setBindGroup(0, this.cameraBindGroup)
      edgePassEncoder.setBindGroup(1, this.cameraBindGroup) // placeholder
      edgePassEncoder.setBindGroup(2, this.cameraBindGroup) // placeholder
      edgePassEncoder.setBindGroup(3, this.cameraBindGroup) // placeholder
      edgePassEncoder.setBindGroup(4, this.polytopeBindGroup)

      edgePassEncoder.setVertexBuffer(0, this.edgeVertexBuffer)
      edgePassEncoder.setIndexBuffer(this.edgeIndexBuffer, 'uint16' as const)
      edgePassEncoder.drawIndexed(this.edgeIndexCount)

      edgePassEncoder.end()
    }
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.facePipeline = null
    this.edgePipeline = null

    this.cameraBindGroup = null
    this.polytopeBindGroup = null

    this.cameraUniformBuffer?.destroy()
    this.polytopeUniformBuffer?.destroy()
    this.basisUniformBuffer?.destroy()

    this.faceVertexBuffer?.destroy()
    this.faceIndexBuffer?.destroy()
    this.edgeVertexBuffer?.destroy()
    this.edgeIndexBuffer?.destroy()

    this.cameraUniformBuffer = null
    this.polytopeUniformBuffer = null
    this.basisUniformBuffer = null
    this.faceVertexBuffer = null
    this.faceIndexBuffer = null
    this.edgeVertexBuffer = null
    this.edgeIndexBuffer = null

    super.dispose()
  }
}
