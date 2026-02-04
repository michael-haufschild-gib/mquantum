/**
 * Polytope Normal Compute Pass
 *
 * Pre-computes face normals from transformed 3D positions using a compute shader.
 * This replaces expensive normal computation in vertex shader (geometry mode) or
 * fragment shader (screen-space dFdx/dFdy mode) with a single efficient compute pass.
 *
 * Benefits:
 * - Normals computed once per frame, not per-pixel
 * - No screen-space artifacts at triangle edges (dFdx/dFdy issue)
 * - Consistent quality across all dimensions (3D-11D)
 * - Reduces vertex shader complexity
 *
 * Performance expectations:
 * - Low dimensions (3D-4D): 20% improvement (removes neighbor vertex transforms)
 * - High dimensions (5D-11D): 40% improvement (removes expensive dFdx/dFdy)
 *
 * @module rendering/webgpu/passes/PolytopeNormalComputePass
 */

import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { composePolytopeNormalComputeShader } from '../shaders/polytope/compute/compose'

// Compute parameters struct size (must match WGSL NormalComputeParams)
// triangleCount (4) + vertexCount (4) + _pad0 (4) + _pad1 (4) = 16 bytes
const COMPUTE_PARAMS_SIZE = 16

// Triangle indices stride: TriangleIndices struct = 16 bytes (3 * u32 + pad)
const TRIANGLE_INDICES_STRIDE = 16

// Face normal stride: FaceNormal struct = 16 bytes (vec3f + pad)
const FACE_NORMAL_STRIDE = 16

// Workgroup size (must match shader @workgroup_size)
const WORKGROUP_SIZE = 256

// Default max triangles (supports largest 11D polytopes)
// 11D hypercube has ~56K triangles, so 100K is safe margin
const DEFAULT_MAX_TRIANGLES = 100_000

/**
 * Configuration for the polytope normal compute pass.
 */
export interface PolytopeNormalComputeConfig {
  /** Maximum number of triangles to support (default: 100,000) */
  maxTriangles?: number
  /** Maximum number of vertices (for bounds checking, default: 100,000) */
  maxVertices?: number
  /** Enable debug output (optional) */
  debug?: boolean
}

/**
 * Compute pass that pre-computes face normals from transformed positions.
 *
 * The pass reads transformed 3D positions (from PolytopeTransformComputePass)
 * and triangle indices, then outputs one normal per triangle face.
 * The render pass then reads from the output buffer instead of computing
 * normals in vertex/fragment shaders.
 *
 * Usage:
 * 1. Create pass with config
 * 2. Call setup() to initialize GPU resources
 * 3. Use setTransformedVertexBuffer() to connect to transform pass output
 * 4. Call updateTriangleIndices() when geometry changes
 * 5. Call execute() each frame to recompute normals
 * 6. Read from getNormalBuffer() in render pass
 */
export class PolytopeNormalComputePass extends WebGPUBaseComputePass {
  // Configuration
  private passConfig: PolytopeNormalComputeConfig

  // GPU resources
  private transformedVertexBuffer: GPUBuffer | null = null // External, not owned
  private triangleIndexBuffer: GPUBuffer | null = null
  private normalOutputBuffer: GPUBuffer | null = null
  private computeParamsBuffer: GPUBuffer | null = null
  private computeBindGroup: GPUBindGroup | null = null
  private computeBindGroupLayout: GPUBindGroupLayout | null = null

  // Buffer management
  private maxTriangles: number
  private activeTriangleCount = 0
  private activeVertexCount = 0

  // Pre-allocated buffer for computeParams to avoid per-call allocation
  private computeParamsData = new ArrayBuffer(COMPUTE_PARAMS_SIZE)
  private computeParamsU32View = new Uint32Array(this.computeParamsData)

  // Dirty tracking
  private needsRecompute = true
  private lastTriangleVersion = -1
  private bindGroupNeedsRecreate = true

  constructor(config?: PolytopeNormalComputeConfig) {
    super({
      id: 'polytope-normal-compute',
      inputs: [], // No render graph inputs - uses external buffers
      outputs: [], // No render graph outputs - exposes buffers directly
      isCompute: true,
      workgroupSize: [WORKGROUP_SIZE, 1, 1],
    })
    this.passConfig = config ?? {}
    this.maxTriangles = config?.maxTriangles ?? DEFAULT_MAX_TRIANGLES
  }

