/**
 * WebGPU Cubemap Capture Pass
 *
 * Handles cubemap environment maps for both procedural and classic skyboxes.
 * Renders to a CubeRenderTarget with 6 faces for:
 * - Black hole gravitational lensing (scene.background equivalent)
 * - PBR reflections (scene.environment equivalent)
 *
 * Maintains a 2-frame temporal history for proper frame consistency.
 * The black hole shader reads from the previous frame's cubemap.
 *
 * @module rendering/webgpu/passes/CubemapCapturePass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for CubemapCapturePass.
 */
export interface CubemapCapturePassConfig {
  /** Resolution per cube face (default 256) */
  backgroundResolution?: number
  /** Resolution for PMREM environment map (default 256) - reserved for future use */
  environmentResolution?: number
  /** Whether to generate PMREM for scene.environment (for wall reflections) */
  generatePMREM?: () => boolean
  /** Callback to get external CubeTexture UUID for classic skybox mode */
  getExternalCubeTextureUuid?: () => string | null
  /** Optional resource ID to write the cubemap to */
  outputResource?: string
}

/**
 * Cube face orientations.
 * +X, -X, +Y, -Y, +Z, -Z
 */
const CUBE_FACE_DIRECTIONS = [
  { target: [1, 0, 0], up: [0, -1, 0] }, // +X (right)
  { target: [-1, 0, 0], up: [0, -1, 0] }, // -X (left)
  { target: [0, 1, 0], up: [0, 0, 1] }, // +Y (top)
  { target: [0, -1, 0], up: [0, 0, -1] }, // -Y (bottom)
  { target: [0, 0, 1], up: [0, -1, 0] }, // +Z (front)
  { target: [0, 0, -1], up: [0, -1, 0] }, // -Z (back)
] as const

/**
 * Cubemap resource with texture and face views.
 */
interface CubemapResource {
  texture: GPUTexture
  cubeView: GPUTextureView
  faceViews: GPUTextureView[]
  sampler: GPUSampler
}

// =============================================================================
// WGSL Shaders
// =============================================================================

/**
 * Procedural skybox shader for when no texture is available.
 * Renders a simple gradient skybox to each cube face.
 */
const PROCEDURAL_SKYBOX_SHADER = /* wgsl */ `
struct Uniforms {
  viewMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  time: f32,
  _pad: vec3f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) direction: vec3f,
}

@vertex
fn vertexMain(
  @location(0) position: vec2f,
  @location(1) uv: vec2f
) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4f(position, 0.0, 1.0);

  // Convert screen position to world direction
  let clipPos = vec4f(position.x, position.y, 1.0, 1.0);
  let viewPos = uniforms.projectionMatrix * clipPos;
  let worldDir = uniforms.viewMatrix * vec4f(viewPos.xyz, 0.0);
  output.direction = normalize(worldDir.xyz);

  return output;
}

// Simple gradient skybox
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let dir = normalize(input.direction);

  // Sky gradient based on Y direction
  let t = dir.y * 0.5 + 0.5;
  let horizonColor = vec3f(0.05, 0.05, 0.1);
  let zenithColor = vec3f(0.0, 0.0, 0.02);
  let nadirColor = vec3f(0.02, 0.02, 0.03);

  var color: vec3f;
  if (t > 0.5) {
    color = mix(horizonColor, zenithColor, (t - 0.5) * 2.0);
  } else {
    color = mix(nadirColor, horizonColor, t * 2.0);
  }

  return vec4f(color, 1.0);
}
`

// =============================================================================
// CubemapCapturePass
// =============================================================================

/**
 * WebGPU Cubemap Capture Pass.
 *
 * Renders a skybox to a cubemap render target with 6 faces.
 * Maintains temporal history for frame-consistent environment mapping.
 */
export class CubemapCapturePass extends WebGPUBasePass {
  private passConfig: CubemapCapturePassConfig

  // Pipeline resources
  private proceduralPipeline: GPURenderPipeline | null = null
  private proceduralBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffer
  private uniformBuffer: GPUBuffer | null = null

  // Cubemap resources (temporal history - 2 frames)
  private cubemapHistory: CubemapResource[] = []
  private writeIndex = 0
  private framesSinceReset = 0

  // Configuration
  private backgroundResolution: number

  // Capture state
  private needsCapture = true
  private didCaptureThisFrame = false

  // Capture throttling
  private captureFrameCounter = 0
  private static readonly CAPTURE_UPDATE_INTERVAL = 3

  // External texture tracking
  private lastExternalTextureUuid: string | null = null
  private lastSkyboxMode: string | null = null

