/**
 * WebGPU Polytope Renderer
 *
 * Renders N-dimensional polytopes with faces and edges.
 * Uses mesh-based rendering with N-D vertex transformations.
 *
 * Supports two rendering modes:
 * 1. Legacy mode (default): N-D transforms computed in vertex shader
 * 2. Compute-accelerated mode: N-D transforms pre-computed via compute shaders
 *    - PolytopeTransformComputePass: Pre-computes 3D positions from N-D vertices
 *    - PolytopeNormalComputePass: Pre-computes face normals from transformed positions
 *    - Simplified vertex shader reads from storage buffers
 *    - ~2x faster for high dimensions (5D-11D)
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
  composeFaceVertexShaderCompute,
  composeEdgeVertexShaderCompute,
  type PolytopeWGSLShaderConfig,
} from '../shaders/polytope'
import { PolytopeTransformComputePass } from '../passes/PolytopeTransformComputePass'
import { PolytopeNormalComputePass } from '../passes/PolytopeNormalComputePass'

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
  /**
   * Use geometry-based normals computed in vertex shader.
   * When true: Normals are computed from neighbor vertex data (requires 30 floats/vertex).
   * When false: Normals are computed in fragment shader using dFdx/dFdy (10 floats/vertex).
   * Should be set based on dimension < SCREEN_SPACE_NORMAL_MIN_DIMENSION (5).
   * Ignored when useComputeShaders is true.
   */
  useGeometryNormals?: boolean
  /**
   * Use compute shader pre-pass for transforms and normals.
   * When true: N-D transforms and normals are pre-computed via compute shaders.
   * Provides ~2x performance improvement for high dimensions (5D-11D).
   * When false (default): Uses legacy vertex shader transforms.
   */
  useComputeShaders?: boolean
  /** Maximum vertices to support in compute mode (default: 100,000) */
  maxVertices?: number
  /** Maximum triangles to support in compute mode (default: 100,000) */
  maxTriangles?: number
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

  // Bind groups - consolidated layout
  // Group 0: Camera
  // Group 1: Combined (Lighting + Material + Quality)
  // Group 2: Polytope
  private cameraBindGroup: GPUBindGroup | null = null
  private lightingBindGroup: GPUBindGroup | null = null // Combined bind group
  private polytopeBindGroup: GPUBindGroup | null = null

  // Uniform buffers
  private cameraUniformBuffer: GPUBuffer | null = null
  private lightingUniformBuffer: GPUBuffer | null = null
  private polytopeUniformBuffer: GPUBuffer | null = null

  // Geometry buffers (provided externally or created from polytope data)
  private faceVertexBuffer: GPUBuffer | null = null
  private faceIndexBuffer: GPUBuffer | null = null
  private faceIndexCount = 0
  private edgeVertexBuffer: GPUBuffer | null = null
  private edgeIndexBuffer: GPUBuffer | null = null
  private edgeIndexCount = 0

  // Compute shader infrastructure (optional, enabled via useComputeShaders)
  private transformComputePass: PolytopeTransformComputePass | null = null
  private normalComputePass: PolytopeNormalComputePass | null = null
  private computeBufferBindGroup: GPUBindGroup | null = null
  private computeBufferBindGroupLayout: GPUBindGroupLayout | null = null
  private computeInitialized = false

  // Compute-mode pipelines (separate from legacy pipelines)
  private faceComputePipeline: GPURenderPipeline | null = null
  private edgeComputePipeline: GPURenderPipeline | null = null

  // Dirty tracking for compute passes
  private lastGeometryVersion = -1

  // Compute mode geometry tracking
  private computeFaceVertexCount = 0
  private computeTriangleCount = 0
  private computeEdgeVertexCount = 0

  // Draw statistics from last execute()
  private lastDrawStats: import('../core/types').WebGPUPassDrawStats = {
    calls: 0,
    triangles: 0,
    vertices: 0,
    lines: 0,
    points: 0,
  }

  constructor(config?: PolytopeRendererConfig) {
    super({
      id: 'polytope',
      priority: 100, // Same priority as other object renderers (mandelbulb, julia)
      inputs: [],
      outputs: [
        // Match other renderers: write to object-color for compositing
        { resourceId: 'object-color', access: 'write' as const, binding: 0 },
        { resourceId: 'normal-buffer', access: 'write' as const, binding: 1 },
        { resourceId: 'depth-buffer', access: 'write' as const, binding: 2 },
      ],
    })

    this.rendererConfig = {
      dimension: 4,
      faces: true,
      edges: true,
      flatShading: false,
      useGeometryNormals: false,
      ...config,
    }

    this.shaderConfig = {
      dimension: this.rendererConfig.dimension!,
      mode: 'face',
      flatShading: this.rendererConfig.flatShading,
      useGeometryNormals: this.rendererConfig.useGeometryNormals,
      useComputeShaders: this.rendererConfig.useComputeShaders,
    }
  }

  /**
   * Initialize compute shader mode.
   *
   * Creates the compute passes for pre-computing transforms and normals,
   * and creates the compute-accelerated render pipelines.
   *
   * @param ctx - Setup context
   * @param cameraBindGroupLayout - Camera bind group layout (group 0)
   * @param combinedBindGroupLayout - Combined bind group layout (group 1)
   * @param polytopeBindGroupLayout - Polytope bind group layout (group 2)
   */
  private async initializeComputeMode(
    ctx: WebGPUSetupContext,
    cameraBindGroupLayout: GPUBindGroupLayout,
    combinedBindGroupLayout: GPUBindGroupLayout,
    polytopeBindGroupLayout: GPUBindGroupLayout
  ): Promise<void> {
    const { device } = ctx

    // Create compute passes
    this.transformComputePass = new PolytopeTransformComputePass({
      dimension: this.rendererConfig.dimension ?? 4,
      maxVertices: this.rendererConfig.maxVertices,
    })

    this.normalComputePass = new PolytopeNormalComputePass({
      maxTriangles: this.rendererConfig.maxTriangles,
    })

    // Initialize compute passes
    await this.transformComputePass.initialize(ctx)
    await this.normalComputePass.initialize(ctx)

    // Create bind group layout for compute buffers (group 3)
    // Binding 0: Transformed vertices (storage, read)
    // Binding 1: Face normals (storage, read)
    this.computeBufferBindGroupLayout = device.createBindGroupLayout({
      label: 'polytope-compute-buffer-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' as const },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' as const },
        },
      ],
    })

    // Create pipeline layouts for compute mode (4 groups)
    const computeFacePipelineLayout = device.createPipelineLayout({
      label: 'polytope-compute-face-pipeline-layout',
      bindGroupLayouts: [
        cameraBindGroupLayout,           // group 0: camera
        combinedBindGroupLayout,         // group 1: lighting + material + quality
        polytopeBindGroupLayout,         // group 2: polytope uniforms
        this.computeBufferBindGroupLayout, // group 3: compute buffers
      ],
    })

    const computeEdgePipelineLayout = device.createPipelineLayout({
      label: 'polytope-compute-edge-pipeline-layout',
      bindGroupLayouts: [
        cameraBindGroupLayout,           // group 0: camera
        combinedBindGroupLayout,         // group 1: lighting + material + quality
        polytopeBindGroupLayout,         // group 2: polytope uniforms
        this.computeBufferBindGroupLayout, // group 3: compute buffers
      ],
    })

    // Create compute-mode face pipeline
    if (this.rendererConfig.faces) {
      const faceVertexShader = composeFaceVertexShaderCompute(this.shaderConfig)
      // Fragment shader can be reused (with geometry normals mode, since we're providing normals)
      const { wgsl: faceFragmentShader } = composeFaceFragmentShader({
        ...this.shaderConfig,
        useGeometryNormals: true, // Compute mode always provides normals
      })

      const faceVertexModule = this.createShaderModule(device, faceVertexShader, 'polytope-compute-face-vertex')
      const faceFragmentModule = this.createShaderModule(device, faceFragmentShader, 'polytope-compute-face-fragment')

      // Compute mode doesn't use vertex buffer attributes - reads from storage buffers
      this.faceComputePipeline = device.createRenderPipeline({
        label: 'polytope-compute-face-pipeline',
        layout: computeFacePipelineLayout,
        vertex: {
          module: faceVertexModule,
          entryPoint: 'main',
          buffers: [], // No vertex buffers - reads from storage
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

    // Create compute-mode edge pipeline
    if (this.rendererConfig.edges) {
      const edgeVertexShader = composeEdgeVertexShaderCompute(this.shaderConfig)
      const { wgsl: edgeFragmentShader } = composeEdgeFragmentShader(this.shaderConfig)

      const edgeVertexModule = this.createShaderModule(device, edgeVertexShader, 'polytope-compute-edge-vertex')
      const edgeFragmentModule = this.createShaderModule(device, edgeFragmentShader, 'polytope-compute-edge-fragment')

      this.edgeComputePipeline = device.createRenderPipeline({
        label: 'polytope-compute-edge-pipeline',
        layout: computeEdgePipelineLayout,
        vertex: {
          module: edgeVertexModule,
          entryPoint: 'main',
          buffers: [], // No vertex buffers - reads from storage
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

    this.computeInitialized = true
  }

  /**
   * Create rendering pipelines for faces and edges.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Create bind group layouts - consolidated to stay within 4-group limit
    // Group 0: Camera
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

    // Group 1: Combined (Lighting + Material + Quality)
    const combinedBindGroupLayout = device.createBindGroupLayout({
      label: 'polytope-combined-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Lighting
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Material
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Quality
      ],
    })

    // Group 2: Polytope uniforms (includes N-D transform)
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

    // Create pipeline layout - consolidated (3 groups)
    const facePipelineLayout = device.createPipelineLayout({
      label: 'polytope-face-pipeline-layout',
      bindGroupLayouts: [
        cameraBindGroupLayout,     // group 0: camera
        combinedBindGroupLayout,   // group 1: lighting + material + quality
        polytopeBindGroupLayout,   // group 2: polytope uniforms (includes N-D transform)
      ],
    })

    // Create pipeline layout for edges
    const edgePipelineLayout = device.createPipelineLayout({
      label: 'polytope-edge-pipeline-layout',
      bindGroupLayouts: [
        cameraBindGroupLayout,     // group 0: camera
        combinedBindGroupLayout,   // group 1: lighting + material + quality
        polytopeBindGroupLayout,   // group 2: polytope uniforms (includes N-D transform)
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

      // Vertex buffer layout depends on normal computation mode
      // Geometry-based: 30 floats (thisVertex + neighbor1 + neighbor2)
      // Screen-space: 10 floats (thisVertex only)
      const useGeometryNormals = this.rendererConfig.useGeometryNormals ?? false

      const faceVertexBufferLayout: GPUVertexBufferLayout = useGeometryNormals
        ? {
            // Geometry-based normals: 30 floats = 120 bytes per vertex
            // Matches WebGL geometry-based normals layout for dimensions < 5
            arrayStride: 120, // 30 floats * 4 bytes
            attributes: [
              // This vertex (offset 0-39)
              { shaderLocation: 0, offset: 0, format: 'float32x3' as const }, // position
              { shaderLocation: 1, offset: 12, format: 'float32x4' as const }, // extraDims0_3
              { shaderLocation: 2, offset: 28, format: 'float32x3' as const }, // extraDims4_6
              // Neighbor 1 (offset 40-79)
              { shaderLocation: 3, offset: 40, format: 'float32x3' as const }, // neighbor1Pos
              { shaderLocation: 4, offset: 52, format: 'float32x4' as const }, // neighbor1Extra0_3
              { shaderLocation: 5, offset: 68, format: 'float32x3' as const }, // neighbor1Extra4_6
              // Neighbor 2 (offset 80-119)
              { shaderLocation: 6, offset: 80, format: 'float32x3' as const }, // neighbor2Pos
              { shaderLocation: 7, offset: 92, format: 'float32x4' as const }, // neighbor2Extra0_3
              { shaderLocation: 8, offset: 108, format: 'float32x3' as const }, // neighbor2Extra4_6
            ],
          }
        : {
            // Screen-space normals: 10 floats = 40 bytes per vertex
            // Matches WebGL screen-space normals layout (normals computed in fragment shader)
            arrayStride: 40, // 10 floats * 4 bytes
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' as const }, // position
              { shaderLocation: 1, offset: 12, format: 'float32x4' as const }, // extraDims0_3
              { shaderLocation: 2, offset: 28, format: 'float32x3' as const }, // extraDims4_6
            ],
          }

      this.facePipeline = device.createRenderPipeline({
        label: `polytope-face-pipeline-${useGeometryNormals ? 'geometry-normals' : 'screen-space-normals'}`,
        layout: facePipelineLayout,
        vertex: {
          module: faceVertexModule,
          entryPoint: 'main',
          buffers: [faceVertexBufferLayout],
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

    // ========================================================================
    // Compute Shader Mode (Optional)
    // When enabled, creates compute passes for pre-computing transforms and normals
    // ========================================================================
    if (this.rendererConfig.useComputeShaders) {
      await this.initializeComputeMode(ctx, cameraBindGroupLayout, combinedBindGroupLayout, polytopeBindGroupLayout)
    }

    // Create uniform buffers
    // CameraUniforms: 7 mat4x4f (448) + vec3f+f32 (16) + 4×f32+vec2f (16) + 4×f32 (16) = 496 bytes, round to 512
    // LightingUniforms: 576 bytes
    // MaterialUniforms: 160 bytes (vec3f has 16-byte alignment in WGSL)
    // QualityUniforms: 64 bytes
    // Polytope: 384 bytes (288 base + 96 color algorithm fields)
    this.cameraUniformBuffer = this.createUniformBuffer(device, 512, 'polytope-camera')
    this.lightingUniformBuffer = this.createUniformBuffer(device, 576, 'polytope-lighting')
    const materialUniformBuffer = this.createUniformBuffer(device, 160, 'polytope-material')
    const qualityUniformBuffer = this.createUniformBuffer(device, 64, 'polytope-quality')
    this.polytopeUniformBuffer = this.createUniformBuffer(device, 384, 'polytope-uniforms')

    // Create bind groups - consolidated layout
    // Group 0: Camera
    this.cameraBindGroup = device.createBindGroup({
      label: 'polytope-camera-bg',
      layout: cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraUniformBuffer } }],
    })

    // Group 1: Combined (Lighting + Material + Quality)
    this.lightingBindGroup = device.createBindGroup({
      label: 'polytope-combined-bg',
      layout: combinedBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.lightingUniformBuffer } },
        { binding: 1, resource: { buffer: materialUniformBuffer } },
        { binding: 2, resource: { buffer: qualityUniformBuffer } },
      ],
    })

    // Group 2: Polytope
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
   * @param dimension
   */
  setDimension(dimension: number): void {
    this.rendererConfig.dimension = dimension
    this.shaderConfig.dimension = dimension
  }

  /**
   * Update polytope geometry.
   * Called when the polytope vertices, faces, or edges change.
   * @param device
   * @param faceData
   * @param faceData.vertices
   * @param faceData.indices
   * @param edgeData
   * @param edgeData.vertices
   * @param edgeData.indices
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
    console.log('[WebGPU Polytope] updateGeometry called:', {
      hasFaceData: !!faceData,
      faceVertexCount: faceData?.vertices.length ?? 0,
      faceIndexCount: faceData?.indices.length ?? 0,
      hasEdgeData: !!edgeData,
      edgeVertexCount: edgeData?.vertices.length ?? 0,
      edgeIndexCount: edgeData?.indices.length ?? 0,
      facesEnabled: this.rendererConfig.faces,
      edgesEnabled: this.rendererConfig.edges,
    })

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

    // === COMPUTE MODE: Upload geometry to compute passes ===
    if (this.rendererConfig.useComputeShaders && this.computeInitialized) {
      // Upload face geometry to compute passes
      if (faceData && this.transformComputePass && this.normalComputePass) {
        // Determine input stride based on normal computation mode
        // useGeometryNormals (dim < 5): 30 floats (position + extra + 2 neighbors)
        // screen-space normals (dim >= 5): 10 floats (position + extra)
        const useGeometryNormals = this.shaderConfig.useGeometryNormals
        const inputStride = useGeometryNormals ? 30 : 10
        const vertexCount = faceData.vertices.length / inputStride

        // Extract raw N-D vertex data (10 floats per vertex)
        const rawVertices = new Float32Array(vertexCount * 10)
        for (let i = 0; i < vertexCount; i++) {
          const srcOffset = i * inputStride
          const dstOffset = i * 10
          for (let j = 0; j < 10; j++) {
            rawVertices[dstOffset + j] = faceData.vertices[srcOffset + j] ?? 0
          }
        }

        // Upload to transform compute pass
        this.transformComputePass.updateInputVertices(device, rawVertices, vertexCount)

        // Generate triangle indices (consecutive since vertices are already triangulated)
        const triangleCount = Math.floor(vertexCount / 3)
        const indices = new Uint32Array(triangleCount * 3)
        for (let i = 0; i < triangleCount * 3; i++) {
          indices[i] = i
        }

        // Upload to normal compute pass
        this.normalComputePass.updateTriangleIndices(device, indices, triangleCount, this.lastGeometryVersion)

        // Store counts for rendering
        this.computeFaceVertexCount = vertexCount
        this.computeTriangleCount = triangleCount

        console.log('[WebGPU Polytope] Uploaded to compute passes:', {
          vertexCount,
          triangleCount,
          inputStride,
          useGeometryNormals,
        })
      }

      // Track edge vertex count for compute mode
      if (edgeData) {
        // Edge data is always 10 floats per vertex
        this.computeEdgeVertexCount = edgeData.vertices.length / 10
      }

      // Increment geometry version for dirty tracking
      this.lastGeometryVersion++
    }
  }

  /**
   * Update camera uniforms.
   * @param ctx
   */
  private updateCameraUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.cameraUniformBuffer) return

    // Get animation time (respects pause state)
    const animation = ctx.frame?.stores?.['animation'] as any
    const animationTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0

    // Get camera data from stores
    const camera = ctx.frame?.stores?.['camera'] as {
      viewMatrix?: { elements: number[] }
      projectionMatrix?: { elements: number[] }
      viewProjectionMatrix?: { elements: number[] }
      inverseViewMatrix?: { elements: number[] }
      inverseProjectionMatrix?: { elements: number[] }
      position?: { x: number; y: number; z: number }
      near?: number
      far?: number
      fov?: number
    }
    if (!camera) return

    // CameraUniforms layout (512 bytes = 128 floats):
    // 7 mat4x4f (7 × 16 floats = 112) + vec3f+f32 (4) + remaining scalars (12)
    const data = new Float32Array(128)

    // Matrices at correct offsets (each mat4x4f = 16 floats)
    if (camera.viewMatrix) {
      data.set(camera.viewMatrix.elements, 0) // offset 0
    }
    if (camera.projectionMatrix) {
      data.set(camera.projectionMatrix.elements, 16) // offset 16
    }
    if (camera.viewProjectionMatrix) {
      data.set(camera.viewProjectionMatrix.elements, 32) // offset 32
    }
    if (camera.inverseViewMatrix) {
      data.set(camera.inverseViewMatrix.elements, 48) // offset 48
    }
    if (camera.inverseProjectionMatrix) {
      data.set(camera.inverseProjectionMatrix.elements, 64) // offset 64
    }

    // Model matrices for raymarching coordinate space conversion
    // For Polytope, use identity (no scale transformation needed for mesh rendering)
    // modelMatrix (offset 80): identity
    data[80] = 1.0; data[85] = 1.0; data[90] = 1.0; data[95] = 1.0
    // inverseModelMatrix (offset 96): identity
    data[96] = 1.0; data[101] = 1.0; data[106] = 1.0; data[111] = 1.0

    // Camera position at offset 112 (after 7 matrices)
    if (camera.position) {
      data[112] = camera.position.x
      data[113] = camera.position.y
      data[114] = camera.position.z
    }
    data[115] = camera.near || 0.1 // cameraNear (packed with cameraPosition)
    data[116] = camera.far || 1000 // cameraFar
    data[117] = camera.fov || 50 // fov
    data[118] = ctx.size.width // resolution.x
    data[119] = ctx.size.height // resolution.y
    data[120] = ctx.size.width / ctx.size.height // aspectRatio
    data[121] = animationTime // time (respects animation pause state)
    data[122] = ctx.frame?.delta || 0.016 // deltaTime
    data[123] = ctx.frame?.frameNumber || 0 // frameNumber

    this.writeUniformBuffer(this.device, this.cameraUniformBuffer, data)
  }

  /**
   * Update polytope uniforms.
   * @param uniforms
   * @param uniforms.rotationMatrix4D
   * @param uniforms.extraRotationCols
   * @param uniforms.depthRowSums
   * @param uniforms.uniformScale
   * @param uniforms.projectionDistance
   * @param uniforms.baseColor
   * @param uniforms.opacity
   * @param uniforms.edgeColor
   * @param uniforms.edgeWidth
   * @param uniforms.roughness
   * @param uniforms.metalness
   * @param uniforms.ambientIntensity
   * @param uniforms.emissiveIntensity
   * @param uniforms.colorAlgorithm
   * @param uniforms.distPower
   * @param uniforms.distCycles
   * @param uniforms.distOffset
   * @param uniforms.cosineA
   * @param uniforms.cosineB
   * @param uniforms.cosineC
   * @param uniforms.cosineD
   * @param uniforms.lchLightness
   * @param uniforms.lchChroma
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
      // Color Algorithm
      colorAlgorithm?: number
      distPower?: number
      distCycles?: number
      distOffset?: number
      cosineA?: [number, number, number]
      cosineB?: [number, number, number]
      cosineC?: [number, number, number]
      cosineD?: [number, number, number]
      lchLightness?: number
      lchChroma?: number
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
    // colorAlgorithm, distPower, distCycles, distOffset: (16 bytes, indices 72-75)
    // cosineA, cosineB, cosineC, cosineD: 4 * vec4f (64 bytes, indices 76-91)
    // lchLightness, lchChroma, _padEnd: (16 bytes, indices 92-95)
    // Total: 384 bytes = 96 floats

    const data = new Float32Array(96)

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

    // Color Algorithm System (offset 72)
    const intView = new Int32Array(data.buffer)
    intView[72] = uniforms.colorAlgorithm ?? 0 // monochromatic default
    data[73] = uniforms.distPower ?? 1.0
    data[74] = uniforms.distCycles ?? 1.0
    data[75] = uniforms.distOffset ?? 0.0

    // Cosine coefficients (offset 76-91, as vec4f)
    const cosineA = uniforms.cosineA ?? [0.6, 0.2, 0.3]
    data[76] = cosineA[0]
    data[77] = cosineA[1]
    data[78] = cosineA[2]
    data[79] = 0.0 // w unused

    const cosineB = uniforms.cosineB ?? [0.4, 0.3, 0.3]
    data[80] = cosineB[0]
    data[81] = cosineB[1]
    data[82] = cosineB[2]
    data[83] = 0.0

    const cosineC = uniforms.cosineC ?? [0.5, 0.5, 0.5]
    data[84] = cosineC[0]
    data[85] = cosineC[1]
    data[86] = cosineC[2]
    data[87] = 0.0

    const cosineD = uniforms.cosineD ?? [0.0, 0.0, 0.0]
    data[88] = cosineD[0]
    data[89] = cosineD[1]
    data[90] = cosineD[2]
    data[91] = 0.0

    // LCH parameters (offset 92)
    data[92] = uniforms.lchLightness ?? 0.7
    data[93] = uniforms.lchChroma ?? 0.15
    // _padEnd at indices 94-95 remains 0

    this.writeUniformBuffer(this.device, this.polytopeUniformBuffer, data)
  }

  /**
   * Update polytope uniforms from stores.
   * @param ctx
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

    // Edge thickness from appearance store (matches WebGL PolytopeScene line 399)
    const edgeThickness = appearance?.edgeThickness ?? 1.0
    // Face opacity from appearance.shaderSettings.surface.faceOpacity (matches WebGL PolytopeScene line 849)
    const faceOpacity = appearance?.shaderSettings?.surface?.faceOpacity ?? 1.0

    // Color algorithm settings from appearance store (matches WebGL PolytopeScene)
    const colorAlgorithmMap: Record<string, number> = {
      monochromatic: 0,
      analogous: 1,
      cosine: 2,
      normal: 3,
      distance: 4,
      lch: 5,
      multiSource: 6,
      radial: 7,
      phase: 8,
      mixed: 9,
      blackbody: 10,
      accretionGradient: 11,
      gravitationalRedshift: 12,
      dimension: 13,
    }
    const colorAlgorithm = colorAlgorithmMap[appearance?.colorAlgorithm ?? 'monochromatic'] ?? 0
    const cosineCoeffs = appearance?.cosineCoefficients ?? {
      a: [0.6, 0.2, 0.3],
      b: [0.4, 0.3, 0.3],
      c: [0.5, 0.5, 0.5],
      d: [0.0, 0.0, 0.0],
    }
    const distribution = appearance?.distribution ?? { power: 1.0, cycles: 1.0, offset: 0.0 }

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
      opacity: faceOpacity,
      edgeColor: [edgeColor[0], edgeColor[1], edgeColor[2]],
      edgeWidth: edgeThickness,
      roughness: pbr?.face?.roughness ?? 0.5,
      metalness: pbr?.face?.metallic ?? 0.0,
      ambientIntensity: 0.3,
      emissiveIntensity: 0.0,
      // Color Algorithm
      colorAlgorithm,
      distPower: distribution.power ?? 1.0,
      distCycles: distribution.cycles ?? 1.0,
      distOffset: distribution.offset ?? 0.0,
      cosineA: cosineCoeffs.a as [number, number, number],
      cosineB: cosineCoeffs.b as [number, number, number],
      cosineC: cosineCoeffs.c as [number, number, number],
      cosineD: cosineCoeffs.d as [number, number, number],
      lchLightness: appearance?.lchLightness ?? 0.7,
      lchChroma: appearance?.lchChroma ?? 0.15,
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
   * Update transform uniforms for compute passes from stores.
   * Extracts rotation matrix, extra rotation columns, and depth row sums.
   * @param ctx - Render context with store access
   */
  private updateComputeTransformUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.transformComputePass) return

    const ndTransform = ctx.frame?.stores?.['ndTransform'] as {
      rotationMatrix4D?: number[]
      extraRotationCols?: number[]
      depthRowSums?: number[]
      projectionDistance?: number
      version?: number
    }

    if (!ndTransform) return

    // Extract transform data
    const rotationMatrix4D = new Float32Array(ndTransform.rotationMatrix4D ?? new Array(16).fill(0))
    const extraRotationCols = new Float32Array(ndTransform.extraRotationCols ?? new Array(28).fill(0))
    const depthRowSums = new Float32Array(ndTransform.depthRowSums ?? new Array(11).fill(0))
    const version = ndTransform.version ?? Date.now()

    // Update transform compute pass uniforms
    this.transformComputePass.updateTransformUniforms(
      this.device,
      rotationMatrix4D,
      extraRotationCols,
      depthRowSums,
      version
    )
  }

  /**
   * Create or update the compute buffer bind group.
   * This bind group provides access to transformed vertices and normals in shaders.
   */
  private updateComputeBufferBindGroup(): void {
    if (!this.device || !this.computeBufferBindGroupLayout) return
    if (!this.transformComputePass || !this.normalComputePass) return

    const transformedBuffer = this.transformComputePass.getOutputBuffer()
    const normalBuffer = this.normalComputePass.getNormalBuffer()

    if (!transformedBuffer || !normalBuffer) {
      console.warn('[WebGPU Polytope] Cannot create compute buffer bind group: missing buffers')
      return
    }

    // Create bind group with compute outputs
    this.computeBufferBindGroup = this.device.createBindGroup({
      label: 'polytope-compute-buffer-bg',
      layout: this.computeBufferBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: transformedBuffer } },
        { binding: 1, resource: { buffer: normalBuffer } },
      ],
    })
  }

  /**
   * Update lighting uniforms from stores.
   * Matches the pattern used in other WebGPU renderers.
   * @param ctx
   */
  private updateLightingUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.lightingUniformBuffer) return

    const lighting = ctx.frame?.stores?.['lighting'] as {
      lights?: Array<{
        type?: string
        position?: [number, number, number]
        direction?: [number, number, number]
        color?: string
        intensity?: number
        range?: number
        decay?: number
        spotCosInner?: number
        spotCosOuter?: number
        enabled?: boolean
      }>
      ambientColor?: string
      ambientIntensity?: number
      ambientEnabled?: boolean
    }
    if (!lighting) return

    // LightingUniforms struct layout:
    // struct LightData { position: vec4f, direction: vec4f, color: vec4f, params: vec4f } = 64 bytes
    // lights: array<LightData, 8>, offset 0, 512 bytes
    // ambientColor: vec3f, offset 512 (128 floats)
    // ambientIntensity: f32, offset 524 (131 floats)
    // lightCount: i32, offset 528 (132 floats)
    const data = new Float32Array(144)

    const lights = lighting.lights ?? []
    const lightCount = Math.min(lights.length, 8)

    // Pack lights array (offset 0, each light is 16 floats = 64 bytes)
    for (let i = 0; i < lightCount; i++) {
      const light = lights[i]
      if (!light) continue
      const offset = i * 16

      // position: vec4f (xyz = position, w = type)
      // Must match WGSL constants: LIGHT_TYPE_POINT=1, LIGHT_TYPE_DIRECTIONAL=2, LIGHT_TYPE_SPOT=3
      const lightType = light.type === 'directional' ? 2 : light.type === 'spot' ? 3 : 1
      data[offset + 0] = light.position?.[0] ?? 0
      data[offset + 1] = light.position?.[1] ?? 5
      data[offset + 2] = light.position?.[2] ?? 0
      data[offset + 3] = lightType

      // direction: vec4f (xyz = direction, w = range)
      data[offset + 4] = light.direction?.[0] ?? 0
      data[offset + 5] = light.direction?.[1] ?? -1
      data[offset + 6] = light.direction?.[2] ?? 0
      data[offset + 7] = light.range ?? 100.0

      // color: vec4f (rgb = color, a = intensity)
      const lightColor = this.parseColor(light.color ?? '#ffffff')
      data[offset + 8] = lightColor[0]
      data[offset + 9] = lightColor[1]
      data[offset + 10] = lightColor[2]
      data[offset + 11] = light.intensity ?? 1.0

      // params: vec4f (x = decay, y = spotCosInner, z = spotCosOuter, w = enabled)
      data[offset + 12] = light.decay ?? 2.0
      data[offset + 13] = light.spotCosInner ?? 0.9
      data[offset + 14] = light.spotCosOuter ?? 0.7
      data[offset + 15] = light.enabled !== false ? 1.0 : 0.0
    }

    // ambientColor: vec3f at offset 128 (after 8 lights × 16 floats)
    const ambientColor = this.parseColor(lighting.ambientColor ?? '#ffffff')
    data[128] = ambientColor[0]
    data[129] = ambientColor[1]
    data[130] = ambientColor[2]

    // ambientIntensity: f32 at offset 131
    data[131] = (lighting.ambientEnabled !== false ? 1 : 0) * (lighting.ambientIntensity ?? 0.3)

    // lightCount: i32 at offset 132 - use DataView for proper type
    const dataView = new DataView(data.buffer)
    dataView.setInt32(132 * 4, lightCount, true)

    this.writeUniformBuffer(this.device, this.lightingUniformBuffer, data)
  }

  // Debug: Track last log time to throttle logging
  private _lastDebugLog = 0

  /**
   * Execute the render pass.
   * @param ctx
   */
  execute(ctx: WebGPURenderContext): void {
    // Throttled debug logging (once per second)
    const now = Date.now()
    const shouldLog = now - this._lastDebugLog > 1000
    if (shouldLog) this._lastDebugLog = now

    if (!this.device || !this.cameraBindGroup || !this.lightingBindGroup || !this.polytopeBindGroup) {
      if (shouldLog) {
        console.warn('[WebGPU Polytope] Missing required resources:', {
          device: !!this.device,
          cameraBindGroup: !!this.cameraBindGroup,
          lightingBindGroup: !!this.lightingBindGroup,
          polytopeBindGroup: !!this.polytopeBindGroup,
        })
      }
      return
    }

    // Update all uniforms from stores
    this.updateCameraUniforms(ctx)
    this.updateLightingUniforms(ctx)
    this.updatePolytopeFromStores(ctx)

    // === COMPUTE MODE: Execute compute passes before rendering ===
    const useComputeMode = this.rendererConfig.useComputeShaders && this.computeInitialized
    if (useComputeMode) {
      // Update transform uniforms from stores
      this.updateComputeTransformUniforms(ctx)

      // Execute transform compute pass
      if (this.transformComputePass) {
        this.transformComputePass.execute(ctx)

        // Wire normal compute pass to transform output
        const transformedBuffer = this.transformComputePass.getOutputBuffer()
        const vertexCount = this.transformComputePass.getVertexCount()
        if (transformedBuffer && this.normalComputePass) {
          this.normalComputePass.setTransformedVertexBuffer(transformedBuffer, vertexCount)
          this.normalComputePass.execute(ctx)
        }
      }

      // Update compute buffer bind group with latest outputs
      this.updateComputeBufferBindGroup()
    }

    // Get visibility controls from appearance store (matches WebGL PolytopeScene lines 396-397)
    const appearance = ctx.frame?.stores?.['appearance'] as any
    const facesVisible = appearance?.facesVisible ?? this.rendererConfig.faces ?? true
    const edgesVisible = appearance?.edgesVisible ?? this.rendererConfig.edges ?? true

    // Get render targets - write to object-color for compositing (matches other renderers)
    const colorView = ctx.getWriteTarget('object-color')
    const normalView = ctx.getWriteTarget('normal-buffer')
    const depthView = ctx.getWriteTarget('depth-buffer')

    if (!colorView || !depthView) {
      if (shouldLog) {
        console.warn('[WebGPU Polytope] Missing render targets:', {
          colorView: !!colorView,
          normalView: !!normalView,
          depthView: !!depthView,
        })
      }
      return
    }

    // Debug: Log geometry state
    if (shouldLog) {
      console.log('[WebGPU Polytope] Geometry state:', {
        facesVisible,
        edgesVisible,
        hasFacePipeline: !!this.facePipeline,
        hasFaceVertexBuffer: !!this.faceVertexBuffer,
        hasFaceIndexBuffer: !!this.faceIndexBuffer,
        faceIndexCount: this.faceIndexCount,
        hasEdgePipeline: !!this.edgePipeline,
        hasEdgeVertexBuffer: !!this.edgeVertexBuffer,
        hasEdgeIndexBuffer: !!this.edgeIndexBuffer,
        edgeIndexCount: this.edgeIndexCount,
      })
    }

    // Check if we'll actually render anything
    // In compute mode, we check for compute pipelines and vertex counts
    // In legacy mode, we check for legacy pipelines and buffers
    const willRenderFaces = useComputeMode
      ? facesVisible && this.faceComputePipeline && this.computeBufferBindGroup && this.computeFaceVertexCount > 0
      : facesVisible && this.facePipeline && this.faceVertexBuffer && this.faceIndexBuffer && this.faceIndexCount > 0
    const willRenderEdges = useComputeMode
      ? edgesVisible && this.edgeComputePipeline && this.computeBufferBindGroup && this.computeEdgeVertexCount > 0
      : edgesVisible && this.edgePipeline && this.edgeVertexBuffer && this.edgeIndexBuffer && this.edgeIndexCount > 0

    // If nothing to render, still clear object-color so compositing sees transparent
    if (!willRenderFaces && !willRenderEdges) {
      if (shouldLog) {
        console.log('[WebGPU Polytope] No geometry to render, clearing object-color')
      }
      const clearPassEncoder = ctx.beginRenderPass({
        label: 'polytope-clear',
        colorAttachments: [
          {
            view: colorView,
            loadOp: 'clear' as const,
            storeOp: 'store' as const,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
        depthStencilAttachment: {
          view: depthView,
          depthLoadOp: 'clear' as const,
          depthStoreOp: 'store' as const,
          depthClearValue: 1.0,
        },
      })
      clearPassEncoder.end()
      return
    }

    // Render faces
    if (willRenderFaces) {
      if (shouldLog) {
        console.log('[WebGPU Polytope] Drawing faces:', useComputeMode ? this.computeFaceVertexCount + ' vertices (compute)' : this.faceIndexCount + ' indices')
      }
      const facePassEncoder = ctx.beginRenderPass({
        label: 'polytope-face-render',
        colorAttachments: [
          {
            view: colorView,
            loadOp: 'clear' as const, // Clear object-color (we're first to write)
            storeOp: 'store' as const,
            clearValue: { r: 0, g: 0, b: 0, a: 0 }, // Transparent for compositing
          },
        ],
        depthStencilAttachment: {
          view: depthView,
          depthLoadOp: 'clear' as const, // Clear depth
          depthStoreOp: 'store' as const,
          depthClearValue: 1.0,
        },
      })

      if (useComputeMode && this.faceComputePipeline && this.computeBufferBindGroup) {
        // === COMPUTE MODE: Use compute pipelines with 4 bind groups ===
        // Group 0: Camera
        // Group 1: Combined (Lighting + Material + Quality)
        // Group 2: Polytope uniforms
        // Group 3: Compute buffers (transformed vertices + normals)
        facePassEncoder.setPipeline(this.faceComputePipeline)
        facePassEncoder.setBindGroup(0, this.cameraBindGroup)
        facePassEncoder.setBindGroup(1, this.lightingBindGroup)
        facePassEncoder.setBindGroup(2, this.polytopeBindGroup)
        facePassEncoder.setBindGroup(3, this.computeBufferBindGroup)

        // Draw with vertex count (no vertex buffers - reads from storage)
        facePassEncoder.draw(this.computeFaceVertexCount)
      } else if (this.facePipeline && this.faceVertexBuffer && this.faceIndexBuffer) {
        // === LEGACY MODE: Use vertex buffer pipelines with 3 bind groups ===
        // Group 0: Camera
        // Group 1: Combined (Lighting + Material + Quality)
        // Group 2: Polytope
        facePassEncoder.setPipeline(this.facePipeline)
        facePassEncoder.setBindGroup(0, this.cameraBindGroup)
        facePassEncoder.setBindGroup(1, this.lightingBindGroup)
        facePassEncoder.setBindGroup(2, this.polytopeBindGroup)

        facePassEncoder.setVertexBuffer(0, this.faceVertexBuffer)
        facePassEncoder.setIndexBuffer(this.faceIndexBuffer, 'uint16' as const)
        facePassEncoder.drawIndexed(this.faceIndexCount)
      }

      facePassEncoder.end()
    }

    // Track if we've rendered faces (for clear logic in edge pass)
    const facesRendered = willRenderFaces

    // Render edges (on top of faces)
    if (willRenderEdges) {
      if (shouldLog) {
        console.log('[WebGPU Polytope] Drawing edges:', useComputeMode ? this.computeEdgeVertexCount + ' vertices (compute)' : this.edgeIndexCount + ' indices')
      }

      // If faces weren't rendered, we need to clear the buffers
      const shouldClear = !facesRendered

      const edgePassEncoder = ctx.beginRenderPass({
        label: 'polytope-edge-render',
        colorAttachments: [
          {
            view: colorView,
            loadOp: shouldClear ? 'clear' as const : 'load' as const,
            storeOp: 'store' as const,
            clearValue: shouldClear ? { r: 0, g: 0, b: 0, a: 0 } : undefined,
          },
        ],
        depthStencilAttachment: {
          view: depthView,
          depthLoadOp: shouldClear ? 'clear' as const : 'load' as const,
          depthStoreOp: 'store' as const,
          depthClearValue: shouldClear ? 1.0 : undefined,
        },
      })

      if (useComputeMode && this.edgeComputePipeline && this.computeBufferBindGroup) {
        // === COMPUTE MODE: Use compute pipelines with 4 bind groups ===
        // Group 0: Camera
        // Group 1: Combined (Lighting + Material + Quality)
        // Group 2: Polytope uniforms
        // Group 3: Compute buffers (transformed vertices)
        edgePassEncoder.setPipeline(this.edgeComputePipeline)
        edgePassEncoder.setBindGroup(0, this.cameraBindGroup)
        edgePassEncoder.setBindGroup(1, this.lightingBindGroup)
        edgePassEncoder.setBindGroup(2, this.polytopeBindGroup)
        edgePassEncoder.setBindGroup(3, this.computeBufferBindGroup)

        // Draw with vertex count (no vertex buffers - reads from storage)
        edgePassEncoder.draw(this.computeEdgeVertexCount)
      } else if (this.edgePipeline && this.edgeVertexBuffer && this.edgeIndexBuffer) {
        // === LEGACY MODE: Use vertex buffer pipelines with 3 bind groups ===
        // Group 0: Camera
        // Group 1: Combined (Lighting + Material + Quality)
        // Group 2: Polytope
        edgePassEncoder.setPipeline(this.edgePipeline)
        edgePassEncoder.setBindGroup(0, this.cameraBindGroup)
        edgePassEncoder.setBindGroup(1, this.lightingBindGroup)
        edgePassEncoder.setBindGroup(2, this.polytopeBindGroup)

        edgePassEncoder.setVertexBuffer(0, this.edgeVertexBuffer)
        edgePassEncoder.setIndexBuffer(this.edgeIndexBuffer, 'uint16' as const)
        edgePassEncoder.drawIndexed(this.edgeIndexCount)
      }

      edgePassEncoder.end()
    }

    // Update draw statistics
    let drawCalls = 0
    let triangles = 0
    let lines = 0
    let vertices = 0

    if (willRenderFaces) {
      drawCalls++
      if (useComputeMode) {
        triangles += this.computeTriangleCount
        vertices += this.computeFaceVertexCount
      } else if (this.faceIndexCount > 0) {
        triangles += Math.floor(this.faceIndexCount / 3)
        vertices += this.faceIndexCount
      }
    }
    if (willRenderEdges) {
      drawCalls++
      if (useComputeMode) {
        lines += Math.floor(this.computeEdgeVertexCount / 2)
        vertices += this.computeEdgeVertexCount
      } else if (this.edgeIndexCount > 0) {
        lines += Math.floor(this.edgeIndexCount / 2)
        vertices += this.edgeIndexCount
      }
    }

    this.lastDrawStats = {
      calls: drawCalls,
      triangles,
      vertices,
      lines,
      points: 0,
    }
  }

  /**
   * Get draw statistics from the last execute() call.
   */
  getDrawStats(): import('../core/types').WebGPUPassDrawStats {
    return this.lastDrawStats
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    // Legacy pipelines
    this.facePipeline = null
    this.edgePipeline = null

    // Compute pipelines
    this.faceComputePipeline = null
    this.edgeComputePipeline = null

    // Bind groups
    this.cameraBindGroup = null
    this.polytopeBindGroup = null
    this.computeBufferBindGroup = null
    this.computeBufferBindGroupLayout = null

    // Uniform buffers
    this.cameraUniformBuffer?.destroy()
    this.lightingUniformBuffer?.destroy()
    this.polytopeUniformBuffer?.destroy()

    // Vertex/index buffers
    this.faceVertexBuffer?.destroy()
    this.faceIndexBuffer?.destroy()
    this.edgeVertexBuffer?.destroy()
    this.edgeIndexBuffer?.destroy()

    this.cameraUniformBuffer = null
    this.lightingUniformBuffer = null
    this.polytopeUniformBuffer = null
    this.faceVertexBuffer = null
    this.faceIndexBuffer = null
    this.edgeVertexBuffer = null
    this.edgeIndexBuffer = null

    // Compute passes (they handle their own buffer cleanup)
    this.transformComputePass?.dispose()
    this.normalComputePass?.dispose()
    this.transformComputePass = null
    this.normalComputePass = null
    this.computeInitialized = false

    super.dispose()
  }
}
