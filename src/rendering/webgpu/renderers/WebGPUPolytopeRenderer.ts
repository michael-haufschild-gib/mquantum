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
      priority: 5, // Execute AFTER ScenePass (priority 0) clears, but before other passes
      inputs: [
        { resourceId: 'scene-render', access: 'read' as const, binding: 0 }, // Depend on ScenePass
      ],
      outputs: [
        { resourceId: 'scene-render', access: 'write' as const, binding: 0 },
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

    // Polytope uniforms only (no more basis vectors - N-D transform is in main uniforms)
    const polytopeBindGroupLayout = device.createBindGroupLayout({
      label: 'polytope-object-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const },
        },
      ],
    })

    // Create pipeline layout for faces (camera + polytope bind groups)
    // WebGPU has a maximum of 4 bind group layouts (groups 0-3)
    const facePipelineLayout = device.createPipelineLayout({
      label: 'polytope-face-pipeline-layout',
      bindGroupLayouts: [
        cameraBindGroupLayout,     // group 0: camera
        cameraBindGroupLayout,     // group 1: placeholder for lighting
        cameraBindGroupLayout,     // group 2: placeholder for material
        polytopeBindGroupLayout,   // group 3: polytope uniforms (includes N-D transform)
      ],
    })

    // Create pipeline layout for edges
    const edgePipelineLayout = device.createPipelineLayout({
      label: 'polytope-edge-pipeline-layout',
      bindGroupLayouts: [
        cameraBindGroupLayout,     // group 0: camera
        cameraBindGroupLayout,     // group 1: placeholder for lighting
        cameraBindGroupLayout,     // group 2: placeholder for material
        polytopeBindGroupLayout,   // group 3: polytope uniforms (includes N-D transform)
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
              // Face vertex buffer: position (3) + extraDims0_3 (4) + extraDims4_6 (3) = 10 floats
              // Matches WebGL screen-space normals layout (normals computed in fragment shader)
              arrayStride: 40, // 10 floats * 4 bytes
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x3' as const }, // position
                { shaderLocation: 1, offset: 12, format: 'float32x4' as const }, // extraDims0_3
                { shaderLocation: 2, offset: 28, format: 'float32x3' as const }, // extraDims4_6
              ],
            },
          ],
        },
        fragment: {
          module: faceFragmentModule,
          entryPoint: 'fragmentMain',
          targets: [{ format: 'rgba16float' as GPUTextureFormat }],
        },
        primitive: {
          topology: 'triangle-list' as const,
          cullMode: 'back' as const,
        },
        depthStencil: {
          format: 'depth24plus',
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
              // Edge vertex buffer: position (3) + extraDims0_3 (4) + extraDims4_6 (3) = 10 floats
              // Matches WebGL buildNDGeometry layout
              arrayStride: 40, // 10 floats * 4 bytes
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x3' as const }, // position
                { shaderLocation: 1, offset: 12, format: 'float32x4' as const }, // extraDims0_3
                { shaderLocation: 2, offset: 28, format: 'float32x3' as const }, // extraDims4_6
              ],
            },
          ],
        },
        fragment: {
          module: edgeFragmentModule,
          entryPoint: 'fragmentMain',
          targets: [{ format: 'rgba16float' as GPUTextureFormat }],
        },
        primitive: {
          topology: 'line-list' as const,
          cullMode: 'none' as const,
        },
        depthStencil: {
          format: 'depth24plus',
          depthWriteEnabled: true,
          depthCompare: 'less',
        },
      })
    }

    // Create uniform buffers
    // Camera: 256 bytes (matches CameraUniforms struct)
    // Polytope: 320 bytes (288 bytes for PolytopeUniforms + padding for alignment)
    this.cameraUniformBuffer = this.createUniformBuffer(device, 256, 'polytope-camera')
    this.polytopeUniformBuffer = this.createUniformBuffer(device, 320, 'polytope-uniforms')

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
      // N-D Transform
      rotationMatrix4D?: number[]
      extraRotationCols?: number[]
      depthRowSums?: number[]
      uniformScale?: number
      projectionDistance?: number
      // Material
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
    // rotationMatrix4D: mat4x4f (64 bytes, indices 0-15)
    // dimension: i32, uniformScale: f32, projectionDistance: f32, depthNormFactor: f32 (16 bytes, indices 16-19)
    // baseColor: vec3f, opacity: f32 (16 bytes, indices 20-23)
    // edgeColor: vec3f, edgeWidth: f32 (16 bytes, indices 24-27)
    // roughness, metalness, ambientIntensity, emissiveIntensity: f32 (16 bytes, indices 28-31)
    // extraRotCol0-6: 7 * vec4f (112 bytes, indices 32-59)
    // depthRowSums0_3: vec4f, depthRowSums4_7: vec4f (32 bytes, indices 60-67)
    // depthRowSums8_10: vec3f, _padDepth: f32 (16 bytes, indices 68-71)
    // Total: 288 bytes = 72 floats

    const data = new Float32Array(72)

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
    data[17] = uniforms.uniformScale ?? 1.0
    data[18] = uniforms.projectionDistance ?? 5.0
    data[19] = dimension > 4 ? Math.sqrt(dimension - 3) : 1.0 // depthNormFactor

    // baseColor + opacity (offset 20)
    const baseColor = uniforms.baseColor ?? [0.7, 0.7, 0.9]
    data[20] = baseColor[0]
    data[21] = baseColor[1]
    data[22] = baseColor[2]
    data[23] = uniforms.opacity ?? 1.0

    // edgeColor + edgeWidth (offset 24)
    const edgeColor = uniforms.edgeColor ?? [1.0, 1.0, 1.0]
    data[24] = edgeColor[0]
    data[25] = edgeColor[1]
    data[26] = edgeColor[2]
    data[27] = uniforms.edgeWidth ?? 1.0

    // Material properties (offset 28)
    data[28] = uniforms.roughness ?? 0.5
    data[29] = uniforms.metalness ?? 0.0
    data[30] = uniforms.ambientIntensity ?? 0.3
    data[31] = uniforms.emissiveIntensity ?? 0.0

    // extraRotCols (7 * 4 = 28 floats, offset 32)
    if (uniforms.extraRotationCols) {
      for (let i = 0; i < 28 && i < uniforms.extraRotationCols.length; i++) {
        const value = uniforms.extraRotationCols[i]
        if (value !== undefined) data[32 + i] = value
      }
    }

    // depthRowSums (12 floats for alignment, offset 60)
    if (uniforms.depthRowSums) {
      for (let i = 0; i < 11 && i < uniforms.depthRowSums.length; i++) {
        const value = uniforms.depthRowSums[i]
        if (value !== undefined) data[60 + i] = value
      }
    }
    // _padDepth at index 71 remains 0

    this.writeUniformBuffer(this.device, this.polytopeUniformBuffer, data)
  }

  /**
   * Update polytope uniforms from stores.
   */
  updatePolytopeFromStores(ctx: WebGPURenderContext): void {
    const extended = ctx.frame?.stores?.['extended'] as any
    const pbr = ctx.frame?.stores?.['pbr'] as any
    const appearance = ctx.frame?.stores?.['appearance'] as any
    // N-D transform data including dynamically computed projectionDistance
    const ndTransform = ctx.frame?.stores?.['ndTransform'] as {
      rotationMatrix4D?: number[]
      extraRotationCols?: number[]
      depthRowSums?: number[]
      projectionDistance?: number
    }

    const polytope = extended?.polytope

    // Parse colors
    const faceColor = this.parseColor(appearance?.faceColor ?? '#b3b3e6')
    const edgeColor = this.parseColor(appearance?.edgeColor ?? '#ffffff')

    this.updatePolytopeUniforms({
      // N-D Transform data from stores
      rotationMatrix4D: ndTransform?.rotationMatrix4D,
      extraRotationCols: ndTransform?.extraRotationCols,
      depthRowSums: ndTransform?.depthRowSums,
      // FIX: uniformScale from polytope.scale (not transform.uniformScale)
      // WebGL uses extendedObjectStore.polytope.scale (line 841 of PolytopeScene.tsx)
      // Defaults: hypercube=1.8, simplex=4.0, cross-polytope=1.8, wythoff=2.0
      uniformScale: polytope?.scale ?? 1.8,
      // FIX: projectionDistance from ndTransform (computed dynamically)
      // WebGL uses projDistCache.getProjectionDistance() (line 872 of PolytopeScene.tsx)
      projectionDistance: ndTransform?.projectionDistance ?? 5.0,
      // Material
      baseColor: [faceColor[0], faceColor[1], faceColor[2]],
      opacity: polytope?.opacity ?? 1.0,
      edgeColor: [edgeColor[0], edgeColor[1], edgeColor[2]],
      edgeWidth: polytope?.edgeWidth ?? 1.0,
      roughness: pbr?.face?.roughness ?? 0.5,
      metalness: pbr?.face?.metallic ?? 0.0,
      ambientIntensity: 0.3,
      emissiveIntensity: 0.0,
    })
  }

  private parseColor(hex: string): [number, number, number] {
    if (!hex || !hex.startsWith('#')) return [1, 1, 1]
    const val = parseInt(hex.slice(1), 16)
    if (isNaN(val)) return [1, 1, 1]
    return [
      ((val >> 16) & 0xff) / 255,
      ((val >> 8) & 0xff) / 255,
      (val & 0xff) / 255,
    ]
  }

  /**
   * Execute the render pass.
   */
  execute(ctx: WebGPURenderContext): void {
    if (!this.device || !this.cameraBindGroup || !this.polytopeBindGroup) {
      return
    }

    // Update all uniforms from stores
    this.updateCameraUniforms(ctx)
    this.updatePolytopeFromStores(ctx)

    // Get render targets (write to scene-render, same as WebGL ScenePass)
    const colorView = ctx.getWriteTarget('scene-render')
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
            loadOp: 'load' as const, // Preserve ScenePass clear
            storeOp: 'store' as const,
          },
        ],
        depthStencilAttachment: {
          view: depthView,
          depthLoadOp: 'load' as const, // Preserve ScenePass clear
          depthStoreOp: 'store' as const,
        },
      })

      facePassEncoder.setPipeline(this.facePipeline)
      facePassEncoder.setBindGroup(0, this.cameraBindGroup)
      facePassEncoder.setBindGroup(1, this.cameraBindGroup) // placeholder
      facePassEncoder.setBindGroup(2, this.cameraBindGroup) // placeholder
      facePassEncoder.setBindGroup(3, this.polytopeBindGroup) // Fixed: use polytope bind group

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
      edgePassEncoder.setBindGroup(3, this.polytopeBindGroup) // Fixed: use polytope bind group

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

    this.faceVertexBuffer?.destroy()
    this.faceIndexBuffer?.destroy()
    this.edgeVertexBuffer?.destroy()
    this.edgeIndexBuffer?.destroy()

    this.cameraUniformBuffer = null
    this.polytopeUniformBuffer = null
    this.faceVertexBuffer = null
    this.faceIndexBuffer = null
    this.edgeVertexBuffer = null
    this.edgeIndexBuffer = null

    super.dispose()
  }
}