  constructor(config: CubemapCapturePassConfig = {}) {
    super({
      id: 'cubemap-capture',
      priority: 50, // Early in the pipeline
      inputs: [],
      outputs: config.outputResource
        ? [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }]
        : [],
    })

    this.passConfig = config
    this.backgroundResolution = config.backgroundResolution ?? 256
  }

  /**
   * Create the rendering pipelines.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Create procedural skybox bind group layout (uniform buffer only)
    this.proceduralBindGroupLayout = device.createBindGroupLayout({
      label: 'cubemap-capture-procedural-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
      ],
    })

    // Create shader module for procedural skybox
    const proceduralModule = this.createShaderModule(
      device,
      PROCEDURAL_SKYBOX_SHADER,
      'cubemap-capture-procedural'
    )

    // Create procedural pipeline
    this.proceduralPipeline = this.createCubemapPipeline(
      device,
      proceduralModule,
      [this.proceduralBindGroupLayout],
      format,
      'cubemap-capture-procedural'
    )

    // Create uniform buffer (2 mat4x4 + vec4)
    // 64 bytes per matrix * 2 + 16 bytes vec4 = 144 bytes, align to 256
    this.uniformBuffer = this.createUniformBuffer(device, 256, 'cubemap-capture-uniforms')

    // Initialize cubemap temporal history (2 frames)
    this.initializeCubemapHistory(device)
  }

  /**
   * Create a render pipeline for cubemap face rendering.
   * @param device
   * @param shaderModule
   * @param bindGroupLayouts
   * @param format
   * @param label
   */
  private createCubemapPipeline(
    device: GPUDevice,
    shaderModule: GPUShaderModule,
    bindGroupLayouts: GPUBindGroupLayout[],
    format: GPUTextureFormat,
    label: string
  ): GPURenderPipeline {
    const pipelineLayout = device.createPipelineLayout({
      label: `${label}-layout`,
      bindGroupLayouts,
    })

    return device.createRenderPipeline({
      label: `${label}-pipeline`,
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
        buffers: [this.getFullscreenVertexLayout()],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [
          {
            format,
            writeMask: GPUColorWrite.ALL,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    })
  }

  /**
   * Initialize temporal cubemap history (2-frame buffer).
   * @param device
   */
  private initializeCubemapHistory(device: GPUDevice): void {
    for (let i = 0; i < 2; i++) {
      const cubemap = this.createCubemapResource(device)
      this.cubemapHistory.push(cubemap)
    }
  }

  /**
   * Create a cubemap resource with all face views.
   * @param device
   */
  private createCubemapResource(device: GPUDevice): CubemapResource {
    const resolution = this.backgroundResolution

    // Create cubemap texture
    const texture = device.createTexture({
      label: 'cubemap-capture-texture',
      size: {
        width: resolution,
        height: resolution,
        depthOrArrayLayers: 6,
      },
      format: 'rgba16float',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST,
      dimension: '2d',
    })

    // Create cube view for sampling
    const cubeView = texture.createView({
      label: 'cubemap-capture-cube-view',
      dimension: 'cube',
    })

    // Create individual face views for rendering
    const faceViews: GPUTextureView[] = []
    for (let face = 0; face < 6; face++) {
      faceViews.push(
        texture.createView({
          label: `cubemap-capture-face-${face}`,
          dimension: '2d',
          baseArrayLayer: face,
          arrayLayerCount: 1,
        })
      )
    }

    // Create sampler
    const sampler = device.createSampler({
      label: 'cubemap-capture-cube-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    })

    return { texture, cubeView, faceViews, sampler }
  }

  /**
   * Request a new capture on next frame.
   */
  requestCapture(): void {
    this.needsCapture = true
    this.invalidateHistory()
  }

  /**
   * Invalidate temporal history (e.g., when skybox changes).
   */
  private invalidateHistory(): void {
    this.framesSinceReset = 0
  }

  /**
   * Set the background capture resolution.
   * @param resolution
   */
  setBackgroundResolution(resolution: number): void {
    if (resolution !== this.backgroundResolution) {
      this.backgroundResolution = resolution
      this.recreateCubemaps()
      this.requestCapture()
    }
  }

  /**
   * Recreate cubemap resources after resolution change.
   */
  private recreateCubemaps(): void {
    if (!this.device) return

    // Dispose old cubemaps
    for (const cubemap of this.cubemapHistory) {
      cubemap.texture.destroy()
    }
    this.cubemapHistory = []

    // Create new cubemaps
    this.initializeCubemapHistory(this.device)
  }

  /**
   * Get the captured cubemap texture view (for external use).
   */
  getCubemapView(): GPUTextureView | null {
    if (this.hasValidHistory(1)) {
      return this.getReadCubemap()?.cubeView ?? null
    }
    return null
  }

  /**
   * Get the captured cubemap texture (for external use).
   */
  getCubemapTexture(): GPUTexture | null {
    if (this.hasValidHistory(1)) {
      return this.getReadCubemap()?.texture ?? null
    }
    return null
  }

  /**
   * Check if history at the given offset is valid.
   * @param frameOffset
   */
  private hasValidHistory(frameOffset: number): boolean {
    return this.framesSinceReset > frameOffset
  }

  /**
   * Get the write cubemap (current frame).
   */
  private getWriteCubemap(): CubemapResource {
    return this.cubemapHistory[this.writeIndex]!
  }

  /**
   * Get the read cubemap (previous frame).
   */
  private getReadCubemap(): CubemapResource {
    const readIndex = (this.writeIndex + 1) % 2
    return this.cubemapHistory[readIndex]!
  }

  /**
   * Compute the view matrix for a cube face.
   * @param faceIndex
   */
  private computeFaceViewMatrix(faceIndex: number): Float32Array {
    const face = CUBE_FACE_DIRECTIONS[faceIndex]
    if (!face) {
      throw new Error(`Invalid cube face index: ${faceIndex}`)
    }
    const target = face.target
    const up = face.up

    // Create look-at matrix
    // Position at origin, looking at target direction
    const zAxis: [number, number, number] = [-target[0], -target[1], -target[2]]
    const xAxis = this.cross(up, zAxis)
    this.normalize(xAxis)
    const yAxis = this.cross(zAxis, xAxis)

    // Column-major mat4x4 (for WebGPU/WGSL)
    return new Float32Array([
      xAxis[0]!, yAxis[0]!, zAxis[0]!, 0,
      xAxis[1]!, yAxis[1]!, zAxis[1]!, 0,
      xAxis[2]!, yAxis[2]!, zAxis[2]!, 0,
      0, 0, 0, 1,
    ])
  }

  /**
   * Compute the projection matrix (90 degree FOV, square aspect).
   */
  private computeProjectionMatrix(): Float32Array {
    const fov = Math.PI / 2 // 90 degrees
    const near = 0.1
    const far = 1000
    const f = 1 / Math.tan(fov / 2)
    const nf = 1 / (near - far)

    // Column-major perspective matrix
    return new Float32Array([
      f, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ])
  }

  private cross(a: readonly number[], b: readonly number[]): [number, number, number] {
    const a0 = a[0] ?? 0
    const a1 = a[1] ?? 0
    const a2 = a[2] ?? 0
    const b0 = b[0] ?? 0
    const b1 = b[1] ?? 0
    const b2 = b[2] ?? 0
    return [
      a1 * b2 - a2 * b1,
      a2 * b0 - a0 * b2,
      a0 * b1 - a1 * b0,
    ]
  }

  private normalize(v: [number, number, number]): void {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    if (len > 0) {
      v[0] /= len
      v[1] /= len
      v[2] /= len
    }
  }

  /**
   * Execute the cubemap capture pass.
   * @param ctx
   */
  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.proceduralPipeline ||
      !this.uniformBuffer
    ) {
      return
    }

    // Reset frame state
    this.didCaptureThisFrame = false

    // Get environment state for smart capture throttling
    const env = ctx.frame?.stores?.environment as {
      skyboxMode?: string
      skyboxAnimationMode?: string
      skyboxAnimationSpeed?: number
      skyboxTimeScale?: number
    } | undefined

    const currentSkyboxMode = env?.skyboxMode ?? null

    // Check for skybox mode changes
    if (currentSkyboxMode !== this.lastSkyboxMode) {
      this.lastSkyboxMode = currentSkyboxMode
      this.requestCapture()
    }

    // Check for external texture changes
    const externalUuid = this.passConfig.getExternalCubeTextureUuid?.() ?? null
    if (externalUuid !== this.lastExternalTextureUuid) {
      this.lastExternalTextureUuid = externalUuid
      this.requestCapture()
    }

    // Capture throttling
    this.captureFrameCounter++
    const shouldCapture =
      this.needsCapture &&
      (this.framesSinceReset === 0 ||
        this.captureFrameCounter >= CubemapCapturePass.CAPTURE_UPDATE_INTERVAL)

    if (shouldCapture) {
      this.captureFrameCounter = 0
      this.executeCapture(ctx)
    }

    // Check if skybox is animating for continuous capture
    const isPlaying = (ctx.frame?.stores?.animation as { isPlaying?: boolean })?.isPlaying ?? false
    const isAnimating = this.isSkyboxAnimating(env, isPlaying)
    if (isAnimating) {
      this.needsCapture = true
    }
  }

  /**
   * Determine if the skybox is currently animating.
   * @param env
   * @param isPlaying
   */
  private isSkyboxAnimating(
    env: {
      skyboxMode?: string
      skyboxAnimationMode?: string
      skyboxAnimationSpeed?: number
      skyboxTimeScale?: number
    } | undefined,
    isPlaying: boolean
  ): boolean {
    if (!env) return true
    if (!isPlaying) return false

    const isClassic = env.skyboxMode === 'classic'

    if (isClassic) {
      const hasAnimationMode = env.skyboxAnimationMode !== 'none'
      const hasAnimationSpeed = (env.skyboxAnimationSpeed ?? 0) > 0
      return hasAnimationMode && hasAnimationSpeed
    } else {
      const hasTimeScale = (env.skyboxTimeScale ?? 0) > 0
      const hasRotation = (env.skyboxAnimationSpeed ?? 0) > 0 && env.skyboxAnimationMode !== 'none'
      return hasTimeScale || hasRotation
    }
  }

  /**
   * Execute the actual cubemap capture.
   * @param ctx
   */
  private executeCapture(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.proceduralPipeline ||
      !this.uniformBuffer ||
      !this.proceduralBindGroupLayout
    ) {
      return
    }

    const writeCubemap = this.getWriteCubemap()
    const projectionMatrix = this.computeProjectionMatrix()

    // Get time for procedural skybox animation
    const time = ctx.frame?.time ?? 0

    // Render to each cube face
    for (let face = 0; face < 6; face++) {
      const viewMatrix = this.computeFaceViewMatrix(face)
      const faceView = writeCubemap.faceViews[face]
      if (!faceView) continue

      // Update uniform buffer
      const uniformData = new Float32Array(36) // 2 mat4x4 + 1 vec4
      uniformData.set(viewMatrix, 0) // viewMatrix at offset 0
      uniformData.set(projectionMatrix, 16) // projectionMatrix at offset 16
      uniformData[32] = time // time
      // uniformData[33-35] = padding

      this.writeUniformBuffer(this.device, this.uniformBuffer, uniformData)

      // Create bind group for this face
      const bindGroup = this.device.createBindGroup({
        label: `cubemap-capture-bg-face-${face}`,
        layout: this.proceduralBindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
      })

      // Begin render pass for this face
      const passEncoder = ctx.beginRenderPass({
        label: `cubemap-capture-face-${face}`,
        colorAttachments: [
          {
            view: faceView,
            loadOp: 'clear' as const,
            storeOp: 'store' as const,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      })

      // Render using procedural pipeline (until texture-based capture is implemented)
      passEncoder.setPipeline(this.proceduralPipeline)
      passEncoder.setBindGroup(0, bindGroup)
      passEncoder.setVertexBuffer(0, this.getFullscreenVertexBuffer(this.device))
      passEncoder.draw(3, 1, 0, 0)

      passEncoder.end()
    }

    // Mark capture as completed
    this.didCaptureThisFrame = true
    this.needsCapture = false
  }

  /**
   * Check if the cubemap has valid history.
   */
  hasValidCubemap(): boolean {
    return this.hasValidHistory(1)
  }

  /**
   * Get frames since last reset.
   */
  getFramesSinceReset(): number {
    return this.framesSinceReset
  }

  /**
   * Post-frame hook to advance temporal history.
   */
  postFrame(): void {
    if (this.didCaptureThisFrame) {
      // Swap buffers
      this.writeIndex = (this.writeIndex + 1) % 2
      this.framesSinceReset++
    }
  }

  /**
   * Release internal resources when disabled.
   */
  releaseInternalResources(): void {
    for (const cubemap of this.cubemapHistory) {
      cubemap.texture.destroy()
    }
    this.cubemapHistory = []

    this.needsCapture = true
    this.framesSinceReset = 0
    this.lastExternalTextureUuid = null
    this.lastSkyboxMode = null
    this.captureFrameCounter = 0
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    for (const cubemap of this.cubemapHistory) {
      cubemap.texture.destroy()
    }
    this.cubemapHistory = []

    this.proceduralPipeline = null
    this.proceduralBindGroupLayout = null
    this.uniformBuffer?.destroy()
    this.uniformBuffer = null

    super.dispose()
  }
}
