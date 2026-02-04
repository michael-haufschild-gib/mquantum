/**
 * Polytope Transform Compute Pass
 *
 * Pre-computes N-dimensional vertex transformations on GPU using a compute shader.
 * This replaces expensive per-vertex transforms in the vertex shader with a
 * compute pass that only runs when transform parameters change.
 *
 * Performance expectations:
 * - Before: N-D transform in vertex shader runs per-vertex per-frame
 * - After: N-D transform in compute shader runs only when transforms change
 * - Expected improvement: 30-50% vertex shader cost reduction
 *
 * @module rendering/webgpu/passes/PolytopeTransformComputePass
 */

import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { composePolytopeTransformComputeShader } from '../shaders/polytope/compute/compose'

// Compute parameters struct size (must match WGSL ComputeParams)
// vertexCount (4) + dimension (4) + uniformScale (4) + projectionDistance (4) +
// depthNormFactor (4) + _pad0 (4) + _pad1 (4) + _pad2 (4) = 32 bytes
const COMPUTE_PARAMS_SIZE = 32

// Transform uniforms struct size (must match WGSL TransformUniforms)
// rotationMatrix4D: mat4x4f (64) + 7 * extraRotCol: vec4f (112) +
// depthRowSums0_3: vec4f (16) + depthRowSums4_7: vec4f (16) +
// depthRowSums8_10: vec3f (12) + _padDepth: f32 (4) = 224 bytes
const TRANSFORM_UNIFORMS_SIZE = 224

// Input vertex stride: NDVertex struct = 48 bytes (12 floats with padding)
const INPUT_VERTEX_STRIDE = 48

// Output vertex stride: TransformedVertex struct = 16 bytes (vec3f + f32)
const OUTPUT_VERTEX_STRIDE = 16

// Workgroup size (must match shader @workgroup_size)
const WORKGROUP_SIZE = 256

// Default max vertices (supports largest 11D polytopes)
const DEFAULT_MAX_VERTICES = 100_000

/**
 * Configuration for the polytope transform compute pass.
 */
export interface PolytopeTransformComputeConfig {
  /** Maximum number of vertices to support (default: 100,000) */
  maxVertices?: number
  /** Number of dimensions (3-11) */
  dimension: number
}

/**
 * Compute pass that pre-computes N-D vertex transformations.
 *
 * The pass takes raw N-dimensional vertex positions and transform parameters,
 * and outputs transformed 3D positions with depth values for color algorithms.
 * The render pass then reads from the output buffer instead of computing
 * transforms in the vertex shader.
 */
export class PolytopeTransformComputePass extends WebGPUBaseComputePass {
  // Configuration
  private passConfig: PolytopeTransformComputeConfig

  // GPU resources
  private inputBuffer: GPUBuffer | null = null
  private outputBuffer: GPUBuffer | null = null
  private computeParamsBuffer: GPUBuffer | null = null
  private transformUniformBuffer: GPUBuffer | null = null
  private computeBindGroup: GPUBindGroup | null = null
  private computeBindGroupLayout: GPUBindGroupLayout | null = null

  // Buffer management
  private maxVertices: number
  private activeVertexCount = 0

  // Pre-allocated buffer for computeParams to avoid per-call allocation
  private computeParamsData = new ArrayBuffer(COMPUTE_PARAMS_SIZE)
  private computeParamsU32View = new Uint32Array(this.computeParamsData)
  private computeParamsI32View = new Int32Array(this.computeParamsData)
  private computeParamsF32View = new Float32Array(this.computeParamsData)

  // Dirty tracking
  private needsRecompute = true
  private lastTransformVersion = -1
  private lastDimension = -1

  constructor(config: PolytopeTransformComputeConfig) {
    super({
      id: 'polytope-transform-compute',
      inputs: [], // No render graph inputs - uses its own buffers
      outputs: [], // No render graph outputs - exposes buffers directly
      isCompute: true,
      workgroupSize: [WORKGROUP_SIZE, 1, 1],
    })
    this.passConfig = config
    this.maxVertices = config.maxVertices ?? DEFAULT_MAX_VERTICES
  }

