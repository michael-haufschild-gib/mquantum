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
  /**
   * Whether to clear the color/depth buffers before rendering.
   * - true: Clear buffers (use when TubeWireframe is the primary/only renderer, e.g., torus types)
   * - false: Load existing content (use when rendering on top of another pass, e.g., thick polytope edges)
   * Default: true
   */
  clearBuffer?: boolean
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
  private lightingBindGroup: GPUBindGroup | null = null
  private tubeBindGroup: GPUBindGroup | null = null

  // Uniform buffers
  private cameraUniformBuffer: GPUBuffer | null = null
  private lightingUniformBuffer: GPUBuffer | null = null
  private tubeUniformBuffer: GPUBuffer | null = null

  // Geometry buffers
  private cylinderVertexBuffer: GPUBuffer | null = null
  private cylinderIndexBuffer: GPUBuffer | null = null
  private cylinderIndexCount = 0
  private instanceBuffer: GPUBuffer | null = null
  private instanceCount = 0

  // Cylinder segments
  private cylinderSegments: number

  // Whether to clear buffers (true for primary renderer, false when adding to existing content)
  private clearBuffer: boolean

  // Draw statistics from last execute()
  private lastDrawStats: import('../core/types').WebGPUPassDrawStats = {
    calls: 0,
    triangles: 0,
    vertices: 0,
    lines: 0,
    points: 0,
  }

  constructor(config?: TubeWireframeRendererConfig) {
    super({
      id: 'tube-wireframe',
      priority: 100,
      inputs: [],
      outputs: [
        // Write to object-color to match Polytope renderer (composited over environment later)
        { resourceId: 'object-color', access: 'write' as const, binding: 0 },
        { resourceId: 'depth-buffer', access: 'write' as const, binding: 1 },
      ],
    })

    this.rendererConfig = {
      dimension: 4,
      radius: 0.02,
      cylinderSegments: 8,
      pbr: true,
      shadows: false,
      clearBuffer: true, // Default: clear (for when TubeWireframe is primary renderer)
      ...config,
    }

    this.clearBuffer = this.rendererConfig.clearBuffer ?? true
    this.cylinderSegments = this.rendererConfig.cylinderSegments ?? 8

    this.shaderConfig = {
      shadows: this.rendererConfig.shadows,
      pbr: this.rendererConfig.pbr,
    }
  }

  /**
   * Create the rendering pipeline.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

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

    // Group 1: Lighting
    const lightingBindGroupLayout = device.createBindGroupLayout({
      label: 'tubewireframe-lighting-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const },
        },
      ],
    })

    // Group 2: Tube uniforms
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

    // Create pipeline layout - consolidated to 3 groups (max 4 allowed)
    const pipelineLayout = device.createPipelineLayout({
      label: 'tubewireframe-pipeline-layout',
      bindGroupLayouts: [
        cameraBindGroupLayout,    // group 0: camera
        lightingBindGroupLayout,  // group 1: lighting
        tubeBindGroupLayout,      // group 2: tube uniforms
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
        // Use HDR format to match render targets (hdr-color is rgba16float)
        targets: [{ format: 'rgba16float' as GPUTextureFormat }],
      },
      primitive: {
        topology: 'triangle-list' as const,
        cullMode: 'back' as const,
      },
      depthStencil: {
        // Use depth24plus to match depth-buffer resource
        format: 'depth24plus',
        // Match WebGL: depthTest=true, depthWrite=false
        // Tubes test against depth but don't write, allowing proper layering
        depthWriteEnabled: false,
        depthCompare: 'less',
      },
    })

    // Create uniform buffers
    // CameraUniforms: 7 mat4x4f (448) + vec3f+f32 (16) + 4×f32+vec2f (16) + 4×f32 (16) = 496 bytes, round to 512
    this.cameraUniformBuffer = this.createUniformBuffer(device, 512, 'tubewireframe-camera')
    // LightingUniforms: 576 bytes (same as other renderers)
    this.lightingUniformBuffer = this.createUniformBuffer(device, 576, 'tubewireframe-lighting')
    this.tubeUniformBuffer = this.createUniformBuffer(device, 512, 'tubewireframe-uniforms')

    // Create bind groups
    // Group 0: Camera
    this.cameraBindGroup = device.createBindGroup({
      label: 'tubewireframe-camera-bg',
      layout: cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraUniformBuffer } }],
    })

    // Group 1: Lighting
    this.lightingBindGroup = device.createBindGroup({
      label: 'tubewireframe-lighting-bg',
      layout: lightingBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.lightingUniformBuffer } }],
    })

    // Group 2: Tube
    this.tubeBindGroup = device.createBindGroup({
      label: 'tubewireframe-object-bg',
      layout: tubeBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.tubeUniformBuffer } }],
    })

    // Initialize lighting with default values
    this.initializeLightingUniforms(device)

    // Create cylinder geometry
    this.createCylinderGeometry(device, this.cylinderSegments)
  }

  /**
   * Initialize lighting uniform buffer with default values.
   * LightingUniforms layout:
   * - lights[8]: 8 × LightData (64 bytes each) = 512 bytes at offset 0
   * - ambientColor: vec3f at offset 512
   * - ambientIntensity: f32 at offset 524
   * - lightCount: u32 at offset 528
   * @param device
   */
  private initializeLightingUniforms(device: GPUDevice): void {
    if (!this.lightingUniformBuffer) return

    const data = new ArrayBuffer(576)
    const floatView = new Float32Array(data)
    const uintView = new Uint32Array(data)

    // Light 0: Key light (directional from top-right-front)
    // LightData: direction (vec3f), type (u32), color (vec3f), intensity (f32),
    //            position (vec3f), range (f32), innerCone (f32), outerCone (f32), padding (vec2f)
    const light0Offset = 0 // floats
    floatView[light0Offset + 0] = 0.577 // direction.x (normalized 1,1,1)
    floatView[light0Offset + 1] = 0.577 // direction.y
    floatView[light0Offset + 2] = 0.577 // direction.z
    uintView[light0Offset + 3] = 0 // type: 0 = directional
    floatView[light0Offset + 4] = 1.0 // color.r
    floatView[light0Offset + 5] = 1.0 // color.g
    floatView[light0Offset + 6] = 1.0 // color.b
    floatView[light0Offset + 7] = 1.0 // intensity

    // Ambient lighting at offset 512 bytes = 128 floats
    const ambientOffset = 128
    floatView[ambientOffset + 0] = 0.1 // ambientColor.r
    floatView[ambientOffset + 1] = 0.1 // ambientColor.g
    floatView[ambientOffset + 2] = 0.1 // ambientColor.b
    floatView[ambientOffset + 3] = 1.0 // ambientIntensity

    // Light count at offset 528 bytes = 132 floats
    uintView[132] = 1 // lightCount

    device.queue.writeBuffer(this.lightingUniformBuffer, 0, data)
  }

  /**
   * Create cylinder geometry for tube rendering.
   * @param device
   * @param segments
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
   * @param dimension
   */
  setDimension(dimension: number): void {
    this.rendererConfig.dimension = dimension
  }

  /**
   * Set the tube radius.
   * @param radius
   */
  setRadius(radius: number): void {
    this.rendererConfig.radius = radius
  }

  /**
   * Update tube instances (edges).
   * Each edge is defined by two N-D vertices.
   * @param device
   * @param edges
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
   * @param ctx
   */
  private updateCameraUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.cameraUniformBuffer) return

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
    // For TubeWireframe, use identity (no scale transformation needed for mesh rendering)
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
    data[115] = camera.near ?? 0.1 // cameraNear (packed with cameraPosition)
    data[116] = camera.far ?? 1000 // cameraFar
    data[117] = camera.fov ?? 50 // fov
    data[118] = ctx.size.width // resolution.x
    data[119] = ctx.size.height // resolution.y
    data[120] = ctx.size.width / ctx.size.height // aspectRatio
    data[121] = ctx.frame?.time ?? 0 // time
    data[122] = ctx.frame?.delta ?? 0.016 // deltaTime
    data[123] = ctx.frame?.frameNumber ?? 0 // frameNumber

    this.writeUniformBuffer(this.device, this.cameraUniformBuffer, data)
  }

  /**
   * Update tube uniforms.
   * @param uniforms
   * @param uniforms.rotationMatrix4D
   * @param uniforms.extraRotationCols
   * @param uniforms.depthRowSums
   * @param uniforms.baseColor
   * @param uniforms.opacity
   * @param uniforms.roughness
   * @param uniforms.metalness
   * @param uniforms.ambientIntensity
   * @param uniforms.emissiveIntensity
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
   * Update tube uniforms from Zustand stores.
   * Reads ndTransform for N-D rotation data (matching WebGL TubeWireframe.tsx useFrame)
   * @param ctx
   */
  private updateTubeFromStores(ctx: WebGPURenderContext): void {
    // Read N-D transform data (same pattern as WebGPUPolytopeRenderer)
    const ndTransform = ctx.frame?.stores?.['ndTransform'] as {
      rotationMatrix4D?: number[]
      extraRotationCols?: number[]
      depthRowSums?: number[]
      projectionDistance?: number
    }

    // Read extended store for uniformScale (polytope.scale acts like camera zoom)
    const extended = ctx.frame?.stores?.['extended'] as {
      polytope?: { scale?: number }
    }

    const pbr = ctx.frame?.stores?.['pbr'] as {
      edge?: { roughness?: number; metallic?: number }
      roughness?: number
      metalness?: number
    }
    const appearance = ctx.frame?.stores?.['appearance'] as {
      colorAlgorithm?: string
      edgeColor?: string
      cosineCoefficients?: { a: number[]; b: number[]; c: number[]; d: number[] }
    }

    // Parse edge color (WebGL uses appearance.edgeColor)
    const baseColor = appearance?.edgeColor
      ? this.parseColor(appearance.edgeColor)
      : this.getBaseColorFromAppearance(appearance)

    // Get PBR from edge-specific settings if available, otherwise fallback
    const roughness = pbr?.edge?.roughness ?? pbr?.roughness ?? 0.5
    const metalness = pbr?.edge?.metallic ?? pbr?.metalness ?? 0.0

    this.updateTubeUniforms({
      // N-D Transform data (critical for proper rendering)
      rotationMatrix4D: ndTransform?.rotationMatrix4D,
      extraRotationCols: ndTransform?.extraRotationCols,
      depthRowSums: ndTransform?.depthRowSums,
      // Material
      baseColor,
      roughness,
      metalness,
      ambientIntensity: 0.3,
      emissiveIntensity: 0.0,
    })

    // Also update dimension-related uniforms directly in the buffer
    // These are set in updateTubeUniforms but we need to update projectionDistance from ndTransform
    if (this.device && this.tubeUniformBuffer && ndTransform) {
      const data = new Float32Array(4)
      data[0] = this.rendererConfig.dimension ?? 4 // dimension
      data[1] = extended?.polytope?.scale ?? 1.0 // uniformScale (visual scale, applied after projection)
      data[2] = ndTransform.projectionDistance ?? 5.0 // projectionDistance from ndTransform
      data[3] = (this.rendererConfig.dimension ?? 4) > 4
        ? Math.sqrt((this.rendererConfig.dimension ?? 4) - 3)
        : 1.0 // depthNormFactor
      // Write to offset 64 (16 floats = rotationMatrix4D at offset 0)
      this.device.queue.writeBuffer(this.tubeUniformBuffer, 64, data)
    }
  }

  /**
   * Parse hex color string to RGB array [0-1].
   * @param hex
   */
  private parseColor(hex: string): [number, number, number] {
    const cleaned = hex.replace('#', '')
    const r = parseInt(cleaned.substring(0, 2), 16) / 255
    const g = parseInt(cleaned.substring(2, 4), 16) / 255
    const b = parseInt(cleaned.substring(4, 6), 16) / 255
    return [r, g, b]
  }

  /**
   * Update lighting uniforms from stores.
   * Matches the pattern used in WebGPUMandelbulbRenderer.
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

      // position: vec4f (xyz = position, w = type: 0=none, 1=point, 2=directional, 3=spot)
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

  /**
   * Extract base color from appearance store.
   * @param appearance
   */
  private getBaseColorFromAppearance(appearance: {
    colorAlgorithm?: string
    cosineCoefficients?: { a: number[]; b: number[]; c: number[]; d: number[] }
  } | undefined): [number, number, number] {
    if (!appearance?.cosineCoefficients) {
      return [1.0, 1.0, 1.0]
    }
    const { a, b } = appearance.cosineCoefficients
    return [
      Math.min(1, (a[0] ?? 0.5) + (b[0] ?? 0.5)),
      Math.min(1, (a[1] ?? 0.5) + (b[1] ?? 0.5)),
      Math.min(1, (a[2] ?? 0.5) + (b[2] ?? 0.5)),
    ]
  }

  /**
   * Execute the render pass.
   * @param ctx
   */
  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.renderPipeline ||
      !this.cylinderVertexBuffer ||
      !this.cylinderIndexBuffer ||
      !this.cameraBindGroup ||
      !this.lightingBindGroup ||
      !this.tubeBindGroup ||
      !this.instanceBuffer ||
      this.instanceCount === 0
    ) {
      return
    }

    // Update uniforms from stores
    this.updateCameraUniforms(ctx)
    this.updateLightingUniforms(ctx)
    this.updateTubeFromStores(ctx)

    // Get render targets (write to object-color to match Polytope renderer)
    const colorView = ctx.getWriteTarget('object-color')
    const depthView = ctx.getWriteTarget('depth-buffer')

    if (!colorView || !depthView) return

    // Begin render pass
    // Use load or clear based on config:
    // - clearBuffer=true: Clear (for torus types where TubeWireframe is primary renderer)
    // - clearBuffer=false: Load (for thick polytope edges rendered on top of faces)
    const passEncoder = ctx.beginRenderPass({
      label: 'tubewireframe-render',
      colorAttachments: [
        {
          view: colorView,
          loadOp: this.clearBuffer ? 'clear' as const : 'load' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 0 }, // Use alpha=0 for proper compositing
        },
      ],
      depthStencilAttachment: {
        view: depthView,
        depthLoadOp: this.clearBuffer ? 'clear' as const : 'load' as const,
        depthStoreOp: 'store' as const,
        depthClearValue: 1.0,
      },
    })

    passEncoder.setPipeline(this.renderPipeline)
    passEncoder.setBindGroup(0, this.cameraBindGroup)
    passEncoder.setBindGroup(1, this.lightingBindGroup)
    passEncoder.setBindGroup(2, this.tubeBindGroup)

    passEncoder.setVertexBuffer(0, this.cylinderVertexBuffer)
    passEncoder.setVertexBuffer(1, this.instanceBuffer)
    passEncoder.setIndexBuffer(this.cylinderIndexBuffer, 'uint16' as const)

    // Draw instanced cylinders
    passEncoder.drawIndexed(this.cylinderIndexCount, this.instanceCount)

    passEncoder.end()

    // Update draw statistics
    // Each cylinder instance draws cylinderIndexCount indices as triangles
    const trianglesPerCylinder = Math.floor(this.cylinderIndexCount / 3)
    this.lastDrawStats = {
      calls: 1, // Instanced draw = 1 call
      triangles: trianglesPerCylinder * this.instanceCount,
      vertices: this.cylinderIndexCount * this.instanceCount,
      lines: this.instanceCount, // Each tube represents one "line" (edge)
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