  /**
   * Create the compute pipeline and resources.
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Compose compute shader
    const { wgsl } = composePolytopeNormalComputeShader({
      debug: this.passConfig.debug,
    })

    // Create shader module
    const shaderModule = this.createShaderModule(device, wgsl, 'polytope-normal-compute')

    // Create triangle index buffer (owned by this pass)
    this.triangleIndexBuffer = device.createBuffer({
      label: 'polytope-normal-triangle-indices',
      size: this.maxTriangles * TRIANGLE_INDICES_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    // Create normal output buffer
    this.normalOutputBuffer = device.createBuffer({
      label: 'polytope-normal-output',
      size: this.maxTriangles * FACE_NORMAL_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC,
    })

    // Create compute params uniform buffer
    this.computeParamsBuffer = this.createUniformBuffer(
      device,
      COMPUTE_PARAMS_SIZE,
      'polytope-normal-compute-params'
    )

    // Create bind group layout
    this.computeBindGroupLayout = device.createBindGroupLayout({
      label: 'polytope-normal-compute-bgl',
      entries: [
        {
          // NormalComputeParams uniform
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' as const },
        },
        {
          // Transformed vertices (storage, read-only) - external buffer
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' as const },
        },
        {
          // Triangle indices (storage, read-only)
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' as const },
        },
        {
          // Output normals (storage, read-write)
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' as const },
        },
      ],
    })

    // Create compute pipeline
    this.computePipeline = this.createComputePipeline(
      device,
      shaderModule,
      [this.computeBindGroupLayout],
      'polytope-normal-compute'
    )

    // Bind group will be created when setTransformedVertexBuffer is called
    this.bindGroupNeedsRecreate = true
  }

  /**
   * Set the transformed vertex buffer from PolytopeTransformComputePass.
   *
   * This connects the normal compute pass to the output of the transform pass.
   * Must be called after both passes are initialized and whenever the transform
   * pass recreates its output buffer.
   *
   * @param buffer - The transformed vertex buffer (from PolytopeTransformComputePass.getOutputBuffer())
   * @param vertexCount - Number of active vertices in the buffer
   */
  setTransformedVertexBuffer(buffer: GPUBuffer, vertexCount: number): void {
    if (this.transformedVertexBuffer !== buffer) {
      this.transformedVertexBuffer = buffer
      this.bindGroupNeedsRecreate = true
    }
    if (this.activeVertexCount !== vertexCount) {
      this.activeVertexCount = vertexCount
      this.needsRecompute = true
    }
  }