  /**
   * Create the compute pipeline and resources.
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Compose compute shader
    const { wgsl } = composePolytopeTransformComputeShader({
      dimension: this.passConfig.dimension,
    })

    // Create shader module
    const shaderModule = this.createShaderModule(device, wgsl, 'polytope-transform-compute')

    // Create input buffer (raw N-D vertices)
    this.inputBuffer = device.createBuffer({
      label: 'polytope-transform-input',
      size: this.maxVertices * INPUT_VERTEX_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    // Create output buffer (transformed 3D vertices)
    this.outputBuffer = device.createBuffer({
      label: 'polytope-transform-output',
      size: this.maxVertices * OUTPUT_VERTEX_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC,
    })

    // Create uniform buffers
    this.computeParamsBuffer = this.createUniformBuffer(
      device,
      COMPUTE_PARAMS_SIZE,
      'polytope-compute-params'
    )
    this.transformUniformBuffer = this.createUniformBuffer(
      device,
      TRANSFORM_UNIFORMS_SIZE,
      'polytope-transform-uniforms'
    )

    // Create bind group layout
    this.computeBindGroupLayout = device.createBindGroupLayout({
      label: 'polytope-transform-compute-bgl',
      entries: [
        {
          // ComputeParams uniform
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' as const },
        },
        {
          // TransformUniforms uniform
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' as const },
        },
        {
          // Input vertices (storage, read-only)
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' as const },
        },
        {
          // Output vertices (storage, read-write)
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' as const },
        },
      ],
    })

    // Create bind group
    this.computeBindGroup = device.createBindGroup({
      label: 'polytope-transform-compute-bg',
      layout: this.computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.computeParamsBuffer } },
        { binding: 1, resource: { buffer: this.transformUniformBuffer } },
        { binding: 2, resource: { buffer: this.inputBuffer } },
        { binding: 3, resource: { buffer: this.outputBuffer } },
      ],
    })

    // Create compute pipeline
    this.computePipeline = this.createComputePipeline(
      device,
      shaderModule,
      [this.computeBindGroupLayout],
      'polytope-transform-compute'
    )
  }

  /**
   * Update input vertices from CPU data.
   *
   * This uploads raw N-D vertex positions to the input buffer.
   * The data format is: position (vec3f), extraDims0_3 (vec4f), extraDims4_6 (vec3f)
   * = 10 floats per vertex, which needs to be padded to 12 floats (48 bytes) for alignment.
   *
   * @param device - GPU device
   * @param vertices - Raw vertex data (10 floats per vertex, unpadded)
   * @param vertexCount - Number of vertices
   */
  updateInputVertices(device: GPUDevice, vertices: Float32Array, vertexCount: number): void {
    if (!this.inputBuffer) {
      console.warn('PolytopeTransformComputePass: Input buffer not initialized')
      return
    }

    if (vertexCount > this.maxVertices) {
      console.warn(
        `PolytopeTransformComputePass: vertexCount (${vertexCount}) exceeds maxVertices (${this.maxVertices})`
      )
      return
    }

    // Create padded buffer (10 floats input → 12 floats for alignment)
    const paddedData = new Float32Array(vertexCount * 12) // 12 floats = 48 bytes per vertex

    for (let i = 0; i < vertexCount; i++) {
      const srcOffset = i * 10
      const dstOffset = i * 12

      // Position (3 floats)
      paddedData[dstOffset + 0] = vertices[srcOffset + 0]!
      paddedData[dstOffset + 1] = vertices[srcOffset + 1]!
      paddedData[dstOffset + 2] = vertices[srcOffset + 2]!
      paddedData[dstOffset + 3] = 0.0 // _pad0

      // ExtraDims0_3 (4 floats)
      paddedData[dstOffset + 4] = vertices[srcOffset + 3]!
      paddedData[dstOffset + 5] = vertices[srcOffset + 4]!
      paddedData[dstOffset + 6] = vertices[srcOffset + 5]!
      paddedData[dstOffset + 7] = vertices[srcOffset + 6]!

      // ExtraDims4_6 (3 floats)
      paddedData[dstOffset + 8] = vertices[srcOffset + 7]!
      paddedData[dstOffset + 9] = vertices[srcOffset + 8]!
      paddedData[dstOffset + 10] = vertices[srcOffset + 9]!
      paddedData[dstOffset + 11] = 0.0 // _pad1
    }

    device.queue.writeBuffer(this.inputBuffer, 0, paddedData)
    this.activeVertexCount = vertexCount
    this.needsRecompute = true
  }

  /**
   * Update transform uniforms.
   *
   * @param device - GPU device
   * @param rotationMatrix4D - 4x4 rotation matrix (16 floats)
   * @param extraRotationCols - Extra rotation columns for 5D+ (28 floats max)
   * @param depthRowSums - Depth row sums (11 floats)
   * @param version - Version number for dirty tracking
   */
  updateTransformUniforms(
    device: GPUDevice,
    rotationMatrix4D: Float32Array,
    extraRotationCols: Float32Array,
    depthRowSums: Float32Array,
    version: number
  ): void {
    if (!this.transformUniformBuffer) return

    // Only mark dirty if version changed
    if (version !== this.lastTransformVersion) {
      this.needsRecompute = true
      this.lastTransformVersion = version
    }

    // Build transform uniform data
    // Layout: rotationMatrix4D (64) + 7*extraRotCol (112) + depthRowSums (32)
    const data = new Float32Array(TRANSFORM_UNIFORMS_SIZE / 4)

    // rotationMatrix4D (16 floats at offset 0)
    for (let i = 0; i < 16 && i < rotationMatrix4D.length; i++) {
      data[i] = rotationMatrix4D[i]!
    }

    // extraRotCols (28 floats at offset 16)
    for (let i = 0; i < 28 && i < extraRotationCols.length; i++) {
      data[16 + i] = extraRotationCols[i]!
    }

    // depthRowSums0_3 (4 floats at offset 44)
    for (let i = 0; i < 4 && i < depthRowSums.length; i++) {
      data[44 + i] = depthRowSums[i]!
    }

    // depthRowSums4_7 (4 floats at offset 48)
    for (let i = 0; i < 4 && i + 4 < depthRowSums.length; i++) {
      data[48 + i] = depthRowSums[i + 4]!
    }

    // depthRowSums8_10 (3 floats at offset 52) + _padDepth (1 float at offset 55)
    for (let i = 0; i < 3 && i + 8 < depthRowSums.length; i++) {
      data[52 + i] = depthRowSums[i + 8]!
    }
    data[55] = 0.0 // _padDepth

    device.queue.writeBuffer(this.transformUniformBuffer, 0, data)
  }