  /**
   * Recreate bind group with current buffers.
   *
   * Called internally when the transformed vertex buffer changes or
   * when other buffers are recreated.
   */
  private recreateBindGroup(): void {
    if (!this.device || !this.computeBindGroupLayout) {
      return
    }

    if (!this.transformedVertexBuffer) {
      console.warn('PolytopeNormalComputePass: Cannot create bind group without transformed vertex buffer')
      return
    }

    if (!this.computeParamsBuffer || !this.triangleIndexBuffer || !this.normalOutputBuffer) {
      console.warn('PolytopeNormalComputePass: Buffers not initialized')
      return
    }

    this.computeBindGroup = this.device.createBindGroup({
      label: 'polytope-normal-compute-bg',
      layout: this.computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.computeParamsBuffer } },
        { binding: 1, resource: { buffer: this.transformedVertexBuffer } },
        { binding: 2, resource: { buffer: this.triangleIndexBuffer } },
        { binding: 3, resource: { buffer: this.normalOutputBuffer } },
      ],
    })

    this.bindGroupNeedsRecreate = false
  }

  /**
   * Update triangle indices from CPU data.
   *
   * This uploads triangle vertex indices to the index buffer.
   * Each triangle is 3 indices (i0, i1, i2) packed with padding.
   *
   * @param device - GPU device
   * @param indices - Flat array of triangle indices [i0, i1, i2, i0, i1, i2, ...]
   * @param triangleCount - Number of triangles
   * @param version - Version number for dirty tracking (optional)
   */
  updateTriangleIndices(
    device: GPUDevice,
    indices: Uint32Array,
    triangleCount: number,
    version?: number
  ): void {
    if (!this.triangleIndexBuffer) {
      console.warn('PolytopeNormalComputePass: Triangle index buffer not initialized')
      return
    }

    if (triangleCount > this.maxTriangles) {
      console.warn(
        `PolytopeNormalComputePass: triangleCount (${triangleCount}) exceeds maxTriangles (${this.maxTriangles})`
      )
      return
    }

    // Check version for dirty tracking
    if (version !== undefined && version === this.lastTriangleVersion) {
      // Indices haven't changed, skip upload
      return
    }

    // Create padded buffer (3 indices input → 4 for alignment)
    const paddedData = new Uint32Array(triangleCount * 4)

    for (let i = 0; i < triangleCount; i++) {
      const srcOffset = i * 3
      const dstOffset = i * 4

      paddedData[dstOffset + 0] = indices[srcOffset + 0]!
      paddedData[dstOffset + 1] = indices[srcOffset + 1]!
      paddedData[dstOffset + 2] = indices[srcOffset + 2]!
      paddedData[dstOffset + 3] = 0 // _pad
    }

    device.queue.writeBuffer(this.triangleIndexBuffer, 0, paddedData)
    this.activeTriangleCount = triangleCount
    this.needsRecompute = true

    if (version !== undefined) {
      this.lastTriangleVersion = version
    }
  }

  /**
   * Update compute parameters.
   *
   * @param device - GPU device
   */
  private updateComputeParams(device: GPUDevice): void {
    if (!this.computeParamsBuffer) return

    // Build compute params data
    // Layout: triangleCount (u32) + vertexCount (u32) + _pad0 (u32) + _pad1 (u32)
    this.computeParamsU32View[0] = this.activeTriangleCount
    this.computeParamsU32View[1] = this.activeVertexCount
    this.computeParamsU32View[2] = 0 // _pad0
    this.computeParamsU32View[3] = 0 // _pad1

    device.queue.writeBuffer(this.computeParamsBuffer, 0, this.computeParamsData)
  }

  /**
   * Mark the pass as needing recomputation.
   * Call this when transform pass outputs new data.
   */
  markDirty(): void {
    this.needsRecompute = true
  }

  /**
   * Check if recomputation is needed.
   */
  needsUpdate(): boolean {
    return this.needsRecompute && this.activeTriangleCount > 0 && this.transformedVertexBuffer !== null
  }

  /**
   * Execute the compute pass.
   */
  execute(ctx: WebGPURenderContext): void {
    if (!this.computePipeline) {
      console.warn('PolytopeNormalComputePass: Pipeline not initialized')
      return
    }

    // Recreate bind group if needed (e.g., after setTransformedVertexBuffer)
    if (this.bindGroupNeedsRecreate) {
      this.recreateBindGroup()
    }

    if (!this.computeBindGroup) {
      console.warn('PolytopeNormalComputePass: Bind group not initialized')
      return
    }

    // Early exit if no update needed
    if (!this.needsUpdate()) {
      return
    }

    // Update compute params
    this.updateComputeParams(ctx.device)

    // Create compute pass
    const computePass = ctx.beginComputePass({
      label: 'polytope-normal-compute-pass',
    })

    // Calculate dispatch size
    const workgroupCount = Math.ceil(this.activeTriangleCount / WORKGROUP_SIZE)

    // Dispatch compute shader
    this.dispatchCompute(computePass, this.computePipeline, [this.computeBindGroup], workgroupCount)

    computePass.end()

    // Clear dirty flag
    this.needsRecompute = false
  }

  /**
   * Get the output buffer containing computed face normals.
   * Format: array<FaceNormal> where FaceNormal = { normal: vec3f, _pad: f32 }
   */
  getNormalBuffer(): GPUBuffer | null {
    return this.normalOutputBuffer
  }

  /**
   * Get the number of active triangles.
   */
  getTriangleCount(): number {
    return this.activeTriangleCount
  }

  /**
   * Get the normal stride in bytes.
   */
  getNormalStride(): number {
    return FACE_NORMAL_STRIDE
  }

  /**
   * Get the maximum supported triangle count.
   */
  getMaxTriangles(): number {
    return this.maxTriangles
  }

  /**
   * Dispose of GPU resources.
   */
  dispose(): void {
    // Note: transformedVertexBuffer is not owned by this pass, don't destroy it
    this.transformedVertexBuffer = null

    this.triangleIndexBuffer?.destroy()
    this.triangleIndexBuffer = null
    this.normalOutputBuffer?.destroy()
    this.normalOutputBuffer = null
    this.computeParamsBuffer?.destroy()
    this.computeParamsBuffer = null
    this.computeBindGroup = null
    this.computeBindGroupLayout = null

    super.dispose()
  }
}