  /**
   * Update compute parameters.
   *
   * @param device - GPU device
   * @param dimension - Number of dimensions (3-11)
   * @param uniformScale - Scale factor applied after projection
   * @param projectionDistance - Perspective projection distance
   */
  updateComputeParams(
    device: GPUDevice,
    dimension: number,
    uniformScale: number,
    projectionDistance: number
  ): void {
    if (!this.computeParamsBuffer) return

    // Check if dimension changed
    if (dimension !== this.lastDimension) {
      this.needsRecompute = true
      this.lastDimension = dimension
    }

    // Build compute params data
    // Layout: vertexCount (u32) + dimension (i32) + uniformScale (f32) +
    //         projectionDistance (f32) + depthNormFactor (f32) + 3 * padding (f32)
    this.computeParamsU32View[0] = this.activeVertexCount
    this.computeParamsI32View[1] = dimension
    this.computeParamsF32View[2] = uniformScale
    this.computeParamsF32View[3] = projectionDistance
    this.computeParamsF32View[4] = dimension > 4 ? Math.sqrt(dimension - 3) : 1.0 // depthNormFactor
    this.computeParamsF32View[5] = 0.0 // _pad0
    this.computeParamsF32View[6] = 0.0 // _pad1
    this.computeParamsF32View[7] = 0.0 // _pad2

    device.queue.writeBuffer(this.computeParamsBuffer, 0, this.computeParamsData)
  }

  /**
   * Mark the pass as needing recomputation.
   * Call this when any transform parameter changes.
   */
  markDirty(): void {
    this.needsRecompute = true
  }

  /**
   * Check if recomputation is needed.
   */
  needsUpdate(): boolean {
    return this.needsRecompute && this.activeVertexCount > 0
  }

  /**
   * Execute the compute pass.
   */
  execute(ctx: WebGPURenderContext): void {
    if (!this.computePipeline || !this.computeBindGroup) {
      console.warn('PolytopeTransformComputePass: Pipeline not initialized')
      return
    }

    // Early exit if no update needed
    if (!this.needsUpdate()) {
      return
    }

    // Create compute pass
    const computePass = ctx.beginComputePass({
      label: 'polytope-transform-compute-pass',
    })

    // Calculate dispatch size
    const workgroupCount = Math.ceil(this.activeVertexCount / WORKGROUP_SIZE)

    // Dispatch compute shader
    this.dispatchCompute(computePass, this.computePipeline, [this.computeBindGroup], workgroupCount)

    computePass.end()

    // Clear dirty flag
    this.needsRecompute = false
  }

  /**
   * Get the output buffer containing transformed vertices.
   * Format: array<TransformedVertex> where TransformedVertex = { position: vec3f, depth: f32 }
   */
  getOutputBuffer(): GPUBuffer | null {
    return this.outputBuffer
  }

  /**
   * Get the number of active vertices.
   */
  getVertexCount(): number {
    return this.activeVertexCount
  }

  /**
   * Get the output vertex stride in bytes.
   */
  getOutputStride(): number {
    return OUTPUT_VERTEX_STRIDE
  }

  /**
   * Get the maximum supported vertex count.
   */
  getMaxVertices(): number {
    return this.maxVertices
  }

  /**
   * Set the dimension (triggers shader recompilation if changed).
   * Note: For dimension changes, you may need to recreate the pipeline.
   */
  setDimension(dimension: number): void {
    if (dimension !== this.passConfig.dimension) {
      this.passConfig.dimension = dimension
      // Note: Full pipeline recreation would require re-initialization
      // For now, dimension is a runtime parameter in compute params
      this.markDirty()
    }
  }

  /**
   * Dispose of GPU resources.
   */
  dispose(): void {
    this.inputBuffer?.destroy()
    this.inputBuffer = null
    this.outputBuffer?.destroy()
    this.outputBuffer = null
    this.computeParamsBuffer?.destroy()
    this.computeParamsBuffer = null
    this.transformUniformBuffer?.destroy()
    this.transformUniformBuffer = null
    this.computeBindGroup = null
    this.computeBindGroupLayout = null

    super.dispose()
  }
}
